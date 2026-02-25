/**
 * preview.js — Preview rendering, before/after toggle, drag-and-drop watermark repositioning.
 *
 * Drag-and-drop:
 *  - Transparent overlay on preview image
 *  - Draggable watermark handle
 *  - On drag end: recalculate normalized (0.0-1.0) coords, call update
 *  - Snap-to-grid option (10% increments)
 *  - Visual guides (crosshair lines) during drag
 *  - Show live x%,y% tooltip
 *
 * Does NOT reload full preview on every drag move — only on drag end.
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

  /**
   * Initialize preview module.
   */
  function init(positionChangeCallback) {
    onPositionChange = positionChangeCallback;
    _bindActions();
    _bindDrag();
    _bindLightbox();
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
   * Render the preview area based on current state.
   */
  function _render() {
    const hasResults = processedImages.length > 0;

    ui.setVisible('preview-area', hasResults);
    ui.setVisible('results-header', hasResults);
    ui.setVisible('single-preview', hasResults && processedImages.length === 1);
    ui.setVisible('batch-grid', hasResults && processedImages.length > 1);

    if (!hasResults) return;

    const title = ui.getEl('results-title');
    if (title) title.textContent = `Results (${processedImages.length})`;

    if (processedImages.length === 1) {
      _renderSingle(processedImages[0]);
    } else {
      _renderBatch();
    }

    // Re-apply drag overlay state
    const overlay = ui.getEl('drag-overlay');
    if (overlay) overlay.hidden = !dragEnabled;
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
        // Show selected detail in single view
        ui.setVisible('single-preview', true);
        _renderSingle(processedImages[selectedIndex]);
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
   * Bind action buttons.
   */
  function _bindActions() {
    document.querySelector('[data-action="toggle-original"]')
      ?.addEventListener('click', () => {
        showingOriginal = !showingOriginal;
        if (processedImages.length > 0) {
          const current = processedImages[selectedIndex] || processedImages[0];
          _renderSingle(current);
        }
      });

    document.querySelector('[data-action="download-current"]')
      ?.addEventListener('click', () => {
        const current = processedImages[selectedIndex] || processedImages[0];
        if (current) _downloadImage(current);
      });

    document.querySelector('[data-action="download-all"]')
      ?.addEventListener('click', () => {
        processedImages.forEach((img, idx) => {
          setTimeout(() => _downloadImage(img), idx * 200);
        });
      });

    document.querySelector('[data-action="clear-results"]')
      ?.addEventListener('click', clearResults);
  }

  /**
   * Bind drag-and-drop watermark repositioning.
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

        // Clamp within overlay bounds
        const maxLeft = rect.width - handle.offsetWidth;
        const maxTop = rect.height - handle.offsetHeight;
        newLeft = Math.max(0, Math.min(newLeft, maxLeft));
        newTop = Math.max(0, Math.min(newTop, maxTop));

        // Snap to grid (10% increments)
        if (snapToGrid) {
          const gridX = rect.width / 10;
          const gridY = rect.height / 10;
          newLeft = Math.round(newLeft / gridX) * gridX;
          newTop = Math.round(newTop / gridY) * gridY;
        }

        handle.style.left = `${newLeft}px`;
        handle.style.top = `${newTop}px`;

        // Update guides
        const centerX = newLeft + handle.offsetWidth / 2;
        const centerY = newTop + handle.offsetHeight / 2;
        if (guideH) guideH.style.top = `${centerY}px`;
        if (guideV) guideV.style.left = `${centerX}px`;

        // Update tooltip
        const normX = (newLeft / rect.width * 100).toFixed(0);
        const normY = (newTop / rect.height * 100).toFixed(0);
        if (tooltip) tooltip.textContent = `${normX}%, ${normY}%`;
      };

      const onMouseUp = () => {
        isDragging = false;
        overlay.classList.remove('drag-overlay--dragging');
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);

        // Calculate normalized coordinates
        const rect = overlay.getBoundingClientRect();
        const normX = handle.offsetLeft / rect.width;
        const normY = handle.offsetTop / rect.height;

        // Notify via callback — triggers API call on drag end
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

    // Also handle click on overlay (not handle) to set position
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

      // Move handle
      handle.style.left = `${normX * rect.width}px`;
      handle.style.top = `${normY * rect.height}px`;
      if (tooltip) tooltip.textContent = `${(normX * 100).toFixed(0)}%, ${(normY * 100).toFixed(0)}%`;

      if (onPositionChange) onPositionChange(normX, normY);
    });
  }

  /**
   * Bind lightbox click on preview image container.
   */
  function _bindLightbox() {
    const container = ui.getEl('preview-container');
    if (!container) return;

    container.addEventListener('click', (e) => {
      if (dragEnabled) return;  // Don't open lightbox in drag mode
      const current = processedImages[selectedIndex] || processedImages[0];
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
   * Download a processed image.
   */
  function _downloadImage(item) {
    const link = document.createElement('a');
    const ext = item.name.split('.').pop() || 'png';
    const baseName = item.name.substring(0, item.name.lastIndexOf('.')) || item.name;
    link.href = item.resultPreview;
    link.download = `watermarked_${baseName}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
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
    clearResults,
    showProgress,
    hideProgress,
    setDragEnabled,
    setSnapToGrid,
    showFaceZones,
    clearFaceZones,
    getMimeForFilename,
  };
})();
