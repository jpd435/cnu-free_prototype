# CNU Free

**CNU Free** is a university mobile web application built for Cebu Normal University (CNU) students to see who among their friends is free or busy right now, find overlapping free time, import class timetables, and manage schedule privacy.

---

## Features

- **See Who's Free (Now Tab)**: Real-time status cards showing friends categorized into *Free now* and *Busy now*, with live countdowns and next available free slots.
- **Find Mutual Free Windows (Overlap Tab)**: Multi-person schedule intersection solver calculating exact overlapping free slots for study sessions, meetings, or hanging out.
- **Real-Time Live Clock Engine**: Minute-boundary transitions and scheduled boundary updates across all schedules.
- **Privacy & Sharing Matrix**: Strict per-person overrides, group rules (*Kalbo*, *Badminton*, *STEP*), and public share links (`#/s/[linkId]`).
- **Interactive Timetable Management**: Timetable schedule view (7:00 AM – 9:00 PM), timetable photo OCR import flow, and manual class adding/editing with validation.
- **Capacitor iOS Ready**: Built with offline self-hosted fonts (`@fontsource`), native safe-area insets, and full-screen responsive layouts.
- **Developer Inspector**: Collapsible developer switcher to instantly preview all 40 screens, simulate schedule changes, toggle clock presets, or view the 40-screen grid matrix.

---

## Tech Stack

- **Runtime**: Vanilla JavaScript (ES modules)
- **Bundler & Dev Server**: [Vite](https://vitejs.dev/)
- **Mobile Packaging**: [Capacitor](https://capacitorjs.com/) (iOS)
- **Fonts**: `@fontsource/bricolage-grotesque` (700/800), `@fontsource/manrope` (500/700/800)
- **Testing**: [Vitest](https://vitest.dev/) (Domain logic) & [Playwright](https://playwright.dev/) (E2E navigation)

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser.
To access the developer screen switcher and all-screens inspector, visit [http://localhost:5173/?dev=1](http://localhost:5173/?dev=1).

### 3. Run Automated Tests
```bash
# Unit & domain logic tests
npm run test:logic

# End-to-end browser tests
npm run test:nav
```

### 4. Build for Production
```bash
npm run build
```
