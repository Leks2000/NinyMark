"""
NinyraWatermark — Watermark rendering engine.

Renders watermarks in three styles:
  Style A (text): "patreon.com/Ninyra" with drop shadow
  Style B (icon_text): [Patreon icon] + "patreon.com/Ninyra" inline
  Style C (branded_block): Frosted rounded rectangle with icon + text (DEFAULT)
"""

from __future__ import annotations

import base64
import io
import logging
from pathlib import Path
from typing import Optional

import numpy as np
from numpy.typing import NDArray
from PIL import Image, ImageDraw, ImageFont

from backend.config import (
    PATREON_RED,
    PATREON_ICON_PATH,
    SIZE_MULTIPLIERS,
    ZONE_NAMES,
)
from backend.fonts import get_font
from backend.zone_detector import detect_best_zone
from backend.ai_detection import detect_faces, is_zone_overlapping_faces
from backend.utils import image_to_base64, base64_to_image, format_for_filename

logger = logging.getLogger("ninyrawatermark.watermark")


def _create_patreon_icon(size: int) -> Image.Image:
    """Create a Patreon-style icon at the given size."""
    if PATREON_ICON_PATH.exists():
        try:
            icon = Image.open(PATREON_ICON_PATH).convert("RGBA")
            icon = icon.resize((size, size), Image.Resampling.LANCZOS)
            return icon
        except Exception as exc:
            logger.warning("Failed to load patreon icon: %s", exc)

    # Generate a simple 'P' circle icon as fallback
    icon = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(icon)
    margin = 1
    draw.ellipse(
        [margin, margin, size - margin, size - margin],
        fill=(*PATREON_RED, 255),
    )
    font_size = int(size * 0.55)
    font = get_font(None, font_size)
    bbox = draw.textbbox((0, 0), "P", font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    text_x = (size - text_w) // 2
    text_y = (size - text_h) // 2 - bbox[1]
    draw.text((text_x, text_y), "P", fill=(255, 255, 255, 255), font=font)
    return icon


def _get_text_color(color: str) -> tuple[int, int, int]:
    """Return RGB text color based on the theme."""
    return (255, 255, 255) if color == "light" else (20, 20, 20)


def _get_shadow_color(color: str) -> tuple[int, int, int, int]:
    """Return RGBA shadow color based on the theme."""
    return (0, 0, 0, 140) if color == "light" else (255, 255, 255, 100)


def _render_style_text(
    settings: dict[str, object],
    target_width: int,
    font_path: Optional[str] = None,
) -> Image.Image:
    """Style A: Text only with drop shadow."""
    text = str(settings.get("custom_text", "patreon.com/Ninyra"))
    color = str(settings.get("color", "light"))
    text_color = _get_text_color(color)
    shadow_color = _get_shadow_color(color)

    font_size = max(12, int(target_width * 0.14))
    font = get_font(font_path, font_size)

    dummy = Image.new("RGBA", (1, 1))
    dd = ImageDraw.Draw(dummy)
    bbox = dd.textbbox((0, 0), text, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]

    shadow_offset = max(2, font_size // 12)
    wm_w = text_w + shadow_offset + 4
    wm_h = text_h + shadow_offset + 4
    wm_img = Image.new("RGBA", (wm_w, wm_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(wm_img)

    draw.text((shadow_offset + 2, shadow_offset + 2 - bbox[1]),
              text, fill=shadow_color, font=font)
    draw.text((2, 2 - bbox[1]),
              text, fill=(*text_color, 255), font=font)

    return wm_img


def _render_style_icon_text(
    settings: dict[str, object],
    target_width: int,
    font_path: Optional[str] = None,
) -> Image.Image:
    """Style B: Icon + Text inline layout."""
    text = str(settings.get("custom_text", "patreon.com/Ninyra"))
    color = str(settings.get("color", "light"))
    text_color = _get_text_color(color)
    shadow_color = _get_shadow_color(color)

    font_size = max(12, int(target_width * 0.13))
    font = get_font(font_path, font_size)

    dummy = Image.new("RGBA", (1, 1))
    dd = ImageDraw.Draw(dummy)
    bbox = dd.textbbox((0, 0), text, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]

    icon_size = int(text_h * 1.3)
    icon_gap = max(4, icon_size // 5)

    wm_w = icon_size + icon_gap + text_w + 8
    wm_h = max(icon_size, text_h) + 8
    wm_img = Image.new("RGBA", (wm_w, wm_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(wm_img)

    icon = _create_patreon_icon(icon_size)
    icon_y = (wm_h - icon_size) // 2
    wm_img.paste(icon, (4, icon_y), icon)

    text_x = 4 + icon_size + icon_gap
    text_y = (wm_h - text_h) // 2 - bbox[1]

    shadow_offset = max(1, font_size // 14)
    draw.text((text_x + shadow_offset, text_y + shadow_offset),
              text, fill=shadow_color, font=font)
    draw.text((text_x, text_y),
              text, fill=(*text_color, 255), font=font)

    return wm_img


def _render_style_branded_block(
    settings: dict[str, object],
    target_width: int,
    font_path: Optional[str] = None,
) -> Image.Image:
    """Style C (DEFAULT): Branded block with frosted rounded rectangle."""
    text = str(settings.get("custom_text", "patreon.com/Ninyra"))
    color = str(settings.get("color", "light"))
    text_color = _get_text_color(color)

    font_size = max(12, int(target_width * 0.12))
    font = get_font(font_path, font_size)

    dummy = Image.new("RGBA", (1, 1))
    dd = ImageDraw.Draw(dummy)
    bbox = dd.textbbox((0, 0), text, font=font)
    text_w, text_h = bbox[2] - bbox[0], bbox[3] - bbox[1]

    icon_size = int(text_h * 1.2)
    icon_gap = max(4, icon_size // 4)

    pad_h = max(10, font_size // 3)
    pad_w = max(16, font_size // 2)
    border_radius = max(12, font_size // 2)

    content_w = icon_size + icon_gap + text_w
    content_h = max(icon_size, text_h)

    wm_w = content_w + pad_w * 2
    wm_h = content_h + pad_h * 2

    wm_img = Image.new("RGBA", (wm_w, wm_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(wm_img)

    bg_color = (0, 0, 0, 153) if color == "light" else (255, 255, 255, 153)
    draw.rounded_rectangle(
        [0, 0, wm_w - 1, wm_h - 1],
        radius=border_radius,
        fill=bg_color,
    )

    icon = _create_patreon_icon(icon_size)
    icon_x = pad_w
    icon_y = (wm_h - icon_size) // 2
    wm_img.paste(icon, (icon_x, icon_y), icon)

    text_x = pad_w + icon_size + icon_gap
    text_y = (wm_h - text_h) // 2 - bbox[1]
    draw.text((text_x, text_y), text, fill=(*text_color, 255), font=font)

    return wm_img


STYLE_RENDERERS = {
    "text": _render_style_text,
    "icon_text": _render_style_icon_text,
    "branded_block": _render_style_branded_block,
}


def apply_watermark(
    image: Image.Image,
    settings: dict[str, object],
    face_bboxes: list[object] | None = None,
    font_path: Optional[str] = None,
) -> tuple[Image.Image, str, float, list[float]]:
    """Apply watermark to a copy of the image."""
    result_image = image.convert("RGBA")
    width, height = result_image.size

    # Determine watermark width
    custom_pct = settings.get("custom_size_pct")
    if custom_pct is not None:
        target_width = int(width * float(custom_pct))
    else:
        size_key = str(settings.get("size", "M"))
        multiplier = SIZE_MULTIPLIERS.get(size_key, 0.12)
        target_width = int(width * multiplier)

    # Render watermark element
    style = str(settings.get("style", "branded_block"))
    renderer = STYLE_RENDERERS.get(style, _render_style_branded_block)
    wm_element = renderer(settings, target_width, font_path)

    # Apply opacity
    opacity = float(settings.get("opacity", 0.75))
    if opacity < 1.0:
        alpha = wm_element.split()[3]
        alpha = alpha.point(lambda p: int(p * opacity))
        wm_element.putalpha(alpha)

    wm_w, wm_h = wm_element.size
    padding = int(settings.get("padding", 20))

    # Determine placement
    manual_x = settings.get("manual_x")
    manual_y = settings.get("manual_y")

    if manual_x is not None and manual_y is not None:
        px = int(float(manual_x) * width)
        py = int(float(manual_y) * height)
        px = max(0, min(px, width - wm_w))
        py = max(0, min(py, height - wm_h))
        zone_name = "manual"
        zone_score = 1.0
        all_scores: list[float] = []
    else:
        # Smart zone detection
        image_array = np.array(result_image)
        zone_result = detect_best_zone(
            image_array,
            watermark_width=wm_w,
            watermark_height=wm_h,
            padding=padding,
            face_bboxes=face_bboxes,
        )
        px, py = zone_result.x, zone_result.y
        zone_name = zone_result.zone_name
        zone_score = zone_result.score
        all_scores = zone_result.all_scores

    # Paste watermark
    result_image.paste(wm_element, (px, py), wm_element)

    if image.mode != "RGBA":
        result_image = result_image.convert("RGB")

    return result_image, zone_name, zone_score, all_scores


def process_single_image(
    image_base64: str,
    settings: dict[str, object],
    original_name: str = "image.png",
    face_bboxes: list[object] | None = None,
    font_path: Optional[str] = None,
    embed_invisible: bool = False,
) -> dict[str, object]:
    """Process a single image: decode, apply watermark, return result dict."""
    image = base64_to_image(image_base64)
    fmt = format_for_filename(original_name)

    result_image, zone_name, zone_score, _ = apply_watermark(
        image, settings, face_bboxes=face_bboxes, font_path=font_path
    )

    # Embed invisible watermark on export if requested
    if embed_invisible:
        from backend.steganography import embed_watermark, is_available
        if is_available():
            result_image = embed_watermark(result_image)

    result_base64 = image_to_base64(result_image, fmt)

    return {
        "image_base64": result_base64,
        "zone_used": zone_name,
        "zone_score": zone_score,
        "original_name": original_name,
    }
