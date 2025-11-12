// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::Manager;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Get the main window
            let window = app.get_webview_window("main").expect("Failed to get main window");
            
            // Set the window title
            window.set_title("Basitune").unwrap();
            
            // Tauri automatically uses a persistent data directory for webviews
            // The data is stored in platform-specific locations:
            // - Linux: ~/.local/share/com.basitune.app
            // - macOS: ~/Library/Application Support/com.basitune.app
            // - Windows: %APPDATA%\com.basitune.app
            // This ensures cookies and login sessions persist across app restarts
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
