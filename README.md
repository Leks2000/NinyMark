# NinyraWatermark

Smart watermark placement tool for anime/AI-generated images.  
Intelligently detects empty zones via 3x3 grid analysis and places a branded `patreon.com/Ninyra` watermark.

---

## Quick Start

```bash
pip install -r backend/requirements.txt
python backend/app.py
# Open http://localhost:8765
```

---

## Project Structure

```
NinyMark/
├── frontend/           # Vanilla JS frontend (no frameworks)
│   ├── index.html
│   ├── css/styles.css  # CSS custom properties, BEM-like classes
│   └── js/
│       ├── app.js      # Entry point, initialization
│       ├── preview.js  # Preview canvas, drag-and-drop
│       ├── settings.js # Settings management, undo/redo
│       ├── upload.js   # File upload, drag-and-drop zone
│       ├── api.js      # All fetch requests to backend
│       └── ui.js       # Toast, modals, UI utilities
├── backend/
│   ├── app.py          # Flask routes only, no business logic
│   ├── watermark.py    # Watermark rendering engine
│   ├── zone_detector.py # 3x3 grid zone detection
│   ├── ai_detection.py # MediaPipe face detection
│   ├── fonts.py        # Font management and validation
│   ├── steganography.py # Invisible watermark (dwtDct)
│   ├── config.py       # Constants, paths, config helpers
│   ├── utils.py        # Shared utilities
│   └── requirements.txt
├── assets/
│   └── patreon_icon.svg
├── web/                # Legacy React/TS web version
├── desktop/            # Legacy Electron desktop version
└── README.md
```

---

## Features

- **Smart Zone Detection** -- 3x3 grid analysis, auto-select emptiest area
- **3 Watermark Styles** -- Text / Icon+Text / Branded Block
- **Batch Processing** -- up to 100 images
- **Before/After Preview** -- toggle comparison
- **Presets** -- IG Post, Patreon R18, TikTok
- **Dark Theme** -- optimized for content creators
- **Keyboard Shortcuts** -- Ctrl+O, Ctrl+Shift+B, Ctrl+Z/Y

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.10+, Flask, Pillow, OpenCV, NumPy |
| **Frontend** | Vanilla JS, CSS custom properties (no frameworks) |
| **AI Detection** | MediaPipe face_detection (blaze_face) |
| **Steganography** | invisible-watermark (dwtDct) |
| **Storage** | `~/.ninyrawatermark/` for fonts, config, presets |

---

## API Endpoints

```
POST /api/preview       -- process image, return base64 preview
POST /api/export        -- process + optional invisible watermark
POST /api/fonts/upload  -- upload .ttf/.otf font
GET  /api/fonts         -- list available fonts
POST /api/verify        -- verify invisible watermark
POST /api/detect-faces  -- run face detection
GET  /api/presets       -- list presets
POST /api/presets       -- save preset
DELETE /api/presets/<n>  -- delete preset
GET  /api/config        -- get user config
POST /api/config        -- update user config
GET  /health            -- health check
```

All responses follow: `{ "success": bool, "data": any, "error": str|null }`

---

### What was implemented

- **Drag-and-drop positioning** -- move watermark anywhere on preview with mouse, coordinates sync to API automatically (normalized 0.0-1.0). Snap-to-grid option (10% increments). Visual crosshair guides while dragging
- **Custom font upload** -- upload .ttf/.otf fonts, validated by extension AND magic bytes, stored in `~/.ninyrawatermark/fonts/`, available in font selector dropdown
- **Undo/Redo** -- Ctrl+Z/Ctrl+Y for all settings changes, 50-step history stack with 300ms debounce, persisted in sessionStorage
- **Invisible watermark** -- DCT-domain steganography via `invisible-watermark` library (dwtDct method), survives JPEG compression, verify tool included. Embedded only on export (not preview). Owner string stored server-side in config.json
- **AI zone detection v2** -- MediaPipe face detection (blaze_face_short_range), excludes face regions from watermark placement with 15% bbox padding, runs once on upload (cached), toggle for showing detected zones as semi-transparent overlays

### What can be added next

- **Batch processing UI** -- drag a folder of images, apply same settings to all, download as ZIP
- **Watermark templates** -- save/load named presets (position + style + opacity) with one click
- **Video watermarking** -- extend pipeline to .mp4 files using FFmpeg + PIL frame-by-frame
- **Tiling mode** -- repeat watermark in a diagonal grid pattern across entire image
- **QR code watermark** -- generate watermark as QR code linking to your website/portfolio
- **API key protection** -- add optional API key auth to backend for self-hosted deployments
- **EXIF metadata injection** -- write copyright info into image EXIF data on export
- **Browser extension** -- right-click any image on web -> "Add watermark" -> download

---

## License

Private -- NinyraWatermark (c) Ninyra
