// node scripts/jev-advisor.mjs [--dry]
// Asks Jev (TypeSafe System One) two sets of judgments and saves them to content/advisor/scores.json:
//   1. how much each elective course (ME and FE lists) prepares a student for each career path and skill
//   2. how much each career's daily work involves each interest
// The app ranks careers and courses from these numbers, so it needs no API key at runtime (GitHub Pages is static).
// Key: TYPESAFE_API_KEY in .env (never printed). --dry prints one request instead of calling the API.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');
const API = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';

async function apiKey() {
  if (process.env.TYPESAFE_API_KEY) return process.env.TYPESAFE_API_KEY;
  try {
    const m = (await readFile(path.join(ROOT, '.env'), 'utf8')).match(/^\s*TYPESAFE_API_KEY\s*=\s*(\S+)/m);
    if (m) return m[1];
  } catch {}
  return null;
}

const goals = JSON.parse(await readFile(path.join(ROOT, 'content/advisor/goals.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(ROOT, 'content/catalog.json'), 'utf8')).courses;
const electives = catalog.filter((c) => c.elective);

const COURSE_LEVELS = [
  'The course content has nothing to do with this goal.',
  'The course gives general background that this goal only occasionally uses.',
  'The course practises some tasks or knowledge that this goal uses regularly.',
  'The course directly trains the main everyday work of this goal.',
];
const INTEREST_LEVELS = [
  'This work almost never involves it.',
  'This work involves it now and then.',
  'This work involves it often.',
  'It is the heart of this work, done nearly every day.',
];

const goalList = [...goals.careers.map((g) => ({ ...g, key: `career_${g.id}` })), ...goals.skills.map((g) => ({ ...g, key: `skill_${g.id}` }))];

const courseRequest = (c) => ({
  model: MODEL,
  state: { course: { code: c.code, name: c.name_en, description: c.desc_en, description_th: c.desc_th, elective_group: c.me_groups ?? ['free elective'] } },
  questions: Object.fromEntries(goalList.map((g) => [g.key, {
    type: 'score',
    instructions: `How much does taking the university course in \`course\` prepare a student for this goal: ${g.about}`,
    criteria: COURSE_LEVELS,
  }])),
});

const careerRequest = (career) => ({
  model: MODEL,
  state: { career: career.about },
  questions: Object.fromEntries(goals.interests.map((i) => [`interest_${i.id}`, {
    type: 'score',
    instructions: `How much of the daily work of the career in \`career\` involves ${i.about}?`,
    criteria: INTEREST_LEVELS,
  }])),
});

async function ask(key, body, tries = 5) {
  for (let i = 0; ; i++) {
    const r = await fetch(API, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status === 529) && i < tries) { await new Promise((res) => setTimeout(res, 1500 * 2 ** i)); continue; }
    throw new Error(`TypeSafe ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
}

/** Run `fn` over `items` with at most `n` requests in flight. */
async function pool(items, n, fn) {
  const out = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; out[i] = await fn(items[i]); } }));
  return out;
}

const pack = (a) => [Math.round(a.score * 1000) / 1000, Math.round(a.confidence * 1000) / 1000];

if (DRY) {
  console.log(JSON.stringify(courseRequest(electives[0]), null, 2).slice(0, 2500));
  console.log(`\n${electives.length} course requests x ${goalList.length} questions, ${goals.careers.length} career requests x ${goals.interests.length} questions`);
  process.exit(0);
}

const key = await apiKey();
if (!key) { console.error('TYPESAFE_API_KEY is not set in .env. Create a key at console.typesafe.ai/keys and add TYPESAFE_API_KEY=... to .env'); process.exit(1); }

let tokens = 0; let model = '';
const take = (res, prefix) => {
  tokens += res.usage?.input_tokens ?? 0; model = res.model ?? model;
  return Object.fromEntries(Object.entries(res.answers).map(([k, a]) => [k.slice(prefix.length), pack(a)]));
};

const courseAnswers = await pool(electives, 4, async (c) => {
  const res = await ask(key, courseRequest(c));
  const careers = {}; const skills = {};
  for (const [k, a] of Object.entries(res.answers)) (k.startsWith('career_') ? careers : skills)[k.replace(/^(career|skill)_/, '')] = pack(a);
  tokens += res.usage?.input_tokens ?? 0; model = res.model ?? model;
  return [c.code, { careers, skills }];
});
const careerAnswers = await pool(goals.careers, 4, async (g) => [g.id, take(await ask(key, careerRequest(g)), 'interest_')]);

const out = {
  about: 'Generated by scripts/jev-advisor.mjs. Each value is [score, confidence]; score runs 0-3 on the levels in the script. Do not edit by hand.',
  model, generated: new Date().toISOString().slice(0, 10),
  course_levels: COURSE_LEVELS, interest_levels: INTEREST_LEVELS,
  courses: Object.fromEntries(courseAnswers),
  careers: Object.fromEntries(careerAnswers),
};
await writeFile(path.join(ROOT, 'content/advisor/scores.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`saved ${electives.length} courses x ${goalList.length} goals and ${goals.careers.length} careers x ${goals.interests.length} interests with ${model}; ${tokens} input tokens`);
