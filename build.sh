#!/bin/bash
# NinyraWatermark — Build script
set -e

echo "=== NinyraWatermark Build ==="

# Install Python deps
echo "[1/3] Installing Python dependencies..."
pip install -r backend/requirements.txt --quiet

# Install Node deps
echo "[2/3] Installing Node.js dependencies..."
npm install --silent

# Build frontend
echo "[3/3] Building frontend..."
npx vite build
cp public/patreon_icon.svg dist/patreon_icon.svg 2>/dev/null || true

echo ""
echo "=== Build complete! ==="
echo "Run:  uvicorn backend.main:app --host 0.0.0.0 --port 8765"
echo "Open: http://localhost:8765"
