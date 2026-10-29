/**
 * CNU Free — Seed State & Roster Parser (SPEC V2 Addendum B)
 * - Generates all 146 schedule entries from the verbatim Section 5 roster.
 * - Provides createSeedState() ("demo" mode, default) and createCleanState() ("clean" mode).
 * - Zero references to any legacy V1 sample people.
 */

import { parseScheduleTitle, parseTimeToMinutes } from './time.js';
import { createDefaultOcrDrafts } from './ocr-mock.js';

export const SCHEMA_VERSION = 3;

const AVATAR_PALETTE = ['av-peach', 'av-mint', 'av-gold', 'av-lavender'];

export function avatarClassFromName(name) {
  const s = String(name || '');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

export const ROSTER_SOURCE_TEXT = `JOHN PAUL (you)
Mon 09:00-10:30 | ITEC307 (ZT33Am)
Mon 12:00-13:30 | ITMC311 (ZT31Am)
Mon 13:30-15:00 | Christian Moral Paradigm (THEN102) (N2Am)
Tue 08:00-09:00 | ITMC311 (ZT31Am)
Tue 09:00-10:30 | Philosophy of Religion (PHIN103) (N6Am)
Tue 13:30-15:00 | ICSE046 (N1Am)
Tue 16:30-18:00 | ITMC233 (ZT31Am)
Tue 18:00-19:30 | ITMC312 (ZT32Am)
Wed 09:00-10:30 | ITEC307 (ZT33Am)
Wed 12:00-13:30 | ITMC311 (ZT31Am)
Wed 13:30-15:00 | Christian Moral Paradigm (THEN102) (N2Am)
Thu 08:00-09:00 | ITMC311 (ZT31Am)
Thu 09:00-10:30 | Philosophy of Religion (PHIN103) (N6Am)
Thu 13:30-15:00 | ICSE046 (N1Am)
Thu 16:30-18:00 | ITMC233 (ZT31Am)
Thu 18:00-19:30 | ITMC312 (ZT32Am)
Fri 08:00-11:00 | ITMC314 (ZT33Am)
GIAN
Mon 09:00-10:30 | Introduction to the Catholic Faith (THEN100)
Mon 10:30-12:00 | Algorithms and Data Structures (CSDC103) (Lecture)
Mon 13:30-15:00 | Information Management (CSDC104) (Lecture)
Mon 15:00-16:30 | Theory of Probability (MTHC272)
Mon 18:00-19:30 | College Reading Program 2 (CRCP102)
Tue 09:00-10:30 | Art Appreciation (SOCS101)
Tue 12:00-13:30 | Philosophical Anthropology (PHIN102)
Tue 13:30-15:00 | Discrete Structures 1 (CSMC111)
Tue 15:00-16:30 | Object-Oriented Programming and Design (CSMC211)
Wed 09:00-10:30 | Introduction to the Catholic Faith (THEN100)
Wed 10:30-12:00 | Algorithms and Data Structures (CSDC103) (Lecture)
Wed 13:30-15:00 | Information Management (CSDC104) (Lecture)
Wed 15:00-16:30 | Theory of Probability (MTHC272)
Wed 18:00-19:30 | College Reading Program 2 (CRCP102)
Thu 09:00-10:30 | Art Appreciation (SOCS101)
Thu 12:00-13:30 | Philosophical Anthropology (PHIN102)
Thu 13:30-15:00 | Discrete Structures 1 (CSMC111)
Thu 15:00-16:30 | Object-Oriented Programming and Design (CSMC211)
Thu 18:00-19:30 | ADNU Culture and Spirituality (CIFP101)
Fri 08:00-10:00 | Object-Oriented Programming and Design (CSMC211) (Lecture)
Fri 10:00-12:00 | Algorithms and Data Structures (CSDC103) (Laboratory)
Fri 13:00-15:00 | Information Management (CSDC104) (Laboratory)
Sat 08:00-10:00 | PATHFIT 3 (PFIT103)
FRANZEN
Tue 07:30-12:00 | Clinical Chemistry 1 (MT012-L2)
Tue 13:00-18:00 | Analysis of Urine and Body Fluids (MT014-L2)
Wed 07:30-12:00 | Clinical Chemistry 1 (MT012-L2)
Wed 13:00-17:00 | Introduction to Medical Laboratory Science Research (MT017-L2)
Thu 07:30-10:30 | Catechesis on Social Responsibility (RE105C-L2)
Thu 13:00-16:00 | Hematology 1 (MT015-L2)
Thu 17:00-20:00 | Clinical Bacteriology (MT013-L2)
Fri 13:00-16:00 | Hematology 1 (MT015-L2)
Sat 08:00-13:00 | Histopathologic & Cytologic Techniques (MT016-L2)
Sat 14:00-20:00 | Clinical Bacteriology (MT013-L2)
THEA and HERSHEY (identical)
Mon 10:30-12:30 | RE (SVP 23)
Tue 13:00-17:00 | MLS RESEARCH (SJW 102)
Tue 17:00-20:30 | C. BACTE (SJW 102)
Wed 10:30-12:30 | RE (SVP 23)
Wed 13:00-18:30 | AUBF (SVP 24)
Thu 09:00-12:30 | HEMA 1 (MT LAB 1)
Thu 13:00-18:30 | CC 1 (SJW 101)
Fri 09:00-12:30 | HEMA 1 (MT LAB 1)
Fri 13:00-18:30 | CC 1 (SJW 101)
Sat 07:30-14:00 | C. BACTE (SJW 102)
Sat 14:30-19:30 | HISTOPATH AND CYTO (MT LAB 1)
ELLA
Mon 07:30-09:00 | Numerical1 (CENC317) (Lecture)
Mon 09:00-12:00 | Construction Materials and Testing (CENC315) (Lab)
Mon 13:30-16:30 | Construction Materials and Testing (CENG314) (Lecture)
Mon 19:30-21:00 | Highway and Railroad (CENG316)
Tue 10:30-12:00 | Christian Moral Paradigm (THEN102)
Tue 13:00-16:00 | Numerical Solution to CE Problems (CENG318) (Lab)
Tue 16:30-17:30 | Hydraulics (Lecture)
Tue 19:30-21:00 | Hydraulics (CENG319) (Lecture)
Wed 09:00-12:00 | Structural Theory (CENG311) (Lecture)
Wed 13:30-16:30 | Hydraulics (CENG320) (Lab)
Wed 19:30-21:00 | Highway and Railroad (CENG316)
Thu 10:30-12:00 | Christian Moral Paradigm (THEN102)
Thu 13:30-16:30 | Structural Theory Computation (CENG312)
Thu 19:30-21:00 | Hydraulics (CENG319) (Lecture)
Fri 13:00-15:00 | Engineering Management (GEAL103)
DANE
Mon 09:00-10:30 | Integrative Methods in Teaching Social Science Disciplines in Basic Education (EDSS314)
Mon 10:30-12:00 | Production of Social Studies Instructional Materials (EDSS313)
Tue 09:00-10:30 | Philosophy of Religion (PHIN103)
Tue 10:30-12:00 | Building and Enhancing Literacy Skills Across the Curriculum (EDUM301)
Wed 09:00-10:30 | Integrative Methods in Teaching Social Science Disciplines in Basic Education (EDSS314)
Wed 10:30-12:00 | Production of Social Studies Instructional Materials (EDSS313)
Thu 09:00-10:30 | Philosophy of Religion (PHIN103)
Thu 10:30-12:00 | Building and Enhancing Literacy Skills Across the Curriculum (EDUM301)
Fri 18:00-21:00 | World History (EDSS311)
Sat 12:00-15:00 | Macroeconomics (EDSS315)
Sat 15:00-18:00 | Comparative Government and Politics (EDSS312) / Research in Social Studies (EDSS316)
DANICA
Mon 10:30-12:00 | 3D Dynamics (CGAM302)
Mon 15:00-16:30 | Programming (CGAF007)
Tue 07:30-09:00 | Visual Storytelling (CGAM103)
Tue 09:00-10:30 | Ethics (PHIS102)
Tue 12:00-15:00 | Background Design (CGAM204)
Wed 10:30-13:30 | 3D Dynamics (CGAM302)
Wed 15:00-16:30 | Programming (CGAF007)
Thu 07:30-09:00 | Visual Storytelling (CGAM103)
Thu 09:00-10:30 | Ethics (PHIS102)
Thu 12:00-14:00 | Background Design (CGAM204)
GELIE
Mon 09:00-10:30 | Philosophy of Religion (PHIN103)
Mon 13:00-15:00 | Care of Older Adult (NCMP114)
Mon 18:00-20:00 | Community Health Nursing 2 (NCMP113)
Tue 12:30-14:30 | Care of Clients with Problems in Oxygenation... (NCMP112)
Tue 18:00-19:00 | Contemporary Nursing Research 1 (NCMP111)
Wed 09:00-10:30 | Philosophy of Religion (PHIN103)
Wed 12:00-15:00 | Community Health Nursing 2 (NCMP113)
Wed 17:30-20:30 | Contemporary Nursing Research 1 (NCMP111)
Thu 07:30-09:30 | Care of Clients with Problems in Oxygenation... (NCMP112)
Thu 14:00-17:00 | Care of Older Adult (NCMP114)
Thu 18:00-19:00 | Contemporary Nursing Research 1 (NCMP111)
Fri 07:00-16:00 | Care of Clients with Problems in Oxygenation... (NCMP112)
Fri 18:00-20:00 | Care of Clients with Problems in Oxygenation... (NCMP112)
Sat 07:00-16:00 | Care of Clients with Problems in Oxygenation... (NCMP112)
Sat 18:00-20:00 | Care of Clients with Problems in Oxygenation... (NCMP112)
LUANNE
Mon 08:30-10:00 | GUIDANCE
Mon 10:00-13:00 | RT 19 RAD PATHO
Mon 13:00-19:00 | RT 14 POSITIONING I
Tue 07:00-12:00 | RT 20 QAQC
Tue 13:00-16:00 | RT 17 ADMIN. LEADER
Wed 07:30-10:30 | RE 105 CSR
Wed 17:00-20:00 | RT 21A RESEARCH
Thu 14:00-16:00 | RT 18 RAD PROTECTION
Thu 17:30-20:30 | RT 16 ULTRASONOG.
Sat 07:00-12:00 | RT 15 RAD CONTRAST
JELLAH
Mon 08:00-11:00 | NR-NUR 131 (Lab)
Mon 12:00-14:00 | NR-NUR 134 Care of Older Adult
Mon 15:00-18:00 | NR-NUR 135 Nursing Research 1 (Lab)
Tue 08:00-11:00 | NR-NUR 131
Tue 12:00-15:00 | NR-NUR 131
Tue 15:30-17:30 | NR-NUR 131
Wed 11:00-14:00 | NR-NUR 134 Care of Older Adult (Lab)
Wed 14:30-17:30 | NR-NUR 133 Community Health Nursing 2 (Lab)
Thu 07:00-19:00 | NR-NUR 131 (Lab)
Fri 07:00-19:00 | NR-NUR 131 (Lab)
Sat 08:00-10:00 | NR-NUR 135 Nursing Research 1
Sat 13:30-15:30 | NR-NUR 133 Community Health Nursing 2
Sat 16:00-19:00 | GE-WOR 101 The Contemporary World`;

const DAY_MAP = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6
};

const HEADER_TO_OWNERS = {
  'JOHN PAUL (you)': ['francis'],
  GIAN: ['gian'],
  FRANZEN: ['franzen'],
  'THEA and HERSHEY (identical)': ['thea', 'hershey'],
  ELLA: ['ella'],
  DANE: ['dane'],
  DANICA: ['danica'],
  GELIE: ['gelie'],
  LUANNE: ['luanne'],
  JELLAH: ['jellah']
};

export function parseRosterSource(sourceText = ROSTER_SOURCE_TEXT) {
  const byOwner = {
    francis: [],
    gian: [],
    franzen: [],
    thea: [],
    hershey: [],
    ella: [],
    dane: [],
    danica: [],
    gelie: [],
    luanne: [],
    jellah: []
  };

  let currentOwners = [];
  const counters = {};

  const lines = sourceText.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (HEADER_TO_OWNERS[line]) {
      currentOwners = HEADER_TO_OWNERS[line];
      continue;
    }

    const match = line.match(/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{2}:\d{2})-(\d{2}:\d{2})\s*\|\s*(.+)$/);
    if (!match || currentOwners.length === 0) continue;

    const [, dayStr, startStr, endStr, rawTitle] = match;
    const day = DAY_MAP[dayStr];
    const start = parseTimeToMinutes(startStr);
    const end = parseTimeToMinutes(endStr);
    const parsed = parseScheduleTitle(rawTitle);

    for (const ownerId of currentOwners) {
      counters[ownerId] = (counters[ownerId] || 0) + 1;
      const entry = {
        id: `${ownerId}-${counters[ownerId]}`,
        ownerId,
        title: parsed.title,
        short: parsed.short,
        detail: parsed.detail,
        day,
        dayIndex: day,
        days: [day],
        start,
        end,
        kind: 'class',
        source: 'seed',
        code: parsed.short,
        room: parsed.detail,
        repeat: 'weekly',
        notes: ''
      };
      byOwner[ownerId].push(entry);
    }
  }

  return byOwner;
}

export function getAllSeedEntries(state = createSeedState()) {
  const userEntries = state.user?.entries || [];
  const friendEntries = (state.friends || []).flatMap((f) => f.entries || []);
  return [...userEntries, ...friendEntries];
}

export function createSeedState() {
  const schedules = parseRosterSource(ROSTER_SOURCE_TEXT);

  const friendDefs = [
    { id: 'gian', name: 'Gian', firstName: 'Gian', username: 'gian', initials: 'GI', groupTag: 'Badminton' },
    { id: 'franzen', name: 'Franzen', firstName: 'Franzen', username: 'franzen', initials: 'FZ', groupTag: 'Kalbo' },
    { id: 'thea', name: 'Thea', firstName: 'Thea', username: 'thea', initials: 'TH', groupTag: 'Kalbo' },
    { id: 'hershey', name: 'Hershey', firstName: 'Hershey', username: 'hershey', initials: 'HE', groupTag: 'Kalbo' },
    { id: 'ella', name: 'Ella', firstName: 'Ella', username: 'ella', initials: 'EL', groupTag: 'Kalbo' },
    { id: 'dane', name: 'Dane', firstName: 'Dane', username: 'dane', initials: 'DA', groupTag: 'STEP' },
    { id: 'danica', name: 'Danica', firstName: 'Danica', username: 'danica', initials: 'DC', groupTag: 'Badminton' },
    { id: 'gelie', name: 'Gelie', firstName: 'Gelie', username: 'gelie', initials: 'GE', groupTag: 'Kalbo' },
    { id: 'luanne', name: 'Luanne', firstName: 'Luanne', username: 'luanne', initials: 'LU', groupTag: 'Kalbo' },
    { id: 'jellah', name: 'Jellah', firstName: 'Jellah', username: 'jellah', initials: 'JE', groupTag: 'Kalbo' }
  ];

  const friends = friendDefs.map((f) => ({
    ...f,
    lastName: '',
    shortName: f.name,
    shortInitial: f.initials[0],
    avatarClass: avatarClassFromName(f.name),
    shareLevel: 'full',
    shareLevelToUser: 'full',
    sharesWithViewer: 'full',
    viewerRule: 'full',
    relationship: 'friends',
    updatedAgo: 'Updated today',
    entries: schedules[f.id] || []
  }));

  const groups = [
    {
      id: 'kalbo',
      name: 'Kalbo',
      initials: 'KA',
      avatarClass: avatarClassFromName('Kalbo'),
      colorClass: avatarClassFromName('Kalbo'),
      rule: 'full',
      shareEnabled: true,
      notificationsEnabled: true,
      memberIds: ['franzen', 'thea', 'hershey', 'ella', 'gelie', 'luanne', 'jellah']
    },
    {
      id: 'badminton',
      name: 'Badminton',
      initials: 'BA',
      avatarClass: avatarClassFromName('Badminton'),
      colorClass: avatarClassFromName('Badminton'),
      rule: 'full',
      shareEnabled: true,
      notificationsEnabled: true,
      memberIds: ['gian', 'danica']
    },
    {
      id: 'step',
      name: 'STEP',
      initials: 'ST',
      avatarClass: avatarClassFromName('STEP'),
      colorClass: avatarClassFromName('STEP'),
      rule: 'full',
      shareEnabled: true,
      notificationsEnabled: true,
      memberIds: ['dane']
    }
  ];

  // MOCK non-friends — incoming requests (schedules start EMPTY)
  const incomingRequests = [
    {
      id: 'kristine',
      personId: 'kristine',
      name: 'Kristine',
      firstName: 'Kristine',
      lastName: '',
      username: 'kristine',
      initials: 'KR',
      avatarClass: avatarClassFromName('Kristine'),
      mutualText: '3 mutual friends',
      mutualCount: 3,
      timeAgo: '2m',
      unread: true,
      entries: [] // MOCK empty schedule
    },
    {
      id: 'marco',
      personId: 'marco',
      name: 'Marco',
      firstName: 'Marco',
      lastName: '',
      username: 'marco',
      initials: 'MA',
      avatarClass: avatarClassFromName('Marco'),
      mutualText: '3 mutual friends',
      mutualCount: 3,
      timeAgo: '15m',
      unread: true,
      entries: [] // MOCK empty schedule
    }
  ];

  // MOCK searchable non-friends (schedules start EMPTY)
  const directoryPeople = [
    {
      id: 'mika',
      name: 'Mika Reyes',
      firstName: 'Mika',
      lastName: 'Reyes',
      username: 'mika',
      initials: 'MR',
      avatarClass: avatarClassFromName('Mika Reyes'),
      mutualText: '2 mutual friends',
      mutualCount: 2,
      relationship: 'none',
      status: 'none',
      entries: [] // MOCK empty schedule
    },
    {
      id: 'paolo',
      name: 'Paolo Cruz',
      firstName: 'Paolo',
      lastName: 'Cruz',
      username: 'paolo',
      initials: 'PC',
      avatarClass: avatarClassFromName('Paolo Cruz'),
      mutualText: 'No mutual friends',
      mutualCount: 0,
      relationship: 'none',
      status: 'none',
      entries: [] // MOCK empty schedule
    }
  ];

  // Inbox seed (Addendum B §2)
  const notifications = [
    {
      id: 'notif-kristine-req',
      kind: 'friend_request',
      type: 'friend_request',
      personId: 'kristine',
      name: 'Kristine',
      firstName: 'Kristine',
      username: 'kristine',
      initials: 'KR',
      avatarClass: avatarClassFromName('Kristine'),
      title: 'Kristine sent a friend request',
      detail: '3 mutual friends',
      timeAgo: '2m',
      timestamp: Date.now() - 2 * 60 * 1000,
      unread: true,
      bucket: 'TODAY'
    },
    {
      id: 'notif-marco-req',
      kind: 'friend_request',
      type: 'friend_request',
      personId: 'marco',
      name: 'Marco',
      firstName: 'Marco',
      username: 'marco',
      initials: 'MA',
      avatarClass: avatarClassFromName('Marco'),
      title: 'Marco sent a friend request',
      detail: '3 mutual friends',
      timeAgo: '15m',
      timestamp: Date.now() - 15 * 60 * 1000,
      unread: true,
      bucket: 'TODAY'
    },
    {
      id: 'notif-dane-accepted',
      kind: 'request_accepted',
      type: 'request_accepted',
      personId: 'dane',
      name: 'Dane',
      firstName: 'Dane',
      username: 'dane',
      initials: 'DA',
      avatarClass: avatarClassFromName('Dane'),
      title: 'Dane accepted your request',
      detail: 'Accepted your friend request',
      timeAgo: '1h',
      timestamp: Date.now() - 60 * 60 * 1000,
      unread: true,
      bucket: 'TODAY',
      canView: true
    },
    {
      id: 'notif-danica-updated',
      kind: 'schedule_update',
      type: 'schedule_updated',
      personId: 'danica',
      name: 'Danica',
      firstName: 'Danica',
      username: 'danica',
      initials: 'DC',
      avatarClass: avatarClassFromName('Danica'),
      title: 'Danica updated her schedule',
      detail: 'Now free Wed 1:30 – 3:00 PM',
      timeAgo: 'Yesterday',
      timestamp: Date.now() - 26 * 3600 * 1000,
      unread: false,
      bucket: 'YESTERDAY',
      canView: true
    },
    {
      id: 'notif-gian-updated',
      kind: 'schedule_update',
      type: 'schedule_updated',
      personId: 'gian',
      name: 'Gian',
      firstName: 'Gian',
      username: 'gian',
      initials: 'GI',
      avatarClass: avatarClassFromName('Gian'),
      title: 'Gian updated his schedule',
      detail: 'Added PATHFIT 3 on Saturday',
      timeAgo: 'Yesterday',
      timestamp: Date.now() - 28 * 3600 * 1000,
      unread: false,
      bucket: 'YESTERDAY',
      canView: true
    }
  ];

  const shareLinks = [
    {
      id: 'francis_8472',
      ownerId: 'francis',
      url: 'cnufree.com/s/francis_8472',
      audience: 'free_busy',
      mode: 'free_busy',
      hoursStart: 540,
      hoursEnd: 1020,
      createdAt: Date.now() - 86400000,
      expiresAt: Date.UTC(2030, 10, 4, 23, 59, 0),
      expiryDays: 6,
      expiresLabel: '6 days left',
      revoked: false
    },
    {
      id: 'francis_old',
      ownerId: 'francis',
      url: 'cnufree.com/s/francis_old',
      audience: 'free_busy',
      mode: 'free_busy',
      hoursStart: 540,
      hoursEnd: 1020,
      createdAt: Date.UTC(2026, 9, 13, 0, 0, 0),
      expiresAt: Date.UTC(2020, 9, 20, 0, 0, 0),
      expiryDays: 0,
      expiresLabel: 'Oct 20',
      revoked: false,
      expired: true
    }
  ];

  const privacyConfig = {
    globalAudience: 'friends',
    showClassNames: true,
    showRoomNumbers: true,
    groupRules: {
      kalbo: 'full',
      badminton: 'full',
      step: 'full'
    },
    personOverrides: {
      gian: 'full',
      franzen: 'full',
      thea: 'full',
      hershey: 'full',
      ella: 'full',
      dane: 'full',
      danica: 'full',
      gelie: 'full',
      luanne: 'full',
      jellah: 'full'
    }
  };

  const ownerScheduleRev = {
    francis: 1,
    gian: 1,
    franzen: 1,
    thea: 1,
    hershey: 1,
    ella: 1,
    dane: 1,
    danica: 1,
    gelie: 1,
    luanne: 1,
    jellah: 1,
    kristine: 1,
    marco: 1,
    mika: 1,
    paolo: 1
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    dataMode: 'demo',
    scheduleRev: 1,
    ownerScheduleRev,
    privacyRev: 1,
    proposalsRev: 1,
    forcePersistFailure: false,
    authenticated: true,
    session: {
      loggedIn: true,
      userId: 'francis',
      onboarding: false,
      signedOutNotice: false
    },

    user: {
      id: 'francis',
      isUser: true,
      name: 'Francis',
      firstName: 'Francis',
      lastName: '',
      username: 'francis',
      email: 'francis@cnu.edu.ph',
      timezone: 'Asia/Manila',
      timeZone: 'Asia/Manila',
      initials: 'FR',
      shortInitial: 'F',
      avatarClass: 'av-ink',
      entries: schedules.francis || [],
      privacyConfig
    },

    privacy: privacyConfig,
    shareLinks,

    notificationSettings: {
      friendRequests: true,
      requestAccepted: true,
      scheduleUpdates: true
    },

    friends,
    groups,
    incomingRequests,
    outgoingRequests: [],
    connectedRequestCards: [],
    directoryPeople,
    directory: directoryPeople,
    blockedPeople: [],
    notifications,

    proposals: [],
    activeProposalId: null,
    accessRequestsSent: {},

    ocrDrafts: createDefaultOcrDrafts(),
    ocrForceFailure: false,

    ui: {
      nowGroupFilter: 'All',
      friendsStatusFilter: 'All',
      friendsGroupFilter: 'All',
      friendsSearchQuery: '',
      overlapParticipantIds: ['francis', 'gian', 'danica'],
      overlapSelectedIds: ['francis', 'gian', 'danica'],
      overlapDayIndex: 1,
      selectedOverlapWindow: null,
      overlapPickerSearch: '',
      activeFriendId: 'gian',
      selectedFriendId: 'gian',
      friendScheduleDayIndex: 1,
      friendScheduleMode: 'day',
      activeGroupId: 'kalbo',
      selectedGroupId: 'kalbo',
      myScheduleDayIndex: 1,
      myScheduleMode: 'week',
      editingClassId: null,
      classFormMode: 'add',
      classFormReturnTo: '8',
      classFormDirty: false,
      classForm: {
        activity: 'ITMC314 (ZT33Am)',
        room: 'ZT33Am',
        days: [4],
        starts: '11:00',
        ends: '08:00',
        repeat: 'weekly',
        notes: ''
      },
      findFriendsQuery: '',
      findFriendsSearch: '',
      requestsTab: 'received',
      findFriendsTab: 'received',
      recentlyAcceptedIds: [],
      groupFormMode: 'create',
      groupFormName: 'Study Hall',
      groupFormRule: 'full',
      groupFormMembers: {
        gian: true,
        danica: true
      },
      groupFormDirty: false,
      renameGroupFormName: 'Kalbo',
      editProfileForm: {
        firstName: 'Francis',
        lastName: '',
        username: 'francis'
      },
      showAvatarPalette: false,
      shareSheetConfig: {
        audience: 'free_busy',
        expiryDays: 6,
        hoursStart: '09:00',
        hoursEnd: '17:00'
      },
      activeShareLinkId: 'francis_8472',
      sharePreviewState: 'active',
      publicShareLinkState: 'active',
      authMode: 'signin',
      authForm: {
        firstName: 'Francis',
        lastName: '',
        username: 'francis',
        email: 'francis@cnu.edu.ph',
        password: 'password123'
      },
      forgotPasswordEmail: 'francis@cnu.edu.ph',
      forgotPasswordSent: false,
      inboxFilter: 'All',
      inboxViewState: 'normal',
      friendsViewState: 'normal',
      ocrSimulateError: false
    }
  };
}

export function createCleanState() {
  const base = createSeedState();
  return {
    ...base,
    dataMode: 'clean',
    user: {
      ...base.user,
      entries: []
    },
    friends: [],
    groups: [],
    incomingRequests: [],
    outgoingRequests: [],
    connectedRequestCards: [],
    notifications: [],
    blockedPeople: [],
    ocrDrafts: [],
    ui: {
      ...base.ui,
      overlapParticipantIds: ['francis'],
      overlapSelectedIds: ['francis'],
      activeFriendId: null,
      selectedFriendId: null,
      activeGroupId: null,
      selectedGroupId: null
    }
  };
}

export function migrateState(stored) {
  if (!stored || typeof stored !== 'object') {
    return createSeedState();
  }
  if (stored.schemaVersion !== SCHEMA_VERSION || stored.user?.id !== 'francis') {
    return createSeedState();
  }
  const seed = createSeedState();
  return {
    ...seed,
    ...stored,
    user: { ...seed.user, ...(stored.user || {}) },
    ui: { ...seed.ui, ...(stored.ui || {}) },
    schemaVersion: SCHEMA_VERSION
  };
}
