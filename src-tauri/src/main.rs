// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, PhysicalPosition, PhysicalSize};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use scraper::{Html, Selector};
use std::collections::HashMap;
use std::sync::Mutex;
use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};

// Artist info sidebar script
const SIDEBAR_SCRIPT: &str = include_str!("../../sidebar.js");

// Discord Application ID (public identifier, not a secret)
const DISCORD_APP_ID: &str = "1438326240997281943";

fn get_genius_token() -> Result<String, String> {
    std::env::var("GENIUS_ACCESS_TOKEN")
        .map_err(|_| "GENIUS_ACCESS_TOKEN environment variable not set".to_string())
}

struct DiscordState {
    client: Mutex<Option<DiscordIpcClient>>,
}

struct WindowStateManager {
    state: Mutex<WindowState>,
    app_handle: tauri::AppHandle,
}

impl WindowStateManager {
    fn new(app_handle: tauri::AppHandle) -> Self {
        let state_path = Self::get_state_path(&app_handle);
        let loaded_state = match fs::read_to_string(&state_path) {
            Ok(contents) => {
                match serde_json::from_str::<WindowState>(&contents) {
                    Ok(state) => {
                        state
                    }
                    Err(_) => {
                        WindowState::default()
                    }
                }
            }
            Err(_) => {
                WindowState::default()
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
    
    fn get(&self) -> WindowState {
        self.state.lock().unwrap().clone()
    }
    
    fn update_no_save<F>(&self, f: F)
    where
        F: FnOnce(&mut WindowState),
    {
        let mut state = self.state.lock().unwrap();
        f(&mut state);
        drop(state);  // Explicitly drop the lock
        // Don't save to disk
    }
    
    fn save_silent(&self) {
        let state = self.state.lock().unwrap();
        self.save_to_disk(&state);
    }
    
    fn save_to_disk(&self, state: &WindowState) {
        let state_path = Self::get_state_path(&self.app_handle);
        
        // Ensure directory exists
        if let Some(parent) = state_path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        
        if let Ok(json) = serde_json::to_string_pretty(state) {
            let _ = fs::write(&state_path, json);
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct CachedData {
    artist_info: HashMap<String, String>,
    song_context: HashMap<String, String>,
    lyrics: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    maximized: bool,
    sidebar_visible: bool,
    sidebar_width: u32,
    sidebar_font_size: u32,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIRequest {
    model: String,
    messages: Vec<OpenAIMessage>,
    max_tokens: u32,
    temperature: f32,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIMessage {
    role: String,
    content: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIResponse {
    choices: Vec<OpenAIChoice>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OpenAIChoice {
    message: OpenAIMessage,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            width: 1200,
            height: 800,
            x: -1,
            y: -1,
            maximized: false,
            sidebar_visible: false,
            sidebar_width: 380,
            sidebar_font_size: 14,
        }
    }
}

async fn call_openai(prompt: String, max_tokens: u32) -> Result<String, String> {
    let api_key = std::env::var("OPENAI_API_KEY")
        .map_err(|_| "OPENAI_API_KEY environment variable not set".to_string())?;
    
    let request = OpenAIRequest {
        model: "gpt-4o-mini".to_string(),
        messages: vec![OpenAIMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        max_tokens,
        temperature: 0.7,
    };
    
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(&request)
        .send()
        .await
        .map_err(|e| format!("OpenAI request failed: {}", e))?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI API error {}: {}", status, error_text));
    }
    
    let result: OpenAIResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;
    
    result
        .choices
        .first()
        .map(|choice| choice.message.content.clone())
        .ok_or_else(|| "No response from OpenAI".to_string())
}

#[tauri::command]
async fn get_artist_info(artist: String, app: tauri::AppHandle) -> Result<String, String> {
    // Create cache key (normalized artist name)
    let cache_key = normalize_string(&artist);
    
    // Try to load from cache
    let mut cache = load_cache(&app);
    
    if let Some(cached_info) = cache.artist_info.get(&cache_key) {
        return Ok(cached_info.clone());
    }
    
    let prompt = format!(
        "Provide a brief, 2-3 paragraph summary about the music artist/band '{}'. Include their genre, notable achievements, and impact on music. Keep it concise and informative.",
        artist
    );
    
    let result = call_openai(prompt, 500).await?;
    
    // Save to cache
    cache.artist_info.insert(cache_key, result.clone());
    save_cache(&app, &cache);
    
    Ok(result)
}

#[tauri::command]
async fn get_song_context(title: String, artist: String, app: tauri::AppHandle) -> Result<String, String> {
    // Create cache key (normalized artist + title)
    let cache_key = format!("{}|{}", 
        normalize_string(&artist), 
        normalize_string(&title)
    );
    
    // Try to load from cache
    let mut cache = load_cache(&app);
    
    if let Some(cached_context) = cache.song_context.get(&cache_key) {
        return Ok(cached_context.clone());
    }
    
    let prompt = format!(
        "Provide a brief analysis of the song '{}' by {}. Focus on its themes, meaning, and musical significance. Keep it to 2-3 paragraphs.",
        title, artist
    );
    
    let result = call_openai(prompt, 500).await?;
    
    // Save to cache
    cache.song_context.insert(cache_key, result.clone());
    save_cache(&app, &cache);
    
    Ok(result)
}

#[derive(Debug, Serialize, Deserialize)]
struct GeniusSearchResponse {
    response: GeniusResponseData,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeniusResponseData {
    hits: Vec<GeniusHit>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeniusHit {
    result: GeniusResult,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GeniusResult {
    url: String,
    title: String,
    primary_artist: GeniusArtist,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct GeniusArtist {
    name: String,
}

#[tauri::command]
async fn get_lyrics(title: String, artist: String, app: tauri::AppHandle) -> Result<String, String> {
    // Create cache key (normalized artist + title)
    let cache_key = format!("{}|{}", 
        normalize_string(&artist), 
        normalize_string(&title)
    );
    
    // Try to load from cache
    let cache = load_cache(&app);
    
    if let Some(cached_lyrics) = cache.lyrics.get(&cache_key) {
        return Ok(cached_lyrics.clone());
    }
    
    // Need mutable cache for writing
    let mut cache = cache;
    
    // Clean up title - remove extra info like (Acoustic), (Remastered), dates, etc. for better matching
    let clean_title = clean_song_title(&title);
    
    // Search Genius API for the song
    let search_query = format!("{} {}", artist, clean_title);
    let search_url = format!(
        "https://api.genius.com/search?q={}",
        urlencoding::encode(&search_query)
    );
    
    let client = reqwest::Client::builder()
        .user_agent("Basitune/0.1.0 (https://github.com/basiphobe/Basitune)")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    
    let genius_token = get_genius_token()?;
    let response = client
        .get(&search_url)
        .header("Authorization", format!("Bearer {}", genius_token))
        .send()
        .await
        .map_err(|e| format!("Search request failed: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Genius API returned status: {}", response.status()));
    }
    
    let search_result: GeniusSearchResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse search results: {}", e))?;
    
    // Find best matching result
    let best_match = search_result
        .response
        .hits
        .iter()
        .find(|hit| {
            // Check if artist name matches (case-insensitive, approximate)
            let result_artist = hit.result.primary_artist.name.to_lowercase();
            let search_artist = artist.to_lowercase();
            
            // Check if title matches (case-insensitive, approximate)
            let result_title = hit.result.title.to_lowercase();
            let search_title = clean_title.to_lowercase();
            
            // Artist must contain or match closely
            let artist_match = result_artist.contains(&search_artist) || search_artist.contains(&result_artist);
            
            // Title must contain the main words (not just be mentioned in a playlist)
            let title_match = result_title.contains(&search_title) || search_title.contains(&result_title);
            
            artist_match && title_match
        })
        .or_else(|| search_result.response.hits.first())
        .ok_or("No results found")?;
    
    let song_url = &best_match.result.url;
    
    // Scrape lyrics from the song page
    let lyrics_response = client
        .get(song_url.as_str())
        .send()
        .await
        .map_err(|e| format!("Failed to fetch lyrics page: {}", e))?;
    
    let html = lyrics_response
        .text()
        .await
        .map_err(|e| format!("Failed to read HTML: {}", e))?;
    
    // Extract raw lyrics first (sync operation)
    let raw_lyrics = extract_raw_lyrics_from_html(&html)?;
    
    // Try to clean with AI, but fall back to raw lyrics if AI refuses (copyright policy)
    let result = match format_lyrics_with_ai(&raw_lyrics).await {
        Ok(cleaned) => {
            // Check if AI refused to provide lyrics
            if cleaned.to_lowercase().contains("i can't provide") 
                || cleaned.to_lowercase().contains("i cannot provide")
                || cleaned.to_lowercase().contains("i'm sorry") {

                clean_lyrics_with_regex(&raw_lyrics)
            } else {
                cleaned
            }
        }
        Err(_) => {

            clean_lyrics_with_regex(&raw_lyrics)
        }
    };
    
    // Save to cache
    cache.lyrics.insert(cache_key, result.clone());
    save_cache(&app, &cache);
    
    Ok(result)
}

#[tauri::command]
async fn search_lyrics(title: String, artist: String) -> Result<Vec<GeniusResult>, String> {
    let clean_title = clean_song_title(&title);
    let search_query = format!("{} {}", artist, clean_title);
    let search_url = format!(
        "https://api.genius.com/search?q={}",
        urlencoding::encode(&search_query)
    );
    
    let client = reqwest::Client::builder()
        .user_agent("Basitune/0.1.0 (https://github.com/basiphobe/Basitune)")
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    
    let genius_token = get_genius_token()?;
    let response = client
        .get(&search_url)
        .header("Authorization", format!("Bearer {}", genius_token))
        .send()
        .await
        .map_err(|e| format!("Search request failed: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("Genius API returned status: {}", response.status()));
    }
    
    let search_result: GeniusSearchResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse search results: {}", e))?;
    
    // Return top 10 results
    Ok(search_result.response.hits
        .into_iter()
        .take(10)
        .map(|hit| hit.result)
        .collect())
}

fn extract_raw_lyrics_from_html(html: &str) -> Result<String, String> {
    let document = Html::parse_document(html);
    
    // Genius uses data-lyrics-container attribute for lyrics containers
    let selector = Selector::parse("[data-lyrics-container='true']")
        .map_err(|e| format!("Invalid selector: {:?}", e))?;
    
    let mut lyrics = String::new();
    
    for element in document.select(&selector) {
        // Get text content, preserving line breaks
        for node in element.descendants() {
            if let Some(text) = node.value().as_text() {
                lyrics.push_str(text);
            } else if node.value().is_element() {
                let element_ref = scraper::ElementRef::wrap(node).unwrap();
                if element_ref.value().name() == "br" {
                    lyrics.push('\n');
                }
            }
        }
        lyrics.push_str("\n\n");
    }
    
    let lyrics = lyrics.trim().to_string();
    
    if lyrics.is_empty() {
        Err("Could not extract lyrics from page".to_string())
    } else {
        Ok(lyrics)
    }
}

async fn format_lyrics_with_ai(raw_lyrics: &str) -> Result<String, String> {
    let prompt = format!(
        "Clean and format this text. Remove any web page elements like headers, footers, \
        contributor names, 'Embed' text, navigation elements, advertisements, or metadata. \
        Keep only the main content with proper structure and formatting. Preserve line breaks \
        and spacing that are part of the content structure. Return ONLY the cleaned text.\n\n{}",
        raw_lyrics
    );
    
    call_openai(prompt, 500).await
}

fn normalize_string(s: &str) -> String {
    // Normalize Unicode characters, convert to lowercase, trim whitespace
    // This handles cases like "Queensrÿche" vs "Queensryche"
    s.trim()
        .to_lowercase()
        .chars()
        .map(|c| {
            // Replace common special characters with ASCII equivalents
            match c {
                'ä' | 'á' | 'à' | 'â' | 'ã' | 'å' => 'a',
                'ë' | 'é' | 'è' | 'ê' => 'e',
                'ï' | 'í' | 'ì' | 'î' => 'i',
                'ö' | 'ó' | 'ò' | 'ô' | 'õ' => 'o',
                'ü' | 'ú' | 'ù' | 'û' => 'u',
                'ÿ' | 'ý' => 'y',
                'ñ' => 'n',
                'ç' => 'c',
                _ => c,
            }
        })
        .collect()
}

fn clean_song_title(title: &str) -> String {
    use regex::Regex;
    
    // Remove patterns like (Remastered 2003), [2003 Remaster], - 2003 Remaster, etc.
    let patterns = [
        r"\([^)]*[Rr]emast[^)]*\)",  // (Remastered 2003), (2003 Remaster)
        r"\[[^\]]*[Rr]emast[^\]]*\]",  // [Remastered 2003]
        r"\([^)]*[Aa]coustic[^)]*\)",  // (Acoustic)
        r"\([^)]*[Ll]ive[^)]*\)",      // (Live at...)
        r"\([^)]*[Vv]ersion[^)]*\)",   // (Album Version)
        r"\([^)]*[Ee]dit[^)]*\)",      // (Radio Edit)
        r"\([^)]*\d{4}[^)]*\)",       // (2003), (2003 Version)
        r"\[[^\]]*\d{4}[^\]]*\]",     // [2003]
        r"-\s*\d{4}\s*[Rr]emast[^-]*",  // - 2003 Remastered
        r"-\s*[Rr]emast[^-]*",          // - Remastered
    ];
    
    let mut result = title.to_string();
    for pattern in &patterns {
        if let Ok(re) = Regex::new(pattern) {
            result = re.replace_all(&result, "").to_string();
        }
    }
    
    result.trim().to_string()
}

fn clean_lyrics_with_regex(lyrics: &str) -> String {
    let mut lines: Vec<&str> = lyrics.lines().collect();
    
    // Remove common Genius page elements from the beginning
    while !lines.is_empty() {
        let first_line = lines[0].trim();
        
        // Check if it's a common header pattern
        if first_line.is_empty()
            || first_line.ends_with("Contributors")
            || first_line.ends_with("Lyrics")
            || first_line.starts_with("\"")
            || first_line.contains("is a song about")
            || first_line.contains("Read More")
            || (first_line.len() < 50 && first_line.chars().filter(|c| c.is_uppercase()).count() > first_line.len() / 2)
        {
            lines.remove(0);
        } else {
            break;
        }
    }
    
    // Remove "Embed" and other footers from the end
    while !lines.is_empty() {
        let last_line = lines[lines.len() - 1].trim();
        
        if last_line.is_empty()
            || last_line == "Embed"
            || last_line.starts_with("See ")
            || last_line.contains("Lyrics")
        {
            lines.pop();
        } else {
            break;
        }
    }
    
    lines.join("\n").trim().to_string()
}

#[allow(dead_code)]
fn _clean_genius_lyrics_old(lyrics: &str) -> String {
    // Old regex-based cleaning - kept for reference
    let mut lines: Vec<&str> = lyrics.lines().collect();
    
    // Remove common Genius page elements from the beginning
    while !lines.is_empty() {
        let first_line = lines[0].trim();
        
        // Check if it's a common header pattern
        if first_line.is_empty()
            || first_line.ends_with("Contributors")
            || first_line.ends_with("Lyrics")
            || first_line.starts_with("\"")
            || first_line.contains("is a song about")
            || first_line.contains("Read More")
            || (first_line.len() < 50 && first_line.chars().filter(|c| c.is_uppercase()).count() > first_line.len() / 2)
        {
            lines.remove(0);
        } else {
            break;
        }
    }
    
    // Remove "Embed" and other footers from the end
    while !lines.is_empty() {
        let last_line = lines[lines.len() - 1].trim();
        
        if last_line.is_empty()
            || last_line == "Embed"
            || last_line.starts_with("See ")
            || last_line.contains("Lyrics")
        {
            lines.pop();
        } else {
            break;
        }
    }
    
    lines.join("\n").trim().to_string()
}

fn get_cache_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("content-cache.json")
}

fn load_cache(app_handle: &tauri::AppHandle) -> CachedData {
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

fn save_cache(app_handle: &tauri::AppHandle, cache: &CachedData) {
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

#[tauri::command]
fn get_sidebar_visible(state_manager: tauri::State<WindowStateManager>) -> bool {
    state_manager.get().sidebar_visible
}

#[tauri::command]
fn set_sidebar_visible(state_manager: tauri::State<WindowStateManager>, visible: bool) {

    state_manager.update_no_save(|state| {
        state.sidebar_visible = visible;
    });
}

#[tauri::command]
fn get_sidebar_width(state_manager: tauri::State<WindowStateManager>) -> u32 {
    state_manager.get().sidebar_width
}

#[tauri::command]
fn set_sidebar_width(state_manager: tauri::State<WindowStateManager>, width: u32) {

    state_manager.update_no_save(|state| {
        state.sidebar_width = width;
    });
}

#[tauri::command]
fn get_sidebar_font_size(state_manager: tauri::State<WindowStateManager>) -> u32 {
    state_manager.get().sidebar_font_size
}

#[tauri::command]
fn set_sidebar_font_size(state_manager: tauri::State<WindowStateManager>, font_size: u32) {

    state_manager.update_no_save(|state| {
        state.sidebar_font_size = font_size;
    });
}

#[tauri::command]
fn update_discord_presence(
    title: String,
    artist: String,
    state: tauri::State<DiscordState>
) -> Result<(), String> {
    let mut client_opt = state.client.lock().unwrap();
    
    let details_text = format!("{}", title);
    let state_text = format!("by {}", artist);
    
    if let Some(client) = client_opt.as_mut() {
        let payload = activity::Activity::new()
            .details(&details_text)
            .state(&state_text)
            .assets(activity::Assets::new().large_text("Basitune"));
            
        match client.set_activity(payload) {
            Ok(_) => {

                Ok(())
            }
            Err(e) => {
                eprintln!("[Basitune] Failed to update Discord presence: {}", e);
                
                // Try to reconnect on connection errors

                drop(client_opt.take()); // Drop the old client
                
                if let Ok(mut new_client) = DiscordIpcClient::new(DISCORD_APP_ID) {
                    match new_client.connect() {
                        Ok(_) => {

                            let retry_payload = activity::Activity::new()
                                .details(&details_text)
                                .state(&state_text)
                                .assets(activity::Assets::new().large_text("Basitune"));
                            
                            match new_client.set_activity(retry_payload) {
                                Ok(_) => {

                                    *client_opt = Some(new_client);
                                    return Ok(());
                                }
                                Err(e2) => {
                                    eprintln!("[Basitune] Failed to set presence after reconnect: {}", e2);
                                }
                            }
                        }
                        Err(e2) => {
                            eprintln!("[Basitune] Failed to reconnect: {}", e2);
                        }
                    }
                }
                Ok(())
            }
        }
    } else {

        if let Ok(mut new_client) = DiscordIpcClient::new(DISCORD_APP_ID) {
            match new_client.connect() {
                Ok(_) => {

                    let payload = activity::Activity::new()
                        .details(&details_text)
                        .state(&state_text)
                        .assets(activity::Assets::new().large_text("Basitune"));
                    
                    match new_client.set_activity(payload) {
                        Ok(_) => {

                            *client_opt = Some(new_client);
                        }
                        Err(e) => {
                            eprintln!("[Basitune] Failed to set Discord presence: {}", e);
                            eprintln!("[Basitune] This usually means the Discord App ID is not registered.");
                            eprintln!("[Basitune] Register your app at: https://discord.com/developers/applications");
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[Basitune] Failed to connect to Discord: {}", e);
                    eprintln!("[Basitune] Make sure Discord is running.");
                }
            }
        }
        Ok(())
    }
}

#[tauri::command]
fn clear_discord_presence(state: tauri::State<DiscordState>) -> Result<(), String> {
    let mut client_opt = state.client.lock().unwrap();
    
    if let Some(client) = client_opt.as_mut() {
        match client.clear_activity() {
            Ok(_) => {
                // println!("[Basitune] Discord presence cleared");
                Ok(())
            }
            Err(_e) => {
                // Silently ignore errors
                // eprintln!("[Basitune] Failed to clear Discord presence: {}", e);
                Ok(())
            }
        }
    } else {
        Ok(()) // Silently ignore if not connected
    }
}

fn main() {
    // Don't connect to Discord on startup - connect lazily when first activity is set
    // This avoids breaking the pipe immediately if the app isn't registered yet
    let discord_state = DiscordState {
        client: Mutex::new(None),
    };
    
    tauri::Builder::default()
        .manage(discord_state)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When a second instance is attempted, focus the existing window
            let windows = app.webview_windows();
            if let Some(window) = windows.values().next() {
                let _ = window.set_focus();
                let _ = window.unminimize();

            }
        }))
        .invoke_handler(tauri::generate_handler![
            get_artist_info, 
            get_song_context, 
            get_lyrics,
            search_lyrics,
            get_sidebar_visible,
            set_sidebar_visible,
            get_sidebar_width,
            set_sidebar_width,
            get_sidebar_font_size,
            set_sidebar_font_size,
            update_discord_presence,
            clear_discord_presence
        ])
        .setup(|app| {
            // Initialize window state manager
            let state_manager = WindowStateManager::new(app.handle().clone());
            app.manage(state_manager);
            
            // Check for updates on startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_updater::UpdaterExt;
                
                match app_handle.updater() {
                    Ok(updater) => {
                        match updater.check().await {
                            Ok(Some(update)) => {

                                
                                // Download and install with progress callbacks
                                let download_result = update.download_and_install(
                                    |_chunk_length, _content_length| {},  // Download progress
                                    || {}  // Before exit
                                ).await;
                                
                                if let Err(e) = download_result {
                                    eprintln!("[Basitune] Failed to install update: {}", e);
                                }
                            }
                            Ok(None) => {},
                            Err(e) => eprintln!("[Basitune] Failed to check for updates: {}", e),
                        }
                    }
                    Err(e) => eprintln!("[Basitune] Failed to get updater: {}", e),
                }
            });
            
            // Get the main window
            let window = app.get_webview_window("main").expect("Failed to get main window");
            

            
            // Set the window title
            window.set_title("Basitune").unwrap();
            
            // Load and apply saved window state IMMEDIATELY before any event handlers
            let state_manager: tauri::State<WindowStateManager> = app.state();
            let state = state_manager.get();
            
            println!("[Basitune] Applying window state: {}x{} at ({}, {}), maximized={}", 
                     state.width, state.height, state.x, state.y, state.maximized);
            
            // Apply state before window can trigger any resize events
            if state.maximized {
                // For maximized windows: unmaximize, set position, set size, then maximize
                // This ensures the window manager knows which monitor to use
                let _ = window.unmaximize();
                std::thread::sleep(Duration::from_millis(50));
                
                let _ = window.set_size(PhysicalSize::new(state.width, state.height));
                if state.x >= 0 && state.y >= 0 {
                    let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
                    println!("[Basitune] Set position to ({}, {}) before maximizing", state.x, state.y);
                }
                
                std::thread::sleep(Duration::from_millis(50));
                let _ = window.maximize();
                println!("[Basitune] Maximized window");
            } else {
                // For non-maximized windows, set size then position
                let _ = window.set_size(PhysicalSize::new(state.width, state.height));
                if state.x >= 0 && state.y >= 0 {
                    let _ = window.set_position(PhysicalPosition::new(state.x, state.y));
                }
            }
            
            // Give a long moment for window state to fully settle
            std::thread::sleep(Duration::from_millis(1000));
            
            // Save window state ONLY on window close
            let app_handle = app.handle().clone();
            let window_clone = window.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::CloseRequested { .. } => {
                        // Save window state when closing
                        if let Ok(size) = window_clone.inner_size() {
                            if let Ok(position) = window_clone.outer_position() {
                                let is_maximized = window_clone.is_maximized().unwrap_or(false);
                                
                                println!("[Basitune] Window closing - saving final state: {}x{} at ({}, {}), maximized={}", 
                                         size.width, size.height, position.x, position.y, is_maximized);
                                
                                let state_manager: tauri::State<WindowStateManager> = app_handle.state();
                                state_manager.update_no_save(|state| {
                                    state.width = size.width;
                                    state.height = size.height;
                                    state.x = position.x;
                                    state.y = position.y;
                                    state.maximized = is_maximized;
                                });
                                state_manager.save_silent();
                            }
                        }
                    }
                    _ => {}
                }
            });
            
            // Clone window for async operations
            let window_clone = window.clone();
            
            // Inject debug script immediately to test if JS is running
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(1));
                
                let debug_script = r#"
                    console.log('[Basitune] DEBUG: JavaScript is executing');
                    console.log('[Basitune] DEBUG: Current URL:', window.location.href);
                    console.log('[Basitune] DEBUG: Document ready state:', document.readyState);
                    
                    // Try to force log to stdout via alert
                    const info = 'URL: ' + window.location.href + ', Ready: ' + document.readyState;
                    document.title = 'DEBUG: ' + info;
                "#;
                
                match window_clone.eval(debug_script) {
                    Ok(_) => println!("[Basitune] Debug script executed"),
                    Err(e) => eprintln!("[Basitune] Debug script failed: {}", e),
                }
                
                // Retry injection up to 10 times with 2-second intervals
                for attempt in 1..=10 {
                    std::thread::sleep(Duration::from_secs(2));
                    
                    if window_clone.eval(SIDEBAR_SCRIPT).is_ok() {
                        println!("[Basitune] Sidebar injected successfully (attempt {})", attempt);
                        break;
                    } else if attempt == 10 {
                        eprintln!("[Basitune] Failed to inject sidebar after {} attempts", attempt);
                    }
                }
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
