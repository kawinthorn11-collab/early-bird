// Run with: npm test
import assert from 'node:assert/strict';
import { unheard, analyse, feedback, tokens } from '../src/speech';

// unheard words are found by alignment, so extra/ filler words in the transcript do not shift them
assert.deepEqual([...unheard('My brother works in a bank.', 'um my brother work in bank')], [2, 4]);
assert.deepEqual([...unheard('Could you repeat that, please?', 'could you repeat that please')], []);
assert.deepEqual(tokens("It's OK, um..."), ["it's", 'ok', 'um']);

// 4 s of speech (80 frames at 50 ms), with one 1.5 s silence in the middle → 1 long pause
const loud = Array(30).fill(-20), quiet = Array(30).fill(-60);
const a = analyse('um I want to study business because I like numbers', 'test', [...quiet, ...loud, ...quiet, ...loud]);
assert.equal(a.fillers, 1);
assert.equal(a.pauses, 1);
assert.ok(a.wpm > 0 && a.loudOk === 1, JSON.stringify(a));

// rule-based feedback (no AI model) gives exactly three parts and names the unheard word
const f = await feedback(analyse('my brother work in a bank', 'test', loud), { target: 'My brother works in a bank.' }, { aiModel: '' } as never);
assert.ok(f.good && f.fix && f.better);
assert.match(f.fix, /works/);
console.log('speech tests passed');
