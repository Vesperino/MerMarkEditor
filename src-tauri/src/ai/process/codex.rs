//! Codex spawn + flag construction.
//! Verified against `codex exec --help` and `codex exec resume --help`.
//!
//! FLAG DEVIATIONS FROM PLAN (Task B2 Step 1):
//!
//! 1. `--json` flag EXISTS on `codex exec` — confirmed. Plan was correct.
//!
//! 2. `--cd` flag: plan expected `--cd <workdir>`. Actual flag is `-C`/`--cd`.
//!    Long form `--cd` works; no change needed.
//!
//! 3. Bypass flag: plan expected `--full-auto`. Actual flag is
//!    `--dangerously-bypass-approvals-and-sandbox`. Updated below.
//!
//! 4. Resume: plan expected `codex exec --resume <id>`. Actual is
//!    `codex exec resume <session_id> [PROMPT]` (a subcommand of exec).
//!    Updated below to use the subcommand form.
//!
//! 5. CONCERN: `codex exec resume` does NOT support `--sandbox` or `--cd`.
//!    When resuming, sandbox mode and working dir cannot be overridden via CLI
//!    flags. Codex uses the persisted session config for resumed sessions.
//!    This is acceptable behaviour but should be documented for B2 follow-up.

use std::process::Stdio;
use tokio::process::{Child, Command};
use crate::ai::process::AiSendRequest;
use crate::ai::types::AccessMapTools;

const CMD: &str = "codex";

pub fn spawn(req: &AiSendRequest) -> Result<Child, String> {
    let mut cmd = Command::new(CMD);

    if let Some(sid) = &req.session_id {
        // Resume path: `codex exec resume <session_id> [PROMPT]`
        // Note: --sandbox and --cd are NOT supported on the resume subcommand;
        // codex reuses the persisted session configuration.
        cmd.arg("exec")
            .arg("--json")
            .arg("resume")
            .arg(sid);
        if req.bypass {
            cmd.arg("--dangerously-bypass-approvals-and-sandbox");
        }
        cmd.arg(format!("{}\n\n{}", req.preamble, req.prompt));
    } else {
        // New session path: `codex exec --json --cd <workdir> [--model <id>] --sandbox <mode> [--dangerously-bypass-approvals-and-sandbox] -- <prompt>`
        cmd.arg("exec")
            .arg("--json")
            .arg("--cd").arg(&req.work_dir);
        if let Some(model) = &req.model {
            cmd.arg("--model").arg(model);
        }
        if let Some(effort) = &req.effort {
            cmd.arg("-c").arg(format!("model_reasoning_effort={}", effort));
        }
        cmd.arg("--sandbox").arg(sandbox_mode(&req.access_map.tools, req.bypass));
        if req.bypass {
            cmd.arg("--dangerously-bypass-approvals-and-sandbox");
        }
        cmd.arg("--").arg(format!("{}\n\n{}", req.preamble, req.prompt));
    }

    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.spawn().map_err(|e| e.to_string())
}

fn sandbox_mode(tools: &AccessMapTools, bypass: bool) -> &'static str {
    if bypass && tools.bash { "danger-full-access" }
    else if tools.file_write { "workspace-write" }
    else if tools.file_read { "read-only" }
    else { "read-only" }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sandbox_mode_defaults_to_read_only() {
        let t = AccessMapTools::default();
        assert_eq!(sandbox_mode(&t, false), "read-only");
    }

    #[test]
    fn sandbox_mode_with_file_write_is_workspace_write() {
        let t = AccessMapTools { file_write: true, ..AccessMapTools::default() };
        assert_eq!(sandbox_mode(&t, false), "workspace-write");
    }

    #[test]
    fn sandbox_mode_bypass_with_bash_is_danger_full_access() {
        let t = AccessMapTools { bash: true, ..AccessMapTools::default() };
        assert_eq!(sandbox_mode(&t, true), "danger-full-access");
    }
}
