"""
NinyraWatermark — Invisible watermark (steganography) module.

Uses invisible-watermark library with dwtDct method (DCT-domain,
robust against JPEG compression up to quality 70).

Graceful degradation: if invisible-watermark is not installed, returns clear error.
"""

from __future__ import annotations

import logging
import time

import numpy as np
from numpy.typing import NDArray
from PIL import Image

from backend.config import STEG_METHOD, get_watermark_string

logger = logging.getLogger("ninyrawatermark.steganography")

# Try to import invisible-watermark — graceful degradation
_IW_AVAILABLE = False
try:
    from imwatermark import WatermarkEncoder, WatermarkDecoder
    _IW_AVAILABLE = True
except ImportError:
    logger.warning(
        "invisible-watermark not installed. Steganography disabled. "
        "Install: pip install invisible-watermark"
    )


def is_available() -> bool:
    """Check if invisible-watermark library is installed."""
    return _IW_AVAILABLE


def embed_watermark(image: Image.Image, owner_string: str | None = None) -> Image.Image:
    """Embed an invisible watermark into the image using dwtDct."""
    if not _IW_AVAILABLE:
        logger.warning("invisible-watermark not available, skipping embed")
        return image

    wm_string = owner_string or get_watermark_string()
    logger.info("Embedding invisible watermark: '%s'", wm_string)

    start = time.time()

    # Convert to BGR numpy array (OpenCV format) for the library
    rgb_array = np.array(image.convert("RGB"))
    bgr_array = rgb_array[:, :, ::-1].copy()

    encoder = WatermarkEncoder()
    encoder.set_watermark("bytes", wm_string.encode("utf-8"))
    encoded = encoder.encode(bgr_array, STEG_METHOD)

    # Convert back to RGB PIL Image
    result_rgb = encoded[:, :, ::-1]
    result_image = Image.fromarray(result_rgb, "RGB")

    # Restore alpha channel if original had one
    if image.mode == "RGBA":
        alpha = image.split()[3]
        result_image = result_image.convert("RGBA")
        result_image.putalpha(alpha)

    elapsed = time.time() - start
    logger.info("Watermark embedded in %.2fs", elapsed)

    return result_image


def extract_watermark(image: Image.Image) -> tuple[bool, str]:
    """Extract the invisible watermark from an image."""
    if not _IW_AVAILABLE:
        return False, "invisible-watermark library not installed. Install: pip install invisible-watermark"

    start = time.time()

    rgb_array = np.array(image.convert("RGB"))
    bgr_array = rgb_array[:, :, ::-1].copy()

    decoder = WatermarkDecoder("bytes", len(get_watermark_string()) * 8)
    extracted_bytes = decoder.decode(bgr_array, STEG_METHOD)

    elapsed = time.time() - start
    logger.info("Watermark extraction took %.2fs", elapsed)

    try:
        extracted = extracted_bytes.decode("utf-8", errors="replace")
        # Filter out non-printable characters
        extracted = "".join(c for c in extracted if c.isprintable())
        if extracted:
            logger.info("Extracted watermark: '%s'", extracted)
            return True, extracted
        return False, "No readable watermark found."
    except Exception as exc:
        logger.error("Failed to decode watermark bytes: %s", exc)
        return False, "Could not decode watermark data."
