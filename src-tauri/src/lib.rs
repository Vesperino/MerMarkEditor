use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{Manager, Emitter, WebviewUrl, WebviewWindowBuilder, RunEvent, WindowEvent};
use serde::{Deserialize, Serialize};

// Store the file path to be opened (from CLI args or file association)
pub struct OpenFileState(pub Mutex<Option<String>>);

// Counter for unique window IDs
static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

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
            if args.len() > 1 {
                let file_path = &args[1];
                if file_path.ends_with(".md") || file_path.ends_with(".markdown") {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("open-file", file_path.clone());
                        let _ = window.set_focus();
                    }
                }
            } else {
                // No file argument, just focus the existing window
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_focus();
                }
            }
        }))
        .manage(OpenFileState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            get_open_file_path,
            create_new_window,
            get_all_windows,
            get_current_window_label,
            transfer_tab_to_window
        ])
        .setup(|app| {
            // Check for CLI arguments (file association on first launch)
            let args: Vec<String> = std::env::args().collect();
            if args.len() > 1 {
                let file_path = &args[1];
                if file_path.ends_with(".md") || file_path.ends_with(".markdown") {
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
