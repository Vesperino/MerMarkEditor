pub mod registry;
pub mod normalizer;
pub mod claude;
pub mod codex;

pub use registry::ChildRegistry;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;

use crate::ai::audit;
use crate::ai::types::{AccessMap, AiResponseChunk, AuditEntry, CliKind};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSendRequest {
    pub cli: CliKind,
    pub session_id: Option<String>,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub prompt: String,
    pub preamble: String,
    pub access_map: AccessMap,
    pub bypass: bool,
    pub work_dir: String,
}

pub async fn spawn(
    app: AppHandle,
    window_label: String,
    registry: tauri::State<'_, ChildRegistry>,
    req: AiSendRequest,
    request_id: String,
) -> Result<String, String> {
    eprintln!("[ai] spawn cli={:?} req_id={} session={:?} model={:?} effort={:?} bypass={} window={}",
        req.cli, request_id, req.session_id, req.model, req.effort, req.bypass, window_label);
    let child = match req.cli {
        CliKind::Claude => claude::spawn(&req)?,
        CliKind::Codex => codex::spawn(&req).await?,
    };
    eprintln!("[ai] child spawned for req_id={}", request_id);
    audit::append(&app, AuditEntry {
        ts: audit::now_iso(),
        session_id: req.session_id.clone(),
        cli: req.cli,
        action: "send".into(),
        args: serde_json::json!({ "request_id": request_id, "bypass": req.bypass, "cli_name": req.cli.as_str() }),
        result: serde_json::json!({}),
        exit_code: None,
    })?;
    spawn_pump(app, window_label, registry.inner(), request_id.clone(), req.cli, child);
    Ok(request_id)
}

fn spawn_pump(
    app: AppHandle,
    window_label: String,
    registry: &ChildRegistry,
    request_id: String,
    cli: CliKind,
    mut child: Child,
) {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    registry.insert(request_id.clone(), child);
    let event = format!("ai:stream:{}", request_id);
    let app_for_stdout = app.clone();
    let event_for_stdout = event.clone();
    let label_for_stdout = window_label.clone();
    let app_for_stderr = app;
    let event_for_stderr = event;
    let label_for_stderr = window_label;
    let req_id_for_stdout = request_id.clone();
    if let Some(out) = stdout {
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            // Both CLIs need cross-line state. Codex caches `thread_id` for the
            // final Done chunk; claude buffers `input_json_delta` slices into
            // the final tool-call arguments emitted on `content_block_stop`.
            let mut codex_state = normalizer::CodexParserState::default();
            let mut claude_state = normalizer::ClaudeParserState::default();
            let mut done_emitted = false;
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[ai stdout] {}", line);
                let parsed = match cli {
                    CliKind::Codex => normalizer::parse_line_codex(&mut codex_state, &line),
                    CliKind::Claude => normalizer::parse_line_claude(&mut claude_state, &line),
                };
                match parsed {
                    Some(chunk) => {
                        if matches!(chunk, AiResponseChunk::Done { .. } | AiResponseChunk::Error { .. }) {
                            done_emitted = true;
                        }
                        eprintln!("[ai chunk] {:?}", chunk);
                        let _ = app_for_stdout.emit_to(label_for_stdout.as_str(), &event_for_stdout, chunk);
                    }
                    None if line.trim().is_empty() => {}
                    None if normalizer::is_valid_json(&line) => {
                        eprintln!("[ai stdout] (valid JSON, no chunk)");
                    }
                    None => {
                        eprintln!("[ai stdout] UNPARSED: {}", line);
                    }
                }
            }
            eprintln!("[ai stdout] EOF for req_id={}", req_id_for_stdout);
            // Process closed without finalising — synthesise an Error so the
            // frontend's `await completion` doesn't hang. Codex sometimes
            // does this when its sandbox setup fails on Windows.
            if !done_emitted {
                eprintln!("[ai stdout] no Done/Error emitted before EOF — synthesising error");
                let _ = app_for_stdout.emit_to(
                    label_for_stdout.as_str(),
                    &event_for_stdout,
                    AiResponseChunk::Error {
                        message: "AI process exited without finalising the turn (check console for details).".into(),
                        exit_code: None,
                    },
                );
            }
        });
    }
    if let Some(err) = stderr {
        tokio::spawn(async move {
            // Codex routes diagnostic traces (sandbox refresh, tool routing,
            // INFO/ERROR telemetry) through stderr while real conversation
            // status stays in stdout. Emitting every stderr line as an Error
            // chunk turned every codex turn into a UI error bubble. We only
            // log to the dev console here; if the child exits non-zero with
            // no Done chunk in stdout, the frontend's promise simply
            // resolves on EOF without a fake error message — much cleaner.
            //
            // Claude emits its fatal errors as JSON `result` events on
            // stdout, so the same policy applies.
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[ai stderr] {}", line);
            }
            eprintln!("[ai stderr] EOF");
            // Suppress unused-binding warnings for the moved captures.
            let _ = (&app_for_stderr, &event_for_stderr, &label_for_stderr);
        });
    }
}

pub fn cancel(registry: &ChildRegistry, request_id: &str) {
    if let Some(mut child) = registry.take(request_id) {
        kill_tree(&mut child);
    }
}

/// Cross-platform "kill the spawned process AND its descendants". On Windows
/// the immediate child is often a `cmd.exe` shim wrapping `node` (npm
/// installers do this for codex/claude); `child.start_kill()` only terminates
/// the shim and orphans the real worker. `taskkill /T /F /PID <id>` walks the
/// process tree and force-kills each member, which actually stops generation.
pub fn kill_tree(child: &mut tokio::process::Child) {
    #[cfg(target_os = "windows")]
    {
        if let Some(pid) = child.id() {
            let _ = std::process::Command::new("taskkill")
                .args(["/T", "/F", "/PID", &pid.to_string()])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .status();
            return;
        }
    }
    let _ = child.start_kill();
}
