# GitHub Actions Workflow

This workflow builds Basitune for Linux, macOS, and Windows on every push to `main`.

## Setup

### Required Secrets

Go to your repository **Settings → Secrets and variables → Actions** and add:

1. **`OPENAI_API_KEY`** (optional but recommended)
   - Your OpenAI API key for AI-powered features
   - If not set, builds will use a dummy key (app will work but AI features won't)
   - Get your key from: https://platform.openai.com/api-keys

2. **`TAURI_SIGNING_PRIVATE_KEY`** (optional)
   - For code signing and auto-updates
   - Only needed if you plan to use Tauri's updater plugin
   - See: https://v2.tauri.app/plugin/updater/

### Manual Trigger

You can manually trigger a build from the **Actions** tab by selecting "Build Basitune" and clicking "Run workflow".

## Artifacts

After a successful build, download artifacts from the workflow run:
- **Linux**: `.deb`, `.AppImage`, `.rpm`
- **macOS**: `.dmg`, `.app` bundle
- **Windows**: `.msi`, `.exe` installer
