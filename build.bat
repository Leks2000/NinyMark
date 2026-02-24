@echo off
REM NinyraWatermark — Build script (Windows)

echo === NinyraWatermark Build ===

echo [1/3] Installing Python dependencies...
pip install -r backend\requirements.txt --quiet

echo [2/3] Installing Node.js dependencies...
npm install --silent

echo [3/3] Building frontend...
npx vite build
copy public\patreon_icon.svg dist\patreon_icon.svg >nul 2>&1

echo.
echo === Build complete! ===
echo Run:  uvicorn backend.main:app --host 0.0.0.0 --port 8765
echo Open: http://localhost:8765
