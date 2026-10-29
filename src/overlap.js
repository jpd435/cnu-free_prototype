/**
 * CNU Free — Overlap Solver (SPEC V2 §4.3 + Addendum B §3, §6, §7)
 * - Visible window: 7:00–21:00 (420..1260, 14 hours)
 * - Minimum overlap duration: 30 minutes
 * - Skips and flags private participants
 */

import {
  DAY_WINDOW_START,
  DAY_WINDOW_END,
  computeFreeIntervals,
  computePersonStatus,
  formatRange,
  formatDuration,
  formatDurationLong,
  WEEKDAY_SHORT,
  DEMO_WEEK_DATES,
  now
} from './time.js';
import { resolvePrivacyLevel } from './privacy.js';

export const MIN_OVERLAP_MINUTES = 30;

function intersectTwoIntervalLists(listA, listB) {
  const result = [];
  let i = 0;
  let j = 0;
  while (i < listA.length && j < listB.length) {
    const start = Math.max(listA[i].start, listB[j].start);
    const end = Math.min(listA[i].end, listB[j].end);
    if (end > start) {
      result.push({ start, end, duration: end - start });
    }
    if (listA[i].end < listB[j].end) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return result;
}

/**
 * Compute shared free windows across participants on dayIndex (0=Mon..6=Sun)
 * within [7:00 AM, 9:00 PM] (420..1260).
 */
export function overlap(participants = [], dayIndex = now().dayIndex, optionsOrViewerId = {}, groupsArg = []) {
  const options =
    typeof optionsOrViewerId === 'string'
      ? { viewerId: optionsOrViewerId, groups: groupsArg }
      : optionsOrViewerId || {};
  const viewerId = options.viewerId || 'francis';
  const groups = options.groups || groupsArg || [];
  const minDuration = options.minDuration ?? MIN_OVERLAP_MINUTES;
  const minStart = options.minStart ?? DAY_WINDOW_START;
  const maxEnd = options.maxEnd ?? DAY_WINDOW_END;

  const activeParticipants = [];
  const privateParticipants = [];

  for (const p of participants) {
    if (!p) continue;
    const isSelf = p.id === viewerId || p.isUser;
    const level = isSelf ? 'full' : resolvePrivacyLevel(p, viewerId, groups);
    if (level === 'none') {
      privateParticipants.push(p);
    } else {
      activeParticipants.push(p);
    }
  }

  if (activeParticipants.length === 0) {
    return {
      dayIndex,
      windows: [],
      commonFree: [],
      bestWindow: null,
      best: null,
      runnerUp: null,
      others: [],
      activeParticipants,
      privateParticipants,
      excludedPrivate: privateParticipants
    };
  }

  let shared = [
    {
      start: Math.max(DAY_WINDOW_START, minStart),
      end: Math.min(DAY_WINDOW_END, maxEnd),
      duration: Math.max(0, Math.min(DAY_WINDOW_END, maxEnd) - Math.max(DAY_WINDOW_START, minStart))
    }
  ];

  for (const person of activeParticipants) {
    const personFree = computeFreeIntervals(person, dayIndex, DAY_WINDOW_START, DAY_WINDOW_END);
    shared = intersectTwoIntervalLists(shared, personFree);
  }

  const validWindows = shared
    .filter((w) => w.duration >= minDuration)
    .map((w) => ({
      ...w,
      label: formatRange(w.start, w.end),
      formatted: formatRange(w.start, w.end),
      durationLabel: formatDuration(w.duration),
      durationLongLabel: formatDurationLong(w.duration)
    }));

  // Rank by longest duration first, then earliest start
  const ranked = [...validWindows].sort((a, b) => {
    if (b.duration !== a.duration) return b.duration - a.duration;
    return a.start - b.start;
  });

  const bestWindow = ranked[0] || null;
  const runnerUp = ranked[1] || null;
  const others = validWindows.filter((w) => w !== bestWindow);

  return {
    dayIndex,
    windows: validWindows,
    commonFree: validWindows,
    bestWindow,
    best: bestWindow,
    runnerUp,
    others,
    activeParticipants,
    privateParticipants,
    excludedPrivate: privateParticipants
  };
}

/**
 * Find the next day in the week that has >= 1 valid overlap window (>= 30m)
 */
export function findNextDayWithOverlap(participants, startDayIndex, options = {}) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const candidateDay = (startDayIndex + offset) % 7;
    const res = overlap(participants, candidateDay, {
      ...options,
      minStart: DAY_WINDOW_START
    });
    if (res.bestWindow) {
      const dateMeta = DEMO_WEEK_DATES.find((d) => d.dayIndex === candidateDay);
      return {
        dayIndex: candidateDay,
        dayShort: WEEKDAY_SHORT[candidateDay],
        dayLabel: dateMeta ? dateMeta.label : WEEKDAY_SHORT[candidateDay],
        result: res,
        bestWindow: res.bestWindow
      };
    }
  }
  return null;
}

/**
 * Compute the "Best Window Today" card on Screen 1 (Now) across Francis + friends
 * who are free now or later today.
 */
export function bestWindowForMostPeople(
  user,
  friends = [],
  dayIndex = now().dayIndex,
  groups = [],
  currentNow = now()
) {
  const eligibleFriends = friends.filter((f) => {
    const level = resolvePrivacyLevel(f, user.id, groups);
    if (level === 'none') return false;
    const freeIntervals = computeFreeIntervals(f, dayIndex, DAY_WINDOW_START, DAY_WINDOW_END);
    return freeIntervals.some((iv) => iv.end > currentNow.minutes && iv.duration >= MIN_OVERLAP_MINUTES);
  });

  if (eligibleFriends.length === 0) return null;

  const minWindowStart = Math.max(DAY_WINDOW_START, currentNow.minutes);
  const userFree = computeFreeIntervals(user, dayIndex, minWindowStart, DAY_WINDOW_END).filter(
    (iv) => iv.duration >= MIN_OVERLAP_MINUTES
  );

  if (userFree.length === 0) return null;

  const friendFreeMap = new Map();
  const boundarySet = new Set([minWindowStart, DAY_WINDOW_END]);

  for (const iv of userFree) {
    boundarySet.add(iv.start);
    boundarySet.add(iv.end);
  }

  for (const f of eligibleFriends) {
    const intervals = computeFreeIntervals(f, dayIndex, minWindowStart, DAY_WINDOW_END);
    friendFreeMap.set(f.id, intervals);
    for (const iv of intervals) {
      if (iv.start >= minWindowStart && iv.start <= DAY_WINDOW_END) boundarySet.add(iv.start);
      if (iv.end >= minWindowStart && iv.end <= DAY_WINDOW_END) boundarySet.add(iv.end);
    }
  }

  const points = Array.from(boundarySet).sort((a, b) => a - b);
  const candidates = [];

  const isCovered = (intervals, a, b) => intervals.some((iv) => iv.start <= a && iv.end >= b);

  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const a = points[i];
      const b = points[j];
      const duration = b - a;
      if (duration < MIN_OVERLAP_MINUTES) continue;
      if (!isCovered(userFree, a, b)) continue;

      const coveringFriends = eligibleFriends.filter((f) =>
        isCovered(friendFreeMap.get(f.id) || [], a, b)
      );
      if (coveringFriends.length === 0) continue;

      const subset = [user, ...coveringFriends];
      const freeNowCount = coveringFriends.filter(
        (f) => computePersonStatus(f, currentNow, user.id, groups).state === 'free'
      ).length;

      const windowObj = {
        start: a,
        end: b,
        duration,
        label: formatRange(a, b),
        formatted: formatRange(a, b),
        durationLabel: formatDuration(duration),
        durationLongLabel: formatDurationLong(duration)
      };

      candidates.push({
        participants: subset,
        friends: coveringFriends,
        window: windowObj,
        totalCount: subset.length,
        freeNowCount,
        personMinutes: subset.length * duration
      });
    }
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    // Prefer windows with >= 3 participants (You + >= 2 friends)
    const aHas3 = a.totalCount >= 3 ? 1 : 0;
    const bHas3 = b.totalCount >= 3 ? 1 : 0;
    if (bHas3 !== aHas3) return bHas3 - aHas3;
    if (b.personMinutes !== a.personMinutes) return b.personMinutes - a.personMinutes;
    if (b.totalCount !== a.totalCount) return b.totalCount - a.totalCount;
    if (b.window.duration !== a.window.duration) return b.window.duration - a.window.duration;
    if (b.freeNowCount !== a.freeNowCount) return b.freeNowCount - a.freeNowCount;
    return a.window.start - b.window.start;
  });

  const winner = candidates[0];
  const friendNames = winner.friends.map((f) => f.firstName);
  let namesStr = '';
  if (friendNames.length === 1) {
    namesStr = `You and ${friendNames[0]}`;
  } else if (friendNames.length === 2) {
    namesStr = `You, ${friendNames[0]}, and ${friendNames[1]}`;
  } else if (friendNames.length <= 4) {
    namesStr = `You, ${friendNames.slice(0, -1).join(', ')}, and ${friendNames[friendNames.length - 1]}`;
  } else {
    namesStr = `You, ${friendNames.slice(0, 2).join(', ')}, and ${friendNames.length - 2} others`;
  }

  return {
    ...winner,
    dayIndex,
    participantIds: winner.participants.map((p) => p.id),
    copy: `${namesStr} are all free (${winner.totalCount} people)`
  };
}
