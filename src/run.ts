// Quick Run: a 2-minute mixed round set drawn from the course units that are open today.
import { lessons, shadowing } from './content';
import { interviewOf, lessonsOf, type CourseUnit } from './courses';
import { reviewQueue, shuffle, shuffled, weakest } from './practice';
import { DAY } from './store';
import type { Lesson, MCQ, Progress, Twist } from './types';

type ErrorTwist = Extract<Twist, { type: 'error' }>;
type OrderTwist = Extract<Twist, { type: 'order' }>;

/** One rapid round. `key` is unique within a run and names the underlying item; `src` is the unit (or lesson) it came from. */
export type Round =
  | { kind: 'pick'; key: string; skill: string; src: string; q: MCQ; srsKey?: string }
  | { kind: 'spot'; key: string; skill: string; src: string; t: ErrorTwist }
  | { kind: 'order'; key: string; skill: string; src: string; t: OrderTwist }
  | { kind: 'match'; key: string; skill: string; src: string; prompt: string; left: string; options: string[]; answer: number; explain: string }
  | { kind: 'say'; key: string; skill: string; src: string; text: string; th: string };
export type RoundKind = Round['kind'];

/** Everything one unit (or, with no course content yet, one grammar lesson) can put into a run. */
type MatchSet = { id: string; skill: string; prompt: string; pairs: [string, string][]; explain: string };
type Source = { id: string; skill: string; mcqs: MCQ[]; twists: Twist[]; matches: MatchSet[]; says: { text: string; th: string }[] };

const firstSentence = (s: string) => s.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? s;
const lessonParts = (ls: Lesson[]) => ({
  mcqs: ls.flatMap((l) => l.questions),
  twists: ls.flatMap((l) => l.twists),
  matches: ls.flatMap((l) => l.twists.flatMap((t) => (t.type === 'match' ? [{ id: t.id, skill: t.skill, prompt: t.prompt_th, pairs: t.pairs, explain: t.explanation_th }] : []))),
  says: ls.flatMap((l) => l.speak.map((text) => ({ text, th: l.title_th }))),
});

export function unitSource(u: CourseUnit): Source {
  const reused = lessonParts(lessonsOf(u));
  return {
    id: u.id, skill: u.id,
    mcqs: [...u.questions, ...reused.mcqs],
    twists: reused.twists,
    matches: [...(u.vocab.length >= 3 ? [{ id: `${u.id}:vocab`, skill: u.id, prompt: `ศัพท์จากหน่วย ${u.title_th} หมายถึงอะไร`, pairs: u.vocab, explain: '' }] : []), ...reused.matches],
    says: [...u.say.map((text) => ({ text, th: u.title_th })), ...interviewOf(u).map((q) => ({ text: firstSentence(q.sample), th: q.q_th })), ...reused.says],
  };
}
/** Used only while no course unit is open yet, so the first run still has something to play. */
const lessonSource = (l: Lesson): Source => ({ id: l.id, skill: l.skill, ...lessonParts([l]) });
export const fallbackSources = () => lessons.filter((l) => l.phase === 1).map(lessonSource);

export const RUN_LENGTH = 6;
const MAX_DUE = 2;
const MAX_TARGETS = 4;
/** A quick win first, the voice in the middle, the three other formats in a new order every run. */
const template = (): RoundKind[] => {
  const [a, b, c] = shuffle<RoundKind>(['spot', 'match', 'order']);
  return ['pick', a, 'say', b, c, 'pick', a];
};

/** Seconds before the speed bonus is gone. Running out never fails the round. */
export const ROUND_SECONDS: Record<RoundKind, number> = { pick: 12, spot: 14, match: 12, order: 20, say: 0 };

/**
 * Builds one run. `focus` (today's units) and the weakest open units are aimed at first; items met in the last day go
 * last so a miss waits for its spaced review. Due reviews always lead.
 */
export function buildRun(p: Progress, sources: Source[], focus: string[] = []): Round[] {
  const now = Date.now();
  const used = new Set<string>();
  const seenAt = (id: string) => p.lastSeen[id] ?? 0;
  const recent = (id: string) => now - seenAt(id) < DAY;
  const take = <T extends Round>(r: T | null | undefined): T | null => {
    if (!r || used.has(r.key)) return null;
    used.add(r.key);
    if (r.kind === 'pick') used.add(r.q.id);
    return r;
  };
  /** Unseen-today items first; when a small pool runs dry (right after studying a unit), the least recently seen fill in. */
  const freshest = <T extends { id: string }>(xs: T[], loose = false) => {
    const open = shuffle(xs.filter((x) => !used.has(x.id)));
    return [...open.filter((x) => !recent(x.id)), ...(loose ? open.filter((x) => recent(x.id)).sort((a, b) => seenAt(a.id) - seenAt(b.id)) : [])];
  };

  const pool = sources.flatMap((s) => s.mcqs);
  const srcOf = (qid: string) => sources.find((s) => s.mcqs.some((q) => q.id === qid))?.id ?? '';
  const due: Round[] = reviewQueue(p, MAX_DUE).flatMap(({ q, key }) => {
    const r = take({ kind: 'pick', key: q.id, skill: q.skill, src: srcOf(q.id), q: shuffled(q), srsKey: key });
    return r ? [r] : [];
  });

  const byId = new Map(sources.map((s) => [s.id, s]));
  const order = [...focus, ...weakest(p, sources.map((s) => s.id)), ...shuffle(sources.map((s) => s.id))];
  const targets = [...new Set(order)].flatMap((id) => byId.get(id) ?? []).slice(0, MAX_TARGETS);
  if (!targets.length) return due;

  const make: Record<RoundKind, (s: Source, loose?: boolean) => Round | null> = {
    pick: (s, loose) => {
      const qs = freshest(s.mcqs, loose);
      const q = qs.find((x) => (x.stage ?? 1) === 1 && !recent(x.id)) ?? qs[0];
      return q ? { kind: 'pick', key: q.id, skill: q.skill, src: s.id, q: shuffled(q) } : null;
    },
    spot: (s, loose) => {
      const t = freshest(s.twists.filter((x): x is ErrorTwist => x.type === 'error'), loose)[0];
      return t ? { kind: 'spot', key: t.id, skill: t.skill, src: s.id, t } : null;
    },
    order: (s, loose) => {
      const t = freshest(s.twists.filter((x): x is OrderTwist => x.type === 'order'), loose)[0];
      return t ? { kind: 'order', key: t.id, skill: t.skill, src: s.id, t } : null;
    },
    match: (s, loose) => {
      const pick = freshest(s.matches.flatMap((m) => m.pairs.map((_, i) => ({ m, i, id: `${m.id}#${i}` }))), loose)[0];
      if (!pick) return null;
      const { m, i } = pick;
      const rights = [...new Set(m.pairs.map((x) => x[1]))];
      const options = shuffle([m.pairs[i][1], ...shuffle(rights.filter((r) => r !== m.pairs[i][1])).slice(0, 3)]);
      if (options.length < 2) return null;
      return { kind: 'match', key: pick.id, skill: m.skill, src: s.id, prompt: m.prompt, left: m.pairs[i][0], options, answer: options.indexOf(m.pairs[i][1]), explain: m.explain };
    },
    say: (s) => {
      if ([...used].some((k) => k.startsWith('say:'))) return null;
      const own = shuffle(s.says);
      const line = own.find((x) => !used.has(`say:${x.text}`)) ?? shuffle(shadowing.filter((x) => x.level === 'A2'))[0];
      return line ? { kind: 'say', key: `say:${line.text}`, skill: s.skill, src: s.id, text: line.text, th: line.th } : null;
    },
  };

  const plan = template().slice(due.length ? 1 : 0);
  const rounds: Round[] = [...due];
  const everyone = [...targets, ...sources.filter((s) => !targets.includes(s))];
  for (let i = 0; rounds.length < RUN_LENGTH && i < plan.length * 3; i++) {
    const kind = plan[i % plan.length];
    const tries = [...targets.map((_, k) => targets[(i + k) % targets.length]), ...everyone];
    const r = tries.reduce<Round | null>((got, s) => got ?? take(make[kind](s)), null)
      ?? tries.reduce<Round | null>((got, s) => got ?? take(make.pick(s)), null)
      ?? tries.reduce<Round | null>((got, s) => got ?? take(make[kind](s, true)), null)
      ?? tries.reduce<Round | null>((got, s) => got ?? take(make.pick(s, true)), null);
    if (r) rounds.push(r);
  }
  return rounds;
}

/** Combo and XP for one answer. Slow answers lose only the speed bonus; a miss resets the combo and nothing else. */
export function score(combo: number, ok: boolean, fast: boolean) {
  if (!ok) return { combo: 0, mult: 1, bonus: 0 };
  const next = combo + 1;
  const mult = Math.min(4, next);
  return { combo: next, mult, bonus: (mult - 1) * 3 + (fast ? 3 : 0) };
}

export const RUN_FINISH_XP = 15;
export const SAY_XP = 8;
