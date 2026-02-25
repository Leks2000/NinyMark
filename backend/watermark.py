"""
NinyraWatermark — Watermark rendering engine.

Renders watermarks in three styles:
  Style A (text): "patreon.com/Ninyra" with drop shadow
  Style B (icon_text): [Patreon icon] + "patreon.com/Ninyra" inline
  Style C (branded_block): Frosted rounded rectangle with icon + text (DEFAULT)

Rules:
  R1 — No stubs, every function fully implemented
  R4 — Never modify originals; always return new images
  R8 — Adaptive watermark sizing
"""

from __future__ import annotations

import base64
import io
import logging
import math
from pathlib import Path

import numpy as np
from numpy.typing import NDArray
from PIL import Image, ImageDraw, ImageFont, ImageFilter

from backend.wm_types import (
    WatermarkSettings,
    WatermarkStyle,
    WatermarkColor,
    WatermarkSize,
    SIZE_MULTIPLIERS,
    ProcessResult,
)
from backend.zone_detector import detect_best_zone

logger = logging.getLogger("ninyrawatermark.watermark")

# Paths
ASSETS_DIR = Path(__file__).parent.parent / "assets"
PATREON_ICON_PATH = ASSETS_DIR / "patreon_icon.png"

# Patreon brand color
PATREON_RED = (255, 66, 77)


def _get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """
    Load a suitable font at the given size. Tries system fonts,
    falls back to PIL default if none are available.
    """
    font_candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/truetype/ubuntu/Ubuntu-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "C:/Windows/Fonts/arialbd.ttf",
    ]
    for font_path in font_candidates:
        try:
            return ImageFont.truetype(font_path, size)
        except (OSError, IOError):
            continue

    logger.warning("No system font found, using PIL default font")
    try:
        return ImageFont.truetype("DejaVuSans-Bold", size)
    except (OSError, IOError):
        return ImageFont.load_default()


def _create_patreon_icon(size: int, color: tuple[int, int, int]) -> Image.Image:
    """
    Create a simple Patreon-style icon (circle) at the given size.
    If the PNG asset exists, load and tint it; otherwise generate a vector-style icon.
    """
    if PATREON_ICON_PATH.exists():
        try:
            icon = Image.open(PATREON_ICON_PATH).convert("RGBA")
            icon = icon.resize((size, size), Image.Resampling.LANCZOS)
            return icon
        except Exception as exc:
            logger.warning("Failed to load patreon icon: %s", exc)

    # Generate a simple Patreon-style 'P' circle icon
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)

    # Draw filled circle
    margin = 1
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=(*PATREON_RED, 255),
    )

    # Draw "P" letter
    font_size = int(size * 0.55)
    font = _get_font(font_size)
    bbox = draw.textbbox((0, 0), "P", font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = (size - text_w) // 2
    text_y = (size - text_h) // 2 - bbox[1]
    draw.text((text_x, text_y), "P", fill=(255, 255, 255, 255), font=font)

    return icon


def _get_text_color(color: WatermarkColor) -> tuple[int, int, int]:
    """Return the RGB text color based on the theme."""
    if color == WatermarkColor.LIGHT:
        return (255, 255, 255)
    return (20, 20, 20)


def _get_shadow_color(color: WatermarkColor) -> tuple[int, int, int, int]:
    """Return the RGBA shadow color based on the theme."""
    if color == WatermarkColor.LIGHT:
        return (0, 0, 0, 140)
    return (255, 255, 255, 100)


def _render_style_text(
    settings: WatermarkSettings,
    target_width: int,
) -> Image.Image:
    """
    Style A — Text only with drop shadow.
    Returns RGBA image of the watermark element.
    """
    text = settings.custom_text
    text_color = _get_text_color(settings.color)
    shadow_color = _get_shadow_color(settings.color)

    # Determine font size from target width
    font_size = max(12, int(target_width * 0.14))
    font = _get_font(font_size)

    # Measure text
    dummy_img = Image.new("RGBA", (1, 1))
    dummy_draw = ImageDraw.Draw(dummy_img)
    bbox = dummy_draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    # Create watermark image with extra space for shadow
    shadow_offset = max(2, font_size // 12)
    wm_width = text_w + shadow_offset + 4
    wm_height = text_h + shadow_offset + 4
    wm_img = Image.new("RGBA", (wm_width, wm_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(wm_img)

    # Draw shadow
    draw.text(
        (shadow_offset + 2, shadow_offset + 2 - bbox[1]),
        text,
        fill=shadow_color,
        font=font,
    )

    # Draw text
    draw.text(
        (2, 2 - bbox[1]),
        text,
        fill=(*text_color, 255),
        font=font,
    )

    return wm_img


def _render_style_icon_text(
    settings: WatermarkSettings,
    target_width: int,
) -> Image.Image:
    """
    Style B — Icon + Text inline layout.
    Returns RGBA image of the watermark element.
    """
    text = settings.custom_text
    text_color = _get_text_color(settings.color)
    shadow_color = _get_shadow_color(settings.color)

    font_size = max(12, int(target_width * 0.13))
    font = _get_font(font_size)

    # Measure text
    dummy_img = Image.new("RGBA", (1, 1))
    dummy_draw = ImageDraw.Draw(dummy_img)
    bbox = dummy_draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    icon_size = int(text_h * 1.3)
    icon_gap = max(4, icon_size // 5)

    wm_width = icon_size + icon_gap + text_w + 8
    wm_height = max(icon_size, text_h) + 8
    wm_img = Image.new("RGBA", (wm_width, wm_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(wm_img)

    # Place icon
    icon = _create_patreon_icon(icon_size, PATREON_RED)
    icon_y = (wm_height - icon_size) // 2
    wm_img.paste(icon, (4, icon_y), icon)

    # Draw text with shadow
    text_x = 4 + icon_size + icon_gap
    text_y = (wm_height - text_h) // 2 - bbox[1]

    shadow_offset = max(1, font_size // 14)
    draw.text(
        (text_x + shadow_offset, text_y + shadow_offset),
        text,
        fill=shadow_color,
        font=font,
    )
    draw.text(
        (text_x, text_y),
        text,
        fill=(*text_color, 255),
        font=font,
    )

    return wm_img


def _render_style_branded_block(
    settings: WatermarkSettings,
    target_width: int,
) -> Image.Image:
    """
    Style C (DEFAULT) — Branded block with frosted rounded rectangle background.
    Returns RGBA image of the watermark element.
    """
    text = settings.custom_text
    text_color = _get_text_color(settings.color)

    font_size = max(12, int(target_width * 0.12))
    font = _get_font(font_size)

    # Measure text
    dummy_img = Image.new("RGBA", (1, 1))
    dummy_draw = ImageDraw.Draw(dummy_img)
    bbox = dummy_draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    icon_size = int(text_h * 1.2)
    icon_gap = max(4, icon_size // 4)

    pad_h = max(10, font_size // 3)
    pad_w = max(16, font_size // 2)
    border_radius = max(12, font_size // 2)

    content_width = icon_size + icon_gap + text_w
    content_height = max(icon_size, text_h)

    wm_width = content_width + pad_w * 2
    wm_height = content_height + pad_h * 2

    # Create background with rounded rectangle
    wm_img = Image.new("RGBA", (wm_width, wm_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(wm_img)

    # Background color based on theme
    if settings.color == WatermarkColor.LIGHT:
        bg_color = (0, 0, 0, 153)  # 60% opacity dark
    else:
        bg_color = (255, 255, 255, 153)  # 60% opacity light

    draw.rounded_rectangle(
        [0, 0, wm_width - 1, wm_height - 1],
        radius=border_radius,
        fill=bg_color,
    )

    # Place icon
    icon = _create_patreon_icon(icon_size, PATREON_RED)
    icon_x = pad_w
    icon_y = (wm_height - icon_size) // 2
    wm_img.paste(icon, (icon_x, icon_y), icon)

    # Draw text
    text_x = pad_w + icon_size + icon_gap
    text_y = (wm_height - text_h) // 2 - bbox[1]
    draw.text(
        (text_x, text_y),
        text,
        fill=(*text_color, 255),
        font=font,
    )

    return wm_img


STYLE_RENDERERS = {
    WatermarkStyle.TEXT: _render_style_text,
    WatermarkStyle.ICON_TEXT: _render_style_icon_text,
    WatermarkStyle.BRANDED_BLOCK: _render_style_branded_block,
}


def apply_watermark(
    image: Image.Image,
    settings: WatermarkSettings,
) -> tuple[Image.Image, str, float, list[float]]:
    """
    Apply watermark to a copy of the image.
    If settings.manual_x/y are set, skip zone detection and place there.
    If settings.custom_size_pct is set, use it instead of the S/M/L enum.
    """
    result_image = image.convert("RGBA")
    width, height = result_image.size

    # Determine watermark width — custom slider overrides S/M/L
    if settings.custom_size_pct is not None:
        target_width = int(width * settings.custom_size_pct)
    else:
        multiplier = SIZE_MULTIPLIERS[settings.size]
        target_width = int(width * multiplier)

    # Render watermark element
    renderer = STYLE_RENDERERS[settings.style]
    wm_element = renderer(settings, target_width)

    # Apply opacity
    if settings.opacity < 1.0:
        alpha = wm_element.split()[3]
        alpha = alpha.point(lambda p: int(p * settings.opacity))
        wm_element.putalpha(alpha)

    wm_w, wm_h = wm_element.size

    # Determine placement
    if settings.manual_x is not None and settings.manual_y is not None:
        # Manual placement — convert fraction to pixels, clamp to image bounds
        px = int(settings.manual_x * width)
        py = int(settings.manual_y * height)
        # Clamp so watermark stays inside the image
        px = max(0, min(px, width - wm_w))
        py = max(0, min(py, height - wm_h))
        zone_name = "manual"
        zone_score = 1.0
        all_scores: list[float] = []
        logger.info("Manual placement: pos=(%d, %d)", px, py)
    else:
        # Smart zone detection
        image_array = np.array(result_image)
        zone_result = detect_best_zone(
            image_array,
            watermark_width=wm_w,
            watermark_height=wm_h,
            padding=settings.padding,
        )
        px, py = zone_result.x, zone_result.y
        zone_name = zone_result.zone_name
        zone_score = zone_result.score
        all_scores = zone_result.all_scores
        logger.info(
            "Smart zone: zone=%s, score=%.2f, pos=(%d, %d)",
            zone_name, zone_score, px, py,
        )

    # Paste watermark
    result_image.paste(wm_element, (px, py), wm_element)

    if image.mode != "RGBA":
        result_image = result_image.convert("RGB")

    return result_image, zone_name, zone_score, all_scores


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


def process_single_image(
    image_base64: str,
    settings: WatermarkSettings,
    original_name: str = "image.png",
) -> ProcessResult:
    """
    Process a single image: decode, apply watermark, return result.

    Args:
        image_base64: Base64-encoded image data.
        settings: Watermark settings.
        original_name: Original filename for reference.

    Returns:
        ProcessResult with watermarked image and zone information.
    """
    image = base64_to_image(image_base64)

    # Determine output format based on original name
    ext = Path(original_name).suffix.lower()
    fmt = "JPEG" if ext in (".jpg", ".jpeg") else "PNG"

    result_image, zone_name, zone_score, _ = apply_watermark(image, settings)
    result_base64 = image_to_base64(result_image, fmt)

    return ProcessResult(
        image_base64=result_base64,
        zone_used=zone_name,
        zone_score=zone_score,
        original_name=original_name,
    )
