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
_TELEGRAM_SVG_PATH: Path = ASSETS_DIR / "telegram_icon.svg"
_TELEGRAM_PNG_PATH: Path = ASSETS_DIR / "telegram_icon.png"
_YOUTUBE_SVG_PATH: Path = ASSETS_DIR / "youtube_icon.svg"
_YOUTUBE_PNG_PATH: Path = ASSETS_DIR / "youtube_icon.png"


def _rasterize_patreon(png_path: Path, size: int = 256) -> None:
    """Draw the Patreon P logo with Pillow (circle + rect)."""
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    scale = size / 64.0
    cx, cy, r = 38 * scale, 20 * scale, 14 * scale
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 66, 77, 255))
    rx = 4 * scale
    x1, y1 = 4 * scale, 4 * scale
    x2, y2 = (4 + 12) * scale, (4 + 56) * scale
    draw.rounded_rectangle([x1, y1, x2, y2], radius=rx, fill=(255, 66, 77, 255))
    img.save(str(png_path), "PNG")


def _rasterize_telegram(png_path: Path, size: int = 256) -> None:
    """Draw a flat Telegram paper-plane icon with Pillow."""
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size
    # Blue circle background
    draw.ellipse([0, 0, s - 1, s - 1], fill=(41, 182, 246, 255))
    # Paper plane arrow: simple polygon
    sc = s / 64.0
    plane = [
        (13.5 * sc, 31.2 * sc),
        (49.2 * sc, 17.5 * sc),
        (43.3 * sc, 23.5 * sc),
        (23.7 * sc, 35.8 * sc),
        (28.0 * sc, 47.0 * sc),
        (29.8 * sc, 46.2 * sc),
        (34.0 * sc, 42.2 * sc),
        (42.7 * sc, 48.6 * sc),
        (45.5 * sc, 47.3 * sc),
        (51.5 * sc, 19.7 * sc),
        (15.1 * sc, 33.1 * sc),
    ]
    draw.polygon(plane, fill=(255, 255, 255, 240))
    img.save(str(png_path), "PNG")


def _rasterize_youtube(png_path: Path, size: int = 256) -> None:
    """Draw a YouTube play-button icon with Pillow."""
    from PIL import Image, ImageDraw
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    s = size
    # Red rounded rect background
    draw.rounded_rectangle([0, 0, s - 1, s - 1], radius=s // 6, fill=(255, 0, 0, 255))
    # White play triangle
    m = s / 64.0
    tri = [
        (27.3 * m, 25.1 * m),
        (27.3 * m, 38.9 * m),
        (38.9 * m, 32.0 * m),
    ]
    draw.polygon(tri, fill=(255, 255, 255, 255))
    img.save(str(png_path), "PNG")


_BRAND_RASTERIZERS = {
    "patreon": (_PATREON_SVG_PATH, _PATREON_PNG_PATH, _rasterize_patreon),
    "telegram": (_TELEGRAM_SVG_PATH, _TELEGRAM_PNG_PATH, _rasterize_telegram),
    "youtube": (_YOUTUBE_SVG_PATH, _YOUTUBE_PNG_PATH, _rasterize_youtube),
}


def _ensure_icon_png(brand: str) -> Path:
    """Return path to a rasterised PNG icon for the given brand."""
    svg_path, png_path, rasterizer = _BRAND_RASTERIZERS[brand]
    if png_path.exists():
        return png_path
    # Try cairosvg first
    if svg_path.exists():
        try:
            import cairosvg  # type: ignore[import-untyped]
            cairosvg.svg2png(url=str(svg_path), write_to=str(png_path),
                             output_width=256, output_height=256)
            logger.info("Converted %s SVG -> PNG via cairosvg", brand)
            return png_path
        except Exception:
            pass
    # Pillow fallback
    try:
        rasterizer(png_path)
        logger.info("Rasterised %s icon via Pillow", brand)
        return png_path
    except Exception as exc:
        logger.warning("Failed to rasterise %s icon: %s", brand, exc)
        return svg_path


PATREON_ICON_PATH: Path = _ensure_icon_png("patreon")
TELEGRAM_ICON_PATH: Path = _ensure_icon_png("telegram")
YOUTUBE_ICON_PATH: Path = _ensure_icon_png("youtube")

# Map brand → icon path for watermark renderer
BRAND_ICON_PATHS: dict[str, Path] = {
    "patreon": PATREON_ICON_PATH,
    "telegram": TELEGRAM_ICON_PATH,
    "youtube": YOUTUBE_ICON_PATH,
}

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
