/**
 * CNU Free — Form & Schedule Validators (SPEC V2 §4.6 + Addendum B)
 */

import { parseTimeToMinutes, formatRange, parseScheduleTitle } from './time.js';

export const RESERVED_USERNAMES = new Set(['admin', 'support', 'help', 'settings', 'cnufree', 'root']);
export const TAKEN_USERNAMES = new Set([
  'gian',
  'franzen',
  'thea',
  'hershey',
  'ella',
  'dane',
  'danica',
  'gelie',
  'luanne',
  'jellah',
  'kristine',
  'marco',
  'mika',
  'paolo'
]);

/**
 * Validate class / activity entry (Screen 9)
 */
export function validateClassEntry(draft, existingEntries = []) {
  const errors = {};
  const rawTitle = (draft.title ?? draft.activity ?? '').trim();
  if (!rawTitle) {
    errors.title = 'Enter a class or activity name';
  }

  const repeat = draft.repeat || 'weekly';
  const days = Array.isArray(draft.days)
    ? draft.days
    : typeof draft.day === 'number'
    ? [draft.day]
    : [];
  if (repeat === 'weekly' && days.length === 0) {
    errors.days = 'Pick at least one day';
  }

  const startMin =
    typeof draft.start === 'number' ? draft.start : parseTimeToMinutes(draft.start || draft.starts);
  const endMin =
    typeof draft.end === 'number' ? draft.end : parseTimeToMinutes(draft.end || draft.ends);

  if (Number.isNaN(startMin) || Number.isNaN(endMin)) {
    errors.end = 'Enter valid start and end times';
  } else if (endMin <= startMin) {
    errors.end = 'End time must be after start time';
  } else if (endMin - startMin < 15) {
    errors.end = 'Class must be at least 15 minutes long';
  }

  if (!errors.end && !errors.days && days.length > 0) {
    let conflict = null;
    for (const existing of existingEntries) {
      if (draft.id && existing.id === draft.id) continue;
      if (Array.isArray(draft.sourceEntryIds) && draft.sourceEntryIds.includes(existing.id)) continue;

      const existingDays = Array.isArray(existing.days)
        ? existing.days
        : typeof existing.day === 'number'
        ? [existing.day]
        : [];
      const sharesDay = existingDays.some((d) => days.includes(d));
      if (!sharesDay) continue;

      if (startMin < existing.end && endMin > existing.start) {
        conflict = existing;
        break;
      }
    }

    if (conflict) {
      const label = conflict.short || conflict.code || parseScheduleTitle(conflict.title).short || conflict.title;
      errors.overlap = `Overlaps ${label} (${formatRange(conflict.start, conflict.end)})`;
    }
  }

  const valid = Object.keys(errors).length === 0;
  return {
    valid,
    isValid: valid,
    errors,
    endError: errors.end || null,
    overlapError: errors.overlap || null,
    daysError: errors.days || null,
    titleError: errors.title || null,
    parsedStart: startMin,
    parsedEnd: endMin,
    parsed: {
      startMins: startMin,
      endMins: endMin
    }
  };
}

/**
 * Validate username (Screen 16 Edit Profile)
 */
export function validateUsername(rawUsername, currentUserUsername = 'francis') {
  const currentUsernameStr =
    typeof currentUserUsername === 'object' && currentUserUsername !== null
      ? currentUserUsername.username || 'francis'
      : String(currentUserUsername || 'francis');
  const cleaned = (rawUsername || '').trim().replace(/^@/, '');
  const lower = cleaned.toLowerCase();

  if (lower.length < 3 || lower.length > 20) {
    return {
      valid: false,
      isValid: false,
      error: 'Username must be 3–20 characters',
      suggestion: 'francis.cnu',
      normalized: lower
    };
  }

  if (!/^[a-z0-9._]+$/.test(lower)) {
    return {
      valid: false,
      isValid: false,
      error: 'Use only lowercase letters, numbers, dots, or underscores',
      suggestion: 'francis.cnu',
      normalized: lower
    };
  }

  if (RESERVED_USERNAMES.has(lower)) {
    return {
      valid: false,
      isValid: false,
      error: `@${lower} is reserved — try @francis.cnu`,
      suggestion: 'francis.cnu',
      normalized: lower
    };
  }

  if (lower !== currentUsernameStr.toLowerCase() && TAKEN_USERNAMES.has(lower)) {
    const suggestion = lower === 'francis' ? 'francis.cnu' : `${lower}.cnu`;
    return {
      valid: false,
      isValid: false,
      error: `@${lower} is taken — try @${suggestion}`,
      suggestion,
      normalized: lower
    };
  }

  // Also flag 'francis' as taken if testing taken-username explicitly via validateUsername('francis_taken') or when currentUserUsername differs
  if (lower === 'francis' && currentUsernameStr.toLowerCase() !== 'francis') {
    return {
      valid: false,
      isValid: false,
      error: '@francis is taken — try @francis.cnu',
      suggestion: 'francis.cnu',
      normalized: lower
    };
  }

  return {
    valid: true,
    isValid: true,
    error: null,
    suggestion: null,
    normalized: lower
  };
}

export function validateProfileForm(form = {}, currentUser = 'francis') {
  const firstName = (form.firstName ?? form.name ?? '').trim();
  const nameError = firstName ? null : 'Display name is required';
  const currentUsername = typeof currentUser === 'object' ? currentUser?.username : currentUser;
  const usernameRes = validateUsername(form.username, currentUsername);
  const valid = !nameError && usernameRes.valid;
  return {
    valid,
    canSave: valid,
    errors: {
      firstName: nameError,
      username: usernameRes.error
    },
    usernameCheck: usernameRes,
    nameError,
    usernameError: usernameRes.error,
    suggestion: usernameRes.suggestion
  };
}

export function validateAuthForm(form = {}, explicitMode = null) {
  const mode = explicitMode || form.mode || 'signin';
  const firstName = (form.firstName ?? form.name ?? '').trim();
  const username = (form.username ?? '').trim().replace(/^@/, '');
  const emailTrimmed = (form.email ?? '').trim();
  const password = form.password ?? '';

  const errors = {};
  if (mode === 'create' && !firstName) {
    errors.firstName = 'Enter your name';
    errors.name = 'Enter your name';
  }
  if (emailTrimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrimmed)) {
    errors.email = 'Enter a valid university or personal email';
  } else if (!emailTrimmed && !username) {
    errors.username = 'Enter your username or email';
    errors.email = 'Enter your username or email';
  }
  if (!password || password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  }
  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

export function validateGroupName(name, existingGroups = [], excludeGroupId = null) {
  const trimmed = (name || '').trim();
  if (!trimmed) {
    return { valid: false, error: 'Enter a group name', trimmed: '', cleanName: '' };
  }
  if (trimmed.length < 2) {
    return { valid: false, error: 'Group name must be at least 2 characters', trimmed, cleanName: trimmed };
  }
  if (trimmed.length > 24) {
    return { valid: false, error: 'Group name must be 24 characters or fewer', trimmed, cleanName: trimmed };
  }
  if (Array.isArray(existingGroups)) {
    const dup = existingGroups.find(
      (g) => g.id !== excludeGroupId && g.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (dup) {
      return { valid: false, error: 'A group with this name already exists', trimmed, cleanName: trimmed };
    }
  }
  return { valid: true, error: null, trimmed, cleanName: trimmed };
}

/**
 * Validates proposal creation input parameters (P1 Fix #9).
 */
export function validateProposalInput(payload = {}, existingFriendIds = []) {
  const { windowStart, windowEnd, dayIndex, participantIds } = payload;
  if (typeof windowStart !== 'number' || typeof windowEnd !== 'number') {
    return { valid: false, error: 'Start and end time must be numbers' };
  }
  if (windowStart < 420 || windowEnd > 1260) {
    return { valid: false, error: 'Proposed time must be within 7:00 AM – 9:00 PM' };
  }
  if (windowEnd - windowStart < 15) {
    return { valid: false, error: 'Proposed window must be at least 15 minutes' };
  }
  if (typeof dayIndex !== 'number' || dayIndex < 0 || dayIndex > 6) {
    return { valid: false, error: 'Invalid day of the week' };
  }
  if (!Array.isArray(participantIds) || participantIds.length === 0) {
    return { valid: false, error: 'Participant list cannot be empty' };
  }
  if (Array.isArray(existingFriendIds) && existingFriendIds.length > 0) {
    const invalidFriend = participantIds.find(
      (id) => id !== 'francis' && id !== 'self' && !existingFriendIds.includes(id)
    );
    if (invalidFriend) {
      return { valid: false, error: `Invalid participant ID: "${invalidFriend}"` };
    }
  }
  return { valid: true, error: null };
}

/**
 * Validates share link generation configuration (P1 Fix #9).
 */
export function validateShareLinkConfig(config = {}) {
  const validAudiences = ['full', 'free_busy', 'free_only', 'busy_only'];
  const audience = config.audience || 'free_busy';
  if (!validAudiences.includes(audience)) {
    return { valid: false, error: `Invalid audience mode: ${audience}` };
  }
  const expiryDays = Number(config.expiryDays);
  if (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 30) {
    return { valid: false, error: 'Expiry must be between 1 and 30 days' };
  }
  const start = typeof config.hoursStart === 'number' ? config.hoursStart : 540;
  const end = typeof config.hoursEnd === 'number' ? config.hoursEnd : 1020;
  if (start >= end) {
    return { valid: false, error: 'Share hours start time must be before end time' };
  }
  return { valid: true, error: null };
}

/**
 * Validates access rule input parameters (P1 Fix #9).
 */
export function validateAccessRuleInput(payload = {}, validPersonIds = [], validGroupIds = []) {
  const { targetType, targetId, level } = payload;
  const validLevels = ['full', 'free_busy', 'free_only', 'busy_only', 'none'];
  if (!validLevels.includes(level)) {
    return { valid: false, error: `Invalid access level: ${level}` };
  }
  if (targetType !== 'person' && targetType !== 'group') {
    return { valid: false, error: 'Target type must be "person" or "group"' };
  }
  if (!targetId || typeof targetId !== 'string') {
    return { valid: false, error: 'Target ID is required' };
  }
  if (targetType === 'person' && validPersonIds.length > 0 && !validPersonIds.includes(targetId)) {
    return { valid: false, error: `Person ID not found: "${targetId}"` };
  }
  if (targetType === 'group' && validGroupIds.length > 0 && !validGroupIds.includes(targetId)) {
    return { valid: false, error: `Group ID not found: "${targetId}"` };
  }
  return { valid: true, error: null };
}
