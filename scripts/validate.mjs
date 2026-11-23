// npm run validate: every question has one answer, an explanation and a reason per wrong option; every id and cross-reference
// (plan → catalog, course file → catalog, unit → lesson / interview) resolves; catalog.json matches the curriculum extract.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadContent, ROOT } from './lib.mjs';

const errors = []; const warns = [];
const err = (where, msg) => errors.push(`✗ ${where}: ${msg}`);
const warn = (where, msg) => warns.push(`! ${where}: ${msg}`);
const c = await loadContent();
const unitIds = new Set(c.courses.flatMap((x) => (x.units ?? []).map((u) => u.id)));
const skillIds = new Set([...c.skills.map((s) => s.id), ...unitIds]);
const codes = new Set(c.catalog.courses.map((x) => x.code));
const ids = new Map();

function checkMcq(q, where, { needBlank = true } = {}) {
  const w = `${where} ${q.id ?? '?'}`;
  if (!q.id) return err(where, 'missing id');
  if (ids.has(q.id)) err(w, `duplicate id (also in ${ids.get(q.id)})`); else ids.set(q.id, where);
  if (!skillIds.has(q.skill)) err(w, `unknown skill "${q.skill}"`);
  if (![1, 2, 3].includes(q.difficulty)) err(w, 'difficulty must be 1-3');
  if (!q.stem?.trim()) err(w, 'empty stem');
  if (needBlank && !q.stem.includes('___')) err(w, 'stem has no ___ blank');
  if (!Array.isArray(q.options) || q.options.length !== 4) return err(w, 'needs exactly 4 options');
  if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) err(w, 'options are not unique');
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) err(w, 'answer must be 0-3');
  if (!q.explanation_th?.trim()) err(w, 'missing explanation_th');
  if (!Array.isArray(q.why_wrong) || q.why_wrong.length !== 4) return err(w, 'why_wrong must have 4 entries');
  q.why_wrong.forEach((r, i) => {
    if (i === q.answer && r !== null) err(w, `why_wrong[${i}] is the correct answer, must be null`);
    if (i !== q.answer && !(typeof r === 'string' && r.trim().length >= 4)) err(w, `why_wrong[${i}] ("${q.options[i]}") needs a reason`);
  });
}

function checkTwist(t, where) {
  const w = `${where} ${t.id}`;
  if (ids.has(t.id)) err(w, 'duplicate id'); else ids.set(t.id, where);
  if (!skillIds.has(t.skill)) err(w, `unknown skill ${t.skill}`);
  if (!t.explanation_th) err(w, 'missing explanation_th');
  if (t.type === 'error') { if (!(t.parts?.length >= 3 && t.answer >= 0 && t.answer < t.parts.length && t.why_wrong?.length === t.parts.length && t.why_wrong[t.answer] === null)) err(w, 'bad error-spot twist'); }
  else if (t.type === 'fill') { if (!(t.stem?.split('___').length === 2 && t.accept?.length && t.hint_th)) err(w, 'fill twist needs one ___, accept[], hint_th'); }
  else if (t.type === 'order') { if (!(t.words?.length >= 4)) err(w, 'order twist needs >=4 words'); }
  else if (t.type === 'match') { if (!(t.pairs?.length >= 3 && t.prompt_th)) err(w, 'match twist needs >=3 pairs'); }
  else err(w, `unknown twist type ${t.type}`);
}

/* the catalog is generated, never hand-edited */
try { execFileSync('node', [path.join(ROOT, 'scripts/build-catalog.mjs'), '--check'], { stdio: 'pipe' }); }
catch (e) { err('content/catalog.json', String(e.stdout || e.message).trim()); }

/* plan → catalog */
for (const t of c.plan.terms) for (const list of Object.values(t.courses)) for (const code of list)
  if (!/^(SI|FE|ME)-\d+$/.test(code) && !codes.has(code)) err(`plan.json ${t.id}`, `${code} is not in catalog.json`);
for (const key of ['term1-start', 'term1-end', 'term2-start', 'term2-end', 'summer-start', 'summer-end'])
  if (!c.calendar.events.some((e) => e.key === key)) err('calendar.json', `missing event key ${key}`);

/* grammar lessons reused by course units */
for (const l of c.lessons) {
  const w = l.__file;
  if (!skillIds.has(l.skill)) err(w, `unknown skill ${l.skill}`);
  if (!(l.hook?.beats?.length >= 4)) err(w, 'hook needs >=4 beats');
  if (!(l.discover?.answer >= 0 && l.discover.answer < l.discover.options_th.length)) err(w, 'discover answer out of range');
  if (!l.rule?.line_th || !l.rule?.memory_th) err(w, 'rule needs line_th and memory_th');
  if (!(l.speak?.length >= 2)) err(w, 'speak needs 2-3 sentences');
  if (!c.clozes.some((x) => x.id === l.cloze)) err(w, `cloze ${l.cloze} not found`);
  l.questions.forEach((q) => checkMcq(q, w));
  l.twists.forEach((t) => checkTwist(t, w));
}
for (const x of c.clozes) {
  const w = x.__file;
  if (x.items?.length !== 10) err(w, `cloze needs 10 items (has ${x.items?.length})`);
  for (let n = 1; n <= (x.items?.length ?? 0); n++) if (x.text.split(`(${n})`).length !== 2) err(w, `blank (${n}) must appear once in text`);
  x.items?.forEach((q) => checkMcq(q, w));
}

/* speaking bank */
for (const q of c.interview.questions) {
  if (ids.has(q.id)) err(`interview ${q.id}`, 'duplicate id'); else ids.set(q.id, 'interview');
  for (const k of ['q', 'q_th', 'sample', 'frame', 'tip_th', 'cat']) if (!q[k]) err(`interview ${q.id}`, `missing ${k}`);
  if (!c.interview.categories.some((x) => x.id === q.cat)) err(`interview ${q.id}`, `unknown category ${q.cat}`);
}
for (const v of c.videos.videos) {
  for (const k of ['id', 'topic', 'lang', 'title', 'channel', 'duration', 'checked']) if (!v[k]) err(`videos ${v.id}`, `missing ${k}`);
  if (!c.videos.topics.some((t) => t.id === v.topic)) err(`videos ${v.id}`, `unknown topic ${v.topic}`);
}

/* course files (their own schema is checked by scripts/check-courses.mjs); here: references resolve */
const lessonIds = new Set(c.lessons.map((l) => l.id));
const interviewIds = new Set(c.interview.questions.map((q) => q.id));
for (const f of c.courses) {
  const w = f.__file;
  if (!codes.has(f.code)) err(w, `code ${f.code} is not in catalog.json`);
  for (const u of f.units ?? []) {
    for (const id of u.lessons ?? []) if (!lessonIds.has(id)) err(`${w} ${u.id}`, `reuses missing lesson ${id}`);
    for (const id of u.interview ?? []) if (!interviewIds.has(id)) err(`${w} ${u.id}`, `reuses missing interview question ${id}`);
    (u.questions ?? []).forEach((q) => checkMcq(q, `${w} ${u.id}`, { needBlank: false }));
    if (!(u.say?.length)) warn(`${w} ${u.id}`, 'no say lines');
  }
}

/* this project is not AU Quest any more */
const AU = /\bAU\b|Assumption University|ABAC|scholarship interview/;
for (const f of [...c.lessons, ...c.clozes, ...c.courses]) if (AU.test(JSON.stringify(f))) err(f.__file, 'mentions AU / the old scholarship goal');
if (AU.test(JSON.stringify([c.interview, c.shadowing, c.videos]))) err('interview/shadowing/videos', 'mentions AU / the old scholarship goal');

const sum = {
  catalog: c.catalog.courses.length, courseFiles: c.courses.map((x) => x.code).join(' ') || 'none yet',
  units: unitIds.size, unitQuestions: c.courses.reduce((a, x) => a + (x.units ?? []).reduce((b, u) => b + (u.questions?.length ?? 0), 0), 0),
  lessons: c.lessons.length, lessonQuestions: c.lessons.reduce((a, l) => a + l.questions.length, 0), cloze: c.clozes.length,
  interview: c.interview.questions.length, shadowing: c.shadowing.length, videos: c.videos.videos.length,
};
console.log('Early Bird content:', sum);
warns.forEach((x) => console.log(x));
if (errors.length) { errors.forEach((x) => console.log(x)); console.log(`\n${errors.length} error(s)`); process.exit(1); }
console.log(`\n✓ validate passed (${warns.length} warning(s))`);
