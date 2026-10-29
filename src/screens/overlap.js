/**
 * CNU Free — Screen 2 & State 36: Overlap (SPEC V2 §4.3, §6.4 + Addendum B §3, §6 + Addendum C §2, §3, §4)
 * - Reads 100% of derived state from selectOverlapViewData (memoized selector in src/store.js).
 * - Updates Francis column blocks, all overlap windows, best window, highlighted band,
 *   proposal conflict banner, and "Suggest [time] to [friends]" button label in place.
 * - If the previously selected window disappears, falls back to the new best window or no-overlap state.
 */

import { ICONS } from '../ui/icons.js';
import { escapeHtml } from '../ui/avatar.js';
import {
  DEMO_WEEK_DATES,
  DAY_WINDOW_START,
  DAY_WINDOW_END,
  formatCompactRange,
  formatDurationLong
} from '../time.js';
import { selectOverlapViewData } from '../store.js';

export function renderOverlapScreen(state) {
  const data = selectOverlapViewData(state);
  const {
    dayIndex,
    dayMeta,
    participants,
    participantIds,
    overlapResult,
    windows,
    bestWindow,
    selectedWindow,
    columns,
    suggestButtonLabel,
    hasPrivateParticipant,
    firstPrivateParticipant,
    nextDayFallback,
    activeProposal
  } = data;

  const activeWindow = selectedWindow || bestWindow;
  const unselectedFriend = (state.friends || []).find((f) => !participantIds.includes(f.id));
  const addChipLabel = unselectedFriend ? `+ ${unselectedFriend.firstName}` : '+ Friends';

  return `
    <div class="screen-scroll" data-screen-id="${hasPrivateParticipant ? '36' : '2'}">
      <div class="top-bar" style="padding-bottom:2px;">
        <span class="meta-label" data-bind="overlap-meta-label">${escapeHtml(`COMPARE SCHEDULES · ${(dayMeta.label || dayMeta.short).toUpperCase()}`)}</span>
      </div>
      <div style="padding:0 16px 8px;">
        <h1 class="display-xl">Shared free time</h1>
      </div>

      <!-- Interactive Person Chips (scrolls horizontally with 10 friends) -->
      <div class="chip-row" role="group" aria-label="Selected participants" data-bind="overlap-participant-chips">
        ${participants
          .map((p) => {
            const isSelf = p.id === 'francis' || p.id === state.user.id;
            const isPrivate =
              !isSelf &&
              (p.shareLevel === 'none' ||
                p.sharesWithViewer === 'none' ||
                p.shareLevelToUser === 'private' ||
                p.shareLevelToUser === 'none');
            return `
              <button
                type="button"
                class="chip ${isPrivate ? 'amber' : 'active'}"
                data-action="toggle-overlap-chip"
                data-person-id="${escapeHtml(p.id)}"
                aria-pressed="true"
              >
                <span class="avatar avatar-xs ${p.avatarClass}">${escapeHtml(p.shortInitial || p.initials)}</span>
                ${escapeHtml(isSelf ? 'You' : p.firstName)}
                ${isPrivate ? `<span style="display:inline-flex; transform:scale(0.8);">${ICONS.lock}</span>` : ''}
                ${!isSelf ? '<span aria-hidden="true" style="opacity:0.75; margin-left:2px;">×</span>' : ''}
              </button>
            `;
          })
          .join('')}

        <button
          type="button"
          class="chip dashed"
          data-action="open-overlap-picker-sheet"
          data-bind="overlap-add-chip"
        >${escapeHtml(addChipLabel)}</button>
      </div>

      <!-- 7-Day Selector Strip (Mon–Sun) -->
      <div class="day-strip" role="tablist" aria-label="Select day of week" data-bind="overlap-day-strip">
        ${DEMO_WEEK_DATES.map((d) => {
          const active = d.dayIndex === dayIndex;
          return `
            <button
              type="button"
              class="day-pill ${active ? 'active' : ''}"
              data-action="set-overlap-day"
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

      <div class="stack-gap">
        <!-- State 36: Amber Private Banner when a private friend is selected -->
        ${
          hasPrivateParticipant && firstPrivateParticipant
            ? `
              <div class="amber-banner" style="margin:0 16px;" role="region" aria-label="Private schedule notice" data-bind="overlap-private-banner">
                <div class="row" style="padding:0; border:none;">
                  <div class="avatar avatar-sm av-gold" style="color:#5C3A00;">${ICONS.lock}</div>
                  <div class="row-body">
                    <div class="row-title" style="color:#5C3A00;">${escapeHtml(`Can't include ${firstPrivateParticipant.firstName}`)}</div>
                    <div class="row-sub" style="color:#5C3A00;">${escapeHtml(`${firstPrivateParticipant.firstName}'s schedule is private`)}</div>
                  </div>
                </div>
                <button
                  type="button"
                  class="btn-primary"
                  style="min-height:44px; font-size:13px;"
                  data-action="request-schedule-access"
                  data-friend-id="${escapeHtml(firstPrivateParticipant.id)}"
                  ${firstPrivateParticipant.accessRequested ? 'disabled' : ''}
                >${escapeHtml(firstPrivateParticipant.accessRequested ? 'Requested' : `Ask ${firstPrivateParticipant.firstName} for access`)}</button>
              </div>
            `
            : ''
        }

        <!-- Proposal Status / Conflict Notice (V2 §4.3 & Addendum C §4) -->
        ${
          activeProposal
            ? `
              <div
                class="${activeProposal.conflict ? 'amber-banner' : 'card card-pad'}"
                style="margin:0 16px; padding:10px 14px;"
                data-bind="overlap-proposal-banner"
              >
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                  <div>
                    <div class="eyebrow" style="color:${activeProposal.conflict ? '#5C3A00' : '#0B5A33'};" data-bind="overlap-proposal-status">${escapeHtml(activeProposal.status || 'Suggested')}</div>
                    <div style="font-size:13px; font-weight:700; color:${activeProposal.conflict ? '#5C3A00' : '#073D22'};" data-bind="overlap-proposal-detail">${escapeHtml(
                      `${dayMeta.short} ${formatCompactRange(activeProposal.windowStart, activeProposal.windowEnd)}${
                        activeProposal.conflict ? ` · Overlaps ${activeProposal.conflictWith}` : ''
                      }`
                    )}</div>
                  </div>
                </div>
              </div>
            `
            : ''
        }

        <!-- Multi-Person Timeline Card (7A–9P, scrollable) -->
        <div class="card card-pad" style="padding:12px;" data-bind="overlap-timeline-card">
          <div style="display:grid; grid-template-columns:36px repeat(${columns.length}, 1fr); gap:6px; margin-bottom:8px; text-align:center; font-size:11px; font-weight:800; color:#5A6862;" data-bind="overlap-col-headers">
            <div></div>
            ${columns
              .map(
                (col) =>
                  `<div class="clamp-1" data-key="col-hdr-${escapeHtml(col.personId)}" style="${col.isPrivate ? 'color:#5C3A00;' : ''}">${escapeHtml(col.name)}</div>`
              )
              .join('')}
          </div>

          <div class="timeline-scroll" data-timeline-scroll="true">
            <div class="timeline-wrap" style="height:520px;">
              <div class="timeline-hours">
                <span>7A</span><span>9A</span><span>11A</span><span>1P</span><span>3P</span><span>5P</span><span>7P</span><span>9P</span>
              </div>

              <div class="timeline-canvas" style="display:grid; grid-template-columns:repeat(${columns.length}, 1fr); gap:6px;" data-bind="overlap-canvas">
                <div class="tl-grid-line" data-key="gl-0" style="top:0%;"></div>
                <div class="tl-grid-line" data-key="gl-1" style="top:14.28%;"></div>
                <div class="tl-grid-line" data-key="gl-2" style="top:28.57%;"></div>
                <div class="tl-grid-line" data-key="gl-3" style="top:42.85%;"></div>
                <div class="tl-grid-line" data-key="gl-4" style="top:57.14%;"></div>
                <div class="tl-grid-line" data-key="gl-5" style="top:71.42%;"></div>
                <div class="tl-grid-line" data-key="gl-6" style="top:85.71%;"></div>
                <div class="tl-grid-line" data-key="gl-7" style="top:100%;"></div>

                ${columns.map((col) => renderColumnFromModel(col)).join('')}

                ${
                  activeWindow && !hasPrivateParticipant
                    ? renderBestOverlapCallout(activeWindow, columns.length)
                    : ''
                }
              </div>
            </div>
          </div>
        </div>

        <!-- All Shared Windows Selector Strip (updates in place when schedule changes) -->
        ${
          windows.length > 0 && !hasPrivateParticipant
            ? `
              <div class="chip-row" style="padding:0 16px;" role="group" aria-label="All shared free windows" data-bind="overlap-windows-list">
                ${windows
                  .map((w) => {
                    const isSelected =
                      activeWindow && w.start === activeWindow.start && w.end === activeWindow.end;
                    const isBest =
                      bestWindow && w.start === bestWindow.start && w.end === bestWindow.end;
                    return `
                      <button
                        type="button"
                        class="chip ${isSelected ? 'active' : ''}"
                        data-action="select-overlap-window"
                        data-key="win-${w.start}-${w.end}"
                        data-day-index="${dayIndex}"
                        data-window-start="${w.start}"
                        data-window-end="${w.end}"
                      >${escapeHtml(`${w.formatted}${isBest ? ' (Best)' : ''}`)}</button>
                    `;
                  })
                  .join('')}
              </div>
            `
            : ''
        }

        <!-- Bottom Summary Card: Best Window, Private Partial Window, or No-Overlap Fallback -->
        ${
          bestWindow
            ? hasPrivateParticipant
              ? `
                <div class="card card-pad" style="border:1.5px solid #1FB86B;" data-bind="overlap-summary-card">
                  <div class="eyebrow" style="color:#0B5A33;" data-bind="overlap-best-window-eyebrow">${escapeHtml(
                    `SHARED WITH ${
                      overlapResult.activeParticipants
                        .filter((p) => p.id !== 'francis' && p.id !== state.user.id)
                        .map((p) => p.firstName.toUpperCase())
                        .join(' & ') || 'FRIENDS'
                    } ONLY`
                  )}</div>
                  <div style="font-family:var(--font-display); font-size:18px; font-weight:800; color:#073D22; margin:2px 0;" data-bind="overlap-best-window-title">${escapeHtml(`${dayMeta.short} ${bestWindow.formatted} · ${formatDurationLong(bestWindow.duration)}`)}</div>
                  <div class="row-sub" data-bind="overlap-best-window-sub">${escapeHtml(`Excludes ${firstPrivateParticipant?.firstName || 'private friend'} until they share their schedule`)}</div>
                </div>
              `
              : `
                <div class="card-dark" style="padding:14px 16px;" data-bind="overlap-summary-card">
                  <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <div>
                      <div class="eyebrow" style="color:#6CF2A2;" data-bind="overlap-best-window-eyebrow">${escapeHtml(`BEST WINDOW · ${formatDurationLong(bestWindow.duration).toUpperCase()}`)}</div>
                      <div style="font-family:var(--font-display); font-size:19px; font-weight:800; color:#FFF; margin-top:2px;" data-bind="overlap-best-window-title">${escapeHtml(`${dayMeta.short} ${bestWindow.formatted}`)}</div>
                      <div style="font-size:12px; color:#B7C6BF;" data-bind="overlap-best-window-sub">${escapeHtml(
                        `All ${overlapResult.activeParticipants.length} free${
                          windows.length > 1
                            ? ` · Also ${windows
                                .filter((w) => w.start !== bestWindow.start || w.end !== bestWindow.end)
                                .map((w) => formatCompactRange(w.start, w.end))
                                .join(', ')}`
                            : ''
                        }`
                      )}</div>
                    </div>
                    <button
                      type="button"
                      class="btn-mint"
                      style="width:auto; min-height:44px; padding:0 16px; font-size:13px; flex-shrink:0;"
                      data-action="suggest-overlap-window"
                      data-bind="overlap-suggest-btn"
                      data-window-start="${activeWindow.start}"
                      data-window-end="${activeWindow.end}"
                    >${escapeHtml(suggestButtonLabel)}</button>
                  </div>
                </div>
              `
            : `
              <div class="card card-pad" style="text-align:center; padding:18px 16px;" data-bind="overlap-summary-card">
                <div class="row-title" style="font-size:16px; margin-bottom:4px;" data-bind="overlap-best-window-title">${escapeHtml(`No shared free time on ${dayMeta.label || dayMeta.short}`)}</div>
                <div class="row-sub" style="margin-bottom:12px;" data-bind="overlap-best-window-sub">Everyone's classes conflict between 7:00 AM and 9:00 PM.</div>
                ${
                  nextDayFallback
                    ? `
                      <button
                        type="button"
                        class="chip active"
                        data-action="set-overlap-day"
                        data-day-index="${nextDayFallback.dayIndex}"
                        data-bind="overlap-fallback-btn"
                      >${escapeHtml(`Try ${nextDayFallback.dayLabel} (${formatCompactRange(nextDayFallback.bestWindow.start, nextDayFallback.bestWindow.end)}) →`)}</button>
                    `
                    : ''
                }
              </div>
            `
        }
      </div>
    </div>
  `;
}

function renderColumnFromModel(col) {
  if (col.isPrivate) {
    return `
      <div data-overlap-col="${escapeHtml(col.personId)}" data-key="col-${escapeHtml(col.personId)}" style="position:relative; height:100%; border-radius:10px; background:repeating-linear-gradient(135deg, #DDE2DF 0 6px, #E8ECEA 6px 12px); display:flex; flex-direction:column; align-items:center; justify-content:center; color:#5A6862; gap:4px;">
        ${ICONS.lock}
        <span style="font-size:11px; font-weight:800;">Private</span>
      </div>
    `;
  }

  const freeHtml = col.freeBlocks
    .map(
      (f) => `
        <div class="tl-block free" data-key="${escapeHtml(f.id)}" style="top:${f.topPct.toFixed(1)}%; height:${f.heightPct.toFixed(1)}%; padding:4px 6px;">
          <span class="tl-title" style="font-size:10px;">Free</span>
        </div>
      `
    )
    .join('');

  const busyHtml = col.busyBlocks
    .map(
      (b) => `
        <div class="tl-block busy" data-key="busy-${escapeHtml(b.id)}" style="top:${b.topPct.toFixed(1)}%; height:${b.heightPct.toFixed(1)}%; padding:4px 6px;">
          <span class="tl-title clamp-2" style="font-size:10px;">${escapeHtml(b.title)}</span>
        </div>
      `
    )
    .join('');

  return `<div data-overlap-col="${escapeHtml(col.personId)}" data-key="col-${escapeHtml(col.personId)}" style="position:relative; height:100%;">${freeHtml}${busyHtml}</div>`;
}

function renderBestOverlapCallout(windowObj, participantCount) {
  const canvasStart = DAY_WINDOW_START;
  const canvasSpan = DAY_WINDOW_END - DAY_WINDOW_START;
  const s = Math.max(canvasStart, windowObj.start);
  const end = Math.min(DAY_WINDOW_END, windowObj.end);
  if (end <= s) return '';
  const topPct = ((s - canvasStart) / canvasSpan) * 100;
  const heightPct = Math.max(11, ((end - s) / canvasSpan) * 100);

  return `
    <div
      data-bind="overlap-highlight-band"
      data-overlap-callout="true"
      data-window-start="${windowObj.start}"
      data-window-end="${windowObj.end}"
      style="position:absolute; left:0; right:0; top:${topPct.toFixed(1)}%; height:${heightPct.toFixed(1)}%; background:rgba(108,242,162,0.9); border:2px solid #0B5A33; border-radius:14px; display:flex; flex-direction:column; justify-content:center; align-items:center; z-index:4; pointer-events:none; box-shadow:0 6px 18px rgba(11,90,51,0.16);"
    >
      <span style="font-size:10px; font-weight:800; letter-spacing:0.08em; color:#073D22;" data-bind="overlap-band-eyebrow">${escapeHtml(`ALL ${participantCount} FREE · ${formatDurationLong(windowObj.duration).toUpperCase()}`)}</span>
      <span style="font-family:var(--font-display); font-size:15px; font-weight:800; color:#073D22;" data-bind="overlap-band-time">${escapeHtml(windowObj.formatted)}</span>
    </div>
  `;
}
