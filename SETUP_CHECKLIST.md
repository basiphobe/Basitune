# ✅ Basitune Setup Checklist

Use this checklist to ensure your development environment is properly configured.

## Prerequisites

### System Requirements
- [ ] Running Linux, macOS, or Windows
- [ ] Have terminal/command prompt access
- [ ] Have internet connection for downloading dependencies

### Required Software
- [ ] **Node.js** installed (v16 or later)
  ```bash
  node --version
  # Should show v16.x.x or higher
  ```

- [ ] **npm** installed (comes with Node.js)
  ```bash
  npm --version
  # Should show a version number
  ```

- [ ] **Rust** installed (latest stable)
  ```bash
  rustc --version
  # Should show rustc 1.x.x
  ```

- [ ] **Cargo** installed (comes with Rust)
  ```bash
  cargo --version
  # Should show cargo 1.x.x
  ```

### Platform-Specific Dependencies

#### Linux Only
- [ ] WebKit2GTK development files
- [ ] Build essential tools
- [ ] SSL development libraries
- [ ] Other system libraries

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

**Fedora:**
```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file libappindicator-gtk3-devel librsvg2-devel
```

#### macOS Only
- [ ] Xcode Command Line Tools
  ```bash
  xcode-select --install
  ```

#### Windows Only
- [ ] Microsoft Visual Studio C++ Build Tools
- [ ] WebView2 Runtime (usually pre-installed)

## Project Setup

### 1. Initial Setup
- [ ] Cloned or downloaded the Basitune repository
- [ ] Opened terminal in the project directory
- [ ] Verified you're in the correct directory:
  ```bash
  ls -la
  # Should see: package.json, src-tauri/, README.md, etc.
  ```

### 2. Install Dependencies
- [ ] Run the setup script:
  ```bash
  ./setup.sh  # or ./setup.fish for fish shell
  ```
  
  **OR manually:**
  ```bash
  npm install
  ```

- [ ] Wait for installation to complete (may take 1-2 minutes)
- [ ] Verify no error messages appeared

### 3. Generate Icons
- [ ] Run icon generation:
  ```bash
  npm run icon
  ```

- [ ] Check that icons were created:
  ```bash
  ls -la src-tauri/icons/
  # Should see: 32x32.png, 128x128.png, icon.icns, icon.ico, etc.
  ```

### 4. First Development Run
- [ ] Start development server:
  ```bash
  npm run dev
  ```

- [ ] **Wait patiently** - first compile takes 3-5 minutes
- [ ] Watch for compilation progress messages
- [ ] Basitune window should open automatically
- [ ] YouTube Music should load in the window

### 5. Verify Functionality
- [ ] App window opened successfully
- [ ] YouTube Music loaded correctly
- [ ] Can see the YouTube Music interface
- [ ] Can interact with the page (try clicking around)
- [ ] Window can be resized
- [ ] Window can be minimized
- [ ] Window can be maximized
- [ ] Close button works

### 6. Test Persistent Storage
- [ ] Sign into YouTube Music in the app
- [ ] Close Basitune completely
- [ ] Run `npm run dev` again
- [ ] Verify you're still logged in ✅

## Development Environment

### VS Code Setup (Recommended)
- [ ] Opened project in VS Code
- [ ] Installed recommended extensions when prompted:
  - [ ] Rust Analyzer
  - [ ] Tauri extension
- [ ] Extensions are active (check Extensions panel)

### Terminal Setup
- [ ] Verified terminal is using correct shell (bash/fish/zsh)
- [ ] Can run `npm` commands from project root
- [ ] Can run `cargo` commands from src-tauri/ directory

## Build Test (Optional)

Only do this after successful development run:

- [ ] Run production build:
  ```bash
  npm run build
  ```

- [ ] Wait for build to complete (2-5 minutes)
- [ ] Check for build output:
  ```bash
  ls -la src-tauri/target/release/bundle/
  ```

- [ ] Verify platform-specific bundles were created

## Troubleshooting Checklist

If something went wrong, check:

### Dependencies
- [ ] Ran `npm install` successfully
- [ ] No error messages during install
- [ ] `node_modules/` directory exists
- [ ] `node_modules/@tauri-apps/` exists

### Rust Environment
- [ ] Rust is in PATH: `which rustc`
- [ ] Cargo is in PATH: `which cargo`
- [ ] Can compile Rust: `cargo --version`

### Build Errors
- [ ] Checked error messages carefully
- [ ] All system dependencies installed (Linux)
- [ ] WebView2 installed (Windows)
- [ ] Xcode Command Line Tools installed (macOS)

### Runtime Errors
- [ ] Port 1420 is not already in use
- [ ] No firewall blocking localhost
- [ ] Internet connection active (for YouTube Music)

## Next Steps

Once everything is checked:

1. **Read Documentation**
   - [ ] Read [README.md](README.md)
   - [ ] Skim [DEVELOPMENT.md](DEVELOPMENT.md)
   - [ ] Review [CONTRIBUTING.md](CONTRIBUTING.md) if planning to contribute

2. **Start Developing**
   - [ ] Make your first change
   - [ ] Test with `npm run dev`
   - [ ] Commit your changes

3. **Customize**
   - [ ] Replace icon.svg with custom icon
   - [ ] Update package.json metadata
   - [ ] Modify tauri.conf.json settings

## Common Issues & Solutions

### "Command not found: npm"
→ Install Node.js from https://nodejs.org/

### "rustc: command not found"  
→ Install Rust from https://rustup.rs/

### Build hangs or takes too long
→ This is normal for first build! Rust compiles many dependencies. Grab a coffee ☕

### "Failed to bundle project"
→ Check that icons exist in `src-tauri/icons/`. Run `npm run icon`.

### App won't start
→ Check console for errors. Ensure port 1420 is free. Try `npm run dev` again.

### YouTube Music won't load
→ Check internet connection. Try opening https://music.youtube.com in a browser.

## Getting Help

If you're still stuck:

1. **Check Documentation**: Review all .md files
2. **Search Issues**: Look for similar problems on GitHub
3. **Ask for Help**: Open an issue with:
   - Your platform (OS and version)
   - Commands you ran
   - Full error messages
   - What you've already tried

---

## ✨ Success!

If you've checked everything and the app runs, you're ready to develop!

**Next**: Check out [DEVELOPMENT.md](DEVELOPMENT.md) for technical details and feature ideas.

**Happy coding!** 🎵

---

Last updated: November 11, 2025
