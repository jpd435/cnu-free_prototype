# Architectural & Product Decisions (`DECISIONS.md`)

1. **Time Representation, `7:00–21:00` Window & Live Clock (`src/clock.js`, `src/time.js`):**
   - All schedule start/end times are stored and computed as integer minutes since midnight (`0`–`1440`) using half-open intervals `[start, end)` (at `end`, the person is immediately free), with weekdays indexed `0` (`Mon`) through `6` (`Sun`).
   - Visible day window is `7:00` (`420`) to `21:00` (`1260`, 14 hours, labels `7A` to `9P`) to accommodate Saturday classes ending at `20:00` (`Gian`) and weekday evening classes (`Thea`, `Hershey` until `20:30`).
   - `src/clock.js` defaults to the live device clock (`mode: 'live'`), ticking on every minute boundary and scheduling exact timeouts for the next class `start` or `end` boundary across all visible schedules, plus resyncing on `document.visibilitychange`. The Dev Menu provides preset clocks (`Mon 09:30`, `Tue 09:41`, `Wed 12:00`, `Sat 20:30`, `Sun 10:00`) and speed multipliers (`1×`, `60×`, `600×`).

2. **Addendum B Real Roster (`data/roster_source.txt` & `src/seed.js`):**
   - The logged-in user is **Francis** (`@francis`, initials `FR`, time zone `Asia/Manila`).
   - All 10 friends (`Gian`, `Franzen`, `Thea`, `Hershey`, `Ella`, `Dane`, `Danica`, `Gelie`, `Luanne`, `Jellah`) share `'full'` schedules with Francis by default (`146` total schedule entries across Francis + 10 friends).
   - Each entry stores `title` (full text), `short` (title with all trailing parenthetical groups removed), and `detail` (the last parenthetical group, e.g., `Room 306`, `Online`, `302L`, `V505`).
   - Four `// MOCK` non-friends (`Kristine`, `Marco`, `Mika Reyes`, `Paolo Cruz`) start with empty schedules (`[]`), displaying `"No timetable yet"` on Screen 3 and counting as free all day.

3. **Privacy Resolution Order (`src/privacy.js`):**
   - Evaluated strictly in order: `perPersonOverride[viewerId]` > `bestGroupRule(viewerGroups)` > `globalAudience` (`only_me` → `'none'`, `friends` → `'free_busy'`, `selected` → `'none'` unless listed).
   - The Dev Menu includes per-friend `"Make [friend] private"` toggles (defaulting to `Luanne` for quick testing) so private lock states (`Screens 1, 3, 6, 10, 36`) can be tested at any time while keeping all 10 friends sharing `'full'` by default.

4. **Overlap Solver & Best Window Ranking (`src/overlap.js`):**
   - `overlap(participants, dayIndex)` computes the complement of each non-private participant's merged busy intervals within `[420, 1260]` (`7:00–21:00`), intersects all participants' free intervals, and filters out windows `< 30` minutes.
   - `bestWindowForMostPeople` evaluates subsets of `You` + friends free now or later today, ranking by `(participantCount DESC, duration DESC, start ASC)`.

5. **Navigation Stack & Mode Unification (`src/router.js`):**
   - Four independent tab stacks (`Now`, `Friends`, `Overlap`, `Me`) with root screens `'1'`, `'6'`, `'2'`, `'30'`.
   - States (`18/19/20` on Inbox `7`, `21/22/23` on Friends `6`, `36` on Overlap `2`) and modes (`3/35` day/week on Friend Schedule, `8/37` week/day on My Schedule, `27` sign-in/create) are parameterized on their parent route while remaining directly addressable by screen number (`1–40`) from the dev switcher and automated Playwright tests (`npm run test:nav`).

6. **Offline Fonts & Capacitor Native Plugins:**
   - Self-hosted `@fontsource/bricolage-grotesque` (`700.css`, `800.css`) and `@fontsource/manrope` (`500.css`, `700.css`, `800.css`) bundled by Vite into `dist/assets/` for 100% offline / Airplane Mode operation.
   - Capacitor plugins (`Preferences`, `Haptics`, `StatusBar`, `Keyboard`, `SplashScreen`, `App`, `Share`, `Clipboard`, `Browser`, `Camera`) are wrapped in a safe native bridge (`src/native.js`) that uses Capacitor's native implementation on iOS and graceful web fallbacks in standard browsers.

7. **Responsive Mobile Layout (`375px` – `430px`) & E2E Runner (`playwright.config.js`):**
   - Weekday selector pills on Screen 9 use a 7-column CSS Grid (`grid-template-columns: repeat(7, 1fr); gap: 4px;`) and card buttons omit redundant `width: 100%` so that horizontal scroll overflow (`scrollWidth - clientWidth`) is `0px` across iPhone SE (`375x667`), iPhone 14/15 (`390x844`), and iPhone 15 Pro Max (`430x932`).
   - `playwright.config.js` automatically falls back to `channel: 'chrome'` when Playwright's bundled Chromium binary is not pre-installed on macOS, allowing `npm run test:nav` to run out of the box.
