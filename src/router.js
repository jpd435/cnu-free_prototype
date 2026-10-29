/* ==========================================================================
   CNU FREE V2 — MULTI-TAB STACK ROUTER (src/router.js)
   Section 6.0:
   - Each tab (Now, Friends, Overlap, Me) keeps its own stack.
   - Tapping the active tab pops to its root.
   - The tab highlighted is the tab where the flow started.
   - Auth changes REPLACE the whole stack (no Back into Welcome or Sign in).
   - States & modes are parameters on their parent screen, while every view
     ID (1–40 and S01–S38) remains directly addressable for the dev switcher
     and Playwright navigation tests.
   ========================================================================== */

import { repo } from './store.js';
import { saveDialogFocusOrigin, restoreDialogFocusOrigin } from './ui/dialog.js';

export const TAB_ROOTS = {
  Now: '1',
  Friends: '6',
  Overlap: '2',
  Me: '30'
};

export const SCREEN_META = [
  { id: '1', sCode: 'S01', title: 'Screen 1: Now (Home)', tab: 'Now' },
  { id: '2', sCode: 'S02', title: 'Screen 2: Overlap (All Shared)', tab: 'Overlap' },
  { id: '3', sCode: 'S03', title: 'Screen 3: Friend Schedule (Day)', tab: 'Friends' },
  { id: '4', sCode: 'S04', title: 'Screen 4: Import Timetable Review', tab: 'Me' },
  { id: '5', sCode: 'S05', title: 'Screen 5: Privacy & Sharing', tab: 'Me' },
  { id: '6', sCode: 'S06', title: 'Screen 6: Friends List & Groups', tab: 'Friends' },
  { id: '7', sCode: 'S07', title: 'Screen 7: Inbox ( populated )', tab: 'Now' },
  { id: '8', sCode: 'S08', title: 'Screen 8: My Week', tab: 'Me' },
  { id: '9', sCode: 'S09', title: 'Screen 9: Add / Edit a Class', tab: 'Me' },
  { id: '10', sCode: 'S10', title: 'Screen 10: Group Detail', tab: 'Friends' },
  { id: '11', sCode: 'S11', title: 'Screen 11: Find Friends', tab: 'Friends' },
  { id: '12', sCode: 'S12', title: 'Screen 12: Remove Friend Dialog', tab: 'Friends' },
  { id: '13', sCode: 'S13', title: 'Screen 13: Block User Dialog & Toast', tab: 'Now' },
  { id: '14', sCode: 'S14', title: 'Screen 14: Share Link Sheet', tab: 'Me' },
  { id: '15', sCode: 'S15', title: 'Screen 15: Notification Settings', tab: 'Me' },
  { id: '16', sCode: 'S16', title: 'Screen 16: Edit Profile Sheet', tab: 'Me' },
  { id: '17', sCode: 'S17', title: 'Screen 17: Sign Out Dialog', tab: 'Me' },
  { id: '18', sCode: 'S18', title: 'Screen 18: Inbox — All Caught Up', tab: 'Now' },
  { id: '19', sCode: 'S19', title: 'Screen 19: Inbox — Loading Skeleton', tab: 'Now' },
  { id: '20', sCode: 'S20', title: 'Screen 20: Inbox — Offline Error', tab: 'Now' },
  { id: '21', sCode: 'S21', title: 'Screen 21: Friends — Empty State', tab: 'Friends' },
  { id: '22', sCode: 'S22', title: 'Screen 22: Friends — Loading Skeleton', tab: 'Friends' },
  { id: '23', sCode: 'S23', title: 'Screen 23: Friends — Error State', tab: 'Friends' },
  { id: '24', sCode: 'S24', title: 'Screen 24: Import — Reading Timetable', tab: 'Me' },
  { id: '25', sCode: 'S25', title: 'Screen 25: Import — Unreadable Photo', tab: 'Me' },
  { id: '26', sCode: 'S26', title: 'Screen 26: Signed Out / Welcome', tab: 'Now' },
  { id: '27', sCode: 'S27', title: 'Screen 27: Sign In / Create Account', tab: 'Now' },
  { id: '28', sCode: 'S28', title: 'Screen 28: Import Timetable Upload', tab: 'Me' },
  { id: '29', sCode: 'S29', title: 'Screen 29: Timetable Saved Success', tab: 'Me' },
  { id: '30', sCode: 'S30', title: 'Screen 30: Me (Profile & Settings Hub)', tab: 'Me' },
  { id: '31', sCode: 'S31', title: 'Screen 31: Delete Account Dialog', tab: 'Me' },
  { id: '32', sCode: 'S32', title: 'Screen 32: Friend Requests (Received/Sent)', tab: 'Friends' },
  { id: '33', sCode: 'S33', title: 'Screen 33: Create / Edit Group', tab: 'Friends' },
  { id: '34', sCode: 'S34', title: 'Screen 34: Selected Friends Picker', tab: 'Me' },
  { id: '35', sCode: 'S35', title: 'Screen 35: Friend Schedule (Week)', tab: 'Friends' },
  { id: '36', sCode: 'S36', title: 'Screen 36: Overlap — Private State', tab: 'Overlap' },
  { id: '37', sCode: 'S37', title: 'Screen 37: My Day', tab: 'Now' },
  { id: '38', sCode: 'S38', title: 'Screen 38: Public Shared Schedule Web View', tab: 'Me' },
  { id: '39', sCode: 'S39', title: 'Screen 39: Blocked People', tab: 'Me' },
  { id: '40', sCode: 'S40', title: 'Screen 40: Rename Group Sheet', tab: 'Friends' }
];

const OVERLAY_SCREENS = {
  '12': { type: 'dialog', name: 'remove-friend', baseScreen: '6' },
  '13': { type: 'dialog', name: 'block-user', baseScreen: '7' },
  '14': { type: 'sheet', name: 'share-link', baseScreen: '30' },
  '16': { type: 'sheet', name: 'edit-profile', baseScreen: '30' },
  '17': { type: 'dialog', name: 'sign-out', baseScreen: '30' },
  '31': { type: 'dialog', name: 'delete-account', baseScreen: '30' },
  '40': { type: 'sheet', name: 'rename-group', baseScreen: '10' }
};

let _routerState = {
  activeTab: 'Now',
  stacks: {
    Now: ['1'],
    Friends: ['6'],
    Overlap: ['2'],
    Me: ['30']
  },
  authStack: null, // null when logged in; ['26'] or ['26', '27'] when in auth flow
  overlay: null,   // { type: 'dialog'|'sheet', name, payload, viewId }
  transition: 'none', // 'push' | 'pop' | 'tab' | 'none'
  currentViewId: '1' // Canonical 1..40 ID for dev bar / testing
};

let _onRouteChanged = null;

export function normalizeScreenId(id) {
  if (!id) return '1';
  const str = String(id).trim();
  if (/^S\d{2}$/i.test(str)) {
    return String(parseInt(str.slice(1), 10));
  }
  return str;
}

export function configureRouter(onRouteChanged) {
  _onRouteChanged = onRouteChanged;
}

export function getRouterState() {
  return _routerState;
}

export function getActiveScreenId() {
  if (_routerState.authStack && _routerState.authStack.length > 0) {
    return _routerState.authStack[_routerState.authStack.length - 1];
  }
  const stack = _routerState.stacks[_routerState.activeTab] || ['1'];
  return stack[stack.length - 1] || '1';
}

export function canPopCurrentStack() {
  if (_routerState.overlay) return true;
  if (_routerState.authStack && _routerState.authStack.length > 1) return true;
  const stack = _routerState.stacks[_routerState.activeTab] || [];
  return stack.length > 1;
}

function emitRouteChange() {
  if (_onRouteChanged) {
    _onRouteChanged(_routerState);
  }
}

/**
 * Switch bottom tab or pop active tab to root (Section 6.0)
 */
export function switchTab(tabName) {
  if (!TAB_ROOTS[tabName]) return;
  _routerState.authStack = null;
  _routerState.overlay = null;

  if (_routerState.activeTab === tabName) {
    // Tapping the active tab pops to its root
    _routerState.stacks[tabName] = [TAB_ROOTS[tabName]];
    _routerState.transition = 'pop';
  } else {
    _routerState.activeTab = tabName;
    if (!_routerState.stacks[tabName] || _routerState.stacks[tabName].length === 0) {
      _routerState.stacks[tabName] = [TAB_ROOTS[tabName]];
    }
    _routerState.transition = 'tab';
  }
  _routerState.currentViewId = getActiveScreenId();
  emitRouteChange();
}

/**
 * Push a screen onto the current (or target) tab stack
 */
export function pushScreen(rawScreenId, options = {}) {
  const screenId = normalizeScreenId(rawScreenId);

  // Check if this is an overlay screen (12, 13, 14, 16, 17, 31, 40)
  if (OVERLAY_SCREENS[screenId]) {
    const ov = OVERLAY_SCREENS[screenId];
    saveDialogFocusOrigin();
    if (options.ensureBase && getActiveScreenId() !== ov.baseScreen) {
      const meta = SCREEN_META.find((m) => m.id === ov.baseScreen);
      if (meta) {
        _routerState.activeTab = meta.tab;
        const st = _routerState.stacks[meta.tab];
        if (st[st.length - 1] !== ov.baseScreen) {
          st.push(ov.baseScreen);
        }
      }
    }
    _routerState.overlay = {
      type: ov.type,
      name: ov.name,
      viewId: screenId,
      payload: options.payload || {}
    };
    _routerState.currentViewId = screenId;
    emitRouteChange();
    return;
  }

  _routerState.overlay = null;

  // Auth screens (26, 27)
  if (screenId === '26') {
    _routerState.authStack = ['26'];
    _routerState.transition = options.transition || 'none';
    _routerState.currentViewId = '26';
    emitRouteChange();
    return;
  }
  if (screenId === '27') {
    _routerState.authStack = ['26', '27'];
    _routerState.transition = options.transition || 'push';
    _routerState.currentViewId = '27';
    emitRouteChange();
    return;
  }

  // Exiting auth stack
  _routerState.authStack = null;

  // Map states/modes to parent routes + state parameters (Section 6.0)
  applyScreenStateParams(screenId, options);

  const canonicalRoute = mapViewToCanonicalRoute(screenId);

  if (options.tab && TAB_ROOTS[options.tab]) {
    _routerState.activeTab = options.tab;
  }

  const stack = _routerState.stacks[_routerState.activeTab] || [TAB_ROOTS[_routerState.activeTab]];

  if (options.replaceStack) {
    _routerState.stacks[_routerState.activeTab] = [canonicalRoute];
    _routerState.transition = options.transition || 'none';
  } else if (options.swapInPlace && stack.length > 0) {
    stack[stack.length - 1] = canonicalRoute;
    _routerState.transition = 'none';
  } else {
    if (stack[stack.length - 1] !== canonicalRoute) {
      stack.push(canonicalRoute);
    }
    _routerState.transition = options.transition || 'push';
  }

  _routerState.currentViewId = screenId;
  emitRouteChange();
}

/**
 * Pop one screen from the current stack (or close active overlay)
 */
export function popScreen(fallbackScreenId = null) {
  if (_routerState.overlay) {
    _routerState.overlay = null;
    _routerState.currentViewId = getActiveScreenId();
    restoreDialogFocusOrigin();
    emitRouteChange();
    return;
  }

  if (_routerState.authStack && _routerState.authStack.length > 1) {
    _routerState.authStack.pop();
    _routerState.transition = 'pop';
    _routerState.currentViewId = _routerState.authStack[_routerState.authStack.length - 1];
    emitRouteChange();
    return;
  }

  const stack = _routerState.stacks[_routerState.activeTab] || [];
  if (stack.length > 1) {
    stack.pop();
    _routerState.transition = 'pop';
    _routerState.currentViewId = stack[stack.length - 1];
    emitRouteChange();
    return;
  }

  if (fallbackScreenId) {
    jumpToView(fallbackScreenId);
  }
}

/**
 * Open a custom modal dialog or bottom sheet (e.g., Friend action sheet, confirm dialog)
 */
export function openOverlay({ type = 'dialog', name, payload = {}, viewId = null }) {
  saveDialogFocusOrigin();
  _routerState.overlay = {
    type,
    name,
    payload,
    viewId: viewId || _routerState.currentViewId
  };
  if (viewId) {
    _routerState.currentViewId = viewId;
  }
  emitRouteChange();
}

export function closeOverlay() {
  if (!_routerState.overlay) return;
  _routerState.overlay = null;
  _routerState.currentViewId = getActiveScreenId();
  restoreDialogFocusOrigin();
  emitRouteChange();
}

/**
 * Replace all stacks (used on Auth sign-in/sign-out/delete-account, Section 6.0 & 6.1)
 */
export function resetStacksTo(screenId = '1') {
  const target = normalizeScreenId(screenId);
  _routerState.overlay = null;
  _routerState.stacks = {
    Now: ['1'],
    Friends: ['6'],
    Overlap: ['2'],
    Me: ['30']
  };
  if (target === '26' || target === '27') {
    _routerState.activeTab = 'Now';
    _routerState.authStack = target === '27' ? ['26', '27'] : ['26'];
    _routerState.currentViewId = target;
  } else if (target === '28') {
    _routerState.authStack = null;
    _routerState.activeTab = 'Now';
    _routerState.stacks.Now = ['1', '28'];
    _routerState.currentViewId = '28';
  } else {
    _routerState.authStack = null;
    _routerState.activeTab = 'Now';
    _routerState.currentViewId = target;
  }
  _routerState.transition = 'none';
  emitRouteChange();
}

/**
 * Direct jump to any of the 40 views (used by Dev Switcher & Playwright tests)
 */
export function jumpToView(rawViewId) {
  const viewId = normalizeScreenId(rawViewId);
  if (OVERLAY_SCREENS[viewId]) {
    const ov = OVERLAY_SCREENS[viewId];
    const meta = SCREEN_META.find((m) => m.id === ov.baseScreen);
    _routerState.authStack = null;
    if (meta) {
      _routerState.activeTab = meta.tab;
      const root = TAB_ROOTS[meta.tab];
      _routerState.stacks[meta.tab] = root === ov.baseScreen ? [root] : [root, ov.baseScreen];
    }
    // Reset default state on underlying screen so overlay renders cleanly
    applyScreenStateParams(ov.baseScreen, {});
    openOverlay({
      type: ov.type,
      name: ov.name,
      viewId,
      payload: {}
    });
    return;
  }

  if (viewId === '26' || viewId === '27') {
    resetStacksTo(viewId);
    return;
  }

  _routerState.authStack = null;
  _routerState.overlay = null;

  applyScreenStateParams(viewId, { fromDevJump: true });
  const canonical = mapViewToCanonicalRoute(viewId);
  const meta = SCREEN_META.find((m) => m.id === viewId) || SCREEN_META[0];
  const tab = meta.tab || 'Now';
  const root = TAB_ROOTS[tab];

  _routerState.activeTab = tab;
  if (canonical === root) {
    _routerState.stacks[tab] = [root];
  } else if (viewId === '4' || viewId === '24' || viewId === '25') {
    // Ensure Cancel on 4, 24, 25 pops back to 28 per Section 6.2
    _routerState.stacks[tab] = [root, '28', canonical];
  } else if (viewId === '34') {
    // Ensure Done/Back on 34 pops to 5 per Section 6.6
    _routerState.stacks[tab] = [root, '5', '34'];
  } else if (viewId === '9') {
    // Ensure Cancel/Save on 9 pops to 8 by default
    _routerState.stacks[tab] = [root, '8', '9'];
  } else {
    _routerState.stacks[tab] = [root, canonical];
  }
  _routerState.transition = 'none';
  _routerState.currentViewId = viewId;
  emitRouteChange();
}

function mapViewToCanonicalRoute(viewId) {
  switch (viewId) {
    case '18':
    case '19':
    case '20':
      return '7';
    case '21':
    case '22':
    case '23':
      return '6';
    case '35':
      return '3';
    case '36':
      return '2';
    case '37':
      return '8';
    default:
      return viewId;
  }
}

function applyScreenStateParams(viewId, options = {}) {
  const state = repo.getState();
  switch (viewId) {
    case '7':
      repo.dispatch('SET_UI', { inboxViewState: 'normal' });
      break;
    case '18':
      repo.dispatch('SET_UI', { inboxViewState: 'empty' });
      break;
    case '19':
      repo.dispatch('SET_UI', { inboxViewState: 'loading' });
      break;
    case '20':
      repo.dispatch('SET_UI', { inboxViewState: 'error' });
      break;
    case '6':
      repo.dispatch('SET_UI', { friendsViewState: 'normal' });
      break;
    case '21':
      repo.dispatch('SET_UI', { friendsViewState: 'empty' });
      break;
    case '22':
      repo.dispatch('SET_UI', { friendsViewState: 'loading' });
      break;
    case '23':
      repo.dispatch('SET_UI', { friendsViewState: 'error' });
      break;
    case '2':
      if (options.fromDevJump) {
        repo.dispatch('SET_OVERLAP_PARTICIPANTS', { participantIds: ['francis', 'gian', 'danica'] });
      }
      break;
    case '36': {
      // Overlap with a private friend selected
      const anyPrivate = state.friends.find(
        (f) => f.shareLevelToUser === 'private' || f.shareLevelToUser === 'none'
      );
      const privId = anyPrivate ? anyPrivate.id : 'jellah';
      if (!anyPrivate) {
        repo.dispatch('TOGGLE_FRIEND_PRIVATE', { friendId: privId, isPrivate: true });
      }
      if (!state.ui.overlapParticipantIds.includes(privId)) {
        repo.dispatch('SET_OVERLAP_PARTICIPANTS', { participantIds: ['francis', 'gian', privId] });
      }
      break;
    }
    case '3':
      repo.dispatch('SET_UI', {
        friendScheduleMode: 'day',
        ...(options.friendId ? { activeFriendId: options.friendId } : {})
      });
      break;
    case '35':
      repo.dispatch('SET_UI', {
        friendScheduleMode: 'week',
        ...(options.friendId ? { activeFriendId: options.friendId } : {})
      });
      break;
    case '8':
      repo.dispatch('SET_UI', { myScheduleMode: 'week' });
      break;
    case '37':
      repo.dispatch('SET_UI', { myScheduleMode: 'day' });
      break;
    default:
      break;
  }
}
