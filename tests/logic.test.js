/* ==========================================================================
   CNU FREE V2 — ADDENDUM B LOGIC & DOMAIN ENGINE TESTS (tests/logic.test.js)
   Verifies all Acceptance Criteria in SPEC V2 — ADDENDUM B §7 plus
   validators, privacy matrix, and store mutations.
   ========================================================================== */

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createSeedState } from '../src/seed.js';
import {
  now,
  status,
  formatRange,
  formatDuration,
  formatDurationLong,
  parseScheduleTitle,
  DAY_WINDOW_START,
  DAY_WINDOW_END
} from '../src/time.js';
import { setClockPreset, setClockCustom } from '../src/clock.js';
import { canSee } from '../src/privacy.js';
import { overlap } from '../src/overlap.js';
import { validateClassEntry, validateUsername } from '../src/validators.js';
import { repo, selectFriendsAvailability } from '../src/store.js';

describe('CNU Free V2 — Addendum B Real Roster & Live Schedule Engine', () => {
  let seed;

  beforeEach(() => {
    setClockPreset('Tue 09:41');
    seed = createSeedState();
    repo.resetToSeed();
  });

  it('Seed has exactly 146 schedule entries across Francis (17) + 10 friends with expected per-person counts', () => {
    expect(seed.user.id).toBe('francis');
    expect(seed.user.name).toBe('Francis');
    expect(seed.user.username).toBe('francis');
    expect(seed.user.initials).toBe('FR');
    expect(seed.user.timeZone).toBe('Asia/Manila');

    const expectedCounts = {
      francis: 17,
      gian: 23,
      franzen: 10,
      thea: 11,
      hershey: 11,
      ella: 15,
      dane: 11,
      danica: 10,
      gelie: 15,
      luanne: 10,
      jellah: 13
    };

    expect(seed.user.entries).toHaveLength(expectedCounts.francis);

    let totalEntries = seed.user.entries.length;
    for (const friend of seed.friends) {
      expect(friend.entries).toHaveLength(expectedCounts[friend.id]);
      totalEntries += friend.entries.length;
    }

    expect(seed.friends).toHaveLength(10);
    expect(totalEntries).toBe(146);

    // Groups: Kalbo (7), Badminton (2), STEP (1)
    const kalbo = seed.groups.find((g) => g.id === 'kalbo');
    const badminton = seed.groups.find((g) => g.id === 'badminton');
    const step = seed.groups.find((g) => g.id === 'step');
    expect(kalbo.memberIds).toEqual(['franzen', 'thea', 'hershey', 'ella', 'gelie', 'luanne', 'jellah']);
    expect(badminton.memberIds).toEqual(['gian', 'danica']);
    expect(step.memberIds).toEqual(['dane']);
  });

  it('1. Tue 09:41 -> Francis busy until 10:30 AM (Philosophy of Religion); FREE (4): Thea, Hershey, Gelie, Ella; BUSY (6): Gian, Dane, Danica, Jellah, Franzen, Luanne; Kalbo 4/7, Badminton 0/2, STEP 0/1', () => {
    setClockPreset('Tue 09:41');
    const currentNow = now();
    expect(currentNow.dayIndex).toBe(1);
    expect(currentNow.minutes).toBe(9 * 60 + 41);

    // Francis: busy until 10:30 AM (Philosophy of Religion)
    const francisSt = status(seed.user, currentNow, 'self', seed.groups);
    expect(francisSt.state).toBe('busy');
    expect(francisSt.until).toBe(10 * 60 + 30);
    expect(francisSt.untilFormatted).toBe('10:30 AM');
    expect(francisSt.currentBlock.short).toBe('Philosophy of Religion');

    const avail = selectFriendsAvailability(seed, currentNow, 'All');
    expect(avail.totalNonPrivateCount).toBe(10);
    expect(avail.freeNowCount).toBe(4);
    expect(avail.busyNowCount).toBe(6);

    // FREE (4) sorted by remainingMinutes DESC:
    // Thea (until 1:00 PM = 780), Hershey (until 1:00 PM = 780), Gelie (until 12:30 PM = 750), Ella (until 10:30 AM = 630)
    const freeMap = Object.fromEntries(avail.freeNow.map((x) => [x.friend.id, x.status]));
    expect(Object.keys(freeMap)).toHaveLength(4);
    expect(freeMap.thea.untilFormatted).toBe('1:00 PM');
    expect(freeMap.hershey.untilFormatted).toBe('1:00 PM');
    expect(freeMap.gelie.untilFormatted).toBe('12:30 PM');
    expect(freeMap.ella.untilFormatted).toBe('10:30 AM');
    // Most remaining free time first (Thea/Hershey 199m > Gelie 169m > Ella 49m)
    expect(avail.freeNow[0].status.remainingMinutes).toBe(199);
    expect(avail.freeNow[3].friend.id).toBe('ella');

    // BUSY (6) sorted by who becomes free soonest:
    // Gian, Dane, Danica (until 10:30 AM = 630, 49m), Jellah (until 11:00 AM = 660, 79m), Franzen, Luanne (until 12:00 PM = 720, 139m)
    const busyMap = Object.fromEntries(avail.busyNow.map((x) => [x.friend.id, x.status]));
    expect(Object.keys(busyMap)).toHaveLength(6);
    expect(busyMap.gian.untilFormatted).toBe('10:30 AM');
    expect(busyMap.dane.untilFormatted).toBe('10:30 AM');
    expect(busyMap.danica.untilFormatted).toBe('10:30 AM');
    expect(busyMap.jellah.untilFormatted).toBe('11:00 AM');
    expect(busyMap.franzen.untilFormatted).toBe('12:00 PM');
    expect(busyMap.luanne.untilFormatted).toBe('12:00 PM');

    // Group chips: Kalbo free 4 of 7, Badminton 0 of 2, STEP 0 of 1
    const kalboAvail = selectFriendsAvailability(seed, currentNow, 'Kalbo');
    const badmintonAvail = selectFriendsAvailability(seed, currentNow, 'Badminton');
    const stepAvail = selectFriendsAvailability(seed, currentNow, 'STEP');
    expect(kalboAvail.freeNowCount).toBe(4);
    expect(kalboAvail.totalNonPrivateCount).toBe(7);
    expect(badmintonAvail.freeNowCount).toBe(0);
    expect(badmintonAvail.totalNonPrivateCount).toBe(2);
    expect(stepAvail.freeNowCount).toBe(0);
    expect(stepAvail.totalNonPrivateCount).toBe(1);
  });

  it('2. Mon 11:00 (end is exclusive) -> Jellah free until 12:00; Franzen free rest of day; Gelie free until 1:00 PM; Francis free until 12:00 PM; BUSY (7)', () => {
    setClockCustom(0, 11 * 60); // Mon 11:00
    const currentNow = now();
    expect(currentNow.dayIndex).toBe(0);
    expect(currentNow.minutes).toBe(660);

    // Francis: free until 12:00 PM
    const francisSt = status(seed.user, currentNow, 'self', seed.groups);
    expect(francisSt.state).toBe('free');
    expect(francisSt.untilFormatted).toBe('12:00 PM');

    const avail = selectFriendsAvailability(seed, currentNow, 'All');
    expect(avail.totalNonPrivateCount).toBe(10);
    expect(avail.freeNowCount).toBe(3);
    expect(avail.busyNowCount).toBe(7);

    const freeMap = Object.fromEntries(avail.freeNow.map((x) => [x.friend.id, x.status]));
    expect(freeMap.jellah.state).toBe('free');
    expect(freeMap.jellah.untilFormatted).toBe('12:00 PM');
    expect(freeMap.franzen.state).toBe('free');
    expect(freeMap.franzen.untilCopy).toBe('Free for the rest of the day');
    expect(freeMap.gelie.state).toBe('free');
    expect(freeMap.gelie.untilFormatted).toBe('1:00 PM');

    const busyMap = Object.fromEntries(avail.busyNow.map((x) => [x.friend.id, x.status]));
    for (const id of ['gian', 'ella', 'dane', 'danica']) {
      expect(busyMap[id].untilFormatted).toBe('12:00 PM');
    }
    expect(busyMap.thea.untilFormatted).toBe('12:30 PM');
    expect(busyMap.hershey.untilFormatted).toBe('12:30 PM');
    expect(busyMap.luanne.untilFormatted).toBe('1:00 PM');
  });

  it('3. Overlap Tue [Francis, Thea]: windows 7:00–8:00 AM, 10:30 AM–1:00 PM and 8:30–9:00 PM; best = 10:30 AM–1:00 PM (2 h 30 m)', () => {
    const thea = seed.friends.find((f) => f.id === 'thea');
    const res = overlap([seed.user, thea], 1, 'francis', seed.groups);

    expect(res.windows.map((w) => ({ start: w.start, end: w.end, duration: w.duration }))).toEqual([
      { start: 7 * 60, end: 8 * 60, duration: 60 },
      { start: 10 * 60 + 30, end: 13 * 60, duration: 150 },
      { start: 20 * 60 + 30, end: 21 * 60, duration: 30 }
    ]);

    expect(res.bestWindow.start).toBe(10 * 60 + 30);
    expect(res.bestWindow.end).toBe(13 * 60);
    expect(res.bestWindow.duration).toBe(150);
    expect(formatRange(res.bestWindow.start, res.bestWindow.end)).toBe('10:30 AM – 1:00 PM');
    expect(formatDurationLong(res.bestWindow.duration)).toBe('2 h 30 m');
  });

  it('4. Overlap Sun [Francis, any friend] -> 7:00 AM–9:00 PM, 14 h', () => {
    const gian = seed.friends.find((f) => f.id === 'gian');
    const res = overlap([seed.user, gian], 6, 'francis', seed.groups);
    expect(res.bestWindow.start).toBe(DAY_WINDOW_START);
    expect(res.bestWindow.end).toBe(DAY_WINDOW_END);
    expect(res.bestWindow.duration).toBe(840);
    expect(res.bestWindow.formatted).toBe('7:00 AM – 9:00 PM');
    expect(res.bestWindow.durationLongLabel).toBe('14 h');
  });

  it('5. Dev clock to Tue 12:00 -> Franzen, Luanne, and Ella become free; Gian, Danica, and Jellah become busy', () => {
    // At Tue 10:45: Ella is busy (10:30-12:00), Franzen is busy (07:30-12:00), Luanne is busy (07:00-12:00)
    setClockCustom(1, 10 * 60 + 45);
    const avail1045 = selectFriendsAvailability(seed, now(), 'All');
    const busy1045 = new Set(avail1045.busyNow.map((x) => x.friend.id));
    expect(busy1045.has('ella')).toBe(true);
    expect(busy1045.has('franzen')).toBe(true);
    expect(busy1045.has('luanne')).toBe(true);

    // At Tue 12:00: Franzen, Luanne, Ella become free; Gian (12:00-13:30), Danica (12:00-15:00), Jellah (12:00-15:00) become busy
    setClockCustom(1, 12 * 60);
    const avail1200 = selectFriendsAvailability(seed, now(), 'All');
    const free1200 = new Set(avail1200.freeNow.map((x) => x.friend.id));
    const busy1200 = new Set(avail1200.busyNow.map((x) => x.friend.id));

    expect(free1200.has('franzen')).toBe(true);
    expect(free1200.has('luanne')).toBe(true);
    expect(free1200.has('ella')).toBe(true);
    expect(busy1200.has('gian')).toBe(true);
    expect(busy1200.has('danica')).toBe(true);
    expect(busy1200.has('jellah')).toBe(true);
  });

  it('6. At Sat 20:30 -> Francis shows "Free until Mon 9:00 AM" and Gelie shows "Free until Mon 9:00 AM"', () => {
    setClockPreset('Sat 20:30');
    const satNow = now();
    expect(satNow.dayIndex).toBe(5);
    expect(satNow.minutes).toBe(20 * 60 + 30);

    const francisSt = status(seed.user, satNow, 'self', seed.groups);
    expect(francisSt.state).toBe('free');
    expect(francisSt.untilCopy).toBe('Free until Mon 9:00 AM');

    const gelie = seed.friends.find((f) => f.id === 'gelie');
    const gelieSt = status(gelie, satNow, 'francis', seed.groups);
    expect(gelieSt.state).toBe('free');
    expect(gelieSt.untilCopy).toBe('Free until Mon 9:00 AM');
  });

  it('7. Simulated schedule change adds one Inbox item, raises the badge by 1, and updates Gian schedule', () => {
    const beforeState = repo.getState();
    const unreadBefore = beforeState.notifications.filter((n) => n.unread).length;

    const res = repo.dispatch('SIMULATE_SCHEDULE_CHANGE', {});
    expect(res.ok).toBe(true);

    const afterState = repo.getState();
    const gian = afterState.friends.find((f) => f.id === 'gian');
    const movedEntry = gian.entries.find(
      (e) => e.day === 0 && e.title.includes('Information Management')
    );
    expect(movedEntry).toBeTruthy();
    expect(movedEntry.start).toBe(14 * 60);
    expect(movedEntry.end).toBe(15 * 60 + 30);

    const unreadAfter = afterState.notifications.filter((n) => n.unread).length;
    expect(unreadAfter).toBe(unreadBefore + 1);
    expect(afterState.notifications[0].title).toBe('Gian updated his schedule');
  });

  it('8. A scan of the codebase for the removed legacy names returns nothing', () => {
    const legacyNames = [
      'Bernad' + 'ette',
      'Ma' + 'ria',
      'All' + 'yna',
      'Ag' + 'na',
      'Nha' + 'ka',
      'Noe' + 'lle',
      'La' + 'lah',
      'J' + 'ay',
      'Mar' + 'iah'
    ];
    const forbidden = new RegExp(`\\b(${legacyNames.join('|')})\\b`, 'i');
    const rootDir = path.resolve(process.cwd());

    function scanDir(dirPath) {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const hits = [];
      for (const entry of entries) {
        if (['node_modules', '.git', 'dist', 'ios'].includes(entry.name)) continue;
        const full = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          hits.push(...scanDir(full));
        } else if (/\.(js|html|css|txt|json)$/i.test(entry.name) && entry.name !== 'package-lock.json') {
          const content = fs.readFileSync(full, 'utf8');
          if (forbidden.test(content)) {
            hits.push(path.relative(rootDir, full));
          }
        }
      }
      return hits;
    }

    const matches = scanDir(rootDir);
    expect(matches).toEqual([]);
  });

  it('Parses short and detail fields from schedule titles and validates class/username rules', () => {
    const parsed = parseScheduleTitle(
      'Christian Moral Paradigm (THEN102) (N2Am)'
    );
    expect(parsed.short).toBe('Christian Moral Paradigm');
    expect(parsed.detail).toBe('N2Am');

    const badEnd = validateClassEntry(
      { activity: 'ITEC307', days: [0], start: '15:00', end: '13:00', repeat: 'weekly' },
      seed.user.entries
    );
    expect(badEnd.valid).toBe(false);
    expect(badEnd.errors.end).toBe('End time must be after start time');

    const taken = validateUsername('gian', 'francis');
    expect(taken.valid).toBe(false);
    expect(taken.suggestion).toBe('gian.cnu');
  });
});
