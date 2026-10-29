/* ==========================================================================
   CNU FREE V2 — MODAL DIALOGS (src/ui/dialog.js)
   Section 9:
   - Dialogs: role="dialog", aria-modal="true", focus trap, restore focus on close,
     close on Esc.
   - Covers Screens 12, 13, 17, 31 + inline confirm dialogs (Revoke link, Delete class,
     Delete group, Discard changes).
   ========================================================================== */

import { ICONS } from './icons.js';
import { escapeHtml } from './avatar.js';

let _previousActiveElement = null;

export function saveDialogFocusOrigin() {
  if (typeof document !== 'undefined' && document.activeElement) {
    _previousActiveElement = document.activeElement;
  }
}

export function restoreDialogFocusOrigin() {
  try {
    if (_previousActiveElement && typeof _previousActiveElement.focus === 'function') {
      _previousActiveElement.focus();
    }
  } catch (_e) {}
  _previousActiveElement = null;
}

export function trapFocusInModal(containerEl, event) {
  if (!containerEl || event.key !== 'Tab') return;
  const focusable = Array.from(
    containerEl.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
  if (focusable.length === 0) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

/**
 * Screen 12: Remove [First] as a friend?
 */
export function renderRemoveFriendDialog(friend) {
  const firstName = friend?.firstName || 'Gian';
  const fullName = friend?.name || 'Gian';
  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dlg-remove-title">
        <div class="dialog-icon-circle">${ICONS.trash}</div>
        <h2 id="dlg-remove-title" class="dialog-title">Remove ${escapeHtml(firstName)} as a friend?</h2>
        <p class="dialog-copy">${escapeHtml(fullName)} won't see your schedule, and you won't see theirs. You can add each other again anytime.</p>
        <button type="button" class="btn-danger" data-action="confirm-remove-friend" data-friend-id="${escapeHtml(friend?.id || 'gian')}">Remove friend</button>
        <button type="button" class="btn-secondary" data-action="close-overlay">Cancel</button>
      </div>
    </div>
  `;
}

/**
 * Screen 13: Block @[username]?
 */
export function renderBlockUserDialog(targetUser, showToastPreview = false) {
  const username = targetUser?.username || 'marco';
  const name = targetUser?.name || 'Marco';
  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dlg-block-title">
        <div class="dialog-icon-circle">${ICONS.block}</div>
        <h2 id="dlg-block-title" class="dialog-title">Block @${escapeHtml(username)}?</h2>
        <p class="dialog-copy">${escapeHtml(name)} won't be able to find you, send requests, or see your schedule. They won't be notified.</p>
        <button type="button" class="btn-danger" data-action="confirm-block-user" data-person-id="${escapeHtml(targetUser?.id || 'marco')}">Block</button>
        <button type="button" class="btn-secondary" data-action="close-overlay">Cancel</button>
      </div>
    </div>
    ${
      showToastPreview
        ? `<div class="toast-bar" role="status" aria-live="polite"><span>Blocked @${escapeHtml(username)}</span><button type="button" class="toast-undo" data-action="toast-undo">Undo</button></div>`
        : ''
    }
  `;
}

/**
 * Screen 17: Sign out of CNU Free?
 */
export function renderSignOutDialog(username = 'francis') {
  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dlg-signout-title">
        <div class="dialog-icon-circle">${ICONS.signout}</div>
        <h2 id="dlg-signout-title" class="dialog-title">Sign out of CNU Free?</h2>
        <p class="dialog-copy">Your schedule and friends stay saved on @${escapeHtml(username)}. Sign back in anytime.</p>
        <button type="button" class="btn-primary" style="margin-bottom:8px;" data-action="confirm-sign-out">Sign out</button>
        <button type="button" class="btn-secondary" data-action="close-overlay">Cancel</button>
      </div>
    </div>
  `;
}

/**
 * Screen 31: Delete your account?
 */
export function renderDeleteAccountDialog(username = 'francis') {
  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dlg-delete-title">
        <div class="dialog-icon-circle">${ICONS.trash}</div>
        <h2 id="dlg-delete-title" class="dialog-title">Delete your account?</h2>
        <p class="dialog-copy">This permanently removes @${escapeHtml(username)}, your timetable, groups, and share links. Friends will no longer see you. This can't be undone.</p>
        <button type="button" class="btn-danger" data-action="confirm-delete-account">Delete account</button>
        <button type="button" class="btn-secondary" data-action="close-overlay">Cancel</button>
      </div>
    </div>
  `;
}

/**
 * Generic confirmation dialog (Revoke link, Delete class, Delete group, Discard changes)
 */
export function renderConfirmDialog({ title, copy, confirmLabel, confirmAction, confirmPayload = '', danger = true }) {
  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="dialog-card" role="dialog" aria-modal="true" aria-labelledby="dlg-generic-title">
        <div class="dialog-icon-circle">${danger ? ICONS.trash : ICONS.alert}</div>
        <h2 id="dlg-generic-title" class="dialog-title">${escapeHtml(title)}</h2>
        <p class="dialog-copy">${escapeHtml(copy)}</p>
        <button
          type="button"
          class="${danger ? 'btn-danger' : 'btn-primary'}"
          style="${danger ? '' : 'margin-bottom:8px;'}"
          data-action="${escapeHtml(confirmAction)}"
          data-payload="${escapeHtml(confirmPayload)}"
        >${escapeHtml(confirmLabel)}</button>
        <button type="button" class="btn-secondary" data-action="close-overlay">Cancel</button>
      </div>
    </div>
  `;
}
