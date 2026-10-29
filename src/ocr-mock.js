/**
 * CNU Free — Mock Timetable OCR Reader (SPEC V2 §5.4 + Addendum B §6)
 * - In demo mode returns Francis's own classes grouped by title and pattern
 *   (9 grouped rows corresponding to Francis's 17 schedule entries),
 *   with ITMC314 (Fri 8:00 – 11:00 AM) flagged "Check time".
 */

import { parseScheduleTitle } from './time.js';

export const OCR_SCAN_DELAY_MS = 2200;

export function createDefaultOcrDrafts() {
  const rawGroups = [
    {
      id: 'ocr-1',
      title: 'ITEC307 (ZT33Am)',
      days: [0, 2],
      start: 9 * 60,
      end: 10 * 60 + 30,
      flag: null
    },
    {
      id: 'ocr-2',
      title: 'ITMC311 (ZT31Am)',
      days: [0, 2],
      start: 12 * 60,
      end: 13 * 60 + 30,
      flag: null
    },
    {
      id: 'ocr-3',
      title: 'Christian Moral Paradigm (THEN102) (N2Am)',
      days: [0, 2],
      start: 13 * 60 + 30,
      end: 15 * 60,
      flag: null
    },
    {
      id: 'ocr-4',
      title: 'ITMC311 (ZT31Am)',
      days: [1, 3],
      start: 8 * 60,
      end: 9 * 60,
      flag: null
    },
    {
      id: 'ocr-5',
      title: 'Philosophy of Religion (PHIN103) (N6Am)',
      days: [1, 3],
      start: 9 * 60,
      end: 10 * 60 + 30,
      flag: null
    },
    {
      id: 'ocr-6',
      title: 'ICSE046 (N1Am)',
      days: [1, 3],
      start: 13 * 60 + 30,
      end: 15 * 60,
      flag: null
    },
    {
      id: 'ocr-7',
      title: 'ITMC233 (ZT31Am)',
      days: [1, 3],
      start: 16 * 60 + 30,
      end: 18 * 60,
      flag: null
    },
    {
      id: 'ocr-8',
      title: 'ITMC312 (ZT32Am)',
      days: [1, 3],
      start: 18 * 60,
      end: 19 * 60 + 30,
      flag: null
    },
    {
      id: 'ocr-9',
      title: 'ITMC314 (ZT33Am)',
      days: [4],
      start: 8 * 60,
      end: 11 * 60,
      flag: 'check_time',
      flagReason: 'Confirm Fri 8:00 – 11:00 AM time block'
    }
  ];

  return rawGroups.map((item) => {
    const parsed = parseScheduleTitle(item.title);
    return {
      ...item,
      short: parsed.short,
      detail: parsed.detail,
      code: parsed.short,
      room: parsed.detail,
      repeat: 'weekly',
      notes: ''
    };
  });
}

let _pendingTimer = null;
let _pendingResolve = null;

export function cancelPendingOcr() {
  if (_pendingTimer) {
    clearTimeout(_pendingTimer);
    _pendingTimer = null;
  }
  if (_pendingResolve) {
    const res = _pendingResolve;
    _pendingResolve = null;
    res({ ok: false, cancelled: true, error: null, drafts: [] });
  }
}

export function scanTimetableImage({ forceFailure = false, delayMs = OCR_SCAN_DELAY_MS, signal = null } = {}) {
  cancelPendingOcr();
  return new Promise((resolve) => {
    _pendingResolve = resolve;
    if (signal) {
      if (signal.aborted) {
        _pendingResolve = null;
        resolve({ ok: false, cancelled: true, error: null, drafts: [] });
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          cancelPendingOcr();
        },
        { once: true }
      );
    }

    _pendingTimer = setTimeout(() => {
      _pendingTimer = null;
      _pendingResolve = null;
      if (forceFailure) {
        resolve({
          ok: false,
          cancelled: false,
          error: 'Could not read timetable photo',
          drafts: []
        });
      } else {
        resolve({
          ok: true,
          cancelled: false,
          error: null,
          drafts: createDefaultOcrDrafts()
        });
      }
    }, delayMs);
  });
}

export const runMockOcr = scanTimetableImage;

export function countFlaggedOcrDrafts(drafts = []) {
  if (!Array.isArray(drafts)) return 0;
  return drafts.filter((d) => Boolean(d.flag || d.needsCheck)).length;
}

export function canSaveOcrDrafts(drafts = []) {
  if (!Array.isArray(drafts) || drafts.length === 0) return false;
  return countFlaggedOcrDrafts(drafts) === 0;
}
