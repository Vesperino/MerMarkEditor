//! Claude spawn + flag construction.
//! Verified against `claude --help` (claude v2.x / Claude Code CLI).
//!
//! FLAG VERIFICATION NOTES (Task B2 Step 1):
//!   -p / --print          : confirmed (non-interactive headless mode)
//!   --output-format       : confirmed, choices: text | json | stream-json
//!   --append-system-prompt: confirmed
//!   --allowedTools        : confirmed (also accepts --allowed-tools)
//!   --permission-mode     : confirmed, choices include bypassPermissions | default
//!   -r / --resume         : confirmed (flag, not positional subcommand)
//!
//! No deviations from the plan.

use std::process::Stdio;
use tokio::process::{Child, Command};
use crate::ai::process::AiSendRequest;
use crate::ai::types::AccessMapTools;

const CMD: &str = "claude";

pub fn spawn(req: &AiSendRequest) -> Result<Child, String> {
    let mut cmd = Command::new(CMD);
    cmd.arg("-p")
        .arg(&req.prompt)
        .arg("--output-format").arg("stream-json")
        .arg("--verbose")  // REQUIRED for stream-json to actually emit
        .arg("--include-partial-messages")  // emits content_block_delta token deltas
        .arg("--append-system-prompt").arg(&req.preamble);
    if let Some(model) = &req.model {
        cmd.arg("--model").arg(model);
    }
    if let Some(sid) = &req.session_id {
        cmd.arg("--resume").arg(sid);
    }
    let allowed = allowed_tools(&req.access_map.tools);
    if !allowed.is_empty() {
        cmd.arg("--allowedTools").arg(allowed);
    }
    cmd.arg("--permission-mode").arg(if req.bypass { "bypassPermissions" } else { "default" });
    cmd.current_dir(&req.work_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    cmd.spawn().map_err(|e| e.to_string())
}

fn allowed_tools(tools: &AccessMapTools) -> String {
    let mut allowed: Vec<&str> = Vec::new();
    if tools.bash { allowed.push("Bash"); }
    if tools.file_read { allowed.push("Read"); allowed.push("Glob"); allowed.push("Grep"); }
    if tools.file_write { allowed.push("Write"); allowed.push("Edit"); }
    if tools.network { allowed.push("WebFetch"); allowed.push("WebSearch"); }
    allowed.join(",")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allowed_tools_for_all_off_is_empty() {
        let t = AccessMapTools::default();
        assert_eq!(allowed_tools(&t), "");
    }

    #[test]
    fn allowed_tools_for_file_read_includes_read_glob_grep() {
        let t = AccessMapTools { file_read: true, ..AccessMapTools::default() };
        let s = allowed_tools(&t);
        assert!(s.contains("Read"));
        assert!(s.contains("Glob"));
        assert!(s.contains("Grep"));
    }

    #[test]
    fn allowed_tools_for_bash_only_returns_just_bash() {
        let t = AccessMapTools { bash: true, ..AccessMapTools::default() };
        assert_eq!(allowed_tools(&t), "Bash");
    }
}
