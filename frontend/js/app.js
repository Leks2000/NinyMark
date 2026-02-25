/**
 * app.js — Application entry point and initialization.
 *
 * Wires together all modules: api, ui, settings, upload, preview.
 * Handles keyboard shortcuts and top-level orchestration.
 */

(async () => {
  'use strict';

  let backendOnline = false;
  let isProcessing = false;
  let embedInvisible = true;
  let faceDetectEnabled = false;
  let showFacesEnabled = false;

  // Expose state needed by preview.js for export/download
  window.__ninyra = window.__ninyra || {};
  window.__ninyra.getEmbedInvisible = () => embedInvisible;
  window.__ninyra.getSettings = () => settings.getCurrent();
  window.__ninyra.getUpload = () => upload;

  // ── Initialize all modules ────────────────────────────────────────────
  ui.init();
  settings.init(onSettingsChanged);
  upload.init(onImagesChanged);
  preview.init(onPositionChange);

  // ── Health check polling ──────────────────────────────────────────────
  async function checkHealth() {
    backendOnline = await api.healthCheck();
    const dot = ui.getEl('status-dot');
    const text = ui.getEl('status-text');
    if (dot) dot.classList.toggle('status-dot--online', backendOnline);
    if (text) text.textContent = backendOnline ? 'Backend Online' : 'Backend Offline';
    ui.setVisible('offline-warning', !backendOnline);
  }

  await checkHealth();
  setInterval(checkHealth, 5000);

  // ── Load fonts ────────────────────────────────────────────────────────
  async function loadFonts() {
    try {
      const res = await api.listFonts();
      if (res.success) {
        settings.populateFonts(res.data.fonts);
      }
    } catch {
      // Non-critical
    }
  }

  if (backendOnline) await loadFonts();

  // ── Load presets ──────────────────────────────────────────────────────
  async function loadPresets() {
    try {
      const res = await api.getPresets();
      if (res.success) {
        _renderPresetDropdown(res.data.presets);
      }
    } catch {
      // Non-critical
    }
  }

  if (backendOnline) await loadPresets();

  // ── Callbacks ─────────────────────────────────────────────────────────

  function onSettingsChanged(newSettings) {
    // Settings changed (not file uploads) — no API call until confirmation
  }

  function onImagesChanged(images) {
    const hasImages = images.length > 0;
    ui.setVisible('process-bar', hasImages);

    const btnText = ui.getEl('process-btn-text');
    if (btnText) {
      if (images.length === 1) {
        btnText.textContent = 'Apply Watermark';
      } else {
        btnText.textContent = `Process ${images.length} Images`;
      }
    }

    // Run face detection on upload if enabled
    if (faceDetectEnabled && images.length > 0) {
      _runFaceDetection(images[images.length - 1]);
    }
  }

  function onPositionChange(normX, normY) {
    settings.update({ manual_x: normX, manual_y: normY });
    // Trigger a preview API call on drag end
    _triggerPreview();
  }

  // ── Process all images ────────────────────────────────────────────────

  async function processAll() {
    const images = upload.getImages();
    if (images.length === 0 || isProcessing || !backendOnline) return;

    isProcessing = true;
    upload.setDisabled(true);
    preview.showProgress(0);

    const currentSettings = settings.getCurrent();
    const results = [];

    try {
      // Process images in parallel batches of 4 for speed
      const BATCH_SIZE = 4;
      let completed = 0;

      for (let batchStart = 0; batchStart < images.length; batchStart += BATCH_SIZE) {
        const batch = images.slice(batchStart, batchStart + BATCH_SIZE);

        const batchPromises = batch.map(async (img) => {
          const facesData = upload.getCachedFaces(img.id);
          const faceBboxes = facesData ? facesData.faces : null;
          const fontPath = currentSettings.font_path;

          const res = await api.preview(
            img.base64,
            currentSettings,
            img.name,
            faceBboxes,
            fontPath,
          );

          if (res.success) {
            const mime = preview.getMimeForFilename(img.name);
            return {
              id: img.id,
              name: img.name,
              originalBase64: img.base64,
              originalPreview: img.preview,
              resultBase64: res.data.result,
              resultPreview: `data:${mime};base64,${res.data.result}`,
              zoneUsed: res.data.zone_used,
              zoneScore: res.data.zone_score,
            };
          }
          return null;
        });

        const batchResults = await Promise.all(batchPromises);
        for (const r of batchResults) {
          if (r) results.push(r);
          completed++;
          const pct = Math.min(100, Math.round((completed / images.length) * 100));
          preview.showProgress(pct);
        }
      }

      preview.hideProgress();
      preview.setResults(results);
      ui.setVisible('process-bar', true);
      document.querySelector('[data-action="clear-results"]').hidden = false;

    } catch (err) {
      ui.showToast(err.message || 'Processing failed.', 'error');
    } finally {
      isProcessing = false;
      upload.setDisabled(false);
    }
  }

  /**
   * Trigger a single preview (used by drag-end).
   */
  async function _triggerPreview() {
    const images = upload.getImages();
    if (images.length === 0 || !backendOnline) return;

    const img = images[0];
    const currentSettings = settings.getCurrent();
    const facesData = upload.getCachedFaces(img.id);
    const faceBboxes = facesData ? facesData.faces : null;

    try {
      const res = await api.preview(
        img.base64,
        currentSettings,
        img.name,
        faceBboxes,
        currentSettings.font_path,
      );

      if (res.success) {
        const mime = preview.getMimeForFilename(img.name);
        preview.setResults([{
          id: img.id,
          name: img.name,
          originalPreview: img.preview,
          resultBase64: res.data.result,
          resultPreview: `data:${mime};base64,${res.data.result}`,
          zoneUsed: res.data.zone_used,
          zoneScore: res.data.zone_score,
        }]);
      }
    } catch (err) {
      ui.showToast(err.message || 'Preview update failed.', 'error');
    }
  }

  /**
   * Run face detection on an image and cache the result.
   */
  async function _runFaceDetection(img) {
    try {
      const res = await api.detectFaces(img.base64);
      if (res.success) {
        upload.cacheFaces(img.id, {
          faces: res.data.faces,
          exclusionZones: res.data.exclusion_zones,
        });

        if (showFacesEnabled && res.data.exclusion_zones) {
          preview.showFaceZones(res.data.exclusion_zones);
        }

        if (!res.data.mediapipe_available) {
          ui.showToast(
            'Install mediapipe for AI zone detection: pip install mediapipe',
            'error'
          );
        }

        console.log(
          'Face detection:',
          res.data.faces.length, 'faces found.',
          'Confidences:', res.data.faces.map(f => f.confidence.toFixed(3))
        );
      }
    } catch (err) {
      console.error('Face detection failed:', err);
    }
  }

  // ── Preset management ─────────────────────────────────────────────────

  function _renderPresetDropdown(presets) {
    const dropdown = ui.getEl('preset-dropdown');
    if (!dropdown) return;

    const names = Object.keys(presets);
    if (names.length === 0) {
      dropdown.innerHTML = '<div class="preset-dropdown__item" style="color:var(--color-text-muted)">No presets</div>';
      return;
    }

    dropdown.innerHTML = names.map(name =>
      `<button class="preset-dropdown__item" data-preset="${name}">${name}</button>`
    ).join('');

    dropdown.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = presets[btn.dataset.preset];
        if (preset) {
          settings.update(preset);
        }
        dropdown.hidden = true;
      });
    });
  }

  // ── Bind top-level actions ────────────────────────────────────────────

  // Process button
  document.querySelector('[data-action="process"]')
    ?.addEventListener('click', processAll);

  // Font upload
  document.querySelector('[data-action="upload-font"]')
    ?.addEventListener('click', () => {
      document.querySelector('[data-target="font-file-input"]')?.click();
    });

  document.querySelector('[data-target="font-file-input"]')
    ?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const res = await api.uploadFont(file);
        if (res.success) {
          ui.showToast(res.data.message, 'success');
          await loadFonts();
        } else {
          ui.showToast(res.error || 'Upload failed', 'error');
        }
      } catch (err) {
        ui.showToast(err.message || 'Font upload failed', 'error');
      }
      e.target.value = '';
    });

  // Verify watermark
  document.querySelector('[data-action="verify-watermark"]')
    ?.addEventListener('click', () => {
      document.querySelector('[data-target="verify-file-input"]')?.click();
    });

  document.querySelector('[data-target="verify-file-input"]')
    ?.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const reader = new FileReader();
        reader.onload = async () => {
          const base64 = reader.result.split(',')[1];
          const res = await api.verifyWatermark(base64);
          if (res.success) {
            if (res.data.found) {
              ui.showToast(`Watermark found: "${res.data.watermark_string}"`, 'success');
            } else {
              ui.showToast(res.data.message || 'No watermark detected.', 'error');
            }
          } else {
            ui.showToast(res.error || 'Verification failed', 'error');
          }
        };
        reader.readAsDataURL(file);
      } catch (err) {
        ui.showToast(err.message || 'Verification failed', 'error');
      }
      e.target.value = '';
    });

  // Drag mode toggle
  ui.getEl('drag-mode-toggle')?.addEventListener('change', (e) => {
    preview.setDragEnabled(e.target.checked);
    if (!e.target.checked) {
      settings.update({ manual_x: null, manual_y: null });
    }
  });

  // Snap to grid toggle
  ui.getEl('snap-grid-toggle')?.addEventListener('change', (e) => {
    preview.setSnapToGrid(e.target.checked);
  });

  // Face detection toggle
  ui.getEl('face-detect-toggle')?.addEventListener('change', (e) => {
    faceDetectEnabled = e.target.checked;
    if (faceDetectEnabled) {
      const images = upload.getImages();
      images.forEach(img => {
        if (!upload.getCachedFaces(img.id)) {
          _runFaceDetection(img);
        }
      });
    }
  });

  // Show faces toggle
  ui.getEl('show-faces-toggle')?.addEventListener('change', (e) => {
    showFacesEnabled = e.target.checked;
    if (showFacesEnabled) {
      const images = upload.getImages();
      if (images.length > 0) {
        const cached = upload.getCachedFaces(images[0].id);
        if (cached && cached.exclusionZones) {
          preview.showFaceZones(cached.exclusionZones);
        }
      }
    } else {
      preview.clearFaceZones();
    }
  });

  // Invisible watermark toggle
  ui.getEl('invisible-wm-toggle')?.addEventListener('change', (e) => {
    embedInvisible = e.target.checked;
  });

  // Preset save
  document.querySelector('[data-action="toggle-preset-save"]')
    ?.addEventListener('click', () => {
      const el = ui.getEl('preset-save');
      if (el) el.hidden = !el.hidden;
    });

  document.querySelector('[data-action="save-preset"]')
    ?.addEventListener('click', async () => {
      const nameInput = ui.getEl('preset-name-input');
      const name = nameInput?.value.trim();
      if (!name) return;
      try {
        await api.savePreset(name, settings.getCurrent());
        ui.showToast(`Preset "${name}" saved.`, 'success');
        nameInput.value = '';
        ui.getEl('preset-save').hidden = true;
        await loadPresets();
      } catch (err) {
        ui.showToast(err.message || 'Failed to save preset', 'error');
      }
    });

  // Preset name input — Enter key
  ui.getEl('preset-name-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      document.querySelector('[data-action="save-preset"]')?.click();
    }
  });

  // Preset dropdown toggle
  document.querySelector('[data-action="toggle-presets"]')
    ?.addEventListener('click', () => {
      const dd = ui.getEl('preset-dropdown');
      if (dd) dd.hidden = !dd.hidden;
    });

  // Shortcuts toggle
  document.querySelector('[data-action="toggle-shortcuts"]')
    ?.addEventListener('click', () => {
      const list = ui.getEl('shortcuts-list');
      if (list) list.hidden = !list.hidden;
    });

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    // Ctrl+O — open file picker
    if (e.ctrlKey && e.key === 'o') {
      e.preventDefault();
      document.querySelector('[data-target="file-input"]')?.click();
    }

    // Ctrl+Shift+B — batch process
    if (e.ctrlKey && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      processAll();
    }

    // Ctrl+Z — undo
    if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
      e.preventDefault();
      settings.undo();
    }

    // Ctrl+Y or Ctrl+Shift+Z — redo
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
      e.preventDefault();
      settings.redo();
    }

    // Escape — close lightbox / dropdowns
    if (e.key === 'Escape') {
      ui.hideLightbox();
      ui.getEl('preset-dropdown')?.setAttribute('hidden', '');
      ui.getEl('shortcuts-list')?.setAttribute('hidden', '');
    }

    // ? — toggle shortcuts
    if (e.key === '?' && !e.ctrlKey) {
      const list = ui.getEl('shortcuts-list');
      if (list) list.hidden = !list.hidden;
    }
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const dd = ui.getEl('preset-dropdown');
    const toggleBtn = document.querySelector('[data-action="toggle-presets"]');
    if (dd && !dd.hidden && !dd.contains(e.target) && e.target !== toggleBtn && !toggleBtn?.contains(e.target)) {
      dd.hidden = true;
    }
  });

})();
