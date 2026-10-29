/**
 * CNU Free — Privacy Resolver (SPEC V2 §4.4 + Addendum B)
 * - Levels per viewer: 'none' | 'busy_only' | 'free_only' | 'free_busy' | 'full'
 * - Resolution order: per-person override > group rule > global audience
 * - Global audience: only_me -> 'none'; friends -> 'free_busy'; selected -> 'none' unless listed
 */

export const PRIVACY_LEVELS = ['none', 'busy_only', 'free_only', 'free_busy', 'full'];

const LEVEL_RANK = {
  none: 0,
  busy_only: 1,
  free_only: 2,
  free_busy: 3,
  full: 4
};

export const PRIVACY_LABELS = {
  full: 'Full view',
  free_busy: 'Free or busy only',
  free_only: 'Free only',
  busy_only: 'Busy only',
  none: 'Not shared'
};

export function labelToPrivacyLevel(label) {
  if (!label) return 'none';
  const l = label.toLowerCase().trim();
  if (l === 'full' || l === 'full view' || l === 'full schedule') return 'full';
  if (l === 'free_busy' || l === 'free or busy only' || l === 'free or busy') return 'free_busy';
  if (l === 'free_only' || l === 'free only') return 'free_only';
  if (l === 'busy_only' || l === 'busy only') return 'busy_only';
  return 'none';
}

export function privacyLevelToLabel(level) {
  return PRIVACY_LABELS[level] || 'Not shared';
}

/**
 * Resolves what `viewerId` is allowed to see of `owner`'s schedule.
 */
export function resolvePrivacyLevel(owner, viewerId = 'francis', groups = []) {
  if (!owner) return 'none';
  if (owner.id === viewerId || owner.username === viewerId || viewerId === 'self') {
    return 'full';
  }

  const config = owner.privacyConfig || owner.privacy;
  if (config) {
    const {
      globalAudience = 'friends',
      personOverrides = {},
      groupRules = {},
      isFriend = true
    } = config;

    // 1. Per-person override takes highest precedence
    if (viewerId && Object.prototype.hasOwnProperty.call(personOverrides, viewerId)) {
      const override = personOverrides[viewerId];
      if (override) return override;
    }

    // 2. Group rule takes second precedence
    const ownerGroups = groups.length ? groups : owner.groups || [];
    const matchingGroupLevels = [];
    for (const grp of ownerGroups) {
      const members = grp.memberIds || [];
      if (members.includes(viewerId)) {
        const ruleCfg = groupRules[grp.id];
        if (typeof ruleCfg === 'string') {
          matchingGroupLevels.push(ruleCfg);
        } else if (ruleCfg && typeof ruleCfg === 'object') {
          if (ruleCfg.enabled !== false && ruleCfg.level) {
            matchingGroupLevels.push(ruleCfg.level);
          } else if (ruleCfg.enabled === false) {
            matchingGroupLevels.push('none');
          }
        } else if (grp.shareEnabled !== false && grp.rule) {
          matchingGroupLevels.push(grp.rule);
        }
      }
    }
    if (matchingGroupLevels.length > 0) {
      matchingGroupLevels.sort((a, b) => (LEVEL_RANK[b] ?? 0) - (LEVEL_RANK[a] ?? 0));
      return matchingGroupLevels[0];
    }

    // 3. Global audience fallback
    if (globalAudience === 'only_me') return 'none';
    if (globalAudience === 'selected') return 'none';
    if (globalAudience === 'friends') {
      return isFriend ? 'free_busy' : 'none';
    }
    return 'none';
  }

  if (owner.shareLevelToUser === 'private' || owner.shareLevelToUser === 'none') {
    return 'none';
  }
  if (owner.sharesWithViewer) {
    return owner.sharesWithViewer;
  }
  if (owner.shareLevel) {
    return owner.shareLevel;
  }
  if (owner.isPrivate) {
    return 'none';
  }
  return 'full';
}

export const resolvePrivacy = resolvePrivacyLevel;
export const canSee = resolvePrivacyLevel;

export function formatEntryForPrivacy(entry, level) {
  if (level === 'none' || level === 'free_only') return null;
  if (level === 'full') {
    const shortTitle = entry.short || entry.code || entry.title || 'Busy';
    const detailRoom = entry.detail !== undefined ? entry.detail : entry.room || '';
    return {
      title: shortTitle,
      fullLabel: detailRoom ? `${shortTitle} · ${detailRoom}` : shortTitle,
      codeAndRoom: detailRoom ? `${shortTitle} · ${detailRoom}` : shortTitle,
      room: detailRoom,
      showDetails: true
    };
  }
  return {
    title: 'Busy',
    fullLabel: 'Busy',
    codeAndRoom: 'Busy',
    room: '',
    showDetails: false
  };
}
