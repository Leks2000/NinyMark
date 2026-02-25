/**
 * upload.js — File upload handling and drag-and-drop.
 *
 * Manages image uploads, thumbnails, and file validation.
 * Accepts .png, .jpg, .jpeg, .webp only.
 */

const upload = (() => {
  'use strict';

  const VALID_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
  const MAX_FILES = 100;

  /** @type {Array<{id: string, file: File, name: string, preview: string, base64: string}>} */
  let images = [];

  /** @type {Map<string, {faces: Array, bboxes: Array}>} */
  const faceCache = new Map();

  let onImagesChanged = null;

  /**
   * Initialize upload module.
   */
  function init(imagesChangedCallback) {
    onImagesChanged = imagesChangedCallback;
    _bindDropzone();
    _bindActions();
  }

  /**
   * Get current images list.
   */
  function getImages() {
    return [...images];
  }

  /**
   * Get cached face detection data for an image.
   */
  function getCachedFaces(imageId) {
    return faceCache.get(imageId) || null;
  }

  /**
   * Cache face detection result for an image.
   */
  function cacheFaces(imageId, data) {
    faceCache.set(imageId, data);
  }

  /**
   * Clear all images and caches.
   */
  function clearAll() {
    images.forEach(img => URL.revokeObjectURL(img.preview));
    images = [];
    faceCache.clear();
    _renderThumbnails();
    if (onImagesChanged) onImagesChanged(images);
  }

  /**
   * Add files to the images list.
   */
  async function addFiles(files) {
    const fileArray = Array.from(files);

    for (const file of fileArray) {
      const ext = '.' + file.name.split('.').pop().toLowerCase();
      if (!VALID_EXTENSIONS.includes(ext)) {
        ui.showToast(`Unsupported format: ${file.name}. Use PNG, JPG, or WEBP.`, 'error');
        continue;
      }

      if (images.length >= MAX_FILES) {
        ui.showToast('Maximum 100 files allowed per batch.', 'error');
        break;
      }

      try {
        const base64 = await _fileToBase64(file);
        const preview = URL.createObjectURL(file);
        images.push({
          id: _generateId(),
          file,
          name: file.name,
          preview,
          base64,
        });
      } catch {
        ui.showToast(`Failed to read file: ${file.name}`, 'error');
      }
    }

    _renderThumbnails();
    if (onImagesChanged) onImagesChanged(images);
  }

  /**
   * Remove a single image by ID.
   */
  function removeImage(id) {
    const idx = images.findIndex(img => img.id === id);
    if (idx !== -1) {
      URL.revokeObjectURL(images[idx].preview);
      images.splice(idx, 1);
      faceCache.delete(id);
    }
    _renderThumbnails();
    if (onImagesChanged) onImagesChanged(images);
  }

  /**
   * Bind dropzone events.
   */
  function _bindDropzone() {
    const dropzone = ui.getEl('dropzone');
    const fileInput = document.querySelector('[data-target="file-input"]');
    if (!dropzone || !fileInput) return;

    dropzone.addEventListener('click', () => {
      if (!dropzone.classList.contains('dropzone--disabled')) {
        fileInput.click();
      }
    });

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files.length > 0) {
        addFiles(fileInput.files);
        fileInput.value = '';
      }
    });

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dropzone--active');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dropzone--active');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dropzone--active');
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    });
  }

  /**
   * Bind clear-all and other actions.
   */
  function _bindActions() {
    document.querySelector('[data-action="clear-images"]')
      ?.addEventListener('click', (e) => {
        e.stopPropagation();
        clearAll();
      });
  }

  /**
   * Render image thumbnails grid.
   */
  function _renderThumbnails() {
    const container = ui.getEl('thumbnails');
    const grid = ui.getEl('thumbnails-grid');
    const count = ui.getEl('thumbnails-count');
    if (!container || !grid || !count) return;

    if (images.length === 0) {
      container.hidden = true;
      return;
    }

    container.hidden = false;
    count.textContent = `${images.length} image${images.length > 1 ? 's' : ''} loaded`;

    grid.innerHTML = images.map(img => `
      <div class="thumbnail" data-image-id="${img.id}">
        <img class="thumbnail__img" src="${img.preview}" alt="${img.name}" loading="lazy" />
        <button class="thumbnail__remove" data-action="remove-thumbnail" data-id="${img.id}">&times;</button>
        <div class="thumbnail__name">${img.name}</div>
      </div>
    `).join('');

    grid.querySelectorAll('[data-action="remove-thumbnail"]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeImage(btn.dataset.id);
      });
    });
  }

  /**
   * Convert a File to base64 string.
   */
  function _fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }

  /**
   * Generate a unique ID.
   */
  function _generateId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Set disabled state for the dropzone.
   */
  function setDisabled(disabled) {
    const dropzone = ui.getEl('dropzone');
    if (dropzone) {
      dropzone.classList.toggle('dropzone--disabled', disabled);
    }
  }

  return {
    init,
    getImages,
    addFiles,
    removeImage,
    clearAll,
    getCachedFaces,
    cacheFaces,
    setDisabled,
  };
})();
