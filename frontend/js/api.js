/**
 * api.js — All fetch requests to backend.
 * All API calls centralized here. No fetch() elsewhere.
 */

const api = (() => {
  'use strict';

  const API_BASE = '/api';

  /**
   * Make a JSON API request and return parsed response.
   */
  async function _request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    };

    const response = await fetch(url, config);

    if (!response.ok) {
      let detail = 'Unknown error';
      try {
        const errBody = await response.json();
        detail = errBody.error || errBody.detail || JSON.stringify(errBody);
      } catch {
        detail = response.statusText;
      }
      throw new Error(detail);
    }

    return response.json();
  }

  /**
   * Health check — returns true if backend is online.
   */
  async function healthCheck() {
    try {
      const res = await fetch('/health');
      const data = await res.json();
      return data.success && data.data.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * Send image for preview processing.
   */
  async function preview(imageBase64, settings, name, faceBboxes, fontPath) {
    const body = {
      image: imageBase64,
      settings,
      name,
    };
    if (faceBboxes && faceBboxes.length > 0) {
      body.face_bboxes = faceBboxes;
    }
    if (fontPath) {
      body.font_path = fontPath;
    }
    return _request('/preview', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Export image with optional invisible watermark.
   */
  async function exportImage(imageBase64, settings, name, embedInvisible, faceBboxes, fontPath) {
    const body = {
      image: imageBase64,
      settings,
      name,
      embed_invisible: embedInvisible,
    };
    if (faceBboxes && faceBboxes.length > 0) {
      body.face_bboxes = faceBboxes;
    }
    if (fontPath) {
      body.font_path = fontPath;
    }
    return _request('/export', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  /**
   * Upload a custom font file.
   */
  async function uploadFont(file) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/fonts/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errBody = await response.json();
      throw new Error(errBody.error || 'Font upload failed');
    }

    return response.json();
  }

  /**
   * List all available fonts.
   */
  async function listFonts() {
    return _request('/fonts');
  }

  /**
   * Verify invisible watermark in an image.
   */
  async function verifyWatermark(imageBase64) {
    return _request('/verify', {
      method: 'POST',
      body: JSON.stringify({ image: imageBase64 }),
    });
  }

  /**
   * Run face detection on an image.
   */
  async function detectFaces(imageBase64) {
    return _request('/detect-faces', {
      method: 'POST',
      body: JSON.stringify({ image: imageBase64 }),
    });
  }

  /**
   * Get user config.
   */
  async function getConfig() {
    return _request('/config');
  }

  /**
   * Update user config.
   */
  async function setConfig(data) {
    return _request('/config', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get all presets.
   */
  async function getPresets() {
    return _request('/presets');
  }

  /**
   * Save a named preset.
   */
  async function savePreset(name, settings) {
    return _request('/presets', {
      method: 'POST',
      body: JSON.stringify({ name, settings }),
    });
  }

  /**
   * Delete a preset.
   */
  async function deletePreset(name) {
    return _request(`/presets/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }

  return {
    healthCheck,
    preview,
    exportImage,
    uploadFont,
    listFonts,
    verifyWatermark,
    detectFaces,
    getConfig,
    setConfig,
    getPresets,
    savePreset,
    deletePreset,
  };
})();
