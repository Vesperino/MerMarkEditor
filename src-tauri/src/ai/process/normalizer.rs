use crate::ai::types::{AiResponseChunk, CliKind};

/// Per-stream parser state for codex (which needs to remember `thread_id`
/// across lines to attach it to the final Done chunk).
#[derive(Debug, Default)]
pub struct CodexParserState {
    pub thread_id: Option<String>,
}

/// Parse a single line of CLI output into zero or one normalized chunks.
/// Unknown / non-JSON lines return None (callers should keep them as raw text
/// only if no JSON parsing succeeds for the entire stream — handled in the
/// per-CLI parser).
pub fn parse_line(cli: CliKind, line: &str) -> Option<AiResponseChunk> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    match cli {
        CliKind::Claude => parse_claude(&v),
        CliKind::Codex => parse_codex(&v),
    }
}

/// Codex-specific stateful entry point (preserves `thread_id` across lines).
pub fn parse_line_codex(state: &mut CodexParserState, line: &str) -> Option<AiResponseChunk> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    parse_codex_stateful(state, &v)
}

/// True if a line is parseable JSON (regardless of whether we extract a chunk from it).
pub fn is_valid_json(line: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(line).is_ok()
}

fn parse_claude(v: &serde_json::Value) -> Option<AiResponseChunk> {
    let kind = v.get("type")?.as_str()?;
    match kind {
        // System / hook noise — drop.
        "system" => None,
        // Rate limit events — drop.
        "rate_limit_event" => None,
        // Cumulative assistant snapshot — already streamed via deltas, drop.
        "assistant" => None,
        "stream_event" => parse_stream_event(v.get("event")?),
        "result" => {
            let session_id = v.get("session_id").and_then(|s| s.as_str()).unwrap_or("").to_string();
            // Combine `usage` and `modelUsage` (which carries `contextWindow`)
            // into a single payload so the frontend parser can read both.
            let mut usage = v.get("usage").cloned().unwrap_or_else(|| serde_json::json!({}));
            if let Some(mu) = v.get("modelUsage").or_else(|| v.get("model_usage")) {
                if let Some(obj) = usage.as_object_mut() {
                    obj.insert("modelUsage".to_string(), mu.clone());
                }
            }
            Some(AiResponseChunk::Done { session_id, usage: Some(usage) })
        }
        _ => None,
    }
}

fn parse_stream_event(ev: &serde_json::Value) -> Option<AiResponseChunk> {
    let event_type = ev.get("type")?.as_str()?;
    match event_type {
        "content_block_delta" => {
            let delta = ev.get("delta")?;
            let delta_type = delta.get("type")?.as_str()?;
            match delta_type {
                "text_delta" => {
                    let text = delta.get("text").and_then(|t| t.as_str()).unwrap_or("");
                    if text.is_empty() {
                        None
                    } else {
                        Some(AiResponseChunk::Text { content: text.to_string() })
                    }
                }
                _ => None, // input_json_delta and others — drop for MVP
            }
        }
        "content_block_start" => {
            // Detect tool_use start. Surface a tool_request stub.
            let block = ev.get("content_block")?;
            if block.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                let tool = block.get("name").and_then(|n| n.as_str()).unwrap_or("unknown").to_string();
                let request_id = block.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                Some(AiResponseChunk::ToolRequest {
                    tool,
                    args: serde_json::json!({}),
                    request_id,
                })
            } else {
                None
            }
        }
        // Other stream events (message_start, content_block_stop, message_delta, message_stop) — drop.
        _ => None,
    }
}

/// Stateless codex parser kept for backward compatibility / older envelope
/// shapes; the canonical stateful flow is `parse_codex_stateful`.
fn parse_codex(v: &serde_json::Value) -> Option<AiResponseChunk> {
    let mut state = CodexParserState::default();
    parse_codex_stateful(&mut state, v)
}

/// Codex --json envelope (verified against codex-cli 0.128.0):
///   - `thread.started`   { thread_id }            → cache thread_id
///   - `turn.started`                              → drop
///   - `item.started`     { item }                 → drop
///   - `item.updated`     { item }                 → drop (no text deltas yet)
///   - `item.completed`   { item: agent_message } → Text (full message)
///   - `item.completed`   { item: function_call } → ToolRequest
///   - `item.completed`   { item: reasoning }      → drop
///   - `turn.completed`   { usage }                → Done (with cached thread_id)
fn parse_codex_stateful(
    state: &mut CodexParserState,
    v: &serde_json::Value,
) -> Option<AiResponseChunk> {
    let kind = v.get("type").and_then(|t| t.as_str())?;
    match kind {
        "thread.started" => {
            if let Some(tid) = v.get("thread_id").and_then(|t| t.as_str()) {
                state.thread_id = Some(tid.to_string());
            }
            None
        }
        "item.completed" => {
            let item = v.get("item")?;
            let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
            let request_id = item
                .get("id")
                .and_then(|i| i.as_str())
                .unwrap_or("")
                .to_string();
            match item_type {
                "agent_message" => {
                    let text = item.get("text").and_then(|t| t.as_str()).unwrap_or("");
                    if text.is_empty() {
                        None
                    } else {
                        Some(AiResponseChunk::Text { content: text.to_string() })
                    }
                }
                "function_call" => {
                    let tool = item
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or("exec")
                        .to_string();
                    let args = item
                        .get("arguments")
                        .or_else(|| item.get("args"))
                        .cloned()
                        .unwrap_or(serde_json::json!({}));
                    Some(AiResponseChunk::ToolRequest { tool, args, request_id })
                }
                // PowerShell / bash / arbitrary shell invocations.
                "command_execution" => {
                    let command = item
                        .get("command")
                        .and_then(|c| c.as_str())
                        .unwrap_or("")
                        .to_string();
                    Some(AiResponseChunk::ToolRequest {
                        tool: "Shell".into(),
                        args: serde_json::json!({ "command": command }),
                        request_id,
                    })
                }
                // Web search: query lives either at top level or inside action.
                "web_search" => {
                    let query = item
                        .get("query")
                        .and_then(|q| q.as_str())
                        .filter(|s| !s.is_empty())
                        .or_else(|| {
                            item.get("action")
                                .and_then(|a| a.get("query"))
                                .and_then(|q| q.as_str())
                        })
                        .unwrap_or("")
                        .to_string();
                    Some(AiResponseChunk::ToolRequest {
                        tool: "WebSearch".into(),
                        args: serde_json::json!({ "query": query }),
                        request_id,
                    })
                }
                // Codex announces apply_patch as a function_call already; if
                // future versions surface it as its own item.type, treat it
                // as an Edit tool here.
                "apply_patch" | "file_change" => {
                    let path = item.get("path").and_then(|p| p.as_str()).unwrap_or("").to_string();
                    Some(AiResponseChunk::ToolRequest {
                        tool: "Edit".into(),
                        args: serde_json::json!({ "path": path }),
                        request_id,
                    })
                }
                _ => None,
            }
        }
        "turn.completed" => {
            let session_id = state.thread_id.clone().unwrap_or_default();
            let usage = v.get("usage").cloned();
            Some(AiResponseChunk::Done { session_id, usage })
        }
        // Legacy envelope shapes still tolerated.
        "text" | "message" | "delta" => {
            let text = v
                .get("text")
                .or_else(|| v.get("content"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            if text.is_empty() {
                None
            } else {
                Some(AiResponseChunk::Text { content: text.to_string() })
            }
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unparseable_line_returns_none() {
        assert!(parse_line(CliKind::Claude, "not json").is_none());
        assert!(parse_line(CliKind::Codex, "{}").is_none());
    }

    #[test]
    fn claude_stream_event_text_delta_extracted() {
        let line = r#"{"type":"stream_event","event":{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}}"#;
        let out = parse_line(CliKind::Claude, line).unwrap();
        assert!(matches!(out, AiResponseChunk::Text { content } if content == "hello"));
    }

    #[test]
    fn claude_assistant_event_is_dropped_with_partial_messages() {
        // The cumulative assistant event would duplicate what we already streamed via deltas.
        let line = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]},"session_id":"s1"}"#;
        assert!(parse_line(CliKind::Claude, line).is_none());
    }

    #[test]
    fn claude_result_event_emits_done_with_session_id() {
        let line = r#"{"type":"result","subtype":"success","result":"ok","session_id":"s2","duration_ms":2594}"#;
        match parse_line(CliKind::Claude, line).unwrap() {
            AiResponseChunk::Done { session_id, .. } => assert_eq!(session_id, "s2"),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn claude_system_init_is_dropped() {
        let line = r#"{"type":"system","subtype":"init","session_id":"s1","cwd":"/foo"}"#;
        assert!(parse_line(CliKind::Claude, line).is_none());
    }

    #[test]
    fn claude_rate_limit_event_is_dropped() {
        let line = r#"{"type":"rate_limit_event","rate_limit_info":{"status":"allowed"}}"#;
        assert!(parse_line(CliKind::Claude, line).is_none());
    }

    #[test]
    fn claude_stream_event_message_start_is_dropped() {
        let line = r#"{"type":"stream_event","event":{"type":"message_start","message":{}}}"#;
        assert!(parse_line(CliKind::Claude, line).is_none());
    }

    #[test]
    fn codex_text_chunk_extracts_text_field() {
        let line = r#"{"type":"text","text":"hello"}"#;
        let out = parse_line(CliKind::Codex, line).unwrap();
        assert!(matches!(out, AiResponseChunk::Text { content } if content == "hello"));
    }

    #[test]
    fn codex_thread_started_caches_thread_id_and_emits_no_chunk() {
        let mut state = CodexParserState::default();
        let line = r#"{"type":"thread.started","thread_id":"abc-123"}"#;
        assert!(parse_line_codex(&mut state, line).is_none());
        assert_eq!(state.thread_id.as_deref(), Some("abc-123"));
    }

    #[test]
    fn codex_item_completed_agent_message_emits_text() {
        let mut state = CodexParserState::default();
        let line = r#"{"type":"item.completed","item":{"id":"i0","type":"agent_message","text":"hello world"}}"#;
        match parse_line_codex(&mut state, line).unwrap() {
            AiResponseChunk::Text { content } => assert_eq!(content, "hello world"),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn codex_turn_completed_emits_done_with_cached_thread_id() {
        let mut state = CodexParserState::default();
        parse_line_codex(&mut state, r#"{"type":"thread.started","thread_id":"t-9"}"#);
        let line = r#"{"type":"turn.completed","usage":{"input_tokens":10}}"#;
        match parse_line_codex(&mut state, line).unwrap() {
            AiResponseChunk::Done { session_id, usage } => {
                assert_eq!(session_id, "t-9");
                assert!(usage.is_some());
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn codex_item_completed_function_call_emits_tool_request() {
        let mut state = CodexParserState::default();
        let line = r#"{"type":"item.completed","item":{"id":"f1","type":"function_call","name":"shell","arguments":{"cmd":"ls"}}}"#;
        match parse_line_codex(&mut state, line).unwrap() {
            AiResponseChunk::ToolRequest { tool, request_id, .. } => {
                assert_eq!(tool, "shell");
                assert_eq!(request_id, "f1");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn codex_command_execution_emits_shell_tool_request() {
        let mut state = CodexParserState::default();
        let line = r#"{"type":"item.completed","item":{"id":"i3","type":"command_execution","command":"powershell -Command \"Get-Content x\"","exit_code":0,"status":"completed"}}"#;
        match parse_line_codex(&mut state, line).unwrap() {
            AiResponseChunk::ToolRequest { tool, args, request_id } => {
                assert_eq!(tool, "Shell");
                assert_eq!(request_id, "i3");
                assert!(args.get("command").and_then(|c| c.as_str()).unwrap_or("").contains("Get-Content"));
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn codex_web_search_emits_websearch_tool_request_with_query_from_action() {
        let mut state = CodexParserState::default();
        let line = r#"{"type":"item.completed","item":{"id":"ws1","type":"web_search","query":"","action":{"type":"search","query":"funny gif tenor"}}}"#;
        match parse_line_codex(&mut state, line).unwrap() {
            AiResponseChunk::ToolRequest { tool, args, .. } => {
                assert_eq!(tool, "WebSearch");
                assert_eq!(args.get("query").and_then(|q| q.as_str()), Some("funny gif tenor"));
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn codex_turn_started_and_item_started_drop() {
        let mut state = CodexParserState::default();
        assert!(parse_line_codex(&mut state, r#"{"type":"turn.started"}"#).is_none());
        assert!(parse_line_codex(&mut state, r#"{"type":"item.started","item":{"type":"agent_message"}}"#).is_none());
    }
}
