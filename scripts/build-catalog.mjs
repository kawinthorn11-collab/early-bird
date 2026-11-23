// npm run catalog: parses source/curriculum-extract.md into content/catalog.json.
// `--check` exits 1 when content/catalog.json is stale, so validate can prove the file came from this script.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'source/curriculum-extract.md');
const OUT = path.join(ROOT, 'content/catalog.json');

const md = await readFile(SRC, 'utf8');
const lines = md.split('\n');
const THAI = /[฀-๿]/;
const clean = (s) => s.replace(/\*\*/g, '').replace(/\s*\(.*?หน่วยกิต.*?\)\s*/g, ' ').replace(/^[ก-ฮ]\.\s*/, '').replace(/^\d+\.\s*/, '').replace(/,\s*pp?\.[\d–-]+$/, '').trim();

const s2 = lines.findIndex((l) => l.startsWith('## 2.'));
const s3 = lines.findIndex((l) => l.startsWith('## 3.'));
const s4 = lines.findIndex((l) => l.startsWith('### Description count'));
if (s2 < 0 || s3 < 0 || s4 < 0) throw new Error('curriculum-extract.md: section markers not found');

/** Section 2 tables say which elective lists a course belongs to. */
const lists = new Map();
let bucket = '', electiveGroup = '';
for (const l of lines.slice(s2, s3)) {
  if (/^#{3}\s/.test(l)) { bucket = l; electiveGroup = ''; }
  else if (/^\*\*กลุ่มวิชา/.test(l)) { bucket = l; electiveGroup = ''; }
  else if (/^\d\.\s+กลุ่มวิชา/.test(l)) electiveGroup = clean(l);
  const row = l.match(/^\|\s*[^|]+\|\s*([A-Z]{2,3}\d{3})\s*\|/);
  if (!row) continue;
  const code = row[1];
  const e = lists.get(code) ?? { me: [], fe: false };
  if (bucket.includes('เฉพาะด้าน-เลือก') && electiveGroup && !e.me.includes(electiveGroup)) e.me.push(electiveGroup);
  if (bucket.includes('เลือกเสรี')) e.fe = true;
  lists.set(code, e);
}

const HEAD = /^\*\*(\S+)\s+(.+?)\s+(\d+\s*\(\d+\s*–\s*\d+\s*–\s*\d+\))\s*\/\s*([A-Z]{2,3}\d{3})\s+(.+?)\*\*/;
const courses = [];
let group = '', area = '', cur = null;
const finish = () => { if (cur) courses.push(cur); cur = null; };
for (const raw of lines.slice(s3, s4)) {
  const l = raw.trim();
  if (/^#{3,4}\s/.test(l)) { finish(); group = clean(l.replace(/^#+\s*/, '')); area = ''; continue; }
  if (/^#{5}\s/.test(l)) { finish(); area = clean(l.replace(/^#+\s*/, '')); continue; }
  const h = l.match(HEAD);
  if (h) {
    finish();
    const [, codeTh, nameTh, credits, code, nameEn] = h;
    const e = lists.get(code);
    cur = {
      code, code_th: codeTh, name_th: nameTh.trim(), name_en: nameEn.trim(), credits: credits.replace(/\s+/g, ' '),
      group, ...(area && { area }), desc_th: '', desc_en: '', prerequisite: [],
      ...(e?.me.length && { elective: 'ME', me_groups: e.me }), ...(e?.fe && { elective: 'FE' }),
    };
    continue;
  }
  if (!cur || !l || l.startsWith('(') || l.startsWith('>')) continue;
  if (l.startsWith('วิชาบังคับก่อน')) { cur.prerequisite = [...l.matchAll(/Prerequisite:\s*([A-Z]{2,3}\s?\d{3})/g)].map((m) => m[1].replace(/\s/g, '')); continue; }
  if (THAI.test(l) && !cur.desc_th) cur.desc_th = l;
  else if (!THAI.test(l) && cur.desc_th && !cur.desc_en) cur.desc_en = l;
}
finish();

const missing = courses.filter((c) => !c.desc_th || !c.desc_en).map((c) => c.code);
if (missing.length) throw new Error(`courses without a TH/EN description: ${missing.join(', ')}`);
const dupes = courses.map((c) => c.code).filter((c, i, a) => a.indexOf(c) !== i);
if (dupes.length) throw new Error(`duplicate course codes: ${dupes.join(', ')}`);

const out = `${JSON.stringify({
  source: 'source/curriculum-extract.md (รายละเอียดหลักสูตร สาขาวิชาภาษาอังกฤษ V.67.3)',
  generated_by: 'scripts/build-catalog.mjs',
  courses,
}, null, 1)}\n`;

if (process.argv.includes('--check')) {
  const now = await readFile(OUT, 'utf8').catch(() => '');
  if (now !== out) { console.log('content/catalog.json is out of date: run npm run catalog'); process.exit(1); }
  console.log(`catalog.json is current (${courses.length} courses)`);
} else {
  await writeFile(OUT, out);
  console.log(`wrote content/catalog.json: ${courses.length} courses`);
}
