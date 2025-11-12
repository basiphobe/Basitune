# Basitune Development Notes

## Architecture

Basitune follows a minimal architecture with enhanced features:

1. **Tauri Configuration** (`tauri.conf.json`): Defines the main window pointing directly to YouTube Music
2. **Rust Backend** (`src-tauri/src/main.rs`): Window management, Wikipedia API integration, Genius lyrics API
3. **JavaScript Injection**: Volume normalization and sidebar scripts injected after page load
4. **No Custom Frontend**: The app loads YouTube Music directly—no React, Vue, or custom UI

## Features Implementation

### Volume Normalization
- Uses Web Audio API to analyze and adjust audio levels
- Targets -14 LUFS (Spotify/YouTube standard)
- Smooth gain adjustments with 0.3 smoothing factor
- Gain range limited to 0.1x-3x for safety

### Lyrics Display
- Searches Genius API for song by title + artist
- Scrapes lyrics from HTML using `scraper` crate
- Displays in sidebar "Lyrics" tab
- Auto-updates when song changes

### Artist Info Sidebar
- Fetches Wikipedia artist bio via REST API v1
- Intelligent disambiguation: tries "(band)", "(musician)", then exact name
- Displays bio text and thumbnail image
- Tabbed interface: Artist / Lyrics

### Window State Persistence
- Saves window size, position, maximized state to JSON
- Debounced saves (500ms) to avoid excessive disk writes
- Restores state on app launch

### Single Instance Lock
- Uses `tauri-plugin-single-instance`
- Focuses and unminimizes existing window when second instance attempted

## Persistent Storage

Tauri automatically provides persistent storage for webviews. The webview used by Basitune stores:
- Cookies (including authentication tokens)
- LocalStorage
- IndexedDB
- Cache

Storage location is determined by the `identifier` field in `tauri.conf.json`: `com.basitune.app`

## Window Configuration

The main window is configured in `tauri.conf.json`:
- Default size: 1200x800
- Minimum size: 800x600
- Centered on screen
- Directly loads https://music.youtube.com

## Security Considerations

- CSP is set to null to allow YouTube Music to function normally
- No IPC (Inter-Process Communication) is exposed to the webview
- The app acts as a simple container with no custom JavaScript injection (yet)

## Future Development Ideas

### System Tray
Add minimize-to-tray functionality using `tauri-plugin-tray`

### Media Keys
Inject JavaScript to forward media key events to the YouTube Music player:
- Listen for global media keys in Rust
- Use `eval()` to trigger player controls in the webview

### Window State
Remember window size, position, and maximized state using `tauri-plugin-store`

### Custom Shortcuts
Add keyboard shortcuts for common actions (play/pause, next, previous)

### Configuration
Add a simple JSON config file for user preferences:
- Start minimized
- Start with system
- Close to tray vs. exit
- Custom window size
