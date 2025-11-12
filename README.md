# Basitune

A lightweight, cross-platform desktop wrapper for YouTube Music built with Tauri.

## Overview

Basitune is a minimal desktop application that provides a dedicated window for YouTube Music. It's not a custom music player—it simply wraps the official YouTube Music web app (https://music.youtube.com) in a native desktop shell that:

- Uses minimal system resources (system webview, no bundled Chromium)
- Keeps you logged in between sessions (persistent cookies and data)
- Works on Linux, Windows, and macOS
- Provides a focused, distraction-free music experience

**Note:** Basitune is not affiliated with, endorsed by, or sponsored by Google or YouTube.

## Features

- **Single-purpose window**: Opens YouTube Music in a dedicated application window
- **Persistent login**: Your Google/YouTube Music login persists across app restarts
- **Volume normalization**: Automatically adjusts audio levels for consistent playback across songs
- **Lyrics display**: Shows real-time lyrics from Genius for the currently playing song
- **Artist info sidebar**: Displays Wikipedia artist information with bio and image while playing
- **Window state memory**: Remembers window size, position, and maximized state
- **Single instance**: Only one app instance can run at a time - launching again focuses existing window
- **Lightweight**: Uses the system's native webview instead of bundling a browser
- **Cross-platform**: Runs on Linux, Windows, and macOS
- **Simple and clean**: No unnecessary features, just YouTube Music in a desktop app

## Prerequisites

To build and run Basitune, you need:

1. **Rust** (latest stable version)
   - Install from https://rustup.rs/

2. **Node.js** (v16 or later)
   - Install from https://nodejs.org/

3. **System dependencies** (platform-specific):

   **Linux (Debian/Ubuntu):**
   ```bash
   sudo apt update
   sudo apt install libwebkit2gtk-4.1-dev \
     build-essential \
     curl \
     wget \
     file \
     libxdo-dev \
     libssl-dev \
     libayatana-appindicator3-dev \
     librsvg2-dev \
     gstreamer1.0-plugins-good \
     gstreamer1.0-plugins-bad \
     gstreamer1.0-plugins-ugly \
     gstreamer1.0-libav
   ```

   **Note:** The GStreamer plugins are **required** for media playback. Without them, YouTube Music will show "video format not supported" errors.

   **Linux (Fedora):**
   ```bash
   sudo dnf install webkit2gtk4.1-devel \
     openssl-devel \
     curl \
     wget \
     file \
     libappindicator-gtk3-devel \
     librsvg2-devel
   ```

   **macOS:**
   - Xcode Command Line Tools: `xcode-select --install`

   **Windows:**
   - Microsoft Visual Studio C++ Build Tools
   - WebView2 (usually pre-installed on Windows 10/11)

## Installation & Development

### Important Notes

**For fish shell users:** After installing Rust, you need to add Cargo to your PATH manually:
```fish
set -gx PATH $HOME/.cargo/bin $PATH
```
Add this to your `~/.config/fish/config.fish` to make it permanent.

### Install Dependencies

```bash
npm install
```

### Generate Icons (First Time Setup)

```bash
npm run icon
```

This generates all required icon files from the included `icon.svg`. You can replace `icon.svg` with your own design (minimum 512x512 pixels).

### Run in Development Mode

```bash
npm run dev
```

This will start the application in development mode with hot-reload enabled.

### Build for Production

```bash
npm run build
```

The compiled application will be in `src-tauri/target/release/bundle/`.

## Project Structure

```
Basitune/
├── src-tauri/           # Rust backend (Tauri application)
│   ├── src/
│   │   ├── main.rs      # Application entry point
│   │   └── lib.rs       # Library exports
│   ├── icons/           # Application icons
│   ├── Cargo.toml       # Rust dependencies
│   ├── tauri.conf.json  # Tauri configuration
│   └── build.rs         # Build script
├── index.html           # Minimal loading page
└── package.json         # Node.js dependencies and scripts
```

## How It Works

### Persistent Storage

Basitune uses Tauri's built-in persistent data storage. When you log into YouTube Music, your cookies and session data are automatically saved to platform-specific locations:

- **Linux**: `~/.local/share/com.basitune.app`
- **macOS**: `~/Library/Application Support/com.basitune.app`
- **Windows**: `%APPDATA%\com.basitune.app`

This means you stay logged in between app restarts without any special configuration.

### URL Handling

The application loads `https://music.youtube.com` directly in a webview. It allows navigation to necessary Google/YouTube domains for authentication and normal operation, but keeps the experience focused on music.

## Configuration

Key settings are in `src-tauri/tauri.conf.json`:

- **Window size**: Default 1200x800, minimum 800x600
- **App identifier**: `com.basitune.app` (used for data storage paths)
- **Title**: "Basitune"

### Volume Normalization

Volume normalization is enabled by default and normalizes audio to -14 LUFS (standard for streaming services). To control it via the browser console:

```javascript
basitune.disableNormalization()  // Turn off
basitune.enableNormalization()   // Turn on
basitune.getStatus()             // Check current settings
```

### Window State

Window size, position, and maximized state are automatically saved to `~/.local/share/com.basitune.app/window-state.json` (Linux) and restored on startup.

### Artist Info Sidebar

A collapsible sidebar on the right displays Wikipedia information for the currently playing artist:
- Automatically fetches artist bio and image from Wikipedia
- Tries "(band)" and "(musician)" disambiguation for better results
- Toggle visibility by clicking the × button
- Adjusts main content width smoothly when shown/hidden

## Future Enhancements

Possible future features include:

- Lyrics display in sidebar
- System tray integration (minimize to tray, show/hide)
- Global media key support (Play/Pause, Next, Previous)
- Start minimized option
- Custom keyboard shortcuts
- Sidebar tabs for different info (discography, similar artists)
- Optional configuration file for user preferences

## Troubleshooting

### "Video format not supported" errors / Songs skipping rapidly

**Solution:** Install GStreamer codec plugins (Linux only):

```bash
sudo apt install gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-ugly gstreamer1.0-libav
```

These plugins provide the H.264, VP8/VP9, AAC, and Opus codecs that YouTube Music requires. Without them, the WebKit webview cannot decode the media streams.

After installing, restart the app with `npm run dev`.

### Login doesn't persist
- Check that the app has write permissions to its data directory
- On Linux: `~/.local/share/com.basitune.app`
- Try clearing the data directory and logging in again

### App won't start
- Ensure all system dependencies are installed
- Check that WebView2 is installed (Windows)
- Run `npm run dev` to see detailed error messages

### Build fails
- Update Rust: `rustup update`
- Clear the build cache: `rm -rf src-tauri/target`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## Development

This project uses:
- **Tauri 2.0**: Rust-based desktop application framework
- **System WebView**: Native webview for each platform
- **Minimal JavaScript**: Only a simple loading page, no complex frontend

## License

This project is provided as-is for educational and personal use. It is not affiliated with Google, YouTube, or YouTube Music.

## Contributing

Contributions are welcome! Please ensure:
- Code is clear and well-commented
- Changes maintain the minimalist philosophy
- Cross-platform compatibility is preserved
- Performance and resource usage remain low

## Disclaimer

Basitune is an independent project and is not affiliated with, endorsed by, or sponsored by Google LLC, YouTube, or YouTube Music. YouTube and YouTube Music are trademarks of Google LLC.

This application simply provides a desktop wrapper around the official YouTube Music web application at https://music.youtube.com. Users must comply with YouTube's Terms of Service when using this application.
