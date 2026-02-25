"""
NinyraWatermark — Configuration constants and paths.

All paths through pathlib.Path, all constants centralized here.
Secrets and paths via ~/.ninyrawatermark/config.json.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("ninyrawatermark.config")

# ---------------------------------------------------------------------------
# Directories
# ---------------------------------------------------------------------------
APP_DIR: Path = Path.home() / ".ninyrawatermark"
FONTS_DIR: Path = APP_DIR / "fonts"
LOGS_DIR: Path = APP_DIR / "logs"
CONFIG_FILE: Path = APP_DIR / "config.json"
PRESETS_FILE: Path = APP_DIR / "presets.json"
ASSETS_DIR: Path = Path(__file__).parent.parent / "assets"
_PATREON_SVG_PATH: Path = ASSETS_DIR / "patreon_icon.svg"
_PATREON_PNG_PATH: Path = ASSETS_DIR / "patreon_icon.png"


def _ensure_patreon_png() -> Path:
    """Convert patreon_icon.svg to PNG if the PNG is missing.

    Uses cairosvg when available, otherwise rasterises the simple SVG
    geometry directly with Pillow so the build works without cairosvg.
    Returns the path to whichever file is usable.
    """
    if _PATREON_PNG_PATH.exists():
        return _PATREON_PNG_PATH

    if not _PATREON_SVG_PATH.exists():
        return _PATREON_PNG_PATH  # fallback icon will be generated later

    # Try cairosvg first (best quality)
    try:
        import cairosvg  # type: ignore[import-untyped]
        cairosvg.svg2png(
            url=str(_PATREON_SVG_PATH),
            write_to=str(_PATREON_PNG_PATH),
            output_width=256,
            output_height=256,
        )
        logger.info("Converted patreon SVG -> PNG via cairosvg")
        return _PATREON_PNG_PATH
    except Exception:
        pass

    # Fallback: rasterise the known SVG shapes with Pillow
    try:
        from PIL import Image, ImageDraw  # type: ignore[import-untyped]

        size = 256
        img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        # Patreon logo: circle + rectangle (matches the SVG)
        scale = size / 64.0
        # Circle: cx=38, cy=20, r=14
        cx, cy, r = 38 * scale, 20 * scale, 14 * scale
        draw.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            fill=(255, 66, 77, 255),
        )
        # Rect: x=4, y=4, width=12, height=56, rx=4
        rx = 4 * scale
        x1, y1 = 4 * scale, 4 * scale
        x2, y2 = (4 + 12) * scale, (4 + 56) * scale
        draw.rounded_rectangle([x1, y1, x2, y2], radius=rx, fill=(255, 66, 77, 255))

        img.save(str(_PATREON_PNG_PATH), "PNG")
        logger.info("Converted patreon SVG -> PNG via Pillow rasterisation")
        return _PATREON_PNG_PATH
    except Exception as exc:
        logger.warning("Failed to convert patreon SVG to PNG: %s", exc)
        return _PATREON_SVG_PATH  # watermark.py will try Image.open on SVG


PATREON_ICON_PATH: Path = _ensure_patreon_png()

# ---------------------------------------------------------------------------
# Ensure directories exist on import
# ---------------------------------------------------------------------------
for _dir in (APP_DIR, FONTS_DIR, LOGS_DIR):
    _dir.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Watermark constants
# ---------------------------------------------------------------------------
PATREON_RED: tuple[int, int, int] = (255, 66, 77)

# Zone detection
SIMILARITY_THRESHOLD: float = 15.0
MIN_DIMENSION: int = 300
FALLBACK_ZONE_INDEX: int = 8

# MediaPipe face detection
FACE_BBOX_PADDING: float = 0.15
FACE_FALLBACK_OPACITY: float = 0.5

# Steganography
DEFAULT_WATERMARK_STRING: str = "NinyraWatermark"
STEG_METHOD: str = "dwtDct"

# Size multipliers: fraction of image width
SIZE_MULTIPLIERS: dict[str, float] = {
    "S": 0.08,
    "M": 0.12,
    "L": 0.18,
}

# Default presets
DEFAULT_PRESETS: dict[str, dict[str, str | float | int]] = {
    "IG Post": {
        "style": "branded_block",
        "opacity": 0.75,
        "size": "M",
        "padding": 20,
        "color": "light",
        "custom_text": "patreon.com/Ninyra",
    },
    "Patreon R18": {
        "style": "branded_block",
        "opacity": 0.85,
        "size": "L",
        "padding": 15,
        "color": "light",
        "custom_text": "patreon.com/Ninyra",
    },
    "TikTok": {
        "style": "text",
        "opacity": 0.6,
        "size": "S",
        "padding": 30,
        "color": "light",
        "custom_text": "patreon.com/Ninyra",
    },
}

# Accepted font extensions
ACCEPTED_FONT_EXTENSIONS: set[str] = {".ttf", ".otf"}

# Font magic bytes for validation
FONT_MAGIC_BYTES: dict[str, list[bytes]] = {
    ".ttf": [b"\x00\x01\x00\x00", b"true", b"typ1"],
    ".otf": [b"OTTO"],
}

# Zone names for 3x3 grid
ZONE_NAMES: dict[int, str] = {
    0: "top-left",
    1: "top-center",
    2: "top-right",
    3: "middle-left",
    4: "center",
    5: "middle-right",
    6: "bottom-left",
    7: "bottom-center",
    8: "bottom-right",
}


# ---------------------------------------------------------------------------
# Config file helpers
# ---------------------------------------------------------------------------
def load_config() -> dict[str, str | float | bool]:
    """Load user config from disk."""
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to load config: %s", exc)
    return {}


def save_config(data: dict[str, str | float | bool]) -> None:
    """Persist user config to disk."""
    try:
        existing = load_config()
        existing.update(data)
        CONFIG_FILE.write_text(
            json.dumps(existing, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.error("Failed to save config: %s", exc)


def get_watermark_string() -> str:
    """Get the invisible watermark owner string from config."""
    cfg = load_config()
    return str(cfg.get("watermark_string", DEFAULT_WATERMARK_STRING))


def set_watermark_string(value: str) -> None:
    """Set the invisible watermark owner string in config."""
    save_config({"watermark_string": value})


def load_presets() -> dict[str, dict[str, str | float | int]]:
    """Load presets from disk, merging with defaults."""
    presets = dict(DEFAULT_PRESETS)
    if PRESETS_FILE.exists():
        try:
            stored = json.loads(PRESETS_FILE.read_text(encoding="utf-8"))
            presets.update(stored)
        except (json.JSONDecodeError, OSError) as exc:
            logger.warning("Failed to load presets: %s", exc)
    return presets


def save_presets(presets: dict[str, dict[str, str | float | int]]) -> None:
    """Persist presets to disk."""
    try:
        PRESETS_FILE.write_text(
            json.dumps(presets, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )
    except OSError as exc:
        logger.error("Failed to save presets: %s", exc)
