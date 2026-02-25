"""
NinyraWatermark — Common helper utilities.

Shared functions for image encoding/decoding and response formatting.
"""

from __future__ import annotations

import base64
import io
import logging
from pathlib import Path

from PIL import Image

logger = logging.getLogger("ninyrawatermark.utils")


def image_to_base64(image: Image.Image, fmt: str = "PNG") -> str:
    """Convert a PIL Image to a base64-encoded string."""
    buffer = io.BytesIO()
    if fmt.upper() == "JPEG":
        if image.mode == "RGBA":
            image = image.convert("RGB")
    image.save(buffer, format=fmt, quality=95)
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("utf-8")


def base64_to_image(data: str) -> Image.Image:
    """Convert a base64-encoded string to a PIL Image."""
    image_data = base64.b64decode(data)
    buffer = io.BytesIO(image_data)
    return Image.open(buffer).copy()


def format_for_filename(filename: str) -> str:
    """Determine the image format string from a filename extension."""
    ext = Path(filename).suffix.lower()
    if ext in (".jpg", ".jpeg"):
        return "JPEG"
    return "PNG"


def success_response(data: object = None) -> dict[str, object]:
    """Build a standardized success API response."""
    return {"success": True, "data": data, "error": None}


def error_response(message: str) -> dict[str, object]:
    """Build a standardized error API response."""
    return {"success": False, "data": None, "error": message}
