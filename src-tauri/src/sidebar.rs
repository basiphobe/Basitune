use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Manager, PhysicalPosition, PhysicalSize};

pub struct WindowStateManager {
    state: Mutex<crate::config::WindowState>,
    app_handle: tauri::AppHandle,
}

impl WindowStateManager {
    pub fn new(app_handle: tauri::AppHandle) -> Self {
        let state_path = Self::get_state_path(&app_handle);
        
        let loaded_state = match fs::read_to_string(&state_path) {
            Ok(contents) => {
                match serde_json::from_str::<crate::config::WindowState>(&contents) {
                    Ok(state) => state,
                    Err(e) => {
                        eprintln!("[Basitune] Failed to parse window state: {}", e);
                        crate::config::WindowState::default()
                    }
                }
            }
            Err(_) => {
                crate::config::WindowState::default()
            }
        };
        
        Self {
            state: Mutex::new(loaded_state),
            app_handle,
        }
    }
    
    fn get_state_path(app_handle: &tauri::AppHandle) -> PathBuf {
        let app_data_dir = app_handle.path().app_data_dir()
            .expect("Failed to get app data directory");
        app_data_dir.join("window-state.json")
    }
    
    pub fn get(&self) -> crate::config::WindowState {
        self.state.lock().unwrap().clone()
    }
    
    pub fn update_no_save<F>(&self, f: F)
    where
        F: FnOnce(&mut crate::config::WindowState),
    {
        let mut state = self.state.lock().unwrap();
        f(&mut state);
        drop(state);  // Explicitly drop the lock
        // Don't save to disk
    }
    
    pub fn save_silent(&self) {
        let state = self.state.lock().unwrap();
        self.save_to_disk(&state);
    }
    
    fn save_to_disk(&self, state: &crate::config::WindowState) {
        let state_path = Self::get_state_path(&self.app_handle);
        
        // Ensure directory exists
        if let Some(parent) = state_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        
        if let Ok(json) = serde_json::to_string_pretty(state) {
            if let Err(e) = fs::write(&state_path, json) {
                eprintln!("[Basitune] Failed to save window state: {}", e);
            }
        } else {
            eprintln!("[Basitune] Failed to serialize window state");
        }
    }
}

#[tauri::command]
pub fn get_sidebar_visible(state_manager: tauri::State<WindowStateManager>) -> bool {
    state_manager.get().sidebar_visible
}

#[tauri::command]
pub fn set_sidebar_visible(state_manager: tauri::State<WindowStateManager>, visible: bool) {
    state_manager.update_no_save(|state| {
        state.sidebar_visible = visible;
    });
}

#[tauri::command]
pub fn get_sidebar_width(state_manager: tauri::State<WindowStateManager>) -> u32 {
    state_manager.get().sidebar_width
}

#[tauri::command]
pub fn set_sidebar_width(state_manager: tauri::State<WindowStateManager>, width: u32) {
    state_manager.update_no_save(|state| {
        state.sidebar_width = width;
    });
}

#[tauri::command]
pub fn get_sidebar_font_size(state_manager: tauri::State<WindowStateManager>) -> u32 {
    state_manager.get().sidebar_font_size
}

#[tauri::command]
pub fn set_sidebar_font_size(state_manager: tauri::State<WindowStateManager>, font_size: u32) {
    state_manager.update_no_save(|state| {
        state.sidebar_font_size = font_size;
    });
}

#[tauri::command]
pub fn save_sidebar_font_size(state_manager: tauri::State<WindowStateManager>, font_size: u32) {
    state_manager.update_no_save(|state| {
        state.sidebar_font_size = font_size;
    });
}

#[tauri::command]
pub async fn toggle_sidebar(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
    let state_manager: tauri::State<WindowStateManager> = app.state();
    let sidebar_width = state_manager.get().sidebar_width;
    
    // Update state
    state_manager.update_no_save(|state| {
        state.sidebar_visible = visible;
    });
    
    // Get windows
    let youtube_window = app.get_webview_window("youtube")
        .ok_or("YouTube window not found")?;
    let sidebar_window = app.get_webview_window("sidebar")
        .ok_or("Sidebar window not found")?;
    
    // Get main window size
    let main_size = youtube_window.outer_size().map_err(|e| e.to_string())?;
    let main_pos = youtube_window.outer_position().map_err(|e| e.to_string())?;
    
    if visible {
        // Show sidebar and resize YouTube
        let youtube_width = main_size.width.saturating_sub(sidebar_width);
        youtube_window.set_size(PhysicalSize::new(youtube_width, main_size.height))
            .map_err(|e| e.to_string())?;
        
        // Position and show sidebar
        sidebar_window.set_position(PhysicalPosition::new(
            main_pos.x + youtube_width as i32,
            main_pos.y
        )).map_err(|e| e.to_string())?;
        
        sidebar_window.set_size(PhysicalSize::new(sidebar_width, main_size.height))
            .map_err(|e| e.to_string())?;
        
        sidebar_window.show().map_err(|e| e.to_string())?;
    } else {
        // Hide sidebar and expand YouTube
        sidebar_window.hide().map_err(|e| e.to_string())?;
        youtube_window.set_size(PhysicalSize::new(main_size.width, main_size.height))
            .map_err(|e| e.to_string())?;
    }
    
    Ok(())
}

#[tauri::command]
pub async fn resize_sidebar(app: tauri::AppHandle, width: u32) -> Result<(), String> {
    let state_manager: tauri::State<WindowStateManager> = app.state();
    
    // Update state
    state_manager.update_no_save(|state| {
        state.sidebar_width = width;
    });
    
    // Get windows
    let youtube_window = app.get_webview_window("youtube")
        .ok_or("YouTube window not found")?;
    let sidebar_window = app.get_webview_window("sidebar")
        .ok_or("Sidebar window not found")?;
    
    // Get current sizes
    let youtube_size = youtube_window.outer_size().map_err(|e| e.to_string())?;
    let youtube_pos = youtube_window.outer_position().map_err(|e| e.to_string())?;
    
    // Calculate total width
    let total_width = youtube_size.width + width;
    let youtube_width = total_width.saturating_sub(width);
    
    // Resize YouTube window
    youtube_window.set_size(PhysicalSize::new(youtube_width, youtube_size.height))
        .map_err(|e| e.to_string())?;
    
    // Reposition and resize sidebar
    sidebar_window.set_position(PhysicalPosition::new(
        youtube_pos.x + youtube_width as i32,
        youtube_pos.y
    )).map_err(|e| e.to_string())?;
    
    sidebar_window.set_size(PhysicalSize::new(width, youtube_size.height))
        .map_err(|e| e.to_string())?;
    
    Ok(())
}
