#!/bin/bash
# Dead Pixel Pet — Mac Setup Script
# Run this on the Mac to install and start Bitsy!

echo "🐾 Dead Pixel Pet — Mac Setup"
echo "=============================="

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found! Install it from https://nodejs.org/"
    echo "   Or run: brew install node"
    exit 1
fi

echo "✅ Node.js $(node -v) found"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ npm install failed"
    exit 1
fi

echo "✅ Dependencies installed"
echo ""
echo "🎉 Ready! Run one of these:"
echo ""
echo "  npm start          — Run Bitsy directly"
echo "  npm run build:mac  — Build a .app bundle (zip)"
echo ""
echo "Starting Bitsy now..."
npm start
