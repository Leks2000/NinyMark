/**
 * settings.js — Settings management with Undo/Redo.
 *
 * Implements a 50-step undo/redo stack persisted in sessionStorage.
 * Push on every user change (debounced 300ms).
 * Ctrl+Z → undo. Ctrl+Y / Ctrl+Shift+Z → redo.
 */

const settings = (() => {
  'use strict';

  const MAX_STACK_SIZE = 50;
  const DEBOUNCE_MS = 300;
  const STORAGE_KEY = 'ninyra_undo_stack';
  const REDO_STORAGE_KEY = 'ninyra_redo_stack';

  const DEFAULT_SETTINGS = {
    style: 'branded_block',
    opacity: 0.75,
    size: 'M',
    padding: 20,
    color: 'light',
    custom_text: 'patreon.com/Ninyra',
    custom_size_pct: null,
    manual_x: null,
    manual_y: null,
    font_path: null,
  };

  let current = { ...DEFAULT_SETTINGS };
  let undoStack = [];
  let redoStack = [];
  let isRestoring = false;
  let debounceTimer = null;
  let onChange = null;

  /**
   * Initialize the settings module.
   */
  function init(changeCallback) {
    onChange = changeCallback;
    _loadStacks();
    _bindUI();
    _syncUIToSettings();
    _updateUndoRedoButtons();
  }

  /**
   * Get current settings as a plain object.
   */
  function getCurrent() {
    return { ...current };
  }

  /**
   * Update settings from a partial object. Pushes to undo stack.
   */
  function update(partial) {
    const prev = { ...current };
    Object.assign(current, partial);

    if (!isRestoring) {
      _debouncedPush(prev);
    }

    _syncUIToSettings();
    if (onChange) onChange(current);
  }

  /**
   * Reset to defaults.
   */
  function resetDefaults() {
    update({ ...DEFAULT_SETTINGS });
  }

  /**
   * Undo last settings change.
   */
  function undo() {
    if (undoStack.length === 0) return;

    isRestoring = true;
    redoStack.push({ ...current });
    if (redoStack.length > MAX_STACK_SIZE) redoStack.shift();

    current = undoStack.pop();
    _saveStacks();
    _syncUIToSettings();
    _updateUndoRedoButtons();
    if (onChange) onChange(current);
    isRestoring = false;
  }

  /**
   * Redo last undone change.
   */
  function redo() {
    if (redoStack.length === 0) return;

    isRestoring = true;
    undoStack.push({ ...current });
    if (undoStack.length > MAX_STACK_SIZE) undoStack.shift();

    current = redoStack.pop();
    _saveStacks();
    _syncUIToSettings();
    _updateUndoRedoButtons();
    if (onChange) onChange(current);
    isRestoring = false;
  }

  /**
   * Debounced push to undo stack.
   */
  function _debouncedPush(prevState) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      undoStack.push(prevState);
      if (undoStack.length > MAX_STACK_SIZE) undoStack.shift();
      redoStack = [];
      _saveStacks();
      _updateUndoRedoButtons();
    }, DEBOUNCE_MS);
  }

  /**
   * Persist stacks to sessionStorage.
   */
  function _saveStacks() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(undoStack));
      sessionStorage.setItem(REDO_STORAGE_KEY, JSON.stringify(redoStack));
    } catch {
      // sessionStorage full — silently ignore
    }
  }

  /**
   * Load stacks from sessionStorage.
   */
  function _loadStacks() {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) undoStack = JSON.parse(saved);
      const savedRedo = sessionStorage.getItem(REDO_STORAGE_KEY);
      if (savedRedo) redoStack = JSON.parse(savedRedo);
    } catch {
      undoStack = [];
      redoStack = [];
    }
  }

  /**
   * Update undo/redo button states.
   */
  function _updateUndoRedoButtons() {
    const undoBtn = document.querySelector('[data-action="undo"]');
    const redoBtn = document.querySelector('[data-action="redo"]');
    if (undoBtn) undoBtn.disabled = undoStack.length === 0;
    if (redoBtn) redoBtn.disabled = redoStack.length === 0;
  }

  /**
   * Bind all settings UI interactions.
   */
  function _bindUI() {
    // Style options
    document.querySelectorAll('[data-style]').forEach(btn => {
      btn.addEventListener('click', () => update({ style: btn.dataset.style }));
    });

    // Size buttons
    document.querySelectorAll('[data-size]').forEach(btn => {
      btn.addEventListener('click', () => update({ size: btn.dataset.size, custom_size_pct: null }));
    });

    // Color buttons
    document.querySelectorAll('[data-color]').forEach(btn => {
      btn.addEventListener('click', () => update({ color: btn.dataset.color }));
    });

    // Opacity slider
    const opacityInput = document.querySelector('[data-setting="opacity"]');
    if (opacityInput) {
      opacityInput.addEventListener('input', () => {
        update({ opacity: Number(opacityInput.value) / 100 });
      });
    }

    // Custom size slider
    const customSizeInput = document.querySelector('[data-setting="custom_size_pct"]');
    if (customSizeInput) {
      customSizeInput.addEventListener('input', () => {
        update({ custom_size_pct: Number(customSizeInput.value) / 100 });
      });
    }

    // Padding slider
    const paddingInput = document.querySelector('[data-setting="padding"]');
    if (paddingInput) {
      paddingInput.addEventListener('input', () => {
        update({ padding: Number(paddingInput.value) });
      });
    }

    // Custom text
    const textInput = document.querySelector('[data-setting="custom_text"]');
    if (textInput) {
      textInput.addEventListener('input', () => {
        update({ custom_text: textInput.value });
      });
    }

    // Font selector
    const fontSelector = document.querySelector('[data-target="font-selector"]');
    if (fontSelector) {
      fontSelector.addEventListener('change', () => {
        update({ font_path: fontSelector.value || null });
      });
    }

    // Reset button
    document.querySelector('[data-action="reset-settings"]')
      ?.addEventListener('click', resetDefaults);

    // Undo / Redo buttons
    document.querySelector('[data-action="undo"]')
      ?.addEventListener('click', undo);
    document.querySelector('[data-action="redo"]')
      ?.addEventListener('click', redo);
  }

  /**
   * Sync all UI elements to current settings state.
   */
  function _syncUIToSettings() {
    // Style
    document.querySelectorAll('[data-style]').forEach(btn => {
      btn.classList.toggle('style-option--active', btn.dataset.style === current.style);
    });

    // Size
    document.querySelectorAll('[data-size]').forEach(btn => {
      const active = btn.dataset.size === current.size && current.custom_size_pct === null;
      btn.classList.toggle('size-btn--active', active);
    });

    // Color
    document.querySelectorAll('[data-color]').forEach(btn => {
      btn.classList.toggle('color-btn--active', btn.dataset.color === current.color);
    });

    // Opacity
    const opacityInput = document.querySelector('[data-setting="opacity"]');
    const opacityValue = ui.getEl('opacity-value');
    if (opacityInput) opacityInput.value = Math.round(current.opacity * 100);
    if (opacityValue) opacityValue.textContent = `${Math.round(current.opacity * 100)}%`;

    // Custom size
    const customSizeInput = document.querySelector('[data-setting="custom_size_pct"]');
    const customSizeValue = ui.getEl('custom-size-value');
    if (customSizeInput) {
      const sizeMap = { S: 8, M: 12, L: 18 };
      customSizeInput.value = current.custom_size_pct !== null
        ? Math.round(current.custom_size_pct * 100)
        : (sizeMap[current.size] || 12);
    }
    if (customSizeValue) {
      customSizeValue.textContent = current.custom_size_pct !== null
        ? `${Math.round(current.custom_size_pct * 100)}%`
        : 'off';
      customSizeValue.style.color = current.custom_size_pct !== null
        ? 'var(--color-accent)' : '';
    }

    // Padding
    const paddingInput = document.querySelector('[data-setting="padding"]');
    const paddingValue = ui.getEl('padding-value');
    if (paddingInput) paddingInput.value = current.padding;
    if (paddingValue) paddingValue.textContent = `${current.padding}px`;

    // Custom text
    const textInput = document.querySelector('[data-setting="custom_text"]');
    if (textInput && textInput !== document.activeElement) {
      textInput.value = current.custom_text;
    }

    // Font
    const fontSelector = document.querySelector('[data-target="font-selector"]');
    if (fontSelector && fontSelector !== document.activeElement) {
      fontSelector.value = current.font_path || '';
    }
  }

  /**
   * Populate the font selector dropdown.
   */
  function populateFonts(fonts) {
    const selector = document.querySelector('[data-target="font-selector"]');
    if (!selector) return;

    // Keep the default option
    selector.innerHTML = '<option value="">System Default</option>';

    fonts.forEach(font => {
      const option = document.createElement('option');
      option.value = font.path;
      option.textContent = `${font.name} (${font.source})`;
      selector.appendChild(option);
    });

    if (current.font_path) {
      selector.value = current.font_path;
    }
  }

  return {
    init,
    getCurrent,
    update,
    resetDefaults,
    undo,
    redo,
    populateFonts,
    DEFAULT_SETTINGS,
  };
})();
