//! Newest published version of the Claude Code / Codex CLIs and running their
//! own `update` command. Both CLIs ship on npm, which serves the latest
//! version even for native installs, so one lookup covers every install kind.

use std::time::Duration;
use crate::ai::types::CliKind;

fn npm_package(cli: CliKind) -> Option<&'static str> {
    match cli {
        CliKind::Claude => Some("@anthropic-ai/claude-code"),
        CliKind::Codex => Some("@openai/codex"),
        _ => None,
    }
}

pub async fn latest_version(cli: CliKind) -> Result<String, String> {
    let package = npm_package(cli).ok_or("No update source for this provider")?;
    let client = crate::ai::process::http_client(Some(Duration::from_secs(10)));
    let manifest: serde_json::Value = client
        .get(format!("https://registry.npmjs.org/{package}/latest"))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .error_for_status()
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;
    manifest
        .get("version")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .ok_or_else(|| "Registry response has no version".to_string())
}

/// Run `<cli> update`. Downloads can take a while on slow links.
pub async fn run_update(cli: CliKind, cli_path: Option<&str>) -> Result<String, String> {
    let (ok, out, err) = match cli {
        CliKind::Claude => crate::ai::health::claude::run_capture(cli_path, &["update"], 600).await?,
        CliKind::Codex => crate::ai::health::codex::run_capture(cli_path, &["update"], 600).await?,
        _ => return Err("No update command for this provider".into()),
    };
    let output = format!("{}\n{}", out.trim(), err.trim()).trim().to_string();
    if ok { Ok(output) } else { Err(output) }
}
