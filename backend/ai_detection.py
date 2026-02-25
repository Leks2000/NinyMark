"""
NinyraWatermark — AI-powered zone detection using MediaPipe.

Uses mp.tasks.vision.FaceDetector (short-range blaze_face model, fast).
Detects all face bounding boxes, expands by 15% padding, and excludes
those zones from watermark candidate placement.

Graceful degradation: if mediapipe is not installed, returns empty results.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from numpy.typing import NDArray

from backend.config import FACE_BBOX_PADDING

logger = logging.getLogger("ninyrawatermark.ai_detection")

# Model file path — bundled alongside this module
_MODEL_PATH = Path(__file__).parent / "blaze_face_short_range.tflite"

# Try to import mediapipe — graceful degradation
_MEDIAPIPE_AVAILABLE = False
try:
    import mediapipe as mp
    if _MODEL_PATH.exists():
        _MEDIAPIPE_AVAILABLE = True
    else:
        logger.warning(
            "MediaPipe model file not found at %s. "
            "AI zone detection disabled.", _MODEL_PATH
        )
except ImportError:
    logger.warning(
        "mediapipe not installed. AI zone detection disabled. "
        "Install: pip install mediapipe"
    )


@dataclass(frozen=True)
class FaceBBox:
    """A single detected face bounding box (pixel coordinates)."""
    x_min: int
    y_min: int
    x_max: int
    y_max: int
    confidence: float


@dataclass
class DetectionResult:
    """Result of face detection on an image."""
    faces: list[FaceBBox] = field(default_factory=list)
    image_width: int = 0
    image_height: int = 0
    mediapipe_available: bool = _MEDIAPIPE_AVAILABLE


def detect_faces(image_array: NDArray[np.uint8]) -> DetectionResult:
    """Run MediaPipe face detection on an image array (RGB or RGBA)."""
    if not _MEDIAPIPE_AVAILABLE:
        h, w = image_array.shape[:2]
        return DetectionResult(
            faces=[],
            image_width=w,
            image_height=h,
            mediapipe_available=False,
        )

    # Convert RGBA to RGB if needed
    if len(image_array.shape) == 3 and image_array.shape[2] == 4:
        rgb = image_array[:, :, :3].copy()
    elif len(image_array.shape) == 3:
        rgb = image_array.copy()
    else:
        rgb = np.stack([image_array] * 3, axis=-1)

    h, w = rgb.shape[:2]
    faces: list[FaceBBox] = []

    try:
        base_options = mp.tasks.BaseOptions(
            model_asset_path=str(_MODEL_PATH)
        )
        options = mp.tasks.vision.FaceDetectorOptions(
            base_options=base_options,
            min_detection_confidence=0.5,
        )

        with mp.tasks.vision.FaceDetector.create_from_options(options) as detector:
            mp_image = mp.Image(
                image_format=mp.ImageFormat.SRGB,
                data=rgb,
            )
            result = detector.detect(mp_image)

            for detection in result.detections:
                bbox = detection.bounding_box
                confidence = detection.categories[0].score if detection.categories else 0.0

                x_min = bbox.origin_x
                y_min = bbox.origin_y
                box_w = bbox.width
                box_h = bbox.height

                # Expand by FACE_BBOX_PADDING (15%) on all sides
                pad_x = int(box_w * FACE_BBOX_PADDING)
                pad_y = int(box_h * FACE_BBOX_PADDING)

                x_min_exp = max(0, x_min - pad_x)
                y_min_exp = max(0, y_min - pad_y)
                x_max_exp = min(w, x_min + box_w + pad_x)
                y_max_exp = min(h, y_min + box_h + pad_y)

                faces.append(FaceBBox(
                    x_min=x_min_exp,
                    y_min=y_min_exp,
                    x_max=x_max_exp,
                    y_max=y_max_exp,
                    confidence=confidence,
                ))

                logger.info(
                    "Face detected: bbox=(%d,%d,%d,%d) confidence=%.3f",
                    x_min_exp, y_min_exp, x_max_exp, y_max_exp, confidence,
                )

    except Exception as exc:
        logger.error("MediaPipe face detection failed: %s", exc, exc_info=True)

    logger.info("Detected %d face(s) in %dx%d image", len(faces), w, h)
    return DetectionResult(faces=faces, image_width=w, image_height=h)


def get_face_exclusion_zones(
    detection: DetectionResult,
) -> list[dict[str, float]]:
    """Convert face bboxes to normalized exclusion zones (0.0-1.0)."""
    if detection.image_width == 0 or detection.image_height == 0:
        return []

    zones: list[dict[str, float]] = []
    for face in detection.faces:
        zones.append({
            "x_min": face.x_min / detection.image_width,
            "y_min": face.y_min / detection.image_height,
            "x_max": face.x_max / detection.image_width,
            "y_max": face.y_max / detection.image_height,
            "confidence": face.confidence,
        })
    return zones


def is_zone_overlapping_faces(
    zone_x: int,
    zone_y: int,
    zone_w: int,
    zone_h: int,
    faces: list[FaceBBox],
) -> bool:
    """Check if a rectangle overlaps with any detected face bbox."""
    for face in faces:
        if (zone_x < face.x_max and zone_x + zone_w > face.x_min and
                zone_y < face.y_max and zone_y + zone_h > face.y_min):
            return True
    return False
