import assert from 'node:assert/strict';
import { catalog, courseByCode, myPlan, totalCredits, defaultProfile, defaultTermDates, termCodes, parseSlot, slotOptions, ESTIMATE_NOTE } from '../src/curriculum';
import plan from '../content/plan.json';

// the catalog is generated from the curriculum: every course a plan names exists, Year 1 included
const YEAR1 = ['GE011', 'GE012', 'GE013', 'GE014', 'GE015', 'EN101', 'EN102', 'ENL101', 'ENL102', 'ENL111', 'ENL181', 'ENL182'];
for (const code of YEAR1) assert.ok(courseByCode(code), `catalog has ${code}`);
for (const t of plan.terms) for (const codes of Object.values(t.courses)) for (const code of codes)
  assert.ok(parseSlot(code) || courseByCode(code), `${t.id}: ${code} from plan.json is in the catalog`);
assert.equal(catalog.length, 77, 'all 77 described courses are in the catalog');
for (const c of catalog) {
  assert.match(c.credits, /^\d+ \(\d+ – \d+ – \d+\)$/, `${c.code} credits look like 3 (3 – 0 – 6)`);
  assert.ok(c.desc_th && c.desc_en && c.name_th && c.name_en, `${c.code} has TH/EN names and descriptions`);
}
assert.deepEqual(courseByCode('ENL102')!.prerequisite, ['ENL101']);
assert.deepEqual(courseByCode('EN400')!.prerequisite, ['CO301']);
assert.equal(courseByCode('EN400')!.credits, '6 (0 – 35 – 0)');
assert.equal(courseByCode('ENL101')!.desc_en, 'English grammar at word level, tenses and simple sentences.');
assert.equal(slotOptions('ME').length, 35, 'major electives come from the three elective groups');
assert.deepEqual(slotOptions('FE').map((c) => c.code), ['ENL585', 'ENL587', 'EN402', 'EN403', 'EN406', 'EN409']);
assert.deepEqual(slotOptions('SI'), [], 'Special Interest has no course list in the curriculum');

// Pete: cohort 1/1, co-op plan. The expected credits are the Year Plan table, not computed from the same code.
const terms = myPlan(defaultProfile());
assert.deepEqual(terms.map((t) => [t.id, t.credits]), [
  ['y1t1-1', 6], ['y1t1-2', 12], ['y1t2', 18], ['y2t1', 18], ['y2t2', 18], ['y3t1', 18], ['y3t2', 18], ['y3s', 6], ['y4t1', 15], ['y4t2', 6],
]);
assert.equal(totalCredits(terms), 135, 'cohort 1/1 co-op totals 135 credits');
for (const t of terms) {
  const raw = plan.terms.find((x) => x.id === t.id)!;
  assert.deepEqual(t.items.map((it) => (it.kind === 'course' ? it.code : it.id)), termCodes(raw, { cohort: '1/1', track: 'coop' }), `${t.id} lists plan.json's courses in order`);
}
assert.deepEqual(terms[0].items.map((it) => it.kind === 'course' && it.code), ['GE011', 'ENL181']);
assert.deepEqual(terms.at(-1)!.items.map((it) => it.kind === 'course' && it.code), ['EN400']);
for (const p of [{ cohort: '1/1', track: 'normal' }, { cohort: '1/2', track: 'coop' }, { cohort: '2', track: 'normal' }] as const)
  assert.equal(totalCredits(myPlan({ ...defaultProfile(), ...p })), 135, `cohort ${p.cohort} ${p.track} totals 135`);
assert.ok(!myPlan({ ...defaultProfile(), track: 'normal' }).some((t) => t.items.some((it) => it.kind === 'course' && ['CO301', 'EN400'].includes(it.code))), 'the normal plan has no co-op courses');

// term dates: cohort 1/1 starts in June 2027 with the preparatory term 1/1 (BU prints only the month);
// term 1/2 is the university's semester 1, 16 Aug – 5 Dec 2027
assert.deepEqual(defaultTermDates('y1t1-1'), { start: '2027-06-01', end: '2027-07-31', estimate: true, startKnown: false }, '1/1 starts in June, day not printed');
assert.deepEqual(defaultTermDates('y1t1-2'), { start: '2027-08-16', end: '2027-12-05', estimate: false, startKnown: true }, '1/2 is the printed semester 1');
assert.deepEqual(defaultTermDates('y1t2'), { start: '2028-01-10', end: '2028-05-14', estimate: false, startKnown: true });
assert.deepEqual(defaultTermDates('y1s'), { start: '2028-06-12', end: '2028-08-06', estimate: false, startKnown: true });
assert.deepEqual(defaultTermDates('y2t1'), { start: '2028-08-16', end: '2028-12-05', estimate: true, startKnown: false }, 'later years shift by one year and are estimates');
assert.deepEqual(defaultTermDates('y4t2'), { start: '2031-01-10', end: '2031-05-14', estimate: true, startKnown: false });
assert.match(ESTIMATE_NOTE, /registration\.bu\.ac\.th/);

// an edited date wins and is no longer an estimate; a broken edit falls back to the default
const edited = myPlan({ ...defaultProfile(), termDates: { 'y1t1-1': { start: '2027-06-07', end: '2027-07-24' }, 'y1t1-2': { start: '2027-12-01', end: '2027-11-01' } } });
assert.deepEqual([edited[0].end, edited[0].estimate, edited[0].edited], ['2027-07-24', false, true]);
assert.deepEqual([edited[1].start, edited[1].edited], ['2027-08-16', false], 'an end before the start is ignored');

// a chosen slot resolves to its catalog course and keeps 3 credits
const slotted = myPlan({ ...defaultProfile(), slots: { 'ME-1': 'ENL522', 'SI-1': 'วิชาจากคณะอื่น' } });
const me = slotted.flatMap((t) => t.items).find((it) => it.kind === 'slot' && it.id === 'ME-1')!;
assert.ok(me.kind === 'slot' && me.course?.code === 'ENL522' && me.credits === 3);
const si = slotted.flatMap((t) => t.items).find((it) => it.kind === 'slot' && it.id === 'SI-1')!;
assert.ok(si.kind === 'slot' && si.choice === 'วิชาจากคณะอื่น' && !si.course, 'free text is kept for a course outside the catalog');
console.log('curriculum tests passed');
