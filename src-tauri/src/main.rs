// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, PhysicalPosition, PhysicalSize};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;

// Volume normalization script
const VOLUME_NORMALIZER_SCRIPT: &str = include_str!("../../volume-normalizer.js");

#[derive(Debug, Serialize, Deserialize)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: 1200,
            height: 800,
            x: -1,
            y: -1,
            maximized: false,
        }
    }
}

fn get_state_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("window-state.json")
}

fn load_window_state(app_handle: &tauri::AppHandle) -> WindowState {
    let state_path = get_state_path(app_handle);
    
    if let Ok(contents) = fs::read_to_string(&state_path) {
        if let Ok(state) = serde_json::from_str(&contents) {
            return state;
        }
    }
    
    WindowState::default()
}

fn save_window_state(app_handle: &tauri::AppHandle, state: &WindowState) {
    let state_path = get_state_path(app_handle);
    
    // Ensure directory exists
    if let Some(parent) = state_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = fs::write(&state_path, json);
    }
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Get the main window
            let window = app.get_webview_window("main").expect("Failed to get main window");
            
            // Set the window title
            window.set_title("Basitune").unwrap();
            
            // Load and apply saved window state
            let state = load_window_state(app.handle());
            
            if state.x >= 0 && state.y >= 0 {
                let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
            }
            let _ = window.set_size(PhysicalSize::new(state.width, state.height));
            
            if state.maximized {
                let _ = window.maximize();
            }
            
            // Save window state on resize
            let app_handle = app.handle().clone();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                        // Debounce saves by spawning a thread
                        let app_handle_inner = app_handle.clone();
                        let window_inner = window_clone.clone();
                        
                        std::thread::spawn(move || {
                            std::thread::sleep(Duration::from_millis(500));
                            
                            if let Ok(size) = window_inner.outer_size() {
                                if let Ok(position) = window_inner.outer_position() {
                                    let is_maximized = window_inner.is_maximized().unwrap_or(false);
                                    
                                    let state = WindowState {
                                        width: size.width,
                                        height: size.height,
                                        x: position.x,
                                        y: position.y,
                                        maximized: is_maximized,
                                    };
                                    
                                    save_window_state(&app_handle_inner, &state);
                                }
                            }
                        });
                    }
                    _ => {}
                }
            });
            
            // Clone window for async operations
            let window_clone = window.clone();
            
            // Inject volume normalization script after a delay to ensure page is loaded
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                let _ = window_clone.eval(VOLUME_NORMALIZER_SCRIPT);
                println!("[Basitune] Volume normalization injected");
            });
            
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
