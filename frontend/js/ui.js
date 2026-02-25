/**
 * ui.js — Toast notifications, modals, and UI utility helpers.
 * Handles all visual feedback to the user.
 */

const ui = (() => {
  'use strict';

  const AUTO_DISMISS_MS = 8000;

  /** @type {HTMLElement} */
  let toastContainer;

  /**
   * Initialize UI module — cache DOM elements.
   */
  function init() {
    toastContainer = document.querySelector('[data-target="toast-container"]');
  }

  /**
   * Show a toast notification.
   */
  function showToast(message, type = 'error') {
    if (!toastContainer) return;

    const iconSvg = type === 'error'
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.innerHTML = `
      <span class="toast__icon">${iconSvg}</span>
      <p class="toast__message">${_escapeHtml(message)}</p>
      <button class="toast__close" title="Dismiss">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    const closeBtn = toast.querySelector('.toast__close');
    closeBtn.addEventListener('click', () => _removeToast(toast));

    toastContainer.appendChild(toast);

    const timer = setTimeout(() => _removeToast(toast), AUTO_DISMISS_MS);
    toast._timer = timer;
  }

  /**
   * Remove a toast element with fade-out.
   */
  function _removeToast(toast) {
    if (toast._timer) clearTimeout(toast._timer);
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }

  /**
   * Escape HTML to prevent XSS in toast messages.
   */
  function _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Show the lightbox with an image URL.
   */
  function showLightbox(imageUrl) {
    const lightbox = document.querySelector('[data-target="lightbox"]');
    const img = document.querySelector('[data-target="lightbox-image"]');
    if (!lightbox || !img) return;
    img.src = imageUrl;
    lightbox.hidden = false;
  }

  /**
   * Hide the lightbox.
   */
  function hideLightbox() {
    const lightbox = document.querySelector('[data-target="lightbox"]');
    if (lightbox) lightbox.hidden = true;
  }

  /**
   * Set element hidden/visible by data-target attribute.
   */
  function setVisible(targetName, visible) {
    const el = document.querySelector(`[data-target="${targetName}"]`);
    if (el) el.hidden = !visible;
  }

  /**
   * Get element by data-target attribute.
   */
  function getEl(targetName) {
    return document.querySelector(`[data-target="${targetName}"]`);
  }

  return {
    init,
    showToast,
    showLightbox,
    hideLightbox,
    setVisible,
    getEl,
  };
})();
