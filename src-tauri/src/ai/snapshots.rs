use std::path::PathBuf;
use std::sync::Mutex;
use chrono::Utc;
use crate::ai::paths::{snapshots_dir, hash_path};
use crate::ai::types::SnapshotIndexEntry;

/// Process-wide lock for read-modify-write of snapshot indexes / files so
/// concurrent windows of the same MerMark process do not lose each other's
/// pin state or rotate races.
static SNAPSHOT_LOCK: Mutex<()> = Mutex::new(());

fn doc_dir(app: &tauri::AppHandle, doc_path: &str) -> Result<PathBuf, String> {
    let dir = snapshots_dir(app)?.join(hash_path(doc_path));
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn index_file(dir: &std::path::Path) -> PathBuf {
    dir.join("index.json")
}

pub fn list(app: &tauri::AppHandle, doc_path: &str) -> Result<Vec<SnapshotIndexEntry>, String> {
    let dir = doc_dir(app, doc_path)?;
    let path = index_file(&dir);
    if !path.exists() {
        return Ok(vec![]);
    }
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).or(Ok(vec![]))
}

fn write_index(dir: &std::path::Path, items: &[SnapshotIndexEntry]) -> Result<(), String> {
    let bytes = serde_json::to_vec_pretty(items).map_err(|e| e.to_string())?;
    std::fs::write(index_file(dir), bytes).map_err(|e| e.to_string())
}

/// Create a new snapshot of `content`. Rotates so that pinned + N newest remain.
pub fn create(
    app: &tauri::AppHandle,
    doc_path: &str,
    content: &str,
    source_session_id: Option<String>,
    keep: usize,
) -> Result<SnapshotIndexEntry, String> {
    let _g = SNAPSHOT_LOCK.lock().unwrap();
    let keep = keep.max(1);
    let dir = doc_dir(app, doc_path)?;
    let ts = Utc::now().to_rfc3339();
    let id = ts.replace(':', "-"); // Windows-safe filename
    let filename = format!("{}.md", id);
    std::fs::write(dir.join(&filename), content).map_err(|e| e.to_string())?;
    let entry = SnapshotIndexEntry {
        id: id.clone(),
        ts,
        source_session_id,
        pinned: false,
        content_hash: hash_path(content),
        byte_size: content.len() as u64,
    };
    let mut items = list(app, doc_path)?;
    items.push(entry.clone());
    rotate(&mut items, &dir, keep)?;
    write_index(&dir, &items)?;
    Ok(entry)
}

fn rotate(
    items: &mut Vec<SnapshotIndexEntry>,
    dir: &std::path::Path,
    keep: usize,
) -> Result<(), String> {
    items.sort_by(|a, b| b.ts.cmp(&a.ts));
    let mut kept_unpinned = 0usize;
    let mut to_drop: Vec<String> = Vec::new();
    items.retain(|item| {
        if item.pinned {
            true
        } else if kept_unpinned < keep {
            kept_unpinned += 1;
            true
        } else {
            to_drop.push(item.id.clone());
            false
        }
    });
    for id in to_drop {
        let _ = std::fs::remove_file(dir.join(format!("{}.md", id)));
    }
    Ok(())
}

/// Verify the id exists in the persisted index. Returns the directory on success.
/// Refuses caller-supplied ids that aren't in the index — defends against path
/// traversal in the {id}.md filename.
fn require_known_id(app: &tauri::AppHandle, doc_path: &str, id: &str) -> Result<PathBuf, String> {
    let items = list(app, doc_path)?;
    if !items.iter().any(|i| i.id == id) {
        return Err(format!("snapshot not found: {}", id));
    }
    doc_dir(app, doc_path)
}

pub fn restore(app: &tauri::AppHandle, doc_path: &str, id: &str) -> Result<String, String> {
    let dir = require_known_id(app, doc_path, id)?;
    std::fs::read_to_string(dir.join(format!("{}.md", id))).map_err(|e| e.to_string())
}

pub fn set_pinned(app: &tauri::AppHandle, doc_path: &str, id: &str, pinned: bool) -> Result<(), String> {
    let _g = SNAPSHOT_LOCK.lock().unwrap();
    let dir = doc_dir(app, doc_path)?;
    let mut items = list(app, doc_path)?;
    let mut found = false;
    for item in items.iter_mut() {
        if item.id == id {
            item.pinned = pinned;
            found = true;
        }
    }
    if !found {
        return Err(format!("snapshot not found: {}", id));
    }
    write_index(&dir, &items)
}

pub fn delete(app: &tauri::AppHandle, doc_path: &str, id: &str) -> Result<(), String> {
    let _g = SNAPSHOT_LOCK.lock().unwrap();
    let dir = doc_dir(app, doc_path)?;
    let mut items = list(app, doc_path)?;
    let before = items.len();
    items.retain(|i| i.id != id);
    if items.len() == before {
        return Err(format!("snapshot not found: {}", id));
    }
    write_index(&dir, &items)?;
    let _ = std::fs::remove_file(dir.join(format!("{}.md", id)));
    Ok(())
}

pub fn export(app: &tauri::AppHandle, doc_path: &str, id: &str, dest: &std::path::Path) -> Result<(), String> {
    let content = restore(app, doc_path, id)?;
    std::fs::write(dest, content).map_err(|e| e.to_string())
}

pub fn migrate(app: &tauri::AppHandle, old_path: &str, new_path: &str) -> Result<(), String> {
    let _g = SNAPSHOT_LOCK.lock().unwrap();
    let from = snapshots_dir(app)?.join(hash_path(old_path));
    if !from.exists() {
        return Ok(());
    }
    let to = snapshots_dir(app)?.join(hash_path(new_path));
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(ts: &str, pinned: bool) -> SnapshotIndexEntry {
        SnapshotIndexEntry {
            id: ts.replace(':', "-"),
            ts: ts.into(),
            source_session_id: None,
            pinned,
            content_hash: "x".into(),
            byte_size: 0,
        }
    }

    #[test]
    fn rotate_keeps_n_newest_unpinned_plus_all_pinned() {
        let mut items = vec![
            entry("2026-01-01T00:00:00Z", false),
            entry("2026-02-01T00:00:00Z", true),
            entry("2026-03-01T00:00:00Z", false),
            entry("2026-04-01T00:00:00Z", false),
            entry("2026-05-01T00:00:00Z", false),
        ];
        let dir = std::env::temp_dir();
        rotate(&mut items, &dir, 2).unwrap();
        let ids: Vec<&str> = items.iter().map(|i| i.ts.as_str()).collect();
        assert!(ids.contains(&"2026-02-01T00:00:00Z")); // pinned
        assert!(ids.contains(&"2026-05-01T00:00:00Z")); // newest
        assert!(ids.contains(&"2026-04-01T00:00:00Z")); // 2nd newest
        assert!(!ids.contains(&"2026-01-01T00:00:00Z"));
        assert!(!ids.contains(&"2026-03-01T00:00:00Z"));
    }

    #[test]
    fn rotate_with_keep_one() {
        let mut items = vec![
            entry("2026-01-01T00:00:00Z", false),
            entry("2026-02-01T00:00:00Z", false),
        ];
        let dir = std::env::temp_dir();
        rotate(&mut items, &dir, 1).unwrap();
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].ts, "2026-02-01T00:00:00Z");
    }
}
