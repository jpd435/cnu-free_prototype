/* ==========================================================================
   CNU FREE V2 — SCREEN 30 (ME HUB), SCREEN 15 (NOTIFICATION SETTINGS)
   & SCREEN 39 (BLOCKED PEOPLE)
   (src/screens/me.js)
   Section 6.6:
   - Screen 30: profile header -> 16; My week -> 8; Add a class -> 9;
     Import from photo -> 28; Who sees my schedule -> 5; Share links -> 14;
     Notifications -> 15; Blocked people -> 39; Delete account -> 31; Sign out -> 17.
   - Screen 15: toggles save instantly; per-group toggles disabled when
     "Friends' schedule updates" is off.
   - Screen 39 (NEW): Blocked people list, each with Unblock;
     empty state: "You haven't blocked anyone."
   ========================================================================== */

import { ICONS } from '../ui/icons.js';
import { renderAvatar, escapeHtml } from '../ui/avatar.js';
import { now, status } from '../time.js';
import { selectFriendsAvailability, selectActiveShareLinks } from '../store.js';

export function renderMeScreen(state) {
  const currentNow = now();
  const userSt = status(state.user, currentNow, 'self', state.groups);
  const avail = selectFriendsAvailability(state, currentNow, 'All');
  const activeLinks = selectActiveShareLinks(state, currentNow);
  const classCount = (state.user.entries || []).length;
  const blockedCount = (state.blockedPeople || []).length;

  const audienceLabel =
    state.user.privacyConfig?.globalAudience === 'only_me'
      ? 'Only me'
      : state.user.privacyConfig?.globalAudience === 'selected'
      ? 'Selected friends'
      : 'Friends · Free or busy';

  const notifSummary = [
    state.notificationSettings?.newRequests ? 'Requests' : null,
    state.notificationSettings?.scheduleUpdates ? 'updates' : null
  ]
    .filter(Boolean)
    .join(', ') || 'Off';

  return `
    <div class="screen-scroll" data-screen-id="30">
      <div class="top-bar" style="padding-bottom:2px;">
        <span class="meta-label">YOUR PROFILE &amp; SETTINGS</span>
      </div>

      <div style="padding:0 16px 10px;">
        <h1 class="display-xl">Me</h1>
      </div>

      <div class="stack-gap">
        <!-- Profile Header Card -> Sheet 16 -->
        <button
          type="button"
          class="card card-pad"
          style="text-align:left; cursor:pointer; border:none;"
          data-action="open-edit-profile-sheet"
        >
          <div class="row" style="padding:0 0 12px; border-bottom:1px solid var(--divider);">
            ${renderAvatar({ initials: state.user.initials, avatarClass: state.user.avatarClass, size: 'lg' })}
            <div class="row-body">
              <div style="font-family:var(--font-display); font-size:20px; font-weight:800;">${escapeHtml(state.user.name)}</div>
              <div class="row-sub">@${escapeHtml(state.user.username)} · ${state.friends.length} friends · ${(state.groups || []).length} groups</div>
            </div>
            <span class="section-action">Edit</span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding-top:12px;">
            <span class="${userSt.state === 'free' ? 'pill-free-soft' : 'pill-busy'}">
              ${
                userSt.state === 'free'
                  ? `FREE NOW · ${escapeHtml(userSt.untilCopy.toUpperCase())}`
                  : `BUSY · UNTIL ${escapeHtml(userSt.untilFormatted || '12:00 PM')}`
              }
            </span>
            <span style="font-size:12px; color:#5A6862; font-weight:700;">Sem 1 · ${classCount} ${classCount === 1 ? 'class' : 'classes'}</span>
          </div>
        </button>

        <!-- MY SCHEDULE -->
        <div>
          <div class="section-header" style="margin-top:0;"><span class="section-label">MY SCHEDULE</span></div>
          <div class="card card-pad" style="padding:4px 16px;">
            <button type="button" class="row" style="width:100%; background:none; border:none; text-align:left; cursor:pointer;" data-action="open-my-week">
              <div class="avatar avatar-sm av-mint" style="color:#073D22;">${ICONS.calendar}</div>
              <div class="row-body">
                <div class="row-title">My week</div>
                <div class="row-sub">${classCount} classes · Oct 26 – Nov 1</div>
              </div>
              <span style="color:#5A6862;">${ICONS.chevronRight}</span>
            </button>

            <button type="button" class="row" style="width:100%; background:none; border:none; text-align:left; cursor:pointer;" data-action="open-add-class" data-return-to="8">
              <div class="avatar avatar-sm" style="background:#EEF1EF; color:#0B1B16;">${ICONS.plus}</div>
              <div class="row-body">
                <div class="row-title">Add a class</div>
                <div class="row-sub">Enter time and days manually</div>
              </div>
              <span style="color:#5A6862;">${ICONS.chevronRight}</span>
            </button>

            <button type="button" class="row" style="width:100%; background:none; border:none; text-align:left; cursor:pointer;" data-action="open-import-timetable">
              <div class="avatar avatar-sm av-gold" style="color:#5C3A00;">${ICONS.camera}</div>
              <div class="row-body">
                <div class="row-title">Import from photo</div>
                <div class="row-sub">Scan a screenshot of your timetable</div>
              </div>
              <span style="color:#5A6862;">${ICONS.chevronRight}</span>
            </button>
          </div>
        </div>

        <!-- PRIVACY & SHARING -->
        <div>
          <div class="section-header" style="margin-top:0;"><span class="section-label">PRIVACY &amp; SHARING</span></div>
          <div class="card card-pad" style="padding:4px 16px;">
            <button type="button" class="row" style="width:100%; background:none; border:none; text-align:left; cursor:pointer;" data-action="open-privacy-sharing">
              <div class="avatar avatar-sm av-lavender" style="color:#36266E;">${ICONS.shield}</div>
              <div class="row-body">
                <div class="row-title">Who sees my schedule</div>
                <div class="row-sub">${escapeHtml(audienceLabel)}</div>
              </div>
              <span style="color:#5A6862;">${ICONS.chevronRight}</span>
            </button>

            <button type="button" class="row" style="width:100%; background:none; border:none; text-align:left; cursor:pointer;" data-action="open-share-link-sheet">
              <div class="avatar avatar-sm av-mint" style="color:#073D22;">${ICONS.share}</div>
              <div class="row-body">
                <div class="row-title">Share links</div>
                <div class="row-sub">${activeLinks.length} active${activeLinks[0] ? ` · cnufree.com/s/${escapeHtml(activeLinks[0].id)}` : ''}</div>
              </div>
              <span style="color:#5A6862;">${ICONS.chevronRight}</span>
            </button>
          </div>
        </div>

        <!-- PREFERENCES -->
        <div>
          <div class="section-header" style="margin-top:0;"><span class="section-label">PREFERENCES</span></div>
          <div class="card card-pad" style="padding:4px 16px;">
            <button type="button" class="row" style="width:100%; background:none; border:none; text-align:left; cursor:pointer;" data-action="open-notification-settings">
              <div class="avatar avatar-sm av-peach" style="color:#5A2310;">${ICONS.bell}</div>
              <div class="row-body">
                <div class="row-title">Notifications</div>
                <div class="row-sub">${escapeHtml(notifSummary)}</div>
              </div>
              <span style="color:#5A6862;">${ICONS.chevronRight}</span>
            </button>

            <button type="button" class="row" style="width:100%; background:none; border:none; text-align:left; cursor:pointer;" data-action="open-blocked-people">
              <div class="avatar avatar-sm" style="background:#EEF1EF; color:#3E4B45;">${ICONS.block}</div>
              <div class="row-body">
                <div class="row-title">Blocked people</div>
                <div class="row-sub">${blockedCount === 0 ? 'None' : `${blockedCount} blocked`}</div>
              </div>
              <span style="color:#5A6862;">${ICONS.chevronRight}</span>
            </button>
          </div>
        </div>

        <!-- ACCOUNT -->
        <div>
          <div class="section-header" style="margin-top:0;"><span class="section-label">ACCOUNT</span></div>
          <div class="card card-pad" style="padding:4px 16px;">
            <button type="button" class="row" style="width:100%; background:none; border:none; text-align:left; cursor:pointer;" data-action="open-delete-account-dialog">
              <div class="avatar avatar-sm" style="background:#FDE4E4; color:#B3261E;">${ICONS.trash}</div>
              <div class="row-body">
                <div class="row-title" style="color:#B3261E;">Delete account</div>
              </div>
              <span style="color:#B3261E;">${ICONS.chevronRight}</span>
            </button>

            <button type="button" class="row" style="width:100%; background:none; border:none; text-align:left; cursor:pointer;" data-action="open-sign-out-dialog">
              <div class="avatar avatar-sm" style="background:#FDE4E4; color:#B3261E;">${ICONS.signout}</div>
              <div class="row-body">
                <div class="row-title" style="color:#B3261E;">Sign out</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Screen 15: Notification Settings (Section 6.6)
 */
export function renderNotificationSettingsScreen(state) {
  const ns = state.notificationSettings || {
    newRequests: true,
    requestAccepted: true,
    scheduleUpdates: true
  };
  const groupTogglesDisabled = !ns.scheduleUpdates;

  return `
    <div class="screen-scroll" data-screen-id="15">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>
      </div>

      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Notifications</h1>
        <p class="body-copy">Only things that help you meet up. No marketing, no streaks.</p>
      </div>

      <div class="stack-gap">
        <div class="section-header" style="margin-top:4px;"><span class="section-label">FRIEND REQUESTS</span></div>
        <div class="card card-pad" style="padding:4px 16px;">
          <label class="row" style="cursor:pointer;">
            <div class="row-body">
              <div class="row-title">New friend requests</div>
              <div class="row-sub">When someone wants to connect</div>
            </div>
            <input
              type="checkbox"
              class="toggle-switch"
              data-action="toggle-notif-setting"
              data-key="newRequests"
              ${ns.newRequests ? 'checked' : ''}
            />
          </label>
          <label class="row" style="cursor:pointer;">
            <div class="row-body">
              <div class="row-title">Request accepted</div>
              <div class="row-sub">When someone accepts your request</div>
            </div>
            <input
              type="checkbox"
              class="toggle-switch"
              data-action="toggle-notif-setting"
              data-key="requestAccepted"
              ${ns.requestAccepted ? 'checked' : ''}
            />
          </label>
        </div>

        <div class="section-header"><span class="section-label">SCHEDULES</span></div>
        <div class="card card-pad" style="padding:4px 16px;">
          <label class="row" style="cursor:pointer;">
            <div class="row-body">
              <div class="row-title">Friends' schedule updates</div>
              <div class="row-sub">When a friend edits their timetable</div>
            </div>
            <input
              type="checkbox"
              class="toggle-switch"
              data-action="toggle-notif-setting"
              data-key="scheduleUpdates"
              ${ns.scheduleUpdates ? 'checked' : ''}
            />
          </label>
        </div>

        <div class="section-header"><span class="section-label">BY GROUP</span></div>
        <div class="card card-pad" style="padding:4px 16px; ${groupTogglesDisabled ? 'opacity:0.55;' : ''}">
          ${(state.groups || [])
            .map(
              (g) => `
                <label class="row" style="cursor:${groupTogglesDisabled ? 'not-allowed' : 'pointer'};">
                  ${renderAvatar({ initials: g.initials, avatarClass: g.avatarClass || 'av-mint' })}
                  <div class="row-body">
                    <div class="row-title">${escapeHtml(g.name)}</div>
                    <div class="row-sub">${g.memberIds.length} members</div>
                  </div>
                  <input
                    type="checkbox"
                    class="toggle-switch"
                    data-action="toggle-notif-setting"
                    data-group-id="${escapeHtml(g.id)}"
                    ${g.notificationsEnabled && !groupTogglesDisabled ? 'checked' : ''}
                    ${groupTogglesDisabled ? 'disabled' : ''}
                  />
                </label>
              `
            )
            .join('')}
        </div>
      </div>
    </div>
  `;
}

/**
 * Screen 39 (NEW in SPEC V2): Blocked People
 * Section 6.6:
 * - Blocked people list, each with Unblock.
 * - Empty state: "You haven't blocked anyone."
 */
export function renderBlockedPeopleScreen(state) {
  const blocked = state.blockedPeople || [];

  return `
    <div class="screen-scroll" data-screen-id="39">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>
      </div>

      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Blocked people</h1>
        <p class="body-copy">Blocked people cannot find your profile, send requests, or see your schedule.</p>
      </div>

      <div class="stack-gap">
        ${
          blocked.length === 0
            ? `
              <div class="card card-pad empty-state-box" style="margin-top:24px;">
                <div class="empty-illus">${ICONS.block}</div>
                <h2 class="dialog-title">You haven't blocked anyone.</h2>
                <p class="dialog-copy">Anyone you block from Friends or Inbox will be listed here in case you want to unblock them.</p>
              </div>
            `
            : `
              <div class="card card-pad" style="padding:4px 14px;">
                ${blocked
                  .map(
                    (person) => `
                      <div class="row">
                        ${renderAvatar({ initials: person.initials || 'U', avatarClass: person.avatarClass || 'av-lavender' })}
                        <div class="row-body">
                          <div class="row-title">${escapeHtml(person.name)}</div>
                          <div class="row-sub">@${escapeHtml(person.username)}</div>
                        </div>
                        <button
                          type="button"
                          class="pill-btn-ink"
                          data-action="unblock-user"
                          data-person-id="${escapeHtml(person.id)}"
                        >Unblock</button>
                      </div>
                    `
                  )
                  .join('')}
              </div>
            `
        }
      </div>
    </div>
  `;
}
