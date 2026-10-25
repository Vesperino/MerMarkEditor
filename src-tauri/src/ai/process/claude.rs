//! Claude spawn + flag construction.
//! Verified against `claude --help` (claude v2.x / Claude Code CLI).
//!
//! FLAG VERIFICATION NOTES (Task B2 Step 1):
//!   -p / --print          : confirmed (non-interactive headless mode)
//!   --output-format       : confirmed, choices: text | json | stream-json
//!   --append-system-prompt: confirmed
//!   --allowedTools        : confirmed (also accepts --allowed-tools)
//!   --permission-mode     : confirmed, choices include bypassPermissions | default
//!   -r / --resume         : confirmed (flag, not positional subcommand)
//!
//! No deviations from the plan.

use std::process::Stdio;
use base64::Engine;
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command};
use crate::ai::process::AiSendRequest;
use crate::ai::types::AccessMapTools;
use crate::ai::cli;

const CMD: &str = "claude";

pub async fn spawn(req: &AiSendRequest) -> Result<Child, String> {
    let mut cmd = Command::new(cli::resolve_with_override(CMD, req.cli_path.as_deref()));
    // Always use stream-json input over stdin. Two reasons:
    //   1. Windows: `claude` resolves to `claude.cmd` (npm shim). Rust 1.77+
    //      stdlib applies CVE-2024-24576 sanitization to `.cmd`/`.bat`
    //      invocations and rejects args containing `\n`, `\r`, etc. with
    //      "batch file arguments are invalid". The preamble is multi-line
    //      so passing it via `--append-system-prompt <preamble>` always
    //      fails on Windows.
    //   2. Image attachments need the stream-json content-block envelope.
    // Folding preamble into the user-message text (as a leading paragraph)
    // mirrors how the codex spawn ships its preamble + prompt over stdin.
    cmd.arg("-p")
        .arg("--output-format").arg("stream-json")
        .arg("--verbose")  // REQUIRED for stream-json to actually emit
        .arg("--include-partial-messages")  // emits content_block_delta token deltas
        .arg("--input-format").arg("stream-json");
    if let Some(model) = req.model.as_deref().filter(|m| !m.is_empty()) {
        cmd.arg("--model").arg(model);
    }
    if let Some(effort) = &req.effort {
        cmd.arg("--effort").arg(effort);
    }
    if let Some(sid) = &req.session_id {
        cmd.arg("--resume").arg(sid);
    }
    let allowed = allowed_tools(&req.access_map.tools);
    if !allowed.is_empty() {
        cmd.arg("--allowedTools").arg(allowed);
    }
    cmd.arg("--permission-mode").arg(if req.bypass { "bypassPermissions" } else { "default" });
    let workdir_for_claude = if req.work_dir.is_empty() {
        std::env::var("HOME")
            .or_else(|_| std::env::var("USERPROFILE"))
            .unwrap_or_else(|_| ".".to_string())
    } else {
        req.work_dir.clone()
    };
    cmd.current_dir(&workdir_for_claude);
    cmd.stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cli::hide_console(&mut cmd);

    eprintln!(
        "[ai claude spawn] cwd={} images={} args={:?}",
        workdir_for_claude,
        req.images.len(),
        cmd.as_std().get_args().collect::<Vec<_>>(),
    );

    let mut child = cmd.spawn().map_err(|e| {
        eprintln!("[ai claude spawn] ERROR: {}", e);
        e.to_string()
    })?;

    let payload = build_user_message_envelope(req).await?;
    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(payload.as_bytes())
            .await
            .map_err(|e| format!("claude stdin write failed: {}", e))?;
        stdin
            .write_all(b"\n")
            .await
            .map_err(|e| format!("claude stdin newline failed: {}", e))?;
        let _ = stdin.shutdown().await;
    }
    Ok(child)
}

/// Build the stream-json user message envelope claude expects when
/// `--input-format stream-json` is active: a top-level `{type:"user",
/// message:{role:"user", content:[image..., text]}}`. The preamble is
/// folded into the leading text block (separated by a blank line) so we
/// don't have to pass it via `--append-system-prompt` — that flag's value
/// always contains newlines and breaks Rust's `.cmd`/`.bat` arg sanitizer
/// on Windows. Each attached image is read from disk, mime-detected by
/// extension, and inlined as a `base64` image block.
async fn build_user_message_envelope(req: &AiSendRequest) -> Result<String, String> {
    let mut content: Vec<serde_json::Value> = Vec::with_capacity(req.images.len() + 1);
    for path in &req.images {
        let bytes = tokio::fs::read(path)
            .await
            .map_err(|e| format!("read image {}: {}", path, e))?;
        let media_type = guess_image_mime(path);
        let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
        content.push(serde_json::json!({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": media_type,
                "data": b64,
            }
        }));
    }
    let text = crate::ai::process::join_message_parts(&[
        req.preamble.as_str(),
        req.turn_context.as_str(),
        req.prompt.as_str(),
    ]);
    content.push(serde_json::json!({ "type": "text", "text": text }));
    let envelope = serde_json::json!({
        "type": "user",
        "message": { "role": "user", "content": content },
    });
    serde_json::to_string(&envelope).map_err(|e| e.to_string())
}

fn guess_image_mime(path: &str) -> &'static str {
    let lower = path.to_ascii_lowercase();
    if lower.ends_with(".jpg") || lower.ends_with(".jpeg") { "image/jpeg" }
    else if lower.ends_with(".gif") { "image/gif" }
    else if lower.ends_with(".webp") { "image/webp" }
    else if lower.ends_with(".bmp") { "image/bmp" }
    else { "image/png" }
}

fn allowed_tools(tools: &AccessMapTools) -> String {
    let mut allowed: Vec<&str> = Vec::new();
    if tools.bash { allowed.push("Bash"); }
    if tools.file_read { allowed.push("Read"); allowed.push("Glob"); allowed.push("Grep"); }
    if tools.file_write { allowed.push("Write"); allowed.push("Edit"); }
    if tools.network { allowed.push("WebFetch"); allowed.push("WebSearch"); }
    allowed.join(",")
}

#[derive(Debug, serde::Serialize)]
pub struct ClaudeModelOption {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
    pub disabled: bool,
}

/// Claude Code has no headless model listing. Its `/model` picker shows the
/// tier aliases plus the options the server last sent, which it keeps in
/// `.claude.json`; read those so new models appear without a MerMark update.
pub async fn list_models() -> Vec<ClaudeModelOption> {
    let Some(path) = config_path() else { return Vec::new() };
    let Ok(raw) = tokio::fs::read_to_string(path).await else { return Vec::new() };
    models_from_config(&raw)
}

fn models_from_config(raw: &str) -> Vec<ClaudeModelOption> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(raw) else { return Vec::new() };
    let Some(options) = v.get("additionalModelOptionsCache").and_then(|o| o.as_array()) else { return Vec::new() };
    options
        .iter()
        .filter_map(|o| {
            let id = o.get("value").and_then(|s| s.as_str())?;
            let label = o.get("label").and_then(|s| s.as_str()).unwrap_or(id);
            Some(ClaudeModelOption {
                id: id.to_string(),
                label: label.to_string(),
                description: o.get("description").and_then(|s| s.as_str()).map(str::to_string),
                disabled: o.get("disabled").and_then(|d| d.as_bool()).unwrap_or(false),
            })
        })
        .collect()
}

fn config_path() -> Option<std::path::PathBuf> {
    if let Some(dir) = std::env::var("CLAUDE_CONFIG_DIR").ok().filter(|s| !s.is_empty()) {
        return Some(std::path::PathBuf::from(dir).join(".claude.json"));
    }
    let home = crate::ai::process::codex::pick_home_dir(
        cfg!(windows),
        std::env::var("USERPROFILE").ok(),
        std::env::var("HOME").ok(),
    )?;
    Some(std::path::PathBuf::from(home).join(".claude.json"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn models_from_config_reads_the_model_picker_cache() {
        let models = models_from_config(r#"{"additionalModelOptionsCache":[
            {"value":"claude-fable-5-1[1m]","label":"Fable","description":"Fable 5.1 · Most capable"},
            {"value":"cc-update-required-1","label":"Opus 5.5 (disabled)","description":"Update to use Opus 5.5","disabled":true},
            {"label":"no value"}
        ]}"#);
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "claude-fable-5-1[1m]");
        assert_eq!(models[0].label, "Fable");
        assert_eq!(models[0].description.as_deref(), Some("Fable 5.1 · Most capable"));
        assert!(!models[0].disabled);
        assert!(models[1].disabled);
    }

    #[test]
    fn models_from_config_tolerates_missing_cache_and_bad_json() {
        assert!(models_from_config("not json").is_empty());
        assert!(models_from_config(r#"{"numStartups":3}"#).is_empty());
    }

    #[test]
    fn allowed_tools_for_all_off_is_empty() {
        // Explicitly disable all tools (default now enables file_read+file_write).
        let t = AccessMapTools { bash: false, network: false, file_read: false, file_write: false };
        assert_eq!(allowed_tools(&t), "");
    }

    #[test]
    fn allowed_tools_for_default_includes_read_write_tools() {
        // Default enables file_read + file_write for direct on-disk AI edits.
        let t = AccessMapTools::default();
        let s = allowed_tools(&t);
        assert!(s.contains("Read"));
        assert!(s.contains("Glob"));
        assert!(s.contains("Grep"));
        assert!(s.contains("Write"));
        assert!(s.contains("Edit"));
        assert!(!s.contains("Bash"));
    }

    #[test]
    fn allowed_tools_for_file_read_includes_read_glob_grep() {
        let t = AccessMapTools { file_read: true, bash: false, network: false, file_write: false };
        let s = allowed_tools(&t);
        assert!(s.contains("Read"));
        assert!(s.contains("Glob"));
        assert!(s.contains("Grep"));
    }

    #[test]
    fn allowed_tools_for_bash_only_returns_just_bash() {
        // Explicitly disable file_read + file_write to test bash-only case.
        let t = AccessMapTools { bash: true, network: false, file_read: false, file_write: false };
        assert_eq!(allowed_tools(&t), "Bash");
    }

    fn req_with(preamble: &str, turn_context: &str, prompt: &str) -> AiSendRequest {
        AiSendRequest {
            cli: crate::ai::types::CliKind::Claude,
            session_id: None,
            model: None,
            effort: None,
            prompt: prompt.into(),
            preamble: preamble.into(),
            turn_context: turn_context.into(),
            access_map: crate::ai::types::AccessMap::default_for_doc("/x.md"),
            bypass: false,
            work_dir: String::new(),
            images: vec![],
            cli_path: None,
            history: vec![],
            num_ctx: None,
            doc_content: None,
        }
    }

    fn envelope_text(envelope: &str) -> String {
        let v: serde_json::Value = serde_json::from_str(envelope).unwrap();
        v.pointer("/message/content/0/text").and_then(|t| t.as_str()).unwrap().to_string()
    }

    #[tokio::test]
    async fn envelope_joins_preamble_turn_context_prompt() {
        let payload = build_user_message_envelope(&req_with("PRE", "TURN", "PROMPT")).await.unwrap();
        assert_eq!(envelope_text(&payload), "PRE\n\nTURN\n\nPROMPT");
    }

    #[tokio::test]
    async fn envelope_skips_empty_preamble_keeps_turn_context() {
        let payload = build_user_message_envelope(&req_with("", "TURN", "PROMPT")).await.unwrap();
        assert_eq!(envelope_text(&payload), "TURN\n\nPROMPT");
    }

    #[tokio::test]
    async fn envelope_prompt_only_when_preamble_and_turn_context_empty() {
        let payload = build_user_message_envelope(&req_with("", "", "PROMPT")).await.unwrap();
        assert_eq!(envelope_text(&payload), "PROMPT");
    }

    #[test]
    fn guess_mime_handles_known_extensions() {
        assert_eq!(guess_image_mime("/tmp/foo.PNG"), "image/png");
        assert_eq!(guess_image_mime("/tmp/foo.jpg"), "image/jpeg");
        assert_eq!(guess_image_mime("/tmp/foo.JPEG"), "image/jpeg");
        assert_eq!(guess_image_mime("/tmp/foo.gif"), "image/gif");
        assert_eq!(guess_image_mime("/tmp/foo.webp"), "image/webp");
        assert_eq!(guess_image_mime("/tmp/foo.bmp"), "image/bmp");
        // Unknown extension defaults to png so we never emit an empty mime
        // (claude rejects the message otherwise).
        assert_eq!(guess_image_mime("/tmp/foo.unknown"), "image/png");
    }
}
