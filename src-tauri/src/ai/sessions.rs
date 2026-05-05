use std::collections::HashMap;
use std::sync::Mutex;
use crate::ai::paths::sessions_file;
use crate::ai::types::{CliKind, SessionMapping};

type Store = HashMap<String, SessionMapping>;

/// Process-wide lock around read-modify-write of `sessions.json` so two windows
/// of the same MerMark process cannot clobber each other's mappings.
static STORE_LOCK: Mutex<()> = Mutex::new(());

fn load_store(app: &tauri::AppHandle) -> Result<Store, String> {
    let path = sessions_file(app)?;
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn save_store(app: &tauri::AppHandle, store: &Store) -> Result<(), String> {
    let path = sessions_file(app)?;
    let bytes = serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

pub fn get(app: &tauri::AppHandle, doc_path: &str) -> Result<Option<SessionMapping>, String> {
    Ok(load_store(app)?.get(doc_path).cloned())
}

pub fn upsert(app: &tauri::AppHandle, mapping: SessionMapping) -> Result<(), String> {
    let _g = STORE_LOCK.lock().unwrap();
    let mut store = load_store(app)?;
    store.insert(mapping.doc_path.clone(), mapping);
    save_store(app, &store)
}

pub fn remove(app: &tauri::AppHandle, doc_path: &str) -> Result<(), String> {
    let _g = STORE_LOCK.lock().unwrap();
    let mut store = load_store(app)?;
    store.remove(doc_path);
    save_store(app, &store)
}

pub fn migrate(app: &tauri::AppHandle, old_path: &str, new_path: &str) -> Result<(), String> {
    let _g = STORE_LOCK.lock().unwrap();
    let mut store = load_store(app)?;
    if let Some(mut entry) = store.remove(old_path) {
        entry.doc_path = new_path.to_string();
        store.insert(new_path.to_string(), entry);
        save_store(app, &store)?;
    }
    Ok(())
}

/// Best-effort recovery: when the active doc's path has no mapping but its
/// content hash matches an existing entry, return that entry so the UI can
/// offer to re-link.
pub fn recover_by_hash(
    app: &tauri::AppHandle,
    content_hash: &str,
    cli: CliKind,
) -> Result<Option<SessionMapping>, String> {
    let store = load_store(app)?;
    Ok(store
        .into_values()
        .find(|m| m.content_hash == content_hash && m.cli == cli))
}
