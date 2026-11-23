// Question selection and spaced review over any pool of MCQs.
import { allMcqs } from './courses';
import { DAY, skillStats } from './store';
import type { MCQ, Progress } from './types';

export function shuffle<T>(a: T[]): T[] { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

/** Shuffle options every time, keeping answer and why_wrong aligned. */
export function shuffled(q: MCQ): MCQ {
  const order = shuffle(q.options.map((_, i) => i));
  return { ...q, options: order.map((i) => q.options[i]), why_wrong: order.map((i) => q.why_wrong[i]), answer: order.indexOf(q.answer) };
}

const fresh = (p: Progress, q: MCQ) => !p.lastSeen[q.id] || Date.now() - p.lastSeen[q.id] > 7 * DAY || !!p.srs[q.id];

/** Pick n questions for a skill from a pool, unseen-in-7-days first, never the excluded ids. */
export function pickForSkill(p: Progress, skill: string, n: number, exclude: string[] = [], pool: MCQ[] = allMcqs) {
  const all = pool.filter((q) => q.skill === skill && !exclude.includes(q.id));
  const a = shuffle(all.filter((q) => fresh(p, q)));
  const b = shuffle(all.filter((q) => !fresh(p, q))).sort((x, y) => (p.lastSeen[x.id] ?? 0) - (p.lastSeen[y.id] ?? 0));
  return [...a, ...b].slice(0, n);
}

/** Due review: each missed item comes back as a *different* question on the same skill when one exists. */
export function reviewQueue(p: Progress, max = 10, pool: MCQ[] = allMcqs): { q: MCQ; key: string }[] {
  const now = Date.now();
  const due = Object.entries(p.srs).filter(([, v]) => v.due <= now).sort((a, b) => a[1].due - b[1].due).slice(0, max);
  const used: string[] = [];
  return due.flatMap(([key, v]) => {
    const q = pickForSkill(p, v.skill, 1, [v.qid, ...used], pool)[0] ?? pool.find((x) => x.id === v.qid);
    if (!q) return [];
    used.push(q.id);
    return [{ q, key }];
  });
}

/** Skills ordered weakest first, by recent accuracy (with a +1/+2 prior so one miss does not dominate). */
export function weakest(p: Progress, among: string[]): string[] {
  const st = skillStats(p);
  return among.filter((id) => st[id]).map((id) => ({ id, acc: (st[id].ok + 1) / (st[id].n + 2) })).sort((a, b) => a.acc - b.acc).map((x) => x.id);
}
