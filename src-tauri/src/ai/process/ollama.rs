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

use futures_util::StreamExt;
use tauri::{AppHandle, Emitter};

use crate::ai::process::{file_tools, normalizer, AiSendRequest, ChildRegistry};
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

fn build_chat_body(req: &AiSendRequest) -> serde_json::Value {
    serde_json::json!({
        "model": req.model.clone().unwrap_or_default(),
        "messages": initial_messages(req),
        "stream": true,
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
    if specs.is_empty() {
        return stream_plain(app, window_label, registry, req, request_id).await;
    }

    registry.spawn_abortable(request_id.clone(), async move {
        run_tool_loop(app, window_label, event, req, specs).await;
    });
    Ok(request_id)
}

/// Existing streaming plain-chat path, preserved verbatim for the no-tools case.
async fn stream_plain(
    app: AppHandle,
    window_label: String,
    registry: &ChildRegistry,
    req: AiSendRequest,
    request_id: String,
) -> Result<String, String> {
    let url = format!("{}/api/chat", base_url(&req));
    let body = build_chat_body(&req);
    let event = format!("ai:stream:{}", request_id);

    registry.spawn_abortable(request_id.clone(), async move {
        let client = crate::ai::process::http_client(None);
        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                emit_error(&app, &window_label, &event, ollama_error(&e));
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
                        if let Some(parsed) = normalizer::parse_line_ollama(line.trim()) {
                            if matches!(parsed, AiResponseChunk::Done { .. } | AiResponseChunk::Error { .. }) {
                                done_emitted = true;
                            }
                            let _ = app.emit_to(window_label.as_str(), &event, parsed);
                        }
                    }
                }
                Err(e) => {
                    emit_error(&app, &window_label, &event, ollama_error(&e));
                    done_emitted = true;
                    break;
                }
            }
        }
        if !done_emitted {
            if let Some(parsed) = normalizer::parse_line_ollama(buf.trim()) {
                let _ = app.emit_to(window_label.as_str(), &event, parsed);
                done_emitted = true;
            }
        }
        if !done_emitted {
            emit_error(
                &app,
                &window_label,
                &event,
                "Ollama stream ended without finalising the turn.".to_string(),
            );
        }
    });
    Ok(request_id)
}

/// App-driven tool-calling loop for `/api/chat`. Intermediate rounds are
/// non-streaming POSTs (stream:false) so we can read whole assistant messages
/// and act on `tool_calls` (Ollama: `arguments` is already an object). Tool
/// results are appended as `{role:"tool",content}` messages (no id). Emits
/// ToolRequest / ToolDenied so the UI shows tool chips; caps at
/// MAX_TOOL_ROUNDS.
async fn run_tool_loop(
    app: AppHandle,
    window_label: String,
    event: String,
    req: AiSendRequest,
    specs: Vec<serde_json::Value>,
) {
    let url = format!("{}/api/chat", base_url(&req));
    let client = crate::ai::process::http_client(Some(std::time::Duration::from_secs(180)));
    let mut messages = initial_messages(&req);

    for _round in 0..file_tools::MAX_TOOL_ROUNDS {
        let body = serde_json::json!({
            "model": req.model.clone().unwrap_or_default(),
            "messages": messages,
            "stream": false,
            "tools": specs,
        });
        let resp = match client.post(&url).json(&body).send().await {
            Ok(r) => r,
            Err(e) => {
                emit_error(&app, &window_label, &event, ollama_error(&e));
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
            emit_error(&app, &window_label, &event, message);
            return;
        }
        let v: serde_json::Value = match resp.json().await {
            Ok(v) => v,
            Err(e) => {
                emit_error(&app, &window_label, &event, format!("Ollama response was not JSON: {}", e));
                return;
            }
        };
        if let Some(err) = v.get("error").and_then(|e| e.as_str()) {
            emit_error(&app, &window_label, &event, err.to_string());
            return;
        }
        let message = v.get("message").cloned().unwrap_or_else(|| serde_json::json!({}));

        let calls = file_tools::parse_tool_calls(crate::ai::types::CliKind::Ollama, &message);
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
            let _ = app.emit_to(
                window_label.as_str(),
                &event,
                AiResponseChunk::Done { session_id: String::new(), usage },
            );
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
        format!(
            "Tool loop exceeded {} rounds without a final answer. Stopping.",
            file_tools::MAX_TOOL_ROUNDS
        ),
    );
}

/// Rename a non-streaming `/api/chat` response's token counts into the
/// input/output shape the frontend parser expects (mirrors
/// `normalizer::parse_ollama`).
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
        let with = build_chat_body(&req_with(None, Some("llama3"), "be terse"));
        let msgs = with["messages"].as_array().unwrap();
        assert_eq!(msgs.len(), 2);
        assert_eq!(msgs[0]["role"], "system");
        assert_eq!(msgs[1]["role"], "user");
        assert_eq!(with["model"], "llama3");
        assert_eq!(with["stream"], true);

        let without = build_chat_body(&req_with(None, Some("llama3"), ""));
        assert_eq!(without["messages"].as_array().unwrap().len(), 1);
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
}
