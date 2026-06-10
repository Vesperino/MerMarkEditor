//! Codex spawn + flag construction.
//! Verified against `codex exec --help` and `codex exec resume --help`.
//!
//! FLAG DEVIATIONS FROM PLAN (Task B2 Step 1):
//!
//! 1. `--json` flag EXISTS on `codex exec` — confirmed. Plan was correct.
//!
//! 2. `--cd` flag: plan expected `--cd <workdir>`. Actual flag is `-C`/`--cd`.
//!    Long form `--cd` works; no change needed.
//!
//! 3. Bypass flag: plan expected `--full-auto`. Actual flag is
//!    `--dangerously-bypass-approvals-and-sandbox`. Updated below.
//!
//! 4. Resume: plan expected `codex exec --resume <id>`. Actual is
//!    `codex exec resume <session_id> [PROMPT]` (a subcommand of exec).
//!    Updated below to use the subcommand form.
//!
//! 5. CONCERN: `codex exec resume` does NOT support `--sandbox` or `--cd`.
//!    When resuming, sandbox mode and working dir cannot be overridden via CLI
//!    flags. Codex uses the persisted session config for resumed sessions.
//!    This is acceptable behaviour but should be documented for B2 follow-up.

use std::process::Stdio;
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command};
use crate::ai::process::AiSendRequest;
use crate::ai::types::AccessMapTools;
use crate::ai::cli;

const CMD: &str = "codex";

/// Spawn `codex exec` (or `codex exec resume`) and feed the prompt over stdin.
///
/// We pass `-` as the positional PROMPT and pipe stdin because (a) prompts
/// contain newlines, and on Windows Rust 1.77+ rejects newline-bearing args
/// passed to a `.cmd`/`.bat` shim (CVE-2024-24576 patch — "batch file
/// arguments are invalid"); (b) stdin is the documented escape hatch for
/// codex when "instructions are read from stdin".
pub async fn spawn(req: &AiSendRequest) -> Result<Child, String> {
    let mut cmd = Command::new(cli::resolve_with_override(CMD, req.cli_path.as_deref()));

    // codex `exec resume` does not surface `-i <FILE>`. If the user attached
    // images to this turn, we MUST take the new-session path so the images
    // actually reach the model. The conversation context is lost (codex
    // limitation), but a silent drop is worse — the user explicitly asked
    // the model to look at the image.
    let force_new_session = !req.images.is_empty();
    let resume_sid = if force_new_session { None } else { req.session_id.as_ref() };

    if let Some(sid) = resume_sid {
        // Resume: `codex exec resume --skip-git-repo-check <session_id> -`
        // --sandbox and --cd are NOT supported on the resume subcommand —
        // codex reuses the persisted session configuration.
        cmd.arg("exec")
            .arg("--json")
            .arg("--skip-git-repo-check")
            .arg("resume")
            .arg(sid);
        if req.bypass {
            cmd.arg("--dangerously-bypass-approvals-and-sandbox");
        }
        cmd.arg("-");
    } else {
        // New session: `codex exec --json --skip-git-repo-check --cd <workdir> [--model] [-c effort] --sandbox <mode> [--dangerously-...] -- -`
        // --skip-git-repo-check: MerMark users typically edit notes outside git
        // repos (Downloads, Documents, etc.); without it codex aborts with
        // "Not inside a trusted directory".
        cmd.arg("exec")
            .arg("--json")
            .arg("--skip-git-repo-check");
        // `--cd` requires a non-empty value; codex bails out when called as
        // `--cd "" ...`. One-shot callers (e.g. the Mermaid AI assist) leave
        // workDir blank because they don't bind to a particular file — fall
        // back to the user's home directory in that case so the flag still
        // has a real path to point at, and skip --add-dir entirely.
        let workdir_for_codex = if req.work_dir.is_empty() {
            std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .unwrap_or_else(|_| ".".to_string())
        } else {
            req.work_dir.clone()
        };
        cmd.arg("--cd").arg(&workdir_for_codex);
        if !req.work_dir.is_empty() {
            // Only mark explicit work dirs as writable; skipping --add-dir for
            // the home-fallback case keeps the sandbox tighter.
            cmd.arg("--add-dir").arg(&req.work_dir);
        }
        if let Some(model) = &req.model {
            cmd.arg("--model").arg(model);
        }
        if let Some(effort) = &req.effort {
            cmd.arg("-c").arg(format!("model_reasoning_effort={}", effort));
        }
        cmd.arg("--sandbox").arg(sandbox_mode(&req.access_map.tools, req.bypass));
        if req.bypass {
            cmd.arg("--dangerously-bypass-approvals-and-sandbox");
        }
        // Attach images: codex `exec` accepts repeated `-i <FILE>` flags. Only
        // applied to the new-session path because the resume subcommand does
        // not surface `-i`.
        for img in &req.images {
            cmd.arg("-i").arg(img);
        }
        cmd.arg("--").arg("-");
    }

    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cli::hide_console(&mut cmd);
    eprintln!("[ai codex spawn] args={:?}", cmd.as_std().get_args().collect::<Vec<_>>());

    let mut child = cmd.spawn().map_err(|e| {
        eprintln!("[ai codex spawn] ERROR: {}", e);
        e.to_string()
    })?;

    let payload = crate::ai::process::join_message_parts(&[
        req.preamble.as_str(),
        req.turn_context.as_str(),
        req.prompt.as_str(),
    ]);
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(payload.as_bytes())
            .await
            .map_err(|e| format!("codex stdin write failed: {}", e))?;
        let _ = stdin.shutdown().await;
    }
    Ok(child)
}

/// Resolve the context window for a model slug from codex's own
/// `models_cache.json` (under $CODEX_HOME, falling back to ~/.codex).
/// codex `exec --json` never reports a window, so this is the only source.
/// Any failure (missing file, malformed JSON, unknown slug) yields None.
pub async fn resolve_context_window(model: Option<&str>) -> Option<u64> {
    let slug = model.map(str::trim).filter(|s| !s.is_empty())?;
    let path = models_cache_path()?;
    let raw = tokio::fs::read_to_string(path).await.ok()?;
    let window = context_window_from_cache(&raw, slug);
    if window.is_none() {
        eprintln!("[ai codex] no context_window for slug {:?} in models_cache.json — falling back to default", slug);
    }
    window
}

#[derive(Debug, serde::Serialize)]
pub struct CodexModelOption {
    pub id: String,
    pub label: String,
}

/// List models from codex's own `models_cache.json` (same file used for
/// context-window resolution). Missing/malformed cache yields an empty list;
/// the frontend falls back to its curated list.
pub async fn list_models() -> Vec<CodexModelOption> {
    let Some(path) = models_cache_path() else { return Vec::new() };
    let Ok(raw) = tokio::fs::read_to_string(path).await else { return Vec::new() };
    models_from_cache(&raw)
}

fn models_from_cache(raw: &str) -> Vec<CodexModelOption> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) else { return Vec::new() };
    let Some(models) = v.get("models").and_then(|m| m.as_array()) else { return Vec::new() };
    models
        .iter()
        .filter_map(|m| {
            let slug = m.get("slug").and_then(|s| s.as_str())?;
            // codex-auto-review is codex's internal review model, not user-pickable.
            if slug == "codex-auto-review" {
                return None;
            }
            let label = m.get("display_name").and_then(|d| d.as_str()).unwrap_or(slug);
            Some(CodexModelOption { id: slug.to_string(), label: label.to_string() })
        })
        .collect()
}

fn models_cache_path() -> Option<std::path::PathBuf> {
    let home = std::env::var("CODEX_HOME")
        .ok()
        .filter(|s| !s.is_empty())
        .map(std::path::PathBuf::from)
        .or_else(|| {
            pick_home_dir(
                cfg!(windows),
                std::env::var("USERPROFILE").ok(),
                std::env::var("HOME").ok(),
            )
            .map(|h| std::path::PathBuf::from(h).join(".codex"))
        })?;
    Some(home.join("models_cache.json"))
}

/// On Windows HOME may be set by git-bash/msys to a different dir than codex
/// (which follows USERPROFILE semantics) actually uses — so USERPROFILE wins
/// there, HOME wins on Unix.
fn pick_home_dir(is_windows: bool, userprofile: Option<String>, home: Option<String>) -> Option<String> {
    if is_windows { userprofile.or(home) } else { home.or(userprofile) }
}

fn context_window_from_cache(raw: &str, slug: &str) -> Option<u64> {
    let v: serde_json::Value = serde_json::from_str(raw).ok()?;
    v.get("models")?
        .as_array()?
        .iter()
        .find(|m| m.get("slug").and_then(|s| s.as_str()) == Some(slug))?
        .get("context_window")?
        .as_u64()
}

fn sandbox_mode(tools: &AccessMapTools, bypass: bool) -> &'static str {
    if bypass && tools.bash { "danger-full-access" }
    else if tools.file_write { "workspace-write" }
    else if tools.file_read { "read-only" }
    else { "read-only" }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sandbox_mode_defaults_to_workspace_write() {
        // Default now enables file_write so AI can edit the active doc directly.
        let t = AccessMapTools::default();
        assert_eq!(sandbox_mode(&t, false), "workspace-write");
    }

    #[test]
    fn sandbox_mode_all_off_is_read_only() {
        // Explicitly disable all tools to test read-only sandbox.
        let t = AccessMapTools { bash: false, network: false, file_read: false, file_write: false };
        assert_eq!(sandbox_mode(&t, false), "read-only");
    }

    #[test]
    fn sandbox_mode_with_file_write_is_workspace_write() {
        let t = AccessMapTools { file_write: true, bash: false, network: false, file_read: false };
        assert_eq!(sandbox_mode(&t, false), "workspace-write");
    }

    #[test]
    fn sandbox_mode_bypass_with_bash_is_danger_full_access() {
        let t = AccessMapTools { bash: true, ..AccessMapTools::default() };
        assert_eq!(sandbox_mode(&t, true), "danger-full-access");
    }

    const CACHE_FIXTURE: &str = r#"{"models":[
        {"slug":"gpt-5.4-mini","context_window":150000,"max_context_window":150000},
        {"slug":"gpt-5.4","context_window":272000,"max_context_window":1000000}
    ]}"#;

    #[test]
    fn context_window_from_cache_resolves_exact_slug() {
        assert_eq!(context_window_from_cache(CACHE_FIXTURE, "gpt-5.4"), Some(272000));
        assert_eq!(context_window_from_cache(CACHE_FIXTURE, "gpt-5.4-mini"), Some(150000));
    }

    #[test]
    fn context_window_from_cache_tolerates_unknown_slug_and_bad_json() {
        assert_eq!(context_window_from_cache(CACHE_FIXTURE, "gpt-9"), None);
        assert_eq!(context_window_from_cache("not json", "gpt-5.4"), None);
        assert_eq!(context_window_from_cache(r#"{"models":{}}"#, "gpt-5.4"), None);
        assert_eq!(context_window_from_cache(r#"{"models":[{"slug":"gpt-5.4"}]}"#, "gpt-5.4"), None);
    }

    const MODELS_FIXTURE: &str = r#"{"models":[
        {"slug":"gpt-5.5","display_name":"GPT-5.5","context_window":272000},
        {"slug":"codex-auto-review","display_name":"Codex Auto Review"},
        {"slug":"gpt-5.3-codex","context_window":272000}
    ]}"#;

    #[test]
    fn models_from_cache_maps_display_name_and_filters_auto_review() {
        let models = models_from_cache(MODELS_FIXTURE);
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "gpt-5.5");
        assert_eq!(models[0].label, "GPT-5.5");
        assert_eq!(models[1].id, "gpt-5.3-codex");
        assert_eq!(models[1].label, "gpt-5.3-codex");
    }

    #[test]
    fn models_from_cache_tolerates_bad_json() {
        assert!(models_from_cache("not json").is_empty());
        assert!(models_from_cache(r#"{"models":{}}"#).is_empty());
        assert!(models_from_cache(r#"{"models":[{"display_name":"no slug"}]}"#).is_empty());
    }

    #[test]
    fn pick_home_dir_prefers_userprofile_on_windows() {
        let up = Some(r"C:\Users\real".to_string());
        let home = Some("/c/Users/msys".to_string());
        assert_eq!(pick_home_dir(true, up.clone(), home.clone()), up);
        assert_eq!(pick_home_dir(true, None, home.clone()), home);
    }

    #[test]
    fn pick_home_dir_prefers_home_on_unix() {
        let up = Some(r"C:\Users\real".to_string());
        let home = Some("/home/user".to_string());
        assert_eq!(pick_home_dir(false, up.clone(), home.clone()), home);
        assert_eq!(pick_home_dir(false, up.clone(), None), up);
        assert_eq!(pick_home_dir(false, None, None), None);
    }
}
