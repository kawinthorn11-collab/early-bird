// node scripts/check-answers.mjs [--only GE011,ENL181] [--model cx/gpt-6.1-terra] [--out /path/report.json]
// Second-opinion audit: asks a model (via local 9Router) which options are acceptable for each MCQ in
// content/courses/*.json, blind to our key. Flags items where it finds 0 or 2+ acceptable options, or a different one.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = path.resolve(ROOT, '../au-quest/.env');
const KEY = (await readFile(ENV, 'utf8').catch(() => '')).match(/^NINEROUTER_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) { console.log(`Add NINEROUTER_API_KEY=... to ${ENV} first.`); process.exit(1); }

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const MODEL = flag('model', 'cx/gpt-6.1-terra');
const ONLY = flag('only', '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
const OUT = flag('out', '');

const dir = path.join(ROOT, 'content/courses');
const todo = [];
for (const f of (await readdir(dir)).filter((x) => x.endsWith('.json')).sort()) {
  const code = f.replace(/\.json$/, '');
  if (ONLY.length && !ONLY.includes(code.toUpperCase())) continue;
  const c = JSON.parse(await readFile(path.join(dir, f), 'utf8'));
  for (const u of c.units) for (const q of u.questions) todo.push({ q, ctx: `COURSE ${code}, UNIT "${u.title_en}"` });
}

async function ask(group) {
  const prompt = group.map((j, k) => `#${k} ${j.q.id} (${j.ctx})\nQUESTION: ${j.q.stem}\n${j.q.options.map((o, i) => `${i}) ${o}`).join('\n')}`).join('\n\n---\n\n');
  const r = await fetch('http://localhost:20128/v1/chat/completions', {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, temperature: 0, max_tokens: 2500, messages: [
      { role: 'system', content: 'You are a strict exam editor for first-year university pre-study quizzes (thinking skills, study skills, technology, well-being, English). Items may be in Thai or English. For each item, list EVERY option index that a careful subject teacher would accept as correct, using well-established facts and standard definitions. Be strict but honest: if two options are both defensible, list both. Reply ONLY JSON: {"items":[{"n":0,"ok":[1],"note":"short reason if more than one or none"}]}' },
      { role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`9Router ${r.status}`);
  const txt = (await r.json()).choices[0].message.content.replace(/^```json|```$/gm, '');
  return JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1)).items;
}

const flagged = [];
const groups = [];
for (let i = 0; i < todo.length; i += 8) groups.push(todo.slice(i, i + 8));
let done = 0;
let failed = 0;
async function worker() {
  while (groups.length) {
    const g = groups.shift();
    let res;
    for (let t = 0; t < 2 && !res; t++) {
      try { res = await ask(g); } catch (e) { if (t) { failed += g.length; console.log('\nskip group', g[0].q.id, e.message); } }
    }
    const seen = new Set();
    for (const it of res ?? []) {
      const j = g[it.n];
      if (!j || seen.has(it.n)) continue;
      seen.add(it.n);
      const ok = [...new Set(it.ok)];
      if (ok.length !== 1 || ok[0] !== j.q.answer) flagged.push({ id: j.q.id, key: j.q.answer, model: ok, stem: j.q.stem, options: j.q.options, note: it.note });
    }
    if (res) failed += g.length - seen.size;
    done += g.length;
    process.stdout.write(`\r${done}/${todo.length} checked, ${flagged.length} flagged`);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log(`\nchecked ${todo.length - failed}, NOT checked (errors) ${failed}, flagged ${flagged.length}`);
for (const f of flagged) console.log(`\n${f.id} key ${f.key} model ${JSON.stringify(f.model)}\n  ${f.stem}\n${f.options.map((o, i) => `  ${i}) ${o}`).join('\n')}\n  note: ${f.note ?? ''}`);
if (OUT) await writeFile(OUT, JSON.stringify({ model: MODEL, at: new Date().toISOString(), checked: todo.length - failed, failed, flagged }, null, 1));
