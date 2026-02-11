use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIRequest {
    pub model: String,
    pub messages: Vec<OpenAIMessage>,
    pub max_tokens: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIResponse {
    pub choices: Vec<OpenAIChoice>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OpenAIChoice {
    pub message: OpenAIMessage,
}

pub async fn call_openai(prompt: String, max_tokens: u32, app_handle: &tauri::AppHandle) -> Result<String, String> {
    let api_key = crate::config::get_openai_key(app_handle)
        .ok_or_else(|| "OpenAI API key not configured. Please add it to config.json in your app data directory.".to_string())?;
    
    let request = OpenAIRequest {
        model: "gpt-4o-mini".to_string(),
        messages: vec![OpenAIMessage {
            role: "user".to_string(),
            content: prompt,
        }],
        max_tokens,
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
    
    let result: OpenAIResponse = response.json().await
        .map_err(|e| format!("Failed to parse OpenAI response: {}", e))?;
    
    result
        .choices
        .first()
        .map(|choice| choice.message.content.clone())
        .ok_or_else(|| "No response from OpenAI".to_string())
}

#[tauri::command]
pub async fn get_artist_info(artist: String, app: tauri::AppHandle) -> Result<String, String> {
    use crate::cache::{load_cache, update_artist_info};
    use crate::utils::normalize_string;

    // Create cache key (normalized artist name)
    let cache_key = normalize_string(&artist);
    
    // Try to load from cache
    let cache = load_cache(&app);
    
    if let Some(cached_info) = cache.artist_info.get(&cache_key) {
        // Reject empty cached values (from previous API failures)
        if !cached_info.trim().is_empty() {
            return Ok(cached_info.clone());
        }
    }
    
    let prompt = format!(
        "Provide a brief, 2-3 paragraph summary about the music artist/band '{}'. Include their genre, notable achievements, and impact on music. Keep it concise and informative.",
        artist
    );
    
    let result = call_openai(prompt, 500, &app).await?;
    
    // Save to cache atomically
    update_artist_info(&app, cache_key, result.clone());
    
    Ok(result)
}

#[tauri::command]
pub async fn get_song_context(title: String, artist: String, app: tauri::AppHandle) -> Result<String, String> {
    use crate::cache::{load_cache, update_song_context};
    use crate::utils::normalize_string;

    // Create cache key (normalized artist + title)
    let cache_key = format!("{}|{}", 
        normalize_string(&artist), 
        normalize_string(&title)
    );
    
    // Try to load from cache
    let cache = load_cache(&app);
    
    if let Some(cached_context) = cache.song_context.get(&cache_key) {
        // Reject empty cached values (from previous API failures)
        if !cached_context.trim().is_empty() {
            return Ok(cached_context.clone());
        }
    }
    
    let prompt = format!(
        "Provide a brief analysis of the song '{}' by {}. Focus on its themes, meaning, and musical significance. Keep it to 2-3 paragraphs.",
        title, artist
    );
    
    let result = call_openai(prompt, 500, &app).await?;
    
    // Save to cache atomically
    update_song_context(&app, cache_key, result.clone());
    
    Ok(result)
}

pub async fn format_lyrics_with_ai(raw_lyrics: &str, app_handle: &tauri::AppHandle) -> Result<String, String> {
    let prompt = format!(
        "Clean and format this text. Remove any web page elements like headers, footers, \
        contributor names, 'Embed' text, navigation elements, advertisements, or metadata. \
        Keep only the main content with proper structure and formatting. Preserve line breaks \
        and spacing that are part of the content structure. Return ONLY the cleaned text.\n\n{}",
        raw_lyrics
    );
    
    call_openai(prompt, 500, app_handle).await
}
