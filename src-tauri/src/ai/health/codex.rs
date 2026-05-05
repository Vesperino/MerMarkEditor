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

pub async fn probe() -> HealthStatus {
    let version = match run_capture(&["--version"], 5).await {
        Ok((true, out, _)) => Some(out.trim().to_string()),
        _ => {
            return HealthStatus {
                ok: false,
                version: None,
                account: None,
                error: Some("Binary not found".into()),
            }
        }
    };
    let auth = run_capture(&["login", "status"], 10).await;
    match auth {
        Ok((true, out, _)) => {
            HealthStatus { ok: true, version, account: parse_account(&out), error: None }
        }
        Ok((false, _, err)) => HealthStatus {
            ok: false,
            version,
            account: None,
            error: Some(if err.is_empty() { "Authentication required".into() } else { err }),
        },
        Err(e) => HealthStatus { ok: false, version, account: None, error: Some(e) },
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
    args: &[&str],
    timeout_secs: u64,
) -> Result<(bool, String, String), String> {
    let fut = async {
        let out = Command::new(cli::resolve(CMD))
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
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
