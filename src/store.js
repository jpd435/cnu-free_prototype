/**
 * CNU Free — Central Store, Single Schedule Write Path & Memoized Selectors
 * (SPEC V2 + Addendum B + Addendum C)
 *
 * Addendum C §1 — SINGLE WRITE PATH:
 * All changes to anyone's schedule go through ONE store action set:
 *   - addEntry
 *   - updateEntry
 *   - deleteEntry
 *   - importEntries (OCR save)
 *   - applySimulatedChange (dev menu)
 *   (plus Undo of any schedule change)
 * Each action validates (V2 §4.6), writes, bumps state.scheduleRev (a number),
 * persists BEFORE emitting (rolling back + showing an error toast if persistence fails),
 * recomputes the next boundary timer on the shared status clock, and emits ONE change event:
 *   { ownerId, entryIds, rev, changedDays[] }
 *
 * Addendum C §2 — DERIVED STATE, NEVER STORED:
 * Pure memoized selectors computed from (schedules, scheduleRev/ownerScheduleRev, privacy, clockMinute):
 *   - selectPersonStatus / selectFriendsAvailability
 *   - selectYourDay ( alias selectUserDayStatus )
 *   - selectOverlap / selectOverlapViewData
 *   - selectBestWindowForMostPeople ( alias selectNowBestWindow )
 *   - selectGroupNextAllFree
 *   - selectFreeTogether
 *   - selectLinkPreview
 *   - selectMyScheduleView
 */

import { createSeedState, createCleanState, migrateState } from './seed.js';
import {
  now,
  status,
  formatTime12,
  formatRange,
  formatCompactRange,
  formatDuration,
  formatDurationLong,
  formatRelativeTime,
  parseTimeInputToMinutes,
  minutesToTimeInput,
  getEntriesForDay,
  getMergedBusySpans,
  computeFreeIntervals,
  parseScheduleTitle,
  DAY_WINDOW_START,
  DAY_WINDOW_END,
  DEMO_WEEK_DATES
} from './time.js';
import { registerScheduleBoundaryProvider, scheduleNextTimers } from './clock.js';
import {
  overlap,
  findNextDayWithOverlap,
  bestWindowForMostPeople
} from './overlap.js';
import {
  privacyLevelToLabel,
  labelToPrivacyLevel
} from './privacy.js';
import {
  validateClassEntry,
  validateProfileForm,
  validateAuthForm,
  validateGroupName
} from './validators.js';
import { canSaveOcrDrafts, createDefaultOcrDrafts } from './ocr-mock.js';
import { storageBridge } from './native.js';

export const STORAGE_KEY = 'cnu_free_v3_state';

let _state = loadInitialStateSync();
const _listeners = new Set();
const _scheduleChangeListeners = new Set();
const _undoStack = [];
let _forcePersistFailure = false;
let _lastChangeEvent = null;
let _errorToastHandler = null;

// Provide all visible schedule entries to clock.js so it fires exact boundary timers
registerScheduleBoundaryProvider(() => {
  if (!_state) return [];
  const userEntries = _state.user?.entries || [];
  const friendEntries = (_state.friends || []).flatMap((f) => f.entries || []);
  return [...userEntries, ...friendEntries];
});

function cloneState(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function ensureScheduleRevs(state) {
  if (!state || typeof state !== 'object') return state;
  if (typeof state.scheduleRev !== 'number') {
    state.scheduleRev = 1;
  }
  if (!state.ownerScheduleRev || typeof state.ownerScheduleRev !== 'object') {
    state.ownerScheduleRev = { francis: 1 };
  }
  if (typeof state.ownerScheduleRev.francis !== 'number') {
    state.ownerScheduleRev.francis = 1;
  }
  for (const f of state.friends || []) {
    if (typeof state.ownerScheduleRev[f.id] !== 'number') {
      state.ownerScheduleRev[f.id] = 1;
    }
  }
  if (typeof state.privacyRev !== 'number') {
    state.privacyRev = 1;
  }
  if (typeof state.proposalsRev !== 'number') {
    state.proposalsRev = 1;
  }
  return state;
}

function loadInitialStateSync() {
  try {
    const raw = storageBridge.getSync(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return ensureScheduleRevs(migrateState(parsed));
    }
  } catch (_e) {
    // ignore corrupted storage
  }
  return ensureScheduleRevs(createSeedState());
}

/**
 * Synchronous + async persistence with failure detection for rollback (Addendum C §1 & §6)
 */
function persistStateBeforeEmit(state) {
  if (_forcePersistFailure || state.forcePersistFailure) {
    return { ok: false, error: 'Could not save schedule changes. Rolled back.' };
  }
  try {
    const serialized = JSON.stringify(state);
    const syncOk = storageBridge.setSync(STORAGE_KEY, serialized);
    if (!syncOk) {
      return { ok: false, error: 'Could not save schedule changes. Rolled back.' };
    }
    // Also fire async Capacitor Preferences sync in background
    storageBridge.set(STORAGE_KEY, serialized).catch(() => {});
    return { ok: true };
  } catch (_err) {
    return { ok: false, error: 'Could not save schedule changes. Rolled back.' };
  }
}

function notifyListeners(changeEvent = null) {
  scheduleNextTimers();
  if (changeEvent) {
    _lastChangeEvent = changeEvent;
    for (const fn of _scheduleChangeListeners) {
      try {
        fn(changeEvent, _state);
      } catch (_e) {
        // ignore
      }
    }
  }
  for (const fn of _listeners) {
    try {
      fn(_state, changeEvent);
    } catch (_e) {
      // ignore
    }
  }
}

function pushUndoSnapshot(actionName, snapshot, scheduleMeta = null) {
  const undoId = `undo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  _undoStack.push({
    id: undoId,
    actionName,
    snapshot: cloneState(snapshot),
    scheduleMeta
  });
  if (_undoStack.length > 10) {
    _undoStack.shift();
  }
  return undoId;
}

/* ==========================================================================
   MEMOIZED SELECTOR CACHE WITH GRANULAR OWNER / DAY INVALIDATION (Addendum C §2)
   ========================================================================== */

const _selectorCache = new Map();

function getOwnerRev(state, ownerId) {
  const id = ownerId === state.user?.id ? 'francis' : ownerId;
  return state.ownerScheduleRev?.[id] ?? 1;
}

function getPersonPrivacySig(state, personId) {
  if (!personId || personId === 'francis' || personId === state.user?.id) {
    const cfg = state.user?.privacyConfig || {};
    return `self:${cfg.globalAudience || 'friends'}:${ state.privacyRev || 1 }`;
  }
  const f = (state.friends || []).find((fr) => fr.id === personId);
  if (!f) return `none:0`;
  return `${f.shareLevel || 'full'}:${f.shareLevelToUser || 'full'}:${f.sharesWithViewer || 'full'}:${f.accessRequested ? 1 : 0}:${f.relationship || 'friends'}`;
}

function getFriendsRevsSig(state) {
  return (state.friends || [])
    .map((f) => `${f.id}@${getOwnerRev(state, f.id)}`)
    .join(',');
}

function getFriendsPrivacySig(state) {
  return (state.friends || [])
    .map((f) => `${f.id}:${getPersonPrivacySig(state, f.id)}`)
    .join(',');
}

function getGroupsMembershipSig(state) {
  return (state.groups || [])
    .map((g) => `${g.id}:${g.name}:${(g.memberIds || []).join('+')}`)
    .join('|');
}

function memoizeSelector({ cacheKey, owners = [], days = null, signature, compute }) {
  const existing = _selectorCache.get(cacheKey);
  if (existing && existing.signature === signature) {
    return existing.value;
  }
  const value = compute();
  _selectorCache.set(cacheKey, {
    cacheKey,
    owners: new Set(owners),
    days: days ? new Set(days) : null,
    signature,
    value,
    computeCount: (existing?.computeCount || 0) + 1
  });
  return value;
}

/**
 * Granular cache invalidation:
 * - A change to Francis's schedule invalidates ONLY selectors whose `owners` include `'francis'`.
 *   It NEVER invalidates `selectPersonStatus(friend)` or `selectFriendsAvailability`.
 * - A change to a friend's schedule invalidates ONLY selectors whose `owners` include that friend.
 */
export function invalidateSelectorsForChange({ ownerId, changedDays = [] } = {}) {
  if (!ownerId) {
    _selectorCache.clear();
    return;
  }
  const normalizedOwner = ownerId === _state?.user?.id ? 'francis' : ownerId;
  const changedDaysSet = Array.isArray(changedDays) && changedDays.length > 0 ? new Set(changedDays) : null;

  for (const [key, entry] of _selectorCache.entries()) {
    if (!entry.owners.has(normalizedOwner)) {
      continue;
    }
    if (changedDaysSet && entry.days && entry.days.size > 0) {
      let dayIntersects = false;
      for (const d of entry.days) {
        if (changedDaysSet.has(d)) {
          dayIntersects = true;
          break;
        }
      }
      if (!dayIntersects) {
        continue;
      }
    }
    _selectorCache.delete(key);
  }
}

export function getSelectorCacheStats() {
  const stats = {};
  for (const [key, entry] of _selectorCache.entries()) {
    stats[key] = entry.computeCount;
  }
  return stats;
}

/* ==========================================================================
   PROPOSAL CONFLICT EVALUATION (V2 §4.3 & Addendum C §4, §7.4)
   ========================================================================== */

function evaluateProposalConflicts(state, { changedOwnerId = null, changedEntryIds = [] } = {}) {
  const proposals = state.proposals || [];
  if (proposals.length === 0) return { conflictDetected: false, conflictWith: null };

  let newlyConflictedTitle = null;
  const changedSet = new Set(changedEntryIds || []);

  for (const prop of proposals) {
    const pIds = prop.participantIds || ['francis'];
    const dayIdx = typeof prop.dayIndex === 'number' ? prop.dayIndex : 1;
    const wStart = prop.windowStart ?? prop.start ?? 0;
    const wEnd = prop.windowEnd ?? prop.end ?? 0;

    let conflictingEntry = null;

    for (const pid of pIds) {
      const person =
        pid === 'francis' || pid === state.user?.id
          ? state.user
          : (state.friends || []).find((f) => f.id === pid);
      if (!person) continue;

      const dayEntries = getEntriesForDay(person, dayIdx);
      for (const entry of dayEntries) {
        if (entry.start < wEnd && entry.end > wStart) {
          if (!conflictingEntry || changedSet.has(entry.id)) {
            conflictingEntry = entry;
          }
        }
      }
    }

    const wasConflicted = Boolean(prop.conflict);
    if (conflictingEntry) {
      const classLabel = conflictingEntry.short || conflictingEntry.code || conflictingEntry.title;
      prop.conflict = true;
      prop.conflictWith = classLabel;
      prop.status = `Conflict with ${classLabel}`;
      if (!wasConflicted || changedSet.has(conflictingEntry.id) || (changedOwnerId && pIds.includes(changedOwnerId))) {
        newlyConflictedTitle = classLabel;
      }
    } else {
      prop.conflict = false;
      prop.conflictWith = null;
      prop.status = 'Suggested';
    }
  }

  state.proposalsRev = (state.proposalsRev || 1) + 1;
  return {
    conflictDetected: Boolean(newlyConflictedTitle),
    conflictWith: newlyConflictedTitle
  };
}

/* ==========================================================================
   SINGLE SCHEDULE WRITE PIPELINE (Addendum C §1, §4, §5, §6)
   ========================================================================== */

function extractEntryDays(entry) {
  if (!entry) return [];
  if (Array.isArray(entry.days) && entry.days.length > 0) {
    return [...entry.days];
  }
  if (typeof entry.day === 'number') {
    return [entry.day];
  }
  if (typeof entry.dayIndex === 'number') {
    return [entry.dayIndex];
  }
  return [];
}

function getOwnerTarget(state, ownerId = 'francis') {
  if (!ownerId || ownerId === 'francis' || ownerId === state.user?.id) {
    return { ownerId: 'francis', person: state.user, isUser: true };
  }
  const friend = (state.friends || []).find((f) => f.id === ownerId);
  return { ownerId, person: friend || null, isUser: false };
}

/**
 * Executes a schedule mutation through the single validated, atomic write pipeline.
 */
function executeScheduleMutation({
  actionName,
  ownerId = 'francis',
  recordUndo = false,
  checkConflictToast = true,
  mutate
}) {
  const preWriteSnapshot = cloneState(_state);

  const mutationOutcome = mutate(_state);
  if (!mutationOutcome || !mutationOutcome.ok) {
    _state = preWriteSnapshot;
    return mutationOutcome || { ok: false };
  }

  const normalizedOwnerId = ownerId === _state.user?.id ? 'francis' : ownerId;
  const entryIds = Array.isArray(mutationOutcome.entryIds) ? mutationOutcome.entryIds : [];
  const changedDays = Array.from(new Set(mutationOutcome.changedDays || []))
    .filter((d) => typeof d === 'number' && d >= 0 && d <= 6)
    .sort((a, b) => a - b);

  // Evaluate proposal conflicts
  const conflictCheck = evaluateProposalConflicts(_state, {
    changedOwnerId: normalizedOwnerId,
    changedEntryIds: entryIds
  });

  // Bump scheduleRev and ownerScheduleRev[ownerId]
  _state.scheduleRev = (_state.scheduleRev || 1) + 1;
  if (!_state.ownerScheduleRev) _state.ownerScheduleRev = {};
  _state.ownerScheduleRev[normalizedOwnerId] = (_state.ownerScheduleRev[normalizedOwnerId] || 1) + 1;

  // Persist BEFORE emitting; roll back if persistence fails (Addendum C §1 & §6)
  const persistRes = persistStateBeforeEmit(_state);
  if (!persistRes.ok) {
    _state = preWriteSnapshot;
    const errorToast = persistRes.error || 'Could not save schedule changes. Rolled back.';
    if (_errorToastHandler) {
      try {
        _errorToastHandler(errorToast);
      } catch (_e) {}
    }
    return {
      ok: false,
      rolledBack: true,
      error: errorToast,
      toast: errorToast
    };
  }

  if (recordUndo) {
    pushUndoSnapshot(actionName, preWriteSnapshot, {
      ownerId: normalizedOwnerId,
      entryIds,
      changedDays
    });
  }

  const changeEvent = {
    ownerId: normalizedOwnerId,
    entryIds,
    rev: _state.scheduleRev,
    changedDays
  };

  // Invalidate only selectors whose inputs changed
  invalidateSelectorsForChange(changeEvent);

  // Emit single change event & recompute boundary timer
  notifyListeners(changeEvent);

  const conflictToast =
    checkConflictToast && conflictCheck.conflictDetected
      ? 'Your new class overlaps a suggested time.'
      : null;

  return {
    ...mutationOutcome,
    ok: true,
    changeEvent,
    rev: _state.scheduleRev,
    conflictDetected: conflictCheck.conflictDetected,
    conflictWith: conflictCheck.conflictWith,
    conflictToast,
    toast: conflictToast || mutationOutcome.toast || null
  };
}

/**
 * 1. addEntry — Single write path to add a schedule entry
 */
export function addEntry(payload = {}) {
  const ownerId = payload.ownerId || 'francis';
  const { person, isUser } = getOwnerTarget(_state, ownerId);
  if (!person) return { ok: false, errors: { title: 'Person not found' } };

  const activity = payload.activity ?? payload.title ?? _state.ui.classForm?.activity ?? '';
  const room = payload.room ?? payload.detail ?? _state.ui.classForm?.room ?? '';
  const rawDays =
    payload.days ??
    (typeof payload.day === 'number'
      ? [payload.day]
      : typeof payload.dayIndex === 'number'
      ? [payload.dayIndex]
      : _state.ui.classForm?.days ?? [0]);
  const days = Array.isArray(rawDays) ? rawDays : [rawDays];
  const startInput = payload.starts ?? payload.start ?? _state.ui.classForm?.starts;
  const endInput = payload.ends ?? payload.end ?? _state.ui.classForm?.ends;
  const repeat = payload.repeat || _state.ui.classForm?.repeat || 'weekly';
  const notes = String(payload.notes ?? _state.ui.classForm?.notes ?? '').trim();

  const validation = validateClassEntry(
    {
      id: null,
      activity,
      days,
      start: startInput,
      end: endInput,
      repeat
    },
    person.entries || []
  );

  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const rawInputTitle = String(activity || '').trim();
  const explicitRoom = String(room || '').trim();
  const parsedTitle = parseScheduleTitle(
    explicitRoom && !rawInputTitle.includes('(') ? `${rawInputTitle} (${explicitRoom})` : rawInputTitle
  );

  return executeScheduleMutation({
    actionName: 'addEntry',
    ownerId,
    recordUndo: true,
    checkConflictToast: true,
    mutate: (draftState) => {
      const target = getOwnerTarget(draftState, ownerId).person;
      const createdIds = [];
      for (const dIdx of days) {
        const newId =
          days.length === 1 && payload.id
            ? String(payload.id)
            : `${ownerId}_${Date.now()}_${dIdx}_${Math.random().toString(36).slice(2, 5)}`;
        createdIds.push(newId);
        target.entries.push({
          id: newId,
          ownerId: target.id,
          kind: 'class',
          title: parsedTitle.title,
          short: parsedTitle.short,
          detail: explicitRoom || parsedTitle.detail,
          code: parsedTitle.short,
          room: explicitRoom || parsedTitle.detail,
          day: dIdx,
          dayIndex: dIdx,
          days: [dIdx],
          start: validation.parsed.startMins,
          end: validation.parsed.endMins,
          repeat,
          notes,
          source: 'manual'
        });
      }
      if (isUser) {
        draftState.session.onboarding = false;
        draftState.ui.highlightClassId = createdIds[0] || null;
        draftState.ui.classFormDirty = false;
      }
      return {
        ok: true,
        classId: createdIds[0] || null,
        entryIds: createdIds,
        changedDays: [...days],
        returnTo: draftState.ui.classFormReturnTo || '8',
        toast: `Added ${parsedTitle.short}`,
        canUndo: true
      };
    }
  });
}

/**
 * 2. updateEntry — Single write path to edit an existing schedule entry
 *    Recomputes both the old and the new days (Addendum C §6).
 */
export function updateEntry(payload = {}) {
  const ownerId = payload.ownerId || 'francis';
  const { person, isUser } = getOwnerTarget(_state, ownerId);
  if (!person) return { ok: false, errors: { title: 'Person not found' } };

  const entryId = payload.id || payload.entryId || payload.classId || _state.ui.editingClassId;
  const existingEntry = (person.entries || []).find((e) => e.id === entryId);
  if (!existingEntry) {
    return { ok: false, errors: { title: 'Class entry not found' } };
  }

  const oldDays = extractEntryDays(existingEntry);
  const activity = payload.activity ?? payload.title ?? _state.ui.classForm?.activity ?? existingEntry.title;
  const room = payload.room ?? payload.detail ?? _state.ui.classForm?.room ?? existingEntry.detail ?? '';
  const rawDays =
    payload.days ??
    (typeof payload.day === 'number'
      ? [payload.day]
      : typeof payload.dayIndex === 'number'
      ? [payload.dayIndex]
      : _state.ui.classForm?.days ?? oldDays);
  const newDays = Array.isArray(rawDays) ? rawDays : [rawDays];
  const startInput = payload.starts ?? payload.start ?? _state.ui.classForm?.starts ?? existingEntry.start;
  const endInput = payload.ends ?? payload.end ?? _state.ui.classForm?.ends ?? existingEntry.end;
  const repeat = payload.repeat || _state.ui.classForm?.repeat || existingEntry.repeat || 'weekly';
  const notes = String(payload.notes ?? _state.ui.classForm?.notes ?? existingEntry.notes ?? '').trim();

  const validation = validateClassEntry(
    {
      id: entryId,
      activity,
      days: newDays,
      start: startInput,
      end: endInput,
      repeat
    },
    person.entries || []
  );

  if (!validation.valid) {
    return { ok: false, errors: validation.errors };
  }

  const rawInputTitle = String(activity || '').trim();
  const explicitRoom = String(room || '').trim();
  const parsedTitle = parseScheduleTitle(
    explicitRoom && !rawInputTitle.includes('(') ? `${rawInputTitle} (${explicitRoom})` : rawInputTitle
  );

  return executeScheduleMutation({
    actionName: 'updateEntry',
    ownerId,
    recordUndo: true,
    checkConflictToast: true,
    mutate: (draftState) => {
      const target = getOwnerTarget(draftState, ownerId).person;
      const targetEntry = (target.entries || []).find((e) => e.id === entryId);
      if (!targetEntry) return { ok: false };

      targetEntry.title = parsedTitle.title;
      targetEntry.short = parsedTitle.short;
      targetEntry.detail = explicitRoom || parsedTitle.detail;
      targetEntry.code = parsedTitle.short;
      targetEntry.room = explicitRoom || parsedTitle.detail;
      targetEntry.days = [...newDays];
      targetEntry.day = newDays[0];
      targetEntry.dayIndex = newDays[0];
      targetEntry.start = validation.parsed.startMins;
      targetEntry.end = validation.parsed.endMins;
      targetEntry.repeat = repeat;
      targetEntry.notes = notes;

      if (isUser) {
        draftState.ui.highlightClassId = entryId;
        draftState.ui.classFormDirty = false;
      }

      return {
        ok: true,
        classId: entryId,
        entryIds: [entryId],
        changedDays: [...oldDays, ...newDays],
        returnTo: draftState.ui.classFormReturnTo || '8',
        toast: `Saved ${parsedTitle.short}`,
        canUndo: true
      };
    }
  });
}

/**
 * 3. deleteEntry — Single write path to delete a schedule entry (with Undo support)
 */
export function deleteEntry(payload = {}) {
  const ownerId = payload.ownerId || 'francis';
  const { person, isUser } = getOwnerTarget(_state, ownerId);
  if (!person) return { ok: false, error: 'Person not found' };

  const entryId = payload.id || payload.entryId || payload.classId || _state.ui.editingClassId;
  const existing = (person.entries || []).find((e) => e.id === entryId);
  if (!existing) {
    return { ok: false, error: 'Class entry not found' };
  }

  const oldDays = extractEntryDays(existing);

  return executeScheduleMutation({
    actionName: 'deleteEntry',
    ownerId,
    recordUndo: true,
    checkConflictToast: false,
    mutate: (draftState) => {
      const target = getOwnerTarget(draftState, ownerId).person;
      target.entries = (target.entries || []).filter((e) => e.id !== entryId);
      if (isUser) {
        draftState.ui.classFormDirty = false;
      }
      return {
        ok: true,
        classId: entryId,
        entryIds: [entryId],
        changedDays: oldDays,
        returnTo: draftState.ui.classFormReturnTo || '8',
        toast: `Deleted ${existing.short || existing.code || existing.title}`,
        canUndo: true
      };
    }
  });
}

/**
 * 4. importEntries — Single write path for OCR timetable save (Screen 4 -> 29)
 */
export function importEntries(payload = {}) {
  const ownerId = payload.ownerId || 'francis';
  const drafts = payload.drafts || _state.ocrDrafts || [];

  if (!canSaveOcrDrafts(drafts)) {
    return {
      ok: false,
      error: 'Please review all flagged classes before saving.'
    };
  }

  // Validate each draft row via V2 4.6 rules (title, start < end >= 15m, days)
  for (const d of drafts) {
    const daysList = Array.isArray(d.days) && d.days.length > 0 ? d.days : [typeof d.day === 'number' ? d.day : 0];
    const check = validateClassEntry(
      {
        id: d.id,
        activity: d.title || d.short || d.code,
        days: daysList,
        start: d.start,
        end: d.end,
        repeat: d.repeat || 'weekly'
      },
      []
    );
    if (!check.valid) {
      return {
        ok: false,
        errors: check.errors,
        error: Object.values(check.errors)[0] || 'Invalid imported class entry'
      };
    }
  }

  const oldDays = (_state.user?.entries || []).flatMap((e) => extractEntryDays(e));

  return executeScheduleMutation({
    actionName: 'importEntries',
    ownerId,
    recordUndo: true,
    checkConflictToast: true,
    mutate: (draftState) => {
      const expandedEntries = [];
      const entryIds = [];
      const newDays = [];
      let seq = 1;

      for (const d of drafts) {
        const daysList = Array.isArray(d.days) && d.days.length > 0 ? d.days : [typeof d.day === 'number' ? d.day : 0];
        const parsed = parseScheduleTitle(d.title || d.short || d.code || 'Class');
        for (const dayIdx of daysList) {
          const id = `${ownerId}-ocr-${seq++}`;
          entryIds.push(id);
          newDays.push(dayIdx);
          expandedEntries.push({
            id,
            ownerId,
            kind: 'class',
            title: parsed.title,
            short: d.short || parsed.short,
            detail: d.detail !== undefined ? d.detail : parsed.detail,
            code: d.short || parsed.short,
            room: d.detail !== undefined ? d.detail : parsed.detail,
            day: dayIdx,
            dayIndex: dayIdx,
            days: [dayIdx],
            start: d.start,
            end: d.end,
            repeat: d.repeat || 'weekly',
            notes: d.notes || '',
            source: 'ocr'
          });
        }
      }

      const target = getOwnerTarget(draftState, ownerId).person;
      target.entries = expandedEntries;
      if (ownerId === 'francis' || ownerId === draftState.user?.id) {
        draftState.session.onboarding = false;
      }

      return {
        ok: true,
        entryIds,
        changedDays: [...oldDays, ...newDays],
        groupedCount: drafts.length,
        count: expandedEntries.length,
        nextScreen: '29',
        toast: `Saved ${expandedEntries.length} classes`,
        canUndo: true
      };
    }
  });
}

/**
 * 5. applySimulatedChange — Single write path for Dev Menu friend schedule change
 *    (Addendum B §4 & Addendum C §1, §5)
 */
export function applySimulatedChange(payload = {}) {
  const friendId = payload.friendId || payload.ownerId || 'gian';
  const friend = (_state.friends || []).find((f) => f.id === friendId);
  if (!friend) return { ok: false, error: 'Friend not found' };

  const currentNow = now();

  return executeScheduleMutation({
    actionName: 'applySimulatedChange',
    ownerId: friend.id,
    recordUndo: true,
    checkConflictToast: true,
    mutate: (draftState) => {
      const targetFriend = (draftState.friends || []).find((f) => f.id === friendId);
      if (!targetFriend) return { ok: false };

      let targetEntry = null;
      if (payload.entryId) {
        targetEntry = (targetFriend.entries || []).find((e) => e.id === payload.entryId);
      }
      if (!targetEntry) {
        targetEntry = (targetFriend.entries || []).find(
          (e) =>
            (e.day === 0 || (Array.isArray(e.days) && e.days.includes(0))) &&
            (e.title.includes('Information Management') || e.short?.includes('Information Management'))
        );
      }
      if (!targetEntry && (targetFriend.entries || []).length > 0) {
        targetEntry = targetFriend.entries[0];
      }

      const oldDays = targetEntry ? extractEntryDays(targetEntry) : [0];
      const newDay = typeof payload.day === 'number' ? payload.day : oldDays[0] ?? 0;

      let detailText = 'Updated Monday schedule';
      const changedIds = [];

      if (targetEntry) {
        changedIds.push(targetEntry.id);
        targetEntry.day = newDay;
        targetEntry.dayIndex = newDay;
        targetEntry.days = [newDay];

        if (typeof payload.start === 'number' && typeof payload.end === 'number') {
          targetEntry.start = payload.start;
          targetEntry.end = payload.end;
        } else if (targetEntry.start === 14 * 60 && targetEntry.end === 15 * 60 + 30) {
          targetEntry.start = 13 * 60 + 30;
          targetEntry.end = 15 * 60;
        } else {
          targetEntry.start = 14 * 60;
          targetEntry.end = 15 * 60 + 30;
        }
        detailText = `Moved ${targetEntry.short || targetEntry.title} (${DEMO_WEEK_DATES[newDay]?.short || 'Mon'}) to ${formatRange(targetEntry.start, targetEntry.end)}`;
      }

      targetFriend.updatedAgo = 'Updated just now';
      const isPriv =
        targetFriend.shareLevel === 'none' ||
        targetFriend.sharesWithViewer === 'none' ||
        targetFriend.shareLevelToUser === 'private' ||
        targetFriend.shareLevelToUser === 'none';

      const newNotif = {
        id: `notif_sim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        kind: 'schedule_update',
        type: 'schedule_updated',
        personId: targetFriend.id,
        name: targetFriend.name,
        firstName: targetFriend.firstName,
        username: targetFriend.username,
        initials: targetFriend.initials,
        avatarClass: targetFriend.avatarClass,
        title: `${targetFriend.firstName} updated his schedule`,
        detail: detailText,
        timeAgo: 'Just now',
        timestamp: currentNow.epochMs,
        unread: true,
        bucket: 'TODAY',
        canView: !isPriv
      };
      draftState.notifications.unshift(newNotif);

      return {
        ok: true,
        entryIds: changedIds,
        changedDays: [...oldDays, newDay],
        notification: newNotif,
        toast: `${targetFriend.firstName} updated his schedule`
      };
    }
  });
}

/* ==========================================================================
   SELECTORS (Pure memoized derived views — Addendum C §2)
   ========================================================================== */

export function selectFriendById(state, friendId) {
  if (!friendId) return state.friends[0] || null;
  if (friendId === 'francis' || friendId === state.user.id) return state.user;
  return (
    state.friends.find((f) => f.id === friendId) ||
    state.incomingRequests.find((r) => r.id === friendId || r.personId === friendId) ||
    (state.directoryPeople || []).find((p) => p.id === friendId) ||
    null
  );
}

/**
 * Memoized per-person status selector: status(person, now, viewer).
 * - For a friend, depends ONLY on that friend's schedule rev, privacy, and clock minute.
 * - A change to Francis's schedule NEVER invalidates or recomputes any friend's status.
 */
export function selectPersonStatus(state, personId, currentNow = now()) {
  const isSelf = !personId || personId === 'francis' || personId === state.user?.id;
  const resolvedId = isSelf ? 'francis' : personId;
  const person = isSelf ? state.user : selectFriendById(state, resolvedId);
  if (!person) return null;

  const ownerRev = getOwnerRev(state, resolvedId);
  const privSig = getPersonPrivacySig(state, resolvedId);
  const signature = `${ownerRev}|${privSig}|${currentNow.dayIndex}|${currentNow.minutes}`;

  return memoizeSelector({
    cacheKey: `personStatus:${resolvedId}`,
    owners: [resolvedId],
    days: null,
    signature,
    compute: () => status(person, currentNow, isSelf ? 'self' : state.user.id, state.groups)
  });
}

/**
 * Memoized Friends Availability & Group Counts selector (Addendum B §4 + Addendum C §2, §4, §7.3).
 * - Depends ONLY on friends' schedules, friends' privacy, group memberships, groupFilter, and clockMinute.
 * - Does NOT include 'francis' in `owners`: when only Francis's schedule changes,
 *   this selector is NOT invalidated and returns the exact same object reference (`===`).
 */
export function selectFriendsAvailability(state, currentNow = now(), groupFilter = 'All') {
  const filterKey = String(groupFilter || 'All').toLowerCase();
  const friendIds = (state.friends || []).map((f) => f.id);
  const signature = `${getFriendsRevsSig(state)}|${getFriendsPrivacySig(state)}|${getGroupsMembershipSig(state)}|${filterKey}|${currentNow.dayIndex}|${currentNow.minutes}`;

  return memoizeSelector({
    cacheKey: `friendsAvailability:${filterKey}`,
    owners: friendIds,
    days: null,
    signature,
    compute: () => {
      let friendsList = (state.friends || []).filter((f) => f.relationship !== 'blocked');

      let activeGroup = null;
      if (groupFilter && filterKey !== 'all') {
        activeGroup = (state.groups || []).find(
          (g) => g.name.toLowerCase() === filterKey || g.id.toLowerCase() === filterKey
        );
        if (activeGroup) {
          friendsList = friendsList.filter((f) => activeGroup.memberIds.includes(f.id));
        }
      }

      const enriched = friendsList.map((friend) => ({
        friend,
        status: selectPersonStatus(state, friend.id, currentNow)
      }));

      const nonPrivate = enriched.filter((item) => item.status.state !== 'private');

      const freeNow = nonPrivate
        .filter((item) => item.status.state === 'free')
        .sort((a, b) => (b.status.remainingMinutes || 0) - (a.status.remainingMinutes || 0));

      const busyNow = nonPrivate
        .filter((item) => item.status.state === 'busy')
        .sort((a, b) => (a.status.remainingMinutes || 0) - (b.status.remainingMinutes || 0));

      const privateFriends = enriched.filter((item) => item.status.state === 'private');

      let nextFriendToBecomeFree = null;
      if (freeNow.length === 0 && busyNow.length > 0) {
        const firstBusy = busyNow[0];
        if (firstBusy && typeof firstBusy.status.untilMinutes === 'number') {
          nextFriendToBecomeFree = {
            friend: firstBusy.friend,
            atMinutes: firstBusy.status.untilMinutes,
            atFormatted: formatTime12(firstBusy.status.untilMinutes)
          };
        }
      }

      const allFriendsEnriched = (state.friends || []).map((f) => ({
        friend: f,
        status: selectPersonStatus(state, f.id, currentNow)
      }));

      const groupStats = {};
      for (const g of state.groups || []) {
        const members = allFriendsEnriched.filter(
          (item) => g.memberIds.includes(item.friend.id) && item.status.state !== 'private'
        );
        const freeMembers = members.filter((item) => item.status.state === 'free');
        groupStats[g.id] = {
          id: g.id,
          name: g.name,
          totalCount: members.length,
          freeCount: freeMembers.length
        };
      }

      return {
        allEnriched: enriched,
        nonPrivate,
        freeNow,
        busyNow,
        privateFriends,
        totalNonPrivateCount: nonPrivate.length,
        freeNowCount: freeNow.length,
        busyNowCount: busyNow.length,
        privateCount: privateFriends.length,
        activeGroup,
        nextFriendToBecomeFree,
        groupStats
      };
    }
  });
}

function computeRibbonSegmentsForDay(person, dayIndex) {
  const totalSpan = DAY_WINDOW_END - DAY_WINDOW_START; // 840 mins (7:00..21:00)
  const busySpans = getMergedBusySpans(person, dayIndex, DAY_WINDOW_START, DAY_WINDOW_END);
  const segments = [];
  let cursor = DAY_WINDOW_START;

  for (const span of busySpans) {
    if (span.start > cursor) {
      const dur = span.start - cursor;
      segments.push({
        type: 'free',
        start: cursor,
        end: span.start,
        widthPct: (dur / totalSpan) * 100,
        label: dur >= 120 ? 'Free' : ''
      });
    }
    const dur = span.end - span.start;
    const firstEntry = span.entries?.[0];
    const shortCode = (firstEntry?.short || firstEntry?.code || 'Busy').split(/\s+/)[0].slice(0, 6);
    segments.push({
      type: 'busy',
      start: span.start,
      end: span.end,
      widthPct: (dur / totalSpan) * 100,
      label: dur >= 60 ? shortCode : ''
    });
    cursor = Math.max(cursor, span.end);
  }

  if (cursor < DAY_WINDOW_END) {
    const dur = DAY_WINDOW_END - cursor;
    segments.push({
      type: 'free',
      start: cursor,
      end: DAY_WINDOW_END,
      widthPct: (dur / totalSpan) * 100,
      label: dur >= 120 ? 'Free' : ''
    });
  }

  return segments;
}

/**
 * Memoized `yourDay` selector (Addendum C §2 & §4):
 * Computes Francis's ribbon, free windows, "NEXT FREE" label, and hero "Free until" wording.
 */
export function selectYourDay(state, currentNow = now(), dayIndex = currentNow.dayIndex) {
  const resolvedDay = typeof dayIndex === 'number' ? dayIndex : currentNow.dayIndex;
  const francisRev = getOwnerRev(state, 'francis');
  const signature = `${francisRev}|${resolvedDay}|${currentNow.dayIndex}|${currentNow.minutes}`;

  return memoizeSelector({
    cacheKey: `yourDay:${resolvedDay}`,
    owners: ['francis'],
    days: [resolvedDay],
    signature,
    compute: () => {
      const userStatus =
        resolvedDay === currentNow.dayIndex
          ? selectPersonStatus(state, 'francis', currentNow)
          : status(state.user, { ...currentNow, dayIndex: resolvedDay, minutes: DAY_WINDOW_START }, 'self', state.groups);

      const dayEntries = getEntriesForDay(state.user, resolvedDay);
      const freeIntervals = computeFreeIntervals(state.user, resolvedDay, DAY_WINDOW_START, DAY_WINDOW_END);
      const refMinutes = resolvedDay === currentNow.dayIndex ? currentNow.minutes : DAY_WINDOW_START;

      const upcomingFree = freeIntervals.find(
        (iv) => iv.end > refMinutes && iv.end - Math.max(iv.start, refMinutes) >= 30
      );

      const nextFreeLabel = upcomingFree
        ? `NEXT FREE ${formatCompactRange(upcomingFree.start, upcomingFree.end)}`
        : 'FREE TODAY';

      let yourDaySubText = '';
      if (userStatus.state === 'busy') {
        yourDaySubText = `${userStatus.currentEntry?.short || userStatus.currentEntry?.code || 'Busy'} · Ends ${userStatus.untilFormatted}`;
      } else if (userStatus.nextEntry) {
        const detailSuffix = userStatus.nextEntry.detail ? ` · ${userStatus.nextEntry.detail}` : '';
        yourDaySubText = `${userStatus.nextEntry.short || userStatus.nextEntry.code} · ${formatTime12(userStatus.nextEntry.start).replace(' AM', '').replace(' PM', '')}–${formatTime12(userStatus.nextEntry.end)}${detailSuffix}`;
      } else {
        yourDaySubText = userStatus.statusText || 'Free for the rest of the day';
      }

      // Hero "Free until" wording that depends on Francis's "next free" (Addendum C §4)
      let heroFreeUntilText = '';
      if (userStatus.state === 'free') {
        heroFreeUntilText = userStatus.statusText || 'Free for the rest of the day';
      } else if (upcomingFree) {
        heroFreeUntilText = `You're free ${formatCompactRange(upcomingFree.start, upcomingFree.end)} (Free until ${formatTime12(upcomingFree.end)})`;
      } else {
        heroFreeUntilText = `Busy until ${userStatus.untilFormatted || 'later'}`;
      }

      const totalSpan = DAY_WINDOW_END - DAY_WINDOW_START;
      const nowPct = Math.max(0, Math.min(100, ((currentNow.minutes - DAY_WINDOW_START) / totalSpan) * 100));
      const ribbonSegments = computeRibbonSegmentsForDay(state.user, resolvedDay);

      return {
        dayIndex: resolvedDay,
        userStatus,
        dayEntries,
        freeIntervals,
        upcomingFree,
        nextFreeLabel,
        yourDaySubText,
        heroFreeUntilText,
        ribbonSegments,
        nowPct,
        hasClasses: (state.user.entries || []).length > 0
      };
    }
  });
}

export const selectUserDayStatus = selectYourDay;

/**
 * Memoized `bestWindowForMostPeople` selector (Now mint card — Addendum C §2 & §4)
 */
export function selectBestWindowForMostPeople(state, currentNow = now()) {
  const friendIds = (state.friends || []).map((f) => f.id);
  const signature = `${getOwnerRev(state, 'francis')}|${getFriendsRevsSig(state)}|${getFriendsPrivacySig(state)}|${state.proposalsRev || 1}|${state.activeProposalId || ''}|${currentNow.dayIndex}|${currentNow.minutes}`;

  return memoizeSelector({
    cacheKey: 'bestWindowForMostPeople',
    owners: ['francis', ...friendIds],
    days: [currentNow.dayIndex],
    signature,
    compute: () => {
      const best = bestWindowForMostPeople(state.user, state.friends, currentNow.dayIndex, state.groups, currentNow);
      if (!best) return null;

      const matchingProposal =
        (state.proposals || []).find(
          (p) =>
            p.dayIndex === best.dayIndex &&
            p.windowStart === best.window.start &&
            p.windowEnd === best.window.end
        ) ||
        (state.proposals || []).find((p) => p.id === state.activeProposalId) ||
        null;

      const suggestLabel = matchingProposal?.conflict
        ? `Conflict with ${matchingProposal.conflictWith}`
        : matchingProposal &&
          matchingProposal.dayIndex === best.dayIndex &&
          matchingProposal.windowStart === best.window.start &&
          matchingProposal.windowEnd === best.window.end
        ? 'Suggested'
        : 'Suggest →';

      return {
        ...best,
        matchingProposal,
        suggestLabel
      };
    }
  });
}

export const selectNowBestWindow = selectBestWindowForMostPeople;

function buildParticipantColumnModel(person, dayIndex, viewerId) {
  const isSelf = person.id === 'francis' || person.id === viewerId;
  const isPrivate =
    !isSelf &&
    (person.shareLevel === 'none' ||
      person.sharesWithViewer === 'none' ||
      person.shareLevelToUser === 'private' ||
      person.shareLevelToUser === 'none');

  if (isPrivate) {
    return {
      personId: person.id,
      name: isSelf ? 'You' : person.firstName,
      isSelf,
      isPrivate: true,
      busyBlocks: [],
      freeBlocks: []
    };
  }

  const canvasStart = DAY_WINDOW_START;
  const canvasSpan = DAY_WINDOW_END - DAY_WINDOW_START;
  const entries = getEntriesForDay(person, dayIndex);
  const freeList = computeFreeIntervals(person, dayIndex, canvasStart, DAY_WINDOW_END);

  const busyBlocks = entries
    .map((e) => {
      const s = Math.max(canvasStart, e.start);
      const end = Math.min(DAY_WINDOW_END, e.end);
      if (end <= s) return null;
      return {
        id: e.id,
        title: e.short || e.code || e.title,
        fullTitle: e.title,
        start: s,
        end,
        topPct: ((s - canvasStart) / canvasSpan) * 100,
        heightPct: ((end - s) / canvasSpan) * 100
      };
    })
    .filter(Boolean);

  const freeBlocks = freeList
    .filter((f) => f.end - f.start >= 30)
    .map((f) => {
      const s = Math.max(canvasStart, f.start);
      const end = Math.min(DAY_WINDOW_END, f.end);
      if (end <= s) return null;
      return {
        id: `free_${person.id}_${dayIndex}_${s}_${end}`,
        start: s,
        end,
        topPct: ((s - canvasStart) / canvasSpan) * 100,
        heightPct: ((end - s) / canvasSpan) * 100
      };
    })
    .filter(Boolean);

  return {
    personId: person.id,
    name: isSelf ? 'You' : person.firstName,
    isSelf,
    isPrivate: false,
    busyBlocks,
    freeBlocks
  };
}

function formatFriendNamesList(participants, userId = 'francis') {
  const names = (participants || [])
    .filter((p) => p.id !== 'francis' && p.id !== userId)
    .map((p) => p.firstName || p.name);
  if (names.length === 0) return 'friends';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Memoized `overlap(participants, day)` selector (Addendum C §2 & §4)
 */
export function selectOverlap(state, rawParticipantIds = null, rawDayIndex = null, currentNow = now()) {
  const dayIndex =
    typeof rawDayIndex === 'number'
      ? rawDayIndex
      : typeof state.ui.overlapDayIndex === 'number'
      ? state.ui.overlapDayIndex
      : currentNow.dayIndex;

  const baseIds =
    Array.isArray(rawParticipantIds) && rawParticipantIds.length > 0
      ? rawParticipantIds
      : state.ui.overlapParticipantIds?.length
      ? state.ui.overlapParticipantIds
      : ['francis', 'gian', 'danica'];

  const participantIds = baseIds.includes('francis') ? [...baseIds] : ['francis', ...baseIds];
  const participants = participantIds
    .map((id) => (id === 'francis' || id === state.user.id ? state.user : state.friends.find((f) => f.id === id)))
    .filter(Boolean);

  const normalizedIds = participants.map((p) => p.id);
  const selWin = state.ui.selectedOverlapWindow;
  const selWinSig =
    selWin && selWin.dayIndex === dayIndex ? `${selWin.start}-${selWin.end}` : 'best';

  const signature = `${normalizedIds.map((id) => getOwnerRev(state, id)).join(',')}|${normalizedIds
    .map((id) => getPersonPrivacySig(state, id))
    .join(',')}|${dayIndex}|${selWinSig}|${state.proposalsRev || 1}|${state.activeProposalId || ''}`;

  return memoizeSelector({
    cacheKey: `overlap:${normalizedIds.join(',')}:${dayIndex}`,
    owners: normalizedIds,
    days: [dayIndex],
    signature,
    compute: () => {
      const rawResult = overlap(participants, dayIndex, {
        viewerId: state.user.id,
        groups: state.groups
      });

      const bestWindow = rawResult.bestWindow;

      // Addendum C §4: If the previously selected window disappears, fall back to the new bestWindow, or null
      let selectedWindow = bestWindow;
      if (selWin && selWin.dayIndex === dayIndex) {
        const stillExists = rawResult.windows.find(
          (w) => w.start === selWin.start && w.end === selWin.end
        );
        selectedWindow = stillExists || bestWindow || null;
      }

      const normalizedResult = {
        ...rawResult,
        intervals: rawResult.windows,
        flaggedPrivate: rawResult.privateParticipants,
        selectedWindow
      };

      const nextDayFallback =
        rawResult.windows.length === 0
          ? findNextDayWithOverlap(participants, dayIndex, {
              viewerId: state.user.id,
              groups: state.groups
            })
          : null;

      // Find proposal relevant to this day & participant set
      const dayProposals = (state.proposals || []).filter((p) => p.dayIndex === dayIndex);
      const activeProposal =
        dayProposals.find((p) => p.conflict) ||
        dayProposals.find((p) => p.id === state.activeProposalId) ||
        dayProposals[dayProposals.length - 1] ||
        null;

      const friendNamesText = formatFriendNamesList(rawResult.activeParticipants, state.user.id);
      let suggestButtonLabel = 'No shared free time';
      if (activeProposal?.conflict) {
        suggestButtonLabel = activeProposal.status || `Conflict with ${activeProposal.conflictWith}`;
      } else if (
        activeProposal &&
        selectedWindow &&
        activeProposal.windowStart === selectedWindow.start &&
        activeProposal.windowEnd === selectedWindow.end
      ) {
        suggestButtonLabel = 'Suggested';
      } else if (selectedWindow) {
        suggestButtonLabel = `Suggest ${formatTime12(selectedWindow.start)} to ${friendNamesText}`;
      }

      const columns = participants.map((p) => buildParticipantColumnModel(p, dayIndex, state.user.id));

      return {
        dayIndex,
        dayMeta: DEMO_WEEK_DATES[dayIndex] || DEMO_WEEK_DATES[1],
        participants,
        participantIds: normalizedIds,
        overlapResult: normalizedResult,
        windows: rawResult.windows,
        bestWindow,
        selectedWindow,
        columns,
        friendNamesText,
        suggestButtonLabel,
        hasPrivateParticipant: rawResult.privateParticipants.length > 0,
        firstPrivateParticipant: rawResult.privateParticipants[0] || null,
        nextDayFallback,
        activeProposal
      };
    }
  });
}

export function selectOverlapViewData(state, currentNow = now()) {
  return selectOverlap(state, state.ui.overlapParticipantIds, state.ui.overlapDayIndex, currentNow);
}

/**
 * Memoized `groupNextAllFree(group)` selector for Screen 10 (Addendum C §2 & §4)
 */
export function selectGroupNextAllFree(state, groupId = null, currentNow = now()) {
  const resolvedGroupId = groupId || state.ui.activeGroupId || state.groups?.[0]?.id || 'kalbo';
  const group = (state.groups || []).find((g) => g.id === resolvedGroupId) || state.groups?.[0] || null;
  if (!group) return null;

  const memberIds = group.memberIds || [];
  const ownerList = ['francis', ...memberIds];
  const signature = `${ownerList.map((id) => getOwnerRev(state, id)).join(',')}|${memberIds
    .map((id) => getPersonPrivacySig(state, id))
    .join(',')}|${group.name}|${currentNow.dayIndex}|${currentNow.minutes}`;

  return memoizeSelector({
    cacheKey: `groupNextAllFree:${group.id}`,
    owners: ownerList,
    days: [currentNow.dayIndex],
    signature,
    compute: () => {
      const members = memberIds
        .map((id) => state.friends.find((f) => f.id === id))
        .filter(Boolean);

      const enrichedMembers = members.map((friend) => ({
        friend,
        status: selectPersonStatus(state, friend.id, currentNow)
      }));

      const nonPrivateMembers = enrichedMembers.filter((m) => m.status.state !== 'private');
      const freeNowMembers = nonPrivateMembers.filter((m) => m.status.state === 'free');
      const privateMembers = enrichedMembers.filter((m) => m.status.state === 'private');

      const fullGroupOverlap = overlap(
        [state.user, ...nonPrivateMembers.map((m) => m.friend)],
        currentNow.dayIndex,
        { viewerId: state.user.id, groups: state.groups }
      );

      // Search upcoming days if no all-free window today
      const nextDayGroupOverlap = !fullGroupOverlap.bestWindow
        ? findNextDayWithOverlap(
            [state.user, ...nonPrivateMembers.map((m) => m.friend)],
            currentNow.dayIndex,
            { viewerId: state.user.id, groups: state.groups }
          )
        : null;

      const subsetOverlap = !fullGroupOverlap.bestWindow
        ? bestWindowForMostPeople(
            state.user,
            nonPrivateMembers.map((m) => m.friend),
            currentNow.dayIndex,
            state.groups,
            currentNow
          )
        : null;

      const bestWin = fullGroupOverlap.bestWindow || nextDayGroupOverlap?.bestWindow || subsetOverlap?.window || null;
      const bestWinDayLabel = fullGroupOverlap.bestWindow
        ? 'today'
        : nextDayGroupOverlap?.bestWindow
        ? nextDayGroupOverlap.dayShort
        : 'today';

      const overlapParticipants =
        fullGroupOverlap.bestWindow || nextDayGroupOverlap?.bestWindow
          ? [state.user, ...nonPrivateMembers.map((m) => m.friend)]
          : subsetOverlap?.participants || [state.user, ...nonPrivateMembers.map((m) => m.friend)];

      const totalCompared = nonPrivateMembers.length + 1;
      const eyebrowText = bestWin
        ? `NEXT TIME ALL ${totalCompared} ARE FREE · ${formatDuration(bestWin.duration).toUpperCase()}`
        : `NEXT TIME ALL ${totalCompared} ARE FREE`;

      const headlineText = bestWin
        ? `${bestWin.formatted} ${bestWinDayLabel}`
        : 'Compare schedules';

      return {
        group,
        members,
        enrichedMembers,
        nonPrivateMembers,
        freeNowMembers,
        privateMembers,
        fullGroupOverlap,
        subsetOverlap,
        bestWindow: bestWin,
        bestWinDayLabel,
        overlapParticipants,
        eyebrowText,
        headlineText
      };
    }
  });
}

/**
 * Memoized `freeTogether(you, friend)` selector for Screens 3 and 35 (Addendum C §2 & §4)
 */
export function selectFreeTogether(state, friendId = null, rawDayIndex = null, currentNow = now()) {
  const friend = selectFriendById(state, friendId || state.ui.activeFriendId) || state.friends?.[0] || null;
  if (!friend) return null;

  const dayIndex =
    typeof rawDayIndex === 'number'
      ? rawDayIndex
      : typeof state.ui.friendScheduleDayIndex === 'number'
      ? state.ui.friendScheduleDayIndex
      : currentNow.dayIndex;

  const signature = `${getOwnerRev(state, 'francis')}|${getOwnerRev(state, friend.id)}|${getPersonPrivacySig(
    state,
    friend.id
  )}|${dayIndex}|${currentNow.dayIndex}|${currentNow.minutes}`;

  return memoizeSelector({
    cacheKey: `freeTogether:${friend.id}:${dayIndex}`,
    owners: ['francis', friend.id],
    days: [dayIndex],
    signature,
    compute: () => {
      const dayMeta = DEMO_WEEK_DATES[dayIndex] || DEMO_WEEK_DATES[1];
      const friendSt = selectPersonStatus(state, friend.id, currentNow);
      const isPrivate = friendSt.state === 'private';

      const sharedOverlap = !isPrivate
        ? overlap([state.user, friend], dayIndex, { viewerId: state.user.id, groups: state.groups })
        : null;

      const bestWindow = sharedOverlap?.bestWindow || null;
      const windows = sharedOverlap?.windows || [];

      const freeTogetherHeadline = bestWindow
        ? `Best window ${formatCompactRange(bestWindow.start, bestWindow.end)} (${formatDuration(bestWindow.duration)})`
        : `No shared free time on ${dayMeta.short}`;

      const freeTogetherSub =
        windows.length > 0
          ? `${dayMeta.short} shared: ${windows.map((w) => formatCompactRange(w.start, w.end)).join(' · ')}`
          : 'Tap Plan to check other days';

      const findTimeLabel = bestWindow
        ? `Find a time with ${friend.firstName} (${formatCompactRange(bestWindow.start, bestWindow.end)}) →`
        : `Find a time with ${friend.firstName} →`;

      const canvasStart = DAY_WINDOW_START;
      const canvasSpan = DAY_WINDOW_END - DAY_WINDOW_START;
      const dayEntries = isPrivate ? [] : getEntriesForDay(friend, dayIndex);
      const dayFreeIntervals = isPrivate
        ? []
        : computeFreeIntervals(friend, dayIndex, canvasStart, DAY_WINDOW_END);
      const nowPct = Math.max(0, Math.min(100, ((currentNow.minutes - canvasStart) / canvasSpan) * 100));

      const weekColumns = DEMO_WEEK_DATES.map((d) => ({
        dayMeta: d,
        isToday: d.dayIndex === currentNow.dayIndex,
        entries: isPrivate ? [] : getEntriesForDay(friend, d.dayIndex),
        freeIntervals: isPrivate
          ? []
          : computeFreeIntervals(friend, d.dayIndex, canvasStart, DAY_WINDOW_END).filter(
              (iv) => iv.end - iv.start >= 90
            )
      }));

      return {
        friend,
        dayIndex,
        dayMeta,
        friendStatus: friendSt,
        isPrivate,
        sharedOverlap,
        bestWindow,
        windows,
        freeTogetherHeadline,
        freeTogetherSub,
        findTimeLabel,
        dayEntries,
        dayFreeIntervals,
        nowPct,
        weekColumns
      };
    }
  });
}

/**
 * Memoized `linkPreview` selector for Screen 38 & Screen 5 (Addendum C §2 & §4)
 */
export function selectLinkPreview(state, rawLinkId = null, rawDayIndex = null, currentNow = now()) {
  const linkId = rawLinkId || state.ui.activeShareLinkId || 'francis_8472';
  const link = (state.shareLinks || []).find((l) => l.id === linkId) || null;
  const dayIndex =
    typeof rawDayIndex === 'number'
      ? rawDayIndex
      : typeof state.ui.myScheduleDayIndex === 'number'
      ? state.ui.myScheduleDayIndex
      : currentNow.dayIndex;

  const linkSig = link
    ? `${link.id}:${link.audience}:${link.hoursStart}:${link.hoursEnd}:${link.revoked ? 1 : 0}:${link.expired ? 1 : 0}:${link.expiresAt}`
    : 'none';
  const signature = `${getOwnerRev(state, 'francis')}|${linkSig}|${dayIndex}|${currentNow.dayIndex}|${currentNow.minutes}`;

  return memoizeSelector({
    cacheKey: `linkPreview:${linkId}:${dayIndex}`,
    owners: ['francis'],
    days: [dayIndex],
    signature,
    compute: () => {
      const linkStatus = selectShareLinkStatus(link, currentNow);
      const yourDay = selectYourDay(state, currentNow, dayIndex);
      const userStatus = yourDay.userStatus;
      const showFull = link?.audience === 'full';
      const canvasStart = link?.audience === 'specific_hours' ? link.hoursStart || 9 * 60 : DAY_WINDOW_START;
      const canvasEnd = link?.audience === 'specific_hours' ? link.hoursEnd || 17 * 60 : DAY_WINDOW_END;
      const canvasSpan = Math.max(60, canvasEnd - canvasStart);

      const entries = getEntriesForDay(state.user, dayIndex);
      const freeIntervals = computeFreeIntervals(state.user, dayIndex, canvasStart, canvasEnd);

      const summaryText = `${yourDay.yourDaySubText} · ${yourDay.nextFreeLabel}`;

      return {
        linkId,
        link,
        linkStatus,
        dayIndex,
        userStatus,
        yourDay,
        showFull,
        canvasStart,
        canvasEnd,
        canvasSpan,
        entries,
        freeIntervals,
        summaryText
      };
    }
  });
}

/**
 * Memoized `selectMyScheduleView` selector for Screens 8 (My Week) & 37 (My Day) (Addendum C §2 & §4)
 */
export function selectMyScheduleView(state, rawDayIndex = null, currentNow = now()) {
  const dayIndex =
    typeof rawDayIndex === 'number'
      ? rawDayIndex
      : typeof state.ui.myScheduleDayIndex === 'number'
      ? state.ui.myScheduleDayIndex
      : currentNow.dayIndex;

  const signature = `${getOwnerRev(state, 'francis')}|${dayIndex}|${state.ui.highlightClassId || ''}|${currentNow.dayIndex}|${currentNow.minutes}`;

  return memoizeSelector({
    cacheKey: `myScheduleView:${dayIndex}`,
    owners: ['francis'],
    days: null,
    signature,
    compute: () => {
      const canvasStart = DAY_WINDOW_START;
      const canvasEnd = DAY_WINDOW_END;
      const canvasSpan = canvasEnd - canvasStart;
      const dayMeta = DEMO_WEEK_DATES[dayIndex] || DEMO_WEEK_DATES[1];

      const weekColumns = DEMO_WEEK_DATES.map((d) => ({
        dayMeta: d,
        isToday: d.dayIndex === currentNow.dayIndex,
        entries: getEntriesForDay(state.user, d.dayIndex),
        freeIntervals: computeFreeIntervals(state.user, d.dayIndex, canvasStart, canvasEnd).filter(
          (iv) => iv.end - iv.start >= 120
        )
      }));

      const dayEntries = getEntriesForDay(state.user, dayIndex);
      const dayFreeIntervals = computeFreeIntervals(state.user, dayIndex, canvasStart, canvasEnd);
      const nowPct = Math.max(0, Math.min(100, ((currentNow.minutes - canvasStart) / canvasSpan) * 100));

      return {
        dayIndex,
        dayMeta,
        weekColumns,
        dayEntries,
        dayFreeIntervals,
        nowPct
      };
    }
  });
}

export function selectShareLinkStatus(link, currentNow = now()) {
  if (!link) return 'not_found';
  if (link.revoked) return 'revoked';
  if (link.expired) return 'expired';
  if (typeof link.expiresAt === 'number' && currentNow.epochMs >= link.expiresAt) {
    return 'expired';
  }
  return 'active';
}

export function selectActiveShareLinks(state, currentNow = now()) {
  const links = Array.isArray(state.shareLinks)
    ? state.shareLinks
    : Object.values(state.shareLinks?.links || {});
  return links.filter((l) => selectShareLinkStatus(l, currentNow) === 'active');
}

export function selectExpiredShareLinks(state, currentNow = now()) {
  const links = Array.isArray(state.shareLinks)
    ? state.shareLinks
    : Object.values(state.shareLinks?.links || {});
  return links.filter((l) => selectShareLinkStatus(l, currentNow) === 'expired');
}

export function selectNotificationsView(state, currentNow = now()) {
  const sorted = [...(state.notifications || [])];
  const unreadCount = sorted.filter((n) => n.unread).length;
  const filtered = state.ui.inboxFilter === 'Unread' ? sorted.filter((n) => n.unread) : sorted;

  const enriched = filtered.map((n) => ({
    ...n,
    relativeTime: n.timeAgo || formatRelativeTime(n.timestamp, currentNow.epochMs)
  }));

  const todayItems = enriched.filter((n) => n.bucket === 'TODAY' || n.timeAgo !== 'Yesterday');
  const yesterdayItems = enriched.filter((n) => !todayItems.includes(n));

  return {
    all: sorted,
    filtered: enriched,
    todayItems,
    yesterdayItems,
    unreadCount
  };
}

export function selectFindFriendsResults(state, rawQuery = state.ui.findFriendsQuery) {
  const q = String(rawQuery ?? state.ui.findFriendsSearch ?? '').trim().toLowerCase();
  const blockedIds = new Set((state.blockedPeople || []).map((b) => b.id));
  const blockedUsernames = new Set((state.blockedPeople || []).map((b) => (b.username || '').toLowerCase()));

  const pool = [];
  const seenIds = new Set();

  for (const person of state.directoryPeople || []) {
    if (blockedIds.has(person.id) || blockedUsernames.has((person.username || '').toLowerCase())) continue;
    const isFriend = (state.friends || []).some((f) => f.id === person.id);
    const isOutgoing = (state.outgoingRequests || []).some((r) => r.id === person.id);
    const isIncoming = (state.incomingRequests || []).some((r) => r.id === person.id || r.personId === person.id);
    seenIds.add(person.id);
    pool.push({
      ...person,
      relationship: isFriend
        ? 'friends'
        : isOutgoing
        ? 'outgoing_pending'
        : isIncoming
        ? 'incoming_pending'
        : 'none'
    });
  }

  for (const req of state.incomingRequests || []) {
    const pid = req.personId || req.id;
    if (seenIds.has(pid) || blockedIds.has(pid)) continue;
    seenIds.add(pid);
    pool.push({
      ...req,
      id: pid,
      relationship: 'incoming_pending'
    });
  }

  for (const friend of state.friends || []) {
    if (seenIds.has(friend.id) || blockedIds.has(friend.id)) continue;
    seenIds.add(friend.id);
    pool.push({
      ...friend,
      relationship: 'friends'
    });
  }

  if (!q) return pool;
  return pool.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.username.toLowerCase().includes(q) ||
      (p.firstName || '').toLowerCase().includes(q)
  );
}

/* ==========================================================================
   REPOSITORY INTERFACE (repo.getState, repo.dispatch, repo.subscribe, single write actions)
   ========================================================================== */

const PRIVACY_LEVELS_SET = new Set(['none', 'busy_only', 'free_only', 'free_busy', 'full']);

export const repo = {
  getState() {
    return _state;
  },

  getLastChangeEvent() {
    return _lastChangeEvent;
  },

  subscribe(listener) {
    _listeners.add(listener);
    return () => _listeners.delete(listener);
  },

  subscribeScheduleChanges(listener) {
    _scheduleChangeListeners.add(listener);
    return () => _scheduleChangeListeners.delete(listener);
  },

  setErrorToastHandler(fn) {
    _errorToastHandler = fn;
  },

  setForcePersistFailure(flag) {
    _forcePersistFailure = Boolean(flag);
    if (_state) {
      _state.forcePersistFailure = _forcePersistFailure;
    }
    return _forcePersistFailure;
  },

  getForcePersistFailure() {
    return Boolean(_forcePersistFailure || _state?.forcePersistFailure);
  },

  // Direct single write path methods (Addendum C §1)
  addEntry(payload) {
    return addEntry(payload);
  },
  updateEntry(payload) {
    return updateEntry(payload);
  },
  deleteEntry(payload) {
    return deleteEntry(payload);
  },
  importEntries(payload) {
    return importEntries(payload);
  },
  applySimulatedChange(payload) {
    return applySimulatedChange(payload);
  },

  async hydrateFromNativeStorage() {
    try {
      const raw = await storageBridge.get(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        _state = ensureScheduleRevs(migrateState(parsed));
        _selectorCache.clear();
        notifyListeners();
      }
    } catch (_e) {
      // ignore
    }
    return _state;
  },

  undoLastAction() {
    const last = _undoStack.pop();
    if (!last) return { ok: false };

    const prevRev = _state.scheduleRev || 1;
    const prevOwnerRevs = { ...(_state.ownerScheduleRev || {}) };
    const preUndoSnapshot = cloneState(_state);

    _state = ensureScheduleRevs(cloneState(last.snapshot));

    let changeEvent = null;
    if (last.scheduleMeta) {
      const ownerId = last.scheduleMeta.ownerId || 'francis';
      _state.scheduleRev = prevRev + 1;
      _state.ownerScheduleRev = {
        ...prevOwnerRevs,
        [ownerId]: (prevOwnerRevs[ownerId] || 1) + 1
      };
      evaluateProposalConflicts(_state, {
        changedOwnerId: ownerId,
        changedEntryIds: last.scheduleMeta.entryIds || []
      });
      changeEvent = {
        ownerId,
        entryIds: last.scheduleMeta.entryIds || [],
        rev: _state.scheduleRev,
        changedDays: last.scheduleMeta.changedDays || [0, 1, 2, 3, 4, 5, 6]
      };
    }

    const persistRes = persistStateBeforeEmit(_state);
    if (!persistRes.ok) {
      _state = preUndoSnapshot;
      _undoStack.push(last);
      const errorToast = persistRes.error || 'Could not save schedule changes. Rolled back.';
      if (_errorToastHandler) {
        try {
          _errorToastHandler(errorToast);
        } catch (_e) {}
      }
      return { ok: false, rolledBack: true, error: errorToast, toast: errorToast };
    }

    if (changeEvent) {
      invalidateSelectorsForChange(changeEvent);
    } else {
      _selectorCache.clear();
    }

    notifyListeners(changeEvent);
    return { ok: true, actionName: last.actionName, changeEvent, rev: _state.scheduleRev };
  },

  dispatch(actionType, payload = {}) {
    const currentNow = now();
    let result = { ok: true };

    // Route all schedule writes through the SINGLE WRITE PATH (Addendum C §1)
    switch (actionType) {
      case 'addEntry':
      case 'ADD_ENTRY':
        return addEntry(payload);

      case 'updateEntry':
      case 'UPDATE_ENTRY':
        return updateEntry(payload);

      case 'deleteEntry':
      case 'DELETE_ENTRY':
      case 'DELETE_CLASS':
        return deleteEntry(payload);

      case 'importEntries':
      case 'IMPORT_ENTRIES':
      case 'SAVE_OCR_TIMETABLE':
        return importEntries(payload);

      case 'applySimulatedChange':
      case 'SIMULATE_SCHEDULE_CHANGE':
        return applySimulatedChange(payload);

      case 'SAVE_CLASS_FORM': {
        const form = { ..._state.ui.classForm, ...payload };
        const mode = _state.ui.classFormMode;
        if (mode === 'edit-import-row') {
          const existingDrafts = (_state.ocrDrafts || []).filter((d) => d.id !== _state.ui.editingClassId);
          const validation = validateClassEntry(
            {
              id: null,
              activity: form.activity,
              days: form.days,
              start: form.starts,
              end: form.ends,
              repeat: form.repeat
            },
            existingDrafts
          );
          if (!validation.valid) {
            return { ok: false, errors: validation.errors };
          }
          const rawInputTitle = String(form.activity || '').trim();
          const explicitRoom = String(form.room || '').trim();
          const parsedTitle = parseScheduleTitle(
            explicitRoom && !rawInputTitle.includes('(') ? `${rawInputTitle} (${explicitRoom})` : rawInputTitle
          );
          const draft = (_state.ocrDrafts || []).find((d) => d.id === _state.ui.editingClassId);
          if (draft) {
            draft.title = parsedTitle.title;
            draft.short = parsedTitle.short;
            draft.detail = explicitRoom || parsedTitle.detail;
            draft.code = parsedTitle.short;
            draft.room = explicitRoom || parsedTitle.detail;
            draft.days = [...(form.days || [4])];
            draft.start = validation.parsed.startMins;
            draft.end = validation.parsed.endMins;
            draft.repeat = form.repeat || 'weekly';
            draft.notes = String(form.notes || '').trim();
            draft.flag = null;
          }
          _state.ui.classFormDirty = false;
          persistStateBeforeEmit(_state);
          notifyListeners();
          return {
            ok: true,
            returnTo: '4',
            toast: `Confirmed ${parsedTitle.short}`
          };
        }

        if (mode === 'edit' && _state.ui.editingClassId) {
          return updateEntry({ ...form, id: _state.ui.editingClassId, ownerId: 'francis' });
        }
        return addEntry({ ...form, ownerId: 'francis' });
      }

      default:
        break;
    }

    switch (actionType) {
      case 'SET_UI': {
        _state.ui = { ..._state.ui, ...payload };
        break;
      }

      /* --------------------------------------------------------------------
         Data Modes & Dev Menu Actions (Addendum B §2 & §4)
         -------------------------------------------------------------------- */
      case 'RESET_SEED':
      case 'LOAD_SAMPLE_DATA': {
        _state = ensureScheduleRevs(createSeedState());
        _forcePersistFailure = false;
        _selectorCache.clear();
        persistStateBeforeEmit(_state);
        notifyListeners();
        return { ok: true, toast: 'Sample roster loaded (146 entries)' };
      }

      case 'RESET_TO_CLEAN': {
        _state = ensureScheduleRevs(createCleanState());
        _selectorCache.clear();
        persistStateBeforeEmit(_state);
        notifyListeners();
        return { ok: true, toast: 'Reset to clean state' };
      }

      case 'TOGGLE_PERSIST_FAILURE': {
        const nextVal =
          typeof payload.force === 'boolean' ? payload.force : !this.getForcePersistFailure();
        this.setForcePersistFailure(nextVal);
        return {
          ok: true,
          forcePersistFailure: nextVal,
          toast: `Simulate storage failure: ${nextVal ? 'ON' : 'OFF'}`
        };
      }

      case 'TOGGLE_FRIEND_PRIVATE': {
        const friendId = payload.friendId;
        const friend = (_state.friends || []).find((f) => f.id === friendId);
        if (!friend) return { ok: false };
        const currentlyPrivate =
          friend.shareLevel === 'none' ||
          friend.sharesWithViewer === 'none' ||
          friend.shareLevelToUser === 'private' ||
          friend.shareLevelToUser === 'none';
        const nextLevel =
          typeof payload.isPrivate === 'boolean'
            ? payload.isPrivate
              ? 'none'
              : 'full'
            : currentlyPrivate
            ? 'full'
            : 'none';
        friend.shareLevel = nextLevel;
        friend.shareLevelToUser = nextLevel === 'none' ? 'private' : 'full';
        friend.sharesWithViewer = nextLevel;
        friend.isPrivate = nextLevel === 'none';
        if (nextLevel === 'full') {
          friend.accessRequested = false;
        }
        for (const n of _state.notifications || []) {
          if (n.personId === friend.id && (n.kind === 'schedule_update' || n.type === 'schedule_updated')) {
            n.canView = nextLevel !== 'none';
          }
        }
        invalidateSelectorsForChange({ ownerId: friend.id });
        result = {
          ok: true,
          isPrivate: nextLevel === 'none',
          toast: nextLevel === 'none' ? `${friend.firstName} is now private` : `${friend.firstName} shares full schedule`
        };
        break;
      }

      /* --------------------------------------------------------------------
         Auth & Session Lifecycle
         -------------------------------------------------------------------- */
      case 'AUTH_SUBMIT': {
        const mode = payload.mode || _state.ui.authMode || 'signin';
        const form = { ..._state.ui.authForm, ...payload };
        const validation = validateAuthForm(form, mode);
        if (!validation.valid) {
          return { ok: false, errors: validation.errors };
        }
        const cleanUsername = String(form.username || form.email?.split('@')[0] || 'francis')
          .trim()
          .toLowerCase()
          .replace(/^@/, '');
        if (mode === 'create') {
          const firstName = String(form.firstName || form.name || 'Francis').trim();
          const lastName = String(form.lastName || '').trim();
          const fullName = lastName ? `${firstName} ${lastName}` : firstName;
          const initials = ((firstName[0] || 'F') + (lastName[0] || firstName[1] || 'R')).toUpperCase();
          _state.user.firstName = firstName;
          _state.user.lastName = lastName;
          _state.user.name = fullName;
          _state.user.username = cleanUsername;
          _state.user.initials = initials;
          _state.user.shortInitial = firstName[0].toUpperCase();
          _state.user.entries = [];
          _state.scheduleRev = (_state.scheduleRev || 1) + 1;
          _state.ownerScheduleRev.francis = (_state.ownerScheduleRev.francis || 1) + 1;
          invalidateSelectorsForChange({ ownerId: 'francis' });
          _state.session = {
            loggedIn: true,
            userId: cleanUsername,
            onboarding: true,
            signedOutNotice: false
          };
          result = { ok: true, mode: 'create', nextScreen: '28' };
        } else {
          const isNewUser = cleanUsername !== _state.user.username && cleanUsername !== 'francis';
          if (isNewUser) {
            const cap = cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1);
            _state.user.firstName = cap;
            _state.user.name = cap;
            _state.user.username = cleanUsername;
            _state.user.initials = cleanUsername.slice(0, 2).toUpperCase();
          }
          const hasZeroClasses = (_state.user.entries || []).length === 0;
          _state.session = {
            loggedIn: true,
            userId: _state.user.id,
            onboarding: hasZeroClasses,
            signedOutNotice: false
          };
          result = { ok: true, mode: 'signin', nextScreen: hasZeroClasses ? '28' : '1' };
        }
        break;
      }

      case 'SIGN_OUT': {
        _state.session = {
          loggedIn: false,
          userId: null,
          onboarding: false,
          signedOutNotice: true
        };
        result = { ok: true, nextScreen: '26' };
        break;
      }

      case 'DELETE_ACCOUNT': {
        const wiped = ensureScheduleRevs(createCleanState());
        wiped.session = {
          loggedIn: false,
          userId: null,
          onboarding: false,
          signedOutNotice: false
        };
        _state = wiped;
        _selectorCache.clear();
        storageBridge.remove(STORAGE_KEY);
        notifyListeners();
        return { ok: true, nextScreen: '26' };
      }

      /* --------------------------------------------------------------------
         Proposals / "Suggest" (V2 §4.3 & Addendum C §4)
         -------------------------------------------------------------------- */
      case 'CREATE_PROPOSAL': {
        pushUndoSnapshot('CREATE_PROPOSAL', _state);
        const { windowStart, windowEnd, participantIds, dayIndex } = payload;
        const propId = `prop_${Date.now()}`;
        const resolvedDay = typeof dayIndex === 'number' ? dayIndex : _state.ui.overlapDayIndex;
        const resolvedParticipants = participantIds || _state.ui.overlapParticipantIds || ['francis', 'gian', 'danica'];
        const proposal = {
          id: propId,
          dayIndex: resolvedDay,
          windowStart,
          windowEnd,
          start: windowStart,
          end: windowEnd,
          participantIds: resolvedParticipants,
          status: 'Suggested',
          conflict: false,
          conflictWith: null
        };
        _state.proposals.push(proposal);
        _state.activeProposalId = propId;
        _state.proposalsRev = (_state.proposalsRev || 1) + 1;
        const friendNames = (proposal.participantIds || [])
          .filter((id) => id !== 'francis' && id !== _state.user.id)
          .map((id) => {
            const f = selectFriendById(_state, id);
            return f ? f.firstName : id;
          });
        const namesText =
          friendNames.length === 0
            ? 'friends'
            : friendNames.length === 1
            ? friendNames[0]
            : `${friendNames.slice(0, -1).join(', ')} and ${friendNames[friendNames.length - 1]}`;
        result = {
          ok: true,
          proposal,
          toast: `Suggested ${formatTime12(windowStart)} to ${namesText}`,
          canUndo: true
        };
        break;
      }

      /* --------------------------------------------------------------------
         Overlap Participants, Window Selection & Access Request
         -------------------------------------------------------------------- */
      case 'SELECT_OVERLAP_WINDOW': {
        const { dayIndex, start, end } = payload;
        _state.ui.selectedOverlapWindow = {
          dayIndex: typeof dayIndex === 'number' ? dayIndex : _state.ui.overlapDayIndex,
          start: Number(start),
          end: Number(end)
        };
        break;
      }

      case 'TOGGLE_OVERLAP_PARTICIPANT': {
        const personId = payload.personId;
        if (!personId || personId === 'francis' || personId === _state.user.id) {
          return { ok: false, reason: 'Cannot remove yourself' };
        }
        const current = [...(_state.ui.overlapParticipantIds || ['francis', 'gian', 'danica'])];
        const idx = current.indexOf(personId);
        if (idx >= 0) {
          const friendCount = current.filter((id) => id !== 'francis' && id !== _state.user.id).length;
          if (friendCount <= 1) {
            return { ok: false, reason: 'Select at least 1 friend to compare' };
          }
          current.splice(idx, 1);
        } else {
          current.push(personId);
        }
        _state.ui.overlapParticipantIds = current;
        _state.ui.overlapSelectedIds = current;
        _state.ui.selectedOverlapWindow = null;
        _state.activeProposalId = null;
        break;
      }

      case 'SET_OVERLAP_PARTICIPANTS': {
        const ids = Array.isArray(payload.participantIds) ? payload.participantIds : ['francis', 'gian', 'danica'];
        const withUser = ids.includes('francis') ? ids : ['francis', ...ids];
        _state.ui.overlapParticipantIds = withUser;
        _state.ui.overlapSelectedIds = withUser;
        if (typeof payload.dayIndex === 'number') {
          _state.ui.overlapDayIndex = payload.dayIndex;
        }
        _state.ui.selectedOverlapWindow = payload.selectedWindow || null;
        _state.activeProposalId = null;
        break;
      }

      case 'REQUEST_SCHEDULE_ACCESS': {
        const friendId = payload.friendId || _state.ui.activeFriendId;
        const friend = (_state.friends || []).find((f) => f.id === friendId);
        if (friend) {
          friend.accessRequested = true;
          invalidateSelectorsForChange({ ownerId: friend.id });
          result = {
            ok: true,
            toast: `Request sent to ${friend.firstName}`
          };
        }
        break;
      }

      /* --------------------------------------------------------------------
         Friend & Request Lifecycle (Addendum B §2: empty timetable on accept)
         -------------------------------------------------------------------- */
      case 'SEND_FRIEND_REQUEST': {
        const personId = payload.personId;
        const person = (_state.directoryPeople || []).find((p) => p.id === personId);
        if (!person) return { ok: false };
        person.relationship = 'outgoing_pending';
        person.status = 'pending';
        if (!_state.outgoingRequests.some((r) => r.id === person.id)) {
          _state.outgoingRequests.unshift({
            id: person.id,
            firstName: person.firstName,
            lastName: person.lastName || '',
            name: person.name,
            username: person.username,
            initials: person.initials,
            avatarClass: person.avatarClass,
            mutualCount: person.mutualCount || 0,
            mutualText: person.mutualText || 'No mutual friends',
            timestamp: currentNow.epochMs
          });
        }
        result = {
          ok: true,
          toast: `Request sent to ${person.name}`
        };
        break;
      }

      case 'CANCEL_OUTGOING_REQUEST': {
        const personId = payload.personId;
        const req = _state.outgoingRequests.find((r) => r.id === personId);
        _state.outgoingRequests = _state.outgoingRequests.filter((r) => r.id !== personId);
        const dirPerson = (_state.directoryPeople || []).find((p) => p.id === personId);
        if (dirPerson) {
          dirPerson.relationship = 'none';
          dirPerson.status = 'none';
        }
        result = {
          ok: true,
          toast: req ? `Cancelled request to ${req.firstName || req.name}` : 'Request cancelled'
        };
        break;
      }

      case 'ACCEPT_FRIEND_REQUEST': {
        const personId = payload.personId;
        const req =
          _state.incomingRequests.find((r) => r.id === personId || r.personId === personId) ||
          _state.notifications.find((n) => n.personId === personId && n.kind === 'friend_request');

        const resolvedId = req?.personId || req?.id || personId;
        const firstName = req?.firstName || (req?.name || 'Friend').split(' ')[0];
        const fullName = req?.name || firstName;
        const username = req?.username || firstName.toLowerCase();
        const initials = req?.initials || firstName.slice(0, 2).toUpperCase();
        const avatarClass = req?.avatarClass || 'av-peach';

        _state.incomingRequests = _state.incomingRequests.filter(
          (r) => r.id !== resolvedId && r.personId !== resolvedId && r.id !== personId
        );

        if (!_state.friends.some((f) => f.id === resolvedId)) {
          _state.friends.push({
            id: resolvedId,
            firstName,
            lastName: req?.lastName || '',
            name: fullName,
            shortName: fullName,
            shortInitial: initials[0],
            username,
            initials,
            avatarClass,
            mutualCount: req?.mutualCount || 3,
            groupTag: 'Friends',
            shareLevel: 'full',
            shareLevelToUser: 'full',
            sharesWithViewer: 'full',
            viewerRule: 'full',
            relationship: 'friends',
            updatedAgo: 'No timetable yet',
            entries: Array.isArray(req?.entries) ? [...req.entries] : []
          });
          _state.ownerScheduleRev[resolvedId] = 1;
        }

        if (!_state.connectedRequestCards.some((c) => c.personId === resolvedId)) {
          _state.connectedRequestCards.unshift({
            id: `${resolvedId}_connected`,
            personId: resolvedId,
            firstName,
            name: fullName,
            username,
            initials,
            avatarClass
          });
        }

        const existingNotif = _state.notifications.find(
          (n) => n.personId === resolvedId && n.kind === 'friend_request'
        );
        if (existingNotif) {
          existingNotif.kind = 'request_accepted';
          existingNotif.type = 'request_accepted';
          existingNotif.title = `You and ${firstName} are now friends`;
          existingNotif.detail = 'Now in your Friends';
          existingNotif.unread = false;
          existingNotif.canView = true;
        } else {
          _state.notifications.unshift({
            id: `notif_acc_${resolvedId}_${Date.now()}`,
            kind: 'request_accepted',
            type: 'request_accepted',
            personId: resolvedId,
            name: fullName,
            firstName,
            username,
            initials,
            avatarClass,
            title: `You and ${firstName} are now friends`,
            detail: 'Now in your Friends',
            timeAgo: 'Just now',
            timestamp: currentNow.epochMs,
            unread: false,
            bucket: 'TODAY',
            canView: true
          });
        }

        invalidateSelectorsForChange({ ownerId: resolvedId });
        result = {
          ok: true,
          toast: `You and ${firstName} are now friends`
        };
        break;
      }

      case 'DECLINE_FRIEND_REQUEST': {
        pushUndoSnapshot('DECLINE_FRIEND_REQUEST', _state);
        const personId = payload.personId;
        const req =
          _state.incomingRequests.find((r) => r.id === personId || r.personId === personId) ||
          _state.notifications.find((n) => n.personId === personId);
        const resolvedId = req?.personId || req?.id || personId;
        const name = req?.firstName || req?.name || 'Request';

        _state.incomingRequests = _state.incomingRequests.filter(
          (r) => r.id !== resolvedId && r.personId !== resolvedId && r.id !== personId
        );
        _state.notifications = _state.notifications.filter(
          (n) => !(n.personId === resolvedId && n.kind === 'friend_request')
        );

        result = {
          ok: true,
          toast: `Declined request from ${name}`,
          canUndo: true
        };
        break;
      }

      case 'REMOVE_FRIEND': {
        pushUndoSnapshot('REMOVE_FRIEND', _state);
        const friendId = payload.friendId || _state.ui.targetFriendIdForDialog;
        const friend = _state.friends.find((f) => f.id === friendId);
        const name = friend?.firstName || friend?.name || 'Friend';

        _state.friends = _state.friends.filter((f) => f.id !== friendId);
        for (const group of _state.groups) {
          group.memberIds = group.memberIds.filter((id) => id !== friendId);
        }
        _state.ui.overlapParticipantIds = (_state.ui.overlapParticipantIds || []).filter((id) => id !== friendId);
        if (_state.ui.overlapParticipantIds.length < 2 && _state.friends.length > 0) {
          _state.ui.overlapParticipantIds.push(_state.friends[0].id);
        }

        invalidateSelectorsForChange({ ownerId: friendId });
        result = {
          ok: true,
          toast: `Removed ${name}`,
          canUndo: true
        };
        break;
      }

      case 'BLOCK_USER': {
        pushUndoSnapshot('BLOCK_USER', _state);
        const target = payload.user || _state.ui.targetUserForBlock || {};
        const personId = payload.personId || target.id || 'marco';

        const existingFriend = _state.friends.find((f) => f.id === personId);
        const existingIn = _state.incomingRequests.find((r) => r.id === personId || r.personId === personId);
        const existingOut = _state.outgoingRequests.find((r) => r.id === personId);
        const existingDir = (_state.directoryPeople || []).find((d) => d.id === personId);

        const blockedEntry = {
          id: personId,
          firstName:
            existingFriend?.firstName ||
            existingIn?.firstName ||
            existingOut?.firstName ||
            existingDir?.firstName ||
            (target.name || 'Marco').split(' ')[0],
          name:
            existingFriend?.name ||
            existingIn?.name ||
            existingOut?.name ||
            existingDir?.name ||
            target.name ||
            'Marco',
          username:
            existingFriend?.username ||
            existingIn?.username ||
            existingOut?.username ||
            existingDir?.username ||
            target.username ||
            'marco',
          initials:
            existingFriend?.initials ||
            existingIn?.initials ||
            existingOut?.initials ||
            existingDir?.initials ||
            target.initials ||
            'MA',
          avatarClass:
            existingFriend?.avatarClass ||
            existingIn?.avatarClass ||
            existingOut?.avatarClass ||
            existingDir?.avatarClass ||
            target.avatarClass ||
            'av-lavender',
          previousRelationship: existingFriend ? 'friends' : existingIn ? 'incoming_pending' : 'none',
          previousFriendData: existingFriend ? cloneState(existingFriend) : null
        };

        _state.friends = _state.friends.filter((f) => f.id !== personId);
        _state.incomingRequests = _state.incomingRequests.filter(
          (r) => r.id !== personId && r.personId !== personId
        );
        _state.outgoingRequests = _state.outgoingRequests.filter((r) => r.id !== personId);
        _state.connectedRequestCards = _state.connectedRequestCards.filter((c) => c.personId !== personId);
        _state.notifications = _state.notifications.filter((n) => n.personId !== personId);
        for (const group of _state.groups) {
          group.memberIds = group.memberIds.filter((id) => id !== personId);
        }
        if (!_state.blockedPeople.some((b) => b.id === personId)) {
          _state.blockedPeople.push(blockedEntry);
        }

        invalidateSelectorsForChange({ ownerId: personId });
        result = {
          ok: true,
          toast: `Blocked @${blockedEntry.username}`,
          canUndo: true
        };
        break;
      }

      case 'UNBLOCK_USER': {
        const personId = payload.personId;
        const blocked = _state.blockedPeople.find((b) => b.id === personId);
        _state.blockedPeople = _state.blockedPeople.filter((b) => b.id !== personId);
        if (blocked && !_state.directoryPeople.some((d) => d.id === blocked.id)) {
          _state.directoryPeople.push({
            id: blocked.id,
            firstName: blocked.firstName,
            lastName: '',
            name: blocked.name,
            username: blocked.username,
            initials: blocked.initials,
            avatarClass: blocked.avatarClass,
            mutualCount: 0,
            mutualText: 'No mutual friends',
            relationship: 'none',
            entries: []
          });
        }
        result = {
          ok: true,
          toast: blocked ? `Unblocked @${blocked.username}` : 'User unblocked'
        };
        break;
      }

      /* --------------------------------------------------------------------
         Groups CRUD
         -------------------------------------------------------------------- */
      case 'CREATE_OR_UPDATE_GROUP': {
        const mode = payload.mode || _state.ui.groupFormMode || 'create';
        const selectedIds = Object.entries(_state.ui.groupFormMembers || {})
          .filter(([, checked]) => Boolean(checked))
          .map(([id]) => id);

        if (mode === 'add-members') {
          const group = _state.groups.find((g) => g.id === _state.ui.activeGroupId);
          if (!group) return { ok: false };
          group.memberIds = Array.from(new Set([...group.memberIds, ...selectedIds]));
          _state.ui.groupFormDirty = false;
          result = {
            ok: true,
            mode: 'add-members',
            groupId: group.id,
            toast: `Updated ${group.name}`
          };
        } else {
          const name = payload.name !== undefined ? payload.name : _state.ui.groupFormName;
          const validation = validateGroupName(name, _state.groups, null);
          if (!validation.valid) {
            return { ok: false, error: validation.error };
          }
          const cleanName = validation.cleanName;
          const id = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '_') + '_' + Date.now().toString().slice(-3);
          const words = cleanName.split(/\s+/);
          const initials =
            words.length > 1
              ? (words[0][0] + words[1][0]).toUpperCase()
              : cleanName.slice(0, 2).toUpperCase();

          const newGroup = {
            id,
            name: cleanName,
            initials,
            avatarClass: 'av-mint',
            colorClass: 'av-mint',
            memberIds: selectedIds,
            notificationsEnabled: true
          };
          _state.groups.push(newGroup);
          _state.ui.activeGroupId = id;
          _state.ui.selectedGroupId = id;
          _state.ui.groupFormDirty = false;
          result = {
            ok: true,
            mode: 'create',
            groupId: id,
            toast: `Created ${cleanName}`
          };
        }
        break;
      }

      case 'RENAME_GROUP': {
        const groupId = payload.groupId || _state.ui.activeGroupId;
        const newName = payload.name !== undefined ? payload.name : _state.ui.renameGroupFormName;
        const validation = validateGroupName(newName, _state.groups, groupId);
        if (!validation.valid) {
          return { ok: false, error: validation.error };
        }
        const group = _state.groups.find((g) => g.id === groupId);
        if (!group) return { ok: false, error: 'Group not found' };
        group.name = validation.cleanName;
        const words = validation.cleanName.split(/\s+/);
        group.initials =
          words.length > 1
            ? (words[0][0] + words[1][0]).toUpperCase()
            : validation.cleanName.slice(0, 2).toUpperCase();
        result = {
          ok: true,
          toast: `Renamed to ${group.name}`
        };
        break;
      }

      case 'DELETE_GROUP': {
        const groupId = payload.groupId || _state.ui.activeGroupId;
        const group = _state.groups.find((g) => g.id === groupId);
        _state.groups = _state.groups.filter((g) => g.id !== groupId);
        if (_state.ui.activeGroupId === groupId) {
          _state.ui.activeGroupId = _state.groups[0]?.id || null;
        }
        if (_state.ui.nowGroupFilter && group && _state.ui.nowGroupFilter.toLowerCase() === group.name.toLowerCase()) {
          _state.ui.nowGroupFilter = 'All';
        }
        result = {
          ok: true,
          toast: group ? `Deleted ${group.name}` : 'Group deleted'
        };
        break;
      }

      case 'REMOVE_MEMBER_FROM_GROUP': {
        pushUndoSnapshot('REMOVE_MEMBER_FROM_GROUP', _state);
        const groupId = payload.groupId || _state.ui.activeGroupId;
        const memberId = payload.memberId;
        const group = _state.groups.find((g) => g.id === groupId);
        const friend = _state.friends.find((f) => f.id === memberId);
        if (group) {
          group.memberIds = group.memberIds.filter((id) => id !== memberId);
        }
        result = {
          ok: true,
          toast: `Removed ${friend?.firstName || 'member'} from ${group?.name || 'group'}`,
          canUndo: true
        };
        break;
      }

      case 'ADD_FRIEND_TO_GROUP': {
        const { friendId, groupId } = payload;
        const group = _state.groups.find((g) => g.id === groupId);
        const friend = _state.friends.find((f) => f.id === friendId);
        if (group && friend && !group.memberIds.includes(friendId)) {
          group.memberIds.push(friendId);
        }
        result = {
          ok: true,
          toast: `Added ${friend?.firstName || 'friend'} to ${group?.name || 'group'}`
        };
        break;
      }

      /* --------------------------------------------------------------------
         Classes Form UI Setup & OCR Draft Reset
         -------------------------------------------------------------------- */
      case 'OPEN_CLASS_FORM': {
        const mode = payload.mode || 'add';
        const returnTo = payload.returnTo || '8';
        _state.ui.classFormMode = mode;
        _state.ui.classFormReturnTo = returnTo;
        _state.ui.classFormDirty = false;

        if (mode === 'edit' && payload.classId) {
          const entry = _state.user.entries.find((e) => e.id === payload.classId);
          if (entry) {
            _state.ui.editingClassId = entry.id;
            const daysList = Array.isArray(entry.days)
              ? [...entry.days]
              : typeof entry.day === 'number'
              ? [entry.day]
              : [1];
            _state.ui.classForm = {
              activity: entry.short || entry.title || entry.code,
              room: entry.detail || entry.room || '',
              days: daysList,
              starts: minutesToTimeInput(entry.start),
              ends: minutesToTimeInput(entry.end),
              repeat: entry.repeat || 'weekly',
              notes: entry.notes || ''
            };
          }
        } else if (mode === 'edit-import-row' && payload.draftId) {
          const draft = (_state.ocrDrafts || []).find((d) => d.id === payload.draftId);
          if (draft) {
            _state.ui.editingClassId = draft.id;
            _state.ui.classForm = {
              activity: draft.short || draft.title || draft.code,
              room: draft.detail || draft.room || '',
              days: [...(draft.days || [4])],
              starts: minutesToTimeInput(draft.start),
              ends: minutesToTimeInput(draft.end),
              repeat: draft.repeat || 'weekly',
              notes: draft.notes || ''
            };
          }
        } else {
          _state.ui.editingClassId = null;
          const startMins = typeof payload.start === 'number' ? payload.start : 15 * 60;
          const endMins = typeof payload.end === 'number' ? payload.end : startMins + 90;
          const days = Array.isArray(payload.days)
            ? payload.days
            : [typeof payload.dayIndex === 'number' ? payload.dayIndex : 0];
          _state.ui.classForm = {
            activity: payload.activity !== undefined ? payload.activity : 'ITEC309 (ZT32Am)',
            room: payload.room !== undefined ? payload.room : 'ZT32Am',
            days,
            starts: minutesToTimeInput(startMins),
            ends: minutesToTimeInput(endMins),
            repeat: 'weekly',
            notes: ''
          };
        }
        break;
      }

      case 'RESET_OCR_DRAFTS': {
        _state.ocrDrafts = createDefaultOcrDrafts();
        break;
      }

      /* --------------------------------------------------------------------
         Notifications & Inbox
         -------------------------------------------------------------------- */
      case 'MARK_ALL_NOTIFICATIONS_READ': {
        for (const n of _state.notifications) {
          n.unread = false;
        }
        for (const r of _state.incomingRequests) {
          r.unread = false;
        }
        result = { ok: true, toast: 'All notifications marked read' };
        break;
      }

      case 'MARK_NOTIFICATION_READ': {
        const notif = _state.notifications.find((n) => n.id === payload.notificationId);
        if (notif) notif.unread = false;
        break;
      }

      case 'TOGGLE_NOTIFICATION_SETTING': {
        const { key, groupId } = payload;
        if (groupId) {
          const g = _state.groups.find((gr) => gr.id === groupId);
          if (g) {
            g.notificationsEnabled = !g.notificationsEnabled;
            result = { ok: true, toast: `${g.name} alerts ${g.notificationsEnabled ? 'on' : 'off'}` };
          }
        } else if (key && key in _state.notificationSettings) {
          _state.notificationSettings[key] = !_state.notificationSettings[key];
          result = { ok: true, toast: 'Notification preference saved' };
        }
        break;
      }

      /* --------------------------------------------------------------------
         Privacy & Share Links
         -------------------------------------------------------------------- */
      case 'SET_GLOBAL_AUDIENCE': {
        const audience = payload.audience;
        _state.user.privacyConfig.globalAudience = audience;
        _state.privacyRev = (_state.privacyRev || 1) + 1;
        const labels = {
          only_me: 'Only me',
          friends: 'Friends (free or busy)',
          selected: 'Selected friends'
        };
        result = {
          ok: true,
          toast: `Visibility saved: ${labels[audience] || audience}`
        };
        break;
      }

      case 'SET_ACCESS_RULE': {
        const { targetType, targetId, level } = payload;
        const normalized = PRIVACY_LEVELS_SET.has(level) ? level : labelToPrivacyLevel(level);
        if (targetType === 'group') {
          _state.user.privacyConfig.groupRules[targetId] = normalized;
        } else {
          _state.user.privacyConfig.personOverrides[targetId] = normalized;
        }
        _state.privacyRev = (_state.privacyRev || 1) + 1;
        result = {
          ok: true,
          toast: `Access updated to ${privacyLevelToLabel(normalized)}`
        };
        break;
      }

      case 'CREATE_SHARE_LINK': {
        const cfg = { ..._state.ui.shareSheetConfig, ...payload };
        const expiryDays = Number(cfg.expiryDays) || 6;
        const randomDigits = Math.floor(1000 + Math.random() * 9000);
        const id = `${_state.user.username}_${randomDigits}`;
        const expiresAt = currentNow.epochMs + expiryDays * 86400000;
        const expiresLabel = `${expiryDays} ${expiryDays === 1 ? 'day' : 'days'} left`;

        const newLink = {
          id,
          ownerId: _state.user.id,
          url: `cnufree.com/s/${id}`,
          audience: cfg.audience || 'free_busy',
          mode: cfg.audience || 'free_busy',
          hoursStart: parseTimeInputToMinutes(cfg.hoursStart || '09:00') || 540,
          hoursEnd: parseTimeInputToMinutes(cfg.hoursEnd || '17:00') || 1020,
          createdAt: currentNow.epochMs,
          expiresAt,
          expiryDays,
          expiresLabel,
          revoked: false
        };
        _state.shareLinks.unshift(newLink);
        _state.ui.activeShareLinkId = id;
        result = {
          ok: true,
          link: newLink,
          url: `https://cnufree.com/s/${id}`,
          toast: 'Share link created & copied'
        };
        break;
      }

      case 'REVOKE_SHARE_LINK': {
        const linkId = payload.linkId || _state.ui.activeShareLinkId;
        const link = _state.shareLinks.find((l) => l.id === linkId);
        if (link) {
          link.revoked = true;
        }
        result = {
          ok: true,
          toast: 'Share link revoked'
        };
        break;
      }

      case 'DELETE_EXPIRED_SHARE_LINK': {
        const linkId = payload.linkId;
        _state.shareLinks = _state.shareLinks.filter((l) => l.id !== linkId);
        result = {
          ok: true,
          toast: 'Expired link deleted'
        };
        break;
      }

      /* --------------------------------------------------------------------
         Profile & Avatar Color Editing
         -------------------------------------------------------------------- */
      case 'SAVE_PROFILE': {
        const form = { ..._state.ui.editProfileForm, ...payload };
        const check = validateProfileForm(form, _state.user);
        if (!check.valid) {
          return { ok: false, errors: check.errors };
        }
        const firstName = String(form.firstName || '').trim();
        const lastName = String(form.lastName || '').trim();
        const username = check.usernameCheck.normalized;
        const fullName = lastName ? `${firstName} ${lastName}` : firstName;
        const initials = ((firstName[0] || 'F') + (lastName[0] || firstName[1] || 'R')).toUpperCase();

        _state.user.firstName = firstName;
        _state.user.lastName = lastName;
        _state.user.name = fullName;
        _state.user.username = username;
        _state.user.initials = initials;
        _state.user.shortInitial = firstName[0].toUpperCase();
        if (form.avatarClass) {
          _state.user.avatarClass = form.avatarClass;
        }
        _state.ui.editProfileForm = {
          firstName,
          lastName,
          username
        };
        result = {
          ok: true,
          toast: 'Profile saved'
        };
        break;
      }

      case 'CYCLE_AVATAR_COLOR': {
        const palette = ['av-ink', 'av-peach', 'av-mint', 'av-gold', 'av-lavender'];
        const nextClass =
          payload.avatarClass || palette[(palette.indexOf(_state.user.avatarClass) + 1) % palette.length];
        _state.user.avatarClass = nextClass;
        result = { ok: true, avatarClass: nextClass };
        break;
      }

      default:
        break;
    }

    persistStateBeforeEmit(_state);
    notifyListeners();
    return result;
  },

  resetToSeed() {
    return this.dispatch('RESET_SEED', {});
  }
};
