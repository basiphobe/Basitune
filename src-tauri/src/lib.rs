// Library entry point for Tauri
// This file enables both binary and library builds

// Module declarations
pub mod ai;
pub mod cache;
pub mod config;
pub mod discord;
pub mod notifications;
pub mod playback;
pub mod sidebar;
pub mod tray;
pub mod updater;
pub mod utils;

// Re-export commonly used items
pub use config::{ApiConfig, WindowState};
pub use discord::DiscordState;
pub use playback::PlaybackState;
pub use sidebar::WindowStateManager;
