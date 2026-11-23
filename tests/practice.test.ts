import assert from 'node:assert/strict';
import { recordAnswer, DAY, emptyProgress } from '../src/store';
import { shuffled, reviewQueue } from '../src/practice';
import { lessons } from '../src/content';

const p = emptyProgress();
const q = lessons[0].questions[0];

// wrong → due tomorrow; then each correct review pushes to 3, 7, 16 days, then it leaves the queue
recordAnswer(p, q, false);
assert.ok(Math.abs(p.srs[q.id].due - Date.now() - DAY) < 1000);
for (const days of [3, 7, 16]) { recordAnswer(p, q, true); assert.ok(Math.abs(p.srs[q.id].due - Date.now() - days * DAY) < 1000, `stage ${days}`); }
recordAnswer(p, q, true);
assert.equal(p.srs[q.id], undefined);

// a due item is served as a DIFFERENT question testing the same rule
recordAnswer(p, q, false); p.srs[q.id].due = Date.now() - 1;
const rq = reviewQueue(p);
assert.equal(rq.length, 1); assert.notEqual(rq[0].q.id, q.id); assert.equal(rq[0].q.skill, q.skill);

// option shuffling keeps the key and the reasons aligned
for (let i = 0; i < 50; i++) { const s = shuffled(q); assert.equal(s.options[s.answer], q.options[q.answer]); assert.equal(s.why_wrong[s.answer], null); }
console.log('practice tests passed');
