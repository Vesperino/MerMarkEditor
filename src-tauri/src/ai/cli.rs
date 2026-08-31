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
use std::path::PathBuf;

/// Resolve `name` with optional explicit override path. The override always
/// wins, including when missing: a manual selection must fail explicitly
/// rather than silently running a different installation.
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
        let normalized = normalize_override(p);
        let trimmed = normalized.as_str();
        if !trimmed.is_empty() {
            let candidate = Path::new(trimmed);
            let os = candidate.as_os_str().to_os_string();
            let display = candidate.to_string_lossy().into_owned();
            return (os, Some(display));
        }
    }
    resolve_info(name)
}

pub fn resolve_info(name: &str) -> (OsString, Option<String>) {
    if let Some(p) = candidates(name).into_iter().next() {
        let display = p.to_string_lossy().into_owned();
        return (p.into_os_string(), Some(display));
    }
    (OsString::from(name), None)
}

/// Explicit paths never silently fall back to another installation.
pub fn normalize_override(raw: &str) -> String {
    let value = raw.trim().trim_matches('"');
    #[cfg(windows)]
    {
        let mut out = String::new();
        let mut rest = value;
        while let Some(start) = rest.find('%') {
            out.push_str(&rest[..start]);
            rest = &rest[start..];
            if let Some(end) = rest[1..].find('%') {
                let end = end + 1;
                let key = &rest[1..end];
                out.push_str(&std::env::var(key).unwrap_or_else(|_| rest[..=end].to_string()));
                rest = &rest[end + 1..];
            } else { break; }
        }
        out.push_str(rest);
        return out;
    }
    #[cfg(not(windows))]
    value.to_string()
}

pub fn is_desktop_launcher(path: &Path) -> bool {
    let p = path.to_string_lossy().replace('\\', "/").to_lowercase();
    (p.contains("/windowsapps/openai.codex_") && p.ends_with("/app/codex.exe"))
        || p.ends_with("/microsoft/windowsapps/codex.exe")
}

pub fn candidates(name: &str) -> Vec<PathBuf> {
    let mut result = Vec::new();
    if let Ok(paths) = which::which_all(name) {
        result.extend(paths.filter(|p| name != "codex" || !is_desktop_launcher(p)));
    }
    #[cfg(windows)]
    result.extend(windows_candidates(name,
        std::env::var_os("LOCALAPPDATA").map(PathBuf::from).as_deref(),
        std::env::var_os("APPDATA").map(PathBuf::from).as_deref(),
        std::env::var_os("USERPROFILE").map(PathBuf::from).as_deref()));
    #[cfg(unix)]
    {
        if let Some(p) = resolve_unix_fallback(name) {
            result.push(p);
        }
        if result.is_empty() {
            if let Some(p) = resolve_via_login_shell(name) { result.push(p); }
        }
    }
    let mut seen = std::collections::HashSet::new();
    result.retain(|p| seen.insert(p.clone()));
    result
}

#[cfg(any(windows, test))]
fn windows_candidates(name: &str, local: Option<&Path>, roaming: Option<&Path>, user: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    if name == "codex" {
        if let Some(local) = local {
            let bin = local.join("OpenAI/Codex/bin");
            dirs.push(bin.clone());
            // Bundle directory names are hashes, not sortable versions. Prefer
            // recently updated installations, but health-check every candidate.
            let mut versions: Vec<_> = std::fs::read_dir(&bin).into_iter().flatten()
                .flatten().filter(|e| e.path().is_dir()).collect();
            versions.sort_by_key(|e| std::cmp::Reverse(e.metadata().and_then(|m| m.modified()).ok()));
            dirs.extend(versions.into_iter().map(|e| e.path()));
        }
    }
    if let Some(roaming) = roaming { dirs.push(roaming.join("npm")); }
    if let Some(user) = user {
        dirs.extend([user.join(".local/bin"), user.join("scoop/shims"), user.join(".cargo/bin"), user.join(".volta/bin"), user.join(".bun/bin")]);
    }
    dirs.into_iter().flat_map(|dir| ["exe", "cmd", "bat"].map(|ext| dir.join(format!("{name}.{ext}"))))
        .filter(|p| p.is_file()).collect()
}

#[cfg(test)]
mod discovery_tests {
    use super::*;

    #[test]
    fn detects_bundled_versions_and_npm_without_path() {
        let root = std::env::temp_dir().join(format!("mermark-cli-test-{}", uuid::Uuid::new_v4()));
        let local = root.join("Local");
        let roaming = root.join("Roaming");
        let version = local.join("OpenAI/Codex/bin/version-hash/codex.exe");
        let npm = roaming.join("npm/codex.cmd");
        for path in [&version, &npm] {
            std::fs::create_dir_all(path.parent().unwrap()).unwrap();
            std::fs::write(path, "test fixture").unwrap();
        }
        let paths = windows_candidates("codex", Some(&local), Some(&roaming), None);
        assert_eq!(paths, vec![version, npm]);
        assert!(windows_candidates("claude", Some(&local), None, None).is_empty());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn identifies_desktop_launcher_but_allows_cli_bundle() {
        assert!(is_desktop_launcher(Path::new(r"C:\Program Files\WindowsApps\OpenAI.Codex_26\app\Codex.exe")));
        assert!(!is_desktop_launcher(Path::new(r"C:\Users\User\AppData\Local\OpenAI\Codex\bin\hash\codex.exe")));
    }

    #[test]
    fn missing_manual_path_is_not_replaced_with_path_lookup() {
        let (_, actual) = resolve_with_override_info("codex", Some("  \"missing/custom/codex.exe\"  "));
        assert_eq!(actual.as_deref(), Some("missing/custom/codex.exe"));
    }

    #[cfg(windows)]
    #[test]
    fn expands_windows_environment_variables_without_shell() {
        let expected = format!("{}\\OpenAI\\Codex", std::env::var("LOCALAPPDATA").unwrap());
        assert_eq!(normalize_override(r"%LOCALAPPDATA%\OpenAI\Codex"), expected);
    }
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
