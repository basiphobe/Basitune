pub mod openai;
pub mod genius;

// Re-export commands for tauri's generate_handler!
pub use openai::get_artist_info;
pub use openai::get_song_context;
pub use genius::get_lyrics;
pub use genius::search_lyrics;
