"""
NinyraWatermark — Backend entry point for PyInstaller bundling.

Usage (packaged):
    backend.exe --port 8765 --host 127.0.0.1

Usage (development):
    python backend_entry.py --port 8765

This script is the PyInstaller target. It starts the FastAPI/uvicorn server
and serves the React frontend from ../dist/ (relative to the executable).

Rules:
    R3  — Error handling, logging
    R15 — Auto-start, port management
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path

# ─── Logging Setup ───────────────────────────────────────────────────────────
LOG_DIR = Path.home() / ".ninyrawatermark" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "backend.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_FILE), encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("ninyrawatermark.entry")


def get_dist_dir() -> Path:
    """
    Locate the React dist/ folder.
    When packaged with PyInstaller, the executable is in resources/backend/
    and dist/ files are bundled inside the executable's _MEIPASS or
    placed by electron-builder in the resources/ dir next to backend/.
    """
    if getattr(sys, "frozen", False):
        # Running as PyInstaller bundle
        exe_dir = Path(sys.executable).parent
        # electron-builder puts backend.exe in resources/backend/
        # and we expect dist/ to be accessible via the Electron app
        # The backend serves from ../dist relative to exe
        candidates = [
            exe_dir.parent / "dist",       # resources/dist (placed by electron-builder)
            exe_dir / "dist",               # resources/backend/dist (fallback)
            exe_dir.parent.parent / "dist", # app/dist (deep fallback)
        ]
    else:
        # Running in development: we're in backend/, dist is in desktop/dist
        candidates = [
            Path(__file__).parent.parent / "desktop" / "dist",
            Path(__file__).parent.parent / "dist",
            Path(__file__).parent / "dist",
        ]

    for candidate in candidates:
        if candidate.exists() and (candidate / "index.html").exists():
            logger.info("Found dist dir: %s", candidate)
            return candidate

    logger.warning("dist/ not found in any candidate path")
    return candidates[0]  # Return first candidate even if missing


def main() -> None:
    parser = argparse.ArgumentParser(description="NinyraWatermark Backend")
    parser.add_argument("--port", type=int, default=8765, help="Port to listen on")
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host to bind to")
    args = parser.parse_args()

    logger.info("NinyraWatermark backend starting on %s:%d", args.host, args.port)

    # Set environment variable so main.py can find the dist dir
    dist_dir = get_dist_dir()
    os.environ["NINYRA_DIST_DIR"] = str(dist_dir)
    logger.info("DIST DIR: %s", dist_dir)

    # Import and start uvicorn with our FastAPI app
    try:
        import uvicorn

        # In packaged mode, adjust sys.path so our backend modules are importable
        if getattr(sys, "frozen", False):
            # _MEIPASS is the temp dir where PyInstaller extracts bundled modules
            bundle_dir = getattr(sys, "_MEIPASS", Path(sys.executable).parent)
            bundle_dir = str(bundle_dir)
            if bundle_dir not in sys.path:
                sys.path.insert(0, bundle_dir)
            logger.info("PyInstaller bundle dir: %s", bundle_dir)
            logger.info("sys.path: %s", sys.path[:5])

        # Import the FastAPI app object directly — do NOT pass "main:app" string
        # because uvicorn module discovery fails in PyInstaller frozen bundles.
        try:
            from backend.main import app  # works in dev mode
            logger.info("Imported app from backend.main")
        except ImportError:
            from main import app  # fallback for PyInstaller bundle layout  # noqa: F401
            logger.info("Imported app from main (bundle mode)")

        uvicorn.run(
            app,  # pass the object, not a string
            host=args.host,
            port=args.port,
            log_level="info",
            access_log=False,
        )
    except ImportError as exc:
        logger.error("Failed to import backend: %s", exc, exc_info=True)
        sys.exit(1)
    except Exception as exc:
        logger.error("Backend crashed: %s", exc, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
