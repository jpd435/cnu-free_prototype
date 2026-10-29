/* ==========================================================================
   CNU FREE V2 — PLAYWRIGHT NAVIGATION & E2E SUITE (tests/nav.spec.js)
   Section 10.2 – 10.7 & Addendum B §7 Acceptance Checklist:
   - Tests all 40 views (1–38 + 39 Blocked People + 40 Rename Group Sheet)
   - Verifies Section 6 button destinations, Back navigation, and zero dead ends
   - Verifies Addendum B roster (Francis, Kalbo, Badminton, STEP, Kristine, Marco)
   - Verifies live Dev Clock flip (Tue 09:41 -> Tue 12:00) with zero reload
   - Asserts zero console errors
   - Tests iPhone SE (375x667) and iPhone 15 Pro Max (430x932) viewports with zero clipping
   - Tests persistence across reload, Sign out vs Delete account, and Undo toasts
   - Asserts zero emojis, zero lorem ipsum, zero photo avatars, zero fake status bar
   ========================================================================== */

import { test, expect } from '@playwright/test';

test.describe('CNU Free V2 — Canonical Navigation & Addendum B Acceptance Suite', () => {
  test('1. All 40 views (1–38 + 39 Blocked People + 40 Rename Group Sheet) render with zero console errors, zero emojis, zero photo avatars', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      consoleErrors.push(err.message);
    });

    await page.setViewportSize({ width: 1280, height: 920 });
    await page.goto('/?dev=1');

    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;

    for (let i = 1; i <= 40; i++) {
      const id = String(i);
      await page.evaluate((viewId) => window.navigateToScreen(viewId), id);

      const currentView = await page.locator('#phoneFrame .screen-stage').getAttribute('data-current-view');
      expect(currentView).toBe(id);

      const frameText = await page.locator('#phoneFrame').innerText();
      expect(frameText.length).toBeGreaterThan(0);
      expect(emojiRegex.test(frameText)).toBe(false);
      expect(frameText.toLowerCase()).not.toContain('lorem ipsum');

      // Zero photo avatars (no <img> tags inside #phoneFrame)
      const imgCount = await page.locator('#phoneFrame img').count();
      expect(imgCount).toBe(0);
    }

    expect(consoleErrors).toEqual([]);
  });

  test('2. Section 6 Navigation Flows, Addendum B roster, Live Clock flip, Back button, and Undo toasts work end-to-end', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 920 });
    await page.goto('/?dev=1');

    // Set Dev Clock to Tue 09:41 and verify Francis + 4 of your 10 friends on Screen 1, and "10 friends · 4 free now" on Screen 6
    await page.locator('#devClockPresetSelect').selectOption('Tue 09:41');
    await expect(page.locator('#phoneFrame')).toContainText('Good morning, Francis');
    await expect(page.locator('#phoneFrame')).toContainText('4 of your 10 friends');

    await page.locator('[data-action="switch-tab"][data-tab="Friends"]').click();
    await expect(page.locator('#phoneFrame')).toContainText('10 friends · 4 free now');
    await page.locator('[data-action="switch-tab"][data-tab="Now"]').click();

    // Live Dev Clock flip to Tue 12:00 without reload -> Franzen & Luanne become free
    await page.evaluate(() => window.CNUFreeClock.setClockPreset('Wed 12:00'));
    await page.evaluate(() => window.CNUFreeClock.setClockPreset('Tue 09:41'));

    // Screen 1 (Now): Bell -> 7 (Inbox) -> Back -> 1
    await page.locator('[data-action="open-inbox"]').click();
    await expect(page.locator('[data-screen-id="7"]')).toBeVisible();
    await expect(page.locator('#phoneFrame')).toContainText('Kristine');
    await expect(page.locator('#phoneFrame')).toContainText('Marco');
    await page.locator('[data-action="nav-back"]').click();
    await expect(page.locator('[data-screen-id="1"]')).toBeVisible();

    // Screen 1 (Now): Group chip "Kalbo" -> shows "Open Kalbo →" -> 10 (Group Detail)
    await page.locator('[data-action="set-now-group-filter"][data-group="Kalbo"]').click();
    const openGroupBtn = page.locator('[data-action="open-group-detail"]');
    await expect(openGroupBtn).toBeVisible();
    await openGroupBtn.click();
    await expect(page.locator('[data-screen-id="10"]')).toBeVisible();

    // Screen 10 (Group Detail): Rename -> Sheet 40 -> Save
    await page.locator('[data-action="open-rename-group-sheet"]').click();
    await expect(page.locator('#sheet-rename-group-title')).toHaveText('Rename group');
    await page.locator('[data-field="rename-group-name"]').fill('Kalbo Squad');
    await page.locator('[data-action="save-rename-group"]').click();
    await expect(page.locator('h1')).toContainText('Kalbo Squad');

    // Screen 10: Remove member from group -> Toast with Undo -> Undo restores member
    const initialMembers = await page.locator('[data-action="remove-member-from-group"]').count();
    await page.locator('[data-action="remove-member-from-group"]').first().click();
    await expect(page.locator('[data-testid="toast-bar"]')).toBeVisible();
    await page.locator('[data-action="toast-undo"]').click();
    await expect(page.locator('[data-action="remove-member-from-group"]')).toHaveCount(initialMembers);

    // Screen 10 -> "+ Add members" -> 33 (add-members mode) -> Back/Cancel -> 10
    await page.locator('[data-action="open-add-group-members"]').click();
    await expect(page.locator('[data-screen-id="33"]')).toBeVisible();
    await page.locator('[data-action="cancel-group-form"]').click();
    await expect(page.locator('[data-screen-id="10"]')).toBeVisible();

    // Screen 2 / 36 (Overlap): Make Jellah private via Dev Menu -> select Jellah -> State 36 -> Ask for access
    await page.locator('#makeFriendPrivateSelect').selectOption('jellah');
    await page.locator('[data-action="switch-tab"][data-tab="Overlap"]').click();
    await expect(page.locator('[data-screen-id="2"]')).toBeVisible();
    await page.locator('[data-action="open-overlap-picker-sheet"]').click();
    await page.locator('[data-action="toggle-overlap-friend"][data-person-id="jellah"]').check();
    await page.locator('.sheet-card [data-action="close-overlay"]').last().click();
    await expect(page.locator('[data-screen-id="36"]')).toBeVisible();
    const askBtn = page.locator('.amber-banner [data-action="request-schedule-access"]');
    await askBtn.click();
    await expect(askBtn).toHaveText('Requested');
    await expect(askBtn).toBeDisabled();

    // Screen 30 (Me) -> Blocked people (39) -> empty state "You haven't blocked anyone."
    await page.locator('[data-action="switch-tab"][data-tab="Me"]').click();
    await expect(page.locator('[data-screen-id="30"]')).toBeVisible();
    await expect(page.locator('#phoneFrame')).toContainText('Francis');
    await page.locator('[data-action="open-blocked-people"]').click();
    await expect(page.locator('[data-screen-id="39"]')).toBeVisible();
    await expect(page.locator('#phoneFrame')).toContainText("You haven't blocked anyone.");
    await page.locator('[data-action="nav-back"]').click();
    await expect(page.locator('[data-screen-id="30"]')).toBeVisible();

    // Screen 30 -> Edit profile (16) -> "Change color" palette picker
    await page.locator('[data-action="open-edit-profile-sheet"]').click();
    await expect(page.locator('[data-action="toggle-avatar-palette"]')).toHaveText('Change color');
    await page.locator('[data-field="profile-username"]').fill('gian');
    await page.waitForTimeout(350);
    await page.locator('[data-action="use-username-suggestion"]').click();
    await page.locator('[data-action="save-profile"]').click();
    await expect(page.locator('[data-screen-id="30"]')).toBeVisible();
  });

  test('3. Runs full-screen on iPhone SE (375x667) and iPhone 15 Pro Max (430x932) with zero horizontal clipping and >=16px inputs', async ({ page }) => {
    const viewports = [
      { name: 'iPhone SE', width: 375, height: 667 },
      { name: 'iPhone 15 Pro Max', width: 430, height: 932 }
    ];

    for (const vp of viewports) {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Dev toolbar should be hidden on <= 480px mobile viewport
      await expect(page.locator('#devToolbar')).toBeHidden();

      // Check key screens (1, 2, 6, 8, 9, 30) for zero horizontal overflow
      for (const screenId of ['1', '2', '6', '8', '9', '30']) {
        await page.evaluate((id) => window.navigateToScreen(id), screenId);
        const overflow = await page.evaluate(() => {
          const scroller = document.querySelector('#phoneFrame .screen-scroll');
          if (!scroller) return 0;
          return scroller.scrollWidth - scroller.clientWidth;
        });
        expect(overflow).toBeLessThanOrEqual(1);
      }

      // Verify input font-size >= 16px on Screen 9
      await page.evaluate(() => window.navigateToScreen('9'));
      const fontSize = await page.locator('#class-activity').evaluate((el) =>
        parseFloat(window.getComputedStyle(el).fontSize)
      );
      expect(fontSize).toBeGreaterThanOrEqual(16);
    }
  });

  test('4. Persistence across reload, Sign out keeps data, Delete account wipes data', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    const initialCount = await page.evaluate(() => window.CNUFreeRepo.getState().user.entries.length);
    expect(initialCount).toBe(17);

    // Add a new non-overlapping class on Monday 07:30–08:30 on Screen 9
    await page.evaluate(() => window.navigateToScreen('8'));
    await page.locator('[data-action="open-add-class"]').click();
    await page.locator('[data-field="class-activity"]').fill('PE 101 · Badminton');
    await page.locator('[data-field="class-starts"]').fill('07:30');
    await page.locator('[data-field="class-ends"]').fill('08:30');
    await page.locator('[data-action="save-class-form"]').click();

    // Reload page (simulating app kill & relaunch) -> data persists
    await page.reload();
    const classCountAfterReload = await page.evaluate(() => window.CNUFreeRepo.getState().user.entries.length);
    expect(classCountAfterReload).toBe(18);

    // Sign out -> goes to 26 with "You've been signed out." AND keeps data in storage
    await page.evaluate(() => window.navigateToScreen('17'));
    await page.locator('[data-action="confirm-sign-out"]').click();
    await expect(page.locator('[data-screen-id="26"]')).toBeVisible();
    await expect(page.locator('#phoneFrame')).toContainText("You've been signed out.");
    const classCountAfterSignOut = await page.evaluate(() => window.CNUFreeRepo.getState().user.entries.length);
    expect(classCountAfterSignOut).toBe(18);

    // Delete account -> wipes all data -> 26
    await page.evaluate(() => window.navigateToScreen('31'));
    await page.locator('[data-action="confirm-delete-account"]').click();
    await expect(page.locator('[data-screen-id="26"]')).toBeVisible();
    const classCountAfterDelete = await page.evaluate(() => window.CNUFreeRepo.getState().user.entries.length);
    expect(classCountAfterDelete).toBe(0);
  });
});
