//! OpenAI-compatible provider — local HTTP chat streaming.
//!
//! Speaks the OpenAI HTTP API (`POST {base}/v1/chat/completions`), so it works
//! against llama.cpp's `llama-server`, LM Studio, vLLM, local Mistral, and even
//! Ollama's own `/v1` endpoint. Unlike the native Ollama provider (which uses
//! `/api/chat` with newline-delimited JSON), this streams Server-Sent-Events:
//! lines of `data: {json}\n\n`, each carrying `choices[0].delta.content`,
//! terminated by a literal `data: [DONE]`. With `stream_options.include_usage`
//! the final data chunk before `[DONE]` carries the token usage.
//!
//! As with `ollama.rs`, reqwest yields arbitrary byte chunks, so we buffer and
//! split on '\n' before parsing each line through `normalizer::parse_line_openai`.
//! Chunks ride the same `ai:stream:{request_id}` event so the frontend stays
//! provider-agnostic.

use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

use crate::ai::process::{emit_terminal, file_tools, local_ctx, normalizer, AiSendRequest, ChildRegistry, LineBuffer};
use crate::ai::types::AiResponseChunk;

pub const DEFAULT_BASE_URL: &str = "http://localhost:8080";

/// Resolve the configured base URL, falling back to the default when the
/// request carries none (the base URL rides on `cli_path`, reusing the
/// existing override channel rather than adding a new request field).
pub fn base_url(req: &AiSendRequest) -> String {
    normalize_base(req.cli_path.as_deref())
}

/// Normalise the base URL: trim, default, strip a trailing '/', then strip a
/// trailing '/v1' so callers that build `.../v1/...` URLs do not duplicate it
/// (both `http://host:8080` and `http://host:8080/v1` resolve identically).
fn normalize_base(raw: Option<&str>) -> String {
    let trimmed = raw.map(|s| s.trim()).unwrap_or("");
    let base = if trimmed.is_empty() { DEFAULT_BASE_URL } else { trimmed };
    let base = base.trim_end_matches('/');
    base.strip_suffix("/v1").unwrap_or(base).to_string()
}

fn build_chat_body(req: &AiSendRequest) -> serde_json::Value {
    serde_json::json!({
        "model": req.model.clone().unwrap_or_default(),
        "messages": initial_messages(req),
        "stream": true,
        "stream_options": { "include_usage": true },
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
        // Once per send (cached per (base, model)): run the detection chain so
        // the Done usage can carry the real context window. A full miss keeps
        // the frontend default.
        let base = base_url(&req);
        let model = req.model.clone().unwrap_or_default();
        let window = local_ctx::openai_context_window(&base, &model).await;

        if specs.is_empty() {
            run_plain(app, window_label, event, req, window, flag).await;
        } else {
            run_tool_loop(app, window_label, event, req, specs, window, flag).await;
        }
    });
    Ok(request_id)
}

/// Streaming plain-chat path (no tools offered).
async fn run_plain(
    app: AppHandle,
    window_label: String,
    event: String,
    req: AiSendRequest,
    window: Option<u64>,
    terminal: Arc<AtomicBool>,
) {
    let url = format!("{}/v1/chat/completions", base_url(&req));
    let body = build_chat_body(&req);
    let model = req.model.clone().unwrap_or_default();

    let client = crate::ai::process::http_client(None);
    let resp = match client.post(&url).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            emit_error(&app, &window_label, &event, &terminal, openai_error(&e));
            return;
        }
    };
    if !resp.status().is_success() {
        let status = resp.status();
        let detail = resp.text().await.unwrap_or_default();
        let message = if detail.trim().is_empty() {
            format!("OpenAI-compatible request failed with HTTP {}.", status.as_u16())
        } else {
            format!("OpenAI-compatible request failed (HTTP {}): {}", status.as_u16(), detail.trim())
        };
        emit_error(&app, &window_label, &event, &terminal, message);
        return;
    }

    let mut parser = normalizer::OpenaiParserState::default();
    let mut buf = LineBuffer::default();
    let mut done_emitted = false;
    let mut bytes = resp.bytes_stream();
    while let Some(chunk) = bytes.next().await {
        match chunk {
            Ok(bytes) => {
                for line in buf.feed(&bytes) {
                    // Ignore anything after the turn finalised (e.g. a server
                    // that repeats `[DONE]`) so it isn't finalised twice.
                    if done_emitted {
                        continue;
                    }
                    if let Some(parsed) = normalizer::parse_line_openai(&mut parser, line.trim()) {
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
                emit_error(&app, &window_label, &event, &terminal, openai_error(&e));
                done_emitted = true;
                break;
            }
        }
    }
    if !done_emitted {
        if let Some(parsed) = normalizer::parse_line_openai(&mut parser, buf.remainder().trim()) {
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
        // Stream ended cleanly without the `[DONE]` sentinel; captured usage
        // means the server did finish the turn, so finalise as Done.
        if let Some(usage) = parser.usage.take() {
            let done = local_ctx::inject_into_done(
                AiResponseChunk::Done { session_id: String::new(), usage: Some(usage) },
                &model,
                window,
            );
            emit_terminal(&app, &window_label, &event, &terminal, done);
            done_emitted = true;
        }
    }
    if !done_emitted {
        emit_error(
            &app,
            &window_label,
            &event,
            &terminal,
            "OpenAI-compatible stream ended without finalising the turn.".to_string(),
        );
    }
}

/// App-driven tool-calling loop. Every round STREAMS (SSE, like `run_plain`):
/// text deltas reach the UI live and the connection is untimed — a fixed total
/// timeout killed slow CPU-bound turns with zero partial output. Fragmented
/// `delta.tool_calls` are assembled by index until `[DONE]`; a round that ends
/// with tool calls executes them via `file_tools::run_tool` (emitting
/// ToolRequest / ToolDenied chips), appends the results, and loops — capped at
/// MAX_TOOL_ROUNDS. A round without tool calls was the final answer. A
/// first-round rejection falls back to plain chat: the OpenAI API has no
/// capability probe, and the advertised targets reject the tools param
/// outright when launched without tool support (vLLM without
/// --enable-auto-tool-choice, llama-server without --jinja).
async fn run_tool_loop(
    app: AppHandle,
    window_label: String,
    event: String,
    req: AiSendRequest,
    specs: Vec<serde_json::Value>,
    window: Option<u64>,
    terminal: Arc<AtomicBool>,
) {
    let url = format!("{}/v1/chat/completions", base_url(&req));
    let client = crate::ai::process::http_client(None);
    let mut messages = initial_messages(&req);

    for round in 0..file_tools::MAX_TOOL_ROUNDS {
        let body = serde_json::json!({
            "model": req.model.clone().unwrap_or_default(),
            "messages": messages,
            "stream": true,
            "stream_options": { "include_usage": true },
            "tools": specs,
            "tool_choice": "auto",
        });
        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                emit_error(&app, &window_label, &event, &terminal, openai_error(&e));
                return;
            }
        };
        if !resp.status().is_success() {
            let status = resp.status();
            let detail = resp.text().await.unwrap_or_default();
            if round == 0 {
                eprintln!(
                    "[ai openai] tools request rejected (HTTP {}): {} — falling back to plain chat",
                    status.as_u16(),
                    detail.trim()
                );
                run_plain(app, window_label, event, req, window, terminal).await;
                return;
            }
            let message = if detail.trim().is_empty() {
                format!("OpenAI-compatible request failed with HTTP {}.", status.as_u16())
            } else {
                format!("OpenAI-compatible request failed (HTTP {}): {}", status.as_u16(), detail.trim())
            };
            emit_error(&app, &window_label, &event, &terminal, message);
            return;
        }
        let out = match stream_round(&app, &window_label, &event, &terminal, resp).await {
            Ok(out) => out,
            Err(()) => return,
        };

        let message = assistant_message(&out);
        let calls = file_tools::parse_tool_calls(crate::ai::types::CliKind::Openai, &message);
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
                "tool_call_id": call.id,
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

/// One tool call assembled from streamed `delta.tool_calls` fragments: `id`
/// and `name` arrive once, `arguments` arrives as string fragments to
/// concatenate.
#[derive(Default)]
struct AssembledCall {
    id: String,
    name: String,
    arguments: String,
}

/// Accumulated state of one streamed tool-loop round: the full assistant text
/// (deltas are emitted live as they arrive), the assembled tool calls, the
/// usage chunk, and a server-reported error. The error is folded rather than
/// emitted so the line parser stays pure and testable.
#[derive(Default)]
struct RoundOutcome {
    content: String,
    calls: Vec<AssembledCall>,
    usage: Option<serde_json::Value>,
    error: Option<String>,
}

/// Fold one streamed tool-call delta into the assembly. Fragments are keyed by
/// `index`; servers that send a whole call per delta may omit it, which we
/// treat as "append a new call".
fn apply_tool_call_delta(calls: &mut Vec<AssembledCall>, entry: &serde_json::Value) {
    let idx = entry
        .get("index")
        .and_then(|i| i.as_u64())
        .map(|i| i as usize)
        .unwrap_or(calls.len());
    if idx >= calls.len() {
        calls.resize_with(idx + 1, Default::default);
    }
    let call = &mut calls[idx];
    if let Some(id) = entry.get("id").and_then(|i| i.as_str()).filter(|s| !s.is_empty()) {
        call.id = id.to_string();
    }
    if let Some(func) = entry.get("function") {
        if let Some(name) = func.get("name").and_then(|n| n.as_str()) {
            call.name.push_str(name);
        }
        if let Some(args) = func.get("arguments").and_then(|a| a.as_str()) {
            call.arguments.push_str(args);
        }
    }
}

/// Fold one SSE line into the round state. Returns the text delta to emit
/// live, when the line carried one.
fn apply_round_line(out: &mut RoundOutcome, line: &str) -> Option<String> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let payload = line.strip_prefix("data:").map(str::trim).unwrap_or(line);
    if payload == "[DONE]" {
        return None;
    }
    let Ok(v) = serde_json::from_str::<serde_json::Value>(payload) else {
        return None;
    };
    if let Some(err) = v.get("error") {
        let message = err
            .get("message")
            .and_then(|m| m.as_str())
            .or_else(|| err.as_str())
            .unwrap_or("OpenAI-compatible request failed.")
            .to_string();
        out.error = Some(message);
        return None;
    }
    if v.get("usage").filter(|u| u.is_object()).is_some() {
        out.usage = renamed_usage(&v);
    }
    let mut delta_text = None;
    if let Some(delta) = v.pointer("/choices/0/delta") {
        if let Some(content) = delta
            .get("content")
            .and_then(|c| c.as_str())
            .filter(|c| !c.is_empty())
        {
            out.content.push_str(content);
            delta_text = Some(content.to_string());
        }
        if let Some(calls) = delta.get("tool_calls").and_then(|c| c.as_array()) {
            for entry in calls {
                apply_tool_call_delta(&mut out.calls, entry);
            }
        }
    }
    delta_text
}

/// Echo the round's assembled calls back as the assistant message for the next
/// round. Empty ids get a synthesized one so the `tool_call_id` on the tool
/// results always matches an id in this message (strict servers require it);
/// nameless assemblies (garbage fragments) are dropped, matching what
/// `parse_tool_calls` would skip anyway.
fn assistant_message(out: &RoundOutcome) -> serde_json::Value {
    let tool_calls: Vec<serde_json::Value> = out
        .calls
        .iter()
        .filter(|c| !c.name.is_empty())
        .enumerate()
        .map(|(i, c)| {
            let id = if c.id.is_empty() { format!("openai-call-{}", i) } else { c.id.clone() };
            serde_json::json!({
                "id": id,
                "type": "function",
                "function": { "name": c.name, "arguments": c.arguments }
            })
        })
        .collect();
    serde_json::json!({ "role": "assistant", "content": out.content, "tool_calls": tool_calls })
}

/// Pump one round's SSE stream: emit Text deltas live, assemble tool calls and
/// usage. Emits the terminal Error chunk itself and returns Err(()) when the
/// transport breaks or the server reports an error mid-stream.
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
                emit_error(app, window_label, event, terminal, openai_error(&e));
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

/// Rename a response's `usage` into the input/output token shape the frontend
/// parser expects (mirrors `normalizer::parse_openai`).
fn renamed_usage(v: &serde_json::Value) -> Option<serde_json::Value> {
    let usage = v.get("usage").filter(|u| u.is_object())?;
    let input = usage.get("prompt_tokens").and_then(|n| n.as_u64()).unwrap_or(0);
    let output = usage.get("completion_tokens").and_then(|n| n.as_u64()).unwrap_or(0);
    Some(serde_json::json!({ "input_tokens": input, "output_tokens": output }))
}

/// List models the server exposes via `GET {base}/v1/models`. A connection
/// error yields an Err so the UI degrades gracefully (custom-only picker) when
/// the local server is not running.
pub async fn list_models(base: Option<&str>) -> Result<Vec<String>, String> {
    let url = format!("{}/v1/models", normalize_base(base));
    let client = crate::ai::process::http_client(Some(std::time::Duration::from_secs(5)));
    let resp = client.get(&url).send().await.map_err(|e| openai_error(&e))?;
    if !resp.status().is_success() {
        return Err(format!("OpenAI-compatible /v1/models returned HTTP {}.", resp.status().as_u16()));
    }
    let v: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(normalizer::parse_openai_models(&v))
}

fn openai_error(e: &reqwest::Error) -> String {
    if e.is_connect() || e.is_timeout() {
        "Local OpenAI-compatible server is not running. Start it (e.g. llama-server / LM Studio) or check the base URL.".to_string()
    } else {
        format!("OpenAI-compatible request error: {}", e)
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
            cli: crate::ai::types::CliKind::Openai,
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
    fn base_url_does_not_double_v1() {
        // Both a bare base and a base already carrying /v1 must yield exactly
        // one /v1 in the built chat URL.
        for raw in ["http://localhost:8080", "http://localhost:8080/v1", "http://localhost:8080/v1/"] {
            let base = base_url(&req_with(Some(raw), None, ""));
            let url = format!("{}/v1/chat/completions", base);
            assert_eq!(url.matches("/v1/").count(), 1, "raw={}", raw);
            assert_eq!(url, "http://localhost:8080/v1/chat/completions", "raw={}", raw);
        }
    }

    #[test]
    fn chat_body_includes_system_message_only_with_preamble() {
        let with = build_chat_body(&req_with(None, Some("qwen3.5"), "be terse"));
        let msgs = with["messages"].as_array().unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0]["role"], "system");
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(with["model"], "qwen3.5");
        assert_eq!(with["stream"], true);
        assert_eq!(with["stream_options"]["include_usage"], true);

        let without = build_chat_body(&req_with(None, Some("qwen3.5"), ""));
        assert_eq!(without["messages"].as_array().unwrap().len(), 1);
    }

    #[test]
    fn initial_messages_seeds_system_and_user() {
        let msgs = initial_messages(&req_with(None, Some("qwen3.5"), "sys"));
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0]["role"], "system");
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(msgs[1]["content"], "hello");

        let no_preamble = initial_messages(&req_with(None, None, ""));
        assert_eq!(no_preamble.len(), 1);
        assert_eq!(no_preamble[0]["role"], "user");
    }

    #[test]
    fn initial_messages_seeds_history_between_system_and_prompt() {
        let history = vec![turn("user", "h0"), turn("assistant", "h1")];
        let msgs = initial_messages(&req_with_history(None, Some("qwen3.5"), "sys", history));
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
        let mut req = req_with(None, Some("qwen3.5"), "sys");
        req.turn_context = "Pinned #1: ctx".into();
        let msgs = initial_messages(&req);
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(msgs[1]["content"], "Pinned #1: ctx\n\nhello");
    }

    #[test]
    fn renamed_usage_maps_prompt_completion_tokens() {
        let v = serde_json::json!({ "usage": { "prompt_tokens": 11, "completion_tokens": 4 } });
        let u = renamed_usage(&v).unwrap();
        assert_eq!(u["input_tokens"], 11);
        assert_eq!(u["output_tokens"], 4);
        assert!(renamed_usage(&serde_json::json!({})).is_none());
    }

    #[test]
    fn apply_round_line_emits_deltas_and_collects_usage() {
        let mut out = RoundOutcome::default();
        let d = apply_round_line(&mut out, r#"data: {"choices":[{"delta":{"content":"Hel"}}]}"#);
        assert_eq!(d.as_deref(), Some("Hel"));
        let d = apply_round_line(&mut out, r#"data: {"choices":[{"delta":{"content":"lo"}}]}"#);
        assert_eq!(d.as_deref(), Some("lo"));
        assert!(apply_round_line(
            &mut out,
            r#"data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":3}}"#
        )
        .is_none());
        assert!(apply_round_line(&mut out, "data: [DONE]").is_none());

        assert_eq!(out.content, "Hello");
        let u = out.usage.unwrap();
        assert_eq!(u["input_tokens"], 5);
        assert_eq!(u["output_tokens"], 3);
        assert!(out.error.is_none());
    }

    #[test]
    fn apply_round_line_assembles_fragmented_tool_calls_by_index() {
        let mut out = RoundOutcome::default();
        apply_round_line(
            &mut out,
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":""}}]}}]}"#,
        );
        apply_round_line(
            &mut out,
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"{\"path\":"}}]}}]}"#,
        );
        apply_round_line(
            &mut out,
            r#"data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"/a.md\"}"}}]}}]}"#,
        );
        let msg = assistant_message(&out);
        let calls = file_tools::parse_tool_calls(crate::ai::types::CliKind::Openai, &msg);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id, "call_1");
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(calls[0].args["path"], "/a.md");
    }

    #[test]
    fn apply_tool_call_delta_without_index_appends_new_call() {
        let mut calls = Vec::new();
        apply_tool_call_delta(
            &mut calls,
            &serde_json::json!({ "id": "a", "function": { "name": "read_file", "arguments": "{}" } }),
        );
        apply_tool_call_delta(
            &mut calls,
            &serde_json::json!({ "id": "b", "function": { "name": "list_dir", "arguments": "{}" } }),
        );
        assert_eq!(calls.len(), 2);
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(calls[1].name, "list_dir");
    }

    #[test]
    fn assistant_message_synthesizes_missing_ids_and_drops_nameless() {
        let out = RoundOutcome {
            content: "thinking".into(),
            calls: vec![
                AssembledCall { id: String::new(), name: "read_file".into(), arguments: "{}".into() },
                AssembledCall::default(),
            ],
            ..Default::default()
        };
        let msg = assistant_message(&out);
        let calls = msg["tool_calls"].as_array().unwrap();
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0]["id"], "openai-call-0");
        assert_eq!(msg["content"], "thinking");
    }

    #[test]
    fn apply_round_line_captures_error() {
        let mut out = RoundOutcome::default();
        assert!(apply_round_line(
            &mut out,
            r#"data: {"error":{"message":"tool_choice requires --enable-auto-tool-choice"}}"#
        )
        .is_none());
        assert!(out.error.as_deref().unwrap().contains("tool_choice"));
    }
}
