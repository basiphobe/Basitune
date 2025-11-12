# Basitune Development Notes

## Architecture

Basitune follows a minimal architecture:

1. **Tauri Configuration** (`tauri.conf.json`): Defines the main window pointing directly to YouTube Music
2. **Rust Backend** (`src-tauri/src/main.rs`): Minimal setup, just window initialization
3. **No Custom Frontend**: The app loads YouTube Music directly—no React, Vue, or custom UI

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
