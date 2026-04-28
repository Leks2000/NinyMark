/**
 * preview.js — Preview rendering, before/after toggle, drag-and-drop watermark repositioning.
 *
 * Fast Manual Mode features:
 *  - ← / → arrow keys to navigate between processed images
 *  - Shift+→ to copy current manual position to next image then navigate
 *  - Mouse wheel on drag-overlay to adjust watermark size (custom_size_pct)
 *  - Click-to-place on drag-overlay (existing, but wired correctly)
 *  - Prev/Next buttons in toolbar
 *  - Image counter badge (N / total)
 *
 * Drag-and-drop (unchanged):
 *  - Transparent overlay on preview image
 *  - Draggable watermark handle with snap-to-grid
 *  - Visual crosshair guides + live tooltip
 */

const preview = (() => {
  'use strict';

  /** @type {Array<{id, name, originalPreview, resultBase64, resultPreview, zoneUsed, zoneScore}>} */
  let processedImages = [];
  let selectedIndex = 0;
  let showingOriginal = false;
  let dragEnabled = false;
  let snapToGrid = false;
  let isDragging = false;
  let onPositionChange = null;
  let onSizeChange = null;

  /**
   * Initialize preview module.
   */
  function init(positionChangeCallback, sizeChangeCallback) {
    onPositionChange = positionChangeCallback;
    onSizeChange = sizeChangeCallback;
    _bindActions();
    _bindDrag();
    _bindLightbox();
    _bindNavButtons();
  }

  /**
   * Set processed results and render.
   */
  function setResults(results) {
    processedImages = results;
    selectedIndex = 0;
    showingOriginal = false;
    _render();
  }

  /**
   * Update a single item in place (used after position tweak).
   */
  function updateResult(index, data) {
    if (index >= 0 && index < processedImages.length) {
      Object.assign(processedImages[index], data);
      if (index === selectedIndex) {
        _renderSingle(processedImages[index]);
      }
    }
  }

  /**
   * Clear all results.
   */
  function clearResults() {
    processedImages = [];
    selectedIndex = 0;
    _render();
  }

  /**
   * Show/hide progress.
   */
  function showProgress(percent) {
    ui.setVisible('preview-area', true);
    ui.setVisible('progress-card', true);
    const fill = ui.getEl('progress-fill');
    const text = ui.getEl('progress-text');
    if (fill) fill.style.width = `${percent}%`;
    if (text) text.textContent = `${percent}%`;
  }

  function hideProgress() {
    ui.setVisible('progress-card', false);
  }

  /**
   * Enable/disable drag mode.
   */
  function setDragEnabled(enabled) {
    dragEnabled = enabled;
    const overlay = ui.getEl('drag-overlay');
    if (overlay) overlay.hidden = !enabled;
  }

  /**
   * Enable/disable snap to grid.
   */
  function setSnapToGrid(enabled) {
    snapToGrid = enabled;
  }

  /**
   * Show face exclusion zones on the drag overlay.
   */
  function showFaceZones(zones) {
    const container = ui.getEl('face-zones');
    if (!container) return;

    container.innerHTML = zones.map(z => {
      const left = (z.x_min * 100).toFixed(1);
      const top = (z.y_min * 100).toFixed(1);
      const width = ((z.x_max - z.x_min) * 100).toFixed(1);
      const height = ((z.y_max - z.y_min) * 100).toFixed(1);
      return `<div class="face-zone-rect" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%"></div>`;
    }).join('');
  }

  /**
   * Clear face zones display.
   */
  function clearFaceZones() {
    const container = ui.getEl('face-zones');
    if (container) container.innerHTML = '';
  }

  /**
   * Navigate to previous image.
   */
  function showPrev() {
    if (processedImages.length <= 1) return;
    selectedIndex = (selectedIndex - 1 + processedImages.length) % processedImages.length;
    showingOriginal = false;
    _render();
    ui.setVisible('single-preview', true);
    _renderSingle(processedImages[selectedIndex]);
  }

  /**
   * Navigate to next image.
   */
  function showNext() {
    if (processedImages.length <= 1) return;
    selectedIndex = (selectedIndex + 1) % processedImages.length;
    showingOriginal = false;
    _render();
    ui.setVisible('single-preview', true);
    _renderSingle(processedImages[selectedIndex]);
  }

  /**
   * Get current selected index.
   */
  function getSelectedIndex() {
    return selectedIndex;
  }

  /**
   * Get total count.
   */
  function getTotal() {
    return processedImages.length;
  }

  /**
   * Render the preview area based on current state.
   */
  function _render() {
    const hasResults = processedImages.length > 0;

    ui.setVisible('preview-area', hasResults);
    ui.setVisible('results-header', hasResults);
    ui.setVisible('single-preview', hasResults);

    // Show batch grid alongside single in multi-image mode
    ui.setVisible('batch-grid', hasResults && processedImages.length > 1);

    if (!hasResults) return;

    const title = ui.getEl('results-title');
    if (title) title.textContent = `Results (${processedImages.length})`;

    // Navigation controls — only when multi-image
    const navControls = ui.getEl('nav-controls');
    if (navControls) navControls.hidden = processedImages.length <= 1;
    _updateNavCounter();

    _renderSingle(processedImages[selectedIndex]);
    if (processedImages.length > 1) {
      _renderBatch();
    }

    // Re-apply drag overlay state
    const overlay = ui.getEl('drag-overlay');
    if (overlay) overlay.hidden = !dragEnabled;
  }

  function _updateNavCounter() {
    const counter = ui.getEl('nav-counter');
    if (counter) counter.textContent = `${selectedIndex + 1} / ${processedImages.length}`;
  }

  /**
   * Render single image before/after preview.
   */
  function _renderSingle(item) {
    const img = ui.getEl('preview-image');
    const label = ui.getEl('preview-label');
    const zoneInfo = ui.getEl('zone-info');
    const toggleBtn = document.querySelector('[data-action="toggle-original"]');

    if (img) img.src = showingOriginal ? item.originalPreview : item.resultPreview;
    if (label) label.textContent = showingOriginal ? 'Original' : 'Watermarked';
    if (zoneInfo) zoneInfo.innerHTML = `Zone: <strong>${item.zoneUsed}</strong> (score: ${item.zoneScore.toFixed(1)})`;
    if (toggleBtn) toggleBtn.textContent = showingOriginal ? 'Show Result' : 'Show Original';
    _updateNavCounter();
  }

  /**
   * Render batch grid.
   */
  function _renderBatch() {
    const grid = ui.getEl('batch-grid');
    if (!grid) return;

    grid.innerHTML = processedImages.map((item, idx) => `
      <div class="batch-item ${idx === selectedIndex ? 'batch-item--selected' : ''}" data-batch-idx="${idx}">
        <div class="batch-item__img-wrap">
          <img class="batch-item__img" src="${item.resultPreview}" alt="${item.name}" loading="lazy" />
        </div>
        <div class="batch-item__footer">
          <span class="batch-item__name">${item.name}</span>
          <button class="batch-item__dl" data-action="download-batch" data-idx="${idx}" title="Download">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
        </div>
        <div class="batch-item__zone">${item.zoneUsed} (${item.zoneScore.toFixed(1)})</div>
      </div>
    `).join('');

    grid.querySelectorAll('[data-batch-idx]').forEach(el => {
      el.addEventListener('click', () => {
        selectedIndex = Number(el.dataset.batchIdx);
        showingOriginal = false;
        _render();
      });
    });

    grid.querySelectorAll('[data-action="download-batch"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _downloadImage(processedImages[Number(btn.dataset.idx)]);
      });
    });
  }

  /**
   * Bind toolbar action buttons.
   */
  function _bindActions() {
    document.querySelector('[data-action="toggle-original"]')
      ?.addEventListener('click', () => {
        showingOriginal = !showingOriginal;
        if (processedImages.length > 0) {
          _renderSingle(processedImages[selectedIndex]);
        }
      });

    document.querySelector('[data-action="download-current"]')
      ?.addEventListener('click', () => {
        const current = processedImages[selectedIndex];
        if (current) _downloadImage(current);
      });

    document.querySelector('[data-action="download-all"]')
      ?.addEventListener('click', async () => {
        if (processedImages.length === 0) return;

        if (typeof JSZip === 'undefined') {
          for (const img of processedImages) await _downloadImage(img);
          return;
        }

        const btn = document.querySelector('[data-action="download-all"]');
        const origText = btn ? btn.innerHTML : '';
        if (btn) {
          btn.disabled = true;
          btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exporting...`;
        }

        try {
          const zip = new JSZip();
          const BATCH_SIZE = 4;
          for (let i = 0; i < processedImages.length; i += BATCH_SIZE) {
            const batch = processedImages.slice(i, i + BATCH_SIZE);
            const results = await Promise.all(batch.map(img => _exportImageForZip(img)));
            for (const { fileName, base64 } of results) {
              zip.file(fileName, base64, { base64: true });
            }
          }
          const blob = await zip.generateAsync({ type: 'blob' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = 'watermarked_images.zip';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(link.href);
        } catch (err) {
          ui.showToast('ZIP download failed: ' + (err.message || err), 'error');
        } finally {
          if (btn) { btn.disabled = false; btn.innerHTML = origText; }
        }
      });

    document.querySelector('[data-action="clear-results"]')
      ?.addEventListener('click', clearResults);
  }

  /**
   * Bind Prev / Next / CopyPos nav buttons.
   */
  function _bindNavButtons() {
    document.querySelector('[data-action="prev-image"]')
      ?.addEventListener('click', showPrev);

    document.querySelector('[data-action="next-image"]')
      ?.addEventListener('click', showNext);

    document.querySelector('[data-action="copy-pos-next"]')
      ?.addEventListener('click', () => {
        // Callback from app.js will copy current pos; we just navigate
        if (window.__ninyra && window.__ninyra.copyPosAndGoNext) {
          window.__ninyra.copyPosAndGoNext();
        }
      });
  }

  /**
   * Bind drag-and-drop watermark repositioning + mouse wheel size.
   */
  function _bindDrag() {
    const overlay = ui.getEl('drag-overlay');
    const handle = ui.getEl('drag-handle');
    const tooltip = ui.getEl('drag-tooltip');
    const guideH = ui.getEl('drag-guide-h');
    const guideV = ui.getEl('drag-guide-v');

    if (!overlay || !handle) return;

    let startX = 0;
    let startY = 0;
    let handleStartLeft = 0;
    let handleStartTop = 0;

    handle.addEventListener('mousedown', (e) => {
      if (!dragEnabled) return;
      e.preventDefault();
      isDragging = true;
      overlay.classList.add('drag-overlay--dragging');

      const rect = overlay.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      handleStartLeft = handle.offsetLeft;
      handleStartTop = handle.offsetTop;

      const onMouseMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        let newLeft = handleStartLeft + dx;
        let newTop = handleStartTop + dy;

        const maxLeft = rect.width - handle.offsetWidth;
        const maxTop = rect.height - handle.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        if (snapToGrid) {
          const gridX = rect.width / 10;
          const gridY = rect.height / 10;
          newLeft = Math.round(newLeft / gridX) * gridX;
          newTop = Math.round(newTop / gridY) * gridY;
        }

        handle.style.left = `${newLeft}px`;
        handle.style.top = `${newTop}px`;

        const centerX = newLeft + handle.offsetWidth / 2;
        const centerY = newTop + handle.offsetHeight / 2;
        if (guideH) guideH.style.top = `${centerY}px`;
        if (guideV) guideV.style.left = `${centerX}px`;

        const normX = (newLeft / rect.width * 100).toFixed(0);
        const normY = (newTop / rect.height * 100).toFixed(0);
        if (tooltip) tooltip.textContent = `${normX}%, ${normY}%`;
      };

      const onMouseUp = () => {
        isDragging = false;
        overlay.classList.remove('drag-overlay--dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        const rect = overlay.getBoundingClientRect();
        const normX = handle.offsetLeft / rect.width;
        const normY = handle.offsetTop / rect.height;

        if (onPositionChange) {
          onPositionChange(
            Math.max(0, Math.min(1, normX)),
            Math.max(0, Math.min(1, normY)),
          );
        }
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Click anywhere on overlay to place watermark
    overlay.addEventListener('click', (e) => {
      if (!dragEnabled || isDragging) return;
      if (e.target === handle || handle.contains(e.target)) return;

      const rect = overlay.getBoundingClientRect();
      let normX = (e.clientX - rect.left) / rect.width;
      let normY = (e.clientY - rect.top) / rect.height;

      if (snapToGrid) {
        normX = Math.round(normX * 10) / 10;
        normY = Math.round(normY * 10) / 10;
      }

      normX = Math.max(0, Math.min(1, normX));
      normY = Math.max(0, Math.min(1, normY));

      handle.style.left = `${normX * rect.width}px`;
      handle.style.top = `${normY * rect.height}px`;
      if (tooltip) tooltip.textContent = `${(normX * 100).toFixed(0)}%, ${(normY * 100).toFixed(0)}%`;

      if (onPositionChange) onPositionChange(normX, normY);
    });

    // ── Mouse wheel on overlay → resize watermark ─────────────────────────
    overlay.addEventListener('wheel', (e) => {
      if (!dragEnabled) return;
      e.preventDefault();

      const STEP = 0.01; // 1% per tick
      const delta = e.deltaY < 0 ? STEP : -STEP;

      if (onSizeChange) onSizeChange(delta);

      // Flash size hint in tooltip
      if (tooltip) {
        const ninyra = window.__ninyra || {};
        const st = ninyra.getSettings ? ninyra.getSettings() : {};
        const current = st.custom_size_pct != null ? st.custom_size_pct : 0.12;
        const newSize = Math.max(0.03, Math.min(0.40, current + delta));
        tooltip.textContent = `Size: ${Math.round(newSize * 100)}%`;
      }
    }, { passive: false });
  }

  /**
   * Bind lightbox click on preview image container.
   */
  function _bindLightbox() {
    const container = ui.getEl('preview-container');
    if (!container) return;

    container.addEventListener('click', (e) => {
      if (dragEnabled) return;
      const current = processedImages[selectedIndex];
      if (!current) return;
      const src = showingOriginal ? current.originalPreview : current.resultPreview;
      ui.showLightbox(src);
    });

    document.querySelector('[data-action="close-lightbox"]')
      ?.addEventListener('click', ui.hideLightbox);

    const lightbox = ui.getEl('lightbox');
    if (lightbox) {
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) ui.hideLightbox();
      });
    }
  }

  /**
   * Export a single image via backend then trigger download.
   */
  async function _downloadImage(item) {
    const ext = item.name.split('.').pop() || 'png';
    const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    const fileName = `watermarked_${baseName}.${ext}`;

    let dataUrl = item.resultPreview;

    try {
      const ninyra = window.__ninyra || {};
      const embedInvisible = ninyra.getEmbedInvisible ? ninyra.getEmbedInvisible() : true;
      const currentSettings = ninyra.getSettings ? ninyra.getSettings() : {};
      const uploadModule = ninyra.getUpload ? ninyra.getUpload() : null;
      const facesData = uploadModule ? uploadModule.getCachedFaces(item.id) : null;
      const faceBboxes = facesData ? facesData.faces : null;

      const originalBase64 = item.originalBase64 || item.resultBase64;

      const res = await api.exportImage(
        originalBase64,
        currentSettings,
        item.name,
        embedInvisible,
        faceBboxes,
        currentSettings.font_path,
      );

      if (res.success && res.data && res.data.result) {
        const mime = getMimeForFilename(item.name);
        dataUrl = `data:${mime};base64,${res.data.result}`;
      }
    } catch (err) {
      console.warn('Export API failed, falling back to preview data:', err);
    }

    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Export a single image and return its base64 result (for ZIP bundling).
   */
  async function _exportImageForZip(item) {
    const ext = item.name.split('.').pop() || 'png';
    const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    const fileName = `watermarked_${baseName}.${ext}`;

    try {
      const ninyra = window.__ninyra || {};
      const embedInvisible = ninyra.getEmbedInvisible ? ninyra.getEmbedInvisible() : true;
      const currentSettings = ninyra.getSettings ? ninyra.getSettings() : {};
      const uploadModule = ninyra.getUpload ? ninyra.getUpload() : null;
      const facesData = uploadModule ? uploadModule.getCachedFaces(item.id) : null;
      const faceBboxes = facesData ? facesData.faces : null;

      const originalBase64 = item.originalBase64 || item.resultBase64;

      const res = await api.exportImage(
        originalBase64,
        currentSettings,
        item.name,
        embedInvisible,
        faceBboxes,
        currentSettings.font_path,
      );

      if (res.success && res.data && res.data.result) {
        return { fileName, base64: res.data.result };
      }
    } catch (err) {
      console.warn('Export failed for', item.name, ':', err);
    }

    return { fileName, base64: item.resultBase64 };
  }

  /**
   * Get the MIME type for a filename.
   */
  function getMimeForFilename(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
    if (ext === 'webp') return 'image/webp';
    return 'image/png';
  }

  return {
    init,
    setResults,
    updateResult,
    clearResults,
    showProgress,
    hideProgress,
    setDragEnabled,
    setSnapToGrid,
    showFaceZones,
    clearFaceZones,
    showPrev,
    showNext,
    getSelectedIndex,
    getTotal,
    getMimeForFilename,
  };
})();
