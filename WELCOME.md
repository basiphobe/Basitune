```
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║                     🎵  BASITUNE  🎵                         ║
║                                                               ║
║          A Lightweight Desktop Wrapper for YouTube Music     ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
```

# Welcome to Basitune Development!

Thank you for your interest in Basitune - a minimal, cross-platform desktop application that brings YouTube Music to your desktop without the browser overhead.

## 🚀 Quick Start (3 Steps)

```bash
# 1. Install dependencies
npm install

# 2. Generate icons
npm run icon

# 3. Run the app
npm run dev
```

**That's it!** The first build takes 3-5 minutes. Subsequent builds are much faster.

## 📚 Where to Start?

Depending on what you want to do:

### 🆕 First Time Here?
→ Read [SETUP_CHECKLIST.md](SETUP_CHECKLIST.md) - Step-by-step setup guide

### 🏃 Want to Run Quickly?
→ Read [QUICKSTART.md](QUICKSTART.md) - Get up and running in minutes

### 📖 Want Full Documentation?
→ Read [README.md](README.md) - Complete user and developer guide

### 🔧 Want Technical Details?
→ Read [DEVELOPMENT.md](DEVELOPMENT.md) - Architecture and implementation notes

### 🤝 Want to Contribute?
→ Read [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines

### 📊 Want Project Overview?
→ Read [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) - Complete project summary

## 🎯 What is Basitune?

Basitune is **NOT**:
- ❌ A custom music player with its own UI
- ❌ A YouTube Music client that reimplements features
- ❌ An audio downloader or converter
- ❌ A browser extension

Basitune **IS**:
- ✅ A minimal desktop window that loads YouTube Music
- ✅ A way to keep YouTube Music separate from your browser
- ✅ A lightweight alternative to running music in a browser tab
- ✅ A persistent login shell (stays logged in between sessions)

Think of it as: **"YouTube Music in a dedicated app, not a browser tab"**

## 🛠️ Technology Stack

- **Tauri 2.0**: Rust-based desktop framework
- **System WebView**: Native webview (not Chromium/Electron)
- **Rust**: Backend application logic
- **HTML**: Minimal loading page only

**Result**: ~5-15 MB binary, 50-150 MB RAM usage (vs. 300-500 MB for Electron apps)

## 📁 Project Structure at a Glance

```
Basitune/
├── 📚 Documentation (9 .md files)
│   ├── README.md              → Start here for full docs
│   ├── QUICKSTART.md          → Fast setup guide
│   ├── SETUP_CHECKLIST.md     → Detailed setup checklist
│   ├── DEVELOPMENT.md         → Technical notes
│   ├── CONTRIBUTING.md        → How to contribute
│   └── ...
│
├── 🔧 Configuration
│   ├── package.json           → npm scripts and dependencies
│   ├── .gitignore            → Git ignore rules
│   └── icon.svg              → Icon template
│
├── 🏗️ Build & Deploy
│   ├── .github/workflows/    → CI/CD automation
│   ├── setup.sh              → Bash setup script
│   └── setup.fish            → Fish shell setup script
│
├── 🦀 Rust Backend (src-tauri/)
│   ├── src/main.rs           → Application entry point
│   ├── Cargo.toml            → Rust dependencies
│   └── tauri.conf.json       → Tauri configuration
│
└── 🌐 Frontend
    └── index.html            → Loading page
```

## 🎨 Design Philosophy

1. **Simplicity First**: No unnecessary features
2. **Minimal Resources**: Use system webview, not bundled browser
3. **Just Works**: Persistent login, no configuration
4. **Cross-Platform**: Linux, Windows, macOS
5. **Open & Transparent**: Clean code, good documentation

## 💡 Common Commands

```bash
# Development
npm run dev          # Run in development mode (hot-reload)

# Production
npm run build        # Build for production

# Icons
npm run icon         # Generate icons from icon.svg

# Setup
./setup.sh           # Automated setup (bash)
./setup.fish         # Automated setup (fish shell)
```

## 🔍 Important Files to Know

| File | Purpose |
|------|---------|
| `src-tauri/src/main.rs` | Rust application logic |
| `src-tauri/tauri.conf.json` | App configuration (window, bundle, etc.) |
| `src-tauri/Cargo.toml` | Rust dependencies |
| `package.json` | npm scripts and Node dependencies |
| `index.html` | Minimal loading page |
| `icon.svg` | Icon source (customize this!) |

## ⚙️ Default Settings

- **Window Size**: 1200x800 (minimum 800x600)
- **URL**: https://music.youtube.com
- **Data Storage**: 
  - Linux: `~/.local/share/com.basitune.app`
  - macOS: `~/Library/Application Support/com.basitune.app`
  - Windows: `%APPDATA%\com.basitune.app`

## 🆘 Need Help?

1. **Check Documentation**: We have 9 detailed guides
2. **Search Issues**: Someone may have had the same problem
3. **Open an Issue**: Provide platform, error messages, steps to reproduce

## 🎯 Next Steps

### For Users:
1. Follow [QUICKSTART.md](QUICKSTART.md)
2. Run `npm run dev`
3. Sign into YouTube Music
4. Enjoy your music! 🎵

### For Developers:
1. Read [DEVELOPMENT.md](DEVELOPMENT.md)
2. Review [CONTRIBUTING.md](CONTRIBUTING.md)
3. Make changes and submit PRs
4. Help improve Basitune!

### For Contributors:
1. Check existing issues for "good first issue" labels
2. Join discussions about new features
3. Help with documentation or testing
4. Share your ideas!

## ⚠️ Important Disclaimer

Basitune is **not affiliated** with Google, YouTube, or YouTube Music. It simply loads the official YouTube Music web app in a desktop window. Users must comply with YouTube's Terms of Service.

## 📜 License

MIT License - Free to use, modify, and distribute. See [LICENSE](LICENSE) for details.

## 🌟 Project Stats

- **Version**: 0.1.0
- **Status**: Ready for Development
- **Platform**: Linux, Windows, macOS
- **Framework**: Tauri 2.0
- **Language**: Rust + HTML
- **Lines of Code**: ~350 (excluding dependencies)
- **Documentation**: ~10,000 words across 9 files

## 🙏 Acknowledgments

Built with:
- **Tauri**: Modern desktop application framework
- **Rust**: Safe and fast systems programming
- **YouTube Music**: The music service we all love

---

```
Ready to build something awesome? Let's get started! 🚀

Commands to remember:
  npm install     → Install dependencies
  npm run icon    → Generate icons
  npm run dev     → Start developing
  
Happy coding! 🎵
```

---

**Last Updated**: November 11, 2025  
**Project Version**: 0.1.0  
**Status**: ✅ Ready for Development

---
