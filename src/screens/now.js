/**
 * CNU Free — Screen 1: Now (SPEC V2 §6.3 + Addendum B §4, §6 + Addendum C §2, §3, §4)
 * - Reads 100% of derived state from memoized selectors in src/store.js:
 *   selectFriendsAvailability, selectYourDay, selectBestWindowForMostPeople, selectNotificationsView.
 * - Keyed data-bind attributes enable in-place Text node patching without full re-render.
 */

import { ICONS } from '../ui/icons.js';
import { renderAvatar, escapeHtml } from '../ui/avatar.js';
import {
  now,
  formatDuration
} from '../time.js';
import {
  selectFriendsAvailability,
  selectYourDay,
  selectBestWindowForMostPeople,
  selectNotificationsView
} from '../store.js';

export function renderNowScreen(state) {
  const currentNow = now();
  const groupFilter = state.ui.nowGroupFilter || 'All';
  const avail = selectFriendsAvailability(state, currentNow, groupFilter);
  const userDay = selectYourDay(state, currentNow, currentNow.dayIndex);
  const bestOverlap = selectBestWindowForMostPeople(state, currentNow);
  const notifView = selectNotificationsView(state, currentNow);

  const groups = state.groups || [];

  return `
    <div class="screen-scroll" data-screen-id="1">
      <div class="top-bar" style="padding-bottom:2px;">
        <div>
          <span class="meta-label" data-bind="now-clock-label">${escapeHtml(`${currentNow.dayLabel} · ${currentNow.formattedTime}`)}</span>
          <div style="font-size:12px; font-weight:700; color:var(--secondary-text); margin-top:1px;" data-bind="now-greeting">${escapeHtml(`Good morning, ${state.user.firstName}`)}</div>
        </div>
        <button
          type="button"
          class="icon-btn"
          aria-label="Inbox notifications"
          data-action="open-inbox"
          data-bind="now-inbox-btn"
        >
          ${ICONS.bell}
          ${notifView.unreadCount > 0 ? `<span class="badge-dot" data-bind="now-unread-badge" data-unread-count="${notifView.unreadCount}" aria-label="${notifView.unreadCount} unread"></span>` : ''}
        </button>
      </div>

      <div style="padding:0 16px 6px;">
        <h1 class="display-xl">cnu free?</h1>
      </div>

      <!-- Group Filter Chips (All, Kalbo, Badminton, STEP) -->
      <div class="chip-row" role="tablist" aria-label="Filter by group" data-bind="now-group-chips">
        <button
          type="button"
          class="chip ${groupFilter === 'All' ? 'active' : ''}"
          data-action="set-now-group-filter"
          data-group="All"
        >All</button>
        ${groups
          .map((g) => {
            const isActive = groupFilter.toLowerCase() === g.name.toLowerCase();
            const gStat = avail.groupStats?.[g.id] || { freeCount: 0, totalCount: g.memberIds.length };
            return `
              <button
                type="button"
                class="chip ${isActive ? 'active' : ''}"
                data-action="set-now-group-filter"
                data-group="${escapeHtml(g.name)}"
                data-group-free="${gStat.freeCount} of ${gStat.totalCount}"
              >${escapeHtml(`${g.name} · ${gStat.freeCount}/${gStat.totalCount}`)}</button>
            `;
          })
          .join('')}
      </div>

      ${
        avail.activeGroup
          ? `
            <div style="padding:0 16px 8px;" data-bind="now-open-group-wrap">
              <button
                type="button"
                class="section-action"
                data-action="open-group-detail"
                data-group-id="${escapeHtml(avail.activeGroup.id)}"
              >${escapeHtml(`Open ${avail.activeGroup.name} →`)}</button>
            </div>
          `
          : ''
      }

      <div class="stack-gap">
        <!-- Dark Hero Card: Free Right Now -->
        <section class="card-dark" aria-label="Friends free right now" data-bind="now-hero-card">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
            <div>
              <div class="eyebrow" style="color:#6CF2A2;">FREE RIGHT NOW</div>
              <div style="font-family:var(--font-display); font-size:20px; font-weight:800; color:#FFF; margin-top:2px;" data-bind="now-free-count">${escapeHtml(
                avail.freeNowCount > 0
                  ? `${avail.freeNowCount} of your ${avail.totalNonPrivateCount} friends`
                  : `Nobody's free right now`
              )}</div>
              <div style="font-size:11px; color:#B7C6BF; font-weight:600; margin-top:2px;" data-bind="now-hero-free-until">${escapeHtml(userDay.heroFreeUntilText)}</div>
            </div>
            <span class="pill-free-bright">NOW</span>
          </div>

          <div data-bind="now-hero-rows">
            ${
              avail.freeNowCount === 0
                ? `
                  <div style="padding:10px 0; border-top:1px solid rgba(255,255,255,0.12); color:#B7C6BF; font-size:13px;" data-bind="now-hero-empty">
                    ${
                      avail.nextFriendToBecomeFree
                        ? `Next free: <strong style="color:#FFFFFF;">${escapeHtml(avail.nextFriendToBecomeFree.friend.firstName)}</strong> at ${escapeHtml(avail.nextFriendToBecomeFree.atFormatted)}`
                        : `No upcoming shared free windows today.`
                    }
                  </div>
                `
                : avail.freeNow
                    .map(({ friend, status: st }) => {
                      const nextDetail = st.nextEntry?.detail || st.nextEntry?.room;
                      const nextRoom = nextDetail ? ` · next ${nextDetail}` : '';
                      const subText = st.noTimetable
                        ? 'No timetable yet'
                        : st.nextEntry
                        ? `Until ${st.untilFormatted}${nextRoom}`
                        : st.statusText || 'Free for the rest of the day';
                      return `
                        <button
                          type="button"
                          class="dark-friend-row"
                          style="width:100%; background:none; border:none; border-top:1px solid rgba(255,255,255,0.1); text-align:left; cursor:pointer;"
                          data-action="open-friend-schedule"
                          data-friend-id="${escapeHtml(friend.id)}"
                          data-key="hero-row-${escapeHtml(friend.id)}"
                        >
                          ${renderAvatar({ initials: friend.initials, avatarClass: friend.avatarClass })}
                          <div class="row-body">
                            <div class="dark-friend-name">${escapeHtml(friend.shortName || friend.name)}</div>
                            <div class="dark-friend-sub" data-bind="hero-sub-${escapeHtml(friend.id)}">${escapeHtml(subText)}</div>
                          </div>
                          <span class="pill-free-outline status-pill" data-bind="hero-pill-${escapeHtml(friend.id)}" data-person-id="${escapeHtml(friend.id)}" data-person-state="${st.state}">${escapeHtml(st.countdownLabel || 'Free')}</span>
                        </button>
                      `;
                    })
                    .join('')
            }
          </div>
        </section>

        <!-- Your Day Ribbon OR Add Your Timetable Card (7A–9P) -->
        ${
          !userDay.hasClasses
            ? `
              <button
                type="button"
                class="card card-pad"
                style="text-align:left; cursor:pointer; border:1.5px dashed #1FB86B; background:#F4FBF7;"
                data-action="open-import-timetable"
                data-bind="now-your-day-card"
              >
                <div class="row" style="padding:0;">
                  <div class="avatar avatar-sm av-mint">${ICONS.camera}</div>
                  <div class="row-body">
                    <div class="row-title" style="color:#073D22;">Add your timetable</div>
                    <div class="row-sub">Import a photo or add classes so friends see when you're free.</div>
                  </div>
                  <span style="color:#073D22;">${ICONS.chevronRight}</span>
                </div>
              </button>
            `
            : `
              <button
                type="button"
                class="card card-pad"
                style="text-align:left; cursor:pointer; border:none;"
                data-action="open-my-day-from-now"
                data-bind="now-your-day-card"
              >
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <div style="min-width:0; flex:1;">
                    <div class="row-title">Your day</div>
                    <div class="row-sub clamp-2" data-bind="now-your-day-sub">${escapeHtml(userDay.yourDaySubText)}</div>
                  </div>
                  <span class="pill-free-soft status-pill" data-bind="now-next-free-pill" data-person-id="${escapeHtml(state.user.id)}" data-person-state="${userDay.userStatus.state}" style="flex-shrink:0;">${escapeHtml(userDay.nextFreeLabel)}</span>
                </div>
                <div class="day-ribbon" aria-hidden="true" data-bind="now-your-day-ribbon">
                  ${userDay.ribbonSegments
                    .map(
                      (seg, idx) =>
                        `<div class="ribbon-seg ${seg.type}" data-key="rib-${idx}" style="width:${seg.widthPct.toFixed(2)}%;"><span>${escapeHtml(seg.label)}</span></div>`
                    )
                    .join('')}
                  <div class="ribbon-now-tick" data-key="rib-tick" style="left:${userDay.nowPct.toFixed(1)}%;"></div>
                </div>
                <div class="ribbon-scale">
                  <span>7a</span><span>10a</span><span>1p</span><span>5p</span><span>9p</span>
                </div>
              </button>
            `
        }

        <!-- Best Window Today Mint Card -->
        ${
          bestOverlap
            ? `
              <div
                class="card-mint-overlap"
                role="region"
                aria-label="Best overlap window today"
                data-action="open-best-overlap"
                data-bind="now-best-window-card"
                style="cursor:pointer;"
              >
                <div class="eyebrow" style="color:#0B5A33;" data-bind="now-best-window-eyebrow">${escapeHtml(`BEST WINDOW TODAY · ${formatDuration(bestOverlap.window.duration).toUpperCase()}`)}</div>
                <div style="font-family:var(--font-display); font-size:21px; font-weight:800; color:#073D22; margin:3px 0 2px;" data-bind="now-best-window-time">${escapeHtml(`${bestOverlap.window.formatted} today`)}</div>
                <div style="font-size:13px; color:#0B5A33; font-weight:600;" data-bind="now-best-window-copy">${escapeHtml(bestOverlap.copy)}</div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px;">
                  <div class="avatar-stack" data-bind="now-best-window-avatars">
                    ${bestOverlap.participants
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
                    data-action="suggest-best-window"
                    data-bind="now-suggest-btn"
                    data-window-start="${bestOverlap.window.start}"
                    data-window-end="${bestOverlap.window.end}"
                    data-day-index="${bestOverlap.dayIndex}"
                    data-participant-ids="${escapeHtml((bestOverlap.participantIds || []).join(','))}"
                  >${escapeHtml(bestOverlap.suggestLabel || 'Suggest →')}</button>
                </div>
              </div>
            `
            : ''
        }

        <!-- Busy Now Compact Row -->
        ${
          avail.busyNowCount > 0
            ? `
              <button
                type="button"
                class="card card-pad row"
                style="padding:12px 16px; text-align:left; cursor:pointer; border:none;"
                data-action="open-busy-now"
                data-bind="now-busy-row"
              >
                <div class="avatar-stack">
                  ${avail.busyNow
                    .slice(0, 5)
                    .map(({ friend }) =>
                      renderAvatar({
                        initials: friend.initials,
                        avatarClass: friend.avatarClass,
                        size: 'sm'
                      })
                    )
                    .join('')}
                </div>
                <div class="row-body">
                  <div class="row-title" data-bind="now-busy-title">${escapeHtml(`Busy now · ${avail.busyNowCount}`)}</div>
                  <div class="row-sub clamp-2" data-bind="now-busy-sub">${escapeHtml(
                    avail.busyNow
                      .map(
                        ({ friend, status: st }) =>
                          `${friend.firstName} until ${st.untilFormatted || 'later'}`
                      )
                      .join(' · ')
                  )}</div>
                </div>
                <span style="color:#5A6862;">${ICONS.chevronRight}</span>
              </button>
            `
            : ''
        }
      </div>
    </div>
  `;
}
