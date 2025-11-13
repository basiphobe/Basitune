// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, PhysicalPosition, PhysicalSize};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use scraper::{Html, Selector};
use std::collections::HashMap;

// Volume normalization script
const VOLUME_NORMALIZER_SCRIPT: &str = include_str!("../../volume-normalizer.js");

// Artist info sidebar script
const SIDEBAR_SCRIPT: &str = include_str!("../../sidebar.js");

// Genius API token
const GENIUS_ACCESS_TOKEN: &str = "REMOVED_TOKEN";

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
struct CachedData {
    artist_info: HashMap<String, String>,
    song_context: HashMap<String, String>,
    lyrics: HashMap<String, String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    maximized: bool,
    sidebar_visible: bool,
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
    let cache_key = artist.to_lowercase().trim().to_string();
    
    // Try to load from cache
    let mut cache = load_cache(&app);
    
    if let Some(cached_info) = cache.artist_info.get(&cache_key) {
        println!("[Basitune] Using cached artist info for: {}", artist);
        return Ok(cached_info.clone());
    }
    
    println!("[Basitune] Fetching AI artist info for: {}", artist);
    
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
        artist.to_lowercase().trim(), 
        title.to_lowercase().trim()
    );
    
    // Try to load from cache
    let mut cache = load_cache(&app);
    
    if let Some(cached_context) = cache.song_context.get(&cache_key) {
        println!("[Basitune] Using cached song context for: {} - {}", title, artist);
        return Ok(cached_context.clone());
    }
    
    println!("[Basitune] Fetching AI song context for: {} - {}", title, artist);
    
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

#[derive(Debug, Serialize, Deserialize)]
struct GeniusResult {
    url: String,
    title: String,
    primary_artist: GeniusArtist,
}

#[derive(Debug, Serialize, Deserialize)]
struct GeniusArtist {
    name: String,
}

#[tauri::command]
async fn get_lyrics(title: String, artist: String, app: tauri::AppHandle) -> Result<String, String> {
    // Create cache key (normalized artist + title)
    let cache_key = format!("{}|{}", 
        artist.to_lowercase().trim(), 
        title.to_lowercase().trim()
    );
    
    // Try to load from cache
    let cache = load_cache(&app);
    
    if let Some(cached_lyrics) = cache.lyrics.get(&cache_key) {
        println!("[Basitune] Using cached lyrics for: {} - {}", artist, title);
        return Ok(cached_lyrics.clone());
    }
    
    // Need mutable cache for writing
    let mut cache = cache;
    
    println!("[Basitune] Fetching lyrics for: {} - {}", artist, title);
    
    // Clean up title - remove extra info like (Acoustic), (Remastered), etc. for better matching
    let clean_title = title
        .replace("(Acoustic)", "")
        .replace("(acoustic)", "")
        .replace("(Remastered)", "")
        .replace("(remastered)", "")
        .replace("(Live)", "")
        .replace("(live)", "")
        .trim()
        .to_string();
    
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
    
    let response = client
        .get(&search_url)
        .header("Authorization", format!("Bearer {}", GENIUS_ACCESS_TOKEN))
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
    
    println!("[Basitune] Found song URL: {} (Artist: {}, Title: {})", 
             song_url, best_match.result.primary_artist.name, best_match.result.title);
    
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
    
    // Then clean with AI (async operation)
    let result = format_lyrics_with_ai(&raw_lyrics).await?;
    
    // Save to cache
    cache.lyrics.insert(cache_key, result.clone());
    save_cache(&app, &cache);
    
    Ok(result)
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
        "Clean and format these song lyrics. Remove any non-lyric content like headers, footers, \
        contributor names, 'Embed' text, navigation elements, or advertisements. Keep only the actual \
        song lyrics with proper structure (verses, chorus, bridge, etc.). Preserve line breaks and spacing \
        that are part of the song structure. Return ONLY the cleaned lyrics, nothing else.\n\n{}",
        raw_lyrics
    );
    
    call_openai(prompt, 500).await
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

fn get_state_path(app_handle: &tauri::AppHandle) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("window-state.json")
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

fn load_window_state(app_handle: &tauri::AppHandle) -> WindowState {
    let state_path = get_state_path(app_handle);
    
    if let Ok(contents) = fs::read_to_string(&state_path) {
        if let Ok(state) = serde_json::from_str::<WindowState>(&contents) {
            println!("[Basitune] Loaded window state: {}x{} at ({}, {}), maximized={}, sidebar_visible={}", 
                     state.width, state.height, state.x, state.y, state.maximized, state.sidebar_visible);
            return state;
        }
    }
    
    println!("[Basitune] Using default window state");
    WindowState::default()
}

fn save_window_state(app_handle: &tauri::AppHandle, state: &WindowState) {
    let state_path = get_state_path(app_handle);
    
    // Ensure directory exists
    if let Some(parent) = state_path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    
    if let Ok(json) = serde_json::to_string_pretty(state) {
        println!("[Basitune] Saving window state: {}x{} at ({}, {}), maximized={}, sidebar_visible={}", 
                 state.width, state.height, state.x, state.y, state.maximized, state.sidebar_visible);
        let _ = fs::write(&state_path, json);
    }
}

#[tauri::command]
fn get_sidebar_visible(app: tauri::AppHandle) -> bool {
    load_window_state(&app).sidebar_visible
}

#[tauri::command]
fn set_sidebar_visible(app: tauri::AppHandle, visible: bool) {
    println!("[Basitune] set_sidebar_visible called with: {}", visible);
    let mut state = load_window_state(&app);
    state.sidebar_visible = visible;
    save_window_state(&app, &state);
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When a second instance is attempted, focus the existing window
            let windows = app.webview_windows();
            if let Some(window) = windows.values().next() {
                let _ = window.set_focus();
                let _ = window.unminimize();
                println!("[Basitune] Focused existing instance");
            }
        }))
        .invoke_handler(tauri::generate_handler![
            get_artist_info, 
            get_song_context, 
            get_lyrics,
            get_sidebar_visible,
            set_sidebar_visible
        ])
        .setup(|app| {
            // Check for updates on startup
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                use tauri_plugin_updater::UpdaterExt;
                
                match app_handle.updater() {
                    Ok(updater) => {
                        match updater.check().await {
                            Ok(Some(update)) => {
                                println!("[Basitune] Update available: {}", update.version);
                                
                                // Download and install with progress callbacks
                                let download_result = update.download_and_install(
                                    |_chunk_length, _content_length| {},  // Download progress
                                    || {}  // Before exit
                                ).await;
                                
                                if let Err(e) = download_result {
                                    eprintln!("[Basitune] Failed to install update: {}", e);
                                }
                            }
                            Ok(None) => println!("[Basitune] No updates available"),
                            Err(e) => eprintln!("[Basitune] Failed to check for updates: {}", e),
                        }
                    }
                    Err(e) => eprintln!("[Basitune] Failed to get updater: {}", e),
                }
            });
            
            // Get the main window
            let window = app.get_webview_window("main").expect("Failed to get main window");
            
            println!("[Basitune] Window created");
            
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
                            
                            if let Ok(size) = window_inner.inner_size() {
                                if let Ok(position) = window_inner.outer_position() {
                                    let is_maximized = window_inner.is_maximized().unwrap_or(false);
                                    
                                    let mut state = load_window_state(&app_handle_inner);
                                    // Preserve sidebar_visible - only update geometry
                                    state.width = size.width;
                                    state.height = size.height;
                                    state.x = position.x;
                                    state.y = position.y;
                                    state.maximized = is_maximized;
                                    // sidebar_visible is preserved from load_window_state
                                    
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
                    
                    // Try to inject volume normalizer
                    if window_clone.eval(VOLUME_NORMALIZER_SCRIPT).is_ok() {
                        println!("[Basitune] Volume normalization injected successfully (attempt {})", attempt);
                        break;
                    } else if attempt == 10 {
                        eprintln!("[Basitune] Failed to inject volume normalizer after {} attempts", attempt);
                    }
                }
                
                // Retry sidebar injection separately
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
