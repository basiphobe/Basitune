use std::sync::Mutex;
use tauri::Manager;

pub struct PlaybackState {
    state: Mutex<String>, // "none", "paused", or "playing"
    current_song: Mutex<Option<(String, String)>>, // (title, artist)
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            state: Mutex::new("none".to_string()),
            current_song: Mutex::new(None),
        }
    }
}

impl PlaybackState {
    pub fn new() -> Self {
        Self::default()
    }
    
    pub fn set_state(&self, new_state: String) {
        *self.state.lock().unwrap() = new_state;
    }
    
    pub fn get_state(&self) -> String {
        self.state.lock().unwrap().clone()
    }
    
    pub fn set_current_song(&self, title: String, artist: String) {
        *self.current_song.lock().unwrap() = Some((title, artist));
    }
    
    pub fn clear_current_song(&self) {
        *self.current_song.lock().unwrap() = None;
    }
    
    pub fn get_current_song(&self) -> Option<(String, String)> {
        self.current_song.lock().unwrap().clone()
    }
}

#[tauri::command]
pub async fn playback_play(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    window.eval("window.basitunePlayback ? window.basitunePlayback.play() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
pub async fn playback_pause(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    window.eval("window.basitunePlayback ? window.basitunePlayback.pause() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
pub async fn playback_toggle(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    window.eval("window.basitunePlayback ? window.basitunePlayback.togglePlayPause() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
pub async fn playback_stop(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    window.eval("window.basitunePlayback ? window.basitunePlayback.stop() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
pub async fn playback_next(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    window.eval("window.basitunePlayback ? window.basitunePlayback.next() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
pub async fn playback_previous(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    window.eval("window.basitunePlayback ? window.basitunePlayback.previous() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
pub async fn playback_is_playing(app: tauri::AppHandle) -> Result<bool, String> {
    let playback_state: tauri::State<PlaybackState> = app.state();
    Ok(playback_state.get_state() == "playing")
}

#[tauri::command]
pub fn update_playback_state(state: String, app: tauri::AppHandle) -> Result<(), String> {
    use crate::tray::rebuild_tray_menu;
    
    let playback_state: tauri::State<PlaybackState> = app.state();
    playback_state.set_state(state.clone());
    rebuild_tray_menu(&app, &state)?;
    Ok(())
}

#[tauri::command]
pub fn update_tray_tooltip(title: String, artist: String, app: tauri::AppHandle) -> Result<(), String> {
    use crate::tray::rebuild_tray_menu;
    
    let playback_state: tauri::State<PlaybackState> = app.state();
    
    if !title.is_empty() && !artist.is_empty() {
        playback_state.set_current_song(title.clone(), artist.clone());
    } else {
        playback_state.clear_current_song();
    }
    
    // Rebuild menu to show current song
    // Note: KDE Plasma with libayatana-appindicator (AppIndicator protocol) doesn't support
    // tray icon tooltips, so we display the song as a disabled menu item instead
    let state = playback_state.get_state();
    rebuild_tray_menu(&app, &state)?;
    
    Ok(())
}

#[tauri::command]
pub fn audio_context_ready() -> Result<(), String> {
    println!("[Basitune] Audio context ready signal received");
    Ok(())
}
