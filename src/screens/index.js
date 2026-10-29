/* ==========================================================================
   CNU FREE V2 — SCREEN & OVERLAY DISPATCHER (src/screens/index.js)
   Renders any canonical route or direct view ID (1..40) + active overlay
   + floating bottom tab bar + toast bar.
   ========================================================================== */

import { renderNowScreen } from './now.js';
import { renderOverlapScreen } from './overlap.js';
import { renderFriendScheduleScreen } from './friend-schedule.js';
import { renderFriendsScreen } from './friends.js';
import { renderGroupDetailScreen, renderGroupFormScreen } from './group-detail.js';
import { renderFindFriendsScreen, renderRequestsScreen } from './find-friends.js';
import { renderInboxScreen } from './inbox.js';
import { renderMyScheduleScreen, renderClassFormScreen } from './my-schedule.js';
import {
  renderPrivacySharingScreen,
  renderSelectedFriendsPickerScreen,
  renderPublicShareScreen
} from './privacy-sharing.js';
import {
  renderMeScreen,
  renderNotificationSettingsScreen,
  renderBlockedPeopleScreen
} from './me.js';
import {
  renderWelcomeScreen,
  renderAuthScreen,
  renderImportUploadScreen,
  renderOcrLoadingScreen,
  renderOcrErrorScreen,
  renderOcrReviewScreen,
  renderOcrSuccessScreen
} from './auth-onboarding.js';

import { renderTabBar, isTabBarVisible } from '../ui/tabbar.js';
import {
  renderRemoveFriendDialog,
  renderBlockUserDialog,
  renderSignOutDialog,
  renderDeleteAccountDialog,
  renderConfirmDialog
} from '../ui/dialog.js';
import {
  renderShareLinkSheet,
  renderEditProfileSheet,
  renderRenameGroupSheet,
  renderFriendActionSheet,
  renderOverlapFriendPickerSheet,
  renderCancelPendingRequestSheet
} from '../ui/sheet.js';
import { renderToastBar, getActiveToast } from '../ui/toast.js';
import { selectFriendById } from '../store.js';
import { normalizeScreenId } from '../router.js';

/**
 * Renders the inner content of a screen (without tabbar/toast) for either
 * the primary interactive frame or the 40-screen grid explorer.
 */
export function renderBaseScreenContent(rawId, state, { isStandalonePreview = false } = {}) {
  const id = normalizeScreenId(rawId);

  switch (id) {
    case '1':
      return renderNowScreen(state);
    case '2':
      return renderOverlapScreen(state);
    case '3':
      return renderFriendScheduleScreen(state, 'day');
    case '4':
      return renderOcrReviewScreen(state);
    case '5':
      return renderPrivacySharingScreen(state);
    case '6':
      return renderFriendsScreen(state, isStandalonePreview ? 'normal' : null);
    case '7':
      return renderInboxScreen(state, isStandalonePreview ? 'normal' : null);
    case '8':
      return renderMyScheduleScreen(state, 'week');
    case '9':
      return renderClassFormScreen(state);
    case '10':
      return renderGroupDetailScreen(state);
    case '11':
      return renderFindFriendsScreen(state);
    case '12': {
      const friend = selectFriendById(state, state.ui.targetFriendIdForDialog || 'gian');
      return `${renderFriendsScreen(state, 'normal')}${renderRemoveFriendDialog(friend)}`;
    }
    case '13': {
      return `${renderInboxScreen(state, 'normal')}${renderBlockUserDialog(state.ui.targetUserForBlock, isStandalonePreview)}`;
    }
    case '14':
      return `${renderMeScreen(state)}${renderShareLinkSheet(state)}`;
    case '15':
      return renderNotificationSettingsScreen(state);
    case '16':
      return `${renderMeScreen(state)}${renderEditProfileSheet(state)}`;
    case '17':
      return `${renderMeScreen(state)}${renderSignOutDialog(state.user.username)}`;
    case '18':
      return renderInboxScreen(state, 'empty');
    case '19':
      return renderInboxScreen(state, 'loading');
    case '20':
      return renderInboxScreen(state, 'error');
    case '21':
      return renderFriendsScreen(state, 'empty');
    case '22':
      return renderFriendsScreen(state, 'loading');
    case '23':
      return renderFriendsScreen(state, 'error');
    case '24':
      return renderOcrLoadingScreen(state);
    case '25':
      return renderOcrErrorScreen(state);
    case '26':
      return renderWelcomeScreen(state);
    case '27':
      return renderAuthScreen(state);
    case '28':
      return renderImportUploadScreen(state);
    case '29':
      return renderOcrSuccessScreen(state);
    case '30':
      return renderMeScreen(state);
    case '31':
      return `${renderMeScreen(state)}${renderDeleteAccountDialog(state.user.username)}`;
    case '32':
      return renderRequestsScreen(state);
    case '33':
      return renderGroupFormScreen(state);
    case '34':
      return renderSelectedFriendsPickerScreen(state);
    case '35':
      return renderFriendScheduleScreen(state, 'week');
    case '36': {
      const savedIds = state.ui.overlapParticipantIds || [];
      const hasPrivate = savedIds.some((pid) => {
        const f = state.friends.find((fr) => fr.id === pid);
        return f && (f.shareLevelToUser === 'private' || f.shareLevelToUser === 'none');
      });
      if (!hasPrivate) {
        const cloneFriends = state.friends.map((f) =>
          f.id === 'jellah' ? { ...f, shareLevelToUser: 'private' } : f
        );
        const clone = {
          ...state,
          friends: cloneFriends,
          ui: { ...state.ui, overlapParticipantIds: ['francis', 'gian', 'jellah'] }
        };
        return renderOverlapScreen(clone);
      }
      return renderOverlapScreen(state);
    }
    case '37':
      return renderMyScheduleScreen(state, 'day');
    case '38':
      return renderPublicShareScreen(state);
    case '39':
      return renderBlockedPeopleScreen(state);
    case '40':
      return `${renderGroupDetailScreen(state)}${renderRenameGroupSheet(state)}`;
    default:
      return renderNowScreen(state);
  }
}

/**
 * Renders the active overlay (dialog or bottom sheet) if one is open on the router.
 */
export function renderActiveOverlay(overlay, state) {
  if (!overlay) return '';

  switch (overlay.name) {
    case 'remove-friend': {
      const friendId = overlay.payload?.friendId || state.ui.targetFriendIdForDialog || 'gian';
      const friend = selectFriendById(state, friendId);
      return renderRemoveFriendDialog(friend);
    }
    case 'block-user': {
      const personId = overlay.payload?.personId;
      const target = personId
        ? selectFriendById(state, personId) || state.ui.targetUserForBlock
        : state.ui.targetUserForBlock;
      return renderBlockUserDialog(target, false);
    }
    case 'share-link':
      return renderShareLinkSheet(state);
    case 'edit-profile':
      return renderEditProfileSheet(state);
    case 'sign-out':
      return renderSignOutDialog(state.user.username);
    case 'delete-account':
      return renderDeleteAccountDialog(state.user.username);
    case 'rename-group':
      return renderRenameGroupSheet(state);
    case 'friend-actions': {
      const friend = selectFriendById(state, overlay.payload?.friendId);
      return renderFriendActionSheet(friend, state.groups);
    }
    case 'overlap-picker':
      return renderOverlapFriendPickerSheet(state);
    case 'cancel-pending-request': {
      const person =
        state.outgoingRequests.find((r) => r.id === overlay.payload?.personId) ||
        state.directoryPeople.find((p) => p.id === overlay.payload?.personId);
      return renderCancelPendingRequestSheet(person);
    }
    case 'confirm-dialog':
      return renderConfirmDialog(overlay.payload || {});
    default:
      return '';
  }
}

/**
 * Full phone frame render (screen + tab bar + overlay + toast).
 */
export function renderAppViewport(routerState, state, activeScreenId) {
  const screenHtml = renderBaseScreenContent(activeScreenId, state, { isStandalonePreview: false });
  const showTabBar = isTabBarVisible(routerState.currentViewId || activeScreenId);
  const tabBarHtml = showTabBar ? renderTabBar(routerState.activeTab) : '';
  const overlayHtml = renderActiveOverlay(routerState.overlay, state);
  const toastHtml = renderToastBar(getActiveToast());
  const transitionClass =
    routerState.transition === 'push'
      ? 'anim-push'
      : routerState.transition === 'pop'
      ? 'anim-pop'
      : '';

  return `
    <div class="screen-stage ${transitionClass}" data-current-view="${routerState.currentViewId}">
      ${screenHtml}
    </div>
    ${tabBarHtml}
    ${overlayHtml}
    ${toastHtml}
  `;
}
