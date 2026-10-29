/* ==========================================================================
   CNU FREE V2 — FLOATING BOTTOM TAB BAR (src/ui/tabbar.js)
   Section 6.0:
   - Each tab (Now, Friends, Overlap, Me) keeps its own stack.
   - Tapping the active tab pops to its root.
   - Tab bar visible on: 1, 2, 6, 30 and their children 3, 35, 10, 11, 8, 37, 5, 15, 39.
   - Hidden on: 4, 7, 9, 24, 25, 26, 27, 28, 29, 32, 33, 34, 38.
   ========================================================================== */

import { ICONS } from './icons.js';

export const TAB_VISIBLE_SCREENS = new Set([
  '1', '2', '6', '30',
  '3', '35', '10', '11', '8', '37', '5', '15', '39',
  // Also visible when viewing states of Friends (21, 22, 23) or Overlap (36) or overlays over tab screens (12, 13, 14, 16, 17, 31, 40)
  '21', '22', '23', '36',
  '12', '13', '14', '16', '17', '31', '40'
]);

export function isTabBarVisible(screenId) {
  return TAB_VISIBLE_SCREENS.has(String(screenId));
}

export function renderTabBar(activeTab = 'Now') {
  const tabs = [
    { id: 'Now', label: 'Now', screen: '1', icon: ICONS.clock },
    { id: 'Friends', label: 'Friends', screen: '6', icon: ICONS.users },
    { id: 'Overlap', label: 'Overlap', screen: '2', icon: ICONS.overlap },
    { id: 'Me', label: 'Me', screen: '30', icon: ICONS.user }
  ];

  return `
    <nav class="bottom-nav-wrap" aria-label="Primary navigation">
      <div class="bottom-nav">
        ${tabs
          .map((t) => {
            const isActive = t.id === activeTab;
            return `
              <button
                type="button"
                class="nav-item ${isActive ? 'active' : ''}"
                data-action="switch-tab"
                data-tab="${t.id}"
                data-screen="${t.screen}"
                aria-current="${isActive ? 'page' : 'false'}"
              >
                ${t.icon}
                <span>${t.label}</span>
              </button>
            `;
          })
          .join('')}
      </div>
    </nav>
  `;
}
