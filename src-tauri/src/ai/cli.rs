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
