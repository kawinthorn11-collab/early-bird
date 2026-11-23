import assert from 'node:assert/strict';
import { buildRun, score, unitSource, fallbackSources, RUN_LENGTH } from '../src/run';
import { recordAnswer, emptyProgress } from '../src/store';
import { lessons } from '../src/content';
import type { CourseUnit } from '../src/courses';

/** A course unit shaped like content/courses files: its own MCQs and vocab, and (optionally) a reused grammar lesson. */
function unit(id: string, opts: { reuse?: string; vocab?: boolean } = {}): CourseUnit {
  const base = lessons[Number(id.slice(-1)) % lessons.length].questions.slice(0, 8);
  return {
    id, title_th: `หน่วย ${id}`, title_en: id, covers: '', minutes: 10,
    ...(opts.reuse && { lessons: [opts.reuse] }),
    cards: [], task_th: '',
    vocab: opts.vocab === false ? [] : [['critical thinking', 'การคิดเชิงวิพากษ์'], ['evidence', 'หลักฐาน'], ['assume', 'สันนิษฐาน'], ['analyse', 'วิเคราะห์'], ['solution', 'ทางแก้']],
    questions: base.map((q, i) => ({ ...q, id: `${id}-${String(i + 1).padStart(2, '0')}`, skill: id })),
    say: [`I am studying unit ${id} today.`, 'Thinking takes practice.'],
  };
}

const grammar = [unit('ENL101-U1', { reuse: 'L01' }), unit('ENL101-U2', { reuse: 'L02' }), unit('ENL101-U3', { reuse: 'L25' })].map(unitSource);
const plain = [unit('GE011-U1'), unit('GE011-U2')].map(unitSource);
const fromUnits = (r: { src: string }) => [...grammar, ...plain].some((s) => s.id === r.src);

for (let n = 0; n < 40; n++) {
  const run = buildRun(emptyProgress(), grammar);
  assert.equal(run.length, RUN_LENGTH, 'a run has a fixed short length');
  assert.ok(new Set(run.map((r) => r.kind)).size >= 4, `units that reuse lessons give mixed formats: ${run.map((r) => r.kind)}`);
  assert.equal(run.filter((r) => r.kind === 'say').length, 1, 'every run has exactly one say-it-aloud round');
  assert.equal(new Set(run.map((r) => r.key)).size, run.length, `no item repeats: ${run.map((r) => r.key)}`);
  assert.ok(run.every(fromUnits), 'every round comes from an open unit');
  for (const r of run) if (r.kind === 'pick') assert.equal(r.q.why_wrong[r.q.answer], null, 'options stay aligned after shuffling');
  for (const r of run) if (r.kind === 'match') assert.ok(r.options.length >= 2 && r.options[r.answer] !== undefined, 'match round has a valid answer');
}

for (let n = 0; n < 20; n++) {
  const run = buildRun(emptyProgress(), plain);
  assert.equal(run.length, RUN_LENGTH, 'units without lessons still fill a run');
  assert.deepEqual([...new Set(run.map((r) => r.kind))].sort(), ['match', 'pick', 'say'], `plain units give MCQs, vocab matches and one say line: ${run.map((r) => r.kind)}`);
  const say = run.find((r) => r.kind === 'say');
  assert.ok(say && say.kind === 'say' && plain.some((s) => s.says.some((x) => x.text === say.text)), 'the say line comes from the unit');
}

{
  const run = buildRun(emptyProgress(), [...plain, ...grammar], ['GE011-U2']);
  assert.equal(run[0].src, 'GE011-U2', "today's unit leads the run");
}

{
  const p = emptyProgress();
  const missed = [grammar[0].mcqs[0], plain[1].mcqs[2]];
  for (const q of missed) { recordAnswer(p, q, false); p.srs[q.id].due = Date.now() - 1000; }
  const run = buildRun(p, [...grammar, ...plain]);
  assert.deepEqual(run.slice(0, 2).map((r) => r.kind === 'pick' && r.srsKey).sort(), missed.map((q) => q.id).sort(), 'due SRS items come first');
  assert.ok(run.slice(0, 2).every((r) => r.kind === 'pick' && r.skill === missed.find((q) => q.id === r.srsKey)!.skill), 'a due item is served on its own skill');
  assert.equal(run.length, RUN_LENGTH);
  assert.ok(run.some((r) => r.kind === 'say'), 'due items do not crowd out speaking');
}

{
  const p = emptyProgress();
  const all = [...grammar, ...plain];
  for (const q of all[3].mcqs.slice(0, 6)) recordAnswer(p, q, false);
  for (const s of all.filter((x) => x !== all[3])) for (const q of s.mcqs.slice(0, 6)) recordAnswer(p, q, true);
  for (const k of Object.keys(p.srs)) delete p.srs[k];
  p.lastSeen = {};
  const hits = Array.from({ length: 20 }, () => buildRun(p, all).filter((r) => r.src === all[3].id).length);
  assert.ok(hits.every((h) => h >= 1), `the weakest open unit shows up in every run: ${hits}`);
}

{
  const p = emptyProgress();
  let prev = new Set<string>();
  for (let n = 0; n < 6; n++) {
    const run = buildRun(p, grammar);
    const graded = run.filter((r) => r.kind !== 'say');
    assert.deepEqual(graded.filter((r) => prev.has(r.key)).map((r) => r.key), [], `run ${n + 1} repeats nothing from the run before`);
    for (const r of graded) recordAnswer(p, r.kind === 'pick' ? r.q : { id: r.key, skill: r.skill }, true);
    prev = new Set(graded.map((r) => r.key));
  }
}

{
  const p = emptyProgress();
  for (const q of plain[0].mcqs) recordAnswer(p, q, true);
  for (let n = 0; n < 10; n++) {
    const run = buildRun(p, [plain[0]]);
    assert.equal(run.length, RUN_LENGTH, 'right after studying a unit, its items still fill a full run');
    assert.ok(run.filter((r) => r.kind === 'pick').length >= 2, `seen-today MCQs come back when nothing fresher exists: ${run.map((r) => r.kind)}`);
  }
}

{
  const run = buildRun(emptyProgress(), fallbackSources());
  assert.equal(run.length, RUN_LENGTH, 'with no course unit open yet, the grammar lessons still give a full run');
  assert.deepEqual(buildRun(emptyProgress(), []), [], 'no sources and nothing due gives an empty run');
}

assert.deepEqual(score(0, true, false), { combo: 1, mult: 1, bonus: 0 });
assert.deepEqual(score(1, true, true), { combo: 2, mult: 2, bonus: 6 });
assert.equal(score(9, true, false).mult, 4, 'combo multiplier caps at x4');
assert.equal(score(5, false, true).combo, 0, 'a miss resets the combo');
assert.ok(score(2, true, false).bonus > 0, 'a slow right answer still earns its combo bonus');
console.log('quick run tests passed');
