#!/usr/bin/env bash
# Build Flatpak locally for testing

set -e

echo "🎵 Building Basitune Flatpak"
echo "=============================="
echo ""

# Check for flatpak-builder
if ! command -v flatpak-builder &> /dev/null; then
    echo "❌ flatpak-builder not found. Install it:"
    echo "   sudo apt install flatpak-builder"
    exit 1
fi

# Build the Tauri app first if binary doesn't exist
if [ ! -f "src-tauri/target/release/basitune" ]; then
    echo "📦 Building Tauri application..."
    npm run build
else
    echo "✓ Using existing Tauri binary"
fi

# Generate icon
echo "🎨 Generating icon..."
if command -v convert &> /dev/null; then
    convert icon.svg -resize 128x128 icon.png
else
    echo "⚠️  ImageMagick not found. Using existing icon.png if available."
fi

# Build Flatpak
echo "📦 Building Flatpak..."
flatpak-builder --force-clean --user --install-deps-from=flathub \
    build-dir com.basiphobe.basitune.yml

# Install locally
echo "📦 Installing Flatpak locally..."
flatpak-builder --user --install --force-clean \
    build-dir com.basiphobe.basitune.yml

echo ""
echo "✅ Done! Run with:"
echo "   flatpak run com.basiphobe.basitune"
