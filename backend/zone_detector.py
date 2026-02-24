"""
NinyraWatermark — Smart Zone Detection Algorithm.

Divides image into a 3x3 grid, calculates standard deviation of pixel
brightness in each zone, and selects the most uniform (empty) zone
for optimal watermark placement. Center zone (index 4) is always excluded.

Rules:
  R5 — Zone Detection is mandatory
  R6 — Fallback logic: if difference between best and worst < 15 → bottom-right
"""

from __future__ import annotations

import logging
import numpy as np
from numpy.typing import NDArray

from backend.types import ZoneResult, ZONE_NAMES

logger = logging.getLogger("ninyrawatermark.zone_detector")

# Threshold: if spread between min and max std is below this, use fallback
SIMILARITY_THRESHOLD: float = 15.0

# Minimum image dimension for zone detection
MIN_DIMENSION: int = 300

# Default fallback zone (bottom-right)
FALLBACK_ZONE_INDEX: int = 8


def _compute_zone_std_deviations(grayscale: NDArray[np.uint8]) -> list[float]:
    """
    Divide a grayscale image into 3x3 grid and compute the standard
    deviation of pixel values for each zone.

    Args:
        grayscale: 2D numpy array of uint8 pixel values (H x W).

    Returns:
        List of 9 floats — standard deviation for each zone (row-major).
    """
    height, width = grayscale.shape
    row_step = height // 3
    col_step = width // 3

    std_devs: list[float] = []

    for row in range(3):
        for col in range(3):
            y_start = row * row_step
            y_end = (row + 1) * row_step if row < 2 else height
            x_start = col * col_step
            x_end = (col + 1) * col_step if col < 2 else width

            zone_pixels = grayscale[y_start:y_end, x_start:x_end]
            std_val = float(np.std(zone_pixels))
            std_devs.append(std_val)

    return std_devs


def _calculate_placement_coords(
    zone_index: int,
    image_width: int,
    image_height: int,
    watermark_width: int,
    watermark_height: int,
    padding: int,
) -> tuple[int, int]:
    """
    Calculate the top-left (x, y) placement coordinates for the watermark
    within the specified zone.

    Args:
        zone_index: 0-8 index in the 3x3 grid.
        image_width: Full image width in pixels.
        image_height: Full image height in pixels.
        watermark_width: Width of the watermark element.
        watermark_height: Height of the watermark element.
        padding: Padding from the image edges in pixels.

    Returns:
        Tuple of (x, y) coordinates for watermark placement.
    """
    row = zone_index // 3
    col = zone_index % 3

    col_width = image_width // 3
    row_height = image_height // 3

    zone_x_start = col * col_width
    zone_y_start = row * row_height
    zone_x_end = (col + 1) * col_width if col < 2 else image_width
    zone_y_end = (row + 1) * row_height if row < 2 else image_height

    # Center the watermark within the zone
    zone_center_x = (zone_x_start + zone_x_end) // 2
    zone_center_y = (zone_y_start + zone_y_end) // 2

    x = zone_center_x - watermark_width // 2
    y = zone_center_y - watermark_height // 2

    # Apply edge padding constraints
    x = max(padding, min(x, image_width - watermark_width - padding))
    y = max(padding, min(y, image_height - watermark_height - padding))

    return x, y


def detect_best_zone(
    image_array: NDArray[np.uint8],
    watermark_width: int = 0,
    watermark_height: int = 0,
    padding: int = 20,
) -> ZoneResult:
    """
    Analyze the image and determine the best zone for watermark placement.

    Algorithm:
      1. Convert to grayscale (if not already).
      2. Divide into 3x3 grid (9 zones).
      3. Compute std deviation for each zone.
      4. Exclude center zone (index 4).
      5. Return zone with minimum std deviation (most uniform area).
      6. Fallback: if all zones are similarly scored (spread < 15), use bottom-right.

    Args:
        image_array: Image as numpy array (H x W x C or H x W).
        watermark_width: Width of the watermark to place (for coordinate calc).
        watermark_height: Height of the watermark to place (for coordinate calc).
        padding: Edge padding in pixels.

    Returns:
        ZoneResult with selected zone information and placement coordinates.
    """
    # Convert to grayscale if needed
    if len(image_array.shape) == 3:
        if image_array.shape[2] == 4:
            # RGBA → grayscale using luminance formula
            grayscale = np.dot(
                image_array[:, :, :3].astype(np.float64),
                [0.299, 0.587, 0.114],
            ).astype(np.uint8)
        else:
            # RGB → grayscale
            grayscale = np.dot(
                image_array.astype(np.float64),
                [0.299, 0.587, 0.114],
            ).astype(np.uint8)
    else:
        grayscale = image_array

    height, width = grayscale.shape
    logger.info("Analyzing image %dx%d for zone detection", width, height)

    # Small image fallback: force bottom-right
    if width < MIN_DIMENSION or height < MIN_DIMENSION:
        logger.info("Image too small (%dx%d), using bottom-right fallback", width, height)
        x, y = _calculate_placement_coords(
            FALLBACK_ZONE_INDEX, width, height,
            watermark_width, watermark_height, max(padding, 5),
        )
        return ZoneResult(
            zone_index=FALLBACK_ZONE_INDEX,
            zone_name=ZONE_NAMES[FALLBACK_ZONE_INDEX],
            x=x,
            y=y,
            score=0.0,
            all_scores=[0.0] * 9,
        )

    # Compute std deviations for all 9 zones
    all_scores = _compute_zone_std_deviations(grayscale)

    # Exclude center zone (index 4) from selection
    candidate_indices = [i for i in range(9) if i != 4]
    candidate_scores = [(i, all_scores[i]) for i in candidate_indices]

    # Check if all zones are similarly scored
    scores_only = [s for _, s in candidate_scores]
    score_spread = max(scores_only) - min(scores_only)

    if score_spread < SIMILARITY_THRESHOLD:
        # Fallback: use bottom-right corner
        logger.info(
            "Zone scores too similar (spread=%.2f < threshold=%.2f), "
            "using bottom-right fallback",
            score_spread, SIMILARITY_THRESHOLD,
        )
        best_index = FALLBACK_ZONE_INDEX
        best_score = all_scores[FALLBACK_ZONE_INDEX]
    else:
        # Select zone with lowest std deviation (most uniform)
        best_index, best_score = min(candidate_scores, key=lambda item: item[1])
        logger.info(
            "Best zone: %s (index=%d, score=%.2f)",
            ZONE_NAMES[best_index], best_index, best_score,
        )

    # Calculate placement coordinates
    x, y = _calculate_placement_coords(
        best_index, width, height,
        watermark_width, watermark_height, padding,
    )

    return ZoneResult(
        zone_index=best_index,
        zone_name=ZONE_NAMES[best_index],
        x=x,
        y=y,
        score=best_score,
        all_scores=all_scores,
    )
