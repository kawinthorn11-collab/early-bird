// npm run add:questions -- new.json
// new.json = an array of MCQs (same fields as lesson questions). Each goes into the lesson that teaches its `skill`
// (or into `"lesson": "L05"` if given). Duplicate ids are skipped. Then `npm run validate` checks everything.
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, C } from './lib.mjs';

const file = process.argv[2];
if (!file) { console.log('usage: npm run add:questions -- path/to/new-questions.json'); process.exit(1); }
const incoming = JSON.parse(await readFile(path.resolve(file), 'utf8'));
if (!Array.isArray(incoming)) { console.log('file must contain a JSON array of questions'); process.exit(1); }
const skills = JSON.parse(await readFile(C('skills.json'), 'utf8'));

const touched = new Map();
let added = 0, skipped = 0;
for (const q of incoming) {
  const lid = q.lesson ?? skills.find((s) => s.id === q.skill)?.lesson;
  if (!lid) { console.log(`✗ ${q.id}: no lesson for skill "${q.skill}"`); skipped++; continue; }
  const f = C('lessons', `${lid}.json`);
  const l = touched.get(f) ?? JSON.parse(await readFile(f, 'utf8').catch(() => 'null'));
  if (!l) { console.log(`✗ ${q.id}: lesson ${lid} does not exist yet`); skipped++; continue; }
  if (l.questions.some((x) => x.id === q.id)) { skipped++; continue; }
  const { lesson, ...clean } = q;
  l.questions.push(clean); touched.set(f, l); added++;
}
for (const [f, l] of touched) await writeFile(f, JSON.stringify(l, null, 2));
console.log(`added ${added}, skipped ${skipped}`);
try { execFileSync('node', [path.join(ROOT, 'scripts/validate.mjs')], { stdio: 'inherit' }); }
catch { console.log('\nvalidate failed — fix the items above (git/backup lets you undo).'); process.exit(1); }
