/**
 * CNU Free — Screen 7 & States 18, 19, 20: Inbox (SPEC V2 §4.8, §6.5 + Addendum B §2)
 * - Seed: Kristine request (2m, unread), Marco request (15m, unread),
 *   Dane accepted your request (1h, unread), Yesterday: Danica updated her schedule,
 *   Gian updated his schedule.
 * - Private person schedule-update card has NO View button.
 */

import { ICONS } from '../ui/icons.js';
import { renderAvatar, escapeHtml } from '../ui/avatar.js';
import { now } from '../time.js';
import { selectNotificationsView } from '../store.js';

export function renderInboxScreen(state, forcedViewState = null) {
  const viewState = forcedViewState || state.ui.inboxViewState || 'normal';
  const currentNow = now();
  const notifData = selectNotificationsView(state, currentNow);
  const filter = state.ui.inboxFilter || 'All';

  if (viewState === 'loading') {
    return renderInboxLoadingState();
  }
  if (viewState === 'error') {
    return renderInboxErrorState();
  }
  if (viewState === 'empty' || notifData.filtered.length === 0) {
    return renderInboxEmptyState(filter, notifData.unreadCount);
  }

  return `
    <div class="screen-scroll no-nav" data-screen-id="7">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>
        <button type="button" class="section-action" data-action="mark-all-notifications-read">Mark all read</button>
      </div>

      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Inbox</h1>
      </div>

      <div class="chip-row" role="tablist" aria-label="Filter notifications">
        <button
          type="button"
          class="chip ${filter === 'All' ? 'active' : ''}"
          data-action="set-inbox-filter"
          data-filter="All"
        >All</button>
        <button
          type="button"
          class="chip ${filter === 'Unread' ? 'active' : ''}"
          data-action="set-inbox-filter"
          data-filter="Unread"
        >Unread · ${notifData.unreadCount}</button>
      </div>

      <div class="stack-gap">
        ${
          notifData.todayItems.length > 0
            ? `
              <div class="section-header" style="margin-top:4px;"><span class="section-label">TODAY</span></div>
              ${notifData.todayItems.map((n) => renderNotificationItem(n, state)).join('')}
            `
            : ''
        }

        ${
          notifData.yesterdayItems.length > 0
            ? `
              <div class="section-header" style="margin-top:4px;"><span class="section-label">YESTERDAY</span></div>
              <div class="card card-pad" style="padding:4px 14px;">
                ${notifData.yesterdayItems.map((n) => renderYesterdayRow(n, state)).join('')}
              </div>
            `
            : ''
        }
      </div>
    </div>
  `;
}

function isNotificationPersonPrivate(n, state) {
  if (n.isPrivate || n.canView === false) return true;
  const f = (state?.friends || []).find((fr) => fr.id === n.personId);
  return Boolean(f && (f.shareLevel === 'none' || f.sharesWithViewer === 'none'));
}

function renderNotificationItem(n, state) {
  if (n.kind === 'friend_request') {
    return `
      <div class="card card-pad" data-action="mark-notification-read" data-notif-id="${escapeHtml(n.id)}">
        <div class="row" style="padding:0 0 10px; border:none;">
          ${renderAvatar({ initials: n.initials, avatarClass: n.avatarClass })}
          <div class="row-body">
            <div class="row-title">${escapeHtml(n.name)} <span style="font-weight:500; color:#5A6862;">sent a friend request</span></div>
            <div class="row-sub">@${escapeHtml(n.username)} · ${escapeHtml(n.detail || '3 mutual friends')} · ${escapeHtml(n.relativeTime)}</div>
          </div>
          ${n.unread ? `<span style="width:8px; height:8px; border-radius:50%; background:#1FB86B; flex-shrink:0;" aria-label="Unread"></span>` : ''}
          <button
            type="button"
            class="icon-btn"
            style="width:44px; height:44px; background:transparent; box-shadow:none;"
            aria-label="Block or report @${escapeHtml(n.username)}"
            data-action="open-block-user-dialog"
            data-person-id="${escapeHtml(n.personId)}"
          >${ICONS.moreHorizontal}</button>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
          <button
            type="button"
            class="btn-primary"
            style="min-height:44px; font-size:13px;"
            data-action="accept-friend-request"
            data-person-id="${escapeHtml(n.personId)}"
          >Accept</button>
          <button
            type="button"
            class="btn-secondary"
            style="min-height:44px; font-size:13px; background:#E8ECEA; border-radius:999px;"
            data-action="decline-friend-request"
            data-person-id="${escapeHtml(n.personId)}"
          >Decline</button>
        </div>
      </div>
    `;
  }

  const isPriv = isNotificationPersonPrivate(n, state);
  const actionPhrase =
    n.kind === 'request_accepted'
      ? 'accepted your request'
      : n.title?.replace(n.name, '').trim() || 'updated their schedule';

  return `
    <div
      class="card card-pad row"
      style="padding:12px 14px; cursor:pointer;"
      data-action="mark-notification-read"
      data-notif-id="${escapeHtml(n.id)}"
    >
      ${renderAvatar({ initials: n.initials, avatarClass: n.avatarClass })}
      <div class="row-body">
        <div class="row-title">
          ${escapeHtml(n.name)}
          <span style="font-weight:500; color:#5A6862;">
            ${escapeHtml(actionPhrase)}
          </span>
        </div>
        <div class="row-sub">${escapeHtml(n.detail || '')} · ${escapeHtml(n.relativeTime)}</div>
      </div>
      ${n.unread ? `<span style="width:8px; height:8px; border-radius:50%; background:#1FB86B; flex-shrink:0;" aria-label="Unread"></span>` : ''}
      ${
        !isPriv
          ? `
            <button
              type="button"
              class="section-action"
              data-action="open-friend-schedule"
              data-friend-id="${escapeHtml(n.personId)}"
            >View</button>
          `
          : ''
      }
    </div>
  `;
}

function renderYesterdayRow(n, state) {
  const isPriv = isNotificationPersonPrivate(n, state);
  const actionPhrase = n.title?.replace(n.name, '').trim() || 'updated their schedule';

  return `
    <div
      class="row"
      style="${isPriv ? 'opacity:0.78;' : ''}"
      data-action="mark-notification-read"
      data-notif-id="${escapeHtml(n.id)}"
    >
      ${renderAvatar({ initials: n.initials, avatarClass: n.avatarClass })}
      <div class="row-body">
        <div class="row-title">
          ${escapeHtml(n.name)}
          <span style="font-weight:500; color:#5A6862;">${escapeHtml(actionPhrase)}</span>
        </div>
        <div class="row-sub">${escapeHtml(n.detail || '')}</div>
      </div>
      ${
        !isPriv
          ? `
            <button
              type="button"
              class="section-action"
              data-action="open-friend-schedule"
              data-friend-id="${escapeHtml(n.personId)}"
            >View</button>
          `
          : ''
      }
    </div>
  `;
}

function renderInboxEmptyState(filter = 'All', unreadCount = 0) {
  return `
    <div class="screen-scroll no-nav" data-screen-id="18">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>
      </div>
      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Inbox</h1>
      </div>
      <div class="chip-row">
        <button type="button" class="chip ${filter === 'All' ? 'active' : ''}" data-action="set-inbox-filter" data-filter="All">All</button>
        <button type="button" class="chip ${filter === 'Unread' ? 'active' : ''}" data-action="set-inbox-filter" data-filter="Unread">Unread · ${unreadCount}</button>
      </div>
      <div class="stack-gap" style="margin-top:32px;">
        <div class="card card-pad empty-state-box">
          <div class="empty-illus">${ICONS.bell}</div>
          <h2 class="dialog-title">All caught up</h2>
          <p class="dialog-copy">Friend requests and schedule updates from your groups will show up here.</p>
        </div>
      </div>
    </div>
  `;
}

function renderInboxLoadingState() {
  return `
    <div class="screen-scroll no-nav" data-screen-id="19" aria-busy="true" aria-label="Loading notifications">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">${ICONS.back} <span>Back</span></button>
      </div>
      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Inbox</h1>
      </div>
      <div class="chip-row">
        <button type="button" class="chip active">All</button>
        <button type="button" class="chip">Unread</button>
      </div>
      <div class="stack-gap">
        <div class="card card-pad">
          <div class="row" style="border:none;">
            <div class="sk-circle"></div>
            <div class="row-body">
              <div class="sk-line w60"></div>
              <div class="sk-line w40"></div>
            </div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;">
            <div class="sk-pill" style="width:100%; height:44px;"></div>
            <div class="sk-pill" style="width:100%; height:44px;"></div>
          </div>
        </div>
        <div class="card card-pad row">
          <div class="sk-circle"></div>
          <div class="row-body">
            <div class="sk-line w80"></div>
            <div class="sk-line w40" style="margin:0;"></div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderInboxErrorState() {
  return `
    <div class="screen-scroll no-nav" data-screen-id="20">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">${ICONS.back} <span>Back</span></button>
      </div>
      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Inbox</h1>
      </div>
      <div class="stack-gap" style="margin-top:32px;">
        <div class="card card-pad empty-state-box">
          <div class="dialog-icon-circle">${ICONS.alert}</div>
          <h2 class="dialog-title">Couldn't load notifications</h2>
          <p class="dialog-copy">You appear to be offline. Check your connection and try again.</p>
          <button type="button" class="btn-primary" style="width:140px;" data-action="retry-inbox-load">Retry</button>
        </div>
      </div>
    </div>
  `;
}
