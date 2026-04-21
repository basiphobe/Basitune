use regex::Regex;
use std::collections::HashSet;

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

/// Normalize a string for fuzzy matching: lowercase, normalize Unicode,
/// normalize all typographic punctuation variants (smart quotes, em-dashes, etc.)
/// and collapse whitespace.
pub fn normalize_for_matching(s: &str) -> String {
    let normalized = normalize_string(s);
    normalized
        .chars()
        .map(|c| match c {
            // Typographic apostrophes / single quotes → ASCII apostrophe
            '\u{2018}' | '\u{2019}' | '\u{201A}' | '\u{201B}' | '\u{02BC}' | '\u{0060}' => '\'',
            // Typographic double quotes → ASCII double quote
            '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{201F}' => '"',
            // Various dashes → ASCII hyphen
            '\u{2013}' | '\u{2014}' | '\u{2015}' | '\u{2212}' => '-',
            // Ellipsis → three dots
            '\u{2026}' => '.',
            _ => c,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Strip all punctuation for aggressive matching fallback.
fn strip_punctuation(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Compute a word-overlap score between two strings (Jaccard-like).
/// Returns a value between 0.0 (no overlap) and 1.0 (identical word sets).
pub fn word_overlap_score(a: &str, b: &str) -> f64 {
    let words_a: HashSet<&str> = a.split_whitespace().collect();
    let words_b: HashSet<&str> = b.split_whitespace().collect();
    if words_a.is_empty() && words_b.is_empty() {
        return 1.0;
    }
    let intersection = words_a.intersection(&words_b).count() as f64;
    let union = words_a.union(&words_b).count() as f64;
    if union == 0.0 { 0.0 } else { intersection / union }
}

/// Score how well a candidate (title, artist) matches a search (title, artist).
/// Returns a score from 0.0 (no match) to 1.0+ (perfect match).
/// Uses multiple matching tiers for robustness.
pub fn match_score(search_title: &str, search_artist: &str, result_title: &str, result_artist: &str) -> f64 {
    let norm_st = normalize_for_matching(search_title);
    let norm_sa = normalize_for_matching(search_artist);
    let norm_rt = normalize_for_matching(result_title);
    let norm_ra = normalize_for_matching(result_artist);

    // Tier 1: Exact normalized match
    let title_exact = norm_st == norm_rt;
    let artist_exact = norm_sa == norm_ra;
    if title_exact && artist_exact {
        return 1.0;
    }

    // Tier 2: Contains match (one contains the other)
    let title_contains = norm_rt.contains(&norm_st) || norm_st.contains(&norm_rt);
    let artist_contains = norm_ra.contains(&norm_sa) || norm_sa.contains(&norm_ra);
    if title_contains && artist_contains {
        return 0.9;
    }

    // Tier 3: Punctuation-stripped exact match
    let stripped_st = strip_punctuation(&norm_st);
    let stripped_sa = strip_punctuation(&norm_sa);
    let stripped_rt = strip_punctuation(&norm_rt);
    let stripped_ra = strip_punctuation(&norm_ra);
    if stripped_st == stripped_rt && stripped_sa == stripped_ra {
        return 0.85;
    }
    if (stripped_rt.contains(&stripped_st) || stripped_st.contains(&stripped_rt))
        && (stripped_ra.contains(&stripped_sa) || stripped_sa.contains(&stripped_ra)) {
        return 0.8;
    }

    // Tier 4: Word-overlap scoring
    let title_score = word_overlap_score(&stripped_st, &stripped_rt);
    let artist_score = word_overlap_score(&stripped_sa, &stripped_ra);

    // Weight: title 60%, artist 40%
    title_score * 0.6 + artist_score * 0.4
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

#[cfg(test)]
mod tests {
    use super::*;

    // === The exact bug from the screenshot ===
    #[test]
    fn typographic_apostrophe_exact_match() {
        // YouTube sends curly apostrophe, Genius has straight apostrophe
        let score = match_score(
            "A Mother\u{2019}s Prayer", "Overkill",
            "A Mother's Prayer", "Overkill",
        );
        assert!(score >= 0.85, "Typographic apostrophe should match: got {score}");
    }

    #[test]
    fn straight_apostrophe_exact_match() {
        let score = match_score(
            "A Mother's Prayer", "Overkill",
            "A Mother's Prayer", "Overkill",
        );
        assert_eq!(score, 1.0);
    }

    // === normalize_for_matching ===
    #[test]
    fn normalize_curly_quotes() {
        assert_eq!(
            normalize_for_matching("Don\u{2019}t Stop"),
            "don't stop"
        );
        assert_eq!(
            normalize_for_matching("\u{201C}Hello\u{201D}"),
            "\"hello\""
        );
    }

    #[test]
    fn normalize_dashes() {
        assert_eq!(
            normalize_for_matching("Song \u{2013} Remix"),
            "song - remix"
        );
        assert_eq!(
            normalize_for_matching("Song \u{2014} Remix"),
            "song - remix"
        );
    }

    #[test]
    fn normalize_unicode_accents() {
        assert_eq!(
            normalize_for_matching("Queensr\u{00ff}che"),
            "queensryche"
        );
        assert_eq!(
            normalize_for_matching("Mot\u{00f6}rhead"),
            "motorhead"
        );
    }

    #[test]
    fn normalize_collapses_whitespace() {
        assert_eq!(
            normalize_for_matching("  hello   world  "),
            "hello world"
        );
    }

    // === match_score tiers ===
    #[test]
    fn exact_match_scores_1() {
        assert_eq!(match_score("Holy Wars", "Megadeth", "Holy Wars", "Megadeth"), 1.0);
    }

    #[test]
    fn case_insensitive_match() {
        assert_eq!(match_score("holy wars", "megadeth", "Holy Wars", "Megadeth"), 1.0);
    }

    #[test]
    fn contains_match_title_suffix() {
        // Genius often has longer titles
        let score = match_score(
            "Holy Wars", "Megadeth",
            "Holy Wars... The Punishment Due", "Megadeth",
        );
        assert!(score >= 0.9, "Contains match should score >= 0.9: got {score}");
    }

    #[test]
    fn contains_match_artist_variant() {
        // "The" prefix difference
        let score = match_score(
            "Fade to Black", "Metallica",
            "Fade to Black", "Metallica (band)",
        );
        assert!(score >= 0.8, "Artist contains should score high: got {score}");
    }

    #[test]
    fn punctuation_stripped_match() {
        // Possessives and punctuation differences
        let score = match_score(
            "Heavens On Fire", "KISS",
            "Heaven's on Fire", "Kiss",
        );
        assert!(score >= 0.8, "Punctuation-stripped should match: got {score}");
    }

    #[test]
    fn completely_different_scores_low() {
        let score = match_score(
            "Master of Puppets", "Metallica",
            "Bohemian Rhapsody", "Queen",
        );
        assert!(score < 0.3, "Unrelated songs should score < 0.3: got {score}");
    }

    #[test]
    fn partial_word_overlap() {
        let score = match_score(
            "The Number of the Beast", "Iron Maiden",
            "Number of the Beast", "Iron Maiden",
        );
        assert!(score >= 0.8, "Partial title overlap with exact artist: got {score}");
    }

    // === word_overlap_score ===
    #[test]
    fn identical_words_score_1() {
        assert_eq!(word_overlap_score("hello world", "hello world"), 1.0);
    }

    #[test]
    fn no_overlap_scores_0() {
        assert_eq!(word_overlap_score("hello", "world"), 0.0);
    }

    #[test]
    fn partial_overlap() {
        let score = word_overlap_score("the number of beast", "number of the beast");
        assert!(score > 0.7, "Reordered words should have high overlap: got {score}");
    }

    #[test]
    fn empty_strings_score_1() {
        assert_eq!(word_overlap_score("", ""), 1.0);
    }
}
