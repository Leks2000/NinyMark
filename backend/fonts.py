"""
NinyraWatermark — Font management module.

Handles font loading, validation, upload, and listing.
Stores custom fonts in ~/.ninyrawatermark/fonts/.
"""

from __future__ import annotations

import logging
import re
from pathlib import Path
from typing import Optional

from PIL import ImageFont

from backend.config import (
    FONTS_DIR,
    ACCEPTED_FONT_EXTENSIONS,
    FONT_MAGIC_BYTES,
)

logger = logging.getLogger("ninyrawatermark.fonts")

# System font search paths
SYSTEM_FONT_DIRS: list[Path] = [
    Path("/usr/share/fonts"),
    Path("/usr/local/share/fonts"),
    Path("/System/Library/Fonts"),
    Path("C:/Windows/Fonts"),
]


def _sanitize_filename(name: str) -> str:
    """Remove special characters from font filename, keeping alphanumerics and dashes."""
    stem = Path(name).stem
    ext = Path(name).suffix.lower()
    sanitized = re.sub(r"[^a-zA-Z0-9_\-]", "_", stem)
    sanitized = re.sub(r"_+", "_", sanitized).strip("_")
    if not sanitized:
        sanitized = "font"
    return f"{sanitized}{ext}"


def _validate_magic_bytes(data: bytes, extension: str) -> bool:
    """Check the file starts with valid font magic bytes."""
    expected_list = FONT_MAGIC_BYTES.get(extension, [])
    for magic in expected_list:
        if data[:len(magic)] == magic:
            return True
    return False


def validate_font_file(data: bytes, filename: str) -> tuple[bool, str]:
    """Validate that uploaded data is a real font file."""
    ext = Path(filename).suffix.lower()

    if ext not in ACCEPTED_FONT_EXTENSIONS:
        return False, f"Unsupported format: {ext}. Only .ttf and .otf allowed."

    if not _validate_magic_bytes(data, ext):
        return False, "File does not appear to be a valid font (bad magic bytes)."

    # Try loading with PIL to confirm it's a usable font
    import io
    try:
        font_io = io.BytesIO(data)
        ImageFont.truetype(font_io, 24)
    except Exception as exc:
        logger.error("Font validation failed for %s: %s", filename, exc)
        return False, "Font file is corrupted or not supported."

    return True, ""


def save_uploaded_font(data: bytes, filename: str) -> tuple[bool, str, str]:
    """Save validated font to FONTS_DIR. Returns (ok, error_msg, font_name)."""
    safe_name = _sanitize_filename(filename)
    dest = FONTS_DIR / safe_name

    # Avoid overwriting — append number
    counter = 1
    while dest.exists():
        stem = Path(safe_name).stem
        ext = Path(safe_name).suffix
        dest = FONTS_DIR / f"{stem}_{counter}{ext}"
        counter += 1

    try:
        dest.write_bytes(data)
        logger.info("Font saved: %s", dest)
    except OSError as exc:
        logger.error("Failed to save font %s: %s", safe_name, exc)
        return False, f"Failed to save font: {exc}", ""

    # Extract font name from metadata
    font_name = _get_font_display_name(dest)
    return True, "", font_name


def _get_font_display_name(font_path: Path) -> str:
    """Extract the human-readable font name using PIL."""
    try:
        font = ImageFont.truetype(str(font_path), 24)
        name = font.getname()
        return f"{name[0]} {name[1]}".strip() if name else font_path.stem
    except Exception:
        return font_path.stem


def list_fonts() -> list[dict[str, str]]:
    """List all available fonts (system + custom uploaded)."""
    fonts: list[dict[str, str]] = []

    # System fonts — scan known candidates
    system_candidates = [
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "DejaVu Sans Bold"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "DejaVu Sans"),
        ("/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf", "Liberation Sans Bold"),
        ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf", "Liberation Sans"),
        ("/usr/share/fonts/truetype/ubuntu/Ubuntu-Bold.ttf", "Ubuntu Bold"),
        ("/usr/share/fonts/truetype/ubuntu/Ubuntu-Regular.ttf", "Ubuntu Regular"),
        ("/System/Library/Fonts/Helvetica.ttc", "Helvetica"),
        ("C:/Windows/Fonts/arialbd.ttf", "Arial Bold"),
        ("C:/Windows/Fonts/arial.ttf", "Arial"),
    ]

    for path_str, fallback_name in system_candidates:
        p = Path(path_str)
        if p.exists():
            display = _get_font_display_name(p)
            fonts.append({
                "name": display or fallback_name,
                "path": str(p),
                "source": "system",
            })

    # Custom uploaded fonts
    if FONTS_DIR.exists():
        for f in sorted(FONTS_DIR.iterdir()):
            if f.suffix.lower() in ACCEPTED_FONT_EXTENSIONS:
                display = _get_font_display_name(f)
                fonts.append({
                    "name": display,
                    "path": str(f),
                    "source": "custom",
                })

    return fonts


def get_font(path_or_name: Optional[str], size: int) -> ImageFont.FreeTypeFont:
    """Load a font by path or name at the given size, with fallback."""
    if path_or_name:
        try:
            return ImageFont.truetype(path_or_name, size)
        except (OSError, IOError):
            logger.warning("Font not found: %s, trying fallback", path_or_name)

    # Fallback chain
    fallbacks = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    for fb in fallbacks:
        try:
            return ImageFont.truetype(fb, size)
        except (OSError, IOError):
            continue

    logger.warning("No system font found, using PIL default font")
    try:
        return ImageFont.truetype("DejaVuSans-Bold", size)
    except (OSError, IOError):
        return ImageFont.load_default()
