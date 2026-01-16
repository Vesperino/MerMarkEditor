use std::sync::Mutex;
use std::sync::atomic::{AtomicU32, Ordering};
use tauri::{Manager, Emitter, WebviewUrl, WebviewWindowBuilder};

// Store the file path to be opened (from CLI args or file association)
pub struct OpenFileState(pub Mutex<Option<String>>);

// Counter for unique window IDs
static WINDOW_COUNTER: AtomicU32 = AtomicU32::new(1);

#[tauri::command]
fn get_open_file_path(state: tauri::State<'_, OpenFileState>) -> Option<String> {
    let mut path = state.0.lock().unwrap();
    path.take()
}

#[tauri::command]
async fn create_new_window(app: tauri::AppHandle, file_path: Option<String>) -> Result<String, String> {
    let window_id = WINDOW_COUNTER.fetch_add(1, Ordering::SeqCst);
    let window_label = format!("window-{}", window_id);

    // Build the URL with file path as query parameter if provided
    let url = match &file_path {
        Some(path) => {
            // URL encode the path
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

    // Focus the new window
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
        .invoke_handler(tauri::generate_handler![get_open_file_path, create_new_window])
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
