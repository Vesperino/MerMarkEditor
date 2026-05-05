//! Claude Code health probe.
//!
//! Verified locally on 2026-05-05 with claude v2.1.122 (Claude Code).
//!
//! Commands used:
//!   - `claude --version`  → binary detect + version string (exit 0, 5 s timeout).
//!   - `claude doctor`     → optional auth / environment probe (exit 0 when healthy,
//!                           10 s timeout). Confirmed present: `claude doctor --help`
//!                           shows "Check the health of your Claude Code auto-updater."
//!
//! Auth-fallback rationale: Claude Code holds credentials in the OS keychain /
//! browser OAuth session; there is no clean "logged in?" CLI probe short of
//! making a real API request (which we want to avoid). If `claude doctor` exits
//! non-zero or is unavailable, we degrade gracefully: binary is confirmed,
//! auth state is treated as unknown, and `ok` is still `true` so the UI does
//! not block the user unnecessarily.

use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};
use crate::ai::types::HealthStatus;

const CMD: &str = "claude";

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
    // Optional dedicated auth probe (claude doctor). If unavailable, treat
    // version-success as healthy — Claude Code holds its credential in the
    // browser session; we can't probe auth without making a real request.
    let auth = run_capture(&["doctor"], 10).await;
    match auth {
        Ok((true, out, _)) => {
            let account = parse_account(&out);
            HealthStatus { ok: true, version, account, error: None }
        }
        Ok((false, _, _)) | Err(_) => {
            // Doctor subcommand missing or auth failed — degrade gracefully:
            // binary works, auth state unknown. Surface as healthy with no account.
            HealthStatus { ok: true, version, account: None, error: None }
        }
    }
}

fn parse_account(out: &str) -> Option<String> {
    for line in out.lines() {
        let trimmed = line.trim_start();
        let lower = trimmed.to_ascii_lowercase();
        if lower.starts_with("account:") || lower.starts_with("logged in as:") {
            return trimmed.splitn(2, ':').nth(1).map(|v| v.trim().to_string());
        }
    }
    None
}

async fn run_capture(
    args: &[&str],
    timeout_secs: u64,
) -> Result<(bool, String, String), String> {
    let fut = async {
        let out = Command::new(CMD)
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
    fn parse_account_extracts_email_after_colon() {
        let out = "Status: OK\nAccount: user@example.com\nVersion: 1.2.3";
        assert_eq!(parse_account(out), Some("user@example.com".into()));
    }

    #[test]
    fn parse_account_returns_none_when_absent() {
        assert_eq!(parse_account("nothing here"), None);
    }

    #[test]
    fn parse_account_ignores_account_status_substring() {
        // Sentence containing 'account' must not falsely match.
        assert_eq!(parse_account("Account status: ok"), None);
        assert_eq!(parse_account("Use 'claude account' to switch"), None);
    }
}
