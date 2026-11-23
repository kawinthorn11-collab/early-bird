import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const C = (...p) => path.join(ROOT, 'content', ...p);
const readJson = async (f) => JSON.parse(await readFile(f, 'utf8'));
const dir = async (d) => (await readdir(C(d)).catch(() => [])).filter((f) => f.endsWith('.json')).sort();

export async function loadContent() {
  const lessons = []; for (const f of await dir('lessons')) lessons.push({ ...(await readJson(C('lessons', f))), __file: `lessons/${f}` });
  const clozes = []; for (const f of await dir('cloze')) clozes.push({ ...(await readJson(C('cloze', f))), __file: `cloze/${f}` });
  const courses = []; for (const f of await dir('courses')) courses.push({ ...(await readJson(C('courses', f))), __file: `courses/${f}` });
  return {
    skills: await readJson(C('skills.json')), lessons, clozes, readings: [], courses,
    interview: await readJson(C('interview.json')), shadowing: await readJson(C('shadowing.json')), videos: await readJson(C('videos.json')),
    plan: await readJson(C('plan.json')), catalog: await readJson(C('catalog.json')), calendar: await readJson(C('calendar.json')),
  };
}

/** Must match audioKey() in src/audio.ts */
export function audioKey(voice, text, slow = false) {
  const s = `${voice}|${text.trim()}${slow ? '|slow' : ''}`;
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
