"""
NinyraWatermark — Flask routes only, no business logic.

Endpoints:
  POST /api/preview       - return base64 preview
  POST /api/export        - return file (with optional invisible watermark)
  POST /api/fonts/upload  - upload a font
  GET  /api/fonts         - list fonts
  POST /api/verify        - verify invisible watermark
  POST /api/detect-faces  - run face detection on image
  GET  /api/presets       - list presets
  POST /api/presets       - save preset
  DELETE /api/presets/<n>  - delete preset
  GET  /health            - health check

Response format always: { "success": bool, "data": ..., "error": str|null }
"""

from __future__ import annotations

import asyncio
import base64
import io
import json
import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Optional

from flask import Flask, request, jsonify, send_from_directory, send_file

from backend.config import (
    LOGS_DIR,
    DEFAULT_PRESETS,
    load_presets,
    save_presets,
    get_watermark_string,
    set_watermark_string,
    load_config,
    save_config,
)
from backend.utils import success_response, error_response
from backend.watermark import process_single_image, apply_watermark
from backend.fonts import validate_font_file, save_uploaded_font, list_fonts
from backend.ai_detection import detect_faces, get_face_exclusion_zones
from backend.steganography import (
    embed_watermark,
    extract_watermark,
    is_available as steg_available,
)
from backend.utils import base64_to_image, image_to_base64, format_for_filename

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
LOG_FILE = LOGS_DIR / "app.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(str(LOG_FILE)),
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("ninyrawatermark.api")

# ---------------------------------------------------------------------------
# Flask app
# ---------------------------------------------------------------------------
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024  # 50 MB

# Thread pool for batch processing — max 4 threads
executor = ThreadPoolExecutor(max_workers=4)

# Resolve frontend dist directory
_FRONTEND_DIR = Path(__file__).parent.parent / "frontend"


# ---------------------------------------------------------------------------
# CORS middleware
# ---------------------------------------------------------------------------
@app.after_request
def add_cors_headers(response):
    """Add CORS headers to every response."""
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    if request.method == "OPTIONS":
        response.status_code = 200
    return response


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint."""
    return jsonify(success_response({"status": "ok"}))


# ---------------------------------------------------------------------------
# Preview
# ---------------------------------------------------------------------------
@app.route("/api/preview", methods=["POST"])
def api_preview():
    """Process a single image and return base64 preview."""
    try:
        body = request.get_json(force=True)
        if not body or "image" not in body:
            return jsonify(error_response("Missing 'image' field")), 400

        image_b64 = body["image"]
        settings = body.get("settings", {})
        name = body.get("name", "image.png")
        font_path = body.get("font_path")
        face_bboxes_raw = body.get("face_bboxes")

        # Reconstruct face bboxes if provided
        face_bboxes = None
        if face_bboxes_raw:
            from backend.ai_detection import FaceBBox
            face_bboxes = [
                FaceBBox(
                    x_min=f["x_min"], y_min=f["y_min"],
                    x_max=f["x_max"], y_max=f["y_max"],
                    confidence=f.get("confidence", 0.0),
                )
                for f in face_bboxes_raw
            ]

        result = process_single_image(
            image_b64, settings, name,
            face_bboxes=face_bboxes,
            font_path=font_path,
            embed_invisible=False,
        )

        return jsonify(success_response({
            "result": result["image_base64"],
            "zone_used": result["zone_used"],
            "zone_score": round(result["zone_score"], 2),
        }))

    except ValueError as exc:
        logger.error("Invalid input for preview: %s", exc)
        return jsonify(error_response(str(exc))), 400
    except Exception as exc:
        logger.error("Preview error: %s", exc, exc_info=True)
        return jsonify(error_response("Processing error")), 500


# ---------------------------------------------------------------------------
# Export (with optional invisible watermark)
# ---------------------------------------------------------------------------
@app.route("/api/export", methods=["POST"])
def api_export():
    """Process image and return file with optional invisible watermark."""
    try:
        body = request.get_json(force=True)
        if not body or "image" not in body:
            return jsonify(error_response("Missing 'image' field")), 400

        image_b64 = body["image"]
        settings = body.get("settings", {})
        name = body.get("name", "image.png")
        font_path = body.get("font_path")
        embed_invisible = body.get("embed_invisible", False)
        face_bboxes_raw = body.get("face_bboxes")

        face_bboxes = None
        if face_bboxes_raw:
            from backend.ai_detection import FaceBBox
            face_bboxes = [
                FaceBBox(
                    x_min=f["x_min"], y_min=f["y_min"],
                    x_max=f["x_max"], y_max=f["y_max"],
                    confidence=f.get("confidence", 0.0),
                )
                for f in face_bboxes_raw
            ]

        result = process_single_image(
            image_b64, settings, name,
            face_bboxes=face_bboxes,
            font_path=font_path,
            embed_invisible=embed_invisible,
        )

        return jsonify(success_response({
            "result": result["image_base64"],
            "zone_used": result["zone_used"],
            "zone_score": round(result["zone_score"], 2),
        }))

    except ValueError as exc:
        logger.error("Invalid input for export: %s", exc)
        return jsonify(error_response(str(exc))), 400
    except Exception as exc:
        logger.error("Export error: %s", exc, exc_info=True)
        return jsonify(error_response("Export error")), 500


# ---------------------------------------------------------------------------
# Font upload
# ---------------------------------------------------------------------------
@app.route("/api/fonts/upload", methods=["POST"])
def api_fonts_upload():
    """Upload a custom font file (.ttf or .otf)."""
    try:
        if "file" not in request.files:
            return jsonify(error_response("No file provided")), 400

        file = request.files["file"]
        if not file.filename:
            return jsonify(error_response("Empty filename")), 400

        data = file.read()
        filename = file.filename

        # Validate
        valid, err_msg = validate_font_file(data, filename)
        if not valid:
            return jsonify(error_response(err_msg)), 422

        # Save
        ok, save_err, font_name = save_uploaded_font(data, filename)
        if not ok:
            return jsonify(error_response(save_err)), 500

        return jsonify(success_response({
            "font_name": font_name,
            "message": f"Font '{font_name}' uploaded successfully",
        }))

    except Exception as exc:
        logger.error("Font upload error: %s", exc, exc_info=True)
        return jsonify(error_response("Font upload failed")), 500


# ---------------------------------------------------------------------------
# Font list
# ---------------------------------------------------------------------------
@app.route("/api/fonts", methods=["GET"])
def api_fonts_list():
    """List all available fonts (system + custom)."""
    try:
        fonts = list_fonts()
        return jsonify(success_response({"fonts": fonts}))
    except Exception as exc:
        logger.error("Font list error: %s", exc, exc_info=True)
        return jsonify(error_response("Failed to list fonts")), 500


# ---------------------------------------------------------------------------
# Verify invisible watermark
# ---------------------------------------------------------------------------
@app.route("/api/verify", methods=["POST"])
def api_verify():
    """Verify invisible watermark in an uploaded image."""
    try:
        if not steg_available():
            return jsonify(error_response(
                "invisible-watermark not installed. "
                "Install: pip install invisible-watermark"
            )), 422

        body = request.get_json(force=True)
        if not body or "image" not in body:
            return jsonify(error_response("Missing 'image' field")), 400

        image = base64_to_image(body["image"])
        found, extracted = extract_watermark(image)

        return jsonify(success_response({
            "found": found,
            "watermark_string": extracted if found else None,
            "message": extracted,
        }))

    except Exception as exc:
        logger.error("Verify error: %s", exc, exc_info=True)
        return jsonify(error_response("Verification failed")), 500


# ---------------------------------------------------------------------------
# Face detection
# ---------------------------------------------------------------------------
@app.route("/api/detect-faces", methods=["POST"])
def api_detect_faces():
    """Run face detection on an uploaded image."""
    try:
        body = request.get_json(force=True)
        if not body or "image" not in body:
            return jsonify(error_response("Missing 'image' field")), 400

        import numpy as np
        image = base64_to_image(body["image"])
        image_array = np.array(image.convert("RGB"))
        detection = detect_faces(image_array)

        zones = get_face_exclusion_zones(detection)

        return jsonify(success_response({
            "faces": [{
                "x_min": f.x_min, "y_min": f.y_min,
                "x_max": f.x_max, "y_max": f.y_max,
                "confidence": round(f.confidence, 3),
            } for f in detection.faces],
            "exclusion_zones": zones,
            "mediapipe_available": detection.mediapipe_available,
            "image_width": detection.image_width,
            "image_height": detection.image_height,
        }))

    except Exception as exc:
        logger.error("Face detection error: %s", exc, exc_info=True)
        return jsonify(error_response("Face detection failed")), 500


# ---------------------------------------------------------------------------
# Config — invisible watermark string
# ---------------------------------------------------------------------------
@app.route("/api/config", methods=["GET"])
def api_config_get():
    """Get user configuration."""
    try:
        cfg = load_config()
        return jsonify(success_response({
            "embed_invisible": cfg.get("embed_invisible", True),
            "watermark_string_set": bool(cfg.get("watermark_string")),
        }))
    except Exception as exc:
        logger.error("Config get error: %s", exc)
        return jsonify(error_response("Failed to load config")), 500


@app.route("/api/config", methods=["POST"])
def api_config_set():
    """Update user configuration."""
    try:
        body = request.get_json(force=True)
        if "watermark_string" in body:
            set_watermark_string(str(body["watermark_string"]))
        if "embed_invisible" in body:
            save_config({"embed_invisible": bool(body["embed_invisible"])})
        return jsonify(success_response({"message": "Config updated"}))
    except Exception as exc:
        logger.error("Config set error: %s", exc)
        return jsonify(error_response("Failed to save config")), 500


# ---------------------------------------------------------------------------
# Presets
# ---------------------------------------------------------------------------
@app.route("/api/presets", methods=["GET"])
def api_presets_get():
    """Get all saved presets."""
    try:
        presets = load_presets()
        return jsonify(success_response({"presets": presets}))
    except Exception as exc:
        logger.error("Presets get error: %s", exc)
        return jsonify(error_response("Failed to load presets")), 500


@app.route("/api/presets", methods=["POST"])
def api_presets_save():
    """Save a named preset."""
    try:
        body = request.get_json(force=True)
        name = body.get("name", "").strip()
        settings = body.get("settings", {})
        if not name:
            return jsonify(error_response("Preset name required")), 400

        presets = load_presets()
        presets[name] = settings
        save_presets(presets)
        return jsonify(success_response({"name": name}))
    except Exception as exc:
        logger.error("Preset save error: %s", exc)
        return jsonify(error_response("Failed to save preset")), 500


@app.route("/api/presets/<name>", methods=["DELETE"])
def api_presets_delete(name: str):
    """Delete a named preset."""
    try:
        if name in DEFAULT_PRESETS:
            return jsonify(error_response("Cannot delete default presets")), 400
        presets = load_presets()
        if name in presets:
            del presets[name]
            save_presets(presets)
        return jsonify(success_response({"name": name}))
    except Exception as exc:
        logger.error("Preset delete error: %s", exc)
        return jsonify(error_response("Failed to delete preset")), 500


# ---------------------------------------------------------------------------
# Serve frontend static files
# ---------------------------------------------------------------------------
@app.route("/")
def serve_index():
    """Serve the frontend index.html."""
    return send_from_directory(str(_FRONTEND_DIR), "index.html")


@app.route("/<path:filename>")
def serve_static(filename: str):
    """Serve frontend static files."""
    file_path = _FRONTEND_DIR / filename
    if file_path.is_file():
        return send_from_directory(str(_FRONTEND_DIR), filename)
    return send_from_directory(str(_FRONTEND_DIR), "index.html")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8765, debug=False)
