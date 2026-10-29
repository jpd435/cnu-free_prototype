/**
 * CNU Free — Screen 11 (Find Friends) & Screen 32 (Friend Requests) (SPEC V2 §6.5 + Addendum B §2)
 * - Searchable non-friends: Mika Reyes (2 mutual), Paolo Cruz (no mutual).
 * - Typing "mi" finds Mika, "pa" finds Paolo.
 * - Incoming requests: Kristine (3 mutual, 2m), Marco (3 mutual, 15m).
 * - Accepting Kristine or Marco adds them as friends with an empty-state schedule ("No timetable yet").
 */

import { ICONS } from '../ui/icons.js';
import { renderAvatar, escapeHtml } from '../ui/avatar.js';
import { selectFindFriendsResults } from '../store.js';

export function renderFindFriendsScreen(state) {
  const query = state.ui.findFriendsQuery !== undefined ? state.ui.findFriendsQuery : '';
  const results = selectFindFriendsResults(state, query);
  const sentCount = (state.outgoingRequests || []).length;

  return `
    <div class="screen-scroll" data-screen-id="11">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>
      </div>

      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Find friends</h1>
      </div>

      <div class="stack-gap">
        <div class="search-wrap" style="padding:0 16px;">
          <span class="search-icon" style="left:30px;">${ICONS.search}</span>
          <input
            type="text"
            class="search-input"
            value="${escapeHtml(query)}"
            placeholder="Search name or @username"
            aria-label="Search people"
            data-field="find-friends-query"
          />
          <button
            type="button"
            class="search-clear"
            style="right:20px;"
            aria-label="Clear search"
            data-action="clear-find-friends-query"
          >${ICONS.close}</button>
        </div>

        <div class="section-header" style="margin-top:0;">
          <span class="section-label">RESULTS · ${results.length}</span>
        </div>

        ${
          results.length === 0
            ? `
              <div class="card card-pad empty-state-box">
                <div class="empty-illus">${ICONS.users}</div>
                <h2 class="dialog-title">No people found</h2>
                <p class="dialog-copy">No one matches "${escapeHtml(query)}". Invite your friend directly so you can compare schedules.</p>
                <button type="button" class="btn-primary" data-action="share-invite-link">Share your invite link</button>
              </div>
            `
            : `
              <div class="card card-pad" style="padding:4px 14px;">
                ${results
                  .map((person) => {
                    const subText =
                      person.mutualCount > 0
                        ? `@${person.username} · ${person.mutualCount} mutual friends`
                        : `@${person.username} · No mutual friends`;

                    let actionHtml = '';
                    if (person.relationship === 'friends') {
                      actionHtml = `<span class="pill-free-soft">Friends</span>`;
                    } else if (person.relationship === 'outgoing_pending') {
                      actionHtml = `
                        <button
                          type="button"
                          class="pill-pending"
                          style="cursor:pointer;"
                          data-action="open-cancel-pending-sheet"
                          data-person-id="${escapeHtml(person.id)}"
                        >${ICONS.check} Pending</button>
                      `;
                    } else if (person.relationship === 'incoming_pending') {
                      actionHtml = `
                        <button
                          type="button"
                          class="pill-btn-ink"
                          data-action="accept-friend-request"
                          data-person-id="${escapeHtml(person.id)}"
                        >Accept</button>
                      `;
                    } else {
                      actionHtml = `
                        <button
                          type="button"
                          class="pill-btn-ink"
                          data-action="send-friend-request"
                          data-person-id="${escapeHtml(person.id)}"
                        >Add friend</button>
                      `;
                    }

                    return `
                      <div class="row">
                        ${renderAvatar({ initials: person.initials, avatarClass: person.avatarClass })}
                        <div class="row-body">
                          <div class="row-title">${escapeHtml(person.name)}</div>
                          <div class="row-sub">${escapeHtml(subText)}</div>
                        </div>
                        ${actionHtml}
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            `
        }

        <div style="text-align:center; padding-top:8px;">
          <button
            type="button"
            class="section-action"
            style="font-size:13px;"
            data-action="open-requests-sent"
          >View sent requests (${sentCount}) →</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Screen 32: Friend Requests (Received / Sent)
 */
export function renderRequestsScreen(state) {
  const rawTab = state.ui.requestsTab || 'Received';
  const isReceived = rawTab.toLowerCase() !== 'sent';
  const incoming = state.incomingRequests || [];
  const connected = state.connectedRequestCards || [];
  const outgoing = state.outgoingRequests || [];

  return `
    <div class="screen-scroll no-nav" data-screen-id="32">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>
      </div>

      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Requests</h1>
      </div>

      <div class="stack-gap">
        <div style="padding:0 16px;">
          <div class="seg-group" style="width:100%;" role="tablist" aria-label="Requests tabs">
            <button
              type="button"
              class="seg-btn ${isReceived ? 'active' : ''}"
              style="flex:1;"
              data-action="set-requests-tab"
              data-tab="Received"
              aria-selected="${isReceived}"
            >Received · ${incoming.length}</button>
            <button
              type="button"
              class="seg-btn ${!isReceived ? 'active' : ''}"
              style="flex:1;"
              data-action="set-requests-tab"
              data-tab="Sent"
              aria-selected="${!isReceived}"
            >Sent · ${outgoing.length}</button>
          </div>
        </div>

        ${
          isReceived
            ? `
              ${incoming
                .map(
                  (req) => `
                    <div class="card card-pad">
                      <div class="row" style="padding:0 0 10px; border:none;">
                        ${renderAvatar({ initials: req.initials, avatarClass: req.avatarClass })}
                        <div class="row-body">
                          <div class="row-title">${escapeHtml(req.name)}</div>
                          <div class="row-sub">@${escapeHtml(req.username)} · ${req.mutualCount || 3} mutual friends · ${escapeHtml(req.timeAgo || '2m')}</div>
                        </div>
                      </div>
                      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
                        <button
                          type="button"
                          class="btn-primary"
                          style="min-height:44px; font-size:13px;"
                          data-action="accept-friend-request"
                          data-person-id="${escapeHtml(req.id)}"
                        >Accept</button>
                        <button
                          type="button"
                          class="btn-secondary"
                          style="min-height:44px; font-size:13px; background:#E8ECEA; border-radius:999px;"
                          data-action="decline-friend-request"
                          data-person-id="${escapeHtml(req.id)}"
                        >Decline</button>
                      </div>
                    </div>
                  `
                )
                .join('')}

              ${
                incoming.length === 0 && connected.length === 0
                  ? `
                    <div class="card card-pad empty-state-box">
                      <div class="row-title">No pending requests</div>
                      <div class="row-sub">When someone adds you, their request will appear here.</div>
                    </div>
                  `
                  : ''
              }

              ${connected
                .map(
                  (c) => `
                    <div class="card card-pad row" style="padding:12px 14px; background:#D5F5E3; border:1.5px solid #1FB86B;">
                      <div class="avatar avatar-sm" style="background:#0B5A33; color:#FFF;">${ICONS.check}</div>
                      <div class="row-body">
                        <div class="row-title" style="color:#073D22;">You and ${escapeHtml(c.firstName)} are now friends</div>
                        <div class="row-sub" style="color:#0B5A33;">Added to your Friends list · No timetable yet</div>
                      </div>
                      <button
                        type="button"
                        class="section-action"
                        style="color:#073D22;"
                        data-action="open-friend-schedule"
                        data-friend-id="${escapeHtml(c.personId)}"
                      >View →</button>
                    </div>
                  `
                )
                .join('')}
            `
            : `
              <!-- Sent Tab -->
              ${
                outgoing.length === 0
                  ? `
                    <div class="card card-pad empty-state-box">
                      <div class="row-title">No sent requests</div>
                      <div class="row-sub">People you add will appear here while pending.</div>
                    </div>
                  `
                  : `
                    <div class="card card-pad" style="padding:4px 14px;">
                      ${outgoing
                        .map(
                          (req) => `
                            <div class="row">
                              ${renderAvatar({ initials: req.initials, avatarClass: req.avatarClass })}
                              <div class="row-body">
                                <div class="row-title">${escapeHtml(req.name)}</div>
                                <div class="row-sub">@${escapeHtml(req.username)} · Sent pending</div>
                              </div>
                              <button
                                type="button"
                                class="btn-link-danger"
                                data-action="confirm-cancel-request"
                                data-person-id="${escapeHtml(req.id)}"
                              >Cancel request</button>
                            </div>
                          `
                        )
                        .join('')}
                    </div>
                  `
              }
            `
        }
      </div>
    </div>
  `;
}
