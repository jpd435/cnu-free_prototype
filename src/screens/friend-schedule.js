/**
 * CNU Free — Screen 3 (Day) & Screen 35 (Week): Friend Schedule (SPEC V2 §6.5 + Addendum B §3, §4)
 * - Visible window: 7:00 AM – 9:00 PM (7A to 9P), scrollable inside card.
 * - Displays short title as primary text (clamped to 2 lines) and detail (room) as secondary text.
 * - Supports empty timetable ("No timetable yet") and private friend lock card ("Ask for access").
 */

import { ICONS } from '../ui/icons.js';
import { renderAvatar, escapeHtml } from '../ui/avatar.js';
import {
  now,
  status,
  DEMO_WEEK_DATES,
  DAY_WINDOW_START,
  DAY_WINDOW_END,
  getEntriesForDay,
  computeFreeIntervals,
  formatRange,
  formatCompactRange,
  formatDuration
} from '../time.js';
import { overlap } from '../overlap.js';
import { selectFriendById } from '../store.js';

export function renderFriendScheduleScreen(state, modeOverride = null) {
  const mode = modeOverride || state.ui.friendScheduleMode || 'day';
  const friend = selectFriendById(state, state.ui.activeFriendId) || state.friends[0];
  if (!friend) return '';

  const currentNow = now();
  const dayIndex =
    typeof state.ui.friendScheduleDayIndex === 'number'
      ? state.ui.friendScheduleDayIndex
      : currentNow.dayIndex;
  const dayMeta = DEMO_WEEK_DATES[dayIndex] || DEMO_WEEK_DATES[1];
  const friendSt = status(friend, currentNow, state.user.id, state.groups);
  const isPrivate = friendSt.state === 'private';

  const sharedOverlap = !isPrivate
    ? overlap([state.user, friend], dayIndex, { viewerId: state.user.id, groups: state.groups })
    : null;

  return `
    <div class="screen-scroll" data-screen-id="${mode === 'week' ? '35' : '3'}">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>

        <div style="display:flex; align-items:center; gap:8px;">
          <div class="seg-group" role="tablist" aria-label="Schedule view mode">
            <button
              type="button"
              class="seg-btn ${mode === 'day' ? 'active' : ''}"
              data-action="set-friend-schedule-mode"
              data-mode="day"
              aria-selected="${mode === 'day'}"
            >Day</button>
            <button
              type="button"
              class="seg-btn ${mode === 'week' ? 'active' : ''}"
              data-action="set-friend-schedule-mode"
              data-mode="week"
              aria-selected="${mode === 'week'}"
            >Week</button>
          </div>
          <button
            type="button"
            class="icon-btn"
            aria-label="More friend actions"
            data-action="open-friend-action-sheet"
            data-friend-id="${escapeHtml(friend.id)}"
          >${ICONS.moreHorizontal}</button>
        </div>
      </div>

      <div class="stack-gap">
        <!-- Friend Identity Card -->
        <div class="card card-pad">
          <div class="row" style="padding:0 0 12px 0; border-bottom:1px solid var(--divider);">
            ${renderAvatar({ initials: friend.initials, avatarClass: friend.avatarClass, size: 'lg' })}
            <div class="row-body">
              <h1 style="font-family:var(--font-display); font-size:20px; font-weight:800; margin:0;">${escapeHtml(friend.name)}</h1>
              <div class="row-sub">@${escapeHtml(friend.username)} · ${escapeHtml(friend.groupTag || 'Friends')} · ${
                isPrivate
                  ? 'Private schedule'
                  : friendSt.noTimetable
                  ? 'No timetable yet'
                  : 'Shares full schedule'
              }</div>
            </div>
          </div>

          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px;">
            ${
              isPrivate
                ? `
                  <span class="pill-amber">PRIVATE</span>
                  <span style="font-size:12px; color:#5A6862; font-weight:700;">Schedule hidden</span>
                `
                : friendSt.state === 'busy'
                ? `
                  <span class="pill-busy status-pill" data-person-id="${escapeHtml(friend.id)}" data-person-state="busy">BUSY UNTIL ${escapeHtml(friendSt.untilFormatted || '12:00 PM')}</span>
                  <span style="font-size:12px; color:#0B5A33; font-weight:700;">
                    Free at ${escapeHtml(friendSt.untilFormatted || 'later')}
                  </span>
                `
                : `
                  <span class="pill-free-soft status-pill" data-person-id="${escapeHtml(friend.id)}" data-person-state="free">FREE NOW</span>
                  <span style="font-size:12px; color:#0B5A33; font-weight:700;">
                    ${escapeHtml(friendSt.noTimetable ? 'No timetable yet' : friendSt.statusText || 'Free for the rest of the day')}
                  </span>
                `
            }
          </div>
        </div>

        ${
          isPrivate
            ? `
              <!-- Private Friend Lock Card -->
              <div class="card card-pad" style="text-align:center; padding:26px 18px;">
                <div class="avatar avatar-lg av-gold" style="margin:0 auto 12px; color:#5C3A00;">${ICONS.lock}</div>
                <h2 class="row-title" style="font-size:18px; margin-bottom:6px;">${escapeHtml(friend.firstName)}'s schedule is private</h2>
                <p class="row-sub" style="margin-bottom:16px;">Ask ${escapeHtml(friend.firstName)} for access to see when they're free and find overlapping windows.</p>
                <button
                  type="button"
                  class="btn-primary"
                  data-action="request-schedule-access"
                  data-friend-id="${escapeHtml(friend.id)}"
                  ${friend.accessRequested ? 'disabled' : ''}
                >${friend.accessRequested ? 'Requested' : 'Ask for access'}</button>
              </div>
            `
            : mode === 'day'
            ? renderFriendDayBody(friend, dayIndex, dayMeta, currentNow)
            : renderFriendWeekBody(friend, state.user, sharedOverlap, currentNow)
        }
      </div>
    </div>
  `;
}

function renderFriendDayBody(friend, dayIndex, dayMeta, currentNow) {
  const canvasStart = DAY_WINDOW_START; // 7:00 AM (420)
  const canvasSpan = DAY_WINDOW_END - DAY_WINDOW_START; // 840 mins (14 hrs)
  const entries = getEntriesForDay(friend, dayIndex);
  const freeIntervals = computeFreeIntervals(friend, dayIndex, canvasStart, DAY_WINDOW_END);
  const nowPct = Math.max(0, Math.min(100, ((currentNow.minutes - canvasStart) / canvasSpan) * 100));

  return `
    <div class="day-strip" style="padding:0 16px;" role="tablist" aria-label="Select day">
      ${DEMO_WEEK_DATES.map((d) => {
        const active = d.dayIndex === dayIndex;
        return `
          <button
            type="button"
            class="day-pill ${active ? 'active' : ''}"
            data-action="set-friend-schedule-day"
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
      <div class="eyebrow" style="margin-bottom:10px;">${escapeHtml((dayMeta.label || dayMeta.short).toUpperCase())}${(friend.entries || []).length === 0 ? ' · NO TIMETABLE YET' : ''}</div>
      <div class="timeline-scroll" data-timeline-scroll="true">
        <div class="timeline-wrap" style="height:520px;">
          <div class="timeline-hours">
            <span>7A</span><span>9A</span><span>11A</span><span>1P</span><span>3P</span><span>5P</span><span>7P</span><span>9P</span>
          </div>
          <div class="timeline-canvas">
            <div class="tl-grid-line" style="top:0%;"></div>
            <div class="tl-grid-line" style="top:14.28%;"></div>
            <div class="tl-grid-line" style="top:28.57%;"></div>
            <div class="tl-grid-line" style="top:42.85%;"></div>
            <div class="tl-grid-line" style="top:57.14%;"></div>
            <div class="tl-grid-line" style="top:71.42%;"></div>
            <div class="tl-grid-line" style="top:85.71%;"></div>
            <div class="tl-grid-line" style="top:100%;"></div>

            ${freeIntervals
              .filter((f) => f.end - f.start >= 30)
              .map((f) => {
                const s = Math.max(canvasStart, f.start);
                const e = Math.min(DAY_WINDOW_END, f.end);
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
                const e = Math.min(DAY_WINDOW_END, entry.end);
                if (e <= s) return '';
                const top = ((s - canvasStart) / canvasSpan) * 100;
                const h = ((e - s) / canvasSpan) * 100;
                const shortText = entry.short || entry.code || entry.title;
                const detailText = entry.detail !== undefined ? entry.detail : entry.room || '';
                return `
                  <div class="tl-block busy" style="top:${top.toFixed(1)}%; height:${h.toFixed(1)}%;" title="${escapeHtml(entry.title)}">
                    <span class="tl-title clamp-2">${escapeHtml(shortText)}</span>
                    <span class="tl-sub">${escapeHtml(formatRange(entry.start, entry.end))}${detailText ? ` · ${escapeHtml(detailText)}` : ''}</span>
                  </div>
                `;
              })
              .join('')}

            ${
              dayIndex === currentNow.dayIndex
                ? `
                  <div class="now-line" style="top:${nowPct.toFixed(1)}%;">
                    <span class="now-pill">${escapeHtml(currentNow.formattedTime.replace(' AM', '').replace(' PM', ''))}</span>
                  </div>
                `
                : ''
            }
          </div>
        </div>
      </div>
    </div>

    <div style="padding:0 16px;">
      <button
        type="button"
        class="btn-primary"
        data-action="find-time-with-friend"
        data-friend-id="${escapeHtml(friend.id)}"
      >Find a time with ${escapeHtml(friend.firstName)} →</button>
    </div>
  `;
}

function renderFriendWeekBody(friend, _user, sharedOverlap, currentNow) {
  const bestShared = sharedOverlap?.bestWindow;
  const canvasStart = DAY_WINDOW_START;
  const canvasSpan = DAY_WINDOW_END - DAY_WINDOW_START;

  return `
    <div class="card card-pad" style="padding:12px;">
      <div class="week-grid-header">
        <div></div>
        ${DEMO_WEEK_DATES.map(
          (d) => `<div class="${d.dayIndex === currentNow.dayIndex ? 'today' : ''}">${d.letter}<br>${d.num}</div>`
        ).join('')}
      </div>
      <div class="timeline-scroll" data-timeline-scroll="true">
        <div class="week-grid-body" style="height:480px;">
          <div class="week-hours">
            <span>7A</span><span>9A</span><span>11A</span><span>1P</span><span>3P</span><span>5P</span><span>7P</span><span>9P</span>
          </div>
          ${DEMO_WEEK_DATES.map((d) => {
            const dayEntries = getEntriesForDay(friend, d.dayIndex);
            const dayFree = computeFreeIntervals(friend, d.dayIndex, canvasStart, DAY_WINDOW_END).filter(
              (iv) => iv.end - iv.start >= 90
            );
            return `
              <div class="week-day-col ${d.dayIndex === currentNow.dayIndex ? 'today' : ''}">
                ${dayEntries
                  .map((e) => {
                    const s = Math.max(canvasStart, e.start);
                    const end = Math.min(DAY_WINDOW_END, e.end);
                    if (end <= s) return '';
                    const top = ((s - canvasStart) / canvasSpan) * 100;
                    const h = ((end - s) / canvasSpan) * 100;
                    return `<div class="wk-block busy" style="top:${top.toFixed(1)}%; height:${h.toFixed(1)}%;" title="${escapeHtml(e.title)}"><span class="clamp-2">${escapeHtml(e.short || e.code)}</span></div>`;
                  })
                  .join('')}
                ${dayFree
                  .slice(0, 1)
                  .map((f) => {
                    const s = Math.max(canvasStart, f.start);
                    const end = Math.min(DAY_WINDOW_END, f.end);
                    if (end <= s) return '';
                    const top = ((s - canvasStart) / canvasSpan) * 100;
                    const h = ((end - s) / canvasSpan) * 100;
                    return `<div class="wk-block free" style="top:${top.toFixed(1)}%; height:${h.toFixed(1)}%;">Free<br>${escapeHtml(formatDuration(end - s))}</div>`;
                  })
                  .join('')}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <div class="card-dark" style="padding:14px 16px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div class="eyebrow" style="color:#6CF2A2;">YOU &amp; ${escapeHtml(friend.firstName.toUpperCase())} BOTH FREE</div>
          <div style="font-family:var(--font-display); font-size:16px; font-weight:800; color:#FFF; margin-top:2px;">
            ${
              bestShared
                ? `Best window ${escapeHtml(formatCompactRange(bestShared.start, bestShared.end))} (${escapeHtml(formatDuration(bestShared.duration))})`
                : 'Tap Plan to check shared free windows'
            }
          </div>
          <div style="font-size:12px; color:#B7C6BF;">Shared windows this week</div>
        </div>
        <button
          type="button"
          class="btn-mint"
          style="width:auto; min-height:44px; padding:0 14px; font-size:13px;"
          data-action="find-time-with-friend"
          data-friend-id="${escapeHtml(friend.id)}"
        >Plan →</button>
      </div>
    </div>
  `;
}
