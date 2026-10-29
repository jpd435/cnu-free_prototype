/**
 * CNU Free — Time & Status Engine (SPEC V2 §4.1, §4.2 + Addendum B §3, §4)
 * - Minutes since midnight (0..1440), weekdays Mon=0..Sun=6
 * - Visible day window: 7:00 (420) to 21:00 (1260)
 * - Class intervals are [start, end): at exactly end time the person is free.
 * - Integrates with src/clock.js for real-time + dev clock presets and speeds.
 */

import { resolvePrivacyLevel } from './privacy.js';
import { getClockNow, setClock, setClockPreset } from './clock.js';

export const DAY_WINDOW_START = 7 * 60;  // 420 (7:00 AM)
export const DAY_WINDOW_END = 21 * 60;   // 1260 (9:00 PM)
export const AFTER_HOURS_START = 19 * 60 + 30; // 1170 (7:30 PM)

export const TIMELINE_HOUR_LABELS = [
  '7A', '8A', '9A', '10A', '11A', '12P',
  '1P', '2P', '3P', '4P', '5P', '6P',
  '7P', '8P', '9P'
];

export const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WEEKDAY_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];
export const WEEKDAY_LETTER = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export const DEMO_WEEK_DATES = [
  { dayIndex: 0, short: 'Mon', letter: 'M', num: 26, label: 'Mon, Oct 26', dotUpper: 'MON · OCT 26' },
  { dayIndex: 1, short: 'Tue', letter: 'T', num: 27, label: 'Tue, Oct 27', dotUpper: 'TUE · OCT 27' },
  { dayIndex: 2, short: 'Wed', letter: 'W', num: 28, label: 'Wed, Oct 28', dotUpper: 'WED · OCT 28' },
  { dayIndex: 3, short: 'Thu', letter: 'T', num: 29, label: 'Thu, Oct 29', dotUpper: 'THU · OCT 29' },
  { dayIndex: 4, short: 'Fri', letter: 'F', num: 30, label: 'Fri, Oct 30', dotUpper: 'FRI · OCT 30' },
  { dayIndex: 5, short: 'Sat', letter: 'S', num: 31, label: 'Sat, Oct 31', dotUpper: 'SAT · OCT 31' },
  { dayIndex: 6, short: 'Sun', letter: 'S', num: 1, label: 'Sun, Nov 1', dotUpper: 'SUN · NOV 1' }
];

export function now() {
  return getClockNow();
}

export function setDemoMode(enabled, customClock = null) {
  if (!enabled) {
    return setClock({ mode: 'live', speed: 1 });
  }
  if (customClock) {
    return setClock({
      mode: 'dev',
      dayIndex: typeof customClock.dayIndex === 'number' ? customClock.dayIndex : 1,
      minutes: typeof customClock.minutes === 'number' ? customClock.minutes : 9 * 60 + 41,
      speed: customClock.speed || 1,
      paused: Boolean(customClock.paused)
    });
  }
  return setClockPreset('tue-0941');
}

export function isDemoMode() {
  return getClockNow().mode === 'dev';
}

/**
 * Parse "HH:MM" (24h) or "9:00 AM" into minutes since midnight (0..1440)
 */
export function parseTimeToMinutes(str) {
  if (typeof str === 'number') return str;
  if (!str || typeof str !== 'string') return NaN;
  const trimmed = str.trim();

  const ampmMatch = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hours = parseInt(ampmMatch[1], 10);
    const mins = parseInt(ampmMatch[2], 10);
    const period = ampmMatch[3].toUpperCase();
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    return hours * 60 + mins;
  }

  const h24Match = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (h24Match) {
    const hours = parseInt(h24Match[1], 10);
    const mins = parseInt(h24Match[2], 10);
    return hours * 60 + mins;
  }
  return NaN;
}

/**
 * Format minutes since midnight -> "1:00 PM"
 */
export function formatTime(minutes) {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '';
  const clamped = ((Math.round(minutes) % 1440) + 1440) % 1440;
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatTimeInput(minutes) {
  if (typeof minutes !== 'number' || Number.isNaN(minutes)) return '09:00';
  const clamped = Math.max(0, Math.min(1439, Math.round(minutes)));
  const h24 = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Format time range:
 * - Same period: "1:00 – 3:00 PM"
 * - Different period: "10:00 AM – 1:00 PM"
 */
export function formatRange(startMin, endMin) {
  const sClamped = Math.max(0, Math.min(1440, Math.round(startMin)));
  const eClamped = Math.max(0, Math.min(1440, Math.round(endMin)));
  const sPeriod = sClamped >= 720 && sClamped < 1440 ? 'PM' : 'AM';
  const ePeriod = eClamped >= 720 && eClamped < 1440 ? 'PM' : 'AM';
  const sH24 = Math.floor((sClamped % 1440) / 60);
  const sM = sClamped % 60;
  const sH12 = sH24 % 12 === 0 ? 12 : sH24 % 12;
  const sStr = `${sH12}:${String(sM).padStart(2, '0')}`;

  const eFull = formatTime(eClamped);
  if (sPeriod === ePeriod) {
    return `${sStr} – ${eFull}`;
  }
  return `${sStr} ${sPeriod} – ${eFull}`;
}

export function formatCompactRange(startMin, endMin) {
  const sPeriod = startMin >= 720 ? 'P' : 'A';
  const ePeriod = endMin >= 720 ? 'P' : 'A';
  const fmt = (min, includeP) => {
    const h24 = Math.floor(min / 60);
    const m = min % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const p = min >= 720 ? 'P' : 'A';
    const base = m === 0 ? `${h12}` : `${h12}:${String(m).padStart(2, '0')}`;
    return includeP ? `${base}${p}` : base;
  };
  return `${fmt(startMin, sPeriod !== ePeriod)}–${fmt(endMin, true)}`;
}

export function formatDuration(mins) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h}h ${rem}m`;
  if (h > 0) return `${h} hr${h > 1 ? 's' : ''}`;
  return `${rem}m`;
}

export function formatDurationLong(mins) {
  const m = Math.max(0, Math.round(mins));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (h > 0 && rem > 0) return `${h} h ${rem} m`;
  if (h > 0) return `${h} h`;
  return `${rem} m`;
}

export function formatRelativeTime(timestampMs, nowMs = now().epochMs) {
  if (typeof timestampMs === 'string') return timestampMs;
  if (typeof timestampMs !== 'number') return 'Just now';
  const diffSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays}d`;
}

/**
 * Parse raw class title into { title, short, detail } per Addendum B §3:
 * - short = title with all trailing parenthetical groups removed (fallback to raw title)
 * - detail = the last parenthetical group (e.g. "ZT33Am", "SVP 23", "MT LAB 1", "Lecture")
 */
export function parseScheduleTitle(rawTitle) {
  const raw = String(rawTitle || '').trim();
  if (!raw) return { title: '', short: '', detail: '' };

  let working = raw;
  let lastParen = '';
  const trailingRegex = /\s*\(([^()]*)\)\s*$/;

  while (true) {
    const match = working.match(trailingRegex);
    if (!match) break;
    if (!lastParen) {
      lastParen = match[1].trim();
    }
    working = working.slice(0, match.index).trim();
  }

  const short = working || raw;
  return {
    title: raw,
    short,
    detail: lastParen
  };
}

/**
 * Get a person's schedule entries for a given dayIndex (0=Mon..6=Sun), sorted by start time.
 */
export function getEntriesForDay(person, dayIndex) {
  if (!person || !Array.isArray(person.entries)) return [];
  return person.entries
    .filter((entry) => {
      if (typeof entry.day === 'number') return entry.day === dayIndex;
      if (Array.isArray(entry.days)) return entry.days.includes(dayIndex);
      return false;
    })
    .map((entry) => {
      const parsed = entry.short ? entry : { ...entry, ...parseScheduleTitle(entry.title || entry.code || '') };
      return {
        ...parsed,
        code: parsed.short || parsed.code || parsed.title,
        room: parsed.detail !== undefined ? parsed.detail : parsed.room || ''
      };
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * Merge overlapping or back-to-back busy intervals within [minWindow, maxWindow]
 */
export function getMergedBusySpans(person, dayIndex, minWindow = 0, maxWindow = 1440) {
  const entries = getEntriesForDay(person, dayIndex);
  const intervals = [];
  for (const e of entries) {
    const s = Math.max(minWindow, e.start);
    const end = Math.min(maxWindow, e.end);
    if (end > s) {
      intervals.push({ start: s, end, entries: [e] });
    }
  }
  intervals.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const curr of intervals) {
    if (merged.length === 0) {
      merged.push(curr);
    } else {
      const prev = merged[merged.length - 1];
      if (curr.start <= prev.end) {
        prev.end = Math.max(prev.end, curr.end);
        prev.entries.push(...curr.entries);
      } else {
        merged.push(curr);
      }
    }
  }
  return merged;
}

/**
 * Compute free intervals for a person on dayIndex within [windowStart, windowEnd]
 */
export function computeFreeIntervals(
  person,
  dayIndex,
  windowStart = DAY_WINDOW_START,
  windowEnd = DAY_WINDOW_END
) {
  const busy = getMergedBusySpans(person, dayIndex, windowStart, windowEnd);
  const free = [];
  let cursor = windowStart;
  for (const span of busy) {
    if (span.start > cursor) {
      free.push({ start: cursor, end: span.start, duration: span.start - cursor });
    }
    cursor = Math.max(cursor, span.end);
  }
  if (cursor < windowEnd) {
    free.push({ start: cursor, end: windowEnd, duration: windowEnd - cursor });
  }
  return free;
}

/**
 * Search the next 7 days for the person's next class after (dayIndex, currentMinutes)
 */
export function findNextClassIn7Days(person, dayIndex, currentMinutes) {
  if (!person || !Array.isArray(person.entries) || person.entries.length === 0) {
    return null;
  }

  // First check later today
  const todayEntries = getEntriesForDay(person, dayIndex);
  const laterToday = todayEntries.find((e) => e.start > currentMinutes);
  if (laterToday) {
    return {
      daysAhead: 0,
      dayIndex,
      entry: laterToday,
      formattedUntil: `Free until ${formatTime(laterToday.start)}`
    };
  }

  // Search next 1..7 days
  for (let offset = 1; offset <= 7; offset += 1) {
    const targetDay = (dayIndex + offset) % 7;
    const dayEntries = getEntriesForDay(person, targetDay);
    if (dayEntries.length > 0) {
      const first = dayEntries[0];
      const timeStr = formatTime(first.start);
      const dayPrefix = offset === 1 ? 'tomorrow' : WEEKDAY_SHORT[targetDay];
      return {
        daysAhead: offset,
        dayIndex: targetDay,
        entry: first,
        formattedUntil: `Free until ${dayPrefix} ${timeStr}`
      };
    }
  }

  return null;
}

/**
 * Compute status(person, now, viewer, groups) per SPEC V2 §4.2 + Addendum B §2, §3, §4:
 * - Intervals are [start, end): at exactly end time the person is FREE.
 * - Busy status untilMinutes is the end of the active class (e.g. Dane Tue 09:41 -> until 10:30 AM,
 *   Luanne Mon 11:00 -> until 1:00 PM).
 * - Empty timetable shows "No timetable yet" and counts as free all day.
 * - Free with no more classes today reads "Free for the rest of the day" during daytime,
 *   and "Free until tomorrow 7:30 AM" / "Free until Mon 9:00 AM" after hours.
 */
export function computePersonStatus(person, currentNow = now(), viewer = 'francis', groups = []) {
  const privacyLevel =
    person.id === viewer || person.isUser
      ? 'full'
      : resolvePrivacyLevel(person, viewer, groups);

  if (privacyLevel === 'none') {
    return {
      state: 'private',
      privacyLevel: 'none',
      until: null,
      untilMinutes: null,
      untilFormatted: null,
      remainingMinutes: 0,
      minutesLeft: 0,
      currentEntry: null,
      currentBlock: null,
      nextEntry: null,
      nextBlock: null,
      noTimetable: false,
      statusText: 'Schedule is private',
      untilCopy: 'Schedule is private',
      label: 'Schedule is private',
      sublabel: 'Only shared with selected groups',
      countdownLabel: 'Private'
    };
  }

  const allEntries = Array.isArray(person.entries) ? person.entries : [];
  if (allEntries.length === 0) {
    const m = currentNow.minutes;
    const remaining = Math.max(60, DAY_WINDOW_END - m);
    return {
      state: 'free',
      privacyLevel,
      until: DAY_WINDOW_END,
      untilMinutes: DAY_WINDOW_END,
      untilFormatted: formatTime(DAY_WINDOW_END),
      remainingMinutes: remaining,
      minutesLeft: remaining,
      currentEntry: null,
      currentBlock: null,
      nextEntry: null,
      nextBlock: null,
      noTimetable: true,
      statusText: 'No timetable yet',
      untilCopy: 'No timetable yet',
      label: 'Free now',
      sublabel: 'No timetable yet',
      countdownLabel: 'No timetable yet'
    };
  }

  const d = currentNow.dayIndex;
  const m = currentNow.minutes;
  const entries = getEntriesForDay(person, d);

  // Active class: [start, end)
  const activeEntry = entries.find((e) => e.start <= m && e < e.end ? false : e.start <= m && m < e.end) || null;

  if (activeEntry) {
    const untilMinutes = activeEntry.end;
    const untilFormatted = formatTime(untilMinutes);
    const remaining = Math.max(0, untilMinutes - m);
    const nextAfterBusy = entries.find((e) => e.start >= untilMinutes) || null;
    const showDetails = privacyLevel === 'full';
    const shortTitle = activeEntry.short || activeEntry.code || activeEntry.title;
    const detailRoom = activeEntry.detail || activeEntry.room || '';
    const resolvedCurrent = showDetails
      ? activeEntry
      : { ...activeEntry, title: 'Busy', short: 'Busy', code: 'Busy', detail: '', room: '' };
    const statusText = `Busy until ${untilFormatted}`;

    return {
      state: 'busy',
      privacyLevel,
      until: untilMinutes,
      untilMinutes,
      untilFormatted,
      remainingMinutes: remaining,
      minutesLeft: remaining,
      currentEntry: resolvedCurrent,
      currentBlock: resolvedCurrent,
      nextEntry: showDetails ? nextAfterBusy : null,
      nextBlock: showDetails ? nextAfterBusy : null,
      noTimetable: false,
      statusText,
      untilCopy: statusText,
      label: `Busy · Free ${untilFormatted}`,
      sublabel: showDetails
        ? `In ${shortTitle}${detailRoom ? ` (${detailRoom})` : ''} · Free at ${untilFormatted}`
        : statusText,
      countdownLabel: `Free ${untilFormatted}`
    };
  }

  // Person is FREE right now
  const nextToday = entries.find((e) => e.start > m) || null;
  const showDetails = privacyLevel === 'full';

  if (nextToday) {
    const untilMinutes = nextToday.start;
    const untilFormatted = formatTime(untilMinutes);
    const remaining = Math.max(0, untilMinutes - m);
    const nextShort = nextToday.short || nextToday.code || nextToday.title;
    const statusText = `Free until ${untilFormatted}`;

    return {
      state: 'free',
      privacyLevel,
      until: untilMinutes,
      untilMinutes,
      untilFormatted,
      remainingMinutes: remaining,
      minutesLeft: remaining,
      currentEntry: null,
      currentBlock: null,
      nextEntry: showDetails ? nextToday : null,
      nextBlock: showDetails ? nextToday : null,
      noTimetable: false,
      statusText,
      untilCopy: statusText,
      label: 'Free now',
      sublabel: showDetails
        ? `${statusText} · Next: ${nextShort}`
        : statusText,
      countdownLabel: `Until ${untilFormatted}`
    };
  }

  // Free with no more classes today
  const futureInfo = findNextClassIn7Days(person, d, m);
  const isAfterHours = m >= AFTER_HOURS_START || m < DAY_WINDOW_START;
  const restOfDayText = 'Free for the rest of the day';
  const futureText = futureInfo ? futureInfo.formattedUntil : restOfDayText;
  const primaryStatusText = isAfterHours ? futureText : restOfDayText;
  const remainingToday = Math.max(1, (isAfterHours ? 1440 : DAY_WINDOW_END) - m);

  return {
    state: 'free',
    privacyLevel,
    until: DAY_WINDOW_END,
    untilMinutes: DAY_WINDOW_END,
    untilFormatted: formatTime(DAY_WINDOW_END),
    remainingMinutes: remainingToday,
    minutesLeft: remainingToday,
    currentEntry: null,
    currentBlock: null,
    nextEntry: null,
    nextBlock: null,
    nextFutureClass: futureInfo,
    nextDayStatusText: futureText,
    noTimetable: false,
    statusText: primaryStatusText,
    untilCopy: primaryStatusText,
    label: 'Free now',
    sublabel: primaryStatusText,
    countdownLabel: isAfterHours && futureInfo
      ? futureText.replace('Free ', '')
      : 'Rest of day'
  };
}

// Convenience aliases
export const status = computePersonStatus;
export const formatTime12 = formatTime;
export const minutesToTimeInput = formatTimeInput;
export const parseTimeInputToMinutes = parseTimeToMinutes;
export const mergeBusyIntervals = getMergedBusySpans;
