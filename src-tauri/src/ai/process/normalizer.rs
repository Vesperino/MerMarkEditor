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

fn parse_claude(v: &serde_json::Value) -> Option<AiResponseChunk> {
    let kind = v.get("type")?.as_str()?;
    match kind {
        // System init carries session_id but no user-visible content. Skip.
        // Hook system messages are noise.
        "system" => None,
        // Rate limit events are noise.
        "rate_limit_event" => None,
        "assistant" => {
            // Real envelope: message.content is an array of {type, text} or {type:"tool_use", ...}
            let message = v.get("message")?;
            let content = message.get("content")?.as_array()?;
            // Walk the array; emit text chunks for {type:"text"}, tool_request for {type:"tool_use"}.
            // For now we collect the FIRST significant chunk (most stream-json deltas are single-content).
            for item in content {
                let item_type = item.get("type")?.as_str()?;
                match item_type {
                    "text" => {
                        let text = item.get("text").and_then(|t| t.as_str()).unwrap_or("");
                        if !text.is_empty() {
                            return Some(AiResponseChunk::Text { content: text.to_string() });
                        }
                    }
                    "tool_use" => {
                        let tool = item.get("name").and_then(|n| n.as_str()).unwrap_or("unknown").to_string();
                        let args = item.get("input").cloned().unwrap_or(serde_json::json!({}));
                        let request_id = item.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                        return Some(AiResponseChunk::ToolRequest { tool, args, request_id });
                    }
                    _ => continue,
                }
            }
            None
        }
        "result" => {
            let session_id = v.get("session_id").and_then(|s| s.as_str()).unwrap_or("").to_string();
            let usage = v.get("usage").cloned();
            Some(AiResponseChunk::Done { session_id, usage })
        }
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
    fn claude_assistant_text_chunk_extracted_from_message_content() {
        let line = r#"{"type":"assistant","message":{"model":"claude-opus-4-7","content":[{"type":"text","text":"hello"}]},"session_id":"s1"}"#;
        let out = parse_line(CliKind::Claude, line).unwrap();
        assert!(matches!(out, AiResponseChunk::Text { content } if content == "hello"));
    }

    #[test]
    fn claude_assistant_tool_use_extracted_from_message_content() {
        let line = r#"{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"ls"},"id":"abc"}]},"session_id":"s1"}"#;
        let out = parse_line(CliKind::Claude, line).unwrap();
        match out {
            AiResponseChunk::ToolRequest { tool, request_id, .. } => {
                assert_eq!(tool, "Bash");
                assert_eq!(request_id, "abc");
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn claude_result_event_emits_done_with_session_id() {
        let line = r#"{"type":"result","subtype":"success","result":"ok","session_id":"s2","duration_ms":2594}"#;
        let out = parse_line(CliKind::Claude, line).unwrap();
        match out {
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
    fn codex_text_chunk_extracts_text_field() {
        let line = r#"{"type":"text","text":"hello"}"#;
        let out = parse_line(CliKind::Codex, line).unwrap();
        assert!(matches!(out, AiResponseChunk::Text { content } if content == "hello"));
    }
}
