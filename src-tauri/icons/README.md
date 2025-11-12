# Basitune Icons

This directory should contain the application icons for all platforms.

## Required Icon Files

- `32x32.png` - 32x32 pixel PNG icon
- `128x128.png` - 128x128 pixel PNG icon
- `128x128@2x.png` - 256x256 pixel PNG icon (2x resolution)
- `icon.icns` - macOS icon file
- `icon.ico` - Windows icon file

## Generating Icons

You can use the Tauri icon generator to create all required formats from a single source image:

```bash
npm install -g @tauri-apps/cli
tauri icon /path/to/your/icon.png
```

The source image should be at least 512x512 pixels and in PNG format.

## Temporary Placeholder

For development purposes, you can use Tauri's default icons. To generate proper icons for production:

1. Create or obtain a 512x512 PNG icon for Basitune
2. Run the tauri icon command above
3. The generated icons will replace these placeholders
