/* ==========================================================================
   CNU FREE V2 — TOAST MANAGER (src/ui/toast.js)
   Section 9:
   - role="status" (one at a time, 3 s; 5 s with Undo).
   - Every toast with Undo actually undoes (Section 10.6).
   ========================================================================== */

import { escapeHtml } from './avatar.js';

let _currentToast = null;
let _toastTimer = null;
let _onRender = null;

export function configureToastRenderer(renderCallback) {
  _onRender = renderCallback;
}

export function showToast(message, { canUndo = false, onUndo = null, duration } = {}) {
  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastTimer = null;
  }

  const ms = typeof duration === 'number' ? duration : canUndo ? 5000 : 3000;
  _currentToast = {
    id: `toast_${Date.now()}`,
    message: String(message || ''),
    canUndo: Boolean(canUndo),
    onUndo
  };

  if (_onRender) _onRender(_currentToast);

  _toastTimer = setTimeout(() => {
    _currentToast = null;
    if (_onRender) _onRender(null);
  }, ms);
}

export function clearToast() {
  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastTimer = null;
  }
  _currentToast = null;
  if (_onRender) _onRender(null);
}

export function getActiveToast() {
  return _currentToast;
}

export function triggerToastUndo() {
  if (!_currentToast || !_currentToast.canUndo) return false;
  const undoFn = _currentToast.onUndo;
  clearToast();
  if (typeof undoFn === 'function') {
    undoFn();
    return true;
  }
  return false;
}

export function renderToastBar(toast = _currentToast) {
  if (!toast || !toast.message) return '';
  return `
    <div class="toast-bar" role="status" aria-live="polite" data-testid="toast-bar">
      <span>${escapeHtml(toast.message)}</span>
      ${
        toast.canUndo
          ? `<button type="button" class="toast-undo" data-action="toast-undo">Undo</button>`
          : ''
      }
    </div>
  `;
}
