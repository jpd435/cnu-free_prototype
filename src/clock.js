/**
 * CNU Free — Real-Time & Dev Clock Engine (SPEC V2 Addendum B §4)
 * - Defaults to REAL device time (not frozen).
 * - Supports Dev Clock overrides: Live | custom day + time (presets: Mon 09:30, Tue 09:41,
 *   Wed 12:00, Sat 20:30, Sun 10:00) | speed 1×, 60×, 600×.
 * - Emits a tick at every minute boundary AND schedules an exact timer for the next
 *   class start or end across all visible schedules so statuses flip at the exact second
 *   a class starts or ends.
 * - Listens to visibilitychange and Capacitor App resume to resync immediately.
 * - Handles midnight rollover seamlessly.
 */

export const PRESET_CLOCKS = [
  { id: 'mon-0930', label: 'Mon 09:30', dayIndex: 0, minutes: 9 * 60 + 30 },
  { id: 'tue-0941', label: 'Tue 09:41', dayIndex: 1, minutes: 9 * 60 + 41 },
  { id: 'wed-1200', label: 'Wed 12:00', dayIndex: 2, minutes: 12 * 60 },
  { id: 'sat-2030', label: 'Sat 20:30', dayIndex: 5, minutes: 20 * 60 + 30 },
  { id: 'sun-1000', label: 'Sun 10:00', dayIndex: 6, minutes: 10 * 60 }
];

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Base Monday date for displaying calendar dates (Mon Oct 26 2026 .. Sun Nov 1 2026)
const BASE_MONDAY_EPOCH = Date.UTC(2026, 9, 26, 0, 0, 0) - 8 * 3600 * 1000;

let clockConfig = {
  mode: 'live', // 'live' | 'dev'
  speed: 1, // 1 | 60 | 600
  paused: false,
  anchorRealMs: Date.now(),
  anchorTotalMinutes: 0 // dayIndex * 1440 + minutes + seconds/60
};

let scheduleProvider = () => [];
const tickListeners = new Set();
let minuteTimerId = null;
let boundaryTimerId = null;
let initialized = false;

export function formatMinutes12(mins) {
  const m = ((Math.floor(mins) % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  const min = m % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(min).padStart(2, '0')} ${period}`;
}

function getRealDeviceClock() {
  const d = new Date();
  const jsDay = d.getDay(); // 0=Sun..6=Sat
  const dayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const minutes = d.getHours() * 60 + d.getMinutes();
  const seconds = d.getSeconds() + d.getMilliseconds() / 1000;
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dateLabel = `${WEEKDAY_SHORT[dayIndex]}, ${monthNames[d.getMonth()]} ${d.getDate()}`;
  return {
    mode: 'live',
    speed: 1,
    dayIndex,
    minutes,
    seconds,
    dateLabel,
    dayLabel: dateLabel,
    fullDayName: WEEKDAY_FULL[dayIndex],
    shortDayName: WEEKDAY_SHORT[dayIndex],
    dayFull: WEEKDAY_FULL[dayIndex],
    dayShort: WEEKDAY_SHORT[dayIndex],
    formattedTime: formatMinutes12(minutes),
    epochMs: d.getTime(),
    timestamp: d.getTime()
  };
}

export function getClockNow() {
  if (clockConfig.mode === 'live') {
    return getRealDeviceClock();
  }

  const elapsedRealMs = clockConfig.paused ? 0 : Math.max(0, Date.now() - clockConfig.anchorRealMs);
  const elapsedVirtualMinutes = (elapsedRealMs / 60000) * clockConfig.speed;
  const totalVirtualMinutes = clockConfig.anchorTotalMinutes + elapsedVirtualMinutes;

  // Handle week & midnight rollover across 7 * 1440 = 10080 minutes
  const wrappedWeekMinutes = ((totalVirtualMinutes % 10080) + 10080) % 10080;
  const dayIndex = Math.floor(wrappedWeekMinutes / 1440) % 7;
  const dayFraction = wrappedWeekMinutes - dayIndex * 1440;
  const minutes = Math.floor(dayFraction);
  const seconds = (dayFraction - minutes) * 60;

  // Map dayIndex 0..6 -> Oct 26..Nov 1
  const dayDates = ['Oct 26', 'Oct 27', 'Oct 28', 'Oct 29', 'Oct 30', 'Oct 31', 'Nov 1'];
  const epochMs = BASE_MONDAY_EPOCH + wrappedWeekMinutes * 60000;
  const dateLabel = `${WEEKDAY_SHORT[dayIndex]}, ${dayDates[dayIndex]}`;

  return {
    mode: 'dev',
    speed: clockConfig.speed,
    dayIndex,
    minutes,
    seconds,
    dateLabel,
    dayLabel: dateLabel,
    fullDayName: WEEKDAY_FULL[dayIndex],
    shortDayName: WEEKDAY_SHORT[dayIndex],
    dayFull: WEEKDAY_FULL[dayIndex],
    dayShort: WEEKDAY_SHORT[dayIndex],
    formattedTime: formatMinutes12(minutes),
    epochMs,
    timestamp: epochMs
  };
}

export function getClockConfig() {
  const current = getClockNow();
  return {
    mode: clockConfig.mode,
    speed: clockConfig.speed,
    paused: clockConfig.paused,
    dayIndex: current.dayIndex,
    minutes: current.minutes,
    formattedTime: current.formattedTime,
    shortDayName: current.shortDayName
  };
}

/**
 * Configure clock:
 * - setClock({ mode: 'live' }) -> real device time
 * - setClock({ mode: 'dev', dayIndex: 1, minutes: 581, speed: 1, paused: false })
 */
export function setClock(options = {}) {
  const current = getClockNow();
  const nextMode = options.mode || (typeof options.dayIndex === 'number' || typeof options.minutes === 'number' ? 'dev' : clockConfig.mode);
  const nextDay = typeof options.dayIndex === 'number' ? ((options.dayIndex % 7) + 7) % 7 : current.dayIndex;
  const nextMinutes = typeof options.minutes === 'number' ? ((options.minutes % 1440) + 1440) % 1440 : current.minutes;
  const nextSpeed = typeof options.speed === 'number' ? options.speed : clockConfig.speed;
  const nextPaused = typeof options.paused === 'boolean' ? options.paused : false;

  clockConfig = {
    mode: nextMode,
    speed: nextSpeed,
    paused: nextPaused,
    anchorRealMs: Date.now(),
    anchorTotalMinutes: nextDay * 1440 + nextMinutes
  };

  scheduleNextTimers();
  emitClockTick('clock-change');
  return getClockNow();
}

export function setClockPreset(presetId) {
  if (presetId === 'live') {
    return setClock({ mode: 'live', speed: 1 });
  }
  const preset = PRESET_CLOCKS.find((p) => p.id === presetId || p.label === presetId);
  if (!preset) return getClockNow();
  return setClock({
    mode: 'dev',
    dayIndex: preset.dayIndex,
    minutes: preset.minutes,
    speed: clockConfig.speed || 1
  });
}

export function setClockSpeed(speed) {
  const current = getClockNow();
  return setClock({
    mode: 'dev',
    dayIndex: current.dayIndex,
    minutes: current.minutes + current.seconds / 60,
    speed: Number(speed) || 1
  });
}

export function registerScheduleBoundaryProvider(fn) {
  scheduleProvider = fn;
  scheduleNextTimers();
}

export function subscribeClock(listener) {
  tickListeners.add(listener);
  return () => tickListeners.delete(listener);
}

function emitClockTick(reason = 'tick') {
  const nowSnapshot = getClockNow();
  for (const listener of tickListeners) {
    try {
      listener(nowSnapshot, reason);
    } catch (err) {
      console.error('Clock listener error:', err);
    }
  }
}

function findNextBoundaryDeltaMinutes(nowState) {
  try {
    const entries = scheduleProvider() || [];
    if (!entries.length) return null;
    const nowExact = nowState.minutes + (nowState.seconds || 0) / 60;
    let minDelta = Infinity;

    for (const entry of entries) {
      const days = Array.isArray(entry.days)
        ? entry.days
        : typeof entry.day === 'number'
        ? [entry.day]
        : [];
      if (!days.includes(nowState.dayIndex)) continue;

      for (const boundary of [entry.start, entry.end]) {
        if (typeof boundary === 'number' && boundary > nowExact) {
          const delta = boundary - nowExact;
          if (delta < minDelta) minDelta = delta;
        }
      }
    }

    // Also consider midnight rollover (1440)
    const toMidnight = 1440 - nowExact;
    if (toMidnight > 0 && toMidnight < minDelta) {
      minDelta = toMidnight;
    }

    return Number.isFinite(minDelta) ? minDelta : null;
  } catch {
    return null;
  }
}

export function scheduleNextTimers() {
  if (minuteTimerId) {
    clearTimeout(minuteTimerId);
    minuteTimerId = null;
  }
  if (boundaryTimerId) {
    clearTimeout(boundaryTimerId);
    boundaryTimerId = null;
  }

  if (typeof window === 'undefined') return;
  if (clockConfig.mode === 'dev' && clockConfig.paused) return;

  const nowState = getClockNow();
  const effectiveSpeed = clockConfig.mode === 'live' ? 1 : Math.max(1, clockConfig.speed);
  const secondsIntoMinute = nowState.seconds || 0;
  const remainingVirtualSecondsToNextMinute = Math.max(0.05, 60 - secondsIntoMinute);
  const msToNextMinute = Math.max(25, Math.ceil((remainingVirtualSecondsToNextMinute * 1000) / effectiveSpeed) + 10);

  minuteTimerId = window.setTimeout(() => {
    scheduleNextTimers();
    emitClockTick('minute');
  }, msToNextMinute);

  const deltaVirtualMinutes = findNextBoundaryDeltaMinutes(nowState);
  if (deltaVirtualMinutes !== null) {
    const msToBoundary = Math.max(30, Math.ceil((deltaVirtualMinutes * 60000) / effectiveSpeed) + 15);
    if (msToBoundary < msToNextMinute) {
      boundaryTimerId = window.setTimeout(() => {
        scheduleNextTimers();
        emitClockTick('class-boundary');
      }, msToBoundary);
    }
  }
}

export function initClockLifecycle() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  scheduleNextTimers();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      scheduleNextTimers();
      emitClockTick('visibility-resume');
    }
  });
}

// Convenience aliases for main.js & tests
export const getClockState = getClockConfig;
export const initClockEngine = initClockLifecycle;

export function setClockLive() {
  return setClock({ mode: 'live', speed: 1 });
}

export function setClockCustom(dayIndex, minutes, speed = clockConfig.speed || 1) {
  return setClock({
    mode: 'dev',
    dayIndex,
    minutes,
    speed
  });
}

export function scheduleBoundaryTimer(providerFn) {
  if (typeof providerFn === 'function') {
    registerScheduleBoundaryProvider(() => {
      const items = providerFn() || [];
      if (items.length > 0 && items[0] && Array.isArray(items[0].entries)) {
        return items.flatMap((person) => person.entries || []);
      }
      return items;
    });
  } else {
    scheduleNextTimers();
  }
}

