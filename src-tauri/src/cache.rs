use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct CachedData {
    pub artist_info: HashMap<String, String>,
    pub song_context: HashMap<String, String>,
    pub lyrics: HashMap<String, String>,
}

// Global mutex to prevent concurrent cache access
static CACHE_LOCK: Mutex<()> = Mutex::new(());

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
            // Only log once per app launch by checking if this is the first time
            // (subsequent loads happen frequently for API commands)
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
    } else {
        eprintln!("[Basitune] Failed to serialize cache to JSON");
    }
}

// Atomically update a single artist info entry
pub fn update_artist_info(app_handle: &tauri::AppHandle, key: String, value: String) {
    let _lock = CACHE_LOCK.lock().unwrap();
    let mut cache = load_cache(app_handle);
    cache.artist_info.insert(key, value);
    save_cache(app_handle, &cache);
}

// Atomically update a single song context entry
pub fn update_song_context(app_handle: &tauri::AppHandle, key: String, value: String) {
    let _lock = CACHE_LOCK.lock().unwrap();
    let mut cache = load_cache(app_handle);
    cache.song_context.insert(key, value);
    save_cache(app_handle, &cache);
}

// Atomically update a single lyrics entry
pub fn update_lyrics(app_handle: &tauri::AppHandle, key: String, value: String) {
    let _lock = CACHE_LOCK.lock().unwrap();
    let mut cache = load_cache(app_handle);
    cache.lyrics.insert(key, value);
    save_cache(app_handle, &cache);
}
