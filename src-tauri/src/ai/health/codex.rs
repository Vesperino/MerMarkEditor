//! Codex health probe.
//!
//! Verified locally on 2026-05-05 with codex-cli v0.128.0.
//!
//! Commands used:
//!   - `codex --version`      → binary detect + version string (exit 0, 5 s timeout).
//!   - `codex login status`   → auth probe (exit 0, 10 s timeout). Confirmed present:
//!                              `codex login --help` shows "status  Show login status".
//!                              Live test output: "Logged in using ChatGPT" (exit 0).
//!
//! Auth output format observed: single line "Logged in using <provider>".
//! parse_account scrapes "Logged in as:", "Account:", or "User:" patterns as a
//! best-effort extraction; the simple "Logged in using …" form is captured via
//! the "logged in" keyword without requiring a colon.

use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};
use crate::ai::types::HealthStatus;
use crate::ai::cli;

const CMD: &str = "codex";

pub async fn probe(override_path: Option<&str>) -> HealthStatus {
    let manual = override_path.map(cli::normalize_override).filter(|s| !s.is_empty());
    let paths = if let Some(path) = manual { vec![std::path::PathBuf::from(path)] } else { cli::candidates(CMD) };
    let mut failure = HealthStatus { ok: false, version: None, account: None,
        error: Some("Codex CLI not found. Select its .exe or .cmd file manually.".into()), resolved_path: None };
    for path in paths.into_iter().take(12) {
        let path = path.to_string_lossy().into_owned();
        failure.resolved_path = Some(path.clone());
        if cli::is_desktop_launcher(std::path::Path::new(&path)) {
            failure.error = Some("Selected file is the desktop app launcher. Choose Codex CLI from OpenAI/Codex/bin instead.".into());
            continue;
        }
        if !std::path::Path::new(&path).is_file() {
            failure.error = Some("Selected CLI file does not exist. Check the custom binary path.".into());
            continue;
        }
        let version = match run_capture(Some(&path), &["--version"], 5).await {
            Ok((true, out, err)) => {
                match cli_version(&out).or_else(|| cli_version(&err)) {
                    Some(version) => version,
                    None => { failure.error = Some("Selected program is not Codex CLI (--version did not report codex-cli).".into()); continue; }
                }
            }
            Ok((false, _, err)) => { failure.error = Some(format!("CLI version check failed: {}", err.trim())); continue; }
            Err(error) => { failure.error = Some(format!("Cannot run Codex CLI: {error}")); continue; }
        };
        return probe_auth(&path, version).await;
    }
    failure
}

fn cli_version(output: &str) -> Option<String> {
    output.lines().map(str::trim).find(|line| line.starts_with("codex-cli ") && line[10..].starts_with(|c: char| c.is_ascii_digit())).map(str::to_string)
}

async fn probe_auth(path: &str, version: String) -> HealthStatus {
    let resolved_path = Some(path.to_string());
    let version = Some(version);
    let auth = run_capture(Some(path), &["login", "status"], 10).await;
    match auth {
        Ok((true, out, err)) => HealthStatus {
            ok: true,
            version,
            account: parse_account(&out).or_else(|| parse_account(&err)),
            error: None,
            resolved_path,
        },
        Ok((false, out, err)) => HealthStatus {
            ok: false,
            version,
            account: None,
            error: Some(format!("Authentication required: {}", if err.is_empty() { out } else { err })),
            resolved_path,
        },
        Err(e) => HealthStatus {
            ok: false,
            version,
            account: None,
            error: Some(e),
            resolved_path,
        },
    }
}

fn parse_account(out: &str) -> Option<String> {
    for line in out.lines() {
        let trimmed = line.trim_start();
        let lower = trimmed.to_ascii_lowercase();
        if lower.starts_with("logged in as:")
            || lower.starts_with("account:")
            || lower.starts_with("user:")
        {
            return trimmed.splitn(2, ':').nth(1).map(|v| v.trim().to_string());
        }
        // Handle "Logged in using <provider>" (no colon after the value).
        if lower.starts_with("logged in") {
            return Some(trimmed.to_string());
        }
    }
    None
}

async fn run_capture(
    override_path: Option<&str>,
    args: &[&str],
    timeout_secs: u64,
) -> Result<(bool, String, String), String> {
    let fut = async {
        let mut cmd = Command::new(cli::resolve_with_override(CMD, override_path));
        cmd.args(args)
            .kill_on_drop(true)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());
        cli::hide_console(&mut cmd);
        let out = cmd
            .output()
            .await
            .map_err(|e| e.to_string())?;
        Ok::<_, String>((
            out.status.success(),
            String::from_utf8_lossy(&out.stdout).into_owned(),
            String::from_utf8_lossy(&out.stderr).into_owned(),
        ))
    };
    timeout(Duration::from_secs(timeout_secs), fut)
        .await
        .map_err(|_| "Timeout".to_string())?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_cli_version_but_not_desktop_version() {
        assert_eq!(cli_version("codex-cli 0.151.0-alpha.7.2\n"), Some("codex-cli 0.151.0-alpha.7.2".into()));
        assert_eq!(cli_version("26.825.6671.0"), None);
        assert_eq!(cli_version("codex-cli "), None);
    }

    #[tokio::test]
    async fn reports_missing_custom_path_without_fallback() {
        let status = probe(Some("missing/custom/codex.exe")).await;
        assert!(!status.ok);
        assert!(status.error.unwrap().contains("does not exist"));
    }

    #[tokio::test]
    async fn rejects_desktop_launcher_without_starting_it() {
        let status = probe(Some(r"C:\Program Files\WindowsApps\OpenAI.Codex_26\app\Codex.exe")).await;
        assert!(!status.ok);
        assert!(status.error.unwrap().contains("desktop app launcher"));
    }

    #[test]
    fn parse_account_extracts_value_after_colon() {
        let out = "Logged in as: alice";
        assert_eq!(parse_account(out), Some("alice".into()));
    }

    #[test]
    fn parse_account_handles_logged_in_using_format() {
        let out = "Logged in using ChatGPT";
        assert_eq!(parse_account(out), Some("Logged in using ChatGPT".into()));
    }

    #[test]
    fn parse_account_ignores_user_in_unrelated_context() {
        assert_eq!(parse_account("Run codex --user-config: see docs"), None);
        assert_eq!(parse_account("Account status: ok"), None);
    }
}
