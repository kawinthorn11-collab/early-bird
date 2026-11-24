import assert from 'node:assert/strict';
import { goals, planSlots, rankCareers, rankCourses, targets, hasAnswers, emptyAnswers } from '../src/advisor';
import { myPlan, defaultProfile, slotOptions, catalog } from '../src/curriculum';

const terms = myPlan(defaultProfile());
const codes = (xs: { course: { code: string } }[]) => xs.map((x) => x.course.code);

// every elective and every goal has a Jev judgment, so no course silently scores 0
{
  const all = [...slotOptions('ME'), ...slotOptions('FE')];
  const t = targets({ dreams: goals.careers.map((g) => g.id), interests: [], skills: goals.skills.map((g) => g.id) });
  assert.equal(t.length, 3 + goals.skills.length, 'at most three dream careers are weighted');
  for (const c of rankCourses(all, t)) assert.ok(c.fit > 0, `${c.course.code} has scores`);
}

// a teacher dream: the two major electives are teaching courses, distinct, and practicum I comes before II
{
  const a = { dreams: ['teacher'], interests: [], skills: [] };
  const plan = planSlots(terms, a);
  const me = plan.filter((p) => p.item.slot === 'ME');
  assert.equal(me.length, 2, 'the co-op plan has two major electives');
  const mains = me.map((p) => p.main!.course);
  assert.ok(mains.every((c) => c.me_groups?.includes('กลุ่มวิชาการสอนภาษาอังกฤษเพื่อเป็นวิชาชีพ')), `teaching courses, got ${mains.map((c) => c.code)}`);
  assert.notEqual(mains[0].code, mains[1].code);
  const i575 = mains.findIndex((c) => c.code === 'ENL575'); const i576 = mains.findIndex((c) => c.code === 'ENL576');
  if (i575 >= 0 && i576 >= 0) assert.ok(i575 < i576, 'Teaching Practicum I is planned before II');
  for (const p of me) {
    assert.equal(p.backups.length, 3, 'three backups per slot');
    assert.ok(p.backups.every((b) => !mains.some((m) => m.code === b.course.code)), 'a backup is never another slot\'s main pick');
  }
  const fe = plan.filter((p) => p.item.slot === 'FE');
  assert.equal(fe.length, 2);
  const feMains = fe.map((p) => p.main!.course.code);
  assert.equal(new Set([...feMains, ...mains.map((c) => c.code)]).size, 4, 'free electives never repeat a major elective');
  assert.ok(fe.every((p) => p.backups.every((b) => !feMains.includes(b.course.code))));
  assert.ok(feMains.every((c) => slotOptions('FE').some((x) => x.code === c)), 'FE main picks come from the curriculum FE list');
  const si = plan.filter((p) => p.item.slot === 'SI');
  assert.equal(si.length, 4);
  assert.ok(si.every((p) => !p.main && p.note_th === goals.careers.find((g) => g.id === 'teacher')!.si_th), 'Special Interest gets a direction, not an invented course');
}

// no dream: careers come from interests; the plan targets the best-fitting careers
{
  const r = rankCareers({ dreams: [], interests: ['on_stage', 'make_media'], skills: [] });
  assert.ok(['creator', 'announcer'].includes(r[0].career.id), `stage and video point to creator or announcer, got ${r[0].career.id}`);
  assert.ok(r[0].because.length > 0, 'the reason names the interests');
  assert.ok(targets({ dreams: [], interests: ['on_stage', 'make_media'], skills: [] }).length === 2);
}

// a dream always outranks interest-only fits
{
  const r = rankCareers({ dreams: ['hr'], interests: ['on_stage'], skills: [] });
  assert.equal(r[0].career.id, 'hr');
}

assert.equal(hasAnswers(emptyAnswers()), false);
assert.ok(catalog.length > 0);
console.log('advisor tests passed');
