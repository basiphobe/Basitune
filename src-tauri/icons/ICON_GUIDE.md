# Icon Generation Script

This directory needs icon files for the application to build properly.

## Option 1: Use Tauri Icon Generator (Recommended)

If you have a custom icon (PNG, at least 512x512):

```bash
# Install Tauri CLI globally
npm install -g @tauri-apps/cli

# Generate all required icons from your source image
tauri icon /path/to/your/icon.png
```

This will generate all required formats in the `src-tauri/icons/` directory.

## Option 2: Use the Provided SVG Template

We've included a simple music note icon (`icon.svg` in the project root) that you can use:

```bash
# Install @tauri-apps/cli if not already installed
npm install -g @tauri-apps/cli

# Generate icons from the SVG
tauri icon icon.svg
```

## Option 3: Manual Icon Creation

Create these files manually in this directory:
- `32x32.png` - 32x32 pixels
- `128x128.png` - 128x128 pixels  
- `128x128@2x.png` - 256x256 pixels (high DPI)
- `icon.icns` - macOS icon bundle
- `icon.ico` - Windows icon file

## Required Icons for Building

The project is configured to use these icon files. If they're missing, you may encounter build errors when running `npm run build`.

For development (`npm run dev`), missing icons usually won't prevent the app from running, but you should add them before building for production.

## Custom Icon Design

If you're creating a custom icon, consider:
- Use a music-related symbol (note, headphones, etc.)
- Keep it simple and recognizable at small sizes
- Use high contrast for visibility
- Make it square (1:1 aspect ratio)
- Minimum 512x512 pixels for best quality

The included SVG can serve as a starting point or placeholder.
