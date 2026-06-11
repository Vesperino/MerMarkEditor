//! OpenAI-compatible health probe.
//!
//! Local OpenAI-compatible servers (llama.cpp `llama-server`, LM Studio, vLLM,
//! …) answer `GET {base}/v1/models` with 200 whenever they are up, so we use it
//! as the liveness check. A connection error (server not running) degrades to
//! `ok: false` with a clear message so the UI shows "unavailable" rather than a
//! confusing auth/binary fallback.

use std::time::Duration;
use crate::ai::process::openai::DEFAULT_BASE_URL;
use crate::ai::types::HealthStatus;

pub async fn probe(base_url: Option<&str>) -> HealthStatus {
    let base = base_url
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_BASE_URL)
        .trim_end_matches('/')
        .to_string();
    // Avoid a duplicate /v1 when the user already typed a /v1-suffixed base.
    let base = base.strip_suffix("/v1").map(|b| b.to_string()).unwrap_or(base);
    let url = format!("{}/v1/models", base);

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(3))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            return unavailable(&base, e.to_string());
        }
    };

    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            let count = resp
                .json::<serde_json::Value>()
                .await
                .ok()
                .map(|v| crate::ai::process::normalizer::parse_openai_models(&v).len())
                .unwrap_or(0);
            HealthStatus {
                ok: true,
                version: Some(format!("{} model{}", count, if count == 1 { "" } else { "s" })),
                account: None,
                error: None,
                resolved_path: Some(base),
            }
        }
        Ok(resp) => unavailable(&base, format!("HTTP {}", resp.status().as_u16())),
        Err(_) => unavailable(
            &base,
            "Not running — start your local server or check the base URL.".to_string(),
        ),
    }
}

fn unavailable(base: &str, error: String) -> HealthStatus {
    HealthStatus {
        ok: false,
        version: None,
        account: None,
        error: Some(error),
        resolved_path: Some(base.to_string()),
    }
}
