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
    let mut cmd = Command::new(cli::resolve(CMD));
    cmd.arg("-p")
        .arg("--output-format").arg("stream-json")
        .arg("--verbose")  // REQUIRED for stream-json to actually emit
        .arg("--include-partial-messages")  // emits content_block_delta token deltas
        .arg("--append-system-prompt").arg(&req.preamble);
    if let Some(model) = &req.model {
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
    cmd.current_dir(&req.work_dir);

    let has_images = !req.images.is_empty();
    if has_images {
        // Switch to stream-json input over stdin so we can attach base64
        // image blocks alongside the text. Without this, `-p` mode only
        // accepts a plain string prompt.
        cmd.arg("--input-format").arg("stream-json");
        cmd.stdin(Stdio::piped());
    } else {
        // No images: keep the simple positional prompt path (smaller
        // surface area, matches legacy spawn shape).
        cmd.arg(&req.prompt);
        cmd.stdin(Stdio::null());
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    cli::hide_console(&mut cmd);

    eprintln!(
        "[ai claude spawn] cwd={} images={} args={:?}",
        req.work_dir,
        req.images.len(),
        cmd.as_std().get_args().collect::<Vec<_>>(),
    );

    let mut child = cmd.spawn().map_err(|e| {
        eprintln!("[ai claude spawn] ERROR: {}", e);
        e.to_string()
    })?;

    if has_images {
        let payload = build_user_message_with_images(req).await?;
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
    }
    Ok(child)
}

/// Build the stream-json user message envelope claude expects when
/// `--input-format stream-json` is active: a top-level `{type:"user",
/// message:{role:"user", content:[image..., text]}}`. Each attached image
/// is read from disk, mime-detected by extension, and inlined as a
/// `base64` image block.
async fn build_user_message_with_images(req: &AiSendRequest) -> Result<String, String> {
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
    content.push(serde_json::json!({ "type": "text", "text": req.prompt }));
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

#[cfg(test)]
mod tests {
    use super::*;

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
