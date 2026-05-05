//! CLI binary resolver.
//!
//! Windows `CreateProcess` does not honour PATHEXT — `Command::new("codex")`
//! fails when the binary is shipped as `codex.cmd` (typical npm shim) because
//! only `.exe` is searched. `which::which` walks PATH using PATHEXT, returning
//! the full path to the actual file (`.cmd`, `.bat`, `.exe`, …). Rust 1.77+
//! handles `.cmd`/`.bat` invocation through internal cmd.exe delegation
//! (CVE-2024-24576 patch), so passing the full `.cmd` path to `Command::new`
//! works correctly on Windows.
//!
//! On Linux/macOS PATH lookup already works for any executable, but using
//! `which` is still consistent and avoids a second PATH walk inside the OS.

use std::ffi::OsString;

pub fn resolve(name: &str) -> OsString {
    which::which(name)
        .map(|p| p.into_os_string())
        .unwrap_or_else(|_| OsString::from(name))
}

/// Suppress the console window that Windows pops up for every spawned CLI
/// child (taskkill, claude.cmd, codex.cmd, …) by setting `CREATE_NO_WINDOW`.
/// On macOS / Linux this is a no-op — there's no equivalent flickering window
/// to hide and the call compiles away under `cfg`.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

pub fn hide_console(cmd: &mut tokio::process::Command) -> &mut tokio::process::Command {
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

pub fn hide_console_std(cmd: &mut std::process::Command) -> &mut std::process::Command {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
