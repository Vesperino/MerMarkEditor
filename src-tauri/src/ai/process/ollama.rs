//! Ollama provider — local HTTP chat streaming.
//!
//! Unlike claude/codex (child processes whose stdout we pump), Ollama exposes
//! a local HTTP API. `POST {base}/api/chat` streams newline-delimited JSON:
//! each line carries a `message.content` delta until a final `done:true` line
//! that includes `prompt_eval_count` / `eval_count` token counts.
//!
//! Because reqwest's `bytes_stream` yields arbitrary byte chunks rather than
//! whole lines, we buffer and split on '\n' ourselves before parsing each line
//! through `normalizer::parse_line_ollama`. Chunks are emitted onto the same
//! `ai:stream:{request_id}` event the child-process pump uses, so the frontend
//! is provider-agnostic.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

use crate::ai::process::{emit_terminal, file_tools, local_ctx, normalizer, AiSendRequest, ChildRegistry, LineBuffer};
use crate::ai::types::AiResponseChunk;

pub const DEFAULT_BASE_URL: &str = "http://localhost:11434";

/// Resolve the configured base URL, falling back to the default when the
/// request carries none (the base URL rides on `cli_path`, reusing the
/// existing override channel rather than adding a new request field).
pub fn base_url(req: &AiSendRequest) -> String {
    normalize_base(req.cli_path.as_deref())
}

fn normalize_base(raw: Option<&str>) -> String {
    let trimmed = raw.map(|s| s.trim()).unwrap_or("");
    let base = if trimmed.is_empty() { DEFAULT_BASE_URL } else { trimmed };
    base.trim_end_matches('/').to_string()
}

fn build_chat_body(req: &AiSendRequest, num_ctx: u64) -> serde_json::Value {
    serde_json::json!({
        "model": req.model.clone().unwrap_or_default(),
        "messages": initial_messages(req),
        "stream": true,
        "options": { "num_ctx": num_ctx },
    })
}

/// Seed the message history for a turn: system preamble, then the trimmed prior
/// turns (user/assistant alternating), then the live user message (per-turn
/// context joined with the prompt). The tool loop accumulates intra-turn
/// messages on top of this seed.
fn initial_messages(req: &AiSendRequest) -> Vec<serde_json::Value> {
    let mut messages = Vec::new();
    if !req.preamble.is_empty() {
        messages.push(serde_json::json!({ "role": "system", "content": req.preamble }));
    }
    for turn in file_tools::trim_history(&req.history) {
        messages.push(serde_json::json!({ "role": turn.role, "content": turn.content }));
    }
    let user = crate::ai::process::join_message_parts(&[req.turn_context.as_str(), req.prompt.as_str()]);
    messages.push(serde_json::json!({ "role": "user", "content": user }));
    messages
}

pub async fn stream(
    app: AppHandle,
    window_label: String,
    registry: &ChildRegistry,
    req: AiSendRequest,
    request_id: String,
) -> Result<String, String> {
    let event = format!("ai:stream:{}", request_id);
    let specs = file_tools::tool_specs(&req.access_map.tools);

    let terminal = Arc::new(AtomicBool::new(false));
    let flag = terminal.clone();
    registry.spawn_abortable(request_id.clone(), terminal, async move {
        // Once per send (process-lifetime cache behind it): learn the model's
        // trained context + capabilities so we can cap num_ctx, report the
        // real window, and gate tool calling.
        let base = base_url(&req);
        let model = req.model.clone().unwrap_or_default();
        let show = local_ctx::ollama_show(&base, &model).await;
        let trained = show.as_ref().and_then(|s| s.trained_ctx);
        let num_ctx = local_ctx::effective_num_ctx(req.num_ctx, trained);
        // Window injection only when /api/show answered — otherwise the
        // frontend keeps its default.
        let window = show.as_ref().map(|_| num_ctx);

        if !specs.is_empty() {
            if local_ctx::tools_capable(show.as_ref()) {
                run_tool_loop(app, window_label, event, req, specs, num_ctx, window, flag).await;
                return;
            }
            eprintln!(
                "[ai ollama] model '{}' lacks the 'tools' capability — falling back to plain chat",
                model
            );
        }
        run_plain(app, window_label, event, req, num_ctx, window, flag).await;
    });
    Ok(request_id)
}

/// Streaming plain-chat path (no tools offered).
async fn run_plain(
    app: AppHandle,
    window_label: String,
    event: String,
    req: AiSendRequest,
    num_ctx: u64,
    window: Option<u64>,
    terminal: Arc<AtomicBool>,
) {
    let url = format!("{}/api/chat", base_url(&req));
    let body = build_chat_body(&req, num_ctx);
    let model = req.model.clone().unwrap_or_default();

    let client = crate::ai::process::http_client(None);
    let resp = match client.post(&url).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            emit_error(&app, &window_label, &event, &terminal, ollama_error(&e));
            return;
        }
    };
    if !resp.status().is_success() {
        let status = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        let message = if detail.trim().is_empty() {
            format!("Ollama request failed with HTTP {}.", status.as_u16())
        } else {
            format!("Ollama request failed (HTTP {}): {}", status.as_u16(), detail.trim())
        };
        emit_error(&app, &window_label, &event, &terminal, message);
        return;
    }

    let mut buf = LineBuffer::default();
    let mut done_emitted = false;
    let mut bytes = resp.bytes_stream();
    while let Some(chunk) = bytes.next().await {
        match chunk {
            Ok(bytes) => {
                for line in buf.feed(&bytes) {
                    if let Some(parsed) = normalizer::parse_line_ollama(line.trim()) {
                        let parsed = local_ctx::inject_into_done(parsed, &model, window);
                        if matches!(parsed, AiResponseChunk::Done { .. } | AiResponseChunk::Error { .. }) {
                            done_emitted = true;
                            emit_terminal(&app, &window_label, &event, &terminal, parsed);
                        } else {
                            let _ = app.emit_to(window_label.as_str(), &event, parsed);
                        }
                    }
                }
            }
            Err(e) => {
                emit_error(&app, &window_label, &event, &terminal, ollama_error(&e));
                done_emitted = true;
                break;
            }
        }
    }
    if !done_emitted {
        if let Some(parsed) = normalizer::parse_line_ollama(buf.remainder().trim()) {
            let parsed = local_ctx::inject_into_done(parsed, &model, window);
            if matches!(parsed, AiResponseChunk::Done { .. } | AiResponseChunk::Error { .. }) {
                done_emitted = true;
                emit_terminal(&app, &window_label, &event, &terminal, parsed);
            } else {
                let _ = app.emit_to(window_label.as_str(), &event, parsed);
            }
        }
    }
    if !done_emitted {
        emit_error(
            &app,
            &window_label,
            &event,
            &terminal,
            "Ollama stream ended without finalising the turn.".to_string(),
        );
    }
}

/// App-driven tool-calling loop for `/api/chat`. Every round STREAMS
/// (stream:true) like `run_plain`: text deltas reach the UI live and the
/// connection is untimed — a fixed total timeout killed slow CPU-bound turns
/// with zero partial output. Tool calls are collected from `message.tool_calls`
/// until the `done:true` line ends the round; a round that ends with tool
/// calls executes them via `file_tools::run_tool` (emitting ToolRequest /
/// ToolDenied chips), appends the results as `{role:"tool",content}` messages
/// (no id), and loops — capped at MAX_TOOL_ROUNDS. A round without tool calls
/// was the final answer. A first-round rejection falls back to plain chat:
/// gating stays permissive when the `/api/show` probe fails, so a non-tools
/// model (or a server too old to stream tool calls) must degrade rather than
/// error every send.
async fn run_tool_loop(
    app: AppHandle,
    window_label: String,
    event: String,
    req: AiSendRequest,
    specs: Vec<serde_json::Value>,
    num_ctx: u64,
    window: Option<u64>,
    terminal: Arc<AtomicBool>,
) {
    let url = format!("{}/api/chat", base_url(&req));
    let client = crate::ai::process::http_client(None);
    let mut messages = initial_messages(&req);

    for round in 0..file_tools::MAX_TOOL_ROUNDS {
        let body = serde_json::json!({
            "model": req.model.clone().unwrap_or_default(),
            "messages": messages,
            "stream": true,
            "tools": specs,
            "options": { "num_ctx": num_ctx },
        });
        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                emit_error(&app, &window_label, &event, &terminal, ollama_error(&e));
                return;
            }
        };
        if !resp.status().is_success() {
            let status = resp.status();
            let detail = resp.text().await.unwrap_or_default();
            if round == 0 {
                eprintln!(
                    "[ai ollama] tools request rejected (HTTP {}): {} — falling back to plain chat",
                    status.as_u16(),
                    detail.trim()
                );
                run_plain(app, window_label, event, req, num_ctx, window, terminal).await;
                return;
            }
            let message = if detail.trim().is_empty() {
                format!("Ollama request failed with HTTP {}.", status.as_u16())
            } else {
                format!("Ollama request failed (HTTP {}): {}", status.as_u16(), detail.trim())
            };
            emit_error(&app, &window_label, &event, &terminal, message);
            return;
        }
        let out = match stream_round(&app, &window_label, &event, &terminal, resp).await {
            Ok(out) => out,
            Err(()) => return,
        };

        let message = serde_json::json!({
            "role": "assistant",
            "content": out.content,
            "tool_calls": out.tool_calls,
        });
        let calls = file_tools::parse_tool_calls(crate::ai::types::CliKind::Ollama, &message);
        if calls.is_empty() {
            let done = local_ctx::inject_into_done(
                AiResponseChunk::Done { session_id: String::new(), usage: out.usage },
                req.model.as_deref().unwrap_or_default(),
                window,
            );
            emit_terminal(&app, &window_label, &event, &terminal, done);
            return;
        }

        messages.push(message);
        for call in &calls {
            let _ = app.emit_to(
                window_label.as_str(),
                &event,
                AiResponseChunk::ToolRequest {
                    tool: call.name.clone(),
                    args: call.args.clone(),
                    request_id: call.id.clone(),
                },
            );
            let result = match file_tools::run_tool(&req, &call.name, &call.args).await {
                Ok(ok) => ok,
                Err(err) => {
                    let _ = app.emit_to(
                        window_label.as_str(),
                        &event,
                        AiResponseChunk::ToolDenied {
                            tool: call.name.clone(),
                            reason: err.clone(),
                        },
                    );
                    err
                }
            };
            messages.push(serde_json::json!({
                "role": "tool",
                "content": result,
            }));
        }
    }

    emit_error(
        &app,
        &window_label,
        &event,
        &terminal,
        format!(
            "Tool loop exceeded {} rounds without a final answer. Stopping.",
            file_tools::MAX_TOOL_ROUNDS
        ),
    );
}

/// Accumulated state of one streamed tool-loop round: the full assistant text
/// (deltas are emitted live as they arrive), the raw `message.tool_calls`
/// entries, the done-line usage, and a server-reported error. The error is
/// folded rather than emitted so the line parser stays pure and testable.
#[derive(Default)]
struct RoundOutcome {
    content: String,
    tool_calls: Vec<serde_json::Value>,
    usage: Option<serde_json::Value>,
    error: Option<String>,
}

/// Fold one NDJSON line into the round state. Returns the text delta to emit
/// live, when the line carried one.
fn apply_round_line(out: &mut RoundOutcome, line: &str) -> Option<String> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(line) else {
        return None;
    };
    if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
        out.error = Some(err.to_string());
        return None;
    }
    let mut delta = None;
    if let Some(message) = v.get("message") {
        if let Some(content) = message
            .get("content")
            .and_then(|c| c.as_str())
            .filter(|c| !c.is_empty())
        {
            out.content.push_str(content);
            delta = Some(content.to_string());
        }
        if let Some(calls) = message.get("tool_calls").and_then(|c| c.as_array()) {
            out.tool_calls.extend(calls.iter().cloned());
        }
    }
    if v.get("done").and_then(|d| d.as_bool()).unwrap_or(false) {
        out.usage = renamed_usage(&v);
    }
    delta
}

/// Pump one round's NDJSON stream: emit Text deltas live, collect tool calls
/// and usage. Emits the terminal Error chunk itself and returns Err(()) when
/// the transport breaks or the server reports an error mid-stream.
async fn stream_round(
    app: &AppHandle,
    window_label: &str,
    event: &str,
    terminal: &AtomicBool,
    resp: reqwest::Response,
) -> Result<RoundOutcome, ()> {
    let mut out = RoundOutcome::default();
    let mut buf = LineBuffer::default();
    let mut bytes = resp.bytes_stream();
    while let Some(chunk) = bytes.next().await {
        match chunk {
            Ok(bytes) => {
                for line in buf.feed(&bytes) {
                    if let Some(text) = apply_round_line(&mut out, &line) {
                        let _ = app.emit_to(window_label, event, AiResponseChunk::Text { content: text });
                    }
                    if let Some(message) = out.error.take() {
                        emit_error(app, window_label, event, terminal, message);
                        return Err(());
                    }
                }
            }
            Err(e) => {
                emit_error(app, window_label, event, terminal, ollama_error(&e));
                return Err(());
            }
        }
    }
    if let Some(text) = apply_round_line(&mut out, &buf.remainder()) {
        let _ = app.emit_to(window_label, event, AiResponseChunk::Text { content: text });
    }
    if let Some(message) = out.error.take() {
        emit_error(app, window_label, event, terminal, message);
        return Err(());
    }
    Ok(out)
}

/// Rename a `/api/chat` done-line's token counts into the input/output shape
/// the frontend parser expects (mirrors `normalizer::parse_ollama`).
fn renamed_usage(v: &serde_json::Value) -> Option<serde_json::Value> {
    let input = v.get("prompt_eval_count").and_then(|n| n.as_u64());
    let output = v.get("eval_count").and_then(|n| n.as_u64());
    if input.is_none() && output.is_none() {
        return None;
    }
    Some(serde_json::json!({
        "input_tokens": input.unwrap_or(0),
        "output_tokens": output.unwrap_or(0),
    }))
}

/// List installed models via `GET {base}/api/tags`. A connection error yields
/// an Err; the frontend catches it and degrades to the custom-only picker when
/// Ollama is not running.
pub async fn list_models(base: Option<&str>) -> Result<Vec<String>, String> {
    let url = format!("{}/api/tags", normalize_base(base));
    let client = crate::ai::process::http_client(Some(std::time::Duration::from_secs(5)));
    let resp = client.get(&url).send().await.map_err(|e| ollama_error(&e))?;
    if !resp.status().is_success() {
        return Err(format!("Ollama /api/tags returned HTTP {}.", resp.status().as_u16()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(normalizer::parse_ollama_tags(&v))
}

fn ollama_error(e: &reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        "Ollama is not running. Start it (ollama serve) or check the base URL.".to_string()
    } else {
        format!("Ollama request error: {}", e)
    }
}

fn emit_error(app: &AppHandle, window_label: &str, event: &str, terminal: &AtomicBool, message: String) {
    emit_terminal(
        app,
        window_label,
        event,
        terminal,
        AiResponseChunk::Error { message, exit_code: None },
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::types::AccessMap;

    fn req_with(cli_path: Option<&str>, model: Option<&str>, preamble: &str) -> AiSendRequest {
        req_with_history(cli_path, model, preamble, vec![])
    }

    fn req_with_history(
        cli_path: Option<&str>,
        model: Option<&str>,
        preamble: &str,
        history: Vec<file_tools::HistoryTurn>,
    ) -> AiSendRequest {
        AiSendRequest {
            cli: crate::ai::types::CliKind::Ollama,
            session_id: None,
            model: model.map(|s| s.to_string()),
            effort: None,
            prompt: "hello".into(),
            preamble: preamble.into(),
            turn_context: String::new(),
            access_map: AccessMap::default_for_doc("/x"),
            bypass: false,
            work_dir: String::new(),
            images: vec![],
            cli_path: cli_path.map(|s| s.to_string()),
            history,
            num_ctx: None,
        }
    }

    fn turn(role: &str, content: &str) -> file_tools::HistoryTurn {
        file_tools::HistoryTurn { role: role.to_string(), content: content.to_string() }
    }

    #[test]
    fn base_url_defaults_when_empty() {
        assert_eq!(base_url(&req_with(None, None, "")), DEFAULT_BASE_URL);
        assert_eq!(base_url(&req_with(Some("  "), None, "")), DEFAULT_BASE_URL);
    }

    #[test]
    fn base_url_strips_trailing_slash() {
        assert_eq!(
            base_url(&req_with(Some("http://host:1234/"), None, "")),
            "http://host:1234"
        );
    }

    #[test]
    fn chat_body_includes_system_message_only_with_preamble() {
        let with = build_chat_body(&req_with(None, Some("llama3"), "be terse"), 8192);
        let msgs = with["messages"].as_array().unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0]["role"], "system");
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(with["model"], "llama3");
        assert_eq!(with["stream"], true);

        let without = build_chat_body(&req_with(None, Some("llama3"), ""), 8192);
        assert_eq!(without["messages"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn chat_body_carries_num_ctx_option() {
        let body = build_chat_body(&req_with(None, Some("llama3"), ""), 16384);
        assert_eq!(body["options"]["num_ctx"], 16384);
    }

    #[test]
    fn initial_messages_seeds_system_and_user() {
        let msgs = initial_messages(&req_with(None, Some("llama3"), "sys"));
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0]["role"], "system");
        assert_eq!(msgs[1]["role"], "user");

        let no_preamble = initial_messages(&req_with(None, None, ""));
        assert_eq!(no_preamble.len(), 1);
        assert_eq!(no_preamble[0]["role"], "user");
    }

    #[test]
    fn initial_messages_seeds_history_between_system_and_prompt() {
        let history = vec![turn("user", "h0"), turn("assistant", "h1")];
        let msgs = initial_messages(&req_with_history(None, Some("llama3"), "sys", history));
        assert_eq!(msgs.len(), 4);
        assert_eq!(msgs[0]["role"], "system");
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(msgs[1]["content"], "h0");
        assert_eq!(msgs[2]["role"], "assistant");
        assert_eq!(msgs[2]["content"], "h1");
        assert_eq!(msgs[3]["role"], "user");
        assert_eq!(msgs[3]["content"], "hello");
    }

    #[test]
    fn initial_messages_no_preamble_starts_with_history() {
        let history = vec![turn("user", "h0"), turn("assistant", "h1")];
        let msgs = initial_messages(&req_with_history(None, None, "", history));
        assert_eq!(msgs.len(), 3);
        assert_eq!(msgs[0]["role"], "user");
        assert_eq!(msgs[0]["content"], "h0");
        assert_eq!(msgs[1]["role"], "assistant");
        assert_eq!(msgs[2]["role"], "user");
        assert_eq!(msgs[2]["content"], "hello");
    }

    #[test]
    fn initial_messages_joins_turn_context_into_user_message() {
        let mut req = req_with(None, Some("llama3"), "sys");
        req.turn_context = "Pinned #1: ctx".into();
        let msgs = initial_messages(&req);
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(msgs[1]["content"], "Pinned #1: ctx\n\nhello");
    }

    #[test]
    fn renamed_usage_maps_eval_counts() {
        let v = serde_json::json!({ "prompt_eval_count": 9, "eval_count": 3, "done": true });
        let u = renamed_usage(&v).unwrap();
        assert_eq!(u["input_tokens"], 9);
        assert_eq!(u["output_tokens"], 3);
        assert!(renamed_usage(&serde_json::json!({ "done": true })).is_none());
    }

    #[test]
    fn apply_round_line_accumulates_text_tool_calls_and_usage() {
        let mut out = RoundOutcome::default();
        let delta = apply_round_line(
            &mut out,
            r#"{"message":{"role":"assistant","content":"Hi "},"done":false}"#,
        );
        assert_eq!(delta.as_deref(), Some("Hi "));
        let delta = apply_round_line(
            &mut out,
            r#"{"message":{"content":"","tool_calls":[{"function":{"name":"read_file","arguments":{"path":"/a"}}}]},"done":false}"#,
        );
        assert!(delta.is_none());
        let delta = apply_round_line(&mut out, r#"{"done":true,"prompt_eval_count":7,"eval_count":2}"#);
        assert!(delta.is_none());

        assert_eq!(out.content, "Hi ");
        assert_eq!(out.tool_calls.len(), 1);
        let message = serde_json::json!({ "role": "assistant", "content": out.content, "tool_calls": out.tool_calls });
        let calls = file_tools::parse_tool_calls(crate::ai::types::CliKind::Ollama, &message);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(calls[0].args["path"], "/a");
        let u = out.usage.unwrap();
        assert_eq!(u["input_tokens"], 7);
        assert_eq!(u["output_tokens"], 2);
        assert!(out.error.is_none());
    }

    #[test]
    fn apply_round_line_captures_error_and_skips_garbage() {
        let mut out = RoundOutcome::default();
        assert!(apply_round_line(&mut out, "not json").is_none());
        assert!(apply_round_line(&mut out, "  ").is_none());
        assert!(out.error.is_none());
        assert!(apply_round_line(&mut out, r#"{"error":"model does not support tools"}"#).is_none());
        assert_eq!(out.error.as_deref(), Some("model does not support tools"));
    }
}
