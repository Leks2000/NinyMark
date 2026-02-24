"""
NinyraWatermark — FastAPI backend application.

Endpoints:
  POST /process/single — process one image
  POST /process/batch  — process multiple images
  GET  /health         — health check

Rules:
  R3  — Error handling everywhere
  R7  — Batch processing with async + ThreadPoolExecutor
  R15 — Auto-start on configured port
"""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.types import (
    WatermarkSettings,
    WatermarkStyle,
    WatermarkSize,
    WatermarkColor,
    DEFAULT_PRESETS,
    ZONE_NAMES,
)
from backend.watermark import process_single_image

# ---------------------------------------------------------------------------
# Logging setup — R3: log to file
# ---------------------------------------------------------------------------
LOG_DIR = Path.home() / ".ninyrawatermark" / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "app.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_FILE)),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("ninyrawatermark.api")

# ---------------------------------------------------------------------------
# Config / Presets paths — R13
# ---------------------------------------------------------------------------
CONFIG_DIR = Path.home() / ".ninyrawatermark"
CONFIG_DIR.mkdir(parents=True, exist_ok=True)
PRESETS_FILE = CONFIG_DIR / "presets.json"
CONFIG_FILE = CONFIG_DIR / "config.json"


def _load_presets() -> dict[str, dict[str, str | float | int]]:
    """Load presets from disk, merging with defaults."""
    presets = dict(DEFAULT_PRESETS)
    if PRESETS_FILE.exists():
        try:
            stored = json.loads(PRESETS_FILE.read_text(encoding="utf-8"))
            presets.update(stored)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to load presets: %s", exc)
    return presets


def _save_presets(presets: dict[str, dict[str, str | float | int]]) -> None:
    """Persist presets to disk."""
    try:
        PRESETS_FILE.write_text(
            json.dumps(presets, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.error("Failed to save presets: %s", exc)


# ---------------------------------------------------------------------------
# Pydantic models for API
# ---------------------------------------------------------------------------
class SettingsPayload(BaseModel):
    style: str = "branded_block"
    opacity: float = Field(default=0.75, ge=0.3, le=1.0)
    size: str = "M"
    padding: int = Field(default=20, ge=10, le=50)
    color: str = "light"
    custom_text: str = "patreon.com/Ninyra"

    def to_watermark_settings(self) -> WatermarkSettings:
        return WatermarkSettings(
            style=WatermarkStyle(self.style),
            opacity=self.opacity,
            size=WatermarkSize(self.size),
            padding=self.padding,
            color=WatermarkColor(self.color),
            custom_text=self.custom_text,
        )


class SingleRequest(BaseModel):
    image: str  # base64
    settings: SettingsPayload = SettingsPayload()
    name: str = "image.png"


class SingleResponse(BaseModel):
    result: str  # base64
    zone_used: str
    zone_score: float


class BatchImageItem(BaseModel):
    name: str
    data: str  # base64


class BatchRequest(BaseModel):
    images: list[BatchImageItem]
    settings: SettingsPayload = SettingsPayload()


class BatchResultItem(BaseModel):
    name: str
    data: str  # base64
    zone_used: str
    zone_score: float


class BatchResponse(BaseModel):
    results: list[BatchResultItem]


class PresetPayload(BaseModel):
    name: str
    settings: SettingsPayload


class PresetsResponse(BaseModel):
    presets: dict[str, dict[str, str | float | int]]


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="NinyraWatermark API",
    version="1.0.0",
    description="Smart watermark placement for anime/AI-generated images",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Thread pool for batch processing — R7: max 4 threads
executor = ThreadPoolExecutor(max_workers=4)

# ---------------------------------------------------------------------------
# Serve frontend static files from dist/
# ---------------------------------------------------------------------------
DIST_DIR = Path(__file__).parent.parent / "dist"


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}


@app.post("/process/single", response_model=SingleResponse)
async def process_single(request: SingleRequest) -> SingleResponse:
    """Process a single image with watermark."""
    try:
        settings = request.settings.to_watermark_settings()
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            executor,
            process_single_image,
            request.image,
            settings,
            request.name,
        )
        return SingleResponse(
            result=result.image_base64,
            zone_used=result.zone_used,
            zone_score=round(result.zone_score, 2),
        )
    except ValueError as exc:
        logger.error("Invalid input for single process: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Error processing single image: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Processing error: {exc}") from exc


@app.post("/process/batch", response_model=BatchResponse)
async def process_batch(request: BatchRequest) -> BatchResponse:
    """Process multiple images with watermark in parallel."""
    try:
        settings = request.settings.to_watermark_settings()
        loop = asyncio.get_event_loop()

        async def process_one(item: BatchImageItem) -> BatchResultItem:
            result = await loop.run_in_executor(
                executor,
                process_single_image,
                item.data,
                settings,
                item.name,
            )
            return BatchResultItem(
                name=result.original_name,
                data=result.image_base64,
                zone_used=result.zone_used,
                zone_score=round(result.zone_score, 2),
            )

        tasks = [process_one(item) for item in request.images]
        results = await asyncio.gather(*tasks)

        return BatchResponse(results=list(results))
    except ValueError as exc:
        logger.error("Invalid input for batch process: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Error processing batch: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch processing error: {exc}") from exc


@app.get("/presets", response_model=PresetsResponse)
async def get_presets() -> PresetsResponse:
    """Get all saved presets."""
    try:
        presets = _load_presets()
        return PresetsResponse(presets=presets)
    except Exception as exc:
        logger.error("Error loading presets: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load presets") from exc


@app.post("/presets")
async def save_preset(payload: PresetPayload) -> dict[str, str]:
    """Save a named preset."""
    try:
        presets = _load_presets()
        presets[payload.name] = {
            "style": payload.settings.style,
            "opacity": payload.settings.opacity,
            "size": payload.settings.size,
            "padding": payload.settings.padding,
            "color": payload.settings.color,
            "custom_text": payload.settings.custom_text,
        }
        _save_presets(presets)
        return {"status": "saved", "name": payload.name}
    except Exception as exc:
        logger.error("Error saving preset: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to save preset") from exc


@app.delete("/presets/{name}")
async def delete_preset(name: str) -> dict[str, str]:
    """Delete a named preset (cannot delete default presets)."""
    try:
        if name in DEFAULT_PRESETS:
            raise HTTPException(status_code=400, detail="Cannot delete default presets")
        presets = _load_presets()
        if name in presets:
            del presets[name]
            _save_presets(presets)
        return {"status": "deleted", "name": name}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error deleting preset: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to delete preset") from exc


# ---------------------------------------------------------------------------
# Static file serving — serve the React build from dist/
# Must be registered LAST so API routes take priority.
# ---------------------------------------------------------------------------
if DIST_DIR.exists():
    app.mount("/assets", StaticFiles(directory=str(DIST_DIR / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str) -> FileResponse:
        """Serve the React SPA. Serves index.html for all non-API routes."""
        file_path = DIST_DIR / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(DIST_DIR / "index.html"))
