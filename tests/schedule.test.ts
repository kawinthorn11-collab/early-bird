import assert from 'node:assert/strict';
import { preStudy } from '../src/schedule';
import { myPlan, defaultProfile } from '../src/curriculum';
import { addDays } from '../src/dates';

const terms = myPlan(defaultProfile());
/** Five units for every Year 1 course; later courses have no content yet. */
const Y1 = new Set(terms.filter((t) => t.year === 1).flatMap((t) => t.items.flatMap((it) => (it.kind === 'course' ? [it.code] : []))));
const unitsOf = (code: string) => (Y1.has(code) ? [1, 2, 3, 4, 5].map((n) => `${code}-U${n}`) : []);

// 23 Nov 2026: year 1 term 1/1 (June 2027) and 1/2 (August) courses are what to prepare, earliest course first
{
  const s = preStudy('2026-11-23', terms, unitsOf, {});
  assert.equal(s.nextStart?.term.id, 'y1t1-1');
  assert.equal(s.nextStart?.days, 190, '190 days until 1/1 opens on 1 Jun 2027');
  assert.equal(s.termStatus['y1t1-1'], 'pre-study');
  assert.equal(s.termStatus['y1t1-2'], 'pre-study', '1/2 courses are prepared before the semester opens too');
  assert.equal(s.termStatus['y1t2'], 'later');
  assert.equal(s.courseMode.GE011, 'pre-study');
  assert.equal(s.courseMode.ENL102, 'later');
  assert.deepEqual(s.queue.slice(0, 6).map((q) => q.unitId), ['GE011-U1', 'GE011-U2', 'GE011-U3', 'GE011-U4', 'GE011-U5', 'ENL181-U1']);
  assert.ok(s.queue.slice(0, 30).every((q) => q.prepBy === '2027-06-01'), 'all 30 units of 1/1 and 1/2 are due by 1 Jun');
  assert.deepEqual(s.todayUnits.map((q) => q.unitId), ['GE011-U1'], "a fresh start has today's new unit");
  assert.equal(s.pace?.perDay, 1);
  // 30 units in 190 days, or 60 units by 10 Jan 2028: one unit every 6 days covers both
  assert.equal(s.pace?.everyDays, 6);
  assert.deepEqual([...s.unlocked], ['GE011-U1'], 'only today\'s unit is open before anything is done');
}

// pacing: a unit finished 2 days ago means no new unit is due today. 29 units left by 1 Jun 2027 = one every 6 days
{
  const done = { 'GE011-U1': '2026-11-21' };
  const s = preStudy('2026-11-23', terms, unitsOf, done);
  assert.deepEqual(s.todayUnits, [], 'nothing new is due two days later');
  assert.equal(s.nextDue, '2026-11-27');
  assert.equal(s.queue[0].unitId, 'GE011-U2', 'the queue still shows what comes next');
  assert.ok(s.unlocked.has('GE011-U1') && !s.unlocked.has('GE011-U2'));
  const later = preStudy('2026-11-27', terms, unitsOf, done);
  assert.deepEqual(later.todayUnits.map((q) => q.unitId), ['GE011-U2']);
}

// a unit finished today stays as today's unit, so the screen can show it done
{
  const s = preStudy('2026-11-23', terms, unitsOf, { 'GE011-U1': '2026-11-23' });
  assert.deepEqual(s.todayUnits.map((q) => q.unitId), ['GE011-U1']);
  assert.ok(s.unlocked.has('GE011-U1'));
}

// behind schedule: two weeks before term with 30 units left needs more than one unit a day
{
  const s = preStudy('2027-05-18', terms, unitsOf, {});
  assert.equal(s.pace?.everyDays, 1);
  assert.equal(s.pace?.perDay, 3, '30 units in 14 days');
  assert.deepEqual(s.todayUnits.map((q) => q.unitId), ['GE011-U1', 'GE011-U2', 'GE011-U3']);
}

// after 1/1 starts: its courses become review (all units open); 1/2 is now prepared before 16 Aug; semester 2 waits
{
  const s = preStudy('2027-06-10', terms, unitsOf, {});
  assert.equal(s.termStatus['y1t1-1'], 'now');
  assert.equal(s.courseMode.GE011, 'review');
  assert.equal(s.courseMode.ENL181, 'review');
  assert.ok(unitsOf('GE011').every((u) => s.unlocked.has(u)) && unitsOf('ENL181').every((u) => s.unlocked.has(u)), 'review courses are fully open');
  assert.equal(s.termStatus['y1t1-2'], 'pre-study');
  assert.equal(s.termStatus['y1t2'], 'later');
  assert.equal(s.queue[0].unitId, 'GE013-U1');
  assert.equal(s.queue[0].prepBy, '2027-08-16');
  assert.equal(s.nextStart?.term.id, 'y1t1-2');
}

// semester 1 over: semester 2 courses are prepared next, and finished units stay open for review
{
  const done = Object.fromEntries([...Y1].flatMap((c) => unitsOf(c)).filter((u) => !/^(GE012|GE015|EN102|ENL102|ENL111|ENL182)/.test(u)).map((u) => [u, '2027-07-01']));
  const s = preStudy('2027-12-10', terms, unitsOf, done);
  assert.equal(s.termStatus['y1t1-2'], 'past');
  assert.equal(s.termStatus['y1t2'], 'pre-study');
  assert.equal(s.queue[0].unitId, 'GE012-U1');
  assert.ok(s.queue.every((q) => q.prepBy === '2028-01-10'));
  assert.deepEqual([s.pace?.everyDays, s.todayUnits.map((q) => q.unitId)], [1, ['GE012-U1']], '30 units in 31 days: one a day');
}

// everything prepared: no queue, no pace, nothing due
{
  const done = Object.fromEntries([...Y1].flatMap((c) => unitsOf(c)).map((u) => [u, '2027-01-01']));
  const s = preStudy('2027-02-01', terms, unitsOf, done);
  assert.deepEqual([s.queue.length, s.pace, s.todayUnits.length, s.nextDue], [0, null, 0, null]);
  assert.equal(s.unlocked.size, 60);
}
assert.equal(addDays('2027-08-16', -266), '2026-11-23');
console.log('schedule tests passed');
