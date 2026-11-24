// Elective advisor: Jev's precomputed judgments (content/advisor/scores.json) + the student's answers -> careers,
// ranked courses, and a plan per elective slot with backups for when a section is full or registration is missed.
// All ranking is plain code over stored numbers, so it runs offline on GitHub Pages without an API key.
import goalsJson from '../content/advisor/goals.json';
import scoresJson from '../content/advisor/scores.json';
import { catalog, slotOptions, type CatalogCourse, type PlanItem, type Term } from './curriculum';

export type Goal = { id: string; th: string; about: string; si_th?: string };
type Pair = [score: number, confidence: number];
export const goals = goalsJson as { careers: Goal[]; interests: Goal[]; skills: Goal[] };
const scores = scoresJson as unknown as {
  model: string; generated: string;
  courses: Record<string, { careers: Record<string, Pair>; skills: Record<string, Pair> }>;
  careers: Record<string, Record<string, Pair>>;
};
export const JEV_MODEL = scores.model;

export type Answers = { dreams: string[]; interests: string[]; skills: string[] };
export const emptyAnswers = (): Answers => ({ dreams: [], interests: [], skills: [] });
export const hasAnswers = (a: Answers) => a.dreams.length + a.interests.length + a.skills.length > 0;

export type CareerFit = { career: Goal; fit: number; dream: boolean; because: Goal[] };

/** Dream careers first; the rest by how much their daily work involves what the student enjoys (Jev, 0-3 -> 0-1). */
export function rankCareers(a: Answers): CareerFit[] {
  return goals.careers.map((career) => {
    const s = scores.careers[career.id] ?? {};
    const liked = a.interests.map((id) => ({ g: goals.interests.find((x) => x.id === id)!, v: (s[id]?.[0] ?? 0) / 3 })).filter((x) => x.g);
    const interestFit = liked.length ? liked.reduce((m, x) => m + x.v, 0) / liked.length : 0;
    const dream = a.dreams.includes(career.id);
    return {
      career, dream,
      fit: (dream ? 1 : 0) + interestFit,
      because: liked.filter((x) => x.v >= 0.6).sort((x, y) => y.v - x.v).slice(0, 2).map((x) => x.g),
    };
  }).sort((x, y) => y.fit - x.fit || x.career.th.localeCompare(y.career.th));
}

/** Goals the course ranking aims at, with weights: dream careers (or the best-fitting ones) and chosen skills. */
export function targets(a: Answers, careers = rankCareers(a)): { kind: 'careers' | 'skills'; goal: Goal; w: number }[] {
  const picked = careers.filter((c) => c.dream).slice(0, 3);
  const top = picked.length ? picked : careers.filter((c) => c.fit > 0).slice(0, 2);
  const W = [1, 0.7, 0.5];
  return [
    ...top.map((c, i) => ({ kind: 'careers' as const, goal: c.career, w: W[i] })),
    ...a.skills.map((id) => goals.skills.find((g) => g.id === id)).filter((g): g is Goal => !!g).map((goal) => ({ kind: 'skills' as const, goal, w: 0.7 })),
  ];
}

export type CourseFit = { course: CatalogCourse; fit: number; best?: Goal; unsure: boolean };

/** Weighted mean of Jev's 0-3 scores over the target goals, as 0-1. `unsure` when Jev's confidence on the deciding goal is low. */
export function rankCourses(list: CatalogCourse[], t: ReturnType<typeof targets>): CourseFit[] {
  const total = t.reduce((m, x) => m + x.w, 0);
  return list.map((course) => {
    const s = scores.courses[course.code];
    if (!s || !total) return { course, fit: 0, unsure: true };
    const parts = t.map((x) => ({ x, p: s[x.kind][x.goal.id] ?? [0, 0] as Pair }));
    const best = parts.reduce((m, y) => (y.x.w * y.p[0] > m.x.w * m.p[0] ? y : m), parts[0]);
    return {
      course,
      fit: parts.reduce((m, y) => m + y.x.w * y.p[0], 0) / (3 * total),
      best: best.p[0] >= 1.5 ? best.x.goal : undefined,
      unsure: best.p[1] < 0.6,
    };
  }).sort((x, y) => y.fit - x.fit || x.course.code.localeCompare(y.course.code));
}

export type SlotPick = { item: Extract<PlanItem, { kind: 'slot' }>; term: Term; main?: CourseFit; backups: CourseFit[]; note_th?: string };

/** Courses taught in two parts: when both are picked, part I goes in the earlier slot. */
const SERIES = [['ENL575', 'ENL576'], ['ENL583', 'ENL584']];
const seriesOrder = (a: CourseFit, b: CourseFit) => {
  const s = SERIES.find((p) => p.includes(a.course.code) && p.includes(b.course.code));
  return s ? s.indexOf(a.course.code) - s.indexOf(b.course.code) : 0;
};

/**
 * One main course per ME and FE slot (distinct, best fit first) and up to `nBackups` backups each, taken from the
 * courses not used as a main pick. FE mains come from the curriculum's FE list; FE may be any course BU offers, so
 * unused major electives can back it up.
 * Special Interest has no course list in the curriculum: it gets a direction from the top career instead.
 */
export function planSlots(terms: Term[], a: Answers, nBackups = 3): SlotPick[] {
  const t = targets(a);
  const slots = terms.flatMap((term) => term.items.flatMap((item) => (item.kind === 'slot' ? [{ item, term }] : [])));
  const me = rankCourses(slotOptions('ME'), t);
  const meSlots = slots.filter((x) => x.item.slot === 'ME');
  const meMains = me.slice(0, meSlots.length).sort(seriesOrder);
  const used = new Set(meMains.map((c) => c.course.code));
  // the main FE pick comes from the curriculum's own FE list (always counts); unused major electives only back it up
  const feOwn = rankCourses(slotOptions('FE'), t);
  const feSlots = slots.filter((x) => x.item.slot === 'FE');
  const feMains = feOwn.slice(0, feSlots.length);
  const fe = rankCourses([...slotOptions('FE'), ...slotOptions('ME').filter((c) => !used.has(c.code))], t);
  feMains.forEach((c) => used.add(c.course.code));
  const top = rankCareers(a)[0];
  return slots.map(({ item, term }) => {
    if (item.slot === 'ME') {
      const i = meSlots.findIndex((x) => x.item.id === item.id);
      return { item, term, main: meMains[i], backups: me.filter((c) => !used.has(c.course.code)).slice(0, nBackups) };
    }
    if (item.slot === 'FE') {
      const i = feSlots.findIndex((x) => x.item.id === item.id);
      return { item, term, main: feMains[i], backups: fe.filter((c) => !used.has(c.course.code)).slice(0, nBackups) };
    }
    return { item, term, backups: [], note_th: top?.fit ? top.career.si_th : undefined };
  });
}

export const isMajorElective = (code: string) => catalog.find((c) => c.code === code)?.elective === 'ME';
