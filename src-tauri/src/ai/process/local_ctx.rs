//! Context-window detection for the local HTTP providers (ollama, openai).
//!
//! Neither local API advertises the runtime window in its streamed usage
//! payload, so the frontend would otherwise fall back to a hardcoded default.
//! This module resolves the real window once per (base_url, model) pair —
//! cached in memory for the process lifetime — and injects it into the Done
//! usage as `model` + `modelUsage.{model}.contextWindow`, the same shape
//! claude/codex emit (#99), so the frontend lift works unchanged.
//!
//! Ollama: `POST /api/show` returns `model_info` (a GGUF KV map) whose context
//! length key is ARCHITECTURE-PREFIXED (`{arch}.context_length` where arch =
//! `model_info["general.architecture"]`), plus a `capabilities` string array
//! that gates tool calling. The TRAINED context is not what you get at runtime
//! — the server window is `num_ctx` (default 4096), so we send
//! `options.num_ctx` explicitly and report min(num_ctx, trained).
//!
//! OpenAI-compatible: no standard field. Detection chain, first hit wins,
//! every failure tolerated (3 s timeout each):
//!   1. GET /v1/models      — `max_model_len` (vLLM) or `meta.n_ctx_train` (llama.cpp)
//!   2. GET /props          — `default_generation_settings.n_ctx` / `n_ctx` (llama.cpp)
//!   3. GET /api/v0/models  — `loaded_context_length` / `max_context_length` (LM Studio)

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use crate::ai::types::AiResponseChunk;

/// Runtime window requested when the frontend sends none. Matches the
/// frontend's DEFAULT_CONTEXT_WINDOW.ollama fallback.
pub const DEFAULT_NUM_CTX: u64 = 8192;

#[derive(Debug, Clone)]
pub struct OllamaShowInfo {
    /// Trained context length from model_info, when present.
    pub trained_ctx: Option<u64>,
    /// `capabilities` array; None when the server predates the field, in which
    /// case tool gating stays permissive.
    pub capabilities: Option<Vec<String>>,
}

static OLLAMA_SHOW_CACHE: OnceLock<Mutex<HashMap<(String, String), OllamaShowInfo>>> =
    OnceLock::new();
static OPENAI_WINDOW_CACHE: OnceLock<Mutex<HashMap<(String, String), Option<u64>>>> =
    OnceLock::new();

/// Parse an `/api/show` response. The context length lives in `model_info`
/// under the architecture-prefixed key; when the arch lookup misses, scan for
/// any key ending in `.context_length`.
pub fn parse_ollama_show(v: &serde_json::Value) -> OllamaShowInfo {
    let info = v.get("model_info").and_then(|m| m.as_object());
    let trained_ctx = info.and_then(|m| {
        if let Some(arch) = m.get("general.architecture").and_then(|a| a.as_str()) {
            if let Some(n) = m
                .get(&format!("{}.context_length", arch))
                .and_then(|n| n.as_u64())
            {
                return Some(n);
            }
        }
        m.iter()
            .find(|(k, _)| k.ends_with(".context_length"))
            .and_then(|(_, val)| val.as_u64())
    });
    let capabilities = v.get("capabilities").and_then(|c| c.as_array()).map(|arr| {
        arr.iter()
            .filter_map(|s| s.as_str())
            .map(|s| s.to_string())
            .collect()
    });
    OllamaShowInfo { trained_ctx, capabilities }
}

/// Fetch + cache `/api/show` for (base, model). Only successes are cached so a
/// stopped server is retried on the next send; a failure returns None and the
/// caller skips window injection (frontend default stays).
pub async fn ollama_show(base: &str, model: &str) -> Option<OllamaShowInfo> {
    if model.is_empty() {
        return None;
    }
    let key = (base.to_string(), model.to_string());
    let cache = OLLAMA_SHOW_CACHE.get_or_init(Default::default);
    if let Some(hit) = cache.lock().unwrap().get(&key) {
        return Some(hit.clone());
    }
    let url = format!("{}/api/show", base);
    let client = crate::ai::process::http_client(Some(std::time::Duration::from_secs(5)));
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "model": model }))
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    let info = parse_ollama_show(&v);
    cache.lock().unwrap().insert(key, info.clone());
    Some(info)
}

/// The num_ctx actually sent on /api/chat: the user setting (default 8192)
/// capped at the model's trained context when known — asking Ollama for more
/// than the model was trained on just wastes RAM.
pub fn effective_num_ctx(requested: Option<u64>, trained: Option<u64>) -> u64 {
    let req = requested.filter(|n| *n > 0).unwrap_or(DEFAULT_NUM_CTX);
    match trained {
        Some(t) if t > 0 => req.min(t),
        _ => req,
    }
}

/// Tool gating: a model whose `/api/show` capabilities omit "tools" would 400
/// (or hallucinate tool syntax) when offered function specs. Unknown
/// capabilities (show failed, or pre-capabilities server) stay permissive.
pub fn tools_capable(show: Option<&OllamaShowInfo>) -> bool {
    match show.and_then(|s| s.capabilities.as_ref()) {
        Some(caps) => caps.iter().any(|c| c == "tools"),
        None => true,
    }
}

/// `/v1/models` entry for the model: vLLM exposes `max_model_len`, llama.cpp
/// exposes `meta.n_ctx_train`.
pub fn window_from_v1_models(v: &serde_json::Value, model: &str) -> Option<u64> {
    let entry = v
        .get("data")?
        .as_array()?
        .iter()
        .find(|m| m.get("id").and_then(|i| i.as_str()) == Some(model))?;
    entry
        .get("max_model_len")
        .and_then(|n| n.as_u64())
        .or_else(|| entry.pointer("/meta/n_ctx_train").and_then(|n| n.as_u64()))
}

/// llama.cpp `GET /props`: the actual serving window is
/// `default_generation_settings.n_ctx` (top-level `n_ctx` on older builds).
pub fn window_from_props(v: &serde_json::Value) -> Option<u64> {
    v.pointer("/default_generation_settings/n_ctx")
        .and_then(|n| n.as_u64())
        .or_else(|| v.get("n_ctx").and_then(|n| n.as_u64()))
}

/// LM Studio `GET /api/v0/models`: prefer `loaded_context_length` (the window
/// the model is actually loaded with) over `max_context_length` (its maximum).
pub fn window_from_lmstudio_models(v: &serde_json::Value, model: &str) -> Option<u64> {
    let entry = v
        .get("data")?
        .as_array()?
        .iter()
        .find(|m| m.get("id").and_then(|i| i.as_str()) == Some(model))?;
    entry
        .get("loaded_context_length")
        .and_then(|n| n.as_u64())
        .or_else(|| entry.get("max_context_length").and_then(|n| n.as_u64()))
}

/// Ok(Some) — parsed body; Ok(None) — the server answered but the response was
/// unusable (non-2xx or bad JSON); Err(()) — no HTTP response at all
/// (connect/timeout). The distinction drives the cache policy below.
async fn get_json(client: &reqwest::Client, url: &str) -> Result<Option<serde_json::Value>, ()> {
    let resp = client.get(url).send().await.map_err(|_| ())?;
    if !resp.status().is_success() {
        return Ok(None);
    }
    Ok(resp.json().await.ok())
}

/// Run the OpenAI-compatible detection chain for (base, model). The outcome —
/// including a miss — is cached so a metadata-less server doesn't cost three
/// probe requests on every send. A miss is only cached when at least one probe
/// got an HTTP response: when the server was simply down, caching the miss
/// would pin the frontend default for the process lifetime even after the
/// server comes back up, so we retry on the next send instead.
pub async fn openai_context_window(base: &str, model: &str) -> Option<u64> {
    if model.is_empty() {
        return None;
    }
    let key = (base.to_string(), model.to_string());
    let cache = OPENAI_WINDOW_CACHE.get_or_init(Default::default);
    if let Some(hit) = cache.lock().unwrap().get(&key) {
        return *hit;
    }
    let client = crate::ai::process::http_client(Some(std::time::Duration::from_secs(3)));
    let mut responded = false;
    let mut probe = |res: Result<Option<serde_json::Value>, ()>| {
        match res {
            Ok(v) => {
                responded = true;
                v
            }
            Err(()) => None,
        }
    };
    let mut found = probe(get_json(&client, &format!("{}/v1/models", base)).await)
        .and_then(|v| window_from_v1_models(&v, model));
    if found.is_none() {
        found = probe(get_json(&client, &format!("{}/props", base)).await)
            .and_then(|v| window_from_props(&v));
    }
    if found.is_none() {
        found = probe(get_json(&client, &format!("{}/api/v0/models", base)).await)
            .and_then(|v| window_from_lmstudio_models(&v, model));
    }
    let found = found.filter(|n| *n > 0);
    if responded {
        cache.lock().unwrap().insert(key, found);
    }
    found
}

/// Inject `model` + `modelUsage.{model}.contextWindow` into a Done chunk's
/// usage (creating the usage object when the chunk carried none), mirroring
/// the claude/codex Done shape the frontend lifts the window from. Non-Done
/// chunks and unknown windows pass through untouched.
pub fn inject_into_done(
    chunk: AiResponseChunk,
    model: &str,
    window: Option<u64>,
) -> AiResponseChunk {
    let (Some(window), false) = (window, model.is_empty()) else {
        return chunk;
    };
    match chunk {
        AiResponseChunk::Done { session_id, usage } => {
            let mut u = usage.unwrap_or_else(|| serde_json::json!({}));
            if let Some(obj) = u.as_object_mut() {
                obj.insert("model".to_string(), serde_json::Value::String(model.to_string()));
                obj.insert(
                    "modelUsage".to_string(),
                    serde_json::json!({ (model): { "contextWindow": window } }),
                );
            }
            AiResponseChunk::Done { session_id, usage: Some(u) }
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_show_reads_arch_prefixed_context_length() {
        let v = serde_json::json!({
            "model_info": {
                "general.architecture": "llama",
                "llama.context_length": 131072,
                "qwen2.context_length": 999
            },
            "capabilities": ["completion", "tools"]
        });
        let info = parse_ollama_show(&v);
        assert_eq!(info.trained_ctx, Some(131072));
        assert_eq!(info.capabilities.as_deref(), Some(&["completion".to_string(), "tools".to_string()][..]));
    }

    #[test]
    fn parse_show_scans_for_any_context_length_suffix_when_arch_misses() {
        let v = serde_json::json!({
            "model_info": {
                "general.architecture": "gemma3",
                "gemma.context_length": 32768
            }
        });
        let info = parse_ollama_show(&v);
        assert_eq!(info.trained_ctx, Some(32768));
        assert!(info.capabilities.is_none());
    }

    #[test]
    fn parse_show_without_model_info_yields_none() {
        let info = parse_ollama_show(&serde_json::json!({ "capabilities": ["completion"] }));
        assert_eq!(info.trained_ctx, None);
        assert_eq!(info.capabilities.as_deref(), Some(&["completion".to_string()][..]));
    }

    #[test]
    fn effective_num_ctx_caps_at_trained() {
        assert_eq!(effective_num_ctx(Some(16384), Some(8192)), 8192);
        assert_eq!(effective_num_ctx(Some(4096), Some(8192)), 4096);
    }

    #[test]
    fn effective_num_ctx_defaults_and_tolerates_unknown_trained() {
        assert_eq!(effective_num_ctx(None, None), DEFAULT_NUM_CTX);
        assert_eq!(effective_num_ctx(Some(0), None), DEFAULT_NUM_CTX);
        assert_eq!(effective_num_ctx(Some(32768), None), 32768);
        assert_eq!(effective_num_ctx(None, Some(4096)), 4096);
        assert_eq!(effective_num_ctx(Some(16384), Some(0)), 16384);
    }

    fn show(trained: Option<u64>, caps: Option<&[&str]>) -> OllamaShowInfo {
        OllamaShowInfo {
            trained_ctx: trained,
            capabilities: caps.map(|c| c.iter().map(|s| s.to_string()).collect()),
        }
    }

    #[test]
    fn tools_capable_gates_on_capabilities() {
        assert!(tools_capable(Some(&show(None, Some(&["completion", "tools"])))));
        assert!(!tools_capable(Some(&show(None, Some(&["completion", "vision"])))));
        assert!(!tools_capable(Some(&show(None, Some(&[])))));
    }

    #[test]
    fn tools_capable_is_permissive_when_unknown() {
        assert!(tools_capable(None));
        assert!(tools_capable(Some(&show(Some(8192), None))));
    }

    #[test]
    fn v1_models_prefers_max_model_len_then_meta_n_ctx_train() {
        let vllm = serde_json::json!({
            "data": [
                { "id": "other", "max_model_len": 1 },
                { "id": "qwen3.5", "max_model_len": 40960 }
            ]
        });
        assert_eq!(window_from_v1_models(&vllm, "qwen3.5"), Some(40960));

        let llamacpp = serde_json::json!({
            "data": [{ "id": "qwen3.5", "meta": { "n_ctx_train": 131072, "n_embd": 4096 } }]
        });
        assert_eq!(window_from_v1_models(&llamacpp, "qwen3.5"), Some(131072));
    }

    #[test]
    fn v1_models_misses_unknown_model_or_fields() {
        let v = serde_json::json!({ "data": [{ "id": "qwen3.5" }] });
        assert_eq!(window_from_v1_models(&v, "qwen3.5"), None);
        assert_eq!(window_from_v1_models(&v, "absent"), None);
        assert_eq!(window_from_v1_models(&serde_json::json!({}), "qwen3.5"), None);
    }

    #[test]
    fn props_reads_default_generation_settings_then_top_level() {
        let nested = serde_json::json!({ "default_generation_settings": { "n_ctx": 8192 } });
        assert_eq!(window_from_props(&nested), Some(8192));
        let flat = serde_json::json!({ "n_ctx": 4096 });
        assert_eq!(window_from_props(&flat), Some(4096));
        assert_eq!(window_from_props(&serde_json::json!({})), None);
    }

    #[test]
    fn lmstudio_prefers_loaded_over_max_context_length() {
        let v = serde_json::json!({
            "data": [{
                "id": "qwen/qwen3-4b",
                "max_context_length": 262144,
                "loaded_context_length": 8192
            }]
        });
        assert_eq!(window_from_lmstudio_models(&v, "qwen/qwen3-4b"), Some(8192));

        let unloaded = serde_json::json!({
            "data": [{ "id": "qwen/qwen3-4b", "max_context_length": 262144 }]
        });
        assert_eq!(window_from_lmstudio_models(&unloaded, "qwen/qwen3-4b"), Some(262144));
        assert_eq!(window_from_lmstudio_models(&unloaded, "absent"), None);
    }

    #[test]
    fn inject_into_done_adds_model_and_window_to_existing_usage() {
        let done = AiResponseChunk::Done {
            session_id: String::new(),
            usage: Some(serde_json::json!({ "input_tokens": 10, "output_tokens": 2 })),
        };
        match inject_into_done(done, "llama3:8b", Some(8192)) {
            AiResponseChunk::Done { usage, .. } => {
                let u = usage.unwrap();
                assert_eq!(u["model"], "llama3:8b");
                assert_eq!(u.pointer("/modelUsage/llama3:8b/contextWindow").and_then(|n| n.as_u64()), Some(8192));
                assert_eq!(u["input_tokens"], 10);
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn inject_into_done_creates_usage_when_none() {
        let done = AiResponseChunk::Done { session_id: "s".into(), usage: None };
        match inject_into_done(done, "m", Some(4096)) {
            AiResponseChunk::Done { usage, .. } => {
                let u = usage.unwrap();
                assert_eq!(u.pointer("/modelUsage/m/contextWindow").and_then(|n| n.as_u64()), Some(4096));
            }
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn inject_into_done_passes_through_without_window_or_model() {
        let done = AiResponseChunk::Done {
            session_id: String::new(),
            usage: Some(serde_json::json!({ "input_tokens": 1 })),
        };
        match inject_into_done(done, "m", None) {
            AiResponseChunk::Done { usage, .. } => {
                assert!(usage.unwrap().get("modelUsage").is_none());
            }
            _ => panic!("wrong variant"),
        }
        let done = AiResponseChunk::Done { session_id: String::new(), usage: None };
        match inject_into_done(done, "", Some(8192)) {
            AiResponseChunk::Done { usage, .. } => assert!(usage.is_none()),
            _ => panic!("wrong variant"),
        }
    }

    #[test]
    fn inject_into_done_leaves_other_chunks_untouched() {
        let text = AiResponseChunk::Text { content: "hi".into() };
        match inject_into_done(text, "m", Some(8192)) {
            AiResponseChunk::Text { content } => assert_eq!(content, "hi"),
            _ => panic!("wrong variant"),
        }
    }
}
