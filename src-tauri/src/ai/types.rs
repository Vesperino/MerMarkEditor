use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CliKind {
    Claude,
    Codex,
}

impl CliKind {
    pub fn as_str(self) -> &'static str {
        match self {
            CliKind::Claude => "claude",
            CliKind::Codex => "codex",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthStatus {
    pub ok: bool,
    pub version: Option<String>,
    pub account: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessMapTools {
    pub bash: bool,
    pub network: bool,
    pub file_read: bool,
    pub file_write: bool,
}

impl Default for AccessMapTools {
    fn default() -> Self {
        // File read + write enabled by default so AI can edit the active
        // markdown file directly. bash + network stay off (require explicit
        // opt-in via the access-map editor).
        Self { bash: false, network: false, file_read: true, file_write: true }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessMap {
    pub read_paths: Vec<String>,
    pub write_paths: Vec<String>,
    pub tools: AccessMapTools,
}

impl AccessMap {
    pub fn default_for_doc(doc_path: &str) -> Self {
        Self {
            read_paths: vec![doc_path.to_string()],
            write_paths: vec![doc_path.to_string()],
            tools: AccessMapTools::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMapping {
    pub doc_path: String,
    pub cli: CliKind,
    pub session_id: String,
    pub last_used: String, // ISO 8601
    pub content_hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotIndexEntry {
    pub id: String, // ISO timestamp acts as id
    pub ts: String,
    pub source_session_id: Option<String>,
    pub pinned: bool,
    pub content_hash: String,
    pub byte_size: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub ts: String,
    pub session_id: Option<String>,
    pub cli: CliKind,
    pub action: String,
    pub args: serde_json::Value,
    pub result: serde_json::Value,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum AiResponseChunk {
    /// Streamed text content.
    Text { content: String },
    /// AI requested a tool call (frontend may need to confirm if bypass off).
    ToolRequest {
        tool: String,
        args: serde_json::Value,
        request_id: String,
    },
    /// Tool was denied by the access map (Rust-side enforcement).
    ToolDenied { tool: String, reason: String },
    /// Final marker.
    Done {
        session_id: String,
        usage: Option<serde_json::Value>,
    },
    /// Process error.
    Error {
        message: String,
        exit_code: Option<i32>,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn access_map_default_for_doc_has_read_and_write_only_for_doc() {
        let am = AccessMap::default_for_doc("/foo/bar.md");
        assert_eq!(am.read_paths, vec!["/foo/bar.md"]);
        assert_eq!(am.write_paths, vec!["/foo/bar.md"]);
        assert!(am.tools.file_read);
        assert!(am.tools.file_write);
        assert!(!am.tools.bash);
        assert!(!am.tools.network);
    }

    #[test]
    fn cli_kind_serializes_lowercase() {
        let s = serde_json::to_string(&CliKind::Claude).unwrap();
        assert_eq!(s, "\"claude\"");
    }

    #[test]
    fn ai_response_chunk_round_trips_json() {
        let chunk = AiResponseChunk::Text { content: "hello".into() };
        let s = serde_json::to_string(&chunk).unwrap();
        let back: AiResponseChunk = serde_json::from_str(&s).unwrap();
        assert!(matches!(back, AiResponseChunk::Text { .. }));
    }

    #[test]
    fn access_map_serializes_to_camel_case() {
        let am = AccessMap::default_for_doc("/x");
        let v: serde_json::Value = serde_json::from_str(&serde_json::to_string(&am).unwrap()).unwrap();
        assert!(v.get("readPaths").is_some());
        assert!(v.get("writePaths").is_some());
        assert!(v["tools"].get("fileRead").is_some());
        assert!(v["tools"].get("fileWrite").is_some());
    }

    #[test]
    fn ai_response_chunk_text_uses_kind_tag_text() {
        let chunk = AiResponseChunk::Text { content: "x".into() };
        let v: serde_json::Value = serde_json::from_str(&serde_json::to_string(&chunk).unwrap()).unwrap();
        assert_eq!(v["kind"], "text");
    }

    #[test]
    fn ai_response_chunk_done_emits_camel_case_session_id() {
        let chunk = AiResponseChunk::Done { session_id: "s1".into(), usage: None };
        let v: serde_json::Value = serde_json::from_str(&serde_json::to_string(&chunk).unwrap()).unwrap();
        assert_eq!(v["kind"], "done");
        assert_eq!(v["sessionId"], "s1");
        // Round-trip back.
        let back: AiResponseChunk = serde_json::from_str(&serde_json::to_string(&chunk).unwrap()).unwrap();
        assert!(matches!(back, AiResponseChunk::Done { session_id, .. } if session_id == "s1"));
    }

    #[test]
    fn ai_response_chunk_tool_request_emits_camel_case_request_id() {
        let chunk = AiResponseChunk::ToolRequest {
            tool: "Bash".into(),
            args: serde_json::json!({"cmd": "ls"}),
            request_id: "rq".into(),
        };
        let v: serde_json::Value = serde_json::from_str(&serde_json::to_string(&chunk).unwrap()).unwrap();
        assert_eq!(v["kind"], "tool_request");
        assert_eq!(v["requestId"], "rq");
    }

    #[test]
    fn ai_response_chunk_error_emits_camel_case_exit_code() {
        let chunk = AiResponseChunk::Error { message: "boom".into(), exit_code: Some(1) };
        let v: serde_json::Value = serde_json::from_str(&serde_json::to_string(&chunk).unwrap()).unwrap();
        assert_eq!(v["kind"], "error");
        assert_eq!(v["exitCode"], 1);
    }
}
