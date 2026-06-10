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

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

use crate::ai::process::{file_tools, local_ctx, normalizer, AiSendRequest, ChildRegistry};
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

    registry.spawn_abortable(request_id.clone(), async move {
        // Once per send (cached per (base, model)): run the detection chain so
        // the Done usage can carry the real context window. A full miss keeps
        // the frontend default.
        let base = base_url(&req);
        let model = req.model.clone().unwrap_or_default();
        let window = local_ctx::openai_context_window(&base, &model).await;

        if specs.is_empty() {
            run_plain(app, window_label, event, req, window).await;
        } else {
            run_tool_loop(app, window_label, event, req, specs, window).await;
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
) {
    let url = format!("{}/v1/chat/completions", base_url(&req));
    let body = build_chat_body(&req);
    let model = req.model.clone().unwrap_or_default();

    let client = crate::ai::process::http_client(None);
    let resp = match client.post(&url).json(&body).send().await {
        Ok(r) => r,
        Err(e) => {
            emit_error(&app, &window_label, &event, openai_error(&e));
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
        emit_error(&app, &window_label, &event, message);
        return;
    }

    let mut buf = String::new();
    let mut done_emitted = false;
    let mut bytes = resp.bytes_stream();
    while let Some(chunk) = bytes.next().await {
        match chunk {
            Ok(bytes) => {
                buf.push_str(&String::from_utf8_lossy(&bytes));
                while let Some(nl) = buf.find('\n') {
                    let line: String = buf.drain(..=nl).collect();
                    // The usage-bearing Done arrives just before `[DONE]`;
                    // once we've finalised, ignore the trailing terminator
                    // so the turn isn't finalised twice.
                    if done_emitted {
                        continue;
                    }
                    if let Some(parsed) = normalizer::parse_line_openai(line.trim()) {
                        if matches!(parsed, AiResponseChunk::Done { .. } | AiResponseChunk::Error { .. }) {
                            done_emitted = true;
                        }
                        let parsed = local_ctx::inject_into_done(parsed, &model, window);
                        let _ = app.emit_to(window_label.as_str(), &event, parsed);
                    }
                }
            }
            Err(e) => {
                emit_error(&app, &window_label, &event, openai_error(&e));
                done_emitted = true;
                break;
            }
        }
    }
    if !done_emitted {
        if let Some(parsed) = normalizer::parse_line_openai(buf.trim()) {
            let parsed = local_ctx::inject_into_done(parsed, &model, window);
            let _ = app.emit_to(window_label.as_str(), &event, parsed);
            done_emitted = true;
        }
    }
    if !done_emitted {
        emit_error(
            &app,
            &window_label,
            &event,
            "OpenAI-compatible stream ended without finalising the turn.".to_string(),
        );
    }
}

/// App-driven tool-calling loop. Intermediate rounds are non-streaming POSTs
/// (stream:false) so we can read whole assistant messages and act on
/// `tool_calls`; the final assistant text is emitted as one Text chunk. The
/// loop executes file tools via `file_tools::run_tool`, emits ToolRequest /
/// ToolDenied so the UI shows tool chips, and caps rounds at MAX_TOOL_ROUNDS.
async fn run_tool_loop(
    app: AppHandle,
    window_label: String,
    event: String,
    req: AiSendRequest,
    specs: Vec<serde_json::Value>,
    window: Option<u64>,
) {
    let url = format!("{}/v1/chat/completions", base_url(&req));
    let client = crate::ai::process::http_client(Some(std::time::Duration::from_secs(180)));
    let mut messages = initial_messages(&req);

    for _round in 0..file_tools::MAX_TOOL_ROUNDS {
        let body = serde_json::json!({
            "model": req.model.clone().unwrap_or_default(),
            "messages": messages,
            "stream": false,
            "tools": specs,
            "tool_choice": "auto",
        });
        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                emit_error(&app, &window_label, &event, openai_error(&e));
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
            emit_error(&app, &window_label, &event, message);
            return;
        }
        let v: serde_json::Value = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                emit_error(&app, &window_label, &event, format!("OpenAI-compatible response was not JSON: {}", e));
                return;
            }
        };
        if let Some(err) = v.get("error") {
            let message = err
                .get("message")
                .and_then(|m| m.as_str())
                .or_else(|| err.as_str())
                .unwrap_or("OpenAI-compatible request failed.")
                .to_string();
            emit_error(&app, &window_label, &event, message);
            return;
        }
        let message = v
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|a| a.first())
            .and_then(|c| c.get("message"))
            .cloned()
            .unwrap_or_else(|| serde_json::json!({}));

        let calls = file_tools::parse_tool_calls(crate::ai::types::CliKind::Openai, &message);
        if calls.is_empty() {
            let content = message
                .get("content")
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();
            if !content.is_empty() {
                let _ = app.emit_to(
                    window_label.as_str(),
                    &event,
                    AiResponseChunk::Text { content },
                );
            }
            let usage = renamed_usage(&v);
            let done = local_ctx::inject_into_done(
                AiResponseChunk::Done { session_id: String::new(), usage },
                req.model.as_deref().unwrap_or_default(),
                window,
            );
            let _ = app.emit_to(window_label.as_str(), &event, done);
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
        format!(
            "Tool loop exceeded {} rounds without a final answer. Stopping.",
            file_tools::MAX_TOOL_ROUNDS
        ),
    );
}

/// Rename a non-streaming response's `usage` into the input/output token shape
/// the frontend parser expects (mirrors `normalizer::parse_openai`).
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

fn emit_error(app: &AppHandle, window_label: &str, event: &str, message: String) {
    let _ = app.emit_to(
        window_label,
        event,
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
}
