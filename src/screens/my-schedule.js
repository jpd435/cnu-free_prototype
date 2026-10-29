/* ==========================================================================
   CNU FREE V2 — SCREEN 8 (MY WEEK), SCREEN 37 (MY DAY) & SCREEN 9 (ADD/EDIT CLASS)
   (src/screens/my-schedule.js)
   Section 4.6, Section 6.6 & Addendum B:
   - Day/Week chips swap modes in place (8 <-> 37).
   - Visible day window is 7:00–21:00 (14 hours, labels 7A to 9P) and scrolls
     inside its card.
   - "+" -> 9 (add; empty-slot taps prefill day and time).
   - Class block or "Edit" -> 9 (edit).
   - Screen 9: native <input type="time">, weekday pills, start < end min 15m
     validation ("End time must be after start time"), self-overlap validation,
     Delete class confirm dialog, and dirty-form "Discard changes?" confirm dialog.
   ========================================================================== */

import { ICONS } from '../ui/icons.js';
import { escapeHtml } from '../ui/avatar.js';
import {
  now,
  DEMO_WEEK_DATES,
  DAY_WINDOW_START,
  DAY_WINDOW_END,
  TIMELINE_HOUR_LABELS,
  WEEKDAY_LETTER,
  WEEKDAY_FULL,
  getEntriesForDay,
  computeFreeIntervals,
  formatRange,
  formatDuration
} from '../time.js';
import { validateClassEntry } from '../validators.js';
import { canPopCurrentStack } from '../router.js';

export function renderMyScheduleScreen(state, modeOverride = null) {
  const mode = modeOverride || state.ui.myScheduleMode || 'week';
  const currentNow = now();
  const dayIndex = typeof state.ui.myScheduleDayIndex === 'number' ? state.ui.myScheduleDayIndex : currentNow.dayIndex;
  const dayMeta = DEMO_WEEK_DATES[dayIndex] || DEMO_WEEK_DATES[1];
  const showBack = canPopCurrentStack();

  return `
    <div class="screen-scroll" data-screen-id="${mode === 'day' ? '37' : '8'}">
      <div class="top-bar" style="padding-bottom:2px;">
        ${
          showBack
            ? `<button type="button" class="back-btn" data-action="nav-back">${ICONS.back} <span>Back</span></button>`
            : `<span class="meta-label">${mode === 'day' ? `${escapeHtml(dayMeta.dotUpper)} · YOUR SCHEDULE` : 'OCT 26 – NOV 1 · SEM 1'}</span>`
        }
        <button
          type="button"
          class="icon-btn-dark"
          aria-label="Add class"
          data-action="open-add-class"
          data-return-to="${mode === 'day' ? '37' : '8'}"
        >${ICONS.plus}</button>
      </div>

      <div style="padding:0 16px 10px; display:flex; justify-content:space-between; align-items:center;">
        <h1 class="display-xl">${mode === 'day' ? 'My day' : 'My week'}</h1>
        <div class="seg-group" role="tablist" aria-label="Schedule view mode">
          <button
            type="button"
            class="seg-btn ${mode === 'day' ? 'active' : ''}"
            data-action="set-my-schedule-mode"
            data-mode="day"
            aria-selected="${mode === 'day'}"
          >Day</button>
          <button
            type="button"
            class="seg-btn ${mode === 'week' ? 'active' : ''}"
            data-action="set-my-schedule-mode"
            data-mode="week"
            aria-selected="${mode === 'week'}"
          >Week</button>
        </div>
      </div>

      <div class="stack-gap">
        ${
          mode === 'week'
            ? renderMyWeekBody(state, currentNow)
            : renderMyDayBody(state, dayIndex, dayMeta, currentNow)
        }
      </div>
    </div>
  `;
}

function renderMyWeekBody(state, currentNow) {
  const canvasStart = DAY_WINDOW_START; // 7:00 (420)
  const canvasEnd = DAY_WINDOW_END;     // 21:00 (1260)
  const canvasSpan = canvasEnd - canvasStart; // 840 mins (14h)
  const highlightId = state.ui.highlightClassId;

  return `
    <div class="card card-pad" style="padding:12px;">
      <div class="week-grid-header">
        <div></div>
        ${DEMO_WEEK_DATES.map(
          (d) => `<div class="${d.dayIndex === currentNow.dayIndex ? 'today' : ''}">${d.letter}<br>${d.num}</div>`
        ).join('')}
      </div>
      <div class="timeline-scroll" data-timeline-scroll="my-week" style="max-height:360px; overflow-y:auto;">
        <div class="week-grid-body" style="height:640px;">
          <div class="week-hours">
            ${TIMELINE_HOUR_LABELS.map((lbl) => `<span>${lbl}</span>`).join('')}
          </div>
          ${DEMO_WEEK_DATES.map((d) => {
            const dayEntries = getEntriesForDay(state.user, d.dayIndex);
            const dayFree = computeFreeIntervals(state.user, d.dayIndex, canvasStart, canvasEnd).filter(
              (iv) => iv.end - iv.start >= 120
            );

            return `
              <div
                class="week-day-col ${d.dayIndex === currentNow.dayIndex ? 'today' : ''}"
                data-action="empty-slot-add-class"
                data-day-index="${d.dayIndex}"
                data-start="540"
                style="cursor:pointer;"
              >
                ${dayEntries
                  .map((e) => {
                    const s = Math.max(canvasStart, e.start);
                    const end = Math.min(canvasEnd, e.end);
                    if (end <= s) return '';
                    const top = ((s - canvasStart) / canvasSpan) * 100;
                    const h = Math.max(6, ((end - s) / canvasSpan) * 100);
                    const isHighlighted = highlightId === e.id;
                    const shortLabel = (e.short || e.code || e.title || 'Class').split(' ')[0];
                    return `
                      <button
                        type="button"
                        class="wk-block busy"
                        style="top:${top.toFixed(1)}%; height:${h.toFixed(1)}%; width:calc(100% - 4px); border:${
                          isHighlighted ? '2px solid #0B1B16' : 'none'
                        }; text-align:left;"
                        data-action="open-edit-class"
                        data-class-id="${escapeHtml(e.id)}"
                        data-return-to="8"
                        title="${escapeHtml(e.title)}"
                      >${escapeHtml(shortLabel)}</button>
                    `;
                  })
                  .join('')}

                ${dayFree
                  .slice(0, 1)
                  .map((f) => {
                    const s = Math.max(canvasStart, f.start);
                    const end = Math.min(canvasEnd, f.end);
                    if (end <= s) return '';
                    const top = ((s - canvasStart) / canvasSpan) * 100;
                    const h = ((end - s) / canvasSpan) * 100;
                    return `
                      <button
                        type="button"
                        class="wk-block free"
                        style="top:${top.toFixed(1)}%; height:${h.toFixed(1)}%; width:calc(100% - 4px); text-align:left; cursor:pointer;"
                        data-action="empty-slot-add-class"
                        data-day-index="${d.dayIndex}"
                        data-start="${f.start}"
                      >Free</button>
                    `;
                  })
                  .join('')}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>

    <div class="card card-pad row" style="padding:12px 16px;">
      <div class="avatar avatar-sm av-mint" style="color:#073D22;">${ICONS.camera}</div>
      <div class="row-body">
        <div class="row-title">Import from photo</div>
        <div class="row-sub">Scan your registrar timetable</div>
      </div>
      <button type="button" class="section-action" data-action="open-import-timetable">Scan →</button>
    </div>
  `;
}

function renderMyDayBody(state, dayIndex, dayMeta, currentNow) {
  const canvasStart = DAY_WINDOW_START; // 7:00
  const canvasEnd = DAY_WINDOW_END;     // 21:00
  const canvasSpan = canvasEnd - canvasStart; // 840 mins
  const entries = getEntriesForDay(state.user, dayIndex);
  const freeIntervals = computeFreeIntervals(state.user, dayIndex, canvasStart, canvasEnd);
  const nowPct = Math.max(0, Math.min(100, ((currentNow.minutes - canvasStart) / canvasSpan) * 100));

  return `
    <div class="day-strip" style="padding:0;" role="tablist" aria-label="Select day">
      ${DEMO_WEEK_DATES.map((d) => {
        const active = d.dayIndex === dayIndex;
        return `
          <button
            type="button"
            class="day-pill ${active ? 'active' : ''}"
            data-action="set-my-schedule-day"
            data-day-index="${d.dayIndex}"
            aria-selected="${active}"
          >
            <span class="d-let">${d.letter}</span>
            <span class="d-num">${d.num}</span>
            <span class="d-dot"></span>
          </button>
        `;
      }).join('')}
    </div>

    <div class="card card-pad">
      <div class="timeline-scroll" data-timeline-scroll="my-day" style="max-height:340px; overflow-y:auto;">
        <div class="timeline-wrap" style="height:700px;">
          <div class="timeline-hours">
            ${TIMELINE_HOUR_LABELS.map((lbl) => `<span>${lbl}</span>`).join('')}
          </div>
          <div class="timeline-canvas">
            ${TIMELINE_HOUR_LABELS.map((_, idx) => {
              const pct = (idx / (TIMELINE_HOUR_LABELS.length - 1)) * 100;
              return `<div class="tl-grid-line" style="top:${pct.toFixed(2)}%;"></div>`;
            }).join('')}

            ${freeIntervals
              .filter((f) => f.end - f.start >= 30)
              .map((f) => {
                const s = Math.max(canvasStart, f.start);
                const e = Math.min(canvasEnd, f.end);
                if (e <= s) return '';
                const top = ((s - canvasStart) / canvasSpan) * 100;
                const h = ((e - s) / canvasSpan) * 100;
                return `
                  <button
                    type="button"
                    class="tl-block free"
                    style="top:${top.toFixed(1)}%; height:${h.toFixed(1)}%; width:calc(100% - 8px); text-align:left; cursor:pointer;"
                    data-action="empty-slot-add-class"
                    data-day-index="${dayIndex}"
                    data-start="${f.start}"
                  >
                    <span class="tl-title">Free · ${escapeHtml(formatDuration(e - s))}</span>
                    <span class="tl-sub">${escapeHtml(formatRange(s, e))} · Tap to add class</span>
                  </button>
                `;
              })
              .join('')}

            ${entries
              .map((entry) => {
                const s = Math.max(canvasStart, entry.start);
                const e = Math.min(canvasEnd, entry.end);
                if (e <= s) return '';
                const top = ((s - canvasStart) / canvasSpan) * 100;
                const h = ((e - s) / canvasSpan) * 100;
                return `
                  <div
                    class="tl-block busy"
                    style="top:${top.toFixed(1)}%; height:${h.toFixed(1)}%; flex-direction:row; justify-content:space-between; align-items:center;"
                    data-class-id="${escapeHtml(entry.id)}"
                  >
                    <div style="min-width:0; flex:1;">
                      <div class="tl-title clamp-2">${escapeHtml(entry.short || entry.title)}</div>
                      <div class="tl-sub">${escapeHtml(formatRange(entry.start, entry.end))}${
                        entry.detail ? ` · ${escapeHtml(entry.detail)}` : entry.room ? ` · ${escapeHtml(entry.room)}` : ''
                      }</div>
                    </div>
                    <button
                      type="button"
                      class="section-action"
                      data-action="open-edit-class"
                      data-class-id="${escapeHtml(entry.id)}"
                      data-return-to="37"
                    >Edit</button>
                  </div>
                `;
              })
              .join('')}

            ${
              dayIndex === currentNow.dayIndex &&
              currentNow.minutes >= canvasStart &&
              currentNow.minutes <= canvasEnd
                ? `
                  <div class="now-line" style="top:${nowPct.toFixed(1)}%;">
                    <span class="now-pill">${escapeHtml(currentNow.formattedTime.replace(' AM', '').replace(' PM', ''))}</span>
                  </div>
                `
                : ''
            }
          </div>
        </div>
      </div>
    </div>

    <div class="card card-pad row" style="padding:12px 16px;">
      <div class="avatar avatar-sm av-mint" style="color:#073D22;">${ICONS.camera}</div>
      <div class="row-body">
        <div class="row-title">Import from photo</div>
        <div class="row-sub">Scan your registrar timetable</div>
      </div>
      <button type="button" class="section-action" data-action="open-import-timetable">Scan →</button>
    </div>
  `;
}

/**
 * Screen 9: Add / Edit a Class (Section 4.6 & Section 6.6)
 */
export function renderClassFormScreen(state) {
  const mode = state.ui.classFormMode || 'add';
  const form = state.ui.classForm || {
    activity: 'ITMC321 Integrative Programming and Technologies 1',
    room: 'L307',
    days: [0],
    starts: '15:00',
    ends: '13:00',
    repeat: 'weekly',
    notes: 'Bring laptop'
  };

  const editingId = mode === 'edit' ? state.ui.editingClassId : null;
  const existingEntries = mode === 'edit-import-row'
    ? (state.ocrDrafts || []).filter((d) => d.id !== state.ui.editingClassId)
    : state.user.entries || [];

  const validation = validateClassEntry(
    {
      id: editingId,
      activity: form.activity,
      days: form.days,
      start: form.starts,
      end: form.ends,
      repeat: form.repeat
    },
    existingEntries
  );

  const heading =
    mode === 'edit'
      ? 'Edit class'
      : mode === 'edit-import-row'
      ? 'Confirm class time'
      : 'Add a class';

  return `
    <div class="screen-scroll no-nav" data-screen-id="9">
      <div class="top-bar">
        <button type="button" class="back-btn" data-action="cancel-class-form">Cancel</button>
        <span style="font-size:13px; font-weight:700; color:#5A6862;">BUSY BLOCK</span>
        <span style="width:48px;"></span>
      </div>

      <div style="padding:0 16px 10px;">
        <h1 class="display-xl">${escapeHtml(heading)}</h1>
      </div>

      <div class="stack-gap">
        <div class="card card-pad">
          <div class="form-group">
            <label class="field-label" for="class-activity">CLASS OR ACTIVITY</label>
            <input
              id="class-activity"
              type="text"
              class="field-input ${validation.errors.title ? 'error' : ''}"
              value="${escapeHtml(form.activity)}"
              placeholder="e.g. ITMC311 Information Management"
              data-field="class-activity"
            />
            ${validation.errors.title ? `<div class="field-error-text">${escapeHtml(validation.errors.title)}</div>` : ''}
          </div>

          <div class="form-group">
            <label class="field-label" for="class-room">LOCATION / ROOM</label>
            <input
              id="class-room"
              type="text"
              class="field-input"
              value="${escapeHtml(form.room)}"
              placeholder="Optional"
              data-field="class-room"
            />
          </div>

          <div class="form-group">
            <label class="field-label">DAYS</label>
            <div style="display:grid; grid-template-columns:repeat(7, 1fr); gap:4px;" role="group" aria-label="Select days of week">
              ${WEEKDAY_LETTER.map((letter, idx) => {
                const selected = (form.days || []).includes(idx);
                return `
                  <button
                    type="button"
                    class="weekday-pill ${selected ? 'active' : ''}"
                    style="width:100%;"
                    aria-label="${WEEKDAY_FULL[idx]}"
                    aria-pressed="${selected}"
                    data-action="toggle-class-day"
                    data-day-index="${idx}"
                  >${letter}</button>
                `;
              }).join('')}
            </div>
            ${validation.errors.days ? `<div class="field-error-text">${escapeHtml(validation.errors.days)}</div>` : ''}
          </div>

          <div class="form-row-2col" style="margin-bottom:14px;">
            <div>
              <label class="field-label" for="class-starts">STARTS</label>
              <input
                id="class-starts"
                type="time"
                class="field-input"
                value="${escapeHtml(form.starts)}"
                data-field="class-starts"
              />
            </div>
            <div>
              <label class="field-label" for="class-ends">ENDS</label>
              <input
                id="class-ends"
                type="time"
                class="field-input ${validation.errors.end || validation.errors.overlap ? 'error' : ''}"
                value="${escapeHtml(form.ends)}"
                data-field="class-ends"
              />
            </div>
          </div>

          ${
            validation.errors.end
              ? `<div class="field-error-text" style="margin-top:-8px; margin-bottom:12px;">${escapeHtml(validation.errors.end)}</div>`
              : validation.errors.overlap
              ? `<div class="field-error-text" style="margin-top:-8px; margin-bottom:12px;">${escapeHtml(validation.errors.overlap)}</div>`
              : ''
          }

          <div class="form-group">
            <label class="field-label">REPEAT</label>
            <div style="display:flex; gap:8px;">
              <button
                type="button"
                class="chip ${form.repeat !== 'once' ? 'active' : ''}"
                data-action="set-class-repeat"
                data-repeat="weekly"
              >Every week</button>
              <button
                type="button"
                class="chip ${form.repeat === 'once' ? 'active' : ''}"
                data-action="set-class-repeat"
                data-repeat="once"
              >One-off date</button>
            </div>
          </div>

          <div class="form-group" style="margin-bottom:0;">
            <label class="field-label" for="class-notes">NOTES</label>
            <input
              id="class-notes"
              type="text"
              class="field-input"
              value="${escapeHtml(form.notes || '')}"
              placeholder="Optional"
              data-field="class-notes"
            />
          </div>
        </div>

        <div style="padding:0 16px;" class="stack-gap">
          <button
            type="button"
            class="btn-primary"
            data-action="save-class-form"
            ${!validation.valid ? 'disabled' : ''}
          >Save class</button>

          ${
            mode === 'edit'
              ? `
                <button
                  type="button"
                  class="btn-secondary"
                  style="color:#B3261E;"
                  data-action="prompt-delete-class"
                >Delete class</button>
              `
              : ''
          }
        </div>
      </div>
    </div>
  `;
}
