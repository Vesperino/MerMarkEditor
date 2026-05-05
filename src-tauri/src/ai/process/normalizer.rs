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
    // Claude stream-json envelope shape: { "type": "...", ... }.
    // Real keys to confirm during integration testing — see Task B2 step 1.
    let kind = v.get("type")?.as_str()?;
    match kind {
        "assistant" | "message" | "content_block_delta" => {
            let text = v.get("delta")
                .and_then(|d| d.get("text"))
                .and_then(|t| t.as_str())
                .or_else(|| v.get("content").and_then(|c| c.as_str()))
                .unwrap_or("");
            if text.is_empty() { None } else { Some(AiResponseChunk::Text { content: text.to_string() }) }
        }
        "tool_use" => {
            let tool = v.get("name").and_then(|n| n.as_str()).unwrap_or("unknown").to_string();
            let args = v.get("input").cloned().unwrap_or(serde_json::json!({}));
            let request_id = v.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
            Some(AiResponseChunk::ToolRequest { tool, args, request_id })
        }
        "result" | "done" => {
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
    fn claude_text_chunk_extracts_delta_text() {
        let line = r#"{"type":"content_block_delta","delta":{"text":"hello"}}"#;
        let out = parse_line(CliKind::Claude, line).unwrap();
        assert!(matches!(out, AiResponseChunk::Text { content } if content == "hello"));
    }

    #[test]
    fn claude_tool_use_becomes_tool_request() {
        let line = r#"{"type":"tool_use","name":"Bash","input":{"command":"ls"},"id":"abc"}"#;
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
    fn codex_text_chunk_extracts_text_field() {
        let line = r#"{"type":"text","text":"hello"}"#;
        let out = parse_line(CliKind::Codex, line).unwrap();
        assert!(matches!(out, AiResponseChunk::Text { content } if content == "hello"));
    }
}
