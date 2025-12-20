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
use notify_rust::Notification;

// Discord Application ID (public identifier, not a secret)
const DISCORD_APP_ID: &str = "1438326240997281943";

// Playback state
struct PlaybackState {
    state: Mutex<String>, // "none", "paused", or "playing"
    current_song: Mutex<Option<(String, String)>>, // (title, artist)
}

impl PlaybackState {
    fn new() -> Self {
        Self {
            state: Mutex::new("none".to_string()),
            current_song: Mutex::new(None),
        }
    }
    
    fn set_state(&self, new_state: String) {
        *self.state.lock().unwrap() = new_state;
    }
    
    fn get_state(&self) -> String {
        self.state.lock().unwrap().clone()
    }
    
    fn set_current_song(&self, title: String, artist: String) {
        *self.current_song.lock().unwrap() = Some((title, artist));
    }
    
    fn clear_current_song(&self) {
        *self.current_song.lock().unwrap() = None;
    }
    
    fn get_current_song(&self) -> Option<(String, String)> {
        self.current_song.lock().unwrap().clone()
    }
}

#[derive(Debug, Serialize, Deserialize, Default)]
struct ApiConfig {
    openai_api_key: Option<String>,
    genius_access_token: Option<String>,
    close_to_tray: Option<bool>,
    enable_notifications: Option<bool>,
}

fn get_config_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("config.json")
}

fn load_config(app_handle: &tauri::AppHandle) -> ApiConfig {
    let config_path = get_config_path(app_handle);
    
    if let Ok(contents) = fs::read_to_string(&config_path) {
        if let Ok(config) = serde_json::from_str(&contents) {
            return config;
        }
    }
    
    ApiConfig::default()
}

fn get_genius_token(app_handle: &tauri::AppHandle) -> Option<String> {
    // First try environment variable (for development)
    if let Ok(token) = std::env::var("GENIUS_ACCESS_TOKEN") {
        return Some(token);
    }
    
    // Then try config file (for release builds)
    let config = load_config(app_handle);
    config.genius_access_token
}

fn get_openai_key(app_handle: &tauri::AppHandle) -> Option<String> {
    // First try environment variable (for development)
    if let Ok(key) = std::env::var("OPENAI_API_KEY") {
        return Some(key);
    }
    
    // Then try config file (for release builds)
    let config = load_config(app_handle);
    config.openai_api_key
}

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<ApiConfig, String> {
    Ok(load_config(&app))
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, openai_api_key: String, genius_access_token: String, close_to_tray: bool, enable_notifications: bool) -> Result<(), String> {
    let config = ApiConfig {
        openai_api_key: if openai_api_key.is_empty() { None } else { Some(openai_api_key) },
        genius_access_token: if genius_access_token.is_empty() { None } else { Some(genius_access_token) },
        close_to_tray: Some(close_to_tray),
        enable_notifications: Some(enable_notifications),
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

#[derive(Debug, Serialize)]
struct AppMetadata {
    name: String,
    version: String,
    identifier: String,
}

#[tauri::command]
fn get_app_metadata(app: tauri::AppHandle) -> Result<AppMetadata, String> {
    Ok(AppMetadata {
        name: app.config().product_name.clone().unwrap_or_else(|| "Basitune".to_string()),
        version: app.config().version.clone().unwrap_or_else(|| "Unknown".to_string()),
        identifier: app.config().identifier.clone(),
    })
}

#[tauri::command]
fn get_changelog() -> Result<String, String> {
    // Read CHANGELOG.md from the project root
    fs::read_to_string("../CHANGELOG.md")
        .or_else(|_| fs::read_to_string("CHANGELOG.md"))
        .or_else(|_| fs::read_to_string("../../CHANGELOG.md"))
        .map_err(|e| format!("Failed to read CHANGELOG.md: {}", e))
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
                serde_json::from_str::<WindowState>(&contents).unwrap_or_default()
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

async fn call_openai(prompt: String, max_tokens: u32, app_handle: &tauri::AppHandle) -> Result<String, String> {
    let api_key = get_openai_key(app_handle)
        .ok_or_else(|| "OpenAI API key not configured. Please add it to config.json in your app data directory.".to_string())?;
    
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
    
    let result = call_openai(prompt, 500, &app).await?;
    
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
    
    let result = call_openai(prompt, 500, &app).await?;
    
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
    #[serde(rename = "type")]
    result_type: Option<String>,
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
        // Validate cached content isn't prose/literature
        // Check for common prose patterns that indicate non-lyrics content
        let is_prose = cached_lyrics.contains("he said") 
            || cached_lyrics.contains("she said")
            || cached_lyrics.contains("he sat")
            || cached_lyrics.contains("she sat")
            || (cached_lyrics.contains(" the ") && cached_lyrics.len() > 500 && !cached_lyrics.contains("[Chorus]") && !cached_lyrics.contains("[Verse]"));
        
        if !is_prose {
            return Ok(cached_lyrics.clone());
        }
        // If it looks like prose, fall through to re-fetch with filtering
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
    
    let genius_token = get_genius_token(&app)
        .ok_or_else(|| "Genius API token not configured. Please add it to config.json in your app data directory.".to_string())?;
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
    
    // Find best matching result that is actually a song
    let best_match = search_result
        .response
        .hits
        .iter()
        .filter(|hit| {
            // Only accept results that are explicitly songs
            // Reject if type is explicitly not "song" or if URL suggests non-song content
            match &hit.result.result_type {
                Some(t) => t == "song",
                None => {
                    // If type is missing, check URL for red flags (literature, books, etc.)
                    let url_lower = hit.result.url.to_lowercase();
                    !url_lower.contains("/literature/") && !url_lower.contains("/books/")
                }
            }
        })
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
        .or_else(|| {
            // Fallback: get first result that is explicitly type="song"
            search_result.response.hits.iter()
                .find(|hit| match &hit.result.result_type {
                    Some(t) => t == "song",
                    None => false, // Don't accept unknown types in fallback
                })
        })
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
    let result = match format_lyrics_with_ai(&raw_lyrics, &app).await {
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
async fn search_lyrics(title: String, artist: String, app: tauri::AppHandle) -> Result<Vec<GeniusResult>, String> {
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
    
    let genius_token = get_genius_token(&app)
        .ok_or_else(|| "Genius API token not configured. Please add it to config.json in your app data directory.".to_string())?;
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
    
    // Return top 10 results for suggestions (don't filter here - let user see all matches)
    // The filtering happens in get_lyrics to prevent auto-fetching non-song content
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

async fn format_lyrics_with_ai(raw_lyrics: &str, app_handle: &tauri::AppHandle) -> Result<String, String> {
    let prompt = format!(
        "Clean and format this text. Remove any web page elements like headers, footers, \
        contributor names, 'Embed' text, navigation elements, advertisements, or metadata. \
        Keep only the main content with proper structure and formatting. Preserve line breaks \
        and spacing that are part of the content structure. Return ONLY the cleaned text.\n\n{}",
        raw_lyrics
    );
    
    call_openai(prompt, 500, app_handle).await
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
fn save_sidebar_font_size(state_manager: tauri::State<WindowStateManager>, font_size: u32) {
    state_manager.update_no_save(|state| {
        state.sidebar_font_size = font_size;
    });
}

#[tauri::command]
async fn toggle_sidebar(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
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
async fn resize_sidebar(app: tauri::AppHandle, width: u32) -> Result<(), String> {
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

#[tauri::command]
fn update_discord_presence(
    title: String,
    artist: String,
    state: tauri::State<DiscordState>
) -> Result<(), String> {
    let mut client_opt = state.client.lock().unwrap();
    
    let details_text = title.to_string();
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

#[tauri::command]
async fn playback_play(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    let _ = window.eval("window.basitunePlayback ? window.basitunePlayback.play() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
async fn playback_pause(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    let _ = window.eval("window.basitunePlayback ? window.basitunePlayback.pause() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
async fn playback_toggle(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    let _ = window.eval("window.basitunePlayback ? window.basitunePlayback.togglePlayPause() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
async fn playback_stop(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    let _ = window.eval("window.basitunePlayback ? window.basitunePlayback.stop() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
async fn playback_next(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    let _ = window.eval("window.basitunePlayback ? window.basitunePlayback.next() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
async fn playback_previous(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app.get_webview_window("main")
        .ok_or("Main window not found")?;
    
    let _ = window.eval("window.basitunePlayback ? window.basitunePlayback.previous() : false")
        .map_err(|e| e.to_string())?;
    
    Ok(true)
}

#[tauri::command]
async fn playback_is_playing(app: tauri::AppHandle) -> Result<bool, String> {
    let playback_state: tauri::State<PlaybackState> = app.state();
    Ok(playback_state.get_state() == "playing")
}

#[tauri::command]
fn update_playback_state(state: String, app: tauri::AppHandle) -> Result<(), String> {
    let playback_state: tauri::State<PlaybackState> = app.state();
    playback_state.set_state(state.clone());
    rebuild_tray_menu(&app, &state)?;
    Ok(())
}

#[tauri::command]
fn update_tray_tooltip(title: String, artist: String, app: tauri::AppHandle) -> Result<(), String> {
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
fn show_notification(
    title: String, 
    artist: String, 
    duration: Option<String>,
    album: Option<String>,
    app: tauri::AppHandle
) -> Result<(), String> {
    // Check if notifications are enabled
    let config = load_config(&app);
    let enabled = config.enable_notifications.unwrap_or(false);
    
    if !enabled {
        println!("[Basitune] Notifications disabled, skipping");
        return Ok(());
    }
    
    // Build the notification body - single line for better compatibility with action buttons
    let mut body_parts = vec![format!("by {}", artist)];
    
    if let Some(album_name) = album {
        if !album_name.is_empty() {
            body_parts.push(format!("from {}", album_name));
        }
    }
    
    if let Some(dur) = duration {
        if !dur.is_empty() {
            body_parts.push(dur);
        }
    }
    
    let body = body_parts.join(" • ");
    
    // Clone app handle for the action handler thread
    let app_clone = app.clone();
    
    // Show notification with action buttons
    std::thread::spawn(move || {
        let notification_result = Notification::new()
            .summary(&format!("🎵 {}", title))
            .body(&body)
            .appname("Basitune")
            .timeout(5000) // 5 seconds
            .action("previous", "⏮️ Previous")
            .action("next", "⏭️ Next")
            .show();
        
        match notification_result {
            Ok(handle) => {
                // Wait for user interaction (blocks until notification closes or action clicked)
                handle.wait_for_action(|action| {
                    match action {
                        "previous" => {
                            if let Some(window) = app_clone.get_webview_window("main") {
                                let _ = window.eval(r#"
                                    (function() {
                                        const prevBtn = document.querySelector('ytmusic-player-bar .previous-button')
                                            || document.querySelector('[aria-label="Previous"]')
                                            || document.querySelector('[aria-label="Previous track"]');
                                        if (prevBtn) prevBtn.click();
                                    })();
                                "#);
                            }
                        },
                        "next" => {
                            if let Some(window) = app_clone.get_webview_window("main") {
                                let _ = window.eval(r#"
                                    (function() {
                                        const nextBtn = document.querySelector('ytmusic-player-bar .next-button')
                                            || document.querySelector('[aria-label="Next"]')
                                            || document.querySelector('[aria-label="Next track"]');
                                        if (nextBtn) nextBtn.click();
                                    })();
                                "#);
                            }
                        },
                        _ => {}
                    }
                });
            },
            Err(e) => {
                eprintln!("[Basitune] Failed to show notification: {}", e);
            }
        }
    });
    
    Ok(())
}

fn rebuild_tray_menu(app: &tauri::AppHandle, state: &str) -> Result<(), String> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    
    let playback_state: tauri::State<PlaybackState> = app.state();
    let current_song = playback_state.get_current_song();
    
    // Build base menu items
    let show_hide = MenuItem::with_id(app, "show_hide", "Show/Hide", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let separator1 = PredefinedMenuItem::separator(app)
        .map_err(|e| e.to_string())?;
    let separator2 = PredefinedMenuItem::separator(app)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let previous_track = MenuItem::with_id(app, "previous_track", "Previous Track", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let next_track = MenuItem::with_id(app, "next_track", "Next Track", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    
    // Build menu based on state
    let menu = if let Some((title, artist)) = current_song {
        // Song is playing/loaded - show song info
        let song_text = format!("♪ {} - {}", title, artist);
        let now_playing = MenuItem::with_id(app, "now_playing", &song_text, false, None::<&str>)
            .map_err(|e| e.to_string())?;
        let separator_song = PredefinedMenuItem::separator(app)
            .map_err(|e| e.to_string())?;
        
        match state {
            "playing" => {
                let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                let stop = MenuItem::with_id(app, "stop", "Stop", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &now_playing,
                    &separator_song,
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &pause,
                    &stop,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            },
            "paused" => {
                let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                let stop = MenuItem::with_id(app, "stop", "Stop", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &now_playing,
                    &separator_song,
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &play,
                    &stop,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            },
            _ => {
                let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &now_playing,
                    &separator_song,
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &play,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            }
        }
    } else {
        // No song - standard menu
        match state {
            "playing" => {
                let pause = MenuItem::with_id(app, "pause", "Pause", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                let stop = MenuItem::with_id(app, "stop", "Stop", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &pause,
                    &stop,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            },
            "paused" => {
                let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                let stop = MenuItem::with_id(app, "stop", "Stop", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &play,
                    &stop,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            },
            _ => {
                let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)
                    .map_err(|e| e.to_string())?;
                
                Menu::with_items(app, &[
                    &show_hide,
                    &separator1,
                    &previous_track,
                    &play,
                    &next_track,
                    &separator2,
                    &quit
                ]).map_err(|e| e.to_string())?
            }
        }
    };
    
    // Get the tray and update its menu
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))
            .map_err(|e| e.to_string())?;
    } else {
        return Err("Tray not found".to_string());
    }
    
    Ok(())
}

fn main() {
    // Don't connect to Discord on startup - connect lazily when first activity is set
    // This avoids breaking the pipe immediately if the app isn't registered yet
    let discord_state = DiscordState {
        client: Mutex::new(None),
    };
    
    let playback_state = PlaybackState::new();
    
    tauri::Builder::default()
        .manage(discord_state)
        .manage(playback_state)
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        // Inject sidebar + volume helpers on every page load so they survive navigations
        .on_page_load(|window, _payload| {
            let sidebar_script = include_str!("../../sidebar.js");
            // let volume_script = include_str!("../../volume-fix.js");
            let diagnostics_script = include_str!("../../audio-diagnostics.js");
            let playback_script = include_str!("../../playback-controls.js");

            if let Err(e) = window.eval(sidebar_script) {
                eprintln!("[Basitune] Failed to inject sidebar: {}", e);
            } else {
                println!("[Basitune] Sidebar injected via on_page_load");
            }

            // Temporarily disabled to test if volume-fix.js is causing audio dropouts
            // if let Err(e) = window.eval(volume_script) {
            //     eprintln!("[Basitune] Failed to inject volume bridge: {}", e);
            // } else {
            //     println!("[Basitune] Volume bridge injected via on_page_load");
            // }

            if let Err(e) = window.eval(diagnostics_script) {
                eprintln!("[Basitune] Failed to inject audio diagnostics: {}", e);
            } else {
                println!("[Basitune] Audio diagnostics injected via on_page_load");
            }

            if let Err(e) = window.eval(playback_script) {
                eprintln!("[Basitune] Failed to inject playback controls: {}", e);
            } else {
                println!("[Basitune] Playback controls injected via on_page_load");
            }
        })
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
            save_sidebar_font_size,
            toggle_sidebar,
            resize_sidebar,
            update_discord_presence,
            clear_discord_presence,
            get_config,
            save_config,
            get_app_metadata,
            get_changelog,
            playback_play,
            playback_pause,
            playback_toggle,
            playback_stop,
            playback_next,
            playback_previous,
            playback_is_playing,
            update_playback_state,
            update_tray_tooltip,
            show_notification
        ])
        .setup(|app| {
            use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
            use tauri::tray::{TrayIconBuilder, TrayIconEvent};
            
            // Build initial tray menu (nothing playing at startup)
            let show_hide = MenuItem::with_id(app, "show_hide", "Show/Hide", true, None::<&str>)?;
            let previous_track = MenuItem::with_id(app, "previous_track", "Previous Track", true, None::<&str>)?;
            let play = MenuItem::with_id(app, "play", "Play", true, None::<&str>)?;
            let next_track = MenuItem::with_id(app, "next_track", "Next Track", true, None::<&str>)?;
            
            let separator1 = PredefinedMenuItem::separator(app)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            
            let menu = Menu::with_items(app, &[
                &show_hide,
                &separator1,
                &previous_track,
                &play,
                &next_track,
                &separator2,
                &quit
            ])?;
            
            // Load and decode tray icon
            let icon_bytes = include_bytes!("../icons/32x32.png");
            let img = image::load_from_memory(icon_bytes)
                .map_err(|e| format!("Failed to load tray icon: {}", e))?
                .into_rgba8();
            let (width, height) = img.dimensions();
            let icon = tauri::image::Image::new_owned(img.into_raw(), width, height);
            
            // Build tray icon
            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(icon)
                .menu(&menu)
                .tooltip("Basitune")
                .on_menu_event(|app, event| {
                    match event.id().as_ref() {
                        "show_hide" => {
                            if let Some(window) = app.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                    let _ = window.unminimize();
                                }
                            }
                        }
                        "play" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval("window.basitunePlayback && window.basitunePlayback.play()");
                                }
                            });
                        }
                        "previous_track" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval("window.basitunePlayback && window.basitunePlayback.previous()");
                                }
                            });
                        }
                        "pause" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval("window.basitunePlayback && window.basitunePlayback.togglePlayPause()");
                                }
                            });
                        }
                        "stop" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval("window.basitunePlayback && window.basitunePlayback.stop()");
                                }
                            });
                        }
                        "next_track" => {
                            let app_clone = app.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Some(window) = app_clone.get_webview_window("main") {
                                    let _ = window.eval("window.basitunePlayback && window.basitunePlayback.next()");
                                }
                            });
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { .. } = event {
                        if let Some(app) = tray.app_handle().get_webview_window("main") {
                            if app.is_visible().unwrap_or(false) {
                                let _ = app.hide();
                            } else {
                                let _ = app.show();
                                let _ = app.set_focus();
                                let _ = app.unminimize();
                            }
                        }
                    }
                })
                .build(app)?;
            
            // Initialize window state manager
            let state_manager = WindowStateManager::new(app.handle().clone());
            let state = state_manager.get();
            app.manage(state_manager);
            
            // Check for updates on startup (skip in debug/dev to avoid noisy failures)
            let is_dev = cfg!(debug_assertions);
            if !is_dev {
                let app_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    use tauri_plugin_updater::UpdaterExt;
                    
                    // Wait a few seconds before checking for updates
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    
                    match app_handle.updater() {
                        Ok(updater) => {
                            match updater.check().await {
                                Ok(Some(update)) => {
                                    println!("[Basitune] Update available: {} -> {}", 
                                        update.current_version, update.version);
                                    
                                    // Notify user that update is downloading
                                    if let Some(window) = app_handle.get_webview_window("main") {
                                        let _ = window.eval(format!(
                                            r#"window.showUpdateNotification('Downloading update {}...', false)"#,
                                            update.version
                                        ));
                                    }
                                    
                                    // Download and install with progress
                                    let window = app_handle.get_webview_window("main");
                                    let download_result = update.download_and_install(
                                        |chunk_length, content_length| {
                                            if let (Some(total), Some(w)) = (content_length, &window) {
                                                let percent = (chunk_length as f64 / total as f64 * 100.0) as u32;
                                                let _ = w.eval(format!(
                                                    r#"window.updateDownloadProgress({})"#, percent
                                                ));
                                            }
                                        },
                                        || {
                                            println!("[Basitune] Update installed, restart to apply");
                                        }
                                    ).await;
                                    
                                    match download_result {
                                        Ok(_) => {
                                            println!("[Basitune] Update downloaded and ready to install");
                                            if let Some(w) = app_handle.get_webview_window("main") {
                                                let _ = w.eval(
                                                    r#"window.showUpdateNotification('Update ready! Restart Basitune to apply.', true)"#
                                                );
                                            }
                                        }
                                        Err(e) => {
                                            eprintln!("[Basitune] Failed to install update: {}", e);
                                            if let Some(w) = app_handle.get_webview_window("main") {
                                                let _ = w.eval(
                                                    r#"window.showUpdateNotification('Update failed. Please try again later.', true)"#
                                                );
                                            }
                                        }
                                    }
                                }
                                Ok(None) => {
                                    println!("[Basitune] No updates available");
                                }
                                Err(e) => {
                                    eprintln!("[Basitune] Failed to check for updates: {}", e);
                                }
                            }
                        }
                        Err(e) => eprintln!("[Basitune] Failed to get updater: {}", e),
                    }
                });
            } else {
                println!("[Basitune] Skipping updater in debug/dev builds");
            }
            
            // Get the main window
            let main_window = app.get_webview_window("main").expect("Failed to get main window");
            
            // Apply saved window state
            println!("[Basitune] Applying window state: {}x{} at ({}, {}), maximized={}", 
                     state.width, state.height, state.x, state.y, state.maximized);
            
            if state.maximized {
                let _ = main_window.unmaximize();
                std::thread::sleep(Duration::from_millis(50));
                
                let _ = main_window.set_size(PhysicalSize::new(state.width, state.height));
                if state.x >= 0 && state.y >= 0 {
                    let _ = main_window.set_position(PhysicalPosition::new(state.x, state.y));
                }
                
                std::thread::sleep(Duration::from_millis(50));
                let _ = main_window.maximize();
            } else {
                let _ = main_window.set_size(PhysicalSize::new(state.width, state.height));
                if state.x >= 0 && state.y >= 0 {
                    let _ = main_window.set_position(PhysicalPosition::new(state.x, state.y));
                }
            }
            
            // Show the window
            let _ = main_window.show();

            // Handle window close event - either minimize to tray or save state and exit
            let app_handle = app.handle().clone();
            let window_clone = main_window.clone();
            main_window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // Check if close-to-tray is enabled
                    let config = load_config(&app_handle);
                    let close_to_tray = config.close_to_tray.unwrap_or(false);
                    
                    if close_to_tray {
                        // Hide window instead of closing
                        println!("[Basitune] Closing to tray");
                        let _ = window_clone.hide();
                        api.prevent_close();
                    } else {
                        // Save window state before exiting
                        if let Ok(size) = window_clone.inner_size() {
                            if let Ok(position) = window_clone.outer_position() {
                                let is_maximized = window_clone.is_maximized().unwrap_or(false);
                                
                                println!("[Basitune] Saving window state on close");
                                
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
                }
            });
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
