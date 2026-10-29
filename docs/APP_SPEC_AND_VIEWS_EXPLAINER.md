# CNU Free — Complete Product & System Architecture Explainer

> **Audience**: AI Agents, Systems Architects, and Senior Full-Stack Engineers.  
> **Purpose**: Definitive, exhaustive specification and operational manual for **CNU Free**, detailing product behavior, architectural layers, domain calculation engines, reactive state propagation, and all **40 user views** with their end-to-end navigation connections.

---

## 1. Executive Summary & Product Overview

### 1.1 What is CNU Free?
**CNU Free** is a university schedule-sharing and mutual free-time discovery application designed for university students (originally calibrated for Cebu Normal University, CNU). 

University life involves fragmented timetables with erratic gaps between lectures, laboratories, and study blocks. Students constantly ask one question across messaging apps: *"Who's free right now?"* or *"When are we all free to meet or hang out?"*

CNU Free solves this with:
1. **Live "Who's Free" Radar (Now Tab)**: At any given minute, students instantly see which friends are currently free, how much free time they have remaining, who is in class, and what time busy friends become free.
2. **Mutual Overlap Solver (Overlap Tab)**: An automated interval-intersection engine that computes the exact shared free windows across multiple participants for any chosen day.
3. **Frictionless Timetable Ingestion (Me Tab)**: Students take a photo of their physical or portal study load/timetable; an OCR parser extracts class times, room numbers, and days with human-in-the-loop verification.
4. **Granular Privacy Matrix (Me Tab)**: Students control who sees their schedule using a strict 3-tier precedence hierarchy (Per-Person Override > Group Rules > Global Audience).

---

## 2. Technical Stack & Architecture

- **Client Runtime**: Pure Vanilla JavaScript (Modern ES Modules). Zero UI framework bloat (no React, Vue, or Angular).
- **Build Tooling**: [Vite](https://vitejs.dev/) compiling `src/` to `dist/`.
- **Packaging**: [Capacitor 6](https://capacitorjs.com/) wrapping the web application into an iOS application (`com.cnufree.app`).
- **Typography & Offline Operation**: 100% offline self-hosted fonts via `@fontsource/bricolage-grotesque` (700, 800) and `@fontsource/manrope` (500, 700, 800).
- **Design System Constraints**:
  - Exact 390×844 px mobile viewport inside a desktop canvas (`#DCE2DF`), or `100vw × 100dvh` full-screen inside Capacitor or mobile viewports (`<= 480px`).
  - Zero emojis anywhere in UI; clean inline SVGs (`aria-hidden="true"`).
  - Minimum touch targets $\ge 44\times 44\text{ px}$; WCAG AA contrast $\ge 4.5:1$.
  - All form inputs $\ge 16\text{ px}$ font size (eliminating automatic iOS Safari zoom).
  - Body `overscroll-behavior: none` and `touch-action: manipulation`.
- **Test Automation**:
  - `Vitest` (`npm run test:logic`): Unit tests covering roster counts, interval math, privacy, and validators.
  - `Playwright` (`npm run test:nav`): Headless Chromium E2E testing all 40 views, button destinations, viewports (`iPhone SE` 375×667 and `iPhone 15 Pro Max` 430×932), zero console errors, and offline persistence.

---

## 3. Core Domain Engines & Business Logic

### 3.1 Time Representation & The 7:00–21:00 Day Window (`src/time.js`)
- All times are converted to **integer minutes since midnight** (`0` to `1440`).
- Weekdays are zero-indexed: `0 = Monday`, `1 = Tuesday`, `2 = Wednesday`, `3 = Thursday`, `4 = Friday`, `5 = Saturday`, `6 = Sunday`.
- Classes are modeled as **half-open intervals** `[start, end)`. At `minute === end`, the student is immediately free.
- The visible schedule grid spans **`7:00` (420 min) to `21:00` (1260 min)** (14 hours, labeled `7A` to `9P`) to accommodate early morning labs and Saturday evening classes ending at 20:00 or 20:30.

### 3.2 Real-Time Live Clock Engine (`src/clock.js`)
- `clock.js` supports two modes:
  - **Live Mode**: Synchronized with real device system time (`new Date()`).
  - **Dev Preset Mode**: Simulated time travel for testing edge cases (`Mon 09:30`, `Tue 09:41`, `Wed 12:00`, `Sat 20:30`, `Sun 10:00`) with speed multipliers (`1×`, `60×`, `600×`).
- **Boundary Precision**: Rather than crude polling, the clock engine calculates exact timeouts for the nearest upcoming class `start` or `end` across all visible schedules, re-syncing on `document.visibilitychange`.

### 3.3 Person Status Evaluator
For any person $P$ at time $T$ relative to viewer $V$:
1. If privacy evaluation yields `none`, status is `private` (renders lock icon, excluded from availability counts).
2. If $P$ has no classes on that day or empty timetable, status is `free` all day (`"Free all day"`).
3. If $T$ falls inside any class $[start, end)$, status is `busy` until `end`, noting the class name and room.
4. If $T$ is between classes, status is `free` until the start of the next class, displaying remaining minutes.
5. If all classes for the day have finished, status is `free` until the first class of the next scheduled day (e.g. `"Free until Mon 9:00 AM"` on Saturday night).

### 3.4 Multi-Participant Overlap Solver (`src/overlap.js`)
1. Filters out any participant who is `private` to the viewer.
2. For each remaining participant on selected day index, merges overlapping busy intervals and computes the **complement** inside `[420, 1260]`.
3. Intersects the free intervals across all participants.
4. Discards any mutual free window $< 30$ minutes.
5. Computes `bestWindowForMostPeople`: Evaluates subsets of You + friends free now or later today, ranking windows by:
   $$\text{Rank} = (\text{Participant Count } \downarrow, \text{Duration } \downarrow, \text{Start Time } \uparrow)$$

### 3.5 Hierarchical 3-Tier Privacy Matrix (`src/privacy.js`)
When person $A$ views person $B$'s schedule, visibility resolves strictly in this order:
1. **Tier 1: Per-Person Override**: If an explicit rule exists for $A$ (`full`, `free_busy`, `none`), it wins immediately.
2. **Tier 2: Group Rules**: If $A$ shares groups with $B$ (e.g. *Kalbo*, *Badminton*, *STEP*), the most permissive rule among those groups applies (`full > free_busy > none`).
3. **Tier 3: Global Audience**:
   - `friends`: Friends see `free_busy` (or `full` if default shared).
   - `only_me`: Nobody sees anything (`none`).
   - `selected`: Only explicitly selected friends see schedule.

### 3.6 Single Write Path & Keyed DOM Reconciliation (`src/store.js`, `src/ui/dom-patch.js`)
- **Single Write Path**: All schedule mutations (`addEntry`, `updateEntry`, `deleteEntry`, `importEntries`, `applySimulatedChange`, `undoLastAction`) route through centralized store actions. Each mutation validates, increments `scheduleRev` and `ownerScheduleRev[ownerId]`, persists atomically to local storage, and emits a targeted change event.
- **Granular Selectors**: Derived state (`selectFriendsAvailability`, `selectYourDay`, `selectOverlap`, etc.) is pure and memoized. Modifying Francis's schedule invalidates Francis's views without recomputing friends' independent availability.
- **Keyed DOM Morphing (`morphDom`)**: Mutates text nodes in place (`node.nodeValue = ...`), preserves scroll offsets, retains user-typed form inputs, and adds a 200ms `.reactive-crossfade` on status flips.

---

## 4. Canonical Roster Data (Addendum B Seed)

The application ships with a realistic university seed dataset:
- **Logged-in User**: **Francis** (`@francis`, initials `FR`, time zone `Asia/Manila`, 17 timetable entries).
- **10 Mutual Friends** (Total **146 entries** across Francis + 10 friends):
  1. **Gian** (`@gian`, GI, 23 entries)
  2. **Franzen** (`@franzen`, FZ, 10 entries)
  3. **Thea** (`@thea`, TH, 11 entries)
  4. **Hershey** (`@hershey`, HE, 11 entries)
  5. **Ella** (`@ella`, EL, 15 entries)
  6. **Dane** (`@dane`, DA, 11 entries)
  7. **Danica** (`@danica`, DC, 10 entries)
  8. **Gelie** (`@gelie`, GE, 15 entries)
  9. **Luanne** (`@luanne`, LU, 10 entries)
  10. **Jellah** (`@jellah`, JE, 13 entries)
- **3 Groups**:
  - **Kalbo** (7 members): Franzen, Thea, Hershey, Ella, Gelie, Luanne, Jellah
  - **Badminton** (2 members): Gian, Danica
  - **STEP** (1 member): Dane
- **Directory / Non-Friends**: Kristine, Marco, Mika Reyes, Paolo Cruz (empty timetables displaying *"No timetable yet"*).

---

## 5. The 40 User Views: Complete Catalog & Navigation Map

The app organizes navigation into **4 primary tab stacks** (`Now`, `Friends`, `Overlap`, `Me`), persistent sheets, modal dialogs, and standalone auth screens.

```
                    ┌────────────────────────┐
                    │      26. Welcome       │
                    └───────────┬────────────┘
                                │
                    ┌───────────▼────────────┐
                    │  27. Sign In / Create  │
                    └───────────┬────────────┘
                                │ (Auth Success)
            ┌───────────────────┼───────────────────┐
            │                   │                   │
  ┌─────────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐  ┌─────────▼────────┐
  │   TAB 1: NOW     │  │ TAB 2: FRIENDS │  │ TAB 3: OVERLAP │  │    TAB 4: ME     │
  │  (Root Screen 1) │  │(Root Screen 6) │  │(Root Screen 2) │  │ (Root Screen 30) │
  └──────────────────┘  └────────────────┘  └────────────────┘  └──────────────────┘
```

Below is the detailed specification for all 40 views:

### Screen 1: Now (Home)
- **Stack / Tab**: `Now` (Tab 1 Root)
- **Purpose**: Real-time operational dashboard answering *"cnu free?"*.
- **Key Elements**:
  - Conspicuous date & live time readout (`.now-clock-label`, e.g. `Tue, Oct 29 · 9:41 AM`).
  - Bell icon with unread notification badge dot $\rightarrow$ **Screen 7 (Inbox)**.
  - Large heading: `cnu free?`.
  - Group Filter Chips (`All`, `Kalbo · 4/7`, `Badminton · 0/2`, `STEP · 0/1`). When a group is active, shows an `"Open [Group] →"` button $\rightarrow$ **Screen 10 (Group Detail)**.
  - *Your Day* summary card showing your next free window or current class $\rightarrow$ **Screen 37 (My Day)**.
  - *Best Mutual Free Window* mint card (`"Next all free"` or best window) with `"Suggest"` button $\rightarrow$ **Screen 2 (Overlap)**.
  - *Free Now* list: Friends sorted by remaining free time descending. Tap friend row $\rightarrow$ **Screen 3 (Friend Schedule)**.
  - *Busy Now* summary row / section: Tap $\rightarrow$ **Screen 3** (if 1 friend busy) or **Screen 6** filtered to Busy (if multiple).

### Screen 2: Overlap (All Shared)
- **Stack / Tab**: `Overlap` (Tab 3 Root)
- **Purpose**: Multi-person schedule intersection solver.
- **Key Elements**:
  - Participant chip list (`You`, `Thea`, `Hershey`, etc.) with `+ Friend` button opening friend selector.
  - 7-day selector strip (`Mon` to `Sun`).
  - Overlap timeline visualization (`7:00 AM – 9:00 PM`) showing overlapping busy columns and highlighted mint mutual free intervals.
  - Interactive window cards: Tap to select a proposed slot.
  - Action CTA: `"Suggest [Time] to [Names]"` $\rightarrow$ sends proposal, provides 5-second `Undo` toast.
  - If a selected participant has set their schedule to private $\rightarrow$ displays **Screen 36 (Overlap Private State)**.

### Screen 3: Friend Schedule (Day View)
- **Stack / Tab**: `Friends` (or pushed from `Now` / `Group Detail`)
- **Purpose**: Vertical timeline of a friend's full day (`7:00 AM – 9:00 PM`).
- **Key Elements**:
  - Header: Back button `<` (pops stack), Friend name/username, 3-dots `⋯` action button (opens sheet with *Add to group*, *Remove friend*, *Block*).
  - Segmented toggle: `[ Day | Week ]` $\rightarrow$ toggles to **Screen 35 (Friend Schedule Week View)**.
  - Day selector strip (`Mon`–`Sun`).
  - Current status pill (`Free for 2h 19m` or `Busy until 10:30 AM · Philosophy of Religion, Room 306`).
  - Mutual free window banner (*"Free together: 10:30 AM – 1:00 PM"*).
  - CTA button: `"Find a time with [First Name]"` $\rightarrow$ opens **Screen 2 (Overlap)** pre-populated with You + Friend.
  - If friend is private $\rightarrow$ shows lock card + `"Ask [Name] for access"`.

### Screen 4: Import Timetable: Review
- **Stack / Tab**: `Me`
- **Purpose**: Human-in-the-loop review of OCR-parsed timetable drafts.
- **Key Elements**:
  - List of detected classes with activity, room, days, and time ranges.
  - Amber warning banners for low-confidence or conflicting rows (`Needs check`).
  - Tap any row $\rightarrow$ **Screen 9 (Add/Edit a Class)** in review mode.
  - `"Retake photo"` button $\rightarrow$ **Screen 28 (Upload)**.
  - `"Save [N] classes"` button $\rightarrow$ commits classes to store and routes to **Screen 29 (Timetable Saved Success)**. (Disabled if unresolved flagged rows exist).

### Screen 5: Privacy and Sharing
- **Stack / Tab**: `Me`
- **Purpose**: Granular visibility settings for schedule.
- **Key Elements**:
  - Audience radio selectors:
    - `Only me`
    - `Friends`
    - `Selected friends` $\rightarrow$ opens **Screen 34 (Selected Friends Picker)**.
  - Individual friend access list: Displays per-friend permissions (`Full`, `Free/Busy`, `None`).
  - Share link card: Displays active link (`cnufree.com/s/francis_8472`), `Copy link` button, and `Revoke` button.
  - Tap link URL $\rightarrow$ opens **Screen 38 (Public Shared Schedule Preview)**.

### Screen 6: Friends List & Groups
- **Stack / Tab**: `Friends` (Tab 2 Root)
- **Purpose**: Central friend management directory.
- **Key Elements**:
  - Search bar: Real-time search across friends. If no local match, shows `"Find [query] in directory"` $\rightarrow$ **Screen 11 (Find Friends)**.
  - Add button `+` $\rightarrow$ **Screen 11 (Find Friends)**.
  - Pending requests banner (e.g. `2 requests to review`) $\rightarrow$ **Screen 32 (Friend Requests)**.
  - Groups carousel: Displays group chips (*Kalbo*, *Badminton*, *STEP*) + `+ New` button $\rightarrow$ **Screen 33 (Create Group)**. Tap group chip $\rightarrow$ **Screen 10 (Group Detail)**.
  - Filter chips: `All`, `Free now`, `Busy`.
  - Friend list rows: Avatar, Name, Handle, Status pill, and `⋯` button (Sheet with *View schedule*, *Add to group*, *Remove friend*, *Block*).

### Screen 7: Inbox
- **Stack / Tab**: `Now` (pushed via Bell icon)
- **Purpose**: Incoming friend requests and schedule update alerts.
- **Key Elements**:
  - Filter chips: `All`, `Unread`.
  - `"Mark all read"` button: Clears unread indicators and badge count.
  - Request cards (e.g., from *Kristine*, *Marco*):
    - `Accept` $\rightarrow$ adds friend, triggers confirmation toast.
    - `Decline` $\rightarrow$ removes item with 5-second `Undo` toast.
    - `⋯` menu on card $\rightarrow$ opens **Screen 13 (Block User Dialog)**.
  - Notification items (e.g., *"Gian updated his schedule"*): Tap $\rightarrow$ **Screen 3 (Gian's Schedule)**.

### Screen 8: My Week
- **Stack / Tab**: `Me`
- **Purpose**: 7-day multi-column timetable grid of your schedule.
- **Key Elements**:
  - Segmented control: `[ Day | Week ]` $\rightarrow$ switches to **Screen 37 (My Day)**.
  - Add button `+` $\rightarrow$ **Screen 9 (Add a Class)**.
  - 7-day schedule grid with color-coded class blocks. Tap block $\rightarrow$ **Screen 9 (Edit Class)**.
  - Tap empty grid slot $\rightarrow$ **Screen 9** prefilled with selected day and time.

### Screen 9: Add / Edit a Class
- **Stack / Tab**: `Me` (or pushed from `4`, `8`, `25`, `37`)
- **Purpose**: Manual entry or modification of class timetable items.
- **Key Elements**:
  - Inputs: Activity name, Room/Detail, Repeat mode (`Weekly` vs `Once`), 7 weekday pill toggles, Native `<input type="time">` for Start and End.
  - Real-time validation: Checks that `start < end`, duration $\ge 15\text{ min}$, at least 1 day selected, and detects collisions with existing classes.
  - Buttons:
    - `"Save class"` $\rightarrow$ persists and pops back to caller.
    - `"Delete class"` (edit mode only) $\rightarrow$ opens confirmation dialog, deletes on confirm.
    - `"Cancel"` $\rightarrow$ prompts `"Discard changes?"` if form is dirty, then pops.

### Screen 10: Group Detail
- **Stack / Tab**: `Friends`
- **Purpose**: Manage a specific friend group (*Kalbo*, *Badminton*, *STEP*).
- **Key Elements**:
  - Group name heading and member count summary (`4 of 7 free now`).
  - Action chips:
    - `"Rename"` $\rightarrow$ **Screen 40 (Rename Group Sheet)**.
    - `"See overlap"` $\rightarrow$ **Screen 2 (Overlap)** preselected with group members.
    - `"+ Add members"` $\rightarrow$ **Screen 33 (Create/Edit Group)** in member-add mode.
  - Member rows: Avatar, Name, live status pill. Tap row $\rightarrow$ **Screen 3 (Friend Schedule)**. Tap row `⋯` $\rightarrow$ remove member with `Undo` toast.

### Screen 11: Find Friends
- **Stack / Tab**: `Friends`
- **Purpose**: Discover and add university peers.
- **Key Elements**:
  - Search input with auto-debounce.
  - Search results from campus directory:
    - If already friends: Displays `"Friends"` badge.
    - If pending: Displays `"Requested"` pill. Tap $\rightarrow$ opens *Cancel Request* sheet.
    - If not friends: Displays `"+ Add friend"` button $\rightarrow$ sends request, changes to `"Requested"`.
  - Footer link: `"View sent requests"` $\rightarrow$ **Screen 32 (Friend Requests - Sent Tab)**.

### Screen 12: Remove Friend Dialog
- **Stack / Tab**: Modal dialog over `Friends` or `Friend Schedule`
- **Purpose**: Destructive confirmation for removing a friend.
- **Key Elements**:
  - Warning copy: Explains that mutual schedule sharing will cease.
  - Actions:
    - `"Remove friend"` $\rightarrow$ deletes friend, removes them from all groups, closes modal, shows toast with 5s `Undo`.
    - `"Cancel"` $\rightarrow$ dismisses dialog.

### Screen 13: Block User Dialog & Toast
- **Stack / Tab**: Modal dialog over `Inbox`, `Friends`, or `Friend Schedule`
- **Purpose**: Safety blocking mechanism.
- **Key Elements**:
  - Warning copy: Explains the user will be removed, unable to see your schedule, and added to your Blocked list.
  - Actions:
    - `"Block [Name]"` $\rightarrow$ adds user to blocked list (**Screen 39**), removes friendship/requests, displays confirmation toast with `Undo`.
    - `"Cancel"` $\rightarrow$ dismisses dialog.

### Screen 14: Share Link Sheet
- **Stack / Tab**: Bottom Sheet over `Me` or `Privacy`
- **Purpose**: Create and configure web links to share schedule with external users.
- **Key Elements**:
  - Active links list with copy buttons and expiration readouts.
  - Scope configuration: `Full schedule`, `Free or busy only`, `Specific hours`.
  - Expiration selector: `24 hours`, `7 days`, `30 days`.
  - `"Create link"` button $\rightarrow$ generates link and displays preview.
  - `"Revoke"` action $\rightarrow$ confirms revocation and disables URL.

### Screen 15: Notification Settings
- **Stack / Tab**: `Me`
- **Purpose**: Notification preference toggles.
- **Key Elements**:
  - System toggles: *New friend requests*, *Request accepted*, *Friends' schedule updates*.
  - Group notification toggles: Individual switches for *Kalbo*, *Badminton*, *STEP* (disabled if global schedule updates are off).

### Screen 16: Edit Profile Sheet
- **Stack / Tab**: Bottom Sheet over `Me (30)`
- **Purpose**: Update user profile information.
- **Key Elements**:
  - Avatar preview with `"Change color"` button $\rightarrow$ expands color palette picker.
  - Inputs: First Name, Last Name, Username.
  - Real-time username validator (checks regex `[a-z0-9._]`, length 3–20, checks against reserved/taken names, provides suggestion).
  - `"Save changes"` button $\rightarrow$ persists and updates UI.

### Screen 17: Sign Out Dialog
- **Stack / Tab**: Modal dialog over `Me (30)`
- **Purpose**: Confirm user sign out.
- **Key Elements**:
  - Actions:
    - `"Sign out"` $\rightarrow$ clears session token (keeps cached roster data for offline demo), resets all tab stacks to root, and routes to **Screen 26 (Welcome)**.
    - `"Cancel"` $\rightarrow$ dismisses dialog.

### Screen 18: Inbox — All Caught Up (Empty State)
- **Stack / Tab**: `Now` (State of Screen 7)
- **Purpose**: Displayed when there are no unread or active inbox notifications.
- **Key Elements**: Clean empty-state illustration, *"All caught up"*, Back button to Now.

### Screen 19: Inbox — Loading Skeleton
- **Stack / Tab**: `Now` (State of Screen 7)
- **Purpose**: Visual skeleton placeholders displayed while fetching latest inbox notifications.

### Screen 20: Inbox — Offline Error State
- **Stack / Tab**: `Now` (State of Screen 7)
- **Purpose**: Offline connectivity banner with a `"Retry"` button to re-attempt fetch.

### Screen 21: Friends — Empty State
- **Stack / Tab**: `Friends` (State of Screen 6)
- **Purpose**: Displayed when user has 0 friends.
- **Key Elements**:
  - Illustration: *"No friends added yet"*.
  - Primary CTA: `"Find friends"` $\rightarrow$ **Screen 11**.
  - Secondary CTA: `"Share your invite link"` $\rightarrow$ invokes native Capacitor Share sheet or **Screen 14**.

### Screen 22: Friends — Loading Skeleton
- **Stack / Tab**: `Friends` (State of Screen 6)
- **Purpose**: Skeleton list displayed for 400ms during initial friends directory hydration.

### Screen 23: Friends — Error State
- **Stack / Tab**: `Friends` (State of Screen 6)
- **Purpose**: Displayed on directory fetch failure with a `"Retry"` button.

### Screen 24: Import — Reading Timetable (OCR Processing)
- **Stack / Tab**: `Me`
- **Purpose**: Animated processing view while mock OCR engine parses the uploaded timetable photo.
- **Key Elements**:
  - Animated scanner effect.
  - Copy: *"Reading your timetable… 2.2s"*.
  - `"Cancel"` button $\rightarrow$ aborts OCR and returns to **Screen 28**.
  - Auto-advance: On success $\rightarrow$ **Screen 4 (Review)**; On forced error toggle $\rightarrow$ **Screen 25 (Unreadable Photo)**.

### Screen 25: Import — Unreadable Photo (OCR Error)
- **Stack / Tab**: `Me`
- **Purpose**: Error state when photo is blurry or unparseable.
- **Key Elements**:
  - Error copy explaining why the scan failed (low lighting, blur, or unsupported format).
  - Primary CTA: `"Try another photo"` $\rightarrow$ **Screen 28**.
  - Secondary CTA: `"Add classes manually"` $\rightarrow$ **Screen 9**.

### Screen 26: Signed Out / Welcome Screen
- **Stack / Tab**: Authentication Entrypoint (outside tab stacks)
- **Purpose**: First launch screen for unauthenticated users.
- **Key Elements**:
  - Brand hero illustration and value proposition: *"See who's free between classes."*
  - Primary CTA: `"Create account"` $\rightarrow$ **Screen 27** in Create mode.
  - Secondary CTA: `"Sign in"` $\rightarrow$ **Screen 27** in Sign In mode.

### Screen 27: Sign In / Create Account
- **Stack / Tab**: Authentication Flow
- **Purpose**: Unified authentication interface with dual modes.
- **Key Elements**:
  - Mode toggle: Switch between `Sign in` and `Create account`.
  - Fields (Sign In): Email or Username, Password, `"Forgot password?"` toggle (reveals email field and `"Send reset link"`).
  - Fields (Create Account): First Name, Last Name, CNU Email, Username, Password ($\ge 8$ chars).
  - On Submit: Sets session, initializes seed data, and advances to **Screen 28 (Import Timetable)** for new users or **Screen 1 (Now)** for returning users.

### Screen 28: Import Timetable: Upload
- **Stack / Tab**: `Me` (or Onboarding step 2)
- **Purpose**: Image capture / selection for timetable OCR.
- **Key Elements**:
  - Upload options:
    - `"Take photo"` $\rightarrow$ invokes native Camera plugin.
    - `"Choose from library"` $\rightarrow$ invokes native photo picker or file input.
  - Sample timetable preview showing proper lighting and framing tips.
  - Selection automatically triggers transition to **Screen 24 (OCR Processing)**.
  - `"Cancel"` button $\rightarrow$ pops to caller (or to Screen 1 with empty state if during onboarding).

### Screen 29: Timetable Saved Success
- **Stack / Tab**: `Me`
- **Purpose**: Celebration and onboarding completion screen after saving imported classes.
- **Key Elements**:
  - Checkmark illustration and summary: `"[N] classes added to your timetable."`
  - Primary CTA: `"View my week"` $\rightarrow$ **Screen 8 (My Week)**.
  - Secondary CTA: `"Back to Now"` $\rightarrow$ **Screen 1 (Now)**.

### Screen 30: Me Hub (Profile & Settings)
- **Stack / Tab**: `Me` (Tab 4 Root)
- **Purpose**: Account overview and configuration hub.
- **Key Elements**:
  - Profile header card: Avatar, Name (`Francis`), Username (`@francis`). Tap $\rightarrow$ **Screen 16 (Edit Profile Sheet)**.
  - Menu Items:
    - *My week* $\rightarrow$ **Screen 8**.
    - *Add a class* $\rightarrow$ **Screen 9**.
    - *Import from photo* $\rightarrow$ **Screen 28**.
    - *Who sees my schedule* $\rightarrow$ **Screen 5 (Privacy)**.
    - *Share links* $\rightarrow$ **Screen 14 (Share Link Sheet)**.
    - *Notifications* $\rightarrow$ **Screen 15**.
    - *Blocked people* $\rightarrow$ **Screen 39**.
    - *Sign out* $\rightarrow$ opens **Screen 17 (Sign Out Dialog)**.
    - *Delete account* $\rightarrow$ opens **Screen 31 (Delete Account Dialog)**.

### Screen 31: Delete Account Dialog
- **Stack / Tab**: Modal dialog over `Me (30)`
- **Purpose**: Irrevocable destructive action confirmation.
- **Key Elements**:
  - Danger icon and explicit warning copy.
  - Actions:
    - `"Delete account"` $\rightarrow$ purges all local storage and preferences, resets state to clean baseline, and routes to **Screen 26 (Welcome)**.
    - `"Cancel"` $\rightarrow$ dismisses dialog.

### Screen 32: Friend Requests (Received & Sent)
- **Stack / Tab**: `Friends`
- **Purpose**: Manage pending inbound and outbound connection requests.
- **Key Elements**:
  - Segmented tabs: `[ Received · 2 | Sent · 0 ]`.
  - Received Tab: Cards for *Kristine* and *Marco* with `Accept`, `Decline` (with 5s Undo), and `View schedule preview`.
  - Sent Tab: List of outbound requests with `"Cancel request"` button.

### Screen 33: Create / Edit Group
- **Stack / Tab**: `Friends`
- **Purpose**: Group creation and member selection.
- **Key Elements**:
  - Mode 1: *Create New Group* (opened via Screen 6 `+ New`). Group name input + multi-select friend checkboxes $\rightarrow$ `"Create group"` creates group and routes to **Screen 10**.
  - Mode 2: *Add Friends to Existing Group* (opened via Screen 10 `+ Add members`). Shows non-member friends $\rightarrow$ `"Add [N] members"` updates group and pops to **Screen 10**.

### Screen 34: Selected Friends Picker
- **Stack / Tab**: `Me` (pushed from Screen 5 Privacy)
- **Purpose**: Multi-select checklist specifying exactly which friends may view schedule when audience is set to `Selected friends`.
- **Key Elements**:
  - Search filter.
  - Checkbox per friend with access level toggle inline (`Full` vs `Free/Busy`).
  - `"Done"` button $\rightarrow$ saves selection and returns to **Screen 5**.

### Screen 35: Friend Schedule (Week View)
- **Stack / Tab**: `Friends`
- **Purpose**: Full 7-day multi-column timetable grid of a friend's week.
- **Key Elements**:
  - Segmented toggle: `[ Day | Week ]` $\rightarrow$ switches back to **Screen 3 (Day View)**.
  - 7-day grid showing friend's classes across `7:00 AM – 9:00 PM`.
  - Mint highlighted mutual free blocks.
  - Footer CTA: `"Plan with [First Name]"` $\rightarrow$ opens **Screen 2 (Overlap)** with You + Friend pre-selected.

### Screen 36: Overlap — Private State
- **Stack / Tab**: `Overlap` (State of Screen 2)
- **Purpose**: Displayed when one or more selected participants have private schedules.
- **Key Elements**:
  - Lock card explaining that a participant's schedule is not visible to you.
  - CTA button: `"Ask [Name] for access"` $\rightarrow$ sends request notification, button transitions to disabled `"Requested"`, shows confirmation toast.

### Screen 37: My Day
- **Stack / Tab**: `Now` (or from Screen 8 toggle)
- **Purpose**: Detailed single-day vertical timeline of your own schedule.
- **Key Elements**:
  - Segmented toggle: `[ Day | Week ]` $\rightarrow$ switches to **Screen 8 (My Week)**.
  - Day selector strip (`Mon`–`Sun`).
  - Timeline cards showing classes, locations, and intervening free slots with duration labels.
  - Add button `+` or empty slot tap $\rightarrow$ **Screen 9 (Add a Class)**.

### Screen 38: Public Shared Schedule Web View
- **Stack / Tab**: Standalone Route (`#/s/[linkId]`) or Preview from `Me`
- **Purpose**: Web view accessible via public URL link by users without an account.
- **Key Elements**:
  - Read-only daily/weekly timeline filtered strictly by link scope (`Full`, `Free/Busy`, or `Specific Hours`).
  - If opened inside app as preview: Header includes `"Close preview"` button.
  - If opened externally: Footer includes `"Get CNU Free"` CTA.
  - Handles expired (`"This link has expired"`), revoked, and invalid link states gracefully.

### Screen 39: Blocked People
- **Stack / Tab**: `Me`
- **Purpose**: Manage blocked users.
- **Key Elements**:
  - List of blocked individuals with date blocked.
  - `"Unblock"` button per user $\rightarrow$ unblocks user, displays confirmation toast with Undo.
  - Empty state: *"You haven't blocked anyone."*

### Screen 40: Rename Group Sheet
- **Stack / Tab**: Bottom Sheet over `Group Detail (10)`
- **Purpose**: Rename or delete an existing friend group.
- **Key Elements**:
  - Group name text input with validation (2–24 characters, uniqueness check).
  - `"Save"` button $\rightarrow$ updates group name and closes sheet.
  - `"Delete group"` button in red text $\rightarrow$ opens destructive confirmation dialog; on confirm, deletes group and pops back to **Screen 6**.

---

## 7. Developer Tooling & Verification Commands

### 7.1 Built-in Developer Inspector Bar
- When launching on desktop or appending `?dev=1` (`http://localhost:5173/?dev=1`):
  - **Screen Jump**: Direct selector dropdown and chip strip to jump to any screen (`S01` to `S40`).
  - **Time Travel Presets**: Switch clock instantly between `Live`, `Mon 09:30`, `Tue 09:41`, `Wed 12:00`, `Sat 20:30`, `Sun 10:00`, with `1×`, `60×`, `600×` multipliers.
  - **Schedule Simulation**: One-click *"Simulate schedule change"* moves Gian's Monday class and triggers an inbox event.
  - **Privacy Lock Toggle**: One-click *"Make [friend] private"* toggle to test lock states.
  - **All-Screens Grid**: Toggles a side-by-side matrix view rendering all 40 screens simultaneously.

### 7.2 Testing & Build Commands
```bash
# 1. Run local dev server with hot module reload
npm run dev

# 2. Run domain logic tests (10/10 Vitest specs)
npm run test:logic

# 3. Run automated Playwright navigation tests (40 screens, iPhone SE & 15 Pro Max)
npm run test:nav

# 4. Production build to dist/
npm run build

# 5. Sync updates to GitHub
npm run sync
```
