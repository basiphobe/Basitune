use regex::Regex;

pub fn normalize_string(s: &str) -> String {
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

pub fn clean_song_title(title: &str) -> String {
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

pub fn clean_lyrics_with_regex(lyrics: &str) -> String {
    let mut lines: Vec<&str> = lyrics.lines().collect();
    
    // Remove common Genius page elements from the beginning
    while !lines.is_empty() {
        let first = lines[0].trim();
        if first.is_empty() 
            || first.contains("Contributors")
            || first.contains("Embed")
            || first.contains("Share")
            || first.contains("URL")
            || first.contains("Genius")
            || first.starts_with("http")
            || first.len() < 2
        {
            lines.remove(0);
        } else {
            break;
        }
    }
    
    // Remove "Embed" and other footers from the end
    while !lines.is_empty() {
        let last = lines[lines.len() - 1].trim();
        if last.is_empty()
            || last.contains("Embed")
            || last.contains("Share")
            || last.contains("URL")
            || last.len() < 2
        {
            lines.pop();
        } else {
            break;
        }
    }
    
    lines.join("\n").trim().to_string()
}
