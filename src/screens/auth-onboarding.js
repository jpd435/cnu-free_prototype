/* ==========================================================================
   CNU FREE V2 — AUTH & TIMETABLE IMPORT FLOW (src/screens/auth-onboarding.js)
   Covers Screens 26, 27, 28, 24, 25, 4, 29
   Section 4.6, 4.9, 6.1, 6.2, 7 & Addendum B
   ========================================================================== */

import { ICONS } from '../ui/icons.js';
import { escapeHtml } from '../ui/avatar.js';
import { WEEKDAY_SHORT, formatTime12 } from '../time.js';
import { canSaveOcrDrafts, countFlaggedOcrDrafts } from '../ocr-mock.js';

/**
 * Screen 26: Signed Out / Welcome (Section 6.1)
 */
export function renderWelcomeScreen() {
  return `
    <div class="screen-scroll no-nav" data-screen-id="26">
      <div style="padding:20px 16px 10px; display:flex; flex-direction:column; gap:14px;">
        <div style="display:inline-flex; align-items:center; gap:8px; background:#E3E8E5; padding:6px 12px; border-radius:999px; align-self:flex-start; font-size:12px; font-weight:700; color:#3E4B45;">
          <span style="width:7px; height:7px; border-radius:50%; background:#5A6862;"></span>
          You've been signed out.
        </div>

        <div class="card-dark" style="padding:22px 20px;">
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:14px;">
            <div style="width:36px; height:36px; border-radius:10px; background:rgba(108,242,162,0.16); display:flex; align-items:center; justify-content:center;">
              ${ICONS.brandMark}
            </div>
            <div>
              <div style="font-family:var(--font-display); font-weight:800; font-size:16px;">cnu free</div>
              <div style="font-size:11px; color:#B7C6BF;">University schedule companion</div>
            </div>
          </div>
          <h1 class="display-xl" style="color:#FFF; font-size:28px; margin-bottom:8px;">See who's free between classes.</h1>
          <p style="font-size:13px; color:#B7C6BF; margin:0 0 18px; line-height:1.45;">
            Import your timetable from a photo, share free blocks with friends, and find time to meet without the group-chat back-and-forth.
          </p>

          <div style="background:rgba(255,255,255,0.08); border-radius:14px; padding:10px 12px;">
            <div style="display:flex; justify-content:space-between; font-size:11px; font-weight:800; color:#6CF2A2; margin-bottom:6px;">
              <span>TUE · 1:00 – 4:00 PM</span>
              <span>3 FREE TOGETHER</span>
            </div>
            <div style="display:flex; gap:4px; height:18px;">
              <div style="flex:2; background:#6CF2A2; border-radius:6px;"></div>
              <div style="flex:1; background:rgba(255,255,255,0.2); border-radius:6px;"></div>
              <div style="flex:2; background:#6CF2A2; border-radius:6px;"></div>
            </div>
          </div>
        </div>

        <div style="margin-top:8px; display:flex; flex-direction:column; gap:10px;">
          <button type="button" class="btn-primary" data-action="open-auth-create">Create account</button>
          <button
            type="button"
            class="btn-secondary"
            style="background:#FFF; border:1.5px solid #D5DDD8; border-radius:999px;"
            data-action="open-auth-signin"
          >Sign in</button>
        </div>

        <p style="text-align:center; font-size:12px; color:#5A6862; margin-top:4px;">
          Your schedule is private by default. You choose who sees it.
        </p>
      </div>
    </div>
  `;
}

/**
 * Screen 27: Sign In / Create Account (Section 6.1 & Section 7)
 */
export function renderAuthScreen(state) {
  const mode = state.ui.authMode || 'signin';
  const form = state.ui.authForm || {
    firstName: 'Francis',
    lastName: '',
    username: 'francis',
    password: 'password123'
  };
  const errors = state.ui.authErrors || {};
  const forgotExpanded = Boolean(state.ui.forgotPasswordExpanded);

  return `
    <div class="screen-scroll no-nav" data-screen-id="27">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="nav-back">
          ${ICONS.back} <span>Back</span>
        </button>
      </div>

      <div style="padding:4px 16px 14px;">
        <div class="eyebrow">${mode === 'create' ? 'CREATE ACCOUNT' : 'SIGN IN'}</div>
        <h1 class="display-xl" style="margin:4px 0 6px;">${mode === 'create' ? 'Join CNU Free' : 'Welcome back'}</h1>
        <p class="body-copy">${
          mode === 'create'
            ? 'Set up your profile so friends can find you and compare free windows.'
            : 'Enter your username and password to pick up where you left off.'
        }</p>
      </div>

      <div class="stack-gap">
        <div class="card card-pad">
          ${
            mode === 'create'
              ? `
                <div class="form-row-2col" style="margin-bottom:12px;">
                  <div>
                    <label class="field-label" for="auth-first-name">FIRST NAME</label>
                    <input
                      id="auth-first-name"
                      type="text"
                      class="field-input ${errors.firstName ? 'error' : ''}"
                      value="${escapeHtml(form.firstName || '')}"
                      data-field="auth-firstName"
                    />
                    ${errors.firstName ? `<div class="field-error-text">${escapeHtml(errors.firstName)}</div>` : ''}
                  </div>
                  <div>
                    <label class="field-label" for="auth-last-name">LAST NAME</label>
                    <input
                      id="auth-last-name"
                      type="text"
                      class="field-input"
                      value="${escapeHtml(form.lastName || '')}"
                      data-field="auth-lastName"
                    />
                  </div>
                </div>
              `
              : ''
          }

          <div class="form-group">
            <label class="field-label" for="auth-username">USERNAME</label>
            <input
              id="auth-username"
              type="text"
              class="field-input ${errors.username ? 'error' : ''}"
              value="@${escapeHtml((form.username || '').replace(/^@/, ''))}"
              data-field="auth-username"
            />
            ${errors.username ? `<div class="field-error-text">${escapeHtml(errors.username)}</div>` : ''}
          </div>

          <div class="form-group" style="margin-bottom:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <label class="field-label" style="margin:0;" for="auth-password">PASSWORD</label>
              ${
                mode === 'signin'
                  ? `<button type="button" class="section-action" style="font-size:12px;" data-action="toggle-forgot-password">Forgot password?</button>`
                  : ''
              }
            </div>
            <input
              id="auth-password"
              type="password"
              class="field-input ${errors.password ? 'error' : ''}"
              style="margin-top:6px;"
              value="${escapeHtml(form.password || '')}"
              data-field="auth-password"
            />
            ${errors.password ? `<div class="field-error-text">${escapeHtml(errors.password)}</div>` : ''}
          </div>

          ${
            forgotExpanded && mode === 'signin'
              ? `
                <div style="margin-top:12px; padding-top:12px; border-top:1px solid var(--divider);">
                  <label class="field-label" for="forgot-email">RECOVERY EMAIL</label>
                  <div style="display:flex; gap:8px;">
                    <input
                      id="forgot-email"
                      type="email"
                      class="field-input"
                      value="${escapeHtml(state.ui.forgotPasswordEmail || 'francis@cnu.edu.ph')}"
                      placeholder="you@university.edu"
                      data-field="forgot-email"
                    />
                    <button type="button" class="pill-btn-ink" data-action="send-reset-link">Send reset link</button>
                  </div>
                </div>
              `
              : ''
          }
        </div>

        <button
          type="button"
          class="btn-primary"
          data-action="submit-auth-form"
        >${mode === 'create' ? 'Create account' : 'Sign in'}</button>

        <div style="text-align:center; font-size:13px; color:#5A6862; margin-top:8px;">
          ${
            mode === 'create'
              ? `Already have an account? <button type="button" class="section-action" style="display:inline;" data-action="toggle-auth-mode">Sign in</button>`
              : `New to CNU Free? <button type="button" class="section-action" style="display:inline;" data-action="toggle-auth-mode">Create an account</button>`
          }
        </div>
      </div>
    </div>
  `;
}

/**
 * Screen 28: Import Your Timetable (Upload / Camera) (Section 6.2)
 */
export function renderImportUploadScreen() {
  return `
    <div class="screen-scroll no-nav" data-screen-id="28">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="cancel-import-upload">Cancel</button>
        <span style="font-size:12px; font-weight:800; color:#5A6862;">STEP 1 OF 2</span>
      </div>

      <div style="padding:0 16px 12px;">
        <h1 class="display-xl">Import your timetable</h1>
        <p class="body-copy">Upload a screenshot or photo of your class schedule. We'll turn it into your week in seconds.</p>
      </div>

      <div class="stack-gap">
        <input
          id="timetable-file-input"
          type="file"
          accept="image/*"
          style="display:none;"
          data-field="timetable-file-input"
        />

        <button
          type="button"
          class="dropzone"
          style="width:100%;"
          data-action="pick-timetable-photo"
          data-source="PROMPT"
        >
          <div class="avatar avatar-lg av-mint" style="margin:0 auto 12px; color:#073D22;">${ICONS.camera}</div>
          <div style="font-family:var(--font-display); font-size:18px; font-weight:800; margin-bottom:4px;">Add a photo of your timetable</div>
          <div class="row-sub" style="margin-bottom:14px;">Screenshots from your student portal work best · PNG or JPG</div>
          <div style="display:flex; justify-content:center; gap:6px; flex-wrap:wrap;">
            <span class="chip" style="min-height:28px; font-size:11px; background:#EEF1EF;">Course code</span>
            <span class="chip" style="min-height:28px; font-size:11px; background:#EEF1EF;">Days &amp; times</span>
            <span class="chip" style="min-height:28px; font-size:11px; background:#EEF1EF;">Room</span>
          </div>
        </button>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
          <button
            type="button"
            class="btn-primary"
            style="gap:8px; font-size:13px;"
            data-action="pick-timetable-photo"
            data-source="CAMERA"
          >${ICONS.camera} Take photo</button>
          <button
            type="button"
            class="btn-secondary"
            style="background:#FFF; border:1.5px solid #D5DDD8; border-radius:999px; gap:8px; font-size:13px;"
            data-action="pick-timetable-photo"
            data-source="PHOTOS"
          >${ICONS.image} Choose from library</button>
        </div>

        <div class="card card-pad" style="padding:14px 16px;">
          <div class="eyebrow" style="margin-bottom:8px;">FOR BEST RESULTS</div>
          <div style="display:flex; flex-direction:column; gap:8px; font-size:13px; color:#3E4B45; font-weight:600;">
            <div style="display:flex; align-items:center; gap:8px;"><span style="color:#1FB86B;">${ICONS.check}</span> Crop so Monday–Saturday and all hours fit in frame</div>
            <div style="display:flex; align-items:center; gap:8px;"><span style="color:#1FB86B;">${ICONS.check}</span> You'll review every class before anything is saved</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Screen 24: Import — Reading Your Timetable (OCR Loading) (Section 4.9 & 6.2)
 */
export function renderOcrLoadingScreen() {
  return `
    <div class="screen-scroll no-nav" data-screen-id="24">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="cancel-ocr-scan">Cancel</button>
      </div>

      <div style="padding:4px 16px 12px;">
        <h1 class="display-xl">Reading your timetable</h1>
        <p class="body-copy">Finding classes, days, and room numbers from your photo (Mock OCR)…</p>
      </div>

      <div class="stack-gap">
        <div class="scan-card">
          <div class="scan-line"></div>
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; opacity:0.65;">
            <div style="height:44px; background:rgba(108,242,162,0.22); border:1px solid #6CF2A2; border-radius:10px; padding:6px; font-size:10px; color:#6CF2A2;">ITMC321</div>
            <div style="height:44px; background:rgba(255,255,255,0.08); border-radius:10px;"></div>
            <div style="height:44px; background:rgba(108,242,162,0.22); border:1px solid #6CF2A2; border-radius:10px; padding:6px; font-size:10px; color:#6CF2A2;">ITMC311</div>
            <div style="height:44px; background:rgba(255,255,255,0.08); border-radius:10px;"></div>
            <div style="height:44px; background:rgba(108,242,162,0.22); border:1px solid #6CF2A2; border-radius:10px; padding:6px; font-size:10px; color:#6CF2A2;">ITMC323</div>
            <div style="height:44px; background:rgba(255,255,255,0.08); border-radius:10px;"></div>
          </div>
          <div style="margin-top:16px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
            <span style="color:#6CF2A2; font-weight:800;">● Detecting time blocks…</span>
            <span style="color:#B7C6BF;">9 found so far</span>
          </div>
        </div>

        <div class="card card-pad">
          <div class="row" style="border:none;"><div class="sk-line w60"></div><div class="sk-pill"></div></div>
          <div class="row" style="border:none;"><div class="sk-line w80"></div><div class="sk-pill"></div></div>
          <div class="row" style="border:none;"><div class="sk-line w40"></div><div class="sk-pill"></div></div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Screen 25: Import — Couldn't Read That Photo (OCR Error) (Section 6.2)
 */
export function renderOcrErrorScreen() {
  return `
    <div class="screen-scroll no-nav" data-screen-id="25">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="cancel-ocr-scan">Cancel</button>
      </div>

      <div class="stack-gap" style="margin-top:12px;">
        <div class="card card-pad" style="text-align:center;">
          <div class="dialog-icon-circle" style="background:#FFF1D6; color:#5C3A00;">${ICONS.alert}</div>
          <h1 class="dialog-title">Couldn't read that photo</h1>
          <p class="dialog-copy">The image was too blurry or cropped to find time blocks. Try a clearer screenshot of your full week.</p>

          <div style="text-align:left; background:#F5F7F6; border-radius:14px; padding:12px 14px; margin-bottom:16px; font-size:12px; color:#3E4B45;">
            <div style="margin-bottom:4px;">• Include day headers (Mon–Sat) and time column</div>
            <div>• Avoid glare or angled photos of a monitor</div>
          </div>

          <button type="button" class="btn-primary" style="margin-bottom:8px;" data-action="retake-timetable-photo">Try another photo</button>
          <button type="button" class="btn-secondary" data-action="add-classes-manually-from-ocr">Add classes manually</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Screen 4: Import Timetable Review (Section 4.9, Section 6.2 & Addendum B §4)
 * - Saving requires zero flagged rows (button disabled while any row is flagged).
 * - Tapping amber row or "Check time" -> 9 (edit-import-row, returnTo 4; saving clears flag and returns to 4).
 */
export function renderOcrReviewScreen(state) {
  const drafts = state.ocrDrafts || [];
  const flaggedCount = countFlaggedOcrDrafts(drafts);
  const canSave = canSaveOcrDrafts(drafts);

  return `
    <div class="screen-scroll no-nav" data-screen-id="4">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="retake-timetable-photo">Cancel</button>
        <span class="pill-free-soft">${drafts.length} FOUND · ${flaggedCount} TO CHECK</span>
      </div>

      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Review your timetable</h1>
        <p class="body-copy">We read this from your photo. Tap any class to fix times or rooms before saving.</p>
      </div>

      <div class="stack-gap">
        <div class="card card-pad" style="padding:12px;">
          <div class="eyebrow" style="margin-bottom:8px;">DETECTED WEEK · MON – SAT</div>
          <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:6px; height:96px; background:#F5F7F6; padding:8px; border-radius:14px; position:relative;">
            <div style="position:relative;"><div class="wk-block busy" style="top:15%; height:26%; font-size:9px;">321</div></div>
            <div style="position:relative;">
              <div class="wk-block busy" style="top:15%; height:26%; font-size:9px;">311</div>
              <div class="wk-block busy" style="top:65%; height:22%; font-size:9px;">323</div>
            </div>
            <div style="position:relative;"><div class="wk-block busy" style="top:15%; height:26%; font-size:9px;">321</div></div>
            <div style="position:relative;"><div class="wk-block busy" style="top:15%; height:26%; font-size:9px;">311</div></div>
            <div style="position:relative;"><div class="wk-block amber" style="top:10%; height:35%; font-size:9px;">314?</div></div>
            <div style="position:relative;"><div class="wk-block busy" style="top:18%; height:55%; font-size:9px;">CWTS</div></div>
          </div>
        </div>

        <div class="card card-pad" style="padding:6px 14px;">
          ${drafts
            .map((d) => {
              const daysStr = (d.days || []).map((idx) => WEEKDAY_SHORT[idx]).join(' · ');
              const timeStr = `${formatTime12(d.start).replace(' AM', '').replace(' PM', '')} – ${formatTime12(d.end)}`;
              const isFlagged = d.flag === 'check_time';

              if (isFlagged) {
                return `
                  <button
                    type="button"
                    class="row"
                    style="width:100%; background:#FFF1D6; margin:4px 0; padding:12px 10px; border-radius:14px; border:1.5px solid #F2B34C; text-align:left; cursor:pointer;"
                    data-action="edit-ocr-draft-row"
                    data-draft-id="${escapeHtml(d.id)}"
                  >
                    <div class="row-body">
                      <div class="row-title clamp-2" style="color:#5C3A00;">${escapeHtml(d.short || d.title)}</div>
                      <div class="row-sub" style="color:#5C3A00;">${escapeHtml(daysStr)} · ${escapeHtml(timeStr)}? · Check time</div>
                    </div>
                    <span class="pill-amber">Check time</span>
                  </button>
                `;
              }

              return `
                <button
                  type="button"
                  class="row"
                  style="width:100%; background:none; border:none; text-align:left; cursor:pointer;"
                  data-action="edit-ocr-draft-row"
                  data-draft-id="${escapeHtml(d.id)}"
                >
                  <div class="row-body">
                    <div class="row-title clamp-2">${escapeHtml(d.short || d.title)}</div>
                    <div class="row-sub">${escapeHtml(daysStr)} · ${escapeHtml(timeStr)}${
                      d.detail ? ` · ${escapeHtml(d.detail)}` : d.room ? ` · ${escapeHtml(d.room)}` : ''
                    }</div>
                  </div>
                  <span style="color:#1FB86B;">${ICONS.check}</span>
                </button>
              `;
            })
            .join('')}
        </div>

        <div style="display:grid; grid-template-columns:1fr 1.6fr; gap:10px; margin-top:4px;">
          <button
            type="button"
            class="btn-secondary"
            style="background:#FFF; border-radius:999px;"
            data-action="retake-timetable-photo"
          >Retake photo</button>
          <button
            type="button"
            class="btn-primary"
            data-action="save-ocr-timetable"
            ${!canSave ? 'disabled' : ''}
          >Save ${drafts.length} classes</button>
        </div>
      </div>
    </div>
  `;
}

/**
 * Screen 29: Timetable Saved Success (Section 6.2)
 */
export function renderOcrSuccessScreen(state) {
  const count = (state.user.entries || []).length || 17;
  return `
    <div class="screen-scroll no-nav" data-screen-id="29">
      <div style="padding:36px 16px 20px; display:flex; flex-direction:column; align-items:center; text-align:center;">
        <div class="success-check">${ICONS.checkLarge}</div>
        <div class="eyebrow" style="color:#0B5A33;">TIMETABLE SAVED</div>
        <h1 class="display-xl" style="margin:6px 0 8px;">Your week is ready</h1>
        <p class="body-copy" style="max-width:300px; margin-bottom:20px;">
          We added ${count} classes and calculated your free windows for Monday through Saturday.
        </p>

        <div class="card card-pad" style="width:100%; margin:0 0 20px; text-align:left;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div>
              <div class="eyebrow">WEEKLY SUMMARY</div>
              <div class="row-title" style="font-size:16px;">${count} classes · shared with Friends</div>
            </div>
            <span class="pill-free-soft">Shared with Friends</span>
          </div>
          <div class="day-ribbon" aria-hidden="true">
            <div class="ribbon-seg free" style="width:20%;"><span>Free</span></div>
            <div class="ribbon-seg busy" style="width:22%;"><span>ITMC</span></div>
            <div class="ribbon-seg free" style="width:28%;"><span>Free</span></div>
            <div class="ribbon-seg busy" style="width:18%;"><span>LAB</span></div>
            <div class="ribbon-seg free" style="width:12%;"></div>
          </div>
          <div style="font-size:12px; color:#0B5A33; font-weight:700; margin-top:10px;">
            Best overlap today: 1:00 – 4:00 PM with Gian &amp; Danica
          </div>
        </div>

        <button type="button" class="btn-primary" style="margin-bottom:8px;" data-action="open-my-week-from-success">View my week</button>
        <button type="button" class="btn-secondary" data-action="back-to-now-from-success">Back to Now</button>
      </div>
    </div>
  `;
}
