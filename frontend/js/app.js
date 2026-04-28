/**
 * app.js — Application entry point and initialization.
 *
 * Wires together all modules: api, ui, settings, upload, preview.
 * Handles keyboard shortcuts and top-level orchestration.
 *
 * Fast Manual Mode shortcuts:
 *   ← / →         Navigate images
 *   Shift+→        Copy current position to next image, then navigate
 *   Mouse Wheel    Resize watermark (when drag-mode is active on overlay)
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
  window.__ninyra.copyPosAndGoNext = copyPosAndGoNext;

  // ── Initialize all modules ────────────────────────────────────────────
  ui.init();
  settings.init(onSettingsChanged);
  upload.init(onImagesChanged);
  // Pass positionChange AND sizeChange callbacks
  preview.init(onPositionChange, onSizeChange);

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
      if (res.success) settings.populateFonts(res.data.fonts);
    } catch { /* Non-critical */ }
  }

  if (backendOnline) await loadFonts();

  // ── Load presets ──────────────────────────────────────────────────────
  async function loadPresets() {
    try {
      const res = await api.getPresets();
      if (res.success) _renderPresetDropdown(res.data.presets);
    } catch { /* Non-critical */ }
  }

  if (backendOnline) await loadPresets();

  // ── Callbacks ─────────────────────────────────────────────────────────

  function onSettingsChanged(_newSettings) {
    // Settings changed — no auto-preview (wait for user to click Process)
  }

  function onImagesChanged(images) {
    const hasImages = images.length > 0;
    ui.setVisible('process-bar', hasImages);

    const btnText = ui.getEl('process-btn-text');
    if (btnText) {
      btnText.textContent = images.length === 1
        ? 'Apply Watermark'
        : `Process ${images.length} Images`;
    }

    if (faceDetectEnabled && images.length > 0) {
      _runFaceDetection(images[images.length - 1]);
    }
  }

  function onPositionChange(normX, normY) {
    settings.update({ manual_x: normX, manual_y: normY });
    _triggerPreviewForCurrent();
  }

  /**
   * Called by mouse-wheel on the drag overlay.
   * delta is +/- 0.01 (fraction).
   */
  function onSizeChange(delta) {
    const cur = settings.getCurrent();
    const currentPct = cur.custom_size_pct != null ? cur.custom_size_pct : 0.12;
    const newPct = Math.max(0.03, Math.min(0.40, currentPct + delta));
    settings.update({ custom_size_pct: newPct });
    // Re-render current image with new size
    _triggerPreviewForCurrent();
  }

  /**
   * Copy current manual_x / manual_y to next image's preview, then navigate.
   */
  function copyPosAndGoNext() {
    const cur = settings.getCurrent();
    if (cur.manual_x == null || cur.manual_y == null) {
      ui.showToast('Set a manual position first (enable Drag & click the image)', 'error');
      return;
    }
    // Navigate to next (preview.showNext updates selectedIndex)
    preview.showNext();
    // Trigger a preview for the newly selected image with the same position
    _triggerPreviewForCurrent();
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
   * Trigger a preview for the currently selected image in preview module.
   */
  async function _triggerPreviewForCurrent() {
    const images = upload.getImages();
    if (images.length === 0 || !backendOnline) return;

    const idx = preview.getSelectedIndex();
    const total = preview.getTotal();
    // Map preview index back to upload image if possible
    // In single-image mode index 0 = images[0]; in batch mode same index
    const imgIndex = Math.min(idx, images.length - 1);
    const img = images[imgIndex];
    if (!img) return;

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
        const updatedItem = {
          id: img.id,
          name: img.name,
          originalBase64: img.base64,
          originalPreview: img.preview,
          resultBase64: res.data.result,
          resultPreview: `data:${mime};base64,${res.data.result}`,
          zoneUsed: res.data.zone_used,
          zoneScore: res.data.zone_score,
        };
        preview.updateResult(idx, updatedItem);
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
          ui.showToast('Install mediapipe for AI zone detection: pip install mediapipe', 'error');
        }
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
        if (preset) settings.update(preset);
        dropdown.hidden = true;
      });
    });
  }

  // ── Bind top-level actions ────────────────────────────────────────────

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

  // Position manual override toggle
  const dragToggle = ui.getEl('drag-mode-toggle');

  function setManualPositioning(enabled) {
    if (dragToggle) dragToggle.checked = enabled;
    preview.setDragEnabled(enabled);
  }

  dragToggle?.addEventListener('change', (e) => {
    preview.setDragEnabled(e.target.checked);
    if (!e.target.checked) {
      settings.update({ manual_x: null, manual_y: null });
      _triggerPreviewForCurrent();
    }
  });

  // 9-cell grid position
  document.querySelectorAll('.pos-cell').forEach(btn => {
    btn.addEventListener('click', () => {
      setManualPositioning(true);
      const px = Number(btn.dataset.px);
      const py = Number(btn.dataset.py);
      onPositionChange(px, py);
    });
  });

  // XY inputs
  const posXInput = ui.getEl('pos-x-input');
  const posYInput = ui.getEl('pos-y-input');

  function handleXYChange() {
    if (!posXInput || !posYInput) return;
    const x = Math.max(0, Math.min(100, Number(posXInput.value))) / 100;
    const y = Math.max(0, Math.min(100, Number(posYInput.value))) / 100;
    setManualPositioning(true);
    onPositionChange(x, y);
  }

  if (posXInput) posXInput.addEventListener('change', handleXYChange);
  if (posYInput) posYInput.addEventListener('change', handleXYChange);

  // Position reset
  document.querySelector('[data-action="reset-pos"]')?.addEventListener('click', () => {
    setManualPositioning(false);
    settings.update({ manual_x: null, manual_y: null });
    _triggerPreviewForCurrent();
  });
  // Snap to grid toggle
  ui.getEl('snap-grid-toggle')?.addEventListener('change', (e) => {
    preview.setSnapToGrid(e.target.checked);
  });

  // Face detection toggle
  ui.getEl('face-detect-toggle')?.addEventListener('change', (e) => {
    faceDetectEnabled = e.target.checked;
    if (faceDetectEnabled) {
      upload.getImages().forEach(img => {
        if (!upload.getCachedFaces(img.id)) _runFaceDetection(img);
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
        if (cached && cached.exclusionZones) preview.showFaceZones(cached.exclusionZones);
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

  ui.getEl('preset-name-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.querySelector('[data-action="save-preset"]')?.click();
  });

  document.querySelector('[data-action="toggle-presets"]')
    ?.addEventListener('click', () => {
      const dd = ui.getEl('preset-dropdown');
      if (dd) dd.hidden = !dd.hidden;
    });

  document.querySelector('[data-action="toggle-shortcuts"]')
    ?.addEventListener('click', () => {
      const list = ui.getEl('shortcuts-list');
      if (list) list.hidden = !list.hidden;
    });

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  document.addEventListener('keydown', (e) => {
    // Don't fire when typing in an input
    const tag = document.activeElement?.tagName?.toLowerCase();
    const inInput = tag === 'input' || tag === 'textarea' || tag === 'select';

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

    // ── Fast Manual Mode navigation ──────────────────────────────────
    if (!inInput) {
      // ← previous image
      if (e.key === 'ArrowLeft' && !e.ctrlKey) {
        e.preventDefault();
        preview.showPrev();
      }

      // Shift+→ — copy position to next, then navigate
      if (e.key === 'ArrowRight' && !e.ctrlKey && e.shiftKey) {
        e.preventDefault();
        copyPosAndGoNext();
      }

      // → next image (no shift)
      if (e.key === 'ArrowRight' && !e.ctrlKey && !e.shiftKey) {
        e.preventDefault();
        preview.showNext();
      }
    }

    // Escape — close lightbox / dropdowns
    if (e.key === 'Escape') {
      ui.hideLightbox();
      ui.getEl('preset-dropdown')?.setAttribute('hidden', '');
      ui.getEl('shortcuts-list')?.setAttribute('hidden', '');
    }

    // ? — toggle shortcuts
    if (e.key === '?' && !e.ctrlKey && !inInput) {
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
