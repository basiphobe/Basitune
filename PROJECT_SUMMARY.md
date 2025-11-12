# Basitune - Project Summary

## What is Basitune?

Basitune is a lightweight, cross-platform desktop application that wraps YouTube Music in a native window. It's built with Tauri (Rust + system webview) to provide a minimal, low-RAM alternative to running YouTube Music in a browser tab.

## Key Features Implemented

✅ **Cross-platform desktop app** (Linux, Windows, macOS)
✅ **Direct YouTube Music integration** - loads https://music.youtube.com
✅ **Persistent login** - cookies and session data saved automatically
✅ **Minimal resource usage** - uses system webview instead of bundled Chromium
✅ **Clean, simple codebase** - easy to understand and maintain

## Project Structure

```
Basitune/
├── .github/
│   └── workflows/
│       └── build.yml          # CI/CD workflow for automated builds
├── .vscode/
│   ├── extensions.json        # Recommended VS Code extensions
│   └── settings.json          # VS Code workspace settings
├── src-tauri/
│   ├── icons/                 # Application icons (placeholder)
│   │   └── README.md          # Icon generation instructions
│   ├── src/
│   │   ├── main.rs            # Rust entry point - window setup
│   │   └── lib.rs             # Library exports
│   ├── build.rs               # Tauri build script
│   ├── Cargo.toml             # Rust dependencies
│   └── tauri.conf.json        # Tauri app configuration
├── .gitignore                 # Git ignore patterns
├── DEVELOPMENT.md             # Technical notes for developers
├── LICENSE                    # MIT license with disclaimer
├── QUICKSTART.md              # Quick start guide
├── README.md                  # Main documentation
├── index.html                 # Minimal loading page
└── package.json               # Node.js dependencies and scripts
```

## How It Works

### 1. Window Management
- Tauri creates a native window (1200x800, resizable, centered)
- Window directly loads `https://music.youtube.com`
- No custom UI - just the YouTube Music web app

### 2. Persistent Storage
Tauri automatically provides persistent storage for the webview:
- **Linux**: `~/.local/share/com.basitune.app`
- **macOS**: `~/Library/Application Support/com.basitune.app`
- **Windows**: `%APPDATA%\com.basitune.app`

This stores cookies, localStorage, and other data so login persists.

### 3. Rust Backend (main.rs)
The Rust code is minimal:
- Initialize Tauri builder
- Add shell plugin (for future features)
- Set window title
- Comments explain persistent storage

### 4. Configuration (tauri.conf.json)
Defines:
- App metadata (name, version, identifier)
- Window properties (size, title, URL)
- Build settings
- Bundle configuration for all platforms

## Quick Commands

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Design Philosophy

1. **Simplicity First**: No unnecessary features or complexity
2. **System Integration**: Use native webview, not bundled browser
3. **Low Resource Usage**: Minimal RAM and CPU consumption
4. **Persistent Sessions**: Login once, stay logged in
5. **Cross-platform**: Works consistently on all major platforms
6. **Clean Code**: Well-commented, easy to understand and maintain

## What's NOT Included (Yet)

These features are planned for future versions:
- ❌ System tray integration
- ❌ Global media keys (Play/Pause, Next, Previous)
- ❌ Window state persistence (size, position)
- ❌ Start on system boot
- ❌ Custom keyboard shortcuts
- ❌ Settings/preferences UI

See `DEVELOPMENT.md` for notes on implementing these features.

## Technology Stack

- **Tauri 2.0**: Rust-based desktop framework
- **Rust**: Systems programming language for the backend
- **System WebView**: Platform-native webview component
  - WebKit on Linux/macOS
  - WebView2 on Windows
- **Minimal JavaScript**: Only a simple loading page

## Security & Privacy

- No data collection or analytics
- No custom JavaScript injection into YouTube Music
- Uses standard browser security model
- All data stored locally on user's machine
- No network requests except to YouTube Music

## Compliance

⚠️ **Important Disclaimer**: Basitune is not affiliated with Google, YouTube, or YouTube Music. Users must comply with YouTube's Terms of Service when using this application.

## Getting Started

New to the project? Start here:
1. Read [QUICKSTART.md](QUICKSTART.md) to get the app running
2. Review [README.md](README.md) for full documentation
3. Check [DEVELOPMENT.md](DEVELOPMENT.md) if you want to contribute

## Build Status

The project includes a GitHub Actions workflow (`.github/workflows/build.yml`) that automatically builds Basitune for all platforms on every push.

## License

MIT License - see [LICENSE](LICENSE) for details

---

**Enjoy your music!** 🎵
