/* ==========================================================================
   CNU FREE V2 — BOTTOM SHEETS (src/ui/sheet.js)
   Section 6 & Section 9:
   - Sheets: role="dialog", aria-modal="true", focus trap, restore focus on close,
     close on Esc, drag-to-dismiss or tap backdrop to close.
   - Covers:
     • Sheet 14: Share your schedule link
     • Sheet 16: Edit your profile (with "Change color" palette picker)
     • Sheet 40 (NEW): Rename group sheet (with validation + Delete group)
     • Action Sheets: Friend row "⋯", Overlap "+ Friend" picker, Pending request cancel
   ========================================================================== */

import { ICONS } from './icons.js';
import { renderAvatar, AVATAR_PALETTE, escapeHtml } from './avatar.js';
import { selectActiveShareLinks, selectExpiredShareLinks } from '../store.js';
import { validateProfileForm, validateGroupName } from '../validators.js';

/**
 * Sheet 14: Share your schedule
 */
export function renderShareLinkSheet(state) {
  const cfg = state.ui.shareSheetConfig || {
    audience: 'free_busy',
    expiryDays: 7,
    hoursStart: '09:00',
    hoursEnd: '17:00'
  };
  const activeLinks = selectActiveShareLinks(state);
  const expiredLinks = selectExpiredShareLinks(state);
  const currentLink = activeLinks[0] || state.shareLinks?.[0] || { id: `${state.user.username}_8472` };
  const displayUrl = `cnufree.com/s/${currentLink.id}`;

  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-share-title" data-sheet="true">
        <div class="sheet-handle" data-action="close-overlay" aria-label="Drag or tap to close"></div>
        <h2 id="sheet-share-title" class="sheet-title">Share your schedule</h2>
        <p class="sheet-sub">Anyone with this link can view your week, no account needed.</p>

        <div class="url-copy-box">
          <button
            type="button"
            class="url-text"
            style="background:none; border:none; text-align:left; cursor:pointer; padding:0;"
            data-action="open-share-preview"
            data-link-id="${escapeHtml(currentLink.id)}"
          >${escapeHtml(displayUrl)}</button>
          <button type="button" class="pill-btn-ink" data-action="copy-share-link" data-link-id="${escapeHtml(currentLink.id)}">Copy</button>
        </div>

        <div class="section-header" style="margin-top:0;"><span class="section-label">WHAT THE LINK SHOWS</span></div>
        <div class="card card-pad" style="padding:4px 14px; margin-bottom:12px;">
          <label class="radio-row" style="padding:10px 0;">
            <div><div class="row-title" style="font-size:13px;">Full schedule</div></div>
            <input type="radio" class="radio-input" name="sheet_aud" value="full" data-action="set-share-sheet-aud" ${cfg.audience === 'full' ? 'checked' : ''} />
          </label>
          <label class="radio-row" style="padding:10px 0;">
            <div><div class="row-title" style="font-size:13px;">Free or busy only</div></div>
            <input type="radio" class="radio-input" name="sheet_aud" value="free_busy" data-action="set-share-sheet-aud" ${cfg.audience === 'free_busy' ? 'checked' : ''} />
          </label>
          <label class="radio-row" style="padding:10px 0;">
            <div><div class="row-title" style="font-size:13px;">Specific hours (9 AM – 5 PM)</div></div>
            <input type="radio" class="radio-input" name="sheet_aud" value="specific_hours" data-action="set-share-sheet-aud" ${cfg.audience === 'specific_hours' ? 'checked' : ''} />
          </label>
          ${
            cfg.audience === 'specific_hours'
              ? `
                <div class="form-row-2col" style="padding:8px 0 12px;">
                  <div>
                    <label class="field-label" for="share-hours-start">FROM</label>
                    <input id="share-hours-start" type="time" class="field-input" value="${escapeHtml(cfg.hoursStart || '09:00')}" data-action="set-share-hours-start" />
                  </div>
                  <div>
                    <label class="field-label" for="share-hours-end">TO</label>
                    <input id="share-hours-end" type="time" class="field-input" value="${escapeHtml(cfg.hoursEnd || '17:00')}" data-action="set-share-hours-end" />
                  </div>
                </div>
              `
              : ''
          }
        </div>

        <div class="card card-pad row" style="padding:10px 14px; margin-bottom:12px;">
          <span class="row-title" style="font-size:13px;">Link expires</span>
          <div style="display:flex; gap:6px;">
            ${[1, 7, 30]
              .map(
                (days) => `
                  <button
                    type="button"
                    class="chip ${Number(cfg.expiryDays) === days ? 'active' : ''}"
                    style="min-height:36px; padding:0 10px; font-size:12px;"
                    data-action="set-share-expiry"
                    data-days="${days}"
                  >In ${days} ${days === 1 ? 'day' : 'days'}</button>
                `
              )
              .join('')}
          </div>
        </div>

        <button type="button" class="btn-primary" style="margin-bottom:14px;" data-action="create-share-link">Create link</button>

        <div class="section-header" style="margin-top:2px;"><span class="section-label">ACTIVE LINKS · ${activeLinks.length}</span></div>
        ${
          activeLinks.length === 0
            ? `<div class="card card-pad" style="padding:10px 14px; margin-bottom:10px;"><span class="row-sub">No active links</span></div>`
            : activeLinks
                .map(
                  (link) => `
                    <div class="card card-pad row" style="padding:10px 14px; margin-bottom:8px;">
                      <div class="row-body">
                        <div class="row-title" style="font-size:13px;">cnufree.com/s/${escapeHtml(link.id)}</div>
                        <div class="row-sub">${link.audience === 'full' ? 'Full schedule' : link.audience === 'specific_hours' ? 'Specific hours' : 'Free or busy'} · Expires ${escapeHtml(link.expiresLabel)}</div>
                      </div>
                      <button type="button" class="section-action" style="margin-right:8px;" data-action="open-share-preview" data-link-id="${escapeHtml(link.id)}">Open preview</button>
                      <button type="button" class="btn-link-danger" data-action="prompt-revoke-link" data-link-id="${escapeHtml(link.id)}">Revoke</button>
                    </div>
                  `
                )
                .join('')
        }

        ${
          expiredLinks.length > 0
            ? `
              <div class="section-header" style="margin-top:6px;"><span class="section-label">EXPIRED · ${expiredLinks.length}</span></div>
              ${expiredLinks
                .map(
                  (link) => `
                    <div class="card card-pad row" style="padding:10px 14px; background:#F5F7F6; margin-bottom:8px;">
                      <div class="row-body">
                        <div class="row-title" style="font-size:13px; color:#5A6862;">cnufree.com/s/${escapeHtml(link.id)}</div>
                        <div class="row-sub">Expired ${escapeHtml(link.expiresLabel)}</div>
                      </div>
                      <button type="button" class="section-action" data-action="delete-expired-link" data-link-id="${escapeHtml(link.id)}">Delete</button>
                    </div>
                  `
                )
                .join('')}
            `
            : ''
        }
      </div>
    </div>
  `;
}

/**
 * Sheet 16: Edit your profile (Section 6.6 & Section 7: "Change color" palette picker)
 */
export function renderEditProfileSheet(state) {
  const form = state.ui.editProfileForm || {
    firstName: state.user.firstName,
    lastName: state.user.lastName,
    username: state.user.username
  };
  const showPalette = Boolean(state.ui.showAvatarPalette);
  const check = validateProfileForm(form, state.user);
  const uCheck = check.usernameCheck;
  const initials = ((form.firstName?.[0] || 'F') + (form.lastName?.[0] || form.firstName?.[1] || 'R')).toUpperCase();

  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-profile-title" data-sheet="true">
        <div class="sheet-handle" data-action="close-overlay" aria-label="Drag or tap to close"></div>
        <h2 id="sheet-profile-title" class="sheet-title">Edit your profile</h2>

        <div style="display:flex; flex-direction:column; align-items:center; margin:8px 0 14px;">
          ${renderAvatar({ initials, avatarClass: state.user.avatarClass, size: 'xl' })}
          <button type="button" class="section-action" style="margin-top:4px;" data-action="toggle-avatar-palette">Change color</button>
          ${
            showPalette
              ? `
                <div style="display:flex; gap:10px; margin-top:8px;" role="group" aria-label="Choose avatar color">
                  ${AVATAR_PALETTE.map(
                    (swatch) => `
                      <button
                        type="button"
                        class="avatar avatar-sm ${swatch.id}"
                        style="border:${state.user.avatarClass === swatch.id ? '2.5px solid #1FB86B' : '2px solid transparent'}; cursor:pointer;"
                        data-action="select-avatar-color"
                        data-avatar-class="${swatch.id}"
                        aria-label="Color ${swatch.label}"
                      >${escapeHtml(initials)}</button>
                    `
                  ).join('')}
                </div>
              `
              : ''
          }
        </div>

        <div class="form-row-2col" style="margin-bottom:10px;">
          <div>
            <label class="field-label" for="prof-first">FIRST NAME</label>
            <input id="prof-first" type="text" class="field-input ${check.errors.firstName ? 'error' : ''}" value="${escapeHtml(form.firstName)}" data-field="profile-firstName" />
          </div>
          <div>
            <label class="field-label" for="prof-last">LAST NAME</label>
            <input id="prof-last" type="text" class="field-input" value="${escapeHtml(form.lastName || '')}" placeholder="Optional" data-field="profile-lastName" />
          </div>
        </div>

        <div class="form-group" style="margin-bottom:14px;">
          <label class="field-label" for="prof-user">USERNAME</label>
          <input id="prof-user" type="text" class="field-input ${!uCheck.valid ? 'error' : ''}" value="@${escapeHtml(form.username.replace(/^@/, ''))}" data-field="profile-username" />
          ${
            !uCheck.valid
              ? `
                <div class="field-error-text">
                  ${escapeHtml(uCheck.error.replace(/Try [a-z0-9._]+\.?/i, ''))}
                  ${
                    uCheck.suggestion
                      ? `Try <button type="button" data-action="use-username-suggestion" data-suggestion="${escapeHtml(uCheck.suggestion)}" style="background:none; border:none; color:#B3261E; font-weight:800; text-decoration:underline; cursor:pointer; padding:0;">${escapeHtml(uCheck.suggestion)}</button>`
                      : ''
                  }
                </div>
              `
              : `<div class="field-helper">3–20 lowercase letters, numbers, dots, or underscores.</div>`
          }
        </div>

        <button
          type="button"
          class="btn-primary"
          style="margin-bottom:6px;"
          data-action="save-profile"
          ${!check.canSave ? 'disabled' : ''}
        >Save changes</button>
        <button type="button" class="btn-secondary" data-action="close-overlay">Cancel</button>
      </div>
    </div>
  `;
}

/**
 * Sheet 40 (NEW in SPEC V2): Rename group sheet (name field with validation, Save, Delete group)
 */
export function renderRenameGroupSheet(state) {
  const group = state.groups.find((g) => g.id === state.ui.activeGroupId) || state.groups[0];
  const draftName = state.ui.renameGroupFormName !== undefined ? state.ui.renameGroupFormName : (group?.name || '');
  const validation = validateGroupName(draftName, state.groups, group?.id);

  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-rename-group-title" data-sheet="true">
        <div class="sheet-handle" data-action="close-overlay" aria-label="Drag or tap to close"></div>
        <h2 id="sheet-rename-group-title" class="sheet-title">Rename group</h2>
        <p class="sheet-sub">Update the name for ${escapeHtml(group?.name || 'this group')} or remove it.</p>

        <div class="form-group">
          <label class="field-label" for="rename-group-input">GROUP NAME</label>
          <input
            id="rename-group-input"
            type="text"
            class="field-input ${!validation.valid ? 'error' : ''}"
            value="${escapeHtml(draftName)}"
            data-field="rename-group-name"
          />
          ${!validation.valid ? `<div class="field-error-text">${escapeHtml(validation.error)}</div>` : ''}
        </div>

        <button
          type="button"
          class="btn-primary"
          style="margin-bottom:8px;"
          data-action="save-rename-group"
          ${!validation.valid ? 'disabled' : ''}
        >Save</button>
        <button
          type="button"
          class="btn-danger"
          style="margin-bottom:8px;"
          data-action="prompt-delete-group"
          data-group-id="${escapeHtml(group?.id || '')}"
        >Delete group</button>
        <button type="button" class="btn-secondary" data-action="close-overlay">Cancel</button>
      </div>
    </div>
  `;
}

/**
 * Action Sheet: Friend row "⋯" (Section 6.5)
 * View schedule · Add to group · Remove friend (→ 12) · Block (→ 13)
 */
export function renderFriendActionSheet(friend, groups = []) {
  if (!friend) return '';
  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-friend-actions-title" data-sheet="true">
        <div class="sheet-handle" data-action="close-overlay"></div>
        <div class="row" style="padding:0 0 12px; border-bottom:1px solid #E3E8E5; margin-bottom:10px;">
          ${renderAvatar({ initials: friend.initials, avatarClass: friend.avatarClass })}
          <div class="row-body">
            <h2 id="sheet-friend-actions-title" class="row-title">${escapeHtml(friend.name)}</h2>
            <div class="row-sub">@${escapeHtml(friend.username)}</div>
          </div>
        </div>

        <button type="button" class="btn-secondary" style="justify-content:flex-start; padding:0 14px; margin-bottom:6px; background:#F5F7F6; border-radius:14px;" data-action="friend-sheet-view-schedule" data-friend-id="${escapeHtml(friend.id)}">
          View schedule
        </button>

        ${
          groups.length > 0
            ? `
              <div class="section-header" style="margin:8px 0 6px;"><span class="section-label">ADD TO GROUP</span></div>
              <div class="chip-row" style="margin-bottom:10px;">
                ${groups
                  .map(
                    (g) => `
                      <button
                        type="button"
                        class="chip ${g.memberIds.includes(friend.id) ? 'active' : ''}"
                        data-action="friend-sheet-add-group"
                        data-friend-id="${escapeHtml(friend.id)}"
                        data-group-id="${escapeHtml(g.id)}"
                      >${escapeHtml(g.name)}</button>
                    `
                  )
                  .join('')}
              </div>
            `
            : ''
        }

        <button type="button" class="btn-secondary" style="justify-content:flex-start; padding:0 14px; margin-bottom:6px; color:#B3261E; background:#FDE4E4; border-radius:14px;" data-action="open-remove-friend-dialog" data-friend-id="${escapeHtml(friend.id)}">
          Remove friend
        </button>
        <button type="button" class="btn-secondary" style="justify-content:flex-start; padding:0 14px; margin-bottom:8px; color:#B3261E; background:#FDE4E4; border-radius:14px;" data-action="open-block-user-dialog" data-person-id="${escapeHtml(friend.id)}">
          Block @${escapeHtml(friend.username)}
        </button>
        <button type="button" class="btn-secondary" data-action="close-overlay">Cancel</button>
      </div>
    </div>
  `;
}

/**
 * Overlap "+ Friend" checklist sheet (Section 6.4 + Addendum B §6: lists all 10 with search)
 */
export function renderOverlapFriendPickerSheet(state) {
  const selectedIds = new Set(state.ui.overlapParticipantIds || ['francis', 'gian', 'danica']);
  const query = String(state.ui.overlapPickerSearch || '').trim().toLowerCase();
  const filteredFriends = (state.friends || []).filter((f) => {
    if (!query) return true;
    return f.name.toLowerCase().includes(query) || f.username.toLowerCase().includes(query);
  });

  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-overlap-picker-title" data-sheet="true">
        <div class="sheet-handle" data-action="close-overlay"></div>
        <h2 id="sheet-overlap-picker-title" class="sheet-title">Compare schedules</h2>
        <p class="sheet-sub">Select friends to include in shared free time.</p>

        <div class="search-wrap" style="margin-bottom:10px;">
          <span class="search-icon">${ICONS.search}</span>
          <input
            type="text"
            class="search-input"
            placeholder="Search 10 friends..."
            aria-label="Search friends to compare"
            value="${escapeHtml(state.ui.overlapPickerSearch || '')}"
            data-field="overlap-picker-search"
          />
        </div>

        <div class="card card-pad" style="padding:4px 14px; margin-bottom:14px; max-height:320px; overflow-y:auto;">
          ${filteredFriends
            .map((f) => {
              const checked = selectedIds.has(f.id);
              const isPrivate = f.shareLevel === 'none' || f.sharesWithViewer === 'none';
              return `
                <label class="row" style="cursor:pointer;">
                  ${renderAvatar({ initials: f.initials, avatarClass: f.avatarClass })}
                  <div class="row-body">
                    <div class="row-title">${escapeHtml(f.name)}</div>
                    <div class="row-sub">@${escapeHtml(f.username)}${isPrivate ? ' · Private schedule' : ''}</div>
                  </div>
                  <input
                    type="checkbox"
                    class="check-input"
                    data-action="toggle-overlap-friend"
                    data-person-id="${escapeHtml(f.id)}"
                    ${checked ? 'checked' : ''}
                  />
                </label>
              `;
            })
            .join('')}
        </div>

        <button type="button" class="btn-primary" data-action="close-overlay">Done</button>
      </div>
    </div>
  `;
}

/**
 * Pending outgoing request action sheet (Section 6.5: Tapping Pending opens an action sheet: Cancel request)
 */
export function renderCancelPendingRequestSheet(person) {
  if (!person) return '';
  return `
    <div class="overlay-backdrop" data-action="close-overlay">
      <div class="sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheet-pending-title" data-sheet="true">
        <div class="sheet-handle" data-action="close-overlay"></div>
        <h2 id="sheet-pending-title" class="sheet-title">Pending friend request</h2>
        <p class="sheet-sub">Sent to ${escapeHtml(person.name)} (@${escapeHtml(person.username)}).</p>
        <button type="button" class="btn-danger" style="margin-bottom:8px;" data-action="confirm-cancel-request" data-person-id="${escapeHtml(person.id)}">Cancel request</button>
        <button type="button" class="btn-secondary" data-action="close-overlay">Keep pending</button>
      </div>
    </div>
  `;
}
