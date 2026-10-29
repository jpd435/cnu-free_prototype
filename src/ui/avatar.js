/* ==========================================================================
   CNU FREE V2 — AVATAR COMPONENT (src/ui/avatar.js)
   Initials in tinted circles — zero photos anywhere (Section 2 & 10.7).
   ========================================================================== */

export const AVATAR_PALETTE = [
  { id: 'av-ink', label: 'Ink' },
  { id: 'av-peach', label: 'Peach' },
  { id: 'av-mint', label: 'Mint' },
  { id: 'av-gold', label: 'Gold' },
  { id: 'av-lavender', label: 'Lavender' }
];

export function renderAvatar({ initials = 'BA', avatarClass = 'av-ink', size = 'md', extraClass = '' } = {}) {
  const sizeClass =
    size === 'xl'
      ? 'avatar-xl'
      : size === 'lg'
      ? 'avatar-lg'
      : size === 'sm'
      ? 'avatar-sm'
      : size === 'xs'
      ? 'avatar-xs'
      : '';
  return `<div class="avatar ${sizeClass} ${avatarClass} ${extraClass}" aria-hidden="true">${escapeHtml(initials)}</div>`;
}

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
