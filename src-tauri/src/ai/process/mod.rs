pub mod registry;
pub mod normalizer;
pub mod claude;
pub mod codex;
pub mod file_tools;
pub mod local_ctx;
pub mod ollama;
pub mod openai;

pub use registry::ChildRegistry;

use std::sync::{Arc, Mutex};
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
    /// Per-turn context (pins, unsaved-doc warning, mermaid mode). Sent every
    /// turn, unlike `preamble` which the frontend gates to once per session.
    #[serde(default)]
    pub turn_context: String,
    pub access_map: AccessMap,
    pub bypass: bool,
    pub work_dir: String,
    /// Absolute paths to image files attached to this turn. Each provider
    /// passes them differently (codex: `-i path`; claude: stdin stream-json
    /// content blocks — wired in a follow-up).
    #[serde(default)]
    pub images: Vec<String>,
    /// Optional user-supplied path to the CLI binary, taking precedence over
    /// PATH-based resolution. Used on macOS/Linux when the binary lives
    /// outside the GUI process's PATH (Homebrew, npm-global, volta, etc.).
    /// Empty / None falls back to `cli::resolve_with_override`. See issue #70.
    #[serde(default)]
    pub cli_path: Option<String>,
    /// Prior conversation turns for the LOCAL providers (ollama/openai), which
    /// have no resume. claude/codex ignore this and resume via `session_id`.
    /// Default empty so existing callers are unaffected.
    #[serde(default)]
    pub history: Vec<file_tools::HistoryTurn>,
    /// Requested Ollama runtime window (settings.ai.ollamaNumCtx), sent as
    /// `options.num_ctx` capped at the model's trained context. None falls
    /// back to `local_ctx::DEFAULT_NUM_CTX`. Other providers ignore it.
    #[serde(default)]
    pub num_ctx: Option<u64>,
    /// Current content of the main document, attached fresh on every send for
    /// the LOCAL providers (ollama/openai) so weak models skip the read_file
    /// round-trip. Never enters `history` (the frontend builds history from
    /// prompts only). claude/codex ignore it — their CLIs read the file.
    #[serde(default)]
    pub doc_content: Option<String>,
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
    if matches!(req.cli, CliKind::Ollama | CliKind::Openai) {
        audit::append(&app, AuditEntry {
            ts: audit::now_iso(),
            session_id: req.session_id.clone(),
            cli: req.cli,
            action: "send".into(),
            args: serde_json::json!({ "request_id": request_id, "bypass": req.bypass, "cli_name": req.cli.as_str() }),
            result: serde_json::json!({}),
            exit_code: None,
        })?;
        return match req.cli {
            CliKind::Openai => openai::stream(app, window_label, registry.inner(), req, request_id).await,
            _ => ollama::stream(app, window_label, registry.inner(), req, request_id).await,
        };
    }
    let (child, codex_window) = match req.cli {
        CliKind::Claude => (claude::spawn(&req).await?, None),
        CliKind::Codex => {
            let window = codex::resolve_context_window(req.model.as_deref()).await;
            (codex::spawn(&req).await?, req.model.clone().zip(window))
        }
        CliKind::Ollama | CliKind::Openai => unreachable!("ollama/openai handled above"),
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
    spawn_pump(app, window_label, registry.inner(), request_id.clone(), req.cli, child, codex_window);
    Ok(request_id)
}

/// The per-send document attachment as a system message, when the request
/// carries one. Inserted immediately before the live user message so the
/// freshest content sits closest to the prompt.
pub(crate) fn doc_attachment_message(req: &AiSendRequest) -> Option<serde_json::Value> {
    let doc = req.doc_content.as_deref().filter(|d| !d.is_empty())?;
    Some(serde_json::json!({
        "role": "system",
        "content": format!(
            "Current content of the main file (between <<< and >>> markers; the markers are not part of the file):\n<<<\n{}\n>>>",
            doc
        ),
    }))
}

/// Join the non-empty of [preamble, turn_context, prompt] with blank lines.
pub fn join_message_parts(parts: &[&str]) -> String {
    parts
        .iter()
        .filter(|p| !p.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn spawn_pump(
    app: AppHandle,
    window_label: String,
    registry: &ChildRegistry,
    request_id: String,
    cli: CliKind,
    mut child: Child,
    codex_window: Option<(String, u64)>,
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
    let _req_id_for_stdout = request_id.clone();

    // Shared rolling buffer of the most recent stderr lines. Used to attach
    // a stderr tail to the synthetic "exited without finalising" error so
    // users see WHY the child died (e.g. "Sandbox setup failed: ...") instead
    // of an opaque message. Bounded so a chatty CLI can't grow it unboundedly.
    let stderr_tail: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let stderr_tail_for_stdout = stderr_tail.clone();
    let stderr_tail_for_stderr = stderr_tail.clone();

    if let Some(out) = stdout {
        tokio::spawn(async move {
            let mut lines = BufReader::new(out).lines();
            // Both CLIs need cross-line state. Codex caches `thread_id` for the
            // final Done chunk; claude buffers `input_json_delta` slices into
            // the final tool-call arguments emitted on `content_block_stop`.
            let mut codex_state = normalizer::CodexParserState {
                model: codex_window.as_ref().map(|(m, _)| m.clone()),
                context_window: codex_window.map(|(_, w)| w),
                ..Default::default()
            };
            let mut claude_state = normalizer::ClaudeParserState::default();
            let mut openai_state = normalizer::OpenaiParserState::default();
            let mut done_emitted = false;
            while let Ok(Some(line)) = lines.next_line().await {
                let parsed = match cli {
                    CliKind::Codex => normalizer::parse_line_codex(&mut codex_state, &line),
                    CliKind::Claude => normalizer::parse_line_claude(&mut claude_state, &line),
                    CliKind::Ollama => normalizer::parse_line_ollama(&line),
                    CliKind::Openai => normalizer::parse_line_openai(&mut openai_state, &line),
                };
                match parsed {
                    Some(chunk) => {
                        if matches!(chunk, AiResponseChunk::Done { .. } | AiResponseChunk::Error { .. }) {
                            done_emitted = true;
                        }
                        let _ = app_for_stdout.emit_to(label_for_stdout.as_str(), &event_for_stdout, chunk);
                    }
                    None if line.trim().is_empty() => {}
                    None if normalizer::is_valid_json(&line) => {}
                    None => {
                        // Unparsed non-empty non-JSON: surface for diagnosis.
                        eprintln!("[ai stdout] UNPARSED: {}", line);
                    }
                }
            }
            // Process closed without finalising — synthesise an Error so the
            // frontend's `await completion` doesn't hang. Codex sometimes
            // does this when its sandbox setup fails on Windows. Attach the
            // tail of stderr so the user can actually see what failed.
            if !done_emitted {
                // Give stderr task a beat to flush whatever it's still holding
                // — child exit closes both pipes ~simultaneously and the two
                // reader tasks race. 50 ms is plenty in practice.
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                let tail = stderr_tail_for_stdout.lock().unwrap().join("\n");
                let message = if tail.trim().is_empty() {
                    "AI process exited without finalising the turn (check console for details).".to_string()
                } else {
                    format!(
                        "AI process exited without finalising the turn.\n\nLast stderr:\n{}",
                        tail
                    )
                };
                eprintln!("[ai] child exited without Done/Error — synthesising error");
                let _ = app_for_stdout.emit_to(
                    label_for_stdout.as_str(),
                    &event_for_stdout,
                    AiResponseChunk::Error {
                        message,
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
            // chunk turned every codex turn into a UI error bubble.
            //
            // Claude emits its fatal errors as JSON `result` events on
            // stdout, so the same policy applies.
            //
            // We still capture a rolling tail of stderr so that when a child
            // dies without producing a Done/Error on stdout we can attach
            // "Last stderr: ..." to the synthetic error chunk.
            const TAIL_LIMIT: usize = 20;
            let mut lines = BufReader::new(err).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                #[cfg(debug_assertions)]
                eprintln!("[ai stderr] {}", line);
                let mut buf = stderr_tail_for_stderr.lock().unwrap();
                buf.push(line);
                if buf.len() > TAIL_LIMIT {
                    let n = buf.len() - TAIL_LIMIT;
                    buf.drain(0..n);
                }
            }
            // Suppress unused-binding warnings for the moved captures.
            let _ = (&app_for_stderr, &event_for_stderr, &label_for_stderr);
        });
    }
}

pub fn cancel(app: &AppHandle, window_label: &str, registry: &ChildRegistry, request_id: &str) {
    if let Some(chunk) = cancel_inner(registry, request_id) {
        let event = format!("ai:stream:{}", request_id);
        let _ = app.emit_to(window_label, &event, chunk);
    }
}

/// Kill/abort whatever is registered under `request_id`. A killed CLI child
/// makes its stdout pump synthesise the terminal Error itself, but aborting an
/// HTTP task kills the emitter outright — so return the terminal chunk for the
/// caller to emit, otherwise the frontend's completion promise never resolves
/// and every subsequent send fails with "A send is already in flight".
///
/// The terminal flag closes a race with natural completion: the task may have
/// already emitted its Done but not yet removed its registry entry, in which
/// case emitting Error("Cancelled") here would land AFTER the Done. Whoever
/// flips the flag first owns the terminal emission.
fn cancel_inner(registry: &ChildRegistry, request_id: &str) -> Option<AiResponseChunk> {
    if let Some(mut child) = registry.take(request_id) {
        kill_tree(&mut child);
    }
    let (handle, terminal) = registry.take_abort(request_id)?;
    handle.abort();
    if terminal.swap(true, std::sync::atomic::Ordering::SeqCst) {
        return None;
    }
    Some(AiResponseChunk::Error { message: "Cancelled".to_string(), exit_code: None })
}

/// Emit a terminal chunk (Done/Error) for an HTTP-provider turn exactly once:
/// the first caller to flip `terminal` wins, the rest are dropped. Providers
/// route every terminal emission through here so a concurrent cancel (which
/// also flips the flag) can never append a second terminal chunk. No await
/// between the swap and the emit, so an abort cannot land in between.
pub(crate) fn emit_terminal(
    app: &AppHandle,
    window_label: &str,
    event: &str,
    terminal: &std::sync::atomic::AtomicBool,
    chunk: AiResponseChunk,
) {
    if !terminal.swap(true, std::sync::atomic::Ordering::SeqCst) {
        let _ = app.emit_to(window_label, event, chunk);
    }
}

/// Accumulates raw network bytes and yields complete '\n'-terminated lines.
///
/// reqwest's `bytes_stream` cuts at arbitrary byte boundaries, so a multi-byte
/// UTF-8 character can land split across two chunks; decoding each chunk
/// separately (`from_utf8_lossy` per chunk) turns the split codepoint into
/// U+FFFD on both sides of the boundary. NDJSON/SSE frames are '\n'-delimited
/// and a complete line always ends on a codepoint boundary, so buffering bytes
/// and decoding whole lines is lossless.
#[derive(Default)]
pub(crate) struct LineBuffer {
    buf: Vec<u8>,
}

impl LineBuffer {
    /// Append a network chunk and drain every complete line it unlocked
    /// (trailing '\n' / "\r\n" stripped).
    pub fn feed(&mut self, bytes: &[u8]) -> Vec<String> {
        self.buf.extend_from_slice(bytes);
        let mut lines = Vec::new();
        while let Some(nl) = self.buf.iter().position(|b| *b == b'\n') {
            let mut line: Vec<u8> = self.buf.drain(..=nl).collect();
            line.pop();
            if line.last() == Some(&b'\r') {
                line.pop();
            }
            lines.push(String::from_utf8_lossy(&line).into_owned());
        }
        lines
    }

    /// Decode whatever trails the final newline once the stream has ended.
    pub fn remainder(&self) -> String {
        String::from_utf8_lossy(&self.buf).into_owned()
    }
}

/// Local-provider HTTP client: 5 s to establish the connection; `total` caps
/// the whole request when given. Streaming responses pass `None` — they run
/// for as long as the model generates.
pub(crate) fn http_client(total: Option<std::time::Duration>) -> reqwest::Client {
    let mut builder = reqwest::Client::builder().connect_timeout(std::time::Duration::from_secs(5));
    if let Some(t) = total {
        builder = builder.timeout(t);
    }
    builder.build().expect("default reqwest client must build")
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
            let mut tk = std::process::Command::new("taskkill");
            tk.args(["/T", "/F", "/PID", &pid.to_string()])
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
            crate::ai::cli::hide_console_std(&mut tk);
            let _ = tk.status();
            return;
        }
    }
    let _ = child.start_kill();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_message_parts_joins_all_non_empty() {
        assert_eq!(join_message_parts(&["pre", "turn", "prompt"]), "pre\n\nturn\n\nprompt");
    }

    #[test]
    fn join_message_parts_skips_empty_preamble() {
        assert_eq!(join_message_parts(&["", "turn", "prompt"]), "turn\n\nprompt");
    }

    #[test]
    fn join_message_parts_prompt_only() {
        assert_eq!(join_message_parts(&["", "", "prompt"]), "prompt");
    }

    #[tokio::test]
    async fn cancel_aborts_http_task_and_yields_terminal_chunk() {
        let registry = ChildRegistry::new();
        let task = tokio::spawn(std::future::pending::<()>());
        let terminal = Arc::new(std::sync::atomic::AtomicBool::new(false));
        registry.insert_abort("r1".into(), task.abort_handle(), terminal.clone());

        match cancel_inner(&registry, "r1") {
            Some(AiResponseChunk::Error { message, exit_code }) => {
                assert_eq!(message, "Cancelled");
                assert_eq!(exit_code, None);
            }
            other => panic!("expected terminal Error chunk, got {:?}", other),
        }
        assert!(terminal.load(std::sync::atomic::Ordering::SeqCst));
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(registry.take_abort("r1").is_none());
    }

    #[tokio::test]
    async fn cancel_yields_no_chunk_when_task_already_emitted_terminal() {
        // Race seam: the task emitted Done (flag flipped) but its registry
        // entry is not yet removed — cancel must not add a second terminal.
        let registry = ChildRegistry::new();
        let task = tokio::spawn(std::future::pending::<()>());
        let terminal = Arc::new(std::sync::atomic::AtomicBool::new(true));
        registry.insert_abort("r2".into(), task.abort_handle(), terminal);

        assert!(cancel_inner(&registry, "r2").is_none());
        assert!(task.await.unwrap_err().is_cancelled());
        assert!(registry.take_abort("r2").is_none());
    }

    #[test]
    fn cancel_without_registered_work_yields_no_chunk() {
        let registry = ChildRegistry::new();
        assert!(cancel_inner(&registry, "missing").is_none());
    }

    #[test]
    fn line_buffer_keeps_multibyte_chars_split_across_chunks() {
        let line = "{\"content\":\"zażółć 中文 łóżko\"}\n";
        let mut buf = LineBuffer::default();
        let mut lines = Vec::new();
        for b in line.as_bytes() {
            lines.extend(buf.feed(std::slice::from_ref(b)));
        }
        assert_eq!(lines, vec![line.trim_end().to_string()]);
        assert!(!lines[0].contains('\u{FFFD}'));
        assert_eq!(buf.remainder(), "");
    }

    #[test]
    fn line_buffer_splits_coalesced_lines_and_strips_crlf() {
        let mut buf = LineBuffer::default();
        let lines = buf.feed(b"a\r\nb\nc");
        assert_eq!(lines, vec!["a".to_string(), "b".to_string()]);
        assert_eq!(buf.remainder(), "c");
        let lines = buf.feed(b"d\n");
        assert_eq!(lines, vec!["cd".to_string()]);
        assert_eq!(buf.remainder(), "");
    }
}
