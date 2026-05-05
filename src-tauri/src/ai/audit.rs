use std::fs::OpenOptions;
use std::io::{BufRead, BufReader, Write};
use std::sync::Mutex;
use chrono::Utc;
use crate::ai::paths::audit_file;
use crate::ai::types::AuditEntry;

/// Process-wide write mutex to serialize concurrent appends.
static WRITE_LOCK: Mutex<()> = Mutex::new(());

pub fn append(app: &tauri::AppHandle, entry: AuditEntry) -> Result<(), String> {
    let path = audit_file(app)?;
    let line = serde_json::to_string(&entry).map_err(|e| e.to_string())?;
    let _g = WRITE_LOCK.lock().unwrap();
    let mut f = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(f, "{}", line).map_err(|e| e.to_string())?;
    Ok(())
}

/// Read entries; optionally filter by `since` and `until` (ISO strings, inclusive).
pub fn read(
    app: &tauri::AppHandle,
    since: Option<&str>,
    until: Option<&str>,
) -> Result<Vec<AuditEntry>, String> {
    let path = audit_file(app)?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let reader = BufReader::new(f);
    let mut out = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| e.to_string())?;
        if line.trim().is_empty() {
            continue;
        }
        match serde_json::from_str::<AuditEntry>(&line) {
            Ok(entry) => {
                if let Some(s) = since {
                    if entry.ts.as_str() < s { continue; }
                }
                if let Some(u) = until {
                    if entry.ts.as_str() > u { continue; }
                }
                out.push(entry);
            }
            Err(_) => continue, // skip malformed line, do not abort
        }
    }
    Ok(out)
}

pub fn clear(app: &tauri::AppHandle) -> Result<(), String> {
    let path = audit_file(app)?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ai::types::CliKind;

    fn make_entry(ts: &str, action: &str) -> AuditEntry {
        AuditEntry {
            ts: ts.into(),
            session_id: None,
            cli: CliKind::Claude,
            action: action.into(),
            args: serde_json::json!({}),
            result: serde_json::json!({}),
            exit_code: None,
        }
    }

    #[test]
    fn now_iso_is_rfc3339() {
        let s = now_iso();
        assert!(s.contains('T'));
        assert!(s.ends_with('Z') || s.contains('+') || s.contains('-'));
    }

    #[test]
    fn entry_serializes_with_expected_fields() {
        let e = make_entry("2026-05-05T12:00:00Z", "send");
        let v: serde_json::Value = serde_json::from_str(&serde_json::to_string(&e).unwrap()).unwrap();
        assert_eq!(v["ts"], "2026-05-05T12:00:00Z");
        assert_eq!(v["action"], "send");
        assert_eq!(v["cli"], "claude");
    }
}
