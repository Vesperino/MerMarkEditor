use std::path::PathBuf;
use crate::ai::paths::{access_dir, hash_path};
use crate::ai::types::AccessMap;

fn file_for(app: &tauri::AppHandle, doc_path: &str) -> Result<PathBuf, String> {
    Ok(access_dir(app)?.join(format!("{}.json", hash_path(doc_path))))
}

pub fn load(app: &tauri::AppHandle, doc_path: &str) -> Result<AccessMap, String> {
    let path = file_for(app, doc_path)?;
    if !path.exists() {
        return Ok(AccessMap::default_for_doc(doc_path));
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

pub fn save(app: &tauri::AppHandle, doc_path: &str, map: &AccessMap) -> Result<(), String> {
    let path = file_for(app, doc_path)?;
    let bytes = serde_json::to_vec_pretty(map).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Migrate the access map from `old_path` to `new_path` (used on Save As).
pub fn migrate(app: &tauri::AppHandle, old_path: &str, new_path: &str) -> Result<(), String> {
    let old = file_for(app, old_path)?;
    if !old.exists() {
        return Ok(());
    }
    let new = file_for(app, new_path)?;
    std::fs::rename(&old, &new).map_err(|e| e.to_string())
}
