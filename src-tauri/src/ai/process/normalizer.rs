use crate::ai::types::{AiResponseChunk, CliKind};

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

fn parse_codex(v: &serde_json::Value) -> Option<AiResponseChunk> {
    // Codex --json envelope shape: confirm during integration testing.
    // Conservative defaults below; refine once real fixtures are captured.
    let kind = v.get("type").and_then(|t| t.as_str())?;
    match kind {
        "text" | "message" | "delta" => {
            let text = v.get("text").or_else(|| v.get("content")).and_then(|t| t.as_str()).unwrap_or("");
            if text.is_empty() { None } else { Some(AiResponseChunk::Text { content: text.to_string() }) }
        }
        "tool_call" | "exec" => {
            let tool = v.get("name").and_then(|n| n.as_str()).unwrap_or("exec").to_string();
            let args = v.get("args").cloned().unwrap_or(serde_json::json!({}));
            let request_id = v.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
            Some(AiResponseChunk::ToolRequest { tool, args, request_id })
        }
        "session_id" => {
            let session_id = v.get("value").and_then(|s| s.as_str()).unwrap_or("").to_string();
            Some(AiResponseChunk::Done { session_id, usage: None })
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
}
