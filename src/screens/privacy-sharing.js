/* ==========================================================================
   CNU FREE V2 — SCREEN 5 (PRIVACY & SHARING), SCREEN 34 (SELECTED FRIENDS PICKER)
   & SCREEN 38 (PUBLIC SHARED SCHEDULE WEB VIEW)
   (src/screens/privacy-sharing.js)
   Section 4.4, 4.7, 6.6, 7 & Addendum B:
   - Screen 5: radio saves instantly with toast; ACCESS rows -> 34 or inline level cycle;
     SHARE LINK card Copy / Revoke (confirm -> "No active link · Create link") /
     Manage links (-> 14) / Preview as viewer (-> 38).
   - Screen 34: row toggles and level pills edit access; Done -> save and pop to 5.
   - Screen 38: active / expired / revoked / not_found states; shows "Francis's day";
     "Get CNU Free" -> toast "Coming soon".
   ========================================================================== */

import { ICONS } from '../ui/icons.js';
import { renderAvatar, escapeHtml } from '../ui/avatar.js';
import {
  now,
  status,
  DEMO_WEEK_DATES,
  DAY_WINDOW_START,
  DAY_WINDOW_END,
  TIMELINE_HOUR_LABELS,
  getEntriesForDay,
  computeFreeIntervals,
  formatRange,
  formatDuration
} from '../time.js';
import { privacyLevelToLabel } from '../privacy.js';
import { selectActiveShareLinks, selectShareLinkStatus } from '../store.js';

export function renderPrivacySharingScreen(state) {
  const cfg = state.user.privacyConfig || {
    globalAudience: 'friends',
    personOverrides: {},
    groupRules: {}
  };
  const activeLinks = selectActiveShareLinks(state);
  const currentLink = activeLinks[0] || null;

  const kalboGroup = (state.groups || []).find((g) => g.id === 'kalbo') || {
    id: 'kalbo',
    name: 'Kalbo',
    initials: 'KA',
    avatarClass: 'av-mint',
    memberIds: ['franzen', 'thea', 'hershey', 'ella', 'gelie', 'luanne', 'jellah']
  };
  const badmintonGroup = (state.groups || []).find((g) => g.id === 'badminton') || {
    id: 'badminton',
    name: 'Badminton',
    initials: 'BA',
    avatarClass: 'av-lavender',
    memberIds: ['gian', 'danica']
  };
  const gianFriend = (state.friends || []).find((f) => f.id === 'gian') || {
    id: 'gian',
    name: 'Gian',
    username: 'gian',
    initials: 'GI',
    avatarClass: 'av-peach'
  };

  const kalboLevel = cfg.groupRules?.kalbo || 'free_only';
  const badmintonLevel = cfg.groupRules?.badminton || 'busy_only';
  const gianLevel = cfg.personOverrides?.gian || 'full';

  return `
    <div class="screen-scroll" data-screen-id="5">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>
      </div>

      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Privacy &amp; sharing</h1>
        <p class="body-copy">You decide who sees your classes, or just when you're free.</p>
      </div>

      <div class="stack-gap">
        <div class="section-header" style="margin-top:4px;"><span class="section-label">WHO CAN SEE MY SCHEDULE</span></div>
        <div class="card card-pad" style="padding:6px 16px;">
          <label class="radio-row">
            <div>
              <div class="row-title">Only me</div>
              <div class="row-sub">Your schedule is hidden from everyone</div>
            </div>
            <input
              type="radio"
              class="radio-input"
              name="privacy_aud"
              value="only_me"
              data-action="set-global-audience"
              ${cfg.globalAudience === 'only_me' ? 'checked' : ''}
            />
          </label>
          <label class="radio-row">
            <div>
              <div class="row-title">Friends (free or busy)</div>
              <div class="row-sub">Friends see when you're free, not class names</div>
            </div>
            <input
              type="radio"
              class="radio-input"
              name="privacy_aud"
              value="friends"
              data-action="set-global-audience"
              ${cfg.globalAudience === 'friends' ? 'checked' : ''}
            />
          </label>
          <label class="radio-row">
            <div>
              <div class="row-title">Selected friends</div>
              <div class="row-sub">Choose per friend or group below</div>
            </div>
            <input
              type="radio"
              class="radio-input"
              name="privacy_aud"
              value="selected"
              data-action="set-global-audience"
              ${cfg.globalAudience === 'selected' ? 'checked' : ''}
            />
          </label>
        </div>

        <div class="section-header">
          <span class="section-label">ACCESS BY PERSON OR GROUP</span>
          <button type="button" class="section-action" data-action="open-selected-friends-picker">+ Add</button>
        </div>
        <div class="card card-pad" style="padding:4px 16px;">
          <div class="row">
            <button
              type="button"
              style="display:flex; align-items:center; gap:12px; flex:1; background:none; border:none; padding:4px 0; text-align:left; cursor:pointer;"
              data-action="open-selected-friends-picker"
              data-focus-id="kalbo"
            >
              ${renderAvatar({ initials: kalboGroup.initials, avatarClass: kalboGroup.avatarClass })}
              <div class="row-body">
                <div class="row-title">${escapeHtml(kalboGroup.name)}</div>
                <div class="row-sub">Group · ${kalboGroup.memberIds.length} members</div>
              </div>
            </button>
            <button
              type="button"
              class="dropdown-pill"
              data-action="cycle-access-rule"
              data-target-type="group"
              data-target-id="kalbo"
            >${escapeHtml(privacyLevelToLabel(kalboLevel))} ${ICONS.chevronDown}</button>
          </div>

          <div class="row">
            <button
              type="button"
              style="display:flex; align-items:center; gap:12px; flex:1; background:none; border:none; padding:4px 0; text-align:left; cursor:pointer;"
              data-action="open-selected-friends-picker"
              data-focus-id="badminton"
            >
              ${renderAvatar({ initials: badmintonGroup.initials, avatarClass: badmintonGroup.avatarClass })}
              <div class="row-body">
                <div class="row-title">${escapeHtml(badmintonGroup.name)}</div>
                <div class="row-sub">Group · ${badmintonGroup.memberIds.length} members</div>
              </div>
            </button>
            <button
              type="button"
              class="dropdown-pill"
              data-action="cycle-access-rule"
              data-target-type="group"
              data-target-id="badminton"
            >${escapeHtml(privacyLevelToLabel(badmintonLevel))} ${ICONS.chevronDown}</button>
          </div>

          <div class="row">
            <button
              type="button"
              style="display:flex; align-items:center; gap:12px; flex:1; background:none; border:none; padding:4px 0; text-align:left; cursor:pointer;"
              data-action="open-selected-friends-picker"
              data-focus-id="gian"
            >
              ${renderAvatar({ initials: gianFriend.initials, avatarClass: gianFriend.avatarClass })}
              <div class="row-body">
                <div class="row-title">${escapeHtml(gianFriend.name)}</div>
                <div class="row-sub">@${escapeHtml(gianFriend.username)}</div>
              </div>
            </button>
            <button
              type="button"
              class="dropdown-pill"
              data-action="cycle-access-rule"
              data-target-type="person"
              data-target-id="gian"
            >${escapeHtml(privacyLevelToLabel(gianLevel))} ${ICONS.chevronDown}</button>
          </div>
        </div>

        <!-- SHARE LINK CARD (Section 6.6 & Section 7) -->
        <div class="section-header">
          <span class="section-label">SHARE LINK</span>
          <button type="button" class="section-action" data-action="open-share-link-sheet">Manage links</button>
        </div>
        ${
          currentLink
            ? `
              <div class="card card-pad">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <div>
                    <div class="row-title">cnufree.com/s/${escapeHtml(currentLink.id)}</div>
                    <div class="row-sub">${
                      currentLink.audience === 'full'
                        ? 'Full schedule'
                        : currentLink.audience === 'specific_hours'
                        ? 'Specific hours'
                        : 'Free or busy only'
                    } · Expires in ${currentLink.expiryDays || 6} days</div>
                  </div>
                  <div style="display:flex; gap:6px; align-items:center;">
                    <button
                      type="button"
                      class="pill-btn-ink"
                      data-action="copy-share-link"
                      data-link-id="${escapeHtml(currentLink.id)}"
                    >Copy</button>
                    <button
                      type="button"
                      class="btn-link-danger"
                      data-action="prompt-revoke-link"
                      data-link-id="${escapeHtml(currentLink.id)}"
                    >Revoke</button>
                  </div>
                </div>
                <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--divider); display:flex; justify-content:space-between; align-items:center;">
                  <button
                    type="button"
                    class="section-action"
                    data-action="open-share-preview"
                    data-link-id="${escapeHtml(currentLink.id)}"
                  >Preview as viewer →</button>
                  <button
                    type="button"
                    class="section-action"
                    data-action="open-share-link-sheet"
                  >Manage links</button>
                </div>
              </div>
            `
            : `
              <div class="card card-pad row" style="padding:14px 16px;">
                <div class="row-body">
                  <div class="row-title">No active link</div>
                  <div class="row-sub">Create an expiring link to share your schedule</div>
                </div>
                <button
                  type="button"
                  class="pill-btn-ink"
                  data-action="open-share-link-sheet"
                >Create link</button>
              </div>
            `
        }
      </div>
    </div>
  `;
}

/**
 * Screen 34: Selected Friends Picker (Section 6.6)
 */
export function renderSelectedFriendsPickerScreen(state) {
  const cfg = state.user.privacyConfig || {
    globalAudience: 'selected',
    personOverrides: {},
    groupRules: {}
  };
  const query = (state.ui.selectedFriendsSearch || '').trim().toLowerCase();

  const sharedEntries = Object.entries(cfg.personOverrides || {}).filter(([, lvl]) => lvl && lvl !== 'none');

  return `
    <div class="screen-scroll no-nav" data-screen-id="34">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>
        <span style="font-weight:800; font-size:15px;">Selected friends</span>
        <button type="button" class="section-action" data-action="done-selected-friends">Done</button>
      </div>

      <div style="padding:0 16px 8px;">
        <p class="body-copy">Choose who can see your schedule and how much detail each person or group gets.</p>
      </div>

      <div class="stack-gap">
        <div class="search-wrap">
          <span class="search-icon">${ICONS.search}</span>
          <input
            type="text"
            class="search-input"
            placeholder="Search friends or groups"
            value="${escapeHtml(state.ui.selectedFriendsSearch || '')}"
            aria-label="Search friends or groups"
            data-field="selected-friends-search"
          />
        </div>

        <div class="section-header" style="margin-top:0;">
          <span class="section-label">GROUPS · ${(state.groups || []).length}</span>
        </div>
        <div class="card card-pad" style="padding:4px 14px;">
          ${(state.groups || [])
            .filter((g) => !query || g.name.toLowerCase().includes(query))
            .map((g) => {
              const lvl = cfg.groupRules?.[g.id] || 'none';
              const enabled = lvl !== 'none';
              return `
                <div class="row">
                  <input
                    type="checkbox"
                    class="check-input"
                    aria-label="Share with group ${escapeHtml(g.name)}"
                    data-action="toggle-access-target"
                    data-target-type="group"
                    data-target-id="${escapeHtml(g.id)}"
                    ${enabled ? 'checked' : ''}
                  />
                  ${renderAvatar({ initials: g.initials, avatarClass: g.avatarClass || 'av-mint' })}
                  <div class="row-body">
                    <div class="row-title">${escapeHtml(g.name)}</div>
                    <div class="row-sub">Group · ${g.memberIds.length} ${g.memberIds.length === 1 ? 'member' : 'members'}</div>
                  </div>
                  <button
                    type="button"
                    class="dropdown-pill"
                    data-action="cycle-access-rule"
                    data-target-type="group"
                    data-target-id="${escapeHtml(g.id)}"
                  >${escapeHtml(privacyLevelToLabel(lvl))} ${ICONS.chevronDown}</button>
                </div>
              `;
            })
            .join('')}
        </div>

        <div class="section-header" style="margin-top:0;">
          <span class="section-label">FRIENDS · ${sharedEntries.length} OF ${state.friends.length} SHARED</span>
        </div>
        <div class="card card-pad" style="padding:4px 14px;">
          ${state.friends
            .filter((f) => !query || f.name.toLowerCase().includes(query) || f.username.toLowerCase().includes(query))
            .map((f) => {
              const lvl = cfg.personOverrides?.[f.id] || 'none';
              const enabled = lvl !== 'none';
              return `
                <div class="row">
                  <input
                    type="checkbox"
                    class="check-input"
                    aria-label="Share with ${escapeHtml(f.name)}"
                    data-action="toggle-access-target"
                    data-target-type="person"
                    data-target-id="${escapeHtml(f.id)}"
                    ${enabled ? 'checked' : ''}
                  />
                  ${renderAvatar({ initials: f.initials, avatarClass: f.avatarClass })}
                  <div class="row-body">
                    <div class="row-title">${escapeHtml(f.name)}</div>
                    <div class="row-sub">@${escapeHtml(f.username)}</div>
                  </div>
                  <button
                    type="button"
                    class="dropdown-pill"
                    data-action="cycle-access-rule"
                    data-target-type="person"
                    data-target-id="${escapeHtml(f.id)}"
                  >${escapeHtml(privacyLevelToLabel(lvl))} ${ICONS.chevronDown}</button>
                </div>
              `;
            })
            .join('')}
        </div>

        <button type="button" class="btn-primary" data-action="done-selected-friends">Done</button>
      </div>
    </div>
  `;
}

/**
 * Screen 38: Public Shared Schedule Web View (#/s/[linkId])
 * Section 4.7, 6.6, 7 & Addendum B §2:
 * - Reads link config and has states: active, expired ("This link has expired"), revoked, not_found.
 * - Shows "Francis's day" (or user's day).
 * - "Get CNU Free" -> toast "Coming soon".
 */
export function renderPublicShareScreen(state) {
  const currentNow = now();
  const linkId = state.ui.activeShareLinkId || 'francis_8472';
  const link = (state.shareLinks || []).find((l) => l.id === linkId) || null;
  const linkStatus = selectShareLinkStatus(link, currentNow);
  const dayIndex = typeof state.ui.myScheduleDayIndex === 'number' ? state.ui.myScheduleDayIndex : currentNow.dayIndex;
  const userSt = status(state.user, currentNow, 'self', state.groups);

  return `
    <div class="screen-scroll no-nav" data-screen-id="38">
      <!-- Top Brand Bar -->
      <div class="top-bar" style="padding-top:14px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:28px; height:28px; border-radius:8px; background:#0B1B16; display:flex; align-items:center; justify-content:center;">
            ${ICONS.brandMark}
          </div>
          <span style="font-family:var(--font-display); font-weight:800; font-size:15px;">cnu free</span>
        </div>

        <div style="display:flex; align-items:center; gap:8px;">
          ${
            state.ui.sharePreviewMode
              ? `<button type="button" class="section-action" data-action="close-share-preview">Close preview</button>`
              : ''
          }
          <button type="button" class="pill-btn-ink" data-action="get-cnu-free-cta">Get the app</button>
        </div>
      </div>

      <div class="stack-gap">
        ${
          linkStatus !== 'active'
            ? renderInactiveShareLinkCard(linkStatus, link)
            : renderActivePublicShareBody(state, link, dayIndex, currentNow, userSt)
        }
      </div>
    </div>
  `;
}

function renderInactiveShareLinkCard(linkStatus, link) {
  const title =
    linkStatus === 'expired'
      ? 'This link has expired'
      : linkStatus === 'revoked'
      ? 'This link is no longer active'
      : 'Link not found';
  const copy =
    linkStatus === 'expired'
      ? `This shared schedule link expired${link?.expiresLabel ? ` on ${link.expiresLabel}` : ''}. Ask the owner for a new link.`
      : linkStatus === 'revoked'
      ? 'The owner revoked access to this shared schedule link.'
      : 'Check the URL or ask your friend to send a new schedule link.';

  return `
    <div class="card card-pad empty-state-box" style="margin-top:24px;">
      <div class="dialog-icon-circle">${ICONS.lock}</div>
      <h1 class="dialog-title">${escapeHtml(title)}</h1>
      <p class="dialog-copy">${escapeHtml(copy)}</p>
      <button type="button" class="btn-primary" data-action="get-cnu-free-cta">Get CNU Free</button>
    </div>
  `;
}

function renderActivePublicShareBody(state, link, dayIndex, currentNow, userSt) {
  const showFull = link.audience === 'full';
  const canvasStart = link.audience === 'specific_hours' ? (link.hoursStart || 9 * 60) : DAY_WINDOW_START;
  const canvasEnd = link.audience === 'specific_hours' ? (link.hoursEnd || 17 * 60) : DAY_WINDOW_END;
  const canvasSpan = Math.max(60, canvasEnd - canvasStart);

  const entries = getEntriesForDay(state.user, dayIndex);
  const freeIntervals = computeFreeIntervals(state.user, dayIndex, canvasStart, canvasEnd);

  return `
    <div class="card card-pad">
      <div class="row" style="padding:0 0 12px; border-bottom:1px solid var(--divider);">
        ${renderAvatar({ initials: state.user.initials, avatarClass: state.user.avatarClass, size: 'lg' })}
        <div class="row-body">
          <div class="eyebrow">SHARED SCHEDULE · ${
            showFull ? 'FULL SCHEDULE' : link.audience === 'specific_hours' ? 'SPECIFIC HOURS' : 'FREE OR BUSY ONLY'
          }</div>
          <h1 style="font-family:var(--font-display); font-size:22px; font-weight:800; margin:2px 0;">${escapeHtml(state.user.firstName || state.user.name)}'s day</h1>
          <div class="row-sub">@${escapeHtml(state.user.username)} · Link expires ${escapeHtml(link.expiresLabel || 'Nov 3')}</div>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px;">
        <span class="${userSt.state === 'free' ? 'pill-free-soft' : 'pill-busy'}">
          ${
            userSt.state === 'free'
              ? `FREE NOW · ${escapeHtml(userSt.untilCopy.toUpperCase())}`
              : `BUSY UNTIL ${escapeHtml(userSt.untilFormatted || '12:00 PM')}`
          }
        </span>
        <span style="font-size:12px; color:#5A6862; font-weight:700;">
          ${showFull ? 'Class names visible' : 'Class details hidden'}
        </span>
      </div>
    </div>

    <div class="day-strip" style="padding:0;" role="tablist" aria-label="Select day">
      ${DEMO_WEEK_DATES.map((d) => {
        const active = d.dayIndex === dayIndex;
        return `
          <button
            type="button"
            class="day-pill ${active ? 'active' : ''}"
            data-action="set-my-schedule-day"
            data-day-index="${d.dayIndex}"
            aria-selected="${active}"
          >
            <span class="d-let">${d.letter}</span>
            <span class="d-num">${d.num}</span>
            <span class="d-dot"></span>
          </button>
        `;
      }).join('')}
    </div>

    <div class="card card-pad">
      <div class="timeline-scroll" data-timeline-scroll="public-share" style="max-height:280px; overflow-y:auto;">
        <div class="timeline-wrap" style="height:640px;">
          <div class="timeline-hours">
            ${TIMELINE_HOUR_LABELS.map((lbl) => `<span>${lbl}</span>`).join('')}
          </div>
          <div class="timeline-canvas">
            ${TIMELINE_HOUR_LABELS.map((_, idx) => {
              const pct = (idx / (TIMELINE_HOUR_LABELS.length - 1)) * 100;
              return `<div class="tl-grid-line" style="top:${pct.toFixed(2)}%;"></div>`;
            }).join('')}

            ${freeIntervals
              .filter((f) => f.end - f.start >= 30)
              .map((f) => {
                const s = Math.max(canvasStart, f.start);
                const e = Math.min(canvasEnd, f.end);
                if (e <= s) return '';
                const top = ((s - canvasStart) / canvasSpan) * 100;
                const h = ((e - s) / canvasSpan) * 100;
                return `
                  <div class="tl-block free" style="top:${top.toFixed(1)}%; height:${h.toFixed(1)}%;">
                    <span class="tl-title">Free · ${escapeHtml(formatDuration(e - s))}</span>
                    <span class="tl-sub">${escapeHtml(formatRange(s, e))}</span>
                  </div>
                `;
              })
              .join('')}

            ${entries
              .map((entry) => {
                const s = Math.max(canvasStart, entry.start);
                const e = Math.min(canvasEnd, entry.end);
                if (e <= s) return '';
                const top = ((s - canvasStart) / canvasSpan) * 100;
                const h = ((e - s) / canvasSpan) * 100;
                return `
                  <div class="tl-block busy" style="top:${top.toFixed(1)}%; height:${h.toFixed(1)}%;">
                    <span class="tl-title clamp-2">${escapeHtml(showFull ? (entry.short || entry.title) : 'Busy')}</span>
                    <span class="tl-sub">${escapeHtml(formatRange(entry.start, entry.end))}${
                      showFull && entry.detail ? ` · ${escapeHtml(entry.detail)}` : ''
                    }</span>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    </div>

    <div class="card-dark" style="padding:14px 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-family:var(--font-display); font-size:16px; font-weight:800; color:#FFF;">Find a time with ${escapeHtml(state.user.firstName)}</div>
          <div style="font-size:12px; color:#B7C6BF;">Compare your schedule automatically on CNU Free</div>
        </div>
        <button
          type="button"
          class="btn-mint"
          style="width:auto; min-height:44px; padding:0 14px; font-size:13px;"
          data-action="get-cnu-free-cta"
        >Get CNU Free →</button>
      </div>
    </div>
  `;
}
