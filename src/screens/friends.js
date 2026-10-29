/**
 * CNU Free — Screen 6 & States 21, 22, 23: Friends List & Groups (SPEC V2 §6.5 + Addendum B §2, §4, §6)
 * - Header: "10 friends · N free now"
 * - Group chips: "Kalbo · 7", "Badminton · 2", "STEP · 1"
 * - Free people sorted by time remaining (most first); Busy people sorted by who becomes free soonest.
 * - Supports "No timetable yet" and private friend rows.
 */

import { ICONS } from '../ui/icons.js';
import { renderAvatar, escapeHtml } from '../ui/avatar.js';
import { now } from '../time.js';
import { selectFriendsAvailability } from '../store.js';

export function renderFriendsScreen(state, forcedViewState = null) {
  const viewState = forcedViewState || state.ui.friendsViewState || 'normal';
  const currentNow = now();
  const avail = selectFriendsAvailability(state, currentNow, 'All');

  if (viewState === 'loading') {
    return renderFriendsLoadingState();
  }
  if (viewState === 'error') {
    return renderFriendsErrorState();
  }
  if (viewState === 'empty' || state.friends.length === 0) {
    return renderFriendsEmptyState();
  }

  const filter = state.ui.friendsFilter || 'All';
  const rawQuery = state.ui.friendsSearch || '';
  const query = rawQuery.trim().toLowerCase();

  // Order for 'All': Free (most remaining first) -> Busy (becomes free soonest) -> Private
  let visibleRows = [...avail.freeNow, ...avail.busyNow, ...avail.privateFriends];
  if (filter === 'Free now') {
    visibleRows = avail.freeNow;
  } else if (filter === 'Busy') {
    visibleRows = avail.busyNow;
  }

  if (query) {
    visibleRows = visibleRows.filter(
      ({ friend }) =>
        friend.name.toLowerCase().includes(query) ||
        friend.username.toLowerCase().includes(query) ||
        (friend.groupTag || '').toLowerCase().includes(query)
    );
  }

  const incomingCount = (state.incomingRequests || []).length;

  return `
    <div class="screen-scroll" style="padding-bottom:calc(120px + env(safe-area-inset-bottom, 0px));" data-screen-id="6">
      <div class="top-bar" style="padding-bottom:2px;">
        <span class="meta-label">${avail.totalNonPrivateCount} friends · ${avail.freeNowCount} free now</span>
        <button
          type="button"
          class="icon-btn-dark"
          aria-label="Add friend"
          data-action="open-find-friends"
        >${ICONS.plus}</button>
      </div>

      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Friends</h1>
      </div>

      <div class="stack-gap">
        <!-- Search Input -->
        <div class="search-wrap" style="padding:0 16px;">
          <span class="search-icon" style="left:30px;">${ICONS.search}</span>
          <input
            type="text"
            class="search-input"
            placeholder="Search friends or @username"
            value="${escapeHtml(rawQuery)}"
            aria-label="Search friends"
            data-field="friends-search"
          />
          ${
            rawQuery
              ? `<button type="button" class="search-clear" style="right:20px;" aria-label="Clear search" data-action="clear-friends-search">${ICONS.close}</button>`
              : ''
          }
        </div>

        <!-- Incoming Requests Banner -->
        ${
          incomingCount > 0
            ? `
              <div class="card card-pad row" style="padding:12px 14px; background:#EDFBF3; border:1px solid #B5E8CB;">
                <div class="avatar avatar-sm av-mint" style="color:#073D22;">${incomingCount}</div>
                <div class="row-body">
                  <div class="row-title" style="color:#073D22;">${incomingCount} friend ${incomingCount === 1 ? 'request' : 'requests'}</div>
                  <div class="row-sub" style="color:#0B5A33;">
                    ${escapeHtml(
                      state.incomingRequests
                        .map((r) => `${r.name}${r.mutualCount ? ` (${r.mutualCount} mutual)` : ''}`)
                        .join(' · ')
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  class="pill-btn-ink"
                  data-action="open-requests-received"
                >Review</button>
              </div>
            `
            : ''
        }

        <!-- Groups Horizontal Chips ("Kalbo · 7", "Badminton · 2", "STEP · 1") -->
        <div>
          <div class="section-header" style="margin-top:0;">
            <span class="section-label">GROUPS</span>
            <button type="button" class="section-action" data-action="open-create-group">+ New group</button>
          </div>
          <div class="chip-row" style="padding:0 16px;">
            ${(state.groups || [])
              .map((g) => {
                const gStat = avail.groupStats?.[g.id] || { freeCount: 0, totalCount: g.memberIds.length };
                return `
                  <button
                    type="button"
                    class="chip"
                    data-action="open-group-detail"
                    data-group-id="${escapeHtml(g.id)}"
                    data-group-free="${gStat.freeCount} of ${gStat.totalCount}"
                  >${escapeHtml(g.name)} · ${g.memberIds.length}</button>
                `;
              })
              .join('')}
            <button
              type="button"
              class="chip dashed"
              data-action="open-create-group"
            >+ New group</button>
          </div>
        </div>

        <!-- Status Filter Chips -->
        <div class="chip-row" style="padding:0 16px;" role="tablist" aria-label="Filter friends by availability">
          <button
            type="button"
            class="chip ${filter === 'All' ? 'active' : ''}"
            data-action="set-friends-filter"
            data-filter="All"
          >All · ${avail.totalNonPrivateCount}</button>
          <button
            type="button"
            class="chip ${filter === 'Free now' ? 'active' : ''}"
            data-action="set-friends-filter"
            data-filter="Free now"
          >Free now · ${avail.freeNowCount}</button>
          <button
            type="button"
            class="chip ${filter === 'Busy' ? 'active' : ''}"
            data-action="set-friends-filter"
            data-filter="Busy"
          >Busy · ${avail.busyNowCount}</button>
        </div>

        <!-- Friends List Card (10 rows, scrolls cleanly above tab bar) -->
        <div class="card card-pad" style="padding:4px 14px;">
          ${
            visibleRows.length === 0
              ? `
                <div style="padding:16px 4px; text-align:center;">
                  <div class="row-sub" style="margin-bottom:10px;">No connected friends match "${escapeHtml(rawQuery || filter)}".</div>
                  ${
                    rawQuery
                      ? `
                        <button
                          type="button"
                          class="btn-primary"
                          style="min-height:44px; font-size:13px;"
                          data-action="find-query-in-everyone"
                          data-query="${escapeHtml(rawQuery)}"
                        >Find "${escapeHtml(rawQuery)}" in everyone →</button>
                      `
                      : ''
                  }
                </div>
              `
              : visibleRows
                  .map(({ friend, status: st }) => renderFriendRow(friend, st))
                  .join('')
          }
        </div>
      </div>
    </div>
  `;
}

function renderFriendRow(friend, st) {
  const isPrivate = st.state === 'private';

  let subLine = '';
  let rightControl = '';

  if (isPrivate) {
    subLine = `<span style="display:inline-flex; align-items:center; gap:4px; color:#5C3A00;"><span style="display:inline-flex; transform:scale(0.8);">${ICONS.lock}</span> Schedule is private</span>`;
    rightControl = `
      <button
        type="button"
        class="chip amber"
        style="min-height:36px; padding:0 10px; font-size:11px;"
        data-action="request-schedule-access"
        data-friend-id="${escapeHtml(friend.id)}"
        ${friend.accessRequested ? 'disabled' : ''}
      >${friend.accessRequested ? 'Requested' : 'Ask for access'}</button>
    `;
  } else if (st.noTimetable) {
    subLine = 'No timetable yet';
    rightControl = `<span class="pill-free-soft status-pill" data-person-id="${escapeHtml(friend.id)}" data-person-state="free">Free</span>`;
  } else if (st.state === 'free') {
    const nextDetail = st.nextEntry?.detail || st.nextEntry?.room;
    const nextRoom = nextDetail ? ` · next ${nextDetail}` : '';
    subLine = `${escapeHtml(st.statusText || 'Free for the rest of the day')}${escapeHtml(nextRoom)}`;
    rightControl = `<span class="pill-free-soft status-pill" data-person-id="${escapeHtml(friend.id)}" data-person-state="free">Free · ${escapeHtml(st.countdownLabel || 'now')}</span>`;
  } else {
    const shortTitle = st.currentEntry?.short || st.currentEntry?.code || 'In class';
    const detailRoom = st.currentEntry?.detail || st.currentEntry?.room;
    subLine = `${escapeHtml(shortTitle)}${detailRoom ? ` (${escapeHtml(detailRoom)})` : ''} · until ${escapeHtml(st.untilFormatted || 'later')}`;
    rightControl = `<span class="pill-busy status-pill" data-person-id="${escapeHtml(friend.id)}" data-person-state="busy">Busy</span>`;
  }

  return `
    <div class="row" data-friend-row="${escapeHtml(friend.id)}">
      <button
        type="button"
        style="display:flex; align-items:center; gap:12px; flex:1; min-width:0; background:none; border:none; padding:4px 0; text-align:left; cursor:pointer;"
        data-action="open-friend-schedule"
        data-friend-id="${escapeHtml(friend.id)}"
      >
        ${renderAvatar({ initials: friend.initials, avatarClass: friend.avatarClass })}
        <div class="row-body">
          <div class="row-title">${escapeHtml(friend.name)}</div>
          <div class="row-sub clamp-2">${subLine}</div>
        </div>
      </button>
      ${rightControl}
      <button
        type="button"
        class="icon-btn"
        style="width:44px; height:44px; background:transparent; box-shadow:none;"
        aria-label="More actions for ${escapeHtml(friend.name)}"
        data-action="open-friend-action-sheet"
        data-friend-id="${escapeHtml(friend.id)}"
      >${ICONS.moreHorizontal}</button>
    </div>
  `;
}

function renderFriendsEmptyState() {
  return `
    <div class="screen-scroll" data-screen-id="21">
      <div class="top-bar" style="padding-bottom:2px;">
        <span class="meta-label">0 FRIENDS</span>
        <button type="button" class="icon-btn-dark" aria-label="Add friend" data-action="open-find-friends">${ICONS.plus}</button>
      </div>
      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Friends</h1>
      </div>

      <div class="stack-gap" style="margin-top:24px;">
        <div class="card card-pad empty-state-box">
          <div class="empty-illus">${ICONS.users}</div>
          <h2 class="dialog-title">See when friends are free</h2>
          <p class="dialog-copy">Add classmates by username or share your invite link to compare schedules automatically.</p>
          <button type="button" class="btn-primary" style="margin-bottom:8px;" data-action="open-find-friends">Find friends</button>
          <button type="button" class="btn-secondary" data-action="share-invite-link">Share your invite link</button>
        </div>
      </div>
    </div>
  `;
}

function renderFriendsLoadingState() {
  return `
    <div class="screen-scroll" data-screen-id="22" aria-busy="true" aria-label="Loading friends">
      <div class="top-bar" style="padding-bottom:2px;">
        <div class="sk-line w40" style="margin:0;"></div>
        <div class="sk-pill" style="width:44px; height:44px; border-radius:50%;"></div>
      </div>
      <div style="padding:0 16px 12px;">
        <h1 class="display-xl">Friends</h1>
      </div>
      <div class="stack-gap">
        <div class="skeleton" style="height:44px; border-radius:999px; margin:0 16px;"></div>
        <div style="display:flex; gap:8px; padding:0 16px;">
          <div class="sk-pill" style="width:110px;"></div>
          <div class="sk-pill" style="width:120px;"></div>
          <div class="sk-pill" style="width:90px;"></div>
        </div>
        <div class="card card-pad">
          ${[1, 2, 3, 4]
            .map(
              () => `
                <div class="row" style="border:none;">
                  <div class="sk-circle"></div>
                  <div class="row-body">
                    <div class="sk-line w60"></div>
                    <div class="sk-line w40" style="margin:0;"></div>
                  </div>
                  <div class="sk-pill"></div>
                </div>
              `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
}

function renderFriendsErrorState() {
  return `
    <div class="screen-scroll" data-screen-id="23">
      <div class="top-bar" style="padding-bottom:2px;">
        <span class="meta-label">FRIENDS</span>
        <button type="button" class="icon-btn-dark" aria-label="Add friend" data-action="open-find-friends">${ICONS.plus}</button>
      </div>
      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Friends</h1>
      </div>

      <div class="stack-gap" style="margin-top:24px;">
        <div class="card card-pad empty-state-box">
          <div class="dialog-icon-circle">${ICONS.alert}</div>
          <h2 class="dialog-title">Couldn't load friends</h2>
          <p class="dialog-copy">Check your connection and try again.</p>
          <button type="button" class="btn-primary" style="width:140px;" data-action="retry-friends-load">Retry</button>
        </div>
      </div>
    </div>
  `;
}
