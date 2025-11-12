#!/usr/bin/env bash
# Setup script for Basitune development environment
# This script checks prerequisites and installs dependencies

echo "🎵 Basitune Development Environment Setup"
echo "=========================================="
echo ""

# Check for Node.js
echo "Checking for Node.js..."
if command -v node &> /dev/null; then
    echo "✅ Node.js found: $(node --version)"
else
    echo "❌ Node.js not found. Please install from https://nodejs.org/"
    exit 1
fi

# Check for npm
echo "Checking for npm..."
if command -v npm &> /dev/null; then
    echo "✅ npm found: $(npm --version)"
else
    echo "❌ npm not found. Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Check for Rust
echo "Checking for Rust..."
if command -v rustc &> /dev/null; then
    echo "✅ Rust found: $(rustc --version)"
else
    echo "❌ Rust not found. Please install from https://rustup.rs/"
    exit 1
fi

# Check for Cargo
echo "Checking for Cargo..."
if command -v cargo &> /dev/null; then
    echo "✅ Cargo found: $(cargo --version)"
else
    echo "❌ Cargo not found. Please install Rust from https://rustup.rs/"
    exit 1
fi

echo ""
echo "Installing Node.js dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Run 'npm run dev' to start development mode"
    echo "  2. Run 'npm run build' to build for production"
    echo ""
    echo "📖 Documentation:"
    echo "  - QUICKSTART.md - Getting started guide"
    echo "  - README.md - Full documentation"
    echo "  - DEVELOPMENT.md - Developer notes"
    echo ""
    echo "Happy coding! 🎵"
else
    echo ""
    echo "❌ Setup failed. Please check the error messages above."
    exit 1
fi
