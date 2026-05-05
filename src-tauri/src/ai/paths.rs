use std::path::PathBuf;
use sha1::{Sha1, Digest};
use tauri::Manager;

/// Returns `<app_data>/ai`. Creates the directory tree on first call.
pub fn ai_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let root = base.join("ai");
    std::fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

pub fn sessions_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(ai_root(app)?.join("sessions.json"))
}

pub fn audit_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(ai_root(app)?.join("audit.jsonl"))
}

pub fn access_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = ai_root(app)?.join("access");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

pub fn snapshots_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = ai_root(app)?.join("snapshots");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Tmp dir for clipboard / paste-source images attached to AI prompts.
pub fn images_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = ai_root(app)?.join("images");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// SHA-1 hex of a string. Used to derive directory/file names from doc paths.
pub fn hash_path(s: &str) -> String {
    let mut hasher = Sha1::new();
    hasher.update(s.as_bytes());
    let out = hasher.finalize();
    hex(&out)
}

fn hex(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{:02x}", b));
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hash_path_is_deterministic_and_hex() {
        let a = hash_path("/foo/bar.md");
        let b = hash_path("/foo/bar.md");
        let c = hash_path("/foo/baz.md");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_eq!(a.len(), 40);
        assert!(a.chars().all(|ch| ch.is_ascii_hexdigit()));
    }

    #[test]
    fn hash_path_known_value() {
        // Lock in a known sha1 to catch any algorithm regression.
        // sha1("hello") = aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d
        assert_eq!(hash_path("hello"), "aaf4c61ddcc5e8a2dabede0f3b482cd9aea9434d");
    }
}
