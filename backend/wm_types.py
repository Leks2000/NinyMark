"""
NinyraWatermark — Type definitions for the watermark application.
All types used across backend modules are defined here.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Literal


class WatermarkStyle(str, Enum):
    """Available watermark visual styles."""
    TEXT = "text"
    ICON_TEXT = "icon_text"
    BRANDED_BLOCK = "branded_block"


class WatermarkSize(str, Enum):
    """Watermark size relative to image width."""
    S = "S"
    M = "M"
    L = "L"


class WatermarkColor(str, Enum):
    """Watermark color theme."""
    LIGHT = "light"
    DARK = "dark"


# Size multipliers: fraction of image width
SIZE_MULTIPLIERS: dict[WatermarkSize, float] = {
    WatermarkSize.S: 0.08,
    WatermarkSize.M: 0.12,
    WatermarkSize.L: 0.18,
}


@dataclass(frozen=True)
class WatermarkSettings:
    """Complete settings for watermark rendering."""
    style: WatermarkStyle = WatermarkStyle.BRANDED_BLOCK
    opacity: float = 0.75
    size: WatermarkSize = WatermarkSize.M
    padding: int = 20
    color: WatermarkColor = WatermarkColor.LIGHT
    custom_text: str = "patreon.com/Ninyra"
    # Optional: override size with exact percentage (5–40% of image width)
    custom_size_pct: float | None = None
    # Optional: manual placement as fraction of image (0.0–1.0).
    # When set, zone detection is skipped.
    manual_x: float | None = None
    manual_y: float | None = None

    def __post_init__(self) -> None:
        if not 0.3 <= self.opacity <= 1.0:
            object.__setattr__(self, "opacity", max(0.3, min(1.0, self.opacity)))
        if not 10 <= self.padding <= 50:
            object.__setattr__(self, "padding", max(10, min(50, self.padding)))
        if self.custom_size_pct is not None:
            clamped = max(0.03, min(0.40, self.custom_size_pct))
            object.__setattr__(self, "custom_size_pct", clamped)


@dataclass(frozen=True)
class ZoneResult:
    """Result of zone detection analysis."""
    zone_index: int
    zone_name: str
    x: int
    y: int
    score: float
    all_scores: list[float] = field(default_factory=list)


@dataclass(frozen=True)
class ProcessResult:
    """Result of processing a single image."""
    image_base64: str
    zone_used: str
    zone_score: float
    original_name: str


# Zone name mapping for 3x3 grid
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

# Preset definitions
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
