// node scripts/check-courses.mjs [--only GE011,ENL181]
// Checks every content/courses/*.json against content/COURSE_SCHEMA.md. Exits 1 on any error.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'content/courses');
const args = process.argv.slice(2);
const onlyArg = args.includes('--only') ? args[args.indexOf('--only') + 1] : '';
const ONLY = onlyArg ? onlyArg.split(',').map((s) => s.trim().toUpperCase()) : null;

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const THAI = /[฀-๿]/;
// catalog.json is built from source/curriculum-extract.md and checked by validate, so it is the one source of descriptions
const CATALOG = JSON.parse(await readFile(path.join(ROOT, 'content/catalog.json'), 'utf8')).courses;
const thaiDescription = (code) => {
  const d = CATALOG.find((c) => c.code === code)?.desc_th;
  return d ? norm(d) : null;
};

const files = (await readdir(DIR)).filter((f) => f.endsWith('.json')).sort();
const ROOT_DIR = path.dirname(DIR);
const LESSON_IDS = new Set((await readdir(path.join(ROOT_DIR, 'lessons'))).map((f) => f.replace(/\.json$/, '')));
const INTERVIEW_IDS = new Set(JSON.parse(await readFile(path.join(ROOT_DIR, 'interview.json'), 'utf8')).questions.map((q) => q.id));
let errors = 0;
let warnings = 0;
const report = [];

for (const file of files) {
  const code = file.replace(/\.json$/, '');
  if (ONLY && !ONLY.includes(code.toUpperCase())) continue;
  const errs = [];
  const warns = [];
  const err = (m) => errs.push(m);
  let c;
  try {
    c = JSON.parse(await readFile(path.join(DIR, file), 'utf8'));
  } catch (e) {
    report.push({ code, errs: [`invalid JSON: ${e.message}`], warns, n: 0 });
    errors++;
    continue;
  }
  const raw = JSON.stringify(c);
  if (raw.includes('—')) err('contains an em-dash (U+2014)');
  if (c.code !== code) err(`code "${c.code}" does not match file name ${file}`);
  if (typeof c.basis_th !== 'string' || !c.basis_th) err('basis_th missing');
  if (!Array.isArray(c.in_class_th) || c.in_class_th.length < 3 || c.in_class_th.length > 5) err('in_class_th must have 3-5 items');
  const desc = thaiDescription(code);
  if (!desc) err(`no Thai description for ${code} in source/curriculum-extract.md`);
  if (!Array.isArray(c.units) || !c.units.length) err('units missing');

  const stems = new Map();
  const qids = new Set();
  const pos = [0, 0, 0, 0];
  let nq = 0;
  const covered = desc ? new Array(desc.length).fill(false) : null;

  (c.units ?? []).forEach((u, ui) => {
    const uid = `${code}-U${ui + 1}`;
    const at = (m) => err(`${u.id ?? uid}: ${m}`);
    if (u.id !== uid) at(`id should be ${uid}`);
    for (const l of u.lessons ?? []) if (!LESSON_IDS.has(l)) at(`lessons: ${l} does not exist in content/lessons`);
    for (const i of u.interview ?? []) if (!INTERVIEW_IDS.has(i)) at(`interview: ${i} does not exist in content/interview.json`);
    for (const k of ['title_th', 'title_en', 'covers', 'task_th']) if (typeof u[k] !== 'string' || !u[k].trim()) at(`${k} missing`);
    if (!Number.isFinite(u.minutes) || u.minutes <= 0) at('minutes must be a positive number');
    if (desc && typeof u.covers === 'string') {
      const cv = norm(u.covers);
      const i = desc.indexOf(cv);
      if (i < 0) at(`covers is not a substring of the Thai description: "${u.covers}"`);
      else for (let j = i; j < i + cv.length; j++) covered[j] = true;
    }
    if (!Array.isArray(u.cards) || u.cards.length < 3 || u.cards.length > 5) at('cards must have 3-5 items');
    (u.cards ?? []).forEach((cd, i) => { if (!cd.title_th || !cd.body_th) at(`card ${i} needs title_th and body_th`); });
    if (!Array.isArray(u.vocab) || u.vocab.length < 5 || u.vocab.length > 10) at('vocab must have 5-10 pairs');
    (u.vocab ?? []).forEach((p, i) => { if (!Array.isArray(p) || p.length !== 2 || !p[0] || !p[1] || THAI.test(p[0])) at(`vocab ${i} must be [English, Thai]`); });
    if (!Array.isArray(u.say) || u.say.length < 2 || u.say.length > 3) at('say must have 2-3 lines');
    (u.say ?? []).forEach((s, i) => { if (THAI.test(s)) at(`say ${i} should be English`); });
    const min = u.lessons?.length ? 4 : 8;
    if (!Array.isArray(u.questions) || u.questions.length < min) at(`needs at least ${min} questions`);
    (u.questions ?? []).forEach((q, qi) => {
      nq++;
      const qid = `${uid}-${String(qi + 1).padStart(2, '0')}`;
      const aq = (m) => err(`${q.id ?? qid}: ${m}`);
      if (q.id !== qid) aq(`id should be ${qid}`);
      if (qids.has(q.id)) aq('duplicate id');
      qids.add(q.id);
      if (q.skill !== uid) aq(`skill should be ${uid}`);
      if (![1, 2, 3].includes(q.difficulty)) aq('difficulty must be 1, 2 or 3');
      if (typeof q.stem !== 'string' || !q.stem.trim()) aq('stem missing');
      const key = norm(q.stem ?? '').toLowerCase();
      if (stems.has(key)) aq(`duplicate stem (also ${stems.get(key)})`);
      stems.set(key, q.id);
      if (!Array.isArray(q.options) || q.options.length !== 4) aq('needs exactly 4 options');
      else {
        if (q.options.some((o) => typeof o !== 'string' || !o.trim())) aq('empty option');
        if (new Set(q.options.map((o) => norm(o).toLowerCase())).size !== 4) aq('duplicate options');
      }
      if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 3) aq('answer must be an integer 0-3');
      else pos[q.answer]++;
      if (typeof q.explanation_th !== 'string' || !q.explanation_th.trim()) aq('explanation_th missing');
      if (!Array.isArray(q.why_wrong) || q.why_wrong.length !== 4) aq('why_wrong must have 4 entries');
      else q.why_wrong.forEach((w, i) => {
        if (i === q.answer && w !== null) aq(`why_wrong[${i}] must be null at the answer`);
        if (i !== q.answer && (typeof w !== 'string' || !w.trim())) aq(`why_wrong[${i}] needs a reason`);
      });
    });
  });

  const even = nq / 4;
  if (pos.some((p) => Math.abs(p - even) > 3)) err(`answer positions unbalanced ${JSON.stringify(pos)} (even is ${even})`);
  if (covered) {
    const missing = [...desc].map((ch, i) => (!covered[i] && /\S/.test(ch) ? ch : ' ')).join('').replace(/\s+/g, ' ').trim();
    if (missing) warns.push(`description not covered by any unit: "${missing}"`);
  }
  errors += errs.length;
  warnings += warns.length;
  report.push({ code, errs, warns, n: nq, units: c.units?.length ?? 0, pos });
}

for (const r of report) {
  console.log(`${r.errs.length ? 'FAIL' : 'ok  '} ${r.code}  units ${r.units}  questions ${r.n}  answer positions ${JSON.stringify(r.pos)}`);
  for (const e of r.errs) console.log(`  error: ${e}`);
  for (const w of r.warns) console.log(`  warn:  ${w}`);
}
if (!report.length) { console.log('no course files matched'); process.exit(1); }
console.log(`\n${report.length} course file(s), ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
