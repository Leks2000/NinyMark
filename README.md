# NinyraWatermark

Smart watermark placement tool for anime/AI-generated images. Intelligently detects empty zones in images using a 3x3 grid analysis algorithm and places a branded `patreon.com/Ninyra` watermark in the optimal location.

## Features

- **Smart Zone Detection** — Analyzes 3x3 grid of image regions, places watermark in the most uniform (empty) area
- **3 Watermark Styles** — Text only, Icon + Text, Branded Block (frosted glass card)
- **Batch Processing** — Process up to 100 images with parallel execution
- **Full Settings Control** — Opacity, size, padding, color theme, custom text
- **Presets System** — Save/load configuration presets (IG Post, Patreon R18, TikTok built-in)
- **Before/After Preview** — Side-by-side comparison with lightbox zoom
- **Download** — Individual or batch download of watermarked images
- **Dark Theme** — Content creator-optimized dark UI
- **Keyboard Shortcuts** — Ctrl+O (open), Ctrl+Shift+B (batch process)

## Quick Start

```bash
npm install
pip install -r backend/requirements.txt
npm run dev
```

## Tech Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Framer Motion
- **Backend**: Python 3.11+, FastAPI, Pillow, NumPy
- **Build**: Vite 6, Uvicorn

## Project Structure

```
ninyra-watermark/
├── backend/
│   ├── main.py            # FastAPI app + static file serving
│   ├── watermark.py       # Core watermark rendering (3 styles)
│   ├── zone_detector.py   # 3x3 grid zone analysis algorithm
│   ├── types.py           # Type definitions, presets, constants
│   └── requirements.txt   # Python dependencies
├── src/
│   ├── App.tsx            # Main application component
│   ├── main.tsx           # Entry point
│   ├── types.ts           # TypeScript interfaces
│   ├── components/
│   │   ├── DropZone.tsx   # Drag & drop file upload
│   │   ├── Preview.tsx    # Before/after image preview
│   │   ├── Settings.tsx   # Watermark settings panel
│   │   ├── Header.tsx     # App header with status
│   │   └── ErrorToast.tsx # Error notifications
│   ├── hooks/
│   │   └── useWatermark.ts # Core state management hook
│   ├── lib/
│   │   └── api.ts         # API client
│   └── styles/
│       └── globals.css    # Tailwind + custom styles
├── assets/
│   └── patreon_icon.svg   # Patreon brand icon
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── README.md
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| POST | `/process/single` | Process one image |
| POST | `/process/batch` | Process multiple images |
| GET | `/presets` | Get all presets |
| POST | `/presets` | Save a preset |
| DELETE | `/presets/{name}` | Delete a preset |

## Zone Detection Algorithm

1. Convert image to grayscale
2. Divide into 3x3 grid (9 zones)
3. Calculate standard deviation of pixel brightness per zone
4. Exclude center zone (index 4)
5. Select zone with lowest std deviation (most uniform area)
6. Fallback: bottom-right if all zones score within 15 units of each other
7. Images < 300px: always use bottom-right corner

## License

Private project — NinyraWatermark
