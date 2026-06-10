//! App-driven file tools for the local HTTP providers (ollama, openai).
//!
//! The local providers are plain chat — unlike claude/codex (CLI agents whose
//! own Read/Write/Edit tools touch disk), they cannot edit the active document.
//! This module gives them a small, access-map-gated tool set the provider loop
//! executes via `tokio::fs`, so a tool-capable local model (e.g. qwen3.5) can
//! actually read/write the document the same way the CLI agents do.
//!
//! Path safety is enforced here, server-side: writes go only to the active
//! document, reads only inside its directory (plus any extra read roots the
//! frontend merged into the access map). Canonicalization is the cross-OS
//! normaliser — no shell, no platform `#[cfg]`.

use serde::{Deserialize, Serialize};

use crate::ai::process::AiSendRequest;
use crate::ai::types::{AccessMapTools, CliKind};

/// Hard cap on tool rounds per turn so a model that keeps requesting tools can
/// never spin the loop forever.
pub const MAX_TOOL_ROUNDS: usize = 12;

/// `read_file` returns at most this many bytes so a huge document cannot blow
/// the model's context / stall the loop. Mirrors the 200KB large-doc threshold
/// used elsewhere in the AI panel.
pub const READ_FILE_CAP_BYTES: usize = 200 * 1024;

/// `list_dir` returns at most this many entries so a huge directory cannot blow
/// the model's context. Listings past this are truncated with a note.
pub const LIST_DIR_MAX_ENTRIES: usize = 500;

/// Local models have far smaller context windows than the CLI agents, so we
/// seed at most this many prior turns and HISTORY_MAX_CHARS of content. 20
/// turns / 24000 chars (~6k tokens) is a conservative budget that leaves room
/// for the preamble, the live prompt, and the tool loop on a small window.
pub const HISTORY_MAX_TURNS: usize = 20;
pub const HISTORY_MAX_CHARS: usize = 24_000;

/// One prior conversation turn carried into a local-provider request. Only
/// `user`/`assistant` text turns are sent (no tool_calls) so strict OpenAI
/// servers never see a dangling tool_call_id. claude/codex resume via
/// session_id and ignore this entirely.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryTurn {
    pub role: String,
    pub content: String,
}

/// A tool call parsed from a provider response, normalised across the two
/// wire shapes (OpenAI: `arguments` is a JSON string; Ollama: an object).
#[derive(Debug, Clone)]
pub struct PendingToolCall {
    /// Provider-supplied id (OpenAI) or a synthesized index id (Ollama). Echoed
    /// back as `tool_call_id` on the tool-result message for strict servers.
    pub id: String,
    pub name: String,
    pub args: serde_json::Value,
}

/// Build the OpenAI/Ollama-shaped tool specs the model is offered, gated by the
/// access map exactly like `claude::allowed_tools`:
///   - `read_file`  iff `file_read`
///   - `write_file` + `edit_file` iff `file_write`
/// Returns an empty vec when neither flag is set — the caller then behaves as
/// plain chat (current behavior preserved).
pub fn tool_specs(tools: &AccessMapTools) -> Vec<serde_json::Value> {
    let mut specs = Vec::new();
    if tools.file_read {
        specs.push(serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Read the full text of a file. Use this to inspect the active document before editing it.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file to read." }
                    },
                    "required": ["path"]
                }
            }
        }));
        specs.push(serde_json::json!({
            "type": "function",
            "function": {
                "name": "list_dir",
                "description": "List the immediate entries of a directory (files and subfolders). Use this to explore a granted folder before reading individual files. Directories are marked with a trailing '/'.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the directory to list." }
                    },
                    "required": ["path"]
                }
            }
        }));
    }
    if tools.file_write {
        specs.push(serde_json::json!({
            "type": "function",
            "function": {
                "name": "write_file",
                "description": "Overwrite a file with new content (whole-file replace). The only writable target is the active document.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file to overwrite (must be the active document)." },
                        "content": { "type": "string", "description": "The complete new file contents." }
                    },
                    "required": ["path", "content"]
                }
            }
        }));
        specs.push(serde_json::json!({
            "type": "function",
            "function": {
                "name": "edit_file",
                "description": "Replace an exact substring in a file. old_string must appear exactly once. Prefer this over write_file for small edits.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Absolute path to the file to edit (must be the active document)." },
                        "old_string": { "type": "string", "description": "The exact text to replace. Must match once and only once; include surrounding context to make it unique." },
                        "new_string": { "type": "string", "description": "The replacement text." }
                    },
                    "required": ["path", "old_string", "new_string"]
                }
            }
        }));
    }
    specs
}

/// The configured "only writable target": the first write path, which the
/// preamble names to the model. None when no write target exists (e.g. one-shot
/// Mermaid calls with an empty write_paths).
fn doc_path(req: &AiSendRequest) -> Option<&str> {
    req.access_map
        .write_paths
        .first()
        .map(|s| s.as_str())
        .filter(|s| !s.is_empty())
}

/// Canonicalize a path that must already exist on disk.
async fn canonicalize_existing(path: &str) -> Result<std::path::PathBuf, String> {
    tokio::fs::canonicalize(path)
        .await
        .map_err(|e| format!("cannot resolve path {}: {}", path, e))
}

/// Canonicalize a (possibly not-yet-existing) target by resolving its parent
/// directory then re-attaching the file name. This normalises `..`, `.`, mixed
/// separators, and Windows drive/case specifics without requiring the file to
/// exist yet — used for write targets that the model might address relatively.
async fn canonicalize_target(path: &str) -> Result<std::path::PathBuf, String> {
    let p = std::path::Path::new(path);
    if let Ok(resolved) = tokio::fs::canonicalize(p).await {
        return Ok(resolved);
    }
    let parent = p
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .ok_or_else(|| format!("path has no parent directory: {}", path))?;
    let name = p
        .file_name()
        .ok_or_else(|| format!("path has no file name: {}", path))?;
    let parent_real = tokio::fs::canonicalize(parent)
        .await
        .map_err(|e| format!("cannot resolve parent of {}: {}", path, e))?;
    Ok(parent_real.join(name))
}

/// Resolve + authorise a write/edit target. Allowed only if it canonicalizes to
/// exactly the active document. Returns the canonical doc path on success, or a
/// tool-error string (fed back to the model) on rejection.
pub async fn resolve_writable(req: &AiSendRequest, path: &str) -> Result<std::path::PathBuf, String> {
    let doc = doc_path(req).ok_or_else(|| {
        "write rejected: there is no writable document for this chat (the file is unsaved).".to_string()
    })?;
    let doc_real = canonicalize_existing(doc).await.map_err(|_| {
        format!("write rejected: the active document {} could not be resolved on disk.", doc)
    })?;
    let target = canonicalize_target(path).await?;
    if target == doc_real {
        Ok(doc_real)
    } else {
        Err(format!(
            "write rejected: {} is outside the only writable target {}. You may only write to the active document.",
            path, doc
        ))
    }
}

/// Resolve + authorise a read target. Allowed when it lives under the active
/// document's directory or under any configured read path. Returns the
/// canonical read path on success, or a tool-error string on rejection.
pub async fn resolve_readable(req: &AiSendRequest, path: &str) -> Result<std::path::PathBuf, String> {
    let target = canonicalize_existing(path).await?;
    let mut roots: Vec<std::path::PathBuf> = Vec::new();
    if let Some(doc) = doc_path(req) {
        if let Ok(doc_real) = canonicalize_existing(doc).await {
            if let Some(parent) = doc_real.parent() {
                roots.push(parent.to_path_buf());
            }
        }
    }
    for rp in &req.access_map.read_paths {
        if rp.is_empty() {
            continue;
        }
        if let Ok(real) = canonicalize_existing(rp).await {
            roots.push(real);
        }
    }
    if roots.iter().any(|root| target.starts_with(root)) {
        Ok(target)
    } else {
        Err(format!(
            "read rejected: {} is outside the readable roots for this chat.",
            path
        ))
    }
}

fn str_arg<'a>(args: &'a serde_json::Value, key: &str) -> Result<&'a str, String> {
    args.get(key)
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("missing or non-string argument: {}", key))
}

/// Execute one tool call, enforcing access-map gating + path safety. Returns a
/// short human-readable result string for the tool-result message on success,
/// or an Err(String) describing the failure — which is fed back to the model as
/// the tool result so it can self-correct (never a hard abort).
pub async fn run_tool(
    req: &AiSendRequest,
    name: &str,
    args: &serde_json::Value,
) -> Result<String, String> {
    match name {
        "read_file" => {
            if !req.access_map.tools.file_read {
                return Err("read_file is not enabled for this chat.".to_string());
            }
            let path = str_arg(args, "path")?;
            let real = resolve_readable(req, path).await?;
            let meta = tokio::fs::metadata(&real)
                .await
                .map_err(|e| format!("read_file failed for {}: {}", path, e))?;
            if meta.is_dir() {
                return Err(format!(
                    "{} is a directory — call list_dir to see its contents.",
                    path
                ));
            }
            let content = tokio::fs::read_to_string(&real)
                .await
                .map_err(|e| format!("read_file failed for {}: {}", path, e))?;
            if content.len() > READ_FILE_CAP_BYTES {
                let mut end = READ_FILE_CAP_BYTES;
                while end > 0 && !content.is_char_boundary(end) {
                    end -= 1;
                }
                Ok(format!(
                    "{}\n\n[truncated: file is {} bytes, showing first {} bytes]",
                    &content[..end],
                    content.len(),
                    end
                ))
            } else {
                Ok(content)
            }
        }
        "list_dir" => {
            if !req.access_map.tools.file_read {
                return Err("list_dir is not enabled for this chat.".to_string());
            }
            let path = str_arg(args, "path")?;
            let real = resolve_readable(req, path).await?;
            let mut entries: Vec<(String, bool)> = Vec::new();
            let mut rd = tokio::fs::read_dir(&real)
                .await
                .map_err(|e| format!("list_dir failed for {}: {}", path, e))?;
            while let Some(entry) = rd
                .next_entry()
                .await
                .map_err(|e| format!("list_dir failed for {}: {}", path, e))?
            {
                let name = entry.file_name().to_string_lossy().to_string();
                let is_dir = match entry.file_type().await {
                    Ok(ft) => ft.is_dir(),
                    Err(_) => false,
                };
                entries.push((name, is_dir));
            }
            Ok(format_dir_listing(path, entries))
        }
        "write_file" => {
            if !req.access_map.tools.file_write {
                return Err("write_file is not enabled for this chat.".to_string());
            }
            let path = str_arg(args, "path")?;
            let content = str_arg(args, "content")?;
            let real = resolve_writable(req, path).await?;
            tokio::fs::write(&real, content.as_bytes())
                .await
                .map_err(|e| format!("write_file failed for {}: {}", path, e))?;
            Ok(format!("Wrote {} bytes to {}.", content.len(), path))
        }
        "edit_file" => {
            if !req.access_map.tools.file_write {
                return Err("edit_file is not enabled for this chat.".to_string());
            }
            let path = str_arg(args, "path")?;
            let old_string = str_arg(args, "old_string")?;
            let new_string = str_arg(args, "new_string")?;
            let real = resolve_writable(req, path).await?;
            let original = tokio::fs::read_to_string(&real)
                .await
                .map_err(|e| format!("edit_file failed to read {}: {}", path, e))?;
            let updated = apply_edit(&original, old_string, new_string)?;
            tokio::fs::write(&real, updated.as_bytes())
                .await
                .map_err(|e| format!("edit_file failed to write {}: {}", path, e))?;
            Ok(format!("Edited {} (1 replacement).", path))
        }
        other => Err(format!("unknown tool: {}", other)),
    }
}

/// Exact-substring single replace mirroring a safe Edit tool: `old_string` must
/// be present AND unique. Errors otherwise so the model is forced to supply
/// disambiguating context rather than silently editing the wrong occurrence.
pub fn apply_edit(content: &str, old_string: &str, new_string: &str) -> Result<String, String> {
    if old_string.is_empty() {
        return Err("edit_file: old_string must not be empty.".to_string());
    }
    let count = content.matches(old_string).count();
    match count {
        0 => Err("edit_file: old_string not found in the file.".to_string()),
        1 => Ok(content.replacen(old_string, new_string, 1)),
        n => Err(format!(
            "edit_file: old_string is not unique ({} matches). Include more surrounding context so it matches exactly once.",
            n
        )),
    }
}

/// Format a directory listing as a compact, deterministic text block: entries
/// sorted by name, directories suffixed with `/`, capped at
/// `LIST_DIR_MAX_ENTRIES` with a truncation note. Pure (disk-free) so the loop
/// and unit tests share one formatter.
pub fn format_dir_listing(path: &str, mut entries: Vec<(String, bool)>) -> String {
    entries.sort_by(|a, b| a.0.cmp(&b.0));
    let total = entries.len();
    let truncated = total > LIST_DIR_MAX_ENTRIES;
    if truncated {
        entries.truncate(LIST_DIR_MAX_ENTRIES);
    }
    let mut out = String::new();
    out.push_str(&format!("Contents of {} ({} entries):\n", path, total));
    if entries.is_empty() {
        out.push_str("(empty)");
        return out;
    }
    for (name, is_dir) in &entries {
        if *is_dir {
            out.push_str(&format!("{}/\n", name));
        } else {
            out.push_str(&format!("{}\n", name));
        }
    }
    if truncated {
        out.push_str(&format!(
            "[truncated: {} entries total, showing first {}]",
            total, LIST_DIR_MAX_ENTRIES
        ));
    }
    out.trim_end().to_string()
}

/// Select the most recent prior turns that fit the history budget, returning
/// references in chronological order. Walks from the newest backward, dropping
/// the OLDEST first once either `HISTORY_MAX_TURNS` or `HISTORY_MAX_CHARS` would
/// be exceeded, then restores chronological order.
pub fn trim_history(history: &[HistoryTurn]) -> Vec<&HistoryTurn> {
    let mut kept: Vec<&HistoryTurn> = Vec::new();
    let mut chars = 0usize;
    for turn in history.iter().rev() {
        if kept.len() >= HISTORY_MAX_TURNS {
            break;
        }
        let next = chars + turn.content.chars().count();
        if !kept.is_empty() && next > HISTORY_MAX_CHARS {
            break;
        }
        chars = next;
        kept.push(turn);
    }
    kept.reverse();
    kept
}

/// Parse tool calls out of a provider's assistant message, normalising the two
/// wire shapes:
///   - OpenAI: `message.tool_calls[].function.arguments` is a JSON STRING.
///   - Ollama: `message.tool_calls[].function.arguments` is already an OBJECT
///     and the call carries no id, so we synthesize an index-based one.
/// Tolerant: empty / unparseable arguments degrade to `{}` rather than dropping
/// the call, so a slightly malformed model emission still drives the loop.
pub fn parse_tool_calls(provider: CliKind, message: &serde_json::Value) -> Vec<PendingToolCall> {
    let Some(calls) = message.get("tool_calls").and_then(|c| c.as_array()) else {
        return Vec::new();
    };
    let mut out = Vec::with_capacity(calls.len());
    for (idx, call) in calls.iter().enumerate() {
        let func = match call.get("function") {
            Some(f) => f,
            None => continue,
        };
        let name = func
            .get("name")
            .and_then(|n| n.as_str())
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        let args = match func.get("arguments") {
            Some(serde_json::Value::String(s)) => {
                let trimmed = s.trim();
                if trimmed.is_empty() {
                    serde_json::json!({})
                } else {
                    serde_json::from_str(trimmed).unwrap_or_else(|_| serde_json::json!({}))
                }
            }
            Some(serde_json::Value::Object(o)) => serde_json::Value::Object(o.clone()),
            Some(other) => other.clone(),
            None => serde_json::json!({}),
        };
        let id = call
            .get("id")
            .and_then(|i| i.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("{}-call-{}", provider.as_str(), idx));
        out.push(PendingToolCall { id, name, args });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::types::{AccessMap, AccessMapTools};

    fn tools(read: bool, write: bool) -> AccessMapTools {
        AccessMapTools { bash: false, network: false, file_read: read, file_write: write }
    }

    fn req_for(map: AccessMap) -> AiSendRequest {
        AiSendRequest {
            cli: CliKind::Openai,
            session_id: None,
            model: None,
            effort: None,
            prompt: "hi".into(),
            preamble: String::new(),
            turn_context: String::new(),
            access_map: map,
            bypass: false,
            work_dir: String::new(),
            images: vec![],
            cli_path: None,
            history: vec![],
        }
    }

    #[test]
    fn tool_specs_gating_read_and_write() {
        let specs = tool_specs(&tools(true, true));
        let names: Vec<&str> = specs
            .iter()
            .map(|s| s["function"]["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, vec!["read_file", "list_dir", "write_file", "edit_file"]);
        for s in &specs {
            assert_eq!(s["type"], "function");
            assert_eq!(s["function"]["parameters"]["type"], "object");
            assert!(s["function"]["parameters"]["required"].is_array());
        }
    }

    #[test]
    fn tool_specs_write_off_exposes_only_read() {
        let specs = tool_specs(&tools(true, false));
        let names: Vec<&str> = specs
            .iter()
            .map(|s| s["function"]["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, vec!["read_file", "list_dir"]);
    }

    #[test]
    fn tool_specs_read_off_write_on_exposes_write_and_edit() {
        let specs = tool_specs(&tools(false, true));
        let names: Vec<&str> = specs
            .iter()
            .map(|s| s["function"]["name"].as_str().unwrap())
            .collect();
        assert_eq!(names, vec!["write_file", "edit_file"]);
    }

    #[test]
    fn tool_specs_both_off_is_empty() {
        assert!(tool_specs(&tools(false, false)).is_empty());
    }

    #[test]
    fn parse_tool_calls_openai_string_arguments() {
        let msg = serde_json::json!({
            "role": "assistant",
            "tool_calls": [{
                "id": "call_abc",
                "type": "function",
                "function": { "name": "read_file", "arguments": "{\"path\":\"/tmp/x.md\"}" }
            }]
        });
        let calls = parse_tool_calls(CliKind::Openai, &msg);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].id, "call_abc");
        assert_eq!(calls[0].name, "read_file");
        assert_eq!(calls[0].args["path"], "/tmp/x.md");
    }

    #[test]
    fn parse_tool_calls_openai_empty_string_arguments_degrade_to_object() {
        let msg = serde_json::json!({
            "tool_calls": [{
                "id": "c1",
                "function": { "name": "read_file", "arguments": "" }
            }]
        });
        let calls = parse_tool_calls(CliKind::Openai, &msg);
        assert_eq!(calls.len(), 1);
        assert!(calls[0].args.is_object());
    }

    #[test]
    fn parse_tool_calls_ollama_object_arguments_synthesizes_id() {
        let msg = serde_json::json!({
            "role": "assistant",
            "tool_calls": [{
                "function": { "name": "edit_file", "arguments": { "path": "/a", "old_string": "x", "new_string": "y" } }
            }]
        });
        let calls = parse_tool_calls(CliKind::Ollama, &msg);
        assert_eq!(calls.len(), 1);
        assert_eq!(calls[0].name, "edit_file");
        assert_eq!(calls[0].args["old_string"], "x");
        assert_eq!(calls[0].id, "ollama-call-0");
    }

    #[test]
    fn parse_tool_calls_no_tool_calls_is_empty() {
        let msg = serde_json::json!({ "role": "assistant", "content": "hello" });
        assert!(parse_tool_calls(CliKind::Openai, &msg).is_empty());
    }

    #[test]
    fn apply_edit_unique_replace_succeeds() {
        let out = apply_edit("alpha beta gamma", "beta", "BETA").unwrap();
        assert_eq!(out, "alpha BETA gamma");
    }

    #[test]
    fn apply_edit_missing_old_string_errors() {
        let err = apply_edit("alpha", "zzz", "x").unwrap_err();
        assert!(err.contains("not found"), "got: {}", err);
    }

    #[test]
    fn apply_edit_duplicate_old_string_errors_with_count() {
        let err = apply_edit("x x x", "x", "y").unwrap_err();
        assert!(err.contains("not unique"), "got: {}", err);
        assert!(err.contains("3 matches"), "got: {}", err);
    }

    #[tokio::test]
    async fn resolve_writable_allows_doc_rejects_sibling() {
        let dir = std::env::temp_dir().join(format!("mermark_ft_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let doc = dir.join("doc.md");
        let sibling = dir.join("other.md");
        tokio::fs::write(&doc, b"hello").await.unwrap();
        tokio::fs::write(&sibling, b"nope").await.unwrap();

        let map = AccessMap {
            read_paths: vec![doc.to_string_lossy().to_string()],
            write_paths: vec![doc.to_string_lossy().to_string()],
            tools: tools(true, true),
        };
        let req = req_for(map);

        assert!(resolve_writable(&req, &doc.to_string_lossy()).await.is_ok());
        let err = resolve_writable(&req, &sibling.to_string_lossy())
            .await
            .unwrap_err();
        assert!(err.contains("outside the only writable target"), "got: {}", err);

        // A `..` traversal back into the doc still resolves to the doc and is allowed;
        // a `..` escaping the dir is rejected.
        let escape = dir.join("..").join("escape.md");
        tokio::fs::write(dir.parent().unwrap().join("escape.md"), b"e").await.ok();
        let escape_err = resolve_writable(&req, &escape.to_string_lossy())
            .await
            .unwrap_err();
        assert!(escape_err.contains("outside the only writable target"), "got: {}", escape_err);

        tokio::fs::remove_dir_all(&dir).await.ok();
        tokio::fs::remove_file(dir.parent().unwrap().join("escape.md")).await.ok();
    }

    #[tokio::test]
    async fn resolve_readable_inside_dir_ok_outside_rejected() {
        let dir = std::env::temp_dir().join(format!("mermark_ft_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let doc = dir.join("doc.md");
        let note = dir.join("note.md");
        tokio::fs::write(&doc, b"hello").await.unwrap();
        tokio::fs::write(&note, b"note").await.unwrap();

        let map = AccessMap {
            read_paths: vec![doc.to_string_lossy().to_string()],
            write_paths: vec![doc.to_string_lossy().to_string()],
            tools: tools(true, true),
        };
        let req = req_for(map);

        assert!(resolve_readable(&req, &note.to_string_lossy()).await.is_ok());

        let outside = std::env::temp_dir().join(format!("mermark_outside_{}.md", uuid::Uuid::new_v4()));
        tokio::fs::write(&outside, b"x").await.unwrap();
        let err = resolve_readable(&req, &outside.to_string_lossy())
            .await
            .unwrap_err();
        assert!(err.contains("outside the readable roots"), "got: {}", err);

        tokio::fs::remove_dir_all(&dir).await.ok();
        tokio::fs::remove_file(&outside).await.ok();
    }

    #[tokio::test]
    async fn run_tool_edit_file_round_trips_on_disk() {
        let dir = std::env::temp_dir().join(format!("mermark_ft_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let doc = dir.join("doc.md");
        tokio::fs::write(&doc, b"# Title\n\nold body\n").await.unwrap();

        let map = AccessMap {
            read_paths: vec![doc.to_string_lossy().to_string()],
            write_paths: vec![doc.to_string_lossy().to_string()],
            tools: tools(true, true),
        };
        let req = req_for(map);

        let args = serde_json::json!({
            "path": doc.to_string_lossy(),
            "old_string": "old body",
            "new_string": "new body",
        });
        let result = run_tool(&req, "edit_file", &args).await.unwrap();
        assert!(result.contains("1 replacement"));
        let on_disk = tokio::fs::read_to_string(&doc).await.unwrap();
        assert_eq!(on_disk, "# Title\n\nnew body\n");

        tokio::fs::remove_dir_all(&dir).await.ok();
    }

    #[tokio::test]
    async fn run_tool_respects_disabled_write() {
        let dir = std::env::temp_dir().join(format!("mermark_ft_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let doc = dir.join("doc.md");
        tokio::fs::write(&doc, b"hello").await.unwrap();
        let map = AccessMap {
            read_paths: vec![doc.to_string_lossy().to_string()],
            write_paths: vec![doc.to_string_lossy().to_string()],
            tools: tools(true, false),
        };
        let req = req_for(map);
        let args = serde_json::json!({ "path": doc.to_string_lossy(), "content": "x" });
        let err = run_tool(&req, "write_file", &args).await.unwrap_err();
        assert!(err.contains("not enabled"), "got: {}", err);
        tokio::fs::remove_dir_all(&dir).await.ok();
    }

    #[test]
    fn max_tool_rounds_is_capped() {
        assert_eq!(MAX_TOOL_ROUNDS, 12);
    }

    fn hist(turns: &[(&str, &str)]) -> Vec<HistoryTurn> {
        turns
            .iter()
            .map(|(r, c)| HistoryTurn { role: r.to_string(), content: c.to_string() })
            .collect()
    }

    #[tokio::test]
    async fn run_tool_list_dir_lists_entries_and_marks_dirs() {
        let dir = std::env::temp_dir().join(format!("mermark_ld_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let doc = dir.join("doc.md");
        tokio::fs::write(&doc, b"hi").await.unwrap();
        tokio::fs::write(dir.join("note.md"), b"n").await.unwrap();
        tokio::fs::create_dir_all(dir.join("sub")).await.unwrap();

        let map = AccessMap {
            read_paths: vec![dir.to_string_lossy().to_string()],
            write_paths: vec![doc.to_string_lossy().to_string()],
            tools: tools(true, true),
        };
        let req = req_for(map);

        let args = serde_json::json!({ "path": dir.to_string_lossy() });
        let out = run_tool(&req, "list_dir", &args).await.unwrap();
        assert!(out.contains("doc.md"), "got: {}", out);
        assert!(out.contains("note.md"), "got: {}", out);
        assert!(out.contains("sub/"), "directory not marked with /: {}", out);

        tokio::fs::remove_dir_all(&dir).await.ok();
    }

    #[tokio::test]
    async fn run_tool_list_dir_rejects_outside_readable_roots() {
        let dir = std::env::temp_dir().join(format!("mermark_ld_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let doc = dir.join("doc.md");
        tokio::fs::write(&doc, b"hi").await.unwrap();
        let outside = std::env::temp_dir().join(format!("mermark_ld_out_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&outside).await.unwrap();

        let map = AccessMap {
            read_paths: vec![doc.to_string_lossy().to_string()],
            write_paths: vec![doc.to_string_lossy().to_string()],
            tools: tools(true, true),
        };
        let req = req_for(map);

        let args = serde_json::json!({ "path": outside.to_string_lossy() });
        let err = run_tool(&req, "list_dir", &args).await.unwrap_err();
        assert!(err.contains("outside the readable roots"), "got: {}", err);

        tokio::fs::remove_dir_all(&dir).await.ok();
        tokio::fs::remove_dir_all(&outside).await.ok();
    }

    #[tokio::test]
    async fn run_tool_read_file_on_directory_returns_friendly_error() {
        let dir = std::env::temp_dir().join(format!("mermark_rd_{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(&dir).await.unwrap();
        let doc = dir.join("doc.md");
        tokio::fs::write(&doc, b"hi").await.unwrap();

        let map = AccessMap {
            read_paths: vec![dir.to_string_lossy().to_string()],
            write_paths: vec![doc.to_string_lossy().to_string()],
            tools: tools(true, true),
        };
        let req = req_for(map);

        let args = serde_json::json!({ "path": dir.to_string_lossy() });
        let err = run_tool(&req, "read_file", &args).await.unwrap_err();
        assert!(err.contains("is a directory"), "got: {}", err);
        assert!(err.contains("list_dir"), "got: {}", err);
        assert!(!err.to_lowercase().contains("os error"), "OS error leaked: {}", err);

        tokio::fs::remove_dir_all(&dir).await.ok();
    }

    #[test]
    fn format_dir_listing_sorts_and_marks_dirs() {
        let out = format_dir_listing(
            "/d",
            vec![("z.md".into(), false), ("a".into(), true), ("m.md".into(), false)],
        );
        let body = out.lines().skip(1).collect::<Vec<_>>();
        assert_eq!(body, vec!["a/", "m.md", "z.md"]);
    }

    #[test]
    fn format_dir_listing_empty() {
        let out = format_dir_listing("/d", vec![]);
        assert!(out.contains("(empty)"), "got: {}", out);
    }

    #[test]
    fn format_dir_listing_truncates_past_cap_with_note() {
        let entries: Vec<(String, bool)> = (0..LIST_DIR_MAX_ENTRIES + 50)
            .map(|i| (format!("f{:04}.md", i), false))
            .collect();
        let out = format_dir_listing("/d", entries);
        assert!(out.contains("[truncated:"), "no truncation note: {}", out);
        assert!(out.contains(&(LIST_DIR_MAX_ENTRIES + 50).to_string()), "got: {}", out);
        let body_lines = out.lines().filter(|l| l.ends_with(".md")).count();
        assert_eq!(body_lines, LIST_DIR_MAX_ENTRIES);
    }

    #[test]
    fn trim_history_keeps_all_when_under_caps() {
        let h = hist(&[("user", "a"), ("assistant", "b"), ("user", "c")]);
        let kept: Vec<&str> = trim_history(&h).iter().map(|t| t.content.as_str()).collect();
        assert_eq!(kept, vec!["a", "b", "c"]);
    }

    #[test]
    fn trim_history_drops_oldest_past_turn_cap() {
        let mut raw: Vec<(&str, &str)> = Vec::new();
        for _ in 0..(HISTORY_MAX_TURNS + 5) {
            raw.push(("user", "x"));
        }
        let h = hist(&raw);
        let kept = trim_history(&h);
        assert_eq!(kept.len(), HISTORY_MAX_TURNS);
    }

    #[test]
    fn trim_history_drops_oldest_past_char_cap_and_preserves_order() {
        let big = "y".repeat(HISTORY_MAX_CHARS);
        let h = vec![
            HistoryTurn { role: "user".into(), content: "oldest".into() },
            HistoryTurn { role: "assistant".into(), content: big.clone() },
            HistoryTurn { role: "user".into(), content: "newest".into() },
        ];
        let kept = trim_history(&h);
        let contents: Vec<&str> = kept.iter().map(|t| t.content.as_str()).collect();
        assert!(!contents.contains(&"oldest"), "oldest not dropped: {:?}", contents.len());
        assert_eq!(*contents.last().unwrap(), "newest");
        let big_idx = contents.iter().position(|c| *c == big.as_str());
        let newest_idx = contents.iter().position(|c| *c == "newest");
        assert!(big_idx < newest_idx, "order not preserved");
    }
}
