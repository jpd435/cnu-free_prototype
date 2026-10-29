# CNU Free — Specification V1

## 1. BUILD & ARCHITECTURE INSTRUCTIONS
- **Interactive App + Screen Matrix Mode:** Build a complete, stateful single-page application that renders inside an exact 390x844 px mobile viewport on a neutral canvas (`#DCE2DF`), complete with working screen-to-screen navigation, tab switching, modal dialogs, bottom sheets, filter chips, and form validation. Include a collapsible developer switcher bar outside the 390x844 px frame to jump directly to any of the 38 views (`Screen 1` to `Screen 38`) or toggle an all-screens side-by-side grid view.
- **Semantic DOM & Accessibility:** Use real `<button>`, `<label>`, and `<input>` elements (radio, checkbox, text, password). Use zero emojis and zero fake top status bars. Add `aria-hidden="true"` to all decorative inline SVGs. Maintain at least 4.5:1 text contrast and 44x44 px minimum touch targets. Nothing may be unintentionally clipped inside 390x844 px.
- **Visual Restraint:** Use no lorem ipsum, no generic dashboard look, no gradient washes, and no left-border accent cards. Data must dynamically populate from a central state.

## 2. CORE IDEA & GLOBAL DESIGN SYSTEM
- **Core Ethos:** Answer one question: *"Who's free, and when can we meet?"* Free time is the bright signal (`#6CF2A2` / `#D5F5E3`). Busy time is quiet (hatched gray). Overlap (shared free time) is the headline feature. Privacy is user-controlled. Adding a schedule takes seconds via photo import.
- **Colors:**
  - Canvas & Surfaces: App background `#EEF1EF`; cards `#FFFFFF` (`border-radius: 22px`, `box-shadow: 0 1px 2px rgba(11,27,22,.06), 0 10px 28px rgba(11,27,22,.06)`); primary ink `#0B1B16`; muted text `#5A6862` (on dark `#B7C6BF`; secondary text on white `#4B5953`); card row hairline dividers `1px solid #E3E8E5`.
  - Free Signal: Bright pill `#6CF2A2` with text `#073D22`; soft fill `#D5F5E3`, outline `1.5px` or `2px solid #1FB86B`, text `#0B5A33`.
  - Busy Signal: `repeating-linear-gradient(135deg, #DDE2DF 0 6px, #E8ECEA 6px 12px)` with text `#3E4B45`; Busy pill `#DDE2DF` with `#3E4B45` text.
  - Attention / Amber: `#F2B34C`, soft fill `#FFF1D6`, pill `#FFD98F` with text `#5C3A00`.
  - Error / Destructive: `#B3261E` text and destructive button fill, `#FDE4E4` soft circle fill, `#FFB4A8` coral action text on dark cards.
- **Avatars (Initials in Tinted Circles — No Photos):**
  - User: Ink `#0B1B16` fill with `#FFFFFF` text.
  - Friends & Groups: Dynamically assigned background colors from palette (`#F4C7B5`, `#B9E6CD`, `#F2E0A0`, `#D6CCF2`).
- **Typography & Layout:**
  - Fonts: `Bricolage Grotesque` 700/800 for headings and big numbers (`letter-spacing: -0.02em`); `Manrope` 500/700/800 for all body, labels, and controls. Small eyebrow labels: `12px`, weight 700, uppercase, `letter-spacing: 0.06em`, muted `#5A6862`.
  - Layout: `20px` side padding, `56px` top padding, `12px–14px` card gap. H1 is `30px` / `1.05` line-height (`26px` when long).

## 3. SCREENS 1–38 SUMMARY
- Batch A (`1–5`): Now (Home), Overlap, Friend Schedule (Day View), Import Timetable Review, Privacy and Sharing.
- Batch B (`6–11`): Friends, Inbox, My Week, Add a Class, Group Detail, Find Friends.
- Batch C (`12–25`): Remove Friend Dialog, Block User Dialog, Share Link Sheet, Notification Settings, Edit Profile Sheet, Sign Out Dialog, Inbox Empty/Loading/Error (`18–20`), Friends Empty/Loading/Error (`21–23`), OCR Loading (`24`), OCR Error (`25`).
- Batch D (`26–38`): Signed Out / Welcome (`26`), Sign In (`27`), Import Upload (`28`), OCR Success (`29`), Me Hub (`30`), Delete Account Dialog (`31`), Friend Requests (`32`), Create New Group (`33`), Selected Friends Picker (`34`), Friend Schedule Week View (`35`), Overlap Private State (`36`), My Day (`37`), Public Shared Schedule Web View (`38`).
