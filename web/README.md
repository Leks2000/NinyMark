# NinyraWatermark — Web Version

Smart watermark placement tool. Web interface powered by Vite + React + Python FastAPI backend.

## Quick Start

```bash
# 1. Install Python deps (from root)
pip install -r ../backend/requirements.txt

# 2. Install Node deps
npm install

# 3. Start everything
npm run start
```

Откроется на `http://localhost:3000`

## Separate startup

```bash
# Terminal 1 — Python backend
npm run backend

# Terminal 2 — React dev server
npm run dev
```

## Build for production

```bash
npm run build
# Then serve via Python:
cd ../backend && uvicorn main:app --host 0.0.0.0 --port 8765
# Open http://localhost:8765
```

## Stack

- **Frontend**: React 18, TypeScript, Tailwind CSS, Framer Motion  
- **Backend**: Python 3.11+, FastAPI, Pillow, NumPy  
- **Build**: Vite 6, Uvicorn
