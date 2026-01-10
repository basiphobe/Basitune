use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct ApiConfig {
    pub openai_api_key: Option<String>,
    pub genius_access_token: Option<String>,
    pub close_to_tray: Option<bool>,
    pub enable_notifications: Option<bool>,
    pub resume_playback_on_startup: Option<bool>,
    // Playback position persistence
    pub last_song_artist: Option<String>,
    pub last_song_title: Option<String>,
    pub last_position_seconds: Option<f64>,
    pub was_playing: Option<bool>,
    // Visualizer settings
    pub visualizer_style: Option<String>,
    pub visualizer_color: Option<String>,
    pub visualizer_sensitivity: Option<f64>,
    pub color_palette: Option<String>,
    pub animation_speed: Option<f64>,
    pub glow_enabled: Option<bool>,
    pub glow_intensity: Option<f64>,
    pub bar_spacing: Option<f64>,
    pub particle_count: Option<i32>,
    pub line_thickness: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VisualizerSettings {
    pub style: String,
    pub color: String,
    pub sensitivity: f64,
    pub color_palette: String,
    pub animation_speed: f64,
    pub glow_enabled: bool,
    pub glow_intensity: f64,
    pub bar_spacing: f64,
    pub particle_count: i32,
    pub line_thickness: f64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowState {
    pub width: u32,
    pub height: u32,
    pub x: i32,
    pub y: i32,
    pub maximized: bool,
    pub monitor_index: Option<usize>, // Which monitor (0-indexed)
    pub sidebar_visible: bool,
    pub sidebar_width: u32,
    pub sidebar_font_size: u32,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: 1280,
            height: 720,
            x: 100,
            y: 100,
            maximized: false,
            monitor_index: None,
            sidebar_visible: false,
            sidebar_width: 400,
            sidebar_font_size: 14,
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PlaybackPosition {
    pub artist: String,
    pub title: String,
    pub position_seconds: f64,
    pub was_playing: bool,
}

pub fn get_config_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("config.json")
}

pub fn load_config(app_handle: &tauri::AppHandle) -> ApiConfig {
    let config_path = get_config_path(app_handle);
    
    if let Ok(contents) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str(&contents) {
            return config;
        }
    }
    
    ApiConfig::default()
}

pub fn get_genius_token(app_handle: &tauri::AppHandle) -> Option<String> {
    // First try environment variable (for development)
    if let Ok(token) = std::env::var("GENIUS_ACCESS_TOKEN") {
        return Some(token);
    }
    
    // Then try config file (for release builds)
    let config = load_config(app_handle);
    config.genius_access_token
}

pub fn get_openai_key(app_handle: &tauri::AppHandle) -> Option<String> {
    // First try environment variable (for development)
    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        return Some(key);
    }
    
    // Then try config file (for release builds)
    let config = load_config(app_handle);
    config.openai_api_key
}

#[tauri::command]
pub fn get_config(app: tauri::AppHandle) -> Result<ApiConfig, String> {
    Ok(load_config(&app))
}

#[tauri::command]
pub fn save_config(app: tauri::AppHandle, openai_api_key: String, genius_access_token: String, close_to_tray: bool, enable_notifications: bool, resume_playback_on_startup: bool) -> Result<(), String> {
    // Load existing config to preserve playback state and visualizer settings
    let existing = load_config(&app);
    
    let config = ApiConfig {
        openai_api_key: if openai_api_key.is_empty() { None } else { Some(openai_api_key) },
        genius_access_token: if genius_access_token.is_empty() { None } else { Some(genius_access_token) },
        close_to_tray: Some(close_to_tray),
        enable_notifications: Some(enable_notifications),
        resume_playback_on_startup: Some(resume_playback_on_startup),
        // Preserve playback state
        last_song_artist: existing.last_song_artist,
        last_song_title: existing.last_song_title,
        last_position_seconds: existing.last_position_seconds,
        was_playing: existing.was_playing,
        // Preserve visualizer settings
        visualizer_style: existing.visualizer_style,
        visualizer_color: existing.visualizer_color,
        visualizer_sensitivity: existing.visualizer_sensitivity,
        color_palette: existing.color_palette,
        animation_speed: existing.animation_speed,
        glow_enabled: existing.glow_enabled,
        glow_intensity: existing.glow_intensity,
        bar_spacing: existing.bar_spacing,
        particle_count: existing.particle_count,
        line_thickness: existing.line_thickness,
    };
    
    let config_path = get_config_path(&app);
    
    // Ensure the directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    // Serialize and write config
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn save_visualizer_settings(app: tauri::AppHandle, settings: VisualizerSettings) -> Result<(), String> {
    // Load existing config to preserve other settings
    let mut config = load_config(&app);
    
    // Update visualizer settings
    config.visualizer_style = Some(settings.style);
    config.visualizer_color = Some(settings.color);
    config.visualizer_sensitivity = Some(settings.sensitivity);
    config.color_palette = Some(settings.color_palette);
    config.animation_speed = Some(settings.animation_speed);
    config.glow_enabled = Some(settings.glow_enabled);
    config.glow_intensity = Some(settings.glow_intensity);
    config.bar_spacing = Some(settings.bar_spacing);
    config.particle_count = Some(settings.particle_count);
    config.line_thickness = Some(settings.line_thickness);
    
    let config_path = get_config_path(&app);
    
    // Ensure the directory exists
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    // Serialize and write config
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    Ok(())
}

#[tauri::command]
pub fn save_playback_position(app: tauri::AppHandle, artist: String, title: String, position_seconds: f64, was_playing: bool) -> Result<(), String> {
    // Load existing config
    let mut config = load_config(&app);
    
    // Update playback state
    config.last_song_artist = Some(artist);
    config.last_song_title = Some(title);
    config.last_position_seconds = Some(position_seconds);
    config.was_playing = Some(was_playing);
    
    // Save config
    let config_path = get_config_path(&app);
    
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    let json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    fs::write(&config_path, json)
        .map_err(|e| format!("Failed to write config file: {}", e))?;
    
    println!("[Basitune] Saved playback position: {} - {} at {:.1}s (playing: {})", 
             config.last_song_artist.as_ref().unwrap(),
             config.last_song_title.as_ref().unwrap(),
             position_seconds,
             was_playing);
    
    Ok(())
}

#[tauri::command]
pub fn get_playback_position(app: tauri::AppHandle) -> Result<Option<PlaybackPosition>, String> {
    let config = load_config(&app);
    
    if let (Some(artist), Some(title), Some(position), Some(was_playing)) = (
        config.last_song_artist,
        config.last_song_title,
        config.last_position_seconds,
        config.was_playing,
    ) {
        Ok(Some(PlaybackPosition {
            artist,
            title,
            position_seconds: position,
            was_playing,
        }))
    } else {
        Ok(None)
    }
}
