"""
NinyraWatermark — Smart Zone Detection Algorithm.

Divides image into a 3x3 grid, calculates standard deviation of pixel
brightness in each zone, and selects the most uniform (empty) zone
for optimal watermark placement. Center zone (index 4) is always excluded.

Supports face bbox exclusion zones from AI detection.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from backend.config import (
    SIMILARITY_THRESHOLD,
    MIN_DIMENSION,
    FALLBACK_ZONE_INDEX,
    ZONE_NAMES,
    FACE_FALLBACK_OPACITY,
)

logger = logging.getLogger("ninyrawatermark.zone_detector")


@dataclass(frozen=True)
class ZoneResult:
    """Result of zone detection analysis."""
    zone_index: int
    zone_name: str
    x: int
    y: int
    score: float
    all_scores: list[float] = field(default_factory=list)


def _compute_zone_std_deviations(grayscale: NDArray[np.uint8]) -> list[float]:
    """Divide grayscale image into 3x3 grid, compute std deviation per zone."""
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
            std_devs.append(float(np.std(zone_pixels)))

    return std_devs


def _zone_overlaps_faces(
    zone_index: int,
    image_width: int,
    image_height: int,
    face_bboxes: list[object],
) -> bool:
    """Check if a 3x3 grid zone overlaps any face bounding box."""
    if not face_bboxes:
        return False

    row = zone_index // 3
    col = zone_index % 3
    col_w = image_width // 3
    row_h = image_height // 3

    zx1 = col * col_w
    zy1 = row * row_h
    zx2 = (col + 1) * col_w if col < 2 else image_width
    zy2 = (row + 1) * row_h if row < 2 else image_height

    for face in face_bboxes:
        fx1 = getattr(face, "x_min", 0)
        fy1 = getattr(face, "y_min", 0)
        fx2 = getattr(face, "x_max", 0)
        fy2 = getattr(face, "y_max", 0)

        if zx1 < fx2 and zx2 > fx1 and zy1 < fy2 and zy2 > fy1:
            return True

    return False


def _calculate_placement_coords(
    zone_index: int,
    image_width: int,
    image_height: int,
    watermark_width: int,
    watermark_height: int,
    padding: int,
) -> tuple[int, int]:
    """Calculate top-left (x, y) for watermark within the specified zone."""
    row = zone_index // 3
    col = zone_index % 3

    col_w = image_width // 3
    row_h = image_height // 3

    zone_x_start = col * col_w
    zone_y_start = row * row_h
    zone_x_end = (col + 1) * col_w if col < 2 else image_width
    zone_y_end = (row + 1) * row_h if row < 2 else image_height

    center_x = (zone_x_start + zone_x_end) // 2
    center_y = (zone_y_start + zone_y_end) // 2

    x = center_x - watermark_width // 2
    y = center_y - watermark_height // 2

    x = max(padding, min(x, image_width - watermark_width - padding))
    y = max(padding, min(y, image_height - watermark_height - padding))

    return x, y


def detect_best_zone(
    image_array: NDArray[np.uint8],
    watermark_width: int = 0,
    watermark_height: int = 0,
    padding: int = 20,
    face_bboxes: list[object] | None = None,
) -> ZoneResult:
    """Analyze image and determine best zone for watermark placement."""
    # Convert to grayscale
    if len(image_array.shape) == 3:
        if image_array.shape[2] == 4:
            grayscale = np.dot(
                image_array[:, :, :3].astype(np.float64),
                [0.299, 0.587, 0.114],
            ).astype(np.uint8)
        else:
            grayscale = np.dot(
                image_array.astype(np.float64),
                [0.299, 0.587, 0.114],
            ).astype(np.uint8)
    else:
        grayscale = image_array

    height, width = grayscale.shape

    # Small image fallback
    if width < MIN_DIMENSION or height < MIN_DIMENSION:
        x, y = _calculate_placement_coords(
            FALLBACK_ZONE_INDEX, width, height,
            watermark_width, watermark_height, max(padding, 5),
        )
        return ZoneResult(
            zone_index=FALLBACK_ZONE_INDEX,
            zone_name=ZONE_NAMES[FALLBACK_ZONE_INDEX],
            x=x, y=y, score=0.0,
            all_scores=[0.0] * 9,
        )

    all_scores = _compute_zone_std_deviations(grayscale)

    # Exclude center zone (index 4) and face-overlapping zones
    candidate_indices = [i for i in range(9) if i != 4]
    if face_bboxes:
        non_face_indices = [
            i for i in candidate_indices
            if not _zone_overlaps_faces(i, width, height, face_bboxes)
        ]
        if non_face_indices:
            candidate_indices = non_face_indices
        else:
            # ALL zones contain faces — fallback to bottom-right
            logger.info("All zones contain faces, using bottom-right fallback")
            x, y = _calculate_placement_coords(
                FALLBACK_ZONE_INDEX, width, height,
                watermark_width, watermark_height, padding,
            )
            return ZoneResult(
                zone_index=FALLBACK_ZONE_INDEX,
                zone_name=ZONE_NAMES[FALLBACK_ZONE_INDEX],
                x=x, y=y,
                score=all_scores[FALLBACK_ZONE_INDEX],
                all_scores=all_scores,
            )

    candidate_scores = [(i, all_scores[i]) for i in candidate_indices]
    scores_only = [s for _, s in candidate_scores]
    score_spread = max(scores_only) - min(scores_only)

    if score_spread < SIMILARITY_THRESHOLD:
        best_index = FALLBACK_ZONE_INDEX
        best_score = all_scores[FALLBACK_ZONE_INDEX]
    else:
        best_index, best_score = min(candidate_scores, key=lambda item: item[1])

    x, y = _calculate_placement_coords(
        best_index, width, height,
        watermark_width, watermark_height, padding,
    )

    return ZoneResult(
        zone_index=best_index,
        zone_name=ZONE_NAMES[best_index],
        x=x, y=y,
        score=best_score,
        all_scores=all_scores,
    )
