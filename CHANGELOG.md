# Changelog (`CHANGELOG.md`)

## Phase 0 — Audit
- Saved original specification to `docs/SPEC_V1.md` and recorded V2 architectural decisions in `DECISIONS.md`.
- Audited all 38 V1 views (`Screen 1` – `Screen 38`) in `AUDIT.md`, documenting every route ID, entry path, tappable element, current V1 destination, and all domain logic, validation, privacy, and navigation gaps relative to SPEC V2.

## Phase 1 — Domain Logic
- Extracted time representation (`0..1440` minutes since midnight, `Mon=0..Sun=6`, `7:00–21:00` visible window, live real-time clock + dev clock in `src/clock.js`) and `status(person, now, viewer)` into `src/time.js`.
- Implemented strict privacy resolution (`per-person override > group rule > global audience`) in `src/privacy.js` and private friend exclusion from availability counts and overlap calculations.
- Built the interval overlap solver (`overlap(participants[], dayIndex)`), next-day fallback finder, and `bestWindowForMostPeople` ranking in `src/overlap.js`.
- Added class/activity validation (title, `start < end` min 15m, weekday selection, self-overlap detection), username validation (`[a-z0-9._]`, reserved/taken list with suggestion), auth validation, and group name validation in `src/validators.js`.
- Created mock OCR service (`src/ocr-mock.js`), canonical seed state + schema migration (`src/seed.js`), Capacitor native bridge (`src/native.js`), and central repository (`repo.getState`, `repo.dispatch`, selectors, and 5-second Undo snapshots in `src/store.js`).

## Phase 2 — Navigation & Modular UI
- Refactored the monolithic V1 `screens.js` into modular UI components (`src/ui/icons.js`, `avatar.js`, `tabbar.js`, `toast.js`, `dialog.js`, `sheet.js`) and route modules (`src/screens/now.js`, `overlap.js`, `friend-schedule.js`, `friends.js`, `group-detail.js`, `find-friends.js`, `inbox.js`, `my-schedule.js`, `privacy-sharing.js`, `me.js`, `auth-onboarding.js`, `index.js`).
- Implemented the multi-tab stack router (`src/router.js`) with independent `Now`, `Friends`, `Overlap`, and `Me` stacks, active-tab pop-to-root, auth stack replacement, canonical tab bar visibility rules, and parameterized states (`18–23`, `36`) and modes (`3/35`, `8/37`, `27`).
- Added **Screen 39 (`Blocked People`)** and **Screen 40 (`Rename Group Sheet`)**, plus every SPEC V2 §6 & §7 interaction (`"Open [Group]"` button on Now, `"Add your timetable"` empty-classes card, `"Ask [First] for access"` private overlap & schedule states, friend `"⋯"` action sheet, inbox Decline with Undo + `"⋯"` Block, `"Change color"` avatar palette picker, and `#/s/[linkId]` public share states).

## Phase 3 — Mobile Conversion (Capacitor iOS)
- Configured Vite (`vite.config.js`, output `dist/`) and Capacitor iOS (`capacitor.config.json`, `appId: "com.cnufree.app"`, `appName: "CNU Free"`, `webDir: "dist"`).
- Self-hosted `@fontsource/bricolage-grotesque` (700/800) and `@fontsource/manrope` (500/700/800) for 100% offline / Airplane Mode operation, removing external Google Fonts `<link>` tags.
- Updated `index.html` (`viewport-fit=cover`) and `src/styles.css` for full-screen rendering inside Capacitor or `<= 480px` viewports (`100dvh`, `env(safe-area-inset-*)`, floating tab bar `18px` above bottom safe-area inset, `font-size >= 16px` on inputs, `touch-action: manipulation`, and slide/sheet/dialog motion transitions respecting `prefers-reduced-motion`).
- Generated the native Xcode project in `ios/` (`npx cap add ios`), added iOS camera/photo permissions to `Info.plist`, and installed custom ink (`#0B1B16`) + mint (`#6CF2A2`) overlapping-circles app icons and splash screens (`resources/icon.png`, `resources/splash.png`).

## Phase 4 — States, Validation, Accessibility & Automated Tests
- Verified all parameterized states (`18–23`, `36`), modes (`3/35`, `8/37`, `27`), and new screens (`Screen 39` Blocked People, `Screen 40` Rename Group Sheet).
- Enforced WCAG AA `>= 4.5:1` contrast, `>= 44x44px` touch targets, `font-size >= 16px` on all inputs, `aria-hidden="true"` on decorative SVGs, `role="dialog"` / `aria-modal="true"` with focus trap and `Esc` close on modals/sheets, and zero horizontal overflow at both `375x667` (iPhone SE) and `430x932` (iPhone 15 Pro Max).

## Phase 5 — Addendum B: Real Roster Data (`146` Entries) + Live Real-Time Clock (`src/clock.js`)
- Purged all legacy sample names and fixtures across the entire codebase, tests, and documentation.
- Saved verbatim roster data in `data/roster_source.txt` and generated `src/seed.js` with **Francis** (`@francis`, `FR`, `Asia/Manila`, 17 entries), 10 friends (`Gian` 23, `Franzen` 10, `Thea` 11, `Hershey` 11, `Ella` 15, `Dane` 11, `Danica` 10, `Gelie` 15, `Luanne` 10, `Jellah` 13 — total `146` entries), 3 groups (`Kalbo` 7, `Badminton` 2, `STEP` 1), 4 MOCK non-friends (`Kristine`, `Marco`, `Mika Reyes`, `Paolo Cruz` with empty schedules showing `"No timetable yet"`), inbox notifications, and `cnufree.com/s/francis_8472` share links.
- Expanded the visible schedule window to `7:00–21:00` (`420..1260`, 14 hours, `7A`–`9P`) across all timelines (`Screens 2, 3, 8, 35, 37, 38`) with scrollable timeline cards and automatic scroll positioning ~1h above current time.
- Built `src/clock.js` with real-time minute boundary ticking, exact boundary timers for upcoming `start`/`end` class transitions across all visible schedules, `visibilitychange` resync, midnight rollover, 200ms `Free ↔ Busy` pill crossfades, and Dev Menu controls (`Live` | presets `Mon 09:30`, `Tue 09:41`, `Wed 12:00`, `Sat 20:30`, `Sun 10:00` | speed `1×, 60×, 600×` | `"Simulate schedule change"` | per-friend `"Make [friend] private"` toggles | `"Load sample data"` / `"Reset to clean"`).
- Verified all 9 Addendum B acceptance tests in `tests/logic.test.js` (Vitest) and `tests/nav.spec.js` (Playwright).
