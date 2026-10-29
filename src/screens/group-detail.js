/**
 * CNU Free — Screen 10 (Group Detail) & Screen 33 (Create / Add Members) (SPEC V2 §6.5 + Addendum B §6)
 * - Works for Kalbo (7), Badminton (2), and STEP (1 member: compares Francis with Dane).
 */

import { ICONS } from '../ui/icons.js';
import { renderAvatar, escapeHtml } from '../ui/avatar.js';
import { now, status, formatDuration } from '../time.js';
import { overlap, bestWindowForMostPeople } from '../overlap.js';
import { validateGroupName } from '../validators.js';

export function renderGroupDetailScreen(state) {
  const currentNow = now();
  const group = state.groups.find((g) => g.id === state.ui.activeGroupId) || state.groups[0];
  if (!group) {
    return `
      <div class="screen-scroll" data-screen-id="10">
        <div class="top-bar">
          <button type="button" class="back-btn" data-action="nav-back">${ICONS.back} <span>Back</span></button>
        </div>
        <div class="stack-gap">
          <div class="card card-pad"><span class="row-sub">No group selected.</span></div>
        </div>
      </div>
    `;
  }

  const members = group.memberIds
    .map((id) => state.friends.find((f) => f.id === id))
    .filter(Boolean);

  const enrichedMembers = members.map((friend) => ({
    friend,
    status: status(friend, currentNow, state.user.id, state.groups)
  }));

  const nonPrivateMembers = enrichedMembers.filter((m) => m.status.state !== 'private');
  const freeNowMembers = nonPrivateMembers.filter((m) => m.status.state === 'free');
  const privateMembers = enrichedMembers.filter((m) => m.status.state === 'private');

  // Compare Francis + all non-private group members (e.g. STEP compares Francis with Dane)
  const fullGroupOverlap = overlap(
    [state.user, ...nonPrivateMembers.map((m) => m.friend)],
    currentNow.dayIndex,
    { viewerId: state.user.id, groups: state.groups }
  );

  // If full group has no simultaneous window, fall back to best subset within the group
  const subsetOverlap = !fullGroupOverlap.bestWindow
    ? bestWindowForMostPeople(
        state.user,
        nonPrivateMembers.map((m) => m.friend),
        currentNow.dayIndex,
        state.groups,
        currentNow
      )
    : null;

  const bestWin = fullGroupOverlap.bestWindow || subsetOverlap?.window || null;
  const overlapParticipants = fullGroupOverlap.bestWindow
    ? [state.user, ...nonPrivateMembers.map((m) => m.friend)]
    : subsetOverlap?.participants || [state.user, ...nonPrivateMembers.map((m) => m.friend)];

  return `
    <div class="screen-scroll" data-screen-id="10">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>
        <button
          type="button"
          class="section-action"
          data-action="open-rename-group-sheet"
          data-group-id="${escapeHtml(group.id)}"
        >Rename</button>
      </div>

      <div class="stack-gap">
        <!-- Group Identity Card -->
        <div class="card card-pad">
          <div class="row" style="padding:0;">
            ${renderAvatar({ initials: group.initials, avatarClass: group.avatarClass || 'av-lavender', size: 'lg' })}
            <div class="row-body">
              <div class="eyebrow">GROUP · ${members.length} ${members.length === 1 ? 'MEMBER' : 'MEMBERS'}</div>
              <h1 style="font-family:var(--font-display); font-size:24px; font-weight:800; margin:2px 0;">${escapeHtml(group.name)}</h1>
              <div class="row-sub" style="color:#0B5A33; font-weight:700;">
                ${freeNowMembers.length} of ${nonPrivateMembers.length} free right now${
                  freeNowMembers.length > 0
                    ? ` · ${escapeHtml(freeNowMembers.map((m) => m.friend.firstName).join(', '))}`
                    : ''
                }
              </div>
            </div>
          </div>
        </div>

        <!-- Group Best Window Mint Card -->
        <div class="card-mint-overlap">
          <div class="eyebrow" style="color:#0B5A33;">
            ${
              bestWin
                ? `${members.length === 1 ? 'SHARED FREE TIME' : 'MOST MEMBERS FREE TODAY'} · ${escapeHtml(formatDuration(bestWin.duration).toUpperCase())}`
                : 'SHARED GROUP AVAILABILITY'
            }
          </div>
          <div style="font-family:var(--font-display); font-size:20px; font-weight:800; color:#073D22; margin:3px 0 2px;">
            ${bestWin ? `${escapeHtml(bestWin.formatted)} today` : 'Compare schedules'}
          </div>
          <div style="font-size:12px; color:#0B5A33; font-weight:600;">
            ${escapeHtml(
              overlapParticipants
                .map((p) => (p.id === state.user.id ? 'Francis (You)' : p.firstName))
                .join(', ')
            )}${
              privateMembers.length > 0
                ? ` (${escapeHtml(privateMembers.map((p) => p.friend.firstName).join(', '))} private)`
                : ''
            }
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
            <div class="avatar-stack">
              ${overlapParticipants
                .slice(0, 6)
                .map((p) =>
                  renderAvatar({
                    initials: p.shortInitial || p.initials,
                    avatarClass: p.avatarClass,
                    size: 'sm'
                  })
                )
                .join('')}
            </div>
            <button
              type="button"
              class="pill-btn-ink"
              data-action="open-group-overlap"
              data-group-id="${escapeHtml(group.id)}"
            >See overlap →</button>
          </div>
        </div>

        <!-- Members Section -->
        <div>
          <div class="section-header" style="margin-top:0;">
            <span class="section-label">MEMBERS · ${members.length}</span>
            <button
              type="button"
              class="section-action"
              data-action="open-add-group-members"
              data-group-id="${escapeHtml(group.id)}"
            >+ Add members</button>
          </div>

          <div class="card card-pad" style="padding:4px 14px;">
            ${
              enrichedMembers.length === 0
                ? `<div style="padding:14px 4px;"><span class="row-sub">No members in this group yet.</span></div>`
                : enrichedMembers
                    .map(({ friend, status: st }) => {
                      const isPrivate = st.state === 'private';
                      const subText = isPrivate
                        ? 'Schedule is private'
                        : st.noTimetable
                        ? 'No timetable yet'
                        : st.state === 'free'
                        ? st.statusText || 'Free for the rest of the day'
                        : `${st.currentEntry?.short || st.currentEntry?.code || 'Busy'} until ${st.untilFormatted || 'later'}`;
                      return `
                        <div class="row">
                          <button
                            type="button"
                            style="display:flex; align-items:center; gap:12px; flex:1; min-width:0; background:none; border:none; padding:4px 0; text-align:left; cursor:pointer;"
                            data-action="open-friend-schedule"
                            data-friend-id="${escapeHtml(friend.id)}"
                          >
                            ${renderAvatar({ initials: friend.initials, avatarClass: friend.avatarClass })}
                            <div class="row-body">
                              <div class="row-title">${escapeHtml(friend.name)}</div>
                              <div class="row-sub clamp-2">${escapeHtml(subText)}</div>
                            </div>
                          </button>
                          ${
                            isPrivate
                              ? `<span class="pill-amber">Private</span>`
                              : st.state === 'free'
                              ? `<span class="pill-free-soft status-pill" data-person-id="${escapeHtml(friend.id)}" data-person-state="free">Free · ${escapeHtml(st.countdownLabel || 'now')}</span>`
                              : `<span class="pill-busy status-pill" data-person-id="${escapeHtml(friend.id)}" data-person-state="busy">Busy</span>`
                          }
                          <button
                            type="button"
                            class="icon-btn"
                            style="width:44px; height:44px; background:transparent; box-shadow:none;"
                            aria-label="Remove ${escapeHtml(friend.name)} from group"
                            data-action="remove-member-from-group"
                            data-group-id="${escapeHtml(group.id)}"
                            data-member-id="${escapeHtml(friend.id)}"
                          >${ICONS.moreHorizontal}</button>
                        </div>
                      `;
                    })
                    .join('')
            }
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Screen 33: Create / Edit Group OR Add Members
 */
export function renderGroupFormScreen(state) {
  const mode = state.ui.groupFormMode || 'create';
  const groupName = state.ui.groupFormName !== undefined ? state.ui.groupFormName : 'Study Hall';
  const membersMap = state.ui.groupFormMembers || {};
  const selectedIds = Object.entries(membersMap)
    .filter(([, checked]) => Boolean(checked))
    .map(([id]) => id);

  const nameValidation =
    mode === 'create' ? validateGroupName(groupName, state.groups, null) : { valid: true, error: null };

  const selectedFriends = selectedIds
    .map((id) => state.friends.find((f) => f.id === id))
    .filter(Boolean);

  return `
    <div class="screen-scroll no-nav" data-screen-id="33">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="cancel-group-form">Cancel</button>
        <span style="font-weight:800; font-size:15px;">${mode === 'add-members' ? 'Add friends' : 'New group'}</span>
        <span style="width:48px;"></span>
      </div>

      <div class="stack-gap">
        ${
          mode === 'create'
            ? `
              <div class="form-group" style="margin:0; padding:0 16px;">
                <label class="field-label" for="group-name-input">GROUP NAME</label>
                <input
                  id="group-name-input"
                  type="text"
                  class="field-input ${!nameValidation.valid ? 'error' : ''}"
                  value="${escapeHtml(groupName)}"
                  placeholder="e.g. Study Hall"
                  data-field="group-form-name"
                />
                ${!nameValidation.valid ? `<div class="field-error-text">${escapeHtml(nameValidation.error)}</div>` : ''}
              </div>
            `
            : ''
        }

        <div>
          <div class="section-header" style="margin-top:0;">
            <span class="section-label">SELECTED · ${selectedFriends.length}</span>
          </div>
          <div class="chip-row" style="padding:0 16px;">
            ${
              selectedFriends.length === 0
                ? `<span class="row-sub">Select friends below</span>`
                : selectedFriends
                    .map(
                      (f) => `
                        <button
                          type="button"
                          class="chip active"
                          data-action="toggle-group-form-member"
                          data-friend-id="${escapeHtml(f.id)}"
                        >
                          <span class="avatar avatar-xs ${f.avatarClass}">${escapeHtml(f.initials)}</span>
                          ${escapeHtml(f.firstName)} ×
                        </button>
                      `
                    )
                    .join('')
            }
          </div>
        </div>

        <div>
          <div class="section-header" style="margin-top:0;">
            <span class="section-label">ADD FROM FRIENDS · ${state.friends.length}</span>
          </div>
          <div class="card card-pad" style="padding:4px 14px;">
            ${state.friends
              .map((f) => {
                const checked = Boolean(membersMap[f.id]);
                return `
                  <label class="row" style="cursor:pointer;">
                    ${renderAvatar({ initials: f.initials, avatarClass: f.avatarClass })}
                    <div class="row-body">
                      <div class="row-title">${escapeHtml(f.name)}</div>
                      <div class="row-sub">@${escapeHtml(f.username)} · ${escapeHtml(f.groupTag || 'Friends')}</div>
                    </div>
                    <input
                      type="checkbox"
                      class="check-input"
                      data-action="toggle-group-form-member"
                      data-friend-id="${escapeHtml(f.id)}"
                      ${checked ? 'checked' : ''}
                    />
                  </label>
                `;
              })
              .join('')}
          </div>
        </div>

        <div style="padding:0 16px;">
          <button
            type="button"
            class="btn-primary"
            data-action="submit-group-form"
            ${!nameValidation.valid ? 'disabled' : ''}
          >${mode === 'add-members' ? `Add ${selectedFriends.length}` : `Create group · ${selectedFriends.length}`}</button>
        </div>
      </div>
    </div>
  `;
}
