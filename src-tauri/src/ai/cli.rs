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
//! On macOS / Linux PATH lookup theoretically works for any executable, but
//! GUI apps on macOS (Finder, Dock, Spotlight) launch with a minimal PATH
//! that does NOT include Homebrew (`/opt/homebrew/bin`, `/usr/local/bin`),
//! npm-global, volta/nvm, bun, or `~/.local/bin` — so binaries installed via
//! the user's shell are invisible. Linux desktop launchers (.desktop files)
//! exhibit the same problem when DE PATH differs from the user's shell PATH.
//! Resolution strategy on Unix: process PATH → curated fallback dirs → login
//! shell probe (`zsh -lc 'command -v <name>'` or equivalent). See issue #70.

use std::ffi::OsString;
use std::path::Path;
#[cfg(unix)]
use std::path::PathBuf;

/// Resolve `name` with optional explicit override path. The override always
/// wins when it points to an existing file — even on Unix where executable
/// bit checks would normally apply, since the user explicitly picked it.
pub fn resolve_with_override(name: &str, override_path: Option<&str>) -> OsString {
    resolve_with_override_info(name, override_path).0
}

/// Same resolution as `resolve_with_override` but also returns the absolute
/// path string when one was found (vs. falling back to the bare name). The
/// path string powers the "binary used" display in the AI settings panel.
pub fn resolve_with_override_info(
    name: &str,
    override_path: Option<&str>,
) -> (OsString, Option<String>) {
    if let Some(p) = override_path {
        let trimmed = p.trim();
        if !trimmed.is_empty() {
            let candidate = Path::new(trimmed);
            if candidate.is_file() {
                let os = candidate.as_os_str().to_os_string();
                let display = candidate.to_string_lossy().into_owned();
                return (os, Some(display));
            }
        }
    }
    resolve_info(name)
}

pub fn resolve_info(name: &str) -> (OsString, Option<String>) {
    if let Ok(p) = which::which(name) {
        let display = p.to_string_lossy().into_owned();
        return (p.into_os_string(), Some(display));
    }
    #[cfg(unix)]
    {
        if let Some(p) = resolve_unix_fallback(name) {
            let display = p.to_string_lossy().into_owned();
            return (p.into_os_string(), Some(display));
        }
        if let Some(p) = resolve_via_login_shell(name) {
            let display = p.to_string_lossy().into_owned();
            return (p.into_os_string(), Some(display));
        }
    }
    (OsString::from(name), None)
}

#[cfg(unix)]
fn resolve_unix_fallback(name: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut candidates: Vec<PathBuf> = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/opt/homebrew/sbin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/local/sbin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];
    if let Some(h) = home {
        candidates.extend([
            h.join(".npm-global/bin"),
            h.join(".npm/bin"),
            h.join(".bun/bin"),
            h.join(".volta/bin"),
            h.join(".nvm/versions/node"),
            h.join(".cargo/bin"),
            h.join(".local/bin"),
            h.join("bin"),
        ]);
    }
    for dir in candidates {
        let direct = dir.join(name);
        if is_executable_file(&direct) {
            return Some(direct);
        }
        // nvm: ~/.nvm/versions/node/vX.Y.Z/bin/<name> — try one level deeper.
        if dir.file_name().map(|n| n == "node").unwrap_or(false) {
            if let Ok(rd) = std::fs::read_dir(&dir) {
                for entry in rd.flatten() {
                    let inner = entry.path().join("bin").join(name);
                    if is_executable_file(&inner) {
                        return Some(inner);
                    }
                }
            }
        }
    }
    None
}

#[cfg(unix)]
fn is_executable_file(p: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    match std::fs::metadata(p) {
        Ok(m) if m.is_file() => m.permissions().mode() & 0o111 != 0,
        _ => false,
    }
}

/// Last-ditch: ask the user's login shell to resolve the binary. Login shells
/// source `~/.zprofile`, `~/.bash_profile`, etc. which set PATH to whatever the
/// user actually uses interactively. Costs one shell startup (~50–150 ms) but
/// only runs when the curated fallbacks miss.
#[cfg(unix)]
fn resolve_via_login_shell(name: &str) -> Option<PathBuf> {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let cmd = format!("command -v {}", shell_escape(name));
    let out = std::process::Command::new(&shell)
        .arg("-lc")
        .arg(cmd)
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let path = stdout.lines().next()?.trim();
    if path.is_empty() {
        return None;
    }
    let buf = PathBuf::from(path);
    if buf.is_file() { Some(buf) } else { None }
}

#[cfg(unix)]
fn shell_escape(s: &str) -> String {
    // Wrap in single quotes; escape embedded quotes via '\''. Binary names
    // in practice never contain quotes, but be defensive.
    let escaped = s.replace('\'', "'\\''");
    format!("'{}'", escaped)
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
