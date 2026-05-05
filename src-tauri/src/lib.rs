use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use std::collections::{HashMap, BTreeSet};
use std::path::Path;
use tauri::{Manager, Emitter, WebviewUrl, WebviewWindowBuilder, RunEvent, WindowEvent};
use serde::{Deserialize, Serialize};
use font_kit::source::SystemSource;

mod ai;

// Store the file path to be opened (from CLI args or file association)
pub struct OpenFileState(pub Mutex<Option<String>>);

// Global registry of open files: file_path -> window_label
pub struct OpenFilesRegistry(pub Mutex<HashMap<String, String>>);

// Counter for unique window IDs
static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

fn is_supported_markdown_path(path: &str) -> bool {
    Path::new(path)
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown"))
        .unwrap_or(false)
}

// Payload for transferring tabs between windows
#[derive(Clone, Serialize, Deserialize)]
pub struct TabTransferPayload {
    pub file_path: String,
    pub source_window: String,
    pub target_window: String,
}

#[tauri::command]
fn get_open_file_path(state: tauri::State<'_, OpenFileState>) -> Option<String> {
    let mut path = state.0.lock().unwrap();
    path.take()
}

// Register a file as open in a specific window
#[tauri::command]
fn register_open_file(
    registry: tauri::State<'_, OpenFilesRegistry>,
    file_path: String,
    window_label: String,
) {
    let mut files = registry.0.lock().unwrap();
    files.insert(file_path, window_label);
}

// Unregister a file when it's closed
#[tauri::command]
fn unregister_open_file(
    registry: tauri::State<'_, OpenFilesRegistry>,
    file_path: String,
) {
    let mut files = registry.0.lock().unwrap();
    files.remove(&file_path);
}

// Unregister all files for a specific window (when window closes)
#[tauri::command]
fn unregister_window_files(
    registry: tauri::State<'_, OpenFilesRegistry>,
    window_label: String,
) {
    let mut files = registry.0.lock().unwrap();
    files.retain(|_, label| label != &window_label);
}

// Check if a file is already open and return the window label if so
#[tauri::command]
fn check_file_open(
    registry: tauri::State<'_, OpenFilesRegistry>,
    file_path: String,
) -> Option<String> {
    let files = registry.0.lock().unwrap();
    files.get(&file_path).cloned()
}

// Focus the window that has a specific file open
#[tauri::command]
async fn focus_window_with_file(
    app: tauri::AppHandle,
    registry: tauri::State<'_, OpenFilesRegistry>,
    file_path: String,
) -> Result<bool, String> {
    let window_label = {
        let files = registry.0.lock().unwrap();
        files.get(&file_path).cloned()
    };

    if let Some(label) = window_label {
        if let Some(window) = app.get_webview_window(&label) {
            // Bring window to front even if minimized (#49)
            if window.is_minimized().unwrap_or(false) {
                let _ = window.unminimize();
            }
            if !window.is_visible().unwrap_or(true) {
                let _ = window.show();
            }
            window.set_focus().map_err(|e| e.to_string())?;
            // Emit event to switch to the tab with this file
            window.emit("focus-file", file_path).map_err(|e| e.to_string())?;
            return Ok(true);
        }
    }
    Ok(false)
}

#[tauri::command]
fn get_all_windows(app: tauri::AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .cloned()
        .collect()
}

#[tauri::command]
fn get_current_window_label(window: tauri::Window) -> String {
    window.label().to_string()
}

#[tauri::command]
async fn transfer_tab_to_window(
    app: tauri::AppHandle,
    file_path: String,
    source_window: String,
    target_window: String,
) -> Result<(), String> {
    let payload = TabTransferPayload {
        file_path,
        source_window,
        target_window: target_window.clone(),
    };

    if let Some(target) = app.get_webview_window(&target_window) {
        target.emit("tab-transfer", payload).map_err(|e| e.to_string())?;
        target.set_focus().map_err(|e| e.to_string())?;
    } else {
        return Err(format!("Window {} not found", target_window));
    }

    Ok(())
}

// ============== AI commands (storage + health) ==============

use ai::types::{AccessMap, AuditEntry, CliKind, HealthStatus, SessionMapping, SnapshotIndexEntry};

#[tauri::command]
async fn ai_health_check(cli: CliKind) -> HealthStatus {
    ai::health::check(cli).await
}

#[tauri::command]
fn ai_access_load(app: tauri::AppHandle, doc_path: String) -> Result<AccessMap, String> {
    ai::access_map::load(&app, &doc_path)
}

#[tauri::command]
fn ai_access_save(app: tauri::AppHandle, doc_path: String, map: AccessMap) -> Result<(), String> {
    ai::access_map::save(&app, &doc_path, &map)
}

#[tauri::command]
fn ai_access_migrate(app: tauri::AppHandle, old_path: String, new_path: String) -> Result<(), String> {
    ai::access_map::migrate(&app, &old_path, &new_path)
}

#[tauri::command]
fn ai_session_get(app: tauri::AppHandle, doc_path: String) -> Result<Option<SessionMapping>, String> {
    ai::sessions::get(&app, &doc_path)
}

#[tauri::command]
fn ai_session_upsert(app: tauri::AppHandle, mapping: SessionMapping) -> Result<(), String> {
    ai::sessions::upsert(&app, mapping)
}

#[tauri::command]
fn ai_session_remove(app: tauri::AppHandle, doc_path: String) -> Result<(), String> {
    ai::sessions::remove(&app, &doc_path)
}

#[tauri::command]
fn ai_session_migrate(app: tauri::AppHandle, old_path: String, new_path: String) -> Result<(), String> {
    ai::sessions::migrate(&app, &old_path, &new_path)
}

#[tauri::command]
fn ai_session_recover_by_hash(app: tauri::AppHandle, content_hash: String, cli: CliKind) -> Result<Option<SessionMapping>, String> {
    ai::sessions::recover_by_hash(&app, &content_hash, cli)
}

#[tauri::command]
fn ai_snapshot_list(app: tauri::AppHandle, doc_path: String) -> Result<Vec<SnapshotIndexEntry>, String> {
    ai::snapshots::list(&app, &doc_path)
}

#[tauri::command]
fn ai_snapshot_create(app: tauri::AppHandle, doc_path: String, content: String, source_session_id: Option<String>, keep: usize) -> Result<SnapshotIndexEntry, String> {
    ai::snapshots::create(&app, &doc_path, &content, source_session_id, keep)
}

#[tauri::command]
fn ai_snapshot_restore(app: tauri::AppHandle, doc_path: String, id: String) -> Result<String, String> {
    ai::snapshots::restore(&app, &doc_path, &id)
}

#[tauri::command]
fn ai_snapshot_set_pinned(app: tauri::AppHandle, doc_path: String, id: String, pinned: bool) -> Result<(), String> {
    ai::snapshots::set_pinned(&app, &doc_path, &id, pinned)
}

#[tauri::command]
fn ai_snapshot_delete(app: tauri::AppHandle, doc_path: String, id: String) -> Result<(), String> {
    ai::snapshots::delete(&app, &doc_path, &id)
}

#[tauri::command]
fn ai_snapshot_export(app: tauri::AppHandle, doc_path: String, id: String, dest: String) -> Result<(), String> {
    ai::snapshots::export(&app, &doc_path, &id, std::path::Path::new(&dest))
}

#[tauri::command]
fn ai_snapshot_migrate(app: tauri::AppHandle, old_path: String, new_path: String) -> Result<(), String> {
    ai::snapshots::migrate(&app, &old_path, &new_path)
}

#[tauri::command]
fn ai_audit_append(app: tauri::AppHandle, entry: AuditEntry) -> Result<(), String> {
    ai::audit::append(&app, entry)
}

#[tauri::command]
fn ai_audit_read(app: tauri::AppHandle, since: Option<String>, until: Option<String>) -> Result<Vec<AuditEntry>, String> {
    ai::audit::read(&app, since.as_deref(), until.as_deref())
}

#[tauri::command]
fn ai_audit_clear(app: tauri::AppHandle) -> Result<(), String> {
    ai::audit::clear(&app)
}

/// List all font family names installed on the system.
/// Returns a sorted, deduplicated list of font family names.
#[tauri::command]
fn list_system_fonts() -> Vec<String> {
    let source = SystemSource::new();
    let mut families = BTreeSet::new();

    if let Ok(all_fonts) = source.all_families() {
        for family in all_fonts {
            // Skip hidden/internal fonts (starting with . or #)
            if !family.starts_with('.') && !family.starts_with('#') {
                families.insert(family);
            }
        }
    }

    families.into_iter().collect()
}

#[tauri::command]
async fn create_new_window(app: tauri::AppHandle, file_path: Option<String>) -> Result<String, String> {
    let window_id = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("window-{}", window_id);

    let url = match &file_path {
        Some(path) => {
            let encoded_path = urlencoding::encode(path);
            format!("index.html?file={}", encoded_path)
        }
        None => "index.html".to_string()
    };

    let window = WebviewWindowBuilder::new(
        &app,
        &window_label,
        WebviewUrl::App(url.into())
    )
    .title("MerMark Editor")
    .inner_size(1200.0, 800.0)
    .resizable(true)
    .center()
    .build()
    .map_err(|e| e.to_string())?;

    window.set_focus().map_err(|e| e.to_string())?;

    Ok(window_label)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            // When another instance is launched with arguments (file association)
            // Send the file path to the existing window
            if let Some(window) = app.get_webview_window("main") {
                // Bring window to front even if minimized (#49)
                if window.is_minimized().unwrap_or(false) {
                    let _ = window.unminimize();
                }
                if !window.is_visible().unwrap_or(true) {
                    let _ = window.show();
                }
                let _ = window.set_focus();

                if args.len() > 1 {
                    let file_path = &args[1];
                    if is_supported_markdown_path(file_path) {
                        let _ = window.emit("open-file", file_path.clone());
                    }
                }
            }
        }))
        .manage(OpenFileState(Mutex::new(None)))
        .manage(OpenFilesRegistry(Mutex::new(HashMap::new())))
        .manage(ai::process::ChildRegistry::new())
        .invoke_handler(tauri::generate_handler![
            get_open_file_path,
            create_new_window,
            get_all_windows,
            get_current_window_label,
            transfer_tab_to_window,
            register_open_file,
            unregister_open_file,
            unregister_window_files,
            check_file_open,
            focus_window_with_file,
            list_system_fonts,
            ai_health_check,
            ai_access_load,
            ai_access_save,
            ai_access_migrate,
            ai_session_get,
            ai_session_upsert,
            ai_session_remove,
            ai_session_migrate,
            ai_session_recover_by_hash,
            ai_snapshot_list,
            ai_snapshot_create,
            ai_snapshot_restore,
            ai_snapshot_set_pinned,
            ai_snapshot_delete,
            ai_snapshot_export,
            ai_snapshot_migrate,
            ai_audit_append,
            ai_audit_read,
            ai_audit_clear
        ])
        .setup(|app| {
            // Check for CLI arguments (file association on first launch)
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let file_path = &args[1];
                if is_supported_markdown_path(file_path) {
                    // Store the file path to be retrieved by frontend
                    let state = app.state::<OpenFileState>();
                    *state.0.lock().unwrap() = Some(file_path.clone());
                }
            }

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            match event {
                #[cfg(target_os = "macos")]
                RunEvent::Opened { urls } => {
                    // macOS: Finder double-click on already-running app dispatches
                    // NSApplicationDelegate application:openURLs: (no new process,
                    // so single_instance plugin never fires). Handle it here. (#63)
                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_minimized().unwrap_or(false) {
                            let _ = window.unminimize();
                        }
                        if !window.is_visible().unwrap_or(true) {
                            let _ = window.show();
                        }
                        let _ = window.set_focus();

                        for url in urls {
                            if let Ok(path) = url.to_file_path() {
                                let path_str = path.to_string_lossy().to_string();
                                if is_supported_markdown_path(&path_str) {
                                    // Also store in state as fallback for cold-start
                                    // race where frontend listener isn't mounted yet.
                                    let state = app.state::<OpenFileState>();
                                    *state.0.lock().unwrap() = Some(path_str.clone());
                                    let _ = window.emit("open-file", path_str);
                                }
                            }
                        }
                    }
                }
                RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { api, .. }, .. } => {
                    // Get count of remaining windows
                    let windows = app.webview_windows();
                    let window_count = windows.len();

                    // If this is the last window, let it close and exit app
                    if window_count <= 1 {
                        // Allow default close behavior (app will exit)
                        return;
                    }

                    // Otherwise, just close this window (don't exit app)
                    if let Some(window) = app.get_webview_window(&label) {
                        let _ = window.destroy();
                    }
                    // Prevent default close which might exit the app
                    api.prevent_close();
                }
                _ => {}
            }
        });
}
