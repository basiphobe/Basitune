// Prevents additional console window on Windows in release builds
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Manager, PhysicalPosition, PhysicalSize};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use scraper::{Html, Selector};

// Volume normalization script
const VOLUME_NORMALIZER_SCRIPT: &str = include_str!("../../volume-normalizer.js");

// Artist info sidebar script
const SIDEBAR_SCRIPT: &str = include_str!("../../sidebar.js");

// Genius API token
const GENIUS_ACCESS_TOKEN: &str = "REMOVED_TOKEN";

#[derive(Debug, Serialize, Deserialize)]
struct WindowState {
    width: u32,
    height: u32,
    x: i32,
    y: i32,
    maximized: bool,
}

#[derive(Debug, Serialize, Deserialize)]
struct WikipediaResponse {
    extract: String,
    thumbnail: Option<WikipediaThumbnail>,
}

#[derive(Debug, Serialize, Deserialize)]
struct WikipediaThumbnail {
    source: String,
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

#[tauri::command]
async fn get_artist_info(artist: String) -> Result<WikipediaResponse, String> {
    println!("[Basitune] Fetching Wikipedia info for: {}", artist);
    
    // First try with "(band)" appended
    let band_result = try_fetch_wikipedia(&format!("{} (band)", artist)).await;
    
    if let Ok(response) = band_result {
        if !response.extract.contains("refer to:") && !response.extract.contains("may also refer to") {
            println!("[Basitune] Found band-specific page");
            return Ok(response);
        }
    }
    
    // If that fails or is a disambiguation, try with "(musician)"
    let musician_result = try_fetch_wikipedia(&format!("{} (musician)", artist)).await;
    
    if let Ok(response) = musician_result {
        if !response.extract.contains("refer to:") && !response.extract.contains("may also refer to") {
            println!("[Basitune] Found musician-specific page");
            return Ok(response);
        }
    }
    
    // Fall back to exact artist name
    println!("[Basitune] Trying exact artist name");
    try_fetch_wikipedia(&artist).await
}

async fn try_fetch_wikipedia(search_term: &str) -> Result<WikipediaResponse, String> {
    let url = format!(
        "https://en.wikipedia.org/api/rest_v1/page/summary/{}",
        urlencoding::encode(search_term)
    );
    
    println!("[Basitune] Wikipedia URL: {}", url);
    
    let client = reqwest::Client::builder()
        .user_agent("Basitune/0.1.0 (https://github.com/basiphobe/Basitune)")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Request failed: {}", e))?;
    
    let status = response.status();
    println!("[Basitune] Wikipedia response status: {}", status);
    
    if !status.is_success() {
        if status.as_u16() == 404 {
            return Err("Not found".to_string());
        }
        return Err(format!("Wikipedia API returned status: {}", status));
    }
    
    let json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;
    
    println!("[Basitune] Received JSON response");
    
    let extract = json["extract"]
        .as_str()
        .unwrap_or("No information available.")
        .to_string();
    
    let thumbnail = json["thumbnail"]["source"]
        .as_str()
        .map(|s| WikipediaThumbnail {
            source: s.to_string(),
        });
    
    Ok(WikipediaResponse { extract, thumbnail })
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
async fn get_lyrics(title: String, artist: String) -> Result<String, String> {
    println!("[Basitune] Fetching lyrics for: {} - {}", artist, title);
    
    // Search Genius API for the song
    let search_query = format!("{} {}", artist, title);
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
    
    // Get the first hit
    let song_url = search_result
        .response
        .hits
        .first()
        .ok_or("No results found")?
        .result
        .url
        .clone();
    
    println!("[Basitune] Found song URL: {}", song_url);
    
    // Scrape lyrics from the song page
    let lyrics_response = client
        .get(&song_url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch lyrics page: {}", e))?;
    
    let html = lyrics_response
        .text()
        .await
        .map_err(|e| format!("Failed to read HTML: {}", e))?;
    
    extract_lyrics_from_html(&html)
}

fn extract_lyrics_from_html(html: &str) -> Result<String, String> {
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
        return Err("Could not extract lyrics from page".to_string());
    }
    
    // Clean up the lyrics - remove common non-lyric content
    let cleaned = clean_genius_lyrics(&lyrics);
    
    if cleaned.is_empty() {
        Err("Could not extract clean lyrics from page".to_string())
    } else {
        Ok(cleaned)
    }
}

fn clean_genius_lyrics(lyrics: &str) -> String {
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
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // When a second instance is attempted, focus the existing window
            let windows = app.webview_windows();
            if let Some(window) = windows.values().next() {
                let _ = window.set_focus();
                let _ = window.unminimize();
                println!("[Basitune] Focused existing instance");
            }
        }))
        .invoke_handler(tauri::generate_handler![get_artist_info, get_lyrics])
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
            
            // Inject scripts after a delay to ensure page is loaded
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                let _ = window_clone.eval(VOLUME_NORMALIZER_SCRIPT);
                println!("[Basitune] Volume normalization injected");
                
                // Inject sidebar script
                let _ = window_clone.eval(SIDEBAR_SCRIPT);
                println!("[Basitune] Sidebar injected");
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
