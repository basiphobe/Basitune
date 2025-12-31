use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CachedData {
    pub artist_info: HashMap<String, String>,
    pub song_context: HashMap<String, String>,
    pub lyrics: HashMap<String, String>,
}

pub fn get_cache_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("content-cache.json")
}

pub fn load_cache(app_handle: &tauri::AppHandle) -> CachedData {
    let cache_path = get_cache_path(app_handle);
    
    if let Ok(contents) = fs::read_to_string(&cache_path) {
        if let Ok(cache) = serde_json::from_str::<CachedData>(&contents) {
            println!("[Basitune] Loaded cache with {} artists, {} songs, {} lyrics", 
                     cache.artist_info.len(), cache.song_context.len(), cache.lyrics.len());
            return cache;
        }
    }
    
    CachedData::default()
}

pub fn save_cache(app_handle: &tauri::AppHandle, cache: &CachedData) {
    let cache_path = get_cache_path(app_handle);
    
    // Ensure directory exists
    if let Some(parent) = cache_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    
    if let Ok(json) = serde_json::to_string_pretty(cache) {
        if let Err(e) = fs::write(&cache_path, json) {
            eprintln!("[Basitune] Failed to save cache: {}", e);
        }
    }
}
