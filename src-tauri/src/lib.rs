use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use std::collections::{HashMap, BTreeSet};
use std::path::{Path, PathBuf};
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

// Dedicated window that renders the print-ready document for native printing.
const PRINT_WINDOW_LABEL: &str = "window-print";
// Custom URI scheme that serves the print-ready HTML from memory.
const PRINT_SCHEME: &str = "mermarkprint";

// Holds the print-ready HTML served to the print window by the custom protocol.
pub struct PrintHtmlState(pub Mutex<Option<String>>);

#[tauri::command]
fn get_all_windows(app: tauri::AppHandle) -> Vec<String> {
    app.webview_windows()
        .keys()
        .filter(|label| *label != PRINT_WINDOW_LABEL)
        .cloned()
        .collect()
}

/// Render the print-ready HTML in a dedicated webview window and fire the native
/// print dialog on it. WKWebView (macOS) ignores `print()` on iframes, so the
/// in-app preview iframe could never print there (#103).
///
/// The window loads its content from the in-memory `mermarkprint://` protocol
/// rather than `file://` (which WKWebView refuses via `loadRequest:`) or post-
/// load JS injection (which rendered blank). `async` keeps window creation off
/// the main thread, since creating a webview from a sync command can deadlock.
#[tauri::command]
async fn print_document(app: tauri::AppHandle, html: String) -> Result<(), String> {
    *app.state::<PrintHtmlState>().0.lock().unwrap() = Some(html);

    if let Some(existing) = app.get_webview_window(PRINT_WINDOW_LABEL) {
        let _ = existing.close();
    }

    // Custom schemes resolve to `scheme://localhost` on macOS/Linux but
    // `http://scheme.localhost` on Windows/Android.
    let url = if cfg!(any(windows, target_os = "android")) {
        format!("http://{PRINT_SCHEME}.localhost/")
    } else {
        format!("{PRINT_SCHEME}://localhost/")
    };
    let url = tauri::Url::parse(&url).map_err(|e| e.to_string())?;

    WebviewWindowBuilder::new(&app, PRINT_WINDOW_LABEL, WebviewUrl::CustomProtocol(url))
        .title("MerMark — Print / PDF")
        .inner_size(900.0, 1100.0)
        .center()
        .initialization_script("window.addEventListener('afterprint',function(){window.close();});")
        // on_page_load runs on the UI thread — which WKWebView's print() requires —
        // and firing on Finished prints exactly when the document is ready.
        .on_page_load(|window, payload| {
            if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
                let _ = window.print();
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    Ok(())
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
async fn ai_health_check(cli: CliKind, override_path: Option<String>) -> HealthStatus {
    ai::health::check(cli, override_path.as_deref()).await
}

#[tauri::command]
async fn ai_ollama_models(base_url: Option<String>) -> Result<Vec<String>, String> {
    ai::process::ollama::list_models(base_url.as_deref()).await
}

#[tauri::command]
async fn ai_openai_models(base_url: Option<String>) -> Result<Vec<String>, String> {
    ai::process::openai::list_models(base_url.as_deref()).await
}

#[tauri::command]
async fn ai_codex_models() -> Vec<ai::process::codex::CodexModelOption> {
    ai::process::codex::list_models().await
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

#[tauri::command]
async fn ai_send(
    app: tauri::AppHandle,
    window: tauri::Window,
    registry: tauri::State<'_, ai::process::ChildRegistry>,
    req: ai::process::AiSendRequest,
    request_id: String,
) -> Result<String, String> {
    ai::process::spawn(app, window.label().to_string(), registry, req, request_id).await
}

#[tauri::command]
fn ai_cancel(
    app: tauri::AppHandle,
    window: tauri::Window,
    registry: tauri::State<'_, ai::process::ChildRegistry>,
    request_id: String,
) {
    ai::process::cancel(&app, window.label(), &registry, &request_id);
}

/// Persist an image (clipboard paste, drag-drop, etc.) to a temporary file
/// inside `<app_data>/ai/images/` and return its absolute path. The frontend
/// then references that path via `convertFileSrc` for previews and forwards
/// it through `AiSendRequest.images` so the backend can attach it to claude
/// or codex.
#[tauri::command]
fn ai_image_save(
    app: tauri::AppHandle,
    bytes: Vec<u8>,
    extension: String,
) -> Result<String, String> {
    let dir = ai::paths::images_dir(&app)?;
    let safe_ext = extension.trim().trim_start_matches('.').to_ascii_lowercase();
    let allowed = matches!(safe_ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp");
    let ext = if allowed { safe_ext.as_str() } else { "png" };
    let name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    let path = dir.join(name);
    std::fs::write(&path, &bytes).map_err(|e| format!("write image failed: {}", e))?;
    Ok(path.to_string_lossy().into_owned())
}

// ============== Workspace (folder browser) commands ==============

#[derive(Serialize)]
struct WorkspaceNode {
    name: String,
    path: String,
    /// "file" or "folder"
    kind: &'static str,
    /// None for files; Some for folders (may be empty).
    children: Option<Vec<WorkspaceNode>>,
    /// Last-modified time in milliseconds since the Unix epoch (0 if unavailable).
    /// Used by the frontend to offer "sort by modified" in the workspace tree.
    modified: u64,
}

const WORKSPACE_TREE_MAX_DEPTH: usize = 50;

fn is_workspace_markdown(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.ends_with(".md") || lower.ends_with(".markdown") || lower.ends_with(".mdx")
}

fn is_workspace_image(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"]
        .iter()
        .any(|ext| lower.ends_with(ext))
}

fn is_workspace_visible(name: &str) -> bool {
    is_workspace_markdown(name) || is_workspace_image(name)
}

fn is_workspace_hidden(name: &str) -> bool {
    name.starts_with('.') || name == "node_modules"
}

fn read_workspace_subtree(path: &Path, depth: usize) -> Result<WorkspaceNode, String> {
    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("read metadata for {}: {}", path.display(), e))?;
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    let path_str = path.to_string_lossy().into_owned();
    let modified_ms = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    if metadata.is_file() {
        return Ok(WorkspaceNode {
            name,
            path: path_str,
            kind: "file",
            children: None,
            modified: modified_ms,
        });
    }

    if !metadata.is_dir() {
        return Err(format!("path is neither file nor directory: {}", path.display()));
    }

    let mut children: Vec<WorkspaceNode> = Vec::new();
    if depth < WORKSPACE_TREE_MAX_DEPTH {
        let entries = std::fs::read_dir(path)
            .map_err(|e| format!("read_dir {}: {}", path.display(), e))?;
        let mut folders: Vec<PathBuf> = Vec::new();
        let mut files: Vec<PathBuf> = Vec::new();
        for entry in entries.flatten() {
            let entry_path = entry.path();
            let entry_name = entry.file_name().to_string_lossy().into_owned();
            if is_workspace_hidden(&entry_name) {
                continue;
            }
            let entry_type = match entry.file_type() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if entry_type.is_dir() {
                folders.push(entry_path);
            } else if entry_type.is_file() {
                if is_workspace_visible(&entry_name) {
                    files.push(entry_path);
                }
            }
        }
        // Folders first then files, both alphabetical (case-insensitive).
        folders.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_ascii_lowercase()).unwrap_or_default());
        files.sort_by_key(|p| p.file_name().map(|n| n.to_string_lossy().to_ascii_lowercase()).unwrap_or_default());

        for folder in folders {
            match read_workspace_subtree(&folder, depth + 1) {
                Ok(node) => children.push(node),
                Err(_) => {
                    // Skip folders we cannot read (perms, broken symlinks, etc.)
                    continue;
                }
            }
        }
        for file in files {
            if let Ok(node) = read_workspace_subtree(&file, depth + 1) {
                children.push(node);
            }
        }
    }

    Ok(WorkspaceNode {
        name,
        path: path_str,
        kind: "folder",
        children: Some(children),
        modified: modified_ms,
    })
}

#[tauri::command]
async fn read_workspace_tree(root: String) -> Result<WorkspaceNode, String> {
    // Walking a large folder is CPU/IO bound and can take seconds. Run it on
    // tokio's blocking pool so the Tauri command thread (and the renderer
    // IPC) stays responsive — the UI shows its loading state in the meantime.
    tokio::task::spawn_blocking(move || {
        let path = Path::new(&root);
        if !path.exists() {
            return Err(format!("workspace path does not exist: {}", root));
        }
        if !path.is_dir() {
            return Err(format!("workspace path is not a directory: {}", root));
        }
        read_workspace_subtree(path, 0)
    })
    .await
    .map_err(|e| format!("worker join: {}", e))?
}

#[tauri::command]
fn create_md_file(parent: String, name: String) -> Result<String, String> {
    let parent_path = Path::new(&parent);
    if !parent_path.is_dir() {
        return Err(format!("parent is not a directory: {}", parent));
    }
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("file name cannot be empty".into());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("file name cannot contain path separators".into());
    }
    let final_name = if is_workspace_markdown(trimmed) {
        trimmed.to_string()
    } else {
        format!("{}.md", trimmed)
    };
    let full = parent_path.join(&final_name);
    if full.exists() {
        return Err(format!("file already exists: {}", full.display()));
    }
    std::fs::write(&full, "").map_err(|e| format!("create file: {}", e))?;
    Ok(full.to_string_lossy().into_owned())
}

#[tauri::command]
fn create_folder(parent: String, name: String) -> Result<String, String> {
    let parent_path = Path::new(&parent);
    if !parent_path.is_dir() {
        return Err(format!("parent is not a directory: {}", parent));
    }
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("folder name cannot be empty".into());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("folder name cannot contain path separators".into());
    }
    let full = parent_path.join(trimmed);
    if full.exists() {
        return Err(format!("folder already exists: {}", full.display()));
    }
    std::fs::create_dir(&full).map_err(|e| format!("create folder: {}", e))?;
    Ok(full.to_string_lossy().into_owned())
}

#[tauri::command]
fn rename_path(from: String, to: String) -> Result<(), String> {
    let from_path = Path::new(&from);
    let to_path = Path::new(&to);
    if !from_path.exists() {
        return Err(format!("source does not exist: {}", from));
    }
    if to_path.exists() {
        return Err(format!("destination already exists: {}", to));
    }
    std::fs::rename(from_path, to_path).map_err(|e| format!("rename: {}", e))?;
    Ok(())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("path does not exist: {}", path));
    }
    let metadata = std::fs::metadata(target).map_err(|e| format!("stat: {}", e))?;
    if metadata.is_dir() {
        std::fs::remove_dir_all(target).map_err(|e| format!("remove dir: {}", e))?;
    } else {
        std::fs::remove_file(target).map_err(|e| format!("remove file: {}", e))?;
    }
    Ok(())
}

// ============== Content search across open workspaces ==============

#[derive(Serialize)]
struct ContentSearchHit {
    path: String,
    /// 1-based line number where the match was found.
    line: usize,
    /// The matching line, trimmed and capped to 240 chars for display.
    snippet: String,
}

/// Substring-search the content of every `.md/.markdown/.mdx` file under any
/// of the supplied roots. Case-insensitive. Async + multi-threaded so a
/// 5000-file workspace stays interactive.
///
/// Hard limits to keep the worst case bounded:
///   - Max 5_000 files visited per call (early-stops; UI explains via `truncated`).
///   - Max 500 KB read per file (markdown is text — bigger means binary garbage).
///   - Max 200 hit lines returned overall.
///   - Total wall-clock budget: 4 s, then early-stop with whatever we have.
#[tauri::command]
async fn search_workspace_content(
    roots: Vec<String>,
    query: String,
) -> Result<Vec<ContentSearchHit>, String> {
    let q = query.trim().to_string();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let q_lower = q.to_ascii_lowercase();

    tokio::task::spawn_blocking(move || -> Result<Vec<ContentSearchHit>, String> {
        let start = std::time::Instant::now();
        let budget = std::time::Duration::from_secs(4);
        const MAX_FILES: usize = 5_000;
        const MAX_FILE_BYTES: usize = 512 * 1024;
        const MAX_HITS: usize = 200;

        let mut files_visited: usize = 0;
        let mut hits: Vec<ContentSearchHit> = Vec::new();

        // Iterative DFS so we can early-stop cleanly.
        let mut stack: Vec<PathBuf> = roots
            .into_iter()
            .map(PathBuf::from)
            .filter(|p| p.is_dir())
            .collect();

        while let Some(dir) = stack.pop() {
            if start.elapsed() > budget || hits.len() >= MAX_HITS || files_visited >= MAX_FILES {
                break;
            }
            let entries = match std::fs::read_dir(&dir) {
                Ok(rd) => rd,
                Err(_) => continue,
            };
            for entry in entries.flatten() {
                let name = entry.file_name().to_string_lossy().into_owned();
                if is_workspace_hidden(&name) {
                    continue;
                }
                let path = entry.path();
                let file_type = match entry.file_type() {
                    Ok(t) => t,
                    Err(_) => continue,
                };
                if file_type.is_dir() {
                    stack.push(path);
                    continue;
                }
                if !file_type.is_file() || !is_workspace_markdown(&name) {
                    continue;
                }
                files_visited += 1;
                if files_visited > MAX_FILES {
                    break;
                }
                // Read up to MAX_FILE_BYTES — markdown files are text, bigger
                // is almost certainly bad data we don't want to scan.
                let bytes = match read_file_capped(&path, MAX_FILE_BYTES) {
                    Ok(b) => b,
                    Err(_) => continue,
                };
                let text = match std::str::from_utf8(&bytes) {
                    Ok(s) => s,
                    Err(_) => continue,
                };
                for (idx, line) in text.lines().enumerate() {
                    if line.to_ascii_lowercase().contains(&q_lower) {
                        let trimmed = line.trim();
                        let snippet = if trimmed.len() > 240 {
                            format!("{}…", &trimmed.chars().take(240).collect::<String>())
                        } else {
                            trimmed.to_string()
                        };
                        hits.push(ContentSearchHit {
                            path: path.to_string_lossy().into_owned(),
                            line: idx + 1,
                            snippet,
                        });
                        if hits.len() >= MAX_HITS {
                            break;
                        }
                    }
                }
            }
        }

        Ok(hits)
    })
    .await
    .map_err(|e| format!("worker join: {}", e))?
}

fn read_file_capped(path: &Path, max_bytes: usize) -> std::io::Result<Vec<u8>> {
    use std::io::Read;
    let mut f = std::fs::File::open(path)?;
    let mut buf = Vec::with_capacity(max_bytes.min(64 * 1024));
    let mut chunk = [0u8; 8192];
    while buf.len() < max_bytes {
        let n = f.read(&mut chunk)?;
        if n == 0 {
            break;
        }
        let take = n.min(max_bytes - buf.len());
        buf.extend_from_slice(&chunk[..take]);
        if take < n {
            break;
        }
    }
    Ok(buf)
}

/// Reveal a file or folder in the host OS file manager.
/// On Windows uses `explorer /select,<path>`; on macOS uses `open -R <path>`;
/// on Linux falls back to opening the parent folder via xdg-open.
#[tauri::command]
fn reveal_in_os(path: String) -> Result<(), String> {
    let target = Path::new(&path);
    if !target.exists() {
        return Err(format!("path does not exist: {}", path));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer.exe")
            .arg(format!("/select,{}", path))
            .spawn()
            .map_err(|e| format!("explorer: {}", e))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(["-R", &path])
            .spawn()
            .map_err(|e| format!("open: {}", e))?;
        return Ok(());
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let parent = target
            .parent()
            .map(|p| p.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.clone());
        std::process::Command::new("xdg-open")
            .arg(&parent)
            .spawn()
            .map_err(|e| format!("xdg-open: {}", e))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("reveal_in_os: unsupported platform".into())
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

#[cfg(any(test, target_os = "linux"))]
#[derive(Clone, Copy)]
struct StartupEnvOverride {
    key: &'static str,
    value: &'static str,
}

// Helps with rendering glitches on fragile GPU stacks (NVIDIA, VMs) where EGL
// itself works. NOTE: these vars cannot prevent the `Could not create default
// EGL display: EGL_BAD_PARAMETER` abort from #106 — since WebKitGTK 2.46 the
// WebProcess initializes its EGL display before the preference store is applied
// (WebPage.cpp: drawingArea->updatePreferences runs ahead of updatePreferences),
// so the abort is reachable regardless. The actual #106 fix is in release.yml:
// the AppImage must not bundle libwayland-client.so.0.
#[cfg(any(test, target_os = "linux"))]
const LINUX_WEBKIT_RENDER_OVERRIDES: [StartupEnvOverride; 2] = [
    StartupEnvOverride { key: "WEBKIT_DISABLE_DMABUF_RENDERER", value: "1" },
    StartupEnvOverride { key: "WEBKIT_DISABLE_COMPOSITING_MODE", value: "1" },
];

// Inject an override only when the user has not already set a meaningful value,
// so an explicit `WEBKIT_DISABLE_*` from the environment stays authoritative.
#[cfg(any(test, target_os = "linux"))]
fn should_apply_webkit_override(current: Option<&std::ffi::OsStr>) -> bool {
    match current {
        Some(value) => value.to_string_lossy().trim().is_empty(),
        None => true,
    }
}

// Must run before the first webview spawns and while still single-threaded
// (top of `run`), since `set_var` is only sound before other threads read env.
#[cfg(any(test, target_os = "linux"))]
fn apply_linux_webkit_overrides() {
    for ov in LINUX_WEBKIT_RENDER_OVERRIDES {
        if should_apply_webkit_override(std::env::var_os(ov.key).as_deref()) {
            std::env::set_var(ov.key, ov.value);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    apply_linux_webkit_overrides();

    tauri::Builder::default()
        .register_uri_scheme_protocol(PRINT_SCHEME, |ctx, _request| {
            let html = ctx
                .app_handle()
                .state::<PrintHtmlState>()
                .0
                .lock()
                .unwrap()
                .clone()
                .unwrap_or_default();
            tauri::http::Response::builder()
                .header("Content-Type", "text/html; charset=utf-8")
                .body(html.into_bytes())
                .unwrap()
        })
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
        .manage(PrintHtmlState(Mutex::new(None)))
        .manage(ai::process::ChildRegistry::new())
        .invoke_handler(tauri::generate_handler![
            get_open_file_path,
            create_new_window,
            get_all_windows,
            get_current_window_label,
            print_document,
            transfer_tab_to_window,
            register_open_file,
            unregister_open_file,
            unregister_window_files,
            check_file_open,
            focus_window_with_file,
            list_system_fonts,
            read_workspace_tree,
            create_md_file,
            create_folder,
            rename_path,
            delete_path,
            reveal_in_os,
            search_workspace_content,
            ai_health_check,
            ai_ollama_models,
            ai_openai_models,
            ai_codex_models,
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
            ai_audit_clear,
            ai_send,
            ai_cancel,
            ai_image_save
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
                RunEvent::ExitRequested { .. } => {
                    if let Some(reg) = app.try_state::<ai::process::ChildRegistry>() {
                        reg.kill_all();
                    }
                }
                #[cfg(target_os = "macos")]
                RunEvent::Opened { urls } => {
                    // macOS: Finder double-click on already-running app dispatches
                    // NSApplicationDelegate application:openURLs: (no new process,
                    // so single_instance plugin never fires). Handle it here. (#63)
                    let file_paths: Vec<String> = urls
                        .into_iter()
                        .filter_map(|url| url.to_file_path().ok())
                        .map(|path| path.to_string_lossy().to_string())
                        .filter(|path| is_supported_markdown_path(path))
                        .collect();

                    if file_paths.is_empty() {
                        return;
                    }

                    // Always persist the pending file before touching the window.
                    // On cold start macOS can deliver Opened before the webview is
                    // ready, and the frontend later retrieves this value.
                    let state = app.state::<OpenFileState>();
                    *state.0.lock().unwrap() = file_paths.last().cloned();

                    if let Some(window) = app.get_webview_window("main") {
                        if window.is_minimized().unwrap_or(false) {
                            let _ = window.unminimize();
                        }
                        if !window.is_visible().unwrap_or(true) {
                            let _ = window.show();
                        }
                        let _ = window.set_focus();

                        for path in file_paths {
                            let _ = window.emit("open-file", path);
                        }
                    }
                }
                RunEvent::WindowEvent { label, event: WindowEvent::CloseRequested { api, .. }, .. } => {
                    // The print helper window is auxiliary — never let it gate app lifecycle.
                    if label == PRINT_WINDOW_LABEL {
                        return;
                    }
                    let editor_windows = app
                        .webview_windows()
                        .keys()
                        .filter(|l| *l != PRINT_WINDOW_LABEL)
                        .count();
                    if editor_windows <= 1 {
                        return;
                    }
                    if let Some(window) = app.get_webview_window(&label) {
                        let _ = window.destroy();
                    }
                    api.prevent_close();
                }
                _ => {}
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsStr;

    #[test]
    fn webkit_override_applies_when_unset_or_blank() {
        assert!(should_apply_webkit_override(None));
        assert!(should_apply_webkit_override(Some(OsStr::new(""))));
        assert!(should_apply_webkit_override(Some(OsStr::new("   "))));
    }

    #[test]
    fn webkit_override_respects_explicit_user_value() {
        assert!(!should_apply_webkit_override(Some(OsStr::new("1"))));
        assert!(!should_apply_webkit_override(Some(OsStr::new("0"))));
    }

    #[test]
    fn linux_webkit_overrides_target_known_egl_workaround_vars() {
        let keys: Vec<&str> = LINUX_WEBKIT_RENDER_OVERRIDES.iter().map(|o| o.key).collect();
        assert_eq!(
            keys,
            ["WEBKIT_DISABLE_DMABUF_RENDERER", "WEBKIT_DISABLE_COMPOSITING_MODE"]
        );
        assert!(LINUX_WEBKIT_RENDER_OVERRIDES.iter().all(|o| o.value == "1"));
        // Symbol must build on every platform so the Linux applier is type-checked in CI.
        let _f: fn() = apply_linux_webkit_overrides;
    }
}
