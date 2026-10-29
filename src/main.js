/* ==========================================================================
   CNU FREE V2 — APPLICATION BOOT, EVENT CONTROLLER, LIVE CLOCK & DEV MENU (src/main.js)
   Section 3, Section 5, Section 6, Section 9 & Addendum B:
   - Self-hosted @fontsource Bricolage Grotesque (700, 800) & Manrope (500, 700, 800)
   - Real-time live clock engine (src/clock.js) with minute + class boundary timers,
     in-place re-rendering preserving scroll & open sheets, and 200ms status crossfade
   - Scrollable 7:00–21:00 timelines that auto-scroll to ~1h before current time
   - Complete Section 6 navigation wiring, haptics, Undo toasts, focus trap,
     Esc close, left-edge swipe back (<= 20px), and drag-to-dismiss sheets.
   ========================================================================== */

import '@fontsource/bricolage-grotesque/700.css';
import '@fontsource/bricolage-grotesque/800.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/700.css';
import '@fontsource/manrope/800.css';
import './styles.css';

import {
  repo,
  selectFriendsAvailability,
  selectNowBestWindow,
  selectOverlapViewData
} from './store.js';
import {
  SCREEN_META,
  configureRouter,
  getRouterState,
  getActiveScreenId,
  switchTab,
  pushScreen,
  popScreen,
  openOverlay,
  closeOverlay,
  resetStacksTo,
  jumpToView
} from './router.js';
import { renderAppViewport, renderBaseScreenContent } from './screens/index.js';
import { isTabBarVisible, renderTabBar } from './ui/tabbar.js';
import {
  configureToastRenderer,
  showToast,
  triggerToastUndo
} from './ui/toast.js';
import { trapFocusInModal } from './ui/dialog.js';
import { runMockOcr, cancelPendingOcr } from './ocr-mock.js';
import {
  now,
  status,
  DAY_WINDOW_START,
  DAY_WINDOW_END
} from './time.js';
import {
  initClockEngine,
  subscribeClock,
  scheduleBoundaryTimer,
  setClockLive,
  setClockPreset,
  setClockSpeed,
  getClockState
} from './clock.js';
import {
  initNativeShell,
  isMobileViewportOrNative,
  haptics,
  copyToClipboard,
  shareInviteLink,
  pickTimetablePhoto
} from './native.js';

let _findFriendsDebounce = null;
let _usernameDebounce = null;
let _ocrAbortController = null;
let _isGridMode = false;
let _lastStatusByPerson = new Map();
let _lastAutoScrollKey = '';

function collectAllSchedules() {
  const st = repo.getState();
  return [st.user, ...(st.friends || [])].filter(Boolean);
}

function capturePersonStatuses(state, currentNow) {
  const map = new Map();
  if (state.user) {
    const uSt = status(state.user, currentNow, 'self', state.groups);
    map.set(state.user.id, uSt.state);
  }
  for (const f of state.friends || []) {
    const fSt = status(f, currentNow, state.user?.id || 'francis', state.groups);
    map.set(f.id, fSt.state);
  }
  return map;
}

export function bootApp() {
  const phoneFrame = document.getElementById('phoneFrame');
  if (!phoneFrame) return;

  // Apply mobile full-screen class when inside Capacitor or viewport <= 480px (Section 5)
  const updateViewportMode = () => {
    const fullScreen = isMobileViewportOrNative();
    document.documentElement.classList.toggle('native', fullScreen);
    document.body.classList.toggle('native-fullscreen', fullScreen);
  };
  updateViewportMode();
  window.addEventListener('resize', updateViewportMode);

  // Start real-time live clock engine (Addendum B §4)
  initClockEngine();

  // Check URL hash for #/s/[linkId] public share route (Section 6.6)
  checkHashRoute();
  window.addEventListener('hashchange', checkHashRoute);

  // Configure router & store listeners
  configureRouter(() => {
    renderCurrentScreen({ preserveTimelineScroll: false });
    syncDevToolbarUI();
  });

  configureToastRenderer(() => {
    renderCurrentScreen({ preserveTimelineScroll: true });
  });

  repo.subscribe(() => {
    scheduleBoundaryTimer(collectAllSchedules);
    syncDevPrivateDropdown();
    if (_isGridMode) {
      renderAllScreensGrid();
    }
  });

  // Subscribe to live clock ticks (every minute boundary + exact class start/end boundary)
  subscribeClock(() => {
    scheduleBoundaryTimer(collectAllSchedules);
    renderCurrentScreen({ preserveTimelineScroll: true, isClockTick: true });
    syncDevClockReadout();
    if (_isGridMode) {
      renderAllScreensGrid();
    }
  });

  // Launch logic (Section 6.1: no session -> 26; session and zero classes -> 28; otherwise -> 1)
  const initialState = repo.getState();
  _lastStatusByPerson = capturePersonStatuses(initialState, now());
  scheduleBoundaryTimer(collectAllSchedules);

  if (!window.location.hash.startsWith('#/s/')) {
    if (!initialState.session.loggedIn) {
      resetStacksTo('26');
    } else if ((initialState.user.entries || []).length === 0) {
      repo.dispatch('SET_UI', {});
      resetStacksTo('28');
    } else {
      resetStacksTo('1');
    }
  }

  // Hydrate async Capacitor Preferences if running on native iOS
  repo.hydrateFromNativeStorage().then(() => {
    scheduleBoundaryTimer(collectAllSchedules);
    renderCurrentScreen({ preserveTimelineScroll: false });
  });

  // Initialize Capacitor native plugins (StatusBar, Keyboard, SplashScreen, App backButton)
  initNativeShell(() => {
    popScreen();
  });

  // Setup Dev Switcher Toolbar (desktop or ?dev=1)
  initDevToolbar();

  // Setup delegated click, input, change, keyboard, and touch handlers
  bindAppEvents(phoneFrame);

  // Initial render
  renderCurrentScreen({ preserveTimelineScroll: false });
  syncDevToolbarUI();
  syncDevClockReadout();

  // Expose programmatic helpers for Playwright E2E and Dev Inspector
  window.navigateToScreen = (id) => {
    jumpToView(id);
  };
  window.CNUFreeRepo = repo;
  window.CNUFreeClock = {
    setClockLive,
    setClockPreset,
    setClockSpeed,
    getClockState,
    now
  };
}

function checkHashRoute() {
  const hash = window.location.hash || '';
  if (hash.startsWith('#/s/')) {
    const linkId = hash.slice(4).trim();
    if (linkId) {
      repo.dispatch('SET_UI', { activeShareLinkId: linkId, sharePreviewMode: false });
      jumpToView('38');
    }
  }
}

function renderCurrentScreen(options = {}) {
  const { preserveTimelineScroll = true, isClockTick = false } = options;
  const phoneFrame = document.getElementById('phoneFrame');
  if (!phoneFrame) return;

  // 1. Preserve focused input cursor position across re-renders
  const activeEl = document.activeElement;
  const activeField = activeEl?.getAttribute?.('data-field') || null;
  const selectionStart = activeEl?.selectionStart ?? null;
  const selectionEnd = activeEl?.selectionEnd ?? null;

  // 2. Preserve scroll positions (.screen-scroll, .timeline-scroll, .sheet-card)
  const prevScreenScrollEl = phoneFrame.querySelector('.screen-scroll');
  const prevScreenId = prevScreenScrollEl?.getAttribute('data-screen-id') || null;
  const prevScreenScrollTop = prevScreenScrollEl ? prevScreenScrollEl.scrollTop : 0;

  const prevSheetEl = phoneFrame.querySelector('.sheet-card');
  const prevSheetScrollTop = prevSheetEl ? prevSheetEl.scrollTop : 0;

  const prevTimelineScrollMap = new Map();
  phoneFrame.querySelectorAll('[data-timeline-scroll]').forEach((el) => {
    const key = el.getAttribute('data-timeline-scroll');
    if (key) prevTimelineScrollMap.set(key, el.scrollTop);
  });

  const routerState = getRouterState();
  const state = repo.getState();
  const activeScreenId = getActiveScreenId();
  const currentNow = now();

  // Detect any Free <-> Busy status flips for 200ms crossfade (Addendum B §4)
  const newStatusMap = capturePersonStatuses(state, currentNow);
  const flippedIds = new Set();
  if (isClockTick) {
    for (const [pid, newSt] of newStatusMap.entries()) {
      const oldSt = _lastStatusByPerson.get(pid);
      if (oldSt && oldSt !== newSt) {
        flippedIds.add(pid);
      }
    }
  }
  _lastStatusByPerson = newStatusMap;

  // Render HTML into phone frame
  const renderHtml = renderAppViewport(routerState, state, activeScreenId);
  // Suppress slide animation on in-place clock ticks so screen doesn't slide every minute
  phoneFrame.innerHTML = isClockTick
    ? renderHtml.replace(/class="screen-stage (anim-push|anim-pop)"/, 'class="screen-stage"')
    : renderHtml;

  // Apply 200ms crossfade class on flipped status pills
  if (flippedIds.size > 0) {
    flippedIds.forEach((pid) => {
      const rowEls = phoneFrame.querySelectorAll(`[data-person-status="${pid}"] [data-status-pill]`);
      rowEls.forEach((pill) => pill.classList.add('pill-flipped'));
    });
  }

  // 3. Restore scroll positions or auto-scroll timelines on first view
  const newScreenScrollEl = phoneFrame.querySelector('.screen-scroll');
  const newScreenId = newScreenScrollEl?.getAttribute('data-screen-id') || null;
  if (newScreenScrollEl && prevScreenId === newScreenId) {
    newScreenScrollEl.scrollTop = prevScreenScrollTop;
  }

  const newSheetEl = phoneFrame.querySelector('.sheet-card');
  if (newSheetEl && prevSheetScrollTop > 0) {
    newSheetEl.scrollTop = prevSheetScrollTop;
  }

  const autoScrollKey = `${newScreenId}:${state.ui.overlapDayIndex ?? ''}:${state.ui.friendScheduleDayIndex ?? ''}:${state.ui.myScheduleDayIndex ?? ''}:${state.ui.activeFriendId ?? ''}`;
  const shouldAutoScrollTimeline = !preserveTimelineScroll || _lastAutoScrollKey !== autoScrollKey;
  _lastAutoScrollKey = autoScrollKey;

  phoneFrame.querySelectorAll('[data-timeline-scroll]').forEach((el) => {
    const key = el.getAttribute('data-timeline-scroll');
    if (!shouldAutoScrollTimeline && key && prevTimelineScrollMap.has(key)) {
      el.scrollTop = prevTimelineScrollMap.get(key);
    } else {
      // Addendum B §3: Auto-scroll so current time is ~1h from top (or 7:00 if now is outside 7–21)
      const inner = el.firstElementChild;
      const totalHeight = inner ? inner.scrollHeight || inner.clientHeight || 640 : 640;
      const targetMin =
        currentNow.minutes >= DAY_WINDOW_START && currentNow.minutes <= DAY_WINDOW_END
          ? Math.max(DAY_WINDOW_START, currentNow.minutes - 60)
          : DAY_WINDOW_START;
      const ratio = (targetMin - DAY_WINDOW_START) / (DAY_WINDOW_END - DAY_WINDOW_START);
      el.scrollTop = Math.max(0, Math.round(ratio * totalHeight));
    }
  });

  // 4. Restore input focus if user was typing
  if (activeField) {
    const restored = phoneFrame.querySelector(`[data-field="${activeField}"]`);
    if (restored) {
      restored.focus();
      try {
        if (typeof selectionStart === 'number' && restored.setSelectionRange) {
          restored.setSelectionRange(selectionStart, selectionEnd);
        }
      } catch (_e) {}
    }
  } else if (routerState.overlay && !isClockTick) {
    const dialogEl = phoneFrame.querySelector('[role="dialog"]');
    if (dialogEl && !dialogEl.contains(document.activeElement)) {
      const firstBtn = dialogEl.querySelector('input, button');
      if (firstBtn) {
        try {
          firstBtn.focus({ preventScroll: true });
        } catch (_e) {}
      }
    }
  }

  // 5. If returning to 8 or 37 after saving a class, scroll to that class block (Section 6.6)
  if (!isClockTick && (activeScreenId === '8' || activeScreenId === '37') && state.ui.highlightClassId) {
    const blockEl = phoneFrame.querySelector(`[data-class-id="${state.ui.highlightClassId}"]`);
    if (blockEl && typeof blockEl.scrollIntoView === 'function') {
      try {
        blockEl.scrollIntoView({ block: 'center', behavior: 'smooth' });
      } catch (_e) {}
    }
  }
}

/* ==========================================================================
   DELEGATED INTERACTION ENGINE (Section 6 Canonical Connections)
   ========================================================================== */

function bindAppEvents(phoneFrame) {
  // 1. Click delegation
  phoneFrame.addEventListener('click', async (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    // Stop propagation if clicking an inner action inside a clickable card/row
    e.stopPropagation();

    const action = actionEl.getAttribute('data-action');
    const state = repo.getState();

    switch (action) {
      /* --- Navigation & Tab Bar --- */
      case 'switch-tab': {
        const tab = actionEl.getAttribute('data-tab');
        haptics.light();
        // Section 6.5: Friends 400ms loading skeleton on first visit
        if (tab === 'Friends' && !state.ui.friendsVisitedOnce) {
          repo.dispatch('SET_UI', { friendsVisitedOnce: true, friendsViewState: 'loading' });
          switchTab(tab);
          setTimeout(() => {
            repo.dispatch('SET_UI', { friendsViewState: 'normal' });
            renderCurrentScreen();
          }, 400);
          return;
        }
        switchTab(tab);
        break;
      }

      case 'nav-back': {
        haptics.light();
        popScreen();
        break;
      }

      case 'close-overlay': {
        if (actionEl.classList.contains('overlay-backdrop') && e.target !== actionEl) {
          return;
        }
        closeOverlay();
        break;
      }

      case 'toast-undo': {
        haptics.light();
        const undone = triggerToastUndo();
        if (undone) {
          renderCurrentScreen();
        }
        break;
      }

      /* --- Screen 1: Now --- */
      case 'open-inbox': {
        pushScreen('7');
        break;
      }

      case 'set-now-group-filter': {
        const group = actionEl.getAttribute('data-group') || 'All';
        haptics.light();
        repo.dispatch('SET_UI', { nowGroupFilter: group });
        renderCurrentScreen();
        break;
      }

      case 'open-group-detail': {
        const groupId = actionEl.getAttribute('data-group-id');
        if (groupId) {
          repo.dispatch('SET_UI', { activeGroupId: groupId });
        }
        pushScreen('10');
        break;
      }

      case 'open-friend-schedule': {
        const friendId = actionEl.getAttribute('data-friend-id');
        if (friendId) {
          repo.dispatch('SET_UI', { activeFriendId: friendId, friendScheduleMode: 'day' });
        }
        closeOverlay();
        pushScreen('3', { friendId });
        break;
      }

      case 'open-my-day-from-now': {
        repo.dispatch('SET_UI', { myScheduleMode: 'day' });
        pushScreen('37', { tab: 'Now' });
        break;
      }

      case 'open-best-overlap': {
        const best = selectNowBestWindow(state);
        if (best) {
          repo.dispatch('SET_OVERLAP_PARTICIPANTS', {
            participantIds: best.participantIds,
            dayIndex: best.dayIndex
          });
        }
        pushScreen('2', { tab: 'Overlap' });
        break;
      }

      case 'suggest-best-window': {
        const best = selectNowBestWindow(state);
        if (best) {
          repo.dispatch('SET_OVERLAP_PARTICIPANTS', {
            participantIds: best.participantIds,
            dayIndex: best.dayIndex
          });
          const res = repo.dispatch('CREATE_PROPOSAL', {
            windowStart: best.window.start,
            windowEnd: best.window.end,
            participantIds: best.participantIds,
            dayIndex: best.dayIndex
          });
          haptics.success();
          showToast(res.toast, {
            canUndo: true,
            onUndo: () => {
              repo.undoLastAction();
              renderCurrentScreen();
            }
          });
        }
        pushScreen('2', { tab: 'Overlap' });
        break;
      }

      case 'open-busy-now': {
        // Section 6.3: 1 person -> 3; 2 or more -> 6 filtered to Busy
        const avail = selectFriendsAvailability(state);
        if (avail.busyNowCount === 1 && avail.busyNow[0]) {
          const busyFriendId = avail.busyNow[0].friend.id;
          repo.dispatch('SET_UI', { activeFriendId: busyFriendId, friendScheduleMode: 'day' });
          pushScreen('3', { friendId: busyFriendId });
        } else {
          repo.dispatch('SET_UI', { friendsFilter: 'Busy', friendsViewState: 'normal' });
          switchTab('Friends');
        }
        break;
      }

      /* --- Screen 2 / 36: Overlap --- */
      case 'toggle-overlap-chip': {
        const personId = actionEl.getAttribute('data-person-id');
        haptics.light();
        const res = repo.dispatch('TOGGLE_OVERLAP_PARTICIPANT', { personId });
        if (!res.ok && res.reason) {
          showToast(res.reason);
        }
        renderCurrentScreen();
        break;
      }

      case 'open-overlap-picker-sheet': {
        openOverlay({ type: 'sheet', name: 'overlap-picker' });
        break;
      }

      case 'set-overlap-day': {
        const dayIndex = Number(actionEl.getAttribute('data-day-index'));
        haptics.light();
        repo.dispatch('SET_UI', { overlapDayIndex: dayIndex });
        renderCurrentScreen({ preserveTimelineScroll: false });
        break;
      }

      case 'suggest-overlap-window': {
        const ovData = selectOverlapViewData(state);
        const bw = ovData.overlapResult.bestWindow;
        if (bw) {
          const res = repo.dispatch('CREATE_PROPOSAL', {
            windowStart: bw.start,
            windowEnd: bw.end,
            participantIds: ovData.overlapResult.activeParticipants.map((p) => p.id),
            dayIndex: ovData.dayIndex
          });
          haptics.success();
          showToast(res.toast, {
            canUndo: true,
            onUndo: () => {
              repo.undoLastAction();
              renderCurrentScreen();
            }
          });
          renderCurrentScreen();
        }
        break;
      }

      case 'request-schedule-access': {
        const friendId = actionEl.getAttribute('data-friend-id') || 'jellah';
        const res = repo.dispatch('REQUEST_SCHEDULE_ACCESS', { friendId });
        haptics.success();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      /* --- Screen 3 / 35: Friend Schedule --- */
      case 'set-friend-schedule-mode': {
        const mode = actionEl.getAttribute('data-mode') || 'day';
        haptics.light();
        repo.dispatch('SET_UI', { friendScheduleMode: mode });
        pushScreen(mode === 'week' ? '35' : '3', { swapInPlace: true });
        break;
      }

      case 'set-friend-schedule-day': {
        const dayIndex = Number(actionEl.getAttribute('data-day-index'));
        haptics.light();
        repo.dispatch('SET_UI', { friendScheduleDayIndex: dayIndex });
        renderCurrentScreen({ preserveTimelineScroll: false });
        break;
      }

      case 'find-time-with-friend': {
        const friendId = actionEl.getAttribute('data-friend-id') || state.ui.activeFriendId;
        repo.dispatch('SET_OVERLAP_PARTICIPANTS', {
          participantIds: [state.user.id || 'francis', friendId]
        });
        pushScreen('2', { tab: 'Overlap' });
        break;
      }

      case 'open-friend-action-sheet': {
        const friendId = actionEl.getAttribute('data-friend-id') || state.ui.activeFriendId;
        repo.dispatch('SET_UI', { targetFriendIdForDialog: friendId });
        openOverlay({ type: 'sheet', name: 'friend-actions', payload: { friendId } });
        break;
      }

      case 'friend-sheet-view-schedule': {
        const friendId = actionEl.getAttribute('data-friend-id');
        closeOverlay();
        repo.dispatch('SET_UI', { activeFriendId: friendId, friendScheduleMode: 'day' });
        pushScreen('3', { friendId });
        break;
      }

      case 'friend-sheet-add-group': {
        const friendId = actionEl.getAttribute('data-friend-id');
        const groupId = actionEl.getAttribute('data-group-id');
        const res = repo.dispatch('ADD_FRIEND_TO_GROUP', { friendId, groupId });
        haptics.success();
        closeOverlay();
        if (res.toast) showToast(res.toast);
        break;
      }

      /* --- Screen 6 / 21 / 22 / 23: Friends --- */
      case 'open-find-friends': {
        pushScreen('11');
        break;
      }

      case 'clear-friends-search': {
        repo.dispatch('SET_UI', { friendsSearch: '' });
        renderCurrentScreen();
        break;
      }

      case 'find-query-in-everyone': {
        const q = actionEl.getAttribute('data-query') || state.ui.friendsSearch || '';
        repo.dispatch('SET_UI', { findFriendsQuery: q });
        pushScreen('11');
        break;
      }

      case 'open-requests-received': {
        repo.dispatch('SET_UI', { requestsTab: 'Received' });
        pushScreen('32');
        break;
      }

      case 'open-requests-sent': {
        repo.dispatch('SET_UI', { requestsTab: 'Sent' });
        pushScreen('32');
        break;
      }

      case 'set-friends-filter': {
        const filter = actionEl.getAttribute('data-filter') || 'All';
        haptics.light();
        repo.dispatch('SET_UI', { friendsFilter: filter });
        renderCurrentScreen();
        break;
      }

      case 'retry-friends-load': {
        repo.dispatch('SET_UI', { friendsViewState: 'normal' });
        pushScreen('6', { swapInPlace: true });
        break;
      }

      case 'share-invite-link': {
        const res = await shareInviteLink({
          title: 'CNU Free',
          text: `Add me (@${state.user.username}) on CNU Free to compare our schedules!`,
          url: `https://cnufree.com/invite/${state.user.username}`
        });
        if (res.method === 'clipboard') {
          showToast('Invite link copied');
        }
        break;
      }

      /* --- Screen 10 / 33 / Sheet 40: Groups --- */
      case 'open-create-group': {
        repo.dispatch('SET_UI', {
          groupFormMode: 'create',
          groupFormName: 'Study squad',
          groupFormMembers: { gian: true, danica: true },
          groupFormDirty: false
        });
        pushScreen('33');
        break;
      }

      case 'open-add-group-members': {
        const groupId = actionEl.getAttribute('data-group-id') || state.ui.activeGroupId;
        const group = state.groups.find((g) => g.id === groupId);
        const membersMap = {};
        for (const f of state.friends) {
          membersMap[f.id] = group ? group.memberIds.includes(f.id) : false;
        }
        repo.dispatch('SET_UI', {
          activeGroupId: groupId,
          groupFormMode: 'add-members',
          groupFormMembers: membersMap,
          groupFormDirty: false
        });
        pushScreen('33');
        break;
      }

      case 'open-group-overlap': {
        const groupId = actionEl.getAttribute('data-group-id') || state.ui.activeGroupId;
        const group = state.groups.find((g) => g.id === groupId);
        if (group) {
          const nonPrivateIds = group.memberIds.filter((id) => {
            const f = state.friends.find((fr) => fr.id === id);
            return f && f.shareLevelToUser !== 'none' && f.shareLevelToUser !== 'private';
          });
          const privateFriends = group.memberIds
            .map((id) => state.friends.find((fr) => fr.id === id))
            .filter((f) => f && (f.shareLevelToUser === 'none' || f.shareLevelToUser === 'private'));

          repo.dispatch('SET_OVERLAP_PARTICIPANTS', {
            participantIds: [state.user.id || 'francis', ...nonPrivateIds]
          });
          if (privateFriends.length > 0) {
            showToast(
              `Excluded ${privateFriends.map((p) => p.firstName).join(', ')} (private schedule)`
            );
          }
        }
        pushScreen('2', { tab: 'Overlap' });
        break;
      }

      case 'remove-member-from-group': {
        const groupId = actionEl.getAttribute('data-group-id') || state.ui.activeGroupId;
        const memberId = actionEl.getAttribute('data-member-id');
        const res = repo.dispatch('REMOVE_MEMBER_FROM_GROUP', { groupId, memberId });
        haptics.warning();
        showToast(res.toast, {
          canUndo: true,
          onUndo: () => {
            repo.undoLastAction();
            renderCurrentScreen();
          }
        });
        renderCurrentScreen();
        break;
      }

      case 'open-rename-group-sheet': {
        const groupId = actionEl.getAttribute('data-group-id') || state.ui.activeGroupId;
        const group = state.groups.find((g) => g.id === groupId);
        repo.dispatch('SET_UI', {
          activeGroupId: groupId,
          renameGroupFormName: group?.name || ''
        });
        pushScreen('40');
        break;
      }

      case 'save-rename-group': {
        const res = repo.dispatch('RENAME_GROUP', {});
        if (res.ok) {
          haptics.success();
          closeOverlay();
          if (res.toast) showToast(res.toast);
        }
        break;
      }

      case 'prompt-delete-group': {
        const groupId = actionEl.getAttribute('data-group-id') || state.ui.activeGroupId;
        const group = state.groups.find((g) => g.id === groupId);
        openOverlay({
          type: 'dialog',
          name: 'confirm-dialog',
          payload: {
            title: `Delete ${group?.name || 'group'}?`,
            copy: 'This removes the group for you. Your friends stay in your Friends list.',
            confirmLabel: 'Delete group',
            confirmAction: 'confirm-delete-group',
            confirmPayload: groupId,
            danger: true
          }
        });
        break;
      }

      case 'confirm-delete-group': {
        const groupId = actionEl.getAttribute('data-payload') || state.ui.activeGroupId;
        const res = repo.dispatch('DELETE_GROUP', { groupId });
        haptics.warning();
        closeOverlay();
        popScreen('6');
        if (res.toast) showToast(res.toast);
        break;
      }

      case 'toggle-group-form-member': {
        const friendId = actionEl.getAttribute('data-friend-id');
        const currentMap = { ...(state.ui.groupFormMembers || {}) };
        currentMap[friendId] = !currentMap[friendId];
        repo.dispatch('SET_UI', { groupFormMembers: currentMap, groupFormDirty: true });
        renderCurrentScreen();
        break;
      }

      case 'cancel-group-form': {
        if (state.ui.groupFormDirty) {
          openOverlay({
            type: 'dialog',
            name: 'confirm-dialog',
            payload: {
              title: 'Discard changes?',
              copy: 'Your unsaved group changes will be lost.',
              confirmLabel: 'Discard',
              confirmAction: 'confirm-discard-form',
              danger: true
            }
          });
          return;
        }
        popScreen();
        break;
      }

      case 'submit-group-form': {
        const res = repo.dispatch('CREATE_OR_UPDATE_GROUP', {});
        if (res.ok) {
          haptics.success();
          if (res.mode === 'add-members') {
            popScreen('10');
          } else {
            popScreen('6');
          }
          if (res.toast) showToast(res.toast);
        }
        break;
      }

      /* --- Screen 11 / 32 / 7 / 12 / 13: Requests, Inbox, Remove & Block --- */
      case 'clear-find-friends-query': {
        repo.dispatch('SET_UI', { findFriendsQuery: '' });
        renderCurrentScreen();
        break;
      }

      case 'send-friend-request': {
        const personId = actionEl.getAttribute('data-person-id');
        const res = repo.dispatch('SEND_FRIEND_REQUEST', { personId });
        haptics.success();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      case 'open-cancel-pending-sheet': {
        const personId = actionEl.getAttribute('data-person-id');
        openOverlay({ type: 'sheet', name: 'cancel-pending-request', payload: { personId } });
        break;
      }

      case 'confirm-cancel-request': {
        const personId = actionEl.getAttribute('data-person-id');
        const res = repo.dispatch('CANCEL_OUTGOING_REQUEST', { personId });
        haptics.light();
        closeOverlay();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      case 'set-requests-tab': {
        const tab = actionEl.getAttribute('data-tab') || 'Received';
        haptics.light();
        repo.dispatch('SET_UI', { requestsTab: tab });
        renderCurrentScreen();
        break;
      }

      case 'accept-friend-request': {
        const personId = actionEl.getAttribute('data-person-id');
        const res = repo.dispatch('ACCEPT_FRIEND_REQUEST', { personId });
        haptics.success();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      case 'decline-friend-request': {
        const personId = actionEl.getAttribute('data-person-id');
        const res = repo.dispatch('DECLINE_FRIEND_REQUEST', { personId });
        haptics.light();
        showToast(res.toast, {
          canUndo: true,
          onUndo: () => {
            repo.undoLastAction();
            renderCurrentScreen();
          }
        });
        renderCurrentScreen();
        break;
      }

      case 'open-remove-friend-dialog': {
        const friendId = actionEl.getAttribute('data-friend-id') || state.ui.targetFriendIdForDialog || 'gian';
        repo.dispatch('SET_UI', { targetFriendIdForDialog: friendId });
        pushScreen('12', { payload: { friendId } });
        break;
      }

      case 'confirm-remove-friend': {
        const friendId = actionEl.getAttribute('data-friend-id') || state.ui.targetFriendIdForDialog;
        const res = repo.dispatch('REMOVE_FRIEND', { friendId });
        haptics.warning();
        closeOverlay();
        if (getActiveScreenId() === '3' || getActiveScreenId() === '35') {
          popScreen('6');
        } else {
          renderCurrentScreen();
        }
        showToast(res.toast, {
          canUndo: true,
          onUndo: () => {
            repo.undoLastAction();
            renderCurrentScreen();
          }
        });
        break;
      }

      case 'open-block-user-dialog': {
        const personId = actionEl.getAttribute('data-person-id') || 'marco';
        const target =
          state.friends.find((f) => f.id === personId) ||
          state.incomingRequests.find((r) => r.id === personId) ||
          state.notifications.find((n) => n.personId === personId) ||
          state.ui.targetUserForBlock;
        if (target) {
          repo.dispatch('SET_UI', {
            targetUserForBlock: {
              id: target.personId || target.id,
              name: target.name,
              username: target.username,
              initials: target.initials,
              avatarClass: target.avatarClass
            }
          });
        }
        pushScreen('13', { payload: { personId } });
        break;
      }

      case 'confirm-block-user': {
        const personId = actionEl.getAttribute('data-person-id') || state.ui.targetUserForBlock?.id;
        const res = repo.dispatch('BLOCK_USER', { personId });
        haptics.warning();
        closeOverlay();
        if (getActiveScreenId() === '3' || getActiveScreenId() === '35') {
          popScreen('6');
        } else {
          renderCurrentScreen();
        }
        showToast(res.toast, {
          canUndo: true,
          onUndo: () => {
            repo.undoLastAction();
            renderCurrentScreen();
          }
        });
        break;
      }

      case 'unblock-user': {
        const personId = actionEl.getAttribute('data-person-id');
        const res = repo.dispatch('UNBLOCK_USER', { personId });
        haptics.light();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      case 'mark-all-notifications-read': {
        const res = repo.dispatch('MARK_ALL_NOTIFICATIONS_READ', {});
        haptics.light();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      case 'mark-notification-read': {
        const notificationId = actionEl.getAttribute('data-notif-id');
        repo.dispatch('MARK_NOTIFICATION_READ', { notificationId });
        renderCurrentScreen();
        break;
      }

      case 'set-inbox-filter': {
        const filter = actionEl.getAttribute('data-filter') || 'All';
        haptics.light();
        repo.dispatch('SET_UI', { inboxFilter: filter });
        renderCurrentScreen();
        break;
      }

      case 'retry-inbox-load': {
        repo.dispatch('SET_UI', { inboxViewState: 'normal' });
        pushScreen('7', { swapInPlace: true });
        break;
      }

      /* --- Screen 8 / 37 / 9: My Schedule & Class Form --- */
      case 'set-my-schedule-mode': {
        const mode = actionEl.getAttribute('data-mode') || 'week';
        haptics.light();
        repo.dispatch('SET_UI', { myScheduleMode: mode });
        pushScreen(mode === 'day' ? '37' : '8', { swapInPlace: true });
        break;
      }

      case 'set-my-schedule-day': {
        const dayIndex = Number(actionEl.getAttribute('data-day-index'));
        haptics.light();
        repo.dispatch('SET_UI', { myScheduleDayIndex: dayIndex });
        renderCurrentScreen({ preserveTimelineScroll: false });
        break;
      }

      case 'open-add-class': {
        const returnTo = actionEl.getAttribute('data-return-to') || '8';
        repo.dispatch('OPEN_CLASS_FORM', { mode: 'add', returnTo });
        pushScreen('9');
        break;
      }

      case 'empty-slot-add-class': {
        const dayIndex = Number(actionEl.getAttribute('data-day-index') || 1);
        const start = Number(actionEl.getAttribute('data-start') || 540);
        const returnTo = getActiveScreenId() === '37' ? '37' : '8';
        repo.dispatch('OPEN_CLASS_FORM', {
          mode: 'add',
          returnTo,
          dayIndex,
          start,
          end: start + 60
        });
        pushScreen('9');
        break;
      }

      case 'open-edit-class': {
        const classId = actionEl.getAttribute('data-class-id');
        const returnTo = actionEl.getAttribute('data-return-to') || '8';
        repo.dispatch('OPEN_CLASS_FORM', { mode: 'edit', classId, returnTo });
        pushScreen('9');
        break;
      }

      case 'toggle-class-day': {
        const dayIndex = Number(actionEl.getAttribute('data-day-index'));
        const days = [...(state.ui.classForm?.days || [])];
        const idx = days.indexOf(dayIndex);
        if (idx >= 0) {
          days.splice(idx, 1);
        } else {
          days.push(dayIndex);
          days.sort((a, b) => a - b);
        }
        haptics.light();
        repo.dispatch('SET_UI', {
          classForm: { ...state.ui.classForm, days },
          classFormDirty: true
        });
        renderCurrentScreen();
        break;
      }

      case 'set-class-repeat': {
        const repeat = actionEl.getAttribute('data-repeat') || 'weekly';
        haptics.light();
        repo.dispatch('SET_UI', {
          classForm: { ...state.ui.classForm, repeat },
          classFormDirty: true
        });
        renderCurrentScreen();
        break;
      }

      case 'save-class-form': {
        const res = repo.dispatch('SAVE_CLASS_FORM', {});
        if (res.ok) {
          haptics.success();
          popScreen(res.returnTo || '8');
          if (res.toast) showToast(res.toast);
        }
        break;
      }

      case 'prompt-delete-class': {
        openOverlay({
          type: 'dialog',
          name: 'confirm-dialog',
          payload: {
            title: 'Delete this class?',
            copy: 'This removes the class from your weekly timetable.',
            confirmLabel: 'Delete class',
            confirmAction: 'confirm-delete-class',
            danger: true
          }
        });
        break;
      }

      case 'confirm-delete-class': {
        const res = repo.dispatch('DELETE_CLASS', {});
        haptics.warning();
        closeOverlay();
        popScreen(res.returnTo || '8');
        if (res.toast) showToast(res.toast);
        break;
      }

      case 'cancel-class-form': {
        if (state.ui.classFormDirty) {
          openOverlay({
            type: 'dialog',
            name: 'confirm-dialog',
            payload: {
              title: 'Discard changes?',
              copy: 'Your unsaved class edits will be lost.',
              confirmLabel: 'Discard',
              confirmAction: 'confirm-discard-form',
              danger: true
            }
          });
          return;
        }
        popScreen();
        break;
      }

      case 'confirm-discard-form': {
        repo.dispatch('SET_UI', { classFormDirty: false, groupFormDirty: false });
        closeOverlay();
        popScreen();
        break;
      }

      /* --- Screen 5 / 34 / 14 / 38: Privacy & Share Links --- */
      case 'open-selected-friends-picker': {
        const focusId = actionEl.getAttribute('data-focus-id') || null;
        repo.dispatch('SET_UI', { selectedFriendsFocusId: focusId });
        pushScreen('34');
        break;
      }

      case 'done-selected-friends': {
        haptics.success();
        showToast('Access settings saved');
        popScreen('5');
        break;
      }

      case 'cycle-access-rule': {
        const targetType = actionEl.getAttribute('data-target-type') || 'person';
        const targetId = actionEl.getAttribute('data-target-id') || 'gian';
        const currentMap =
          targetType === 'group'
            ? state.user.privacyConfig?.groupRules || {}
            : state.user.privacyConfig?.personOverrides || {};
        const currentLvl = currentMap[targetId] || 'free_busy';
        const order = ['full', 'free_busy', 'free_only', 'busy_only', 'none'];
        const nextLvl = order[(order.indexOf(currentLvl) + 1) % order.length];
        const res = repo.dispatch('SET_ACCESS_RULE', { targetType, targetId, level: nextLvl });
        haptics.light();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      case 'open-share-link-sheet': {
        pushScreen('14');
        break;
      }

      case 'copy-share-link': {
        const linkId = actionEl.getAttribute('data-link-id') || state.ui.activeShareLinkId || 'francis_8472';
        await copyToClipboard(`https://cnufree.com/s/${linkId}`);
        haptics.success();
        showToast('Link copied');
        break;
      }

      case 'prompt-revoke-link': {
        const linkId = actionEl.getAttribute('data-link-id') || state.ui.activeShareLinkId;
        openOverlay({
          type: 'dialog',
          name: 'confirm-dialog',
          payload: {
            title: 'Revoke share link?',
            copy: 'Anyone with this link will immediately lose access to your schedule.',
            confirmLabel: 'Revoke link',
            confirmAction: 'confirm-revoke-link',
            confirmPayload: linkId,
            danger: true
          }
        });
        break;
      }

      case 'confirm-revoke-link': {
        const linkId = actionEl.getAttribute('data-payload') || state.ui.activeShareLinkId;
        const res = repo.dispatch('REVOKE_SHARE_LINK', { linkId });
        haptics.warning();
        closeOverlay();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      case 'delete-expired-link': {
        const linkId = actionEl.getAttribute('data-link-id');
        const res = repo.dispatch('DELETE_EXPIRED_SHARE_LINK', { linkId });
        haptics.light();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      case 'set-share-expiry': {
        const days = Number(actionEl.getAttribute('data-days') || 7);
        haptics.light();
        repo.dispatch('SET_UI', {
          shareSheetConfig: { ...state.ui.shareSheetConfig, expiryDays: days }
        });
        renderCurrentScreen();
        break;
      }

      case 'create-share-link': {
        const res = repo.dispatch('CREATE_SHARE_LINK', {});
        if (res.ok && res.url) {
          await copyToClipboard(res.url);
          haptics.success();
          showToast(res.toast || 'Link created & copied');
          renderCurrentScreen();
        }
        break;
      }

      case 'open-share-preview': {
        const linkId = actionEl.getAttribute('data-link-id') || state.ui.activeShareLinkId || 'francis_8472';
        repo.dispatch('SET_UI', { activeShareLinkId: linkId, sharePreviewMode: true });
        closeOverlay();
        pushScreen('38');
        break;
      }

      case 'close-share-preview': {
        repo.dispatch('SET_UI', { sharePreviewMode: false });
        popScreen('5');
        break;
      }

      case 'get-cnu-free-cta': {
        showToast('Coming soon');
        break;
      }

      /* --- Screen 30 / 15 / 16 / 17 / 31 / 39: Me Hub & Settings --- */
      case 'open-edit-profile-sheet': {
        repo.dispatch('SET_UI', {
          editProfileForm: {
            firstName: state.user.firstName,
            lastName: state.user.lastName || '',
            username: state.ui.editProfileForm?.username || state.user.username
          }
        });
        pushScreen('16');
        break;
      }

      case 'toggle-avatar-palette': {
        haptics.light();
        repo.dispatch('SET_UI', { showAvatarPalette: !state.ui.showAvatarPalette });
        renderCurrentScreen();
        break;
      }

      case 'select-avatar-color': {
        const avatarClass = actionEl.getAttribute('data-avatar-class') || 'av-ink';
        haptics.light();
        repo.dispatch('CYCLE_AVATAR_COLOR', { avatarClass });
        renderCurrentScreen();
        break;
      }

      case 'use-username-suggestion': {
        const suggestion = actionEl.getAttribute('data-suggestion') || 'francis.cnu';
        repo.dispatch('SET_UI', {
          editProfileForm: {
            ...state.ui.editProfileForm,
            username: suggestion
          }
        });
        renderCurrentScreen();
        break;
      }

      case 'save-profile': {
        const res = repo.dispatch('SAVE_PROFILE', {});
        if (res.ok) {
          haptics.success();
          closeOverlay();
          showToast(res.toast || 'Profile saved');
        }
        break;
      }

      case 'open-my-week': {
        repo.dispatch('SET_UI', { myScheduleMode: 'week' });
        pushScreen('8');
        break;
      }

      case 'open-privacy-sharing': {
        pushScreen('5');
        break;
      }

      case 'open-notification-settings': {
        pushScreen('15');
        break;
      }

      case 'open-blocked-people': {
        pushScreen('39');
        break;
      }

      case 'open-delete-account-dialog': {
        pushScreen('31');
        break;
      }

      case 'confirm-delete-account': {
        haptics.warning();
        repo.dispatch('DELETE_ACCOUNT', {});
        resetStacksTo('26');
        showToast('Account deleted');
        break;
      }

      case 'open-sign-out-dialog': {
        pushScreen('17');
        break;
      }

      case 'confirm-sign-out': {
        haptics.light();
        repo.dispatch('SIGN_OUT', {});
        resetStacksTo('26');
        break;
      }

      /* --- Screen 26 / 27 / 28 / 24 / 25 / 4 / 29: Auth & Import --- */
      case 'open-auth-create': {
        repo.dispatch('SET_UI', { authMode: 'create', authErrors: {}, forgotPasswordExpanded: false });
        pushScreen('27');
        break;
      }

      case 'open-auth-signin': {
        repo.dispatch('SET_UI', { authMode: 'signin', authErrors: {}, forgotPasswordExpanded: false });
        pushScreen('27');
        break;
      }

      case 'toggle-auth-mode': {
        const nextMode = state.ui.authMode === 'create' ? 'signin' : 'create';
        repo.dispatch('SET_UI', { authMode: nextMode, authErrors: {}, forgotPasswordExpanded: false });
        renderCurrentScreen();
        break;
      }

      case 'toggle-forgot-password': {
        repo.dispatch('SET_UI', { forgotPasswordExpanded: !state.ui.forgotPasswordExpanded });
        renderCurrentScreen();
        break;
      }

      case 'send-reset-link': {
        const email = state.ui.forgotPasswordEmail || 'francis@cnu.edu.ph';
        haptics.success();
        showToast(`Reset link sent to ${email}`);
        repo.dispatch('SET_UI', { forgotPasswordExpanded: false });
        renderCurrentScreen();
        break;
      }

      case 'submit-auth-form': {
        const res = repo.dispatch('AUTH_SUBMIT', { mode: state.ui.authMode });
        if (!res.ok) {
          repo.dispatch('SET_UI', { authErrors: res.errors || {} });
          renderCurrentScreen();
          return;
        }
        repo.dispatch('SET_UI', { authErrors: {} });
        haptics.success();
        resetStacksTo(res.nextScreen || '1');
        break;
      }

      case 'open-import-timetable': {
        pushScreen('28');
        break;
      }

      case 'cancel-import-upload': {
        if (state.session.onboarding) {
          resetStacksTo('1');
        } else {
          popScreen('1');
        }
        break;
      }

      case 'pick-timetable-photo': {
        const source = actionEl.getAttribute('data-source') || 'PROMPT';
        const picked = await pickTimetablePhoto(source);
        if (picked.cancelled) return;
        startOcrScanFlow();
        break;
      }

      case 'cancel-ocr-scan': {
        cancelPendingOcr();
        if (_ocrAbortController) {
          _ocrAbortController.abort();
          _ocrAbortController = null;
        }
        popScreen('28');
        break;
      }

      case 'retake-timetable-photo': {
        popScreen('28');
        break;
      }

      case 'add-classes-manually-from-ocr': {
        repo.dispatch('OPEN_CLASS_FORM', { mode: 'add', returnTo: '8' });
        pushScreen('9');
        break;
      }

      case 'edit-ocr-draft-row': {
        const draftId = actionEl.getAttribute('data-draft-id') || 'ocr_francis_8';
        repo.dispatch('OPEN_CLASS_FORM', {
          mode: 'edit-import-row',
          draftId,
          returnTo: '4'
        });
        pushScreen('9');
        break;
      }

      case 'save-ocr-timetable': {
        const res = repo.dispatch('SAVE_OCR_TIMETABLE', {});
        if (res.ok) {
          haptics.success();
          pushScreen('29');
        } else if (res.error) {
          showToast(res.error);
        }
        break;
      }

      case 'open-my-week-from-success': {
        repo.dispatch('SET_UI', { myScheduleMode: 'week' });
        switchTab('Me');
        pushScreen('8', { tab: 'Me' });
        break;
      }

      case 'back-to-now-from-success': {
        resetStacksTo('1');
        break;
      }

      default:
        break;
    }
  });

  // 2. Input & Change delegation
  phoneFrame.addEventListener('input', (e) => {
    const fieldEl = e.target.closest('[data-field]');
    if (!fieldEl) return;
    const field = fieldEl.getAttribute('data-field');
    const val = fieldEl.value;
    const state = repo.getState();

    switch (field) {
      case 'friends-search': {
        repo.dispatch('SET_UI', { friendsSearch: val });
        renderCurrentScreen();
        break;
      }
      case 'find-friends-query': {
        repo.dispatch('SET_UI', { findFriendsQuery: val });
        if (_findFriendsDebounce) clearTimeout(_findFriendsDebounce);
        _findFriendsDebounce = setTimeout(() => {
          renderCurrentScreen();
        }, 250);
        break;
      }
      case 'selected-friends-search': {
        repo.dispatch('SET_UI', { selectedFriendsSearch: val });
        renderCurrentScreen();
        break;
      }
      case 'overlap-picker-search': {
        repo.dispatch('SET_UI', { overlapPickerSearch: val });
        renderCurrentScreen();
        break;
      }
      case 'group-form-name': {
        repo.dispatch('SET_UI', { groupFormName: val, groupFormDirty: true });
        renderCurrentScreen();
        break;
      }
      case 'rename-group-name': {
        repo.dispatch('SET_UI', { renameGroupFormName: val });
        renderCurrentScreen();
        break;
      }
      case 'class-activity': {
        repo.dispatch('SET_UI', {
          classForm: { ...state.ui.classForm, activity: val },
          classFormDirty: true
        });
        renderCurrentScreen();
        break;
      }
      case 'class-room': {
        repo.dispatch('SET_UI', {
          classForm: { ...state.ui.classForm, room: val },
          classFormDirty: true
        });
        break;
      }
      case 'class-starts': {
        repo.dispatch('SET_UI', {
          classForm: { ...state.ui.classForm, starts: val },
          classFormDirty: true
        });
        renderCurrentScreen();
        break;
      }
      case 'class-ends': {
        repo.dispatch('SET_UI', {
          classForm: { ...state.ui.classForm, ends: val },
          classFormDirty: true
        });
        renderCurrentScreen();
        break;
      }
      case 'class-notes': {
        repo.dispatch('SET_UI', {
          classForm: { ...state.ui.classForm, notes: val },
          classFormDirty: true
        });
        break;
      }
      case 'profile-firstName': {
        repo.dispatch('SET_UI', {
          editProfileForm: { ...state.ui.editProfileForm, firstName: val }
        });
        renderCurrentScreen();
        break;
      }
      case 'profile-lastName': {
        repo.dispatch('SET_UI', {
          editProfileForm: { ...state.ui.editProfileForm, lastName: val }
        });
        renderCurrentScreen();
        break;
      }
      case 'profile-username': {
        const clean = val.toLowerCase().replace(/^@/, '');
        repo.dispatch('SET_UI', {
          editProfileForm: { ...state.ui.editProfileForm, username: clean }
        });
        if (_usernameDebounce) clearTimeout(_usernameDebounce);
        _usernameDebounce = setTimeout(() => {
          renderCurrentScreen();
        }, 300);
        break;
      }
      case 'auth-firstName': {
        repo.dispatch('SET_UI', {
          authForm: { ...state.ui.authForm, firstName: val }
        });
        break;
      }
      case 'auth-lastName': {
        repo.dispatch('SET_UI', {
          authForm: { ...state.ui.authForm, lastName: val }
        });
        break;
      }
      case 'auth-username': {
        repo.dispatch('SET_UI', {
          authForm: { ...state.ui.authForm, username: val.replace(/^@/, '') }
        });
        break;
      }
      case 'auth-password': {
        repo.dispatch('SET_UI', {
          authForm: { ...state.ui.authForm, password: val }
        });
        break;
      }
      case 'forgot-email': {
        repo.dispatch('SET_UI', { forgotPasswordEmail: val });
        break;
      }
      default:
        break;
    }
  });

  phoneFrame.addEventListener('change', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.getAttribute('data-action');
    const state = repo.getState();

    switch (action) {
      case 'set-global-audience': {
        const audience = actionEl.value;
        const res = repo.dispatch('SET_GLOBAL_AUDIENCE', { audience });
        haptics.light();
        if (res.toast) showToast(res.toast);
        if (audience === 'selected') {
          const overrides = state.user.privacyConfig?.personOverrides || {};
          const anySelected = Object.values(overrides).some((v) => v && v !== 'none');
          if (!anySelected) {
            pushScreen('34');
            return;
          }
        }
        renderCurrentScreen();
        break;
      }

      case 'toggle-access-target': {
        const targetType = actionEl.getAttribute('data-target-type') || 'person';
        const targetId = actionEl.getAttribute('data-target-id');
        const checked = actionEl.checked;
        const res = repo.dispatch('SET_ACCESS_RULE', {
          targetType,
          targetId,
          level: checked ? 'free_busy' : 'none'
        });
        haptics.light();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      case 'set-share-sheet-aud': {
        const audience = actionEl.value;
        haptics.light();
        repo.dispatch('SET_UI', {
          shareSheetConfig: { ...state.ui.shareSheetConfig, audience }
        });
        renderCurrentScreen();
        break;
      }

      case 'set-share-hours-start': {
        repo.dispatch('SET_UI', {
          shareSheetConfig: { ...state.ui.shareSheetConfig, hoursStart: actionEl.value }
        });
        break;
      }

      case 'set-share-hours-end': {
        repo.dispatch('SET_UI', {
          shareSheetConfig: { ...state.ui.shareSheetConfig, hoursEnd: actionEl.value }
        });
        break;
      }

      case 'toggle-notif-setting': {
        const key = actionEl.getAttribute('data-key');
        const groupId = actionEl.getAttribute('data-group-id');
        const res = repo.dispatch('TOGGLE_NOTIFICATION_SETTING', { key, groupId });
        haptics.light();
        if (res.toast) showToast(res.toast);
        renderCurrentScreen();
        break;
      }

      case 'toggle-overlap-friend': {
        const personId = actionEl.getAttribute('data-person-id');
        haptics.light();
        const res = repo.dispatch('TOGGLE_OVERLAP_PARTICIPANT', { personId });
        if (!res.ok && res.reason) {
          showToast(res.reason);
        }
        renderCurrentScreen();
        break;
      }

      default:
        break;
    }
  });

  // 3. Keyboard accessibility: Esc closes overlay, Tab traps focus inside active dialog/sheet (Section 9)
  document.addEventListener('keydown', (e) => {
    const routerState = getRouterState();
    if (!routerState.overlay) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeOverlay();
      return;
    }
    if (e.key === 'Tab') {
      const dialogEl = phoneFrame.querySelector('[role="dialog"]');
      if (dialogEl) {
        trapFocusInModal(dialogEl, e);
      }
    }
  });

  // 4. Touch gestures: Left-edge swipe (<= 20px) = Back & Sheet drag-to-dismiss (Section 5)
  let touchStartX = null;
  let touchStartY = null;
  let sheetDragging = false;

  phoneFrame.addEventListener(
    'touchstart',
    (e) => {
      if (!e.touches || e.touches.length !== 1) return;
      const t = e.touches[0];
      const rect = phoneFrame.getBoundingClientRect();
      touchStartX = t.clientX - rect.left;
      touchStartY = t.clientY - rect.top;
      sheetDragging = Boolean(e.target.closest('[data-sheet="true"]'));
    },
    { passive: true }
  );

  phoneFrame.addEventListener(
    'touchend',
    (e) => {
      if (touchStartX === null || !e.changedTouches || e.changedTouches.length === 0) return;
      const t = e.changedTouches[0];
      const rect = phoneFrame.getBoundingClientRect();
      const endX = t.clientX - rect.left;
      const endY = t.clientY - rect.top;
      const dx = endX - touchStartX;
      const dy = endY - touchStartY;

      if (touchStartX <= 20 && dx >= 60 && Math.abs(dy) < 50) {
        popScreen();
      } else if (sheetDragging && dy >= 70 && Math.abs(dx) < 60) {
        closeOverlay();
      }

      touchStartX = null;
      touchStartY = null;
      sheetDragging = false;
    },
    { passive: true }
  );
}

async function startOcrScanFlow() {
  if (_ocrAbortController) {
    _ocrAbortController.abort();
  }
  _ocrAbortController = new AbortController();
  pushScreen('24');

  const state = repo.getState();
  const res = await runMockOcr({
    forceFailure: Boolean(state.forceOcrFailure),
    delayMs: 2200,
    signal: _ocrAbortController.signal
  });

  if (res.cancelled) return;
  if (res.ok) {
    repo.dispatch('RESET_OCR_DRAFTS', {});
    pushScreen('4', { swapInPlace: true });
  } else {
    pushScreen('25', { swapInPlace: true });
  }
}

/* ==========================================================================
   DEVELOPER TOOLBAR & ALL-SCREENS GRID EXPLORER (Desktop / ?dev=1)
   Addendum B §6:
   - (1) Dev clock: Live | presets (Mon 09:30, Tue 09:41, Wed 12:00, Sat 20:30, Sun 10:00) | speed (1×, 60×, 600×)
   - (2) "Simulate schedule change"
   - (3) "Make [friend] private" toggle
   - (4) "Load sample data" and "Reset to clean"
   ========================================================================== */

function initDevToolbar() {
  const selectEl = document.getElementById('screenSelect');
  const stripEl = document.getElementById('devChipStrip');
  const prevBtn = document.getElementById('prevScreenBtn');
  const nextBtn = document.getElementById('nextScreenBtn');
  const clockPresetSelect = document.getElementById('devClockPresetSelect');
  const clockSpeedSelect = document.getElementById('devClockSpeedSelect');
  const simulateChangeBtn = document.getElementById('simulateScheduleChangeBtn');
  const makePrivateSelect = document.getElementById('makeFriendPrivateSelect');
  const loadSampleBtn = document.getElementById('loadSampleDataBtn');
  const resetCleanBtn = document.getElementById('resetCleanBtn');
  const toggleGridBtn = document.getElementById('toggleGridBtn');
  const toggleOcrBtn = document.getElementById('toggleOcrOutcomeBtn');

  if (selectEl) {
    selectEl.innerHTML = SCREEN_META.map(
      (m) => `<option value="${m.id}">${m.title}</option>`
    ).join('');
    selectEl.addEventListener('change', (e) => {
      jumpToView(e.target.value);
    });
  }

  if (stripEl) {
    stripEl.innerHTML = SCREEN_META.map(
      (m) => `<button type="button" class="dev-chip" data-dev-screen="${m.id}" title="${m.title}">${m.id}</button>`
    ).join('');
    stripEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-dev-screen]');
      if (!btn) return;
      jumpToView(btn.getAttribute('data-dev-screen'));
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const curr = parseInt(getRouterState().currentViewId, 10) || 1;
      const prev = curr <= 1 ? SCREEN_META.length : curr - 1;
      jumpToView(String(prev));
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const curr = parseInt(getRouterState().currentViewId, 10) || 1;
      const next = curr >= SCREEN_META.length ? 1 : curr + 1;
      jumpToView(String(next));
    });
  }

  if (clockPresetSelect) {
    clockPresetSelect.addEventListener('change', (e) => {
      const val = e.target.value;
      if (val === 'live') {
        setClockLive();
        showToast('Clock set to Live (real device time)');
      } else {
        setClockPreset(val);
        showToast(`Clock set to ${val}`);
      }
      syncDevClockReadout();
    });
  }

  if (clockSpeedSelect) {
    clockSpeedSelect.addEventListener('change', (e) => {
      const speed = Number(e.target.value) || 1;
      setClockSpeed(speed);
      showToast(`Clock speed: ${speed}×`);
      syncDevClockReadout();
    });
  }

  if (simulateChangeBtn) {
    simulateChangeBtn.addEventListener('click', () => {
      const res = repo.dispatch('SIMULATE_SCHEDULE_CHANGE', {});
      renderCurrentScreen();
      if (res.toast) showToast(res.toast);
    });
  }

  syncDevPrivateDropdown();
  if (makePrivateSelect) {
    makePrivateSelect.addEventListener('change', (e) => {
      const friendId = e.target.value;
      if (!friendId) return;
      const res = repo.dispatch('TOGGLE_FRIEND_PRIVATE', { friendId });
      e.target.value = '';
      syncDevPrivateDropdown();
      renderCurrentScreen();
      if (res.toast) showToast(res.toast);
    });
  }

  if (loadSampleBtn) {
    loadSampleBtn.addEventListener('click', () => {
      repo.dispatch('LOAD_SAMPLE_DATA', {});
      resetStacksTo('1');
      renderCurrentScreen({ preserveTimelineScroll: false });
      showToast('Loaded sample data (Francis + 10 friends)');
    });
  }

  if (resetCleanBtn) {
    resetCleanBtn.addEventListener('click', () => {
      repo.dispatch('RESET_TO_CLEAN', {});
      resetStacksTo('28');
      renderCurrentScreen({ preserveTimelineScroll: false });
      showToast('Reset to clean state');
    });
  }

  if (toggleOcrBtn) {
    toggleOcrBtn.addEventListener('click', () => {
      const st = repo.getState();
      const nextForce = !st.forceOcrFailure;
      st.forceOcrFailure = nextForce;
      toggleOcrBtn.textContent = `Force OCR failure: ${nextForce ? 'ON' : 'OFF'}`;
      showToast(`Force OCR failure: ${nextForce ? 'ON' : 'OFF'}`);
    });
  }

  if (toggleGridBtn) {
    toggleGridBtn.addEventListener('click', () => {
      _isGridMode = !_isGridMode;
      const interactiveStage = document.getElementById('interactiveStage');
      const gridStage = document.getElementById('gridStage');
      if (_isGridMode) {
        interactiveStage?.classList.add('hidden');
        gridStage?.classList.add('active');
        toggleGridBtn.textContent = 'Single Phone View';
        renderAllScreensGrid();
      } else {
        interactiveStage?.classList.remove('hidden');
        gridStage?.classList.remove('active');
        toggleGridBtn.textContent = 'All Screens Grid';
      }
    });
  }
}

function syncDevPrivateDropdown() {
  const makePrivateSelect = document.getElementById('makeFriendPrivateSelect');
  if (!makePrivateSelect) return;
  const st = repo.getState();
  const options = [
    `<option value="">Make [friend] private…</option>`,
    ...(st.friends || []).map((f) => {
      const isPriv = f.shareLevelToUser === 'private' || f.shareLevelToUser === 'none';
      return `<option value="${f.id}">${isPriv ? `Restore ${f.name} (Private)` : `Make ${f.name} private`}</option>`;
    })
  ];
  makePrivateSelect.innerHTML = options.join('');
}

function syncDevClockReadout() {
  const readout = document.getElementById('devClockReadout');
  if (!readout) return;
  const clk = getClockState();
  const currentNow = now();
  const modeStr = clk.mode === 'live' ? 'LIVE' : 'DEV';
  const speedStr = clk.speed > 1 ? ` · ${clk.speed}×` : '';
  readout.textContent = `${modeStr}${speedStr} · ${currentNow.dayShort} ${currentNow.formattedTime}`;
}

function syncDevToolbarUI() {
  const currentId = getRouterState().currentViewId || '1';
  const selectEl = document.getElementById('screenSelect');
  if (selectEl && selectEl.value !== currentId) {
    selectEl.value = currentId;
  }
  const chips = document.querySelectorAll('.dev-chip[data-dev-screen]');
  chips.forEach((c) => {
    c.classList.toggle('active', c.getAttribute('data-dev-screen') === currentId);
  });
}

function renderAllScreensGrid() {
  const container = document.getElementById('gridContainer');
  if (!container) return;
  const state = repo.getState();

  container.innerHTML = SCREEN_META.map((m) => {
    const contentHtml = renderBaseScreenContent(m.id, state, { isStandalonePreview: true });
    const showNav = isTabBarVisible(m.id);
    const navHtml = showNav ? renderTabBar(m.tab || 'Now') : '';
    return `
      <div class="grid-item">
        <div class="grid-item-header">
          <span>${m.title}</span>
          <button type="button" class="dev-btn" data-grid-focus="${m.id}" style="padding:3px 10px; font-size:11px;">Focus</button>
        </div>
        <div class="phone-frame">
          ${contentHtml}
          ${navHtml}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('[data-grid-focus]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-grid-focus');
      _isGridMode = false;
      document.getElementById('interactiveStage')?.classList.remove('hidden');
      document.getElementById('gridStage')?.classList.remove('active');
      const toggleGridBtn = document.getElementById('toggleGridBtn');
      if (toggleGridBtn) toggleGridBtn.textContent = 'All Screens Grid';
      jumpToView(targetId);
    });
  });
}

// Auto-boot when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
  } else {
    bootApp();
  }
}
