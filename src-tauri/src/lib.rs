use std::sync::Mutex;
use tauri::{Manager, Emitter};

// Store the file path to be opened (from CLI args or file association)
pub struct OpenFileState(pub Mutex<Option<String>>);

#[tauri::command]
fn get_open_file_path(state: tauri::State<'_, OpenFileState>) -> Option<String> {
    let mut path = state.0.lock().unwrap();
    path.take()
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
        .invoke_handler(tauri::generate_handler![get_open_file_path])
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
