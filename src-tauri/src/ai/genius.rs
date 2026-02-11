use serde::{Deserialize, Serialize};
use scraper::{Html, Selector};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct GeniusSearchResponse {
    pub response: GeniusResponseData,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeniusResponseData {
    pub hits: Vec<GeniusHit>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GeniusHit {
    pub result: GeniusResult,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeniusResult {
    pub url: String,
    pub title: String,
    pub primary_artist: GeniusArtist,
    #[serde(rename = "type")]
    pub result_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GeniusArtist {
    pub name: String,
}

#[tauri::command]
pub async fn get_lyrics(title: String, artist: String, app: tauri::AppHandle) -> Result<String, String> {
    use crate::cache::{load_cache, update_lyrics};
    use crate::utils::{normalize_string, clean_song_title, clean_lyrics_with_regex};
    use crate::config::get_genius_token;
    use crate::ai::openai::format_lyrics_with_ai;

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
    
    // Save to cache atomically
    update_lyrics(&app, cache_key, result.clone());
    
    Ok(result)
}

#[tauri::command]
pub async fn search_lyrics(title: String, artist: String, app: tauri::AppHandle) -> Result<Vec<GeniusResult>, String> {
    use crate::utils::clean_song_title;
    use crate::config::get_genius_token;

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
