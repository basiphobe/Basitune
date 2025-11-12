# Quick Start Guide - Basitune

This guide will help you get Basitune up and running in just a few minutes.

## Prerequisites Check

Before you begin, make sure you have:

- ✅ **Rust** installed - Check with: `rustc --version`
- ✅ **Node.js** installed - Check with: `node --version`
- ✅ **System dependencies** (see platform-specific sections below)

### Platform-Specific Setup

<details>
<summary><strong>Linux (Ubuntu/Debian)</strong></summary>

```bash
# Install system dependencies
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

**Important:** The GStreamer plugins are required for media playback. Without them, you'll get "video format not supported" errors.
</details>

<details>
<summary><strong>Linux (Fedora)</strong></summary>

```bash
# Install system dependencies
sudo dnf install webkit2gtk4.1-devel \
  openssl-devel \
  curl \
  wget \
  file \
  libappindicator-gtk3-devel \
  librsvg2-devel
```
</details>

<details>
<summary><strong>macOS</strong></summary>

```bash
# Install Xcode Command Line Tools
xcode-select --install
```
</details>

<details>
<summary><strong>Windows</strong></summary>

1. Install [Microsoft Visual Studio C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
2. WebView2 should already be installed on Windows 10/11
</details>

## Installation Steps

### Important: Fish Shell Users

If you're using fish shell (instead of bash/zsh), after installing Rust with rustup, you'll need to configure your PATH:

```fish
# Add to current session
set -gx PATH $HOME/.cargo/bin $PATH

# Make it permanent - add this to ~/.config/fish/config.fish
echo "set -gx PATH \$HOME/.cargo/bin \$PATH" >> ~/.config/fish/config.fish
```

The default `.cargo/env` file won't work with fish shell.

### 1. Install Node Dependencies

```bash
npm install
```

This will install the Tauri CLI and other development dependencies.

### 2. Generate Icons

```bash
npm run icon
```

This creates all required icon files from the included SVG template. (Skip this if you already have icons in `src-tauri/icons/`)

### 3. Run in Development Mode

```bash
npm run dev
```

This command will:
- Compile the Rust backend
- Start the Tauri application
- Open YouTube Music in the application window
- Enable hot-reload for development

**Note:** The first build will take a few minutes as Rust compiles all dependencies. Subsequent builds will be much faster.

### 4. Build for Production (Optional)

```bash
npm run build
```

The compiled application will be in `src-tauri/target/release/bundle/`:
- **Linux**: `.deb`, `.AppImage`
- **macOS**: `.dmg`, `.app`
- **Windows**: `.msi`, `.exe`

## First Run

When you first run Basitune:

1. The app will open with YouTube Music loaded
2. Sign in with your Google account
3. Your login will be saved automatically
4. Close and reopen the app - you'll still be logged in! ✅

## Troubleshooting

### "Video format not supported" / Songs skip immediately (Linux)
Install GStreamer codec plugins:
```bash
sudo apt install gstreamer1.0-plugins-good gstreamer1.0-plugins-bad \
  gstreamer1.0-plugins-ugly gstreamer1.0-libav
```
Then restart the app.

### "Command not found: npm"
Install Node.js from https://nodejs.org/

### "rustc: command not found"
Install Rust from https://rustup.rs/

### Build errors on Linux
Make sure all system dependencies are installed (see platform-specific setup above)

### "WebView2 not found" on Windows
Download and install WebView2 from: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### App won't start in development mode
1. Check that port 1420 is available
2. Try: `rm -rf node_modules && npm install`
3. Try: `rm -rf src-tauri/target && npm run dev`

## Next Steps

- **Customize**: Edit `src-tauri/tauri.conf.json` to change window size or other settings
- **Icons**: Add custom icons to `src-tauri/icons/` (see icons README)
- **Contribute**: Check out `DEVELOPMENT.md` for contribution guidelines

## Getting Help

If you encounter issues:
1. Check the [README.md](README.md) for detailed documentation
2. Review [DEVELOPMENT.md](DEVELOPMENT.md) for technical details
3. Open an issue on GitHub with your error message and platform

Enjoy your music! 🎵
