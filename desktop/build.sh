#!/bin/bash
# NinyraWatermark Desktop — Full build for macOS/Linux
# Run from desktop/ directory
# Output: desktop/dist-electron/

set -e
cd "$(dirname "$0")"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  NinyraWatermark — Desktop Build"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Python deps + PyInstaller
echo "[1/5] Installing Python dependencies..."
pip install -r ../backend/requirements.txt --quiet
pip install pyinstaller --quiet

echo "[2/5] Building Python backend..."
mkdir -p resources/backend
cd ../backend
pyinstaller backend.spec \
    --distpath "../desktop/resources/backend" \
    --workpath "../desktop/build-tmp/pyinstaller" \
    --specpath "." \
    --noconfirm --clean
cd ../desktop
echo "  → backend binary ready"

# 2. Node deps
echo "[3/5] Installing Node.js dependencies..."
npm install --silent

# 3. React build
echo "[4/5] Building React frontend..."
npx tsc -b --noEmit
npx vite build

# Copy dist for packaged backend
mkdir -p resources/backend/dist
cp -r dist/* resources/backend/dist/

# 4. Electron builder
echo "[5/5] Packaging Electron app..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    npx electron-builder --mac
else
    npx electron-builder --linux
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Build complete! → dist-electron/"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
