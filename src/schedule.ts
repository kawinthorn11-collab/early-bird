// The pre-study scheduler: which course units are open today, and which one is today's new unit.
// Pure: everything it knows comes in as arguments, so a test can fix the date.
import { addDays, daysBetween, type ISODate } from './dates';
import { itemCode, type Term } from './curriculum';

export type TermStatus = 'past' | 'now' | 'pre-study' | 'later';
/** review = the course's term has started; pre-study = study it now; later = after the next term. */
export type CourseMode = 'review' | 'pre-study' | 'later';
export type QueuedUnit = { unitId: string; code: string; termId: string; prepBy: ISODate };

export type Schedule = {
  today: ISODate;
  termStatus: Record<string, TermStatus>;
  courseMode: Record<string, CourseMode>;
  /** The next term to open, counted in days from today. */
  nextStart: { term: Term; days: number } | null;
  /** Units not finished before today, in study order (earliest deadline first). */
  queue: QueuedUnit[];
  /** Today's new units. A unit finished today stays here so the screen can show it as done. */
  todayUnits: QueuedUnit[];
  /** The pace that finishes every queued unit by its deadline: one unit every `everyDays` days, or `perDay` a day. */
  pace: { perDay: number; everyDays: number } | null;
  /** The next day a new unit is due (today when one is due now). */
  nextDue: ISODate | null;
  unlocked: Set<string>;
};

/**
 * Units of a term must be finished by its deadline. The two halves of semester 1 (1/1 and 1/2) share the semester's
 * opening day as their first deadline; once that day passes, a 1/2 course still pending may be finished before 1/2 opens.
 */
function prepBy(term: Term, terms: Term[], today: ISODate): ISODate {
  const first = term.season === 't1-2' ? terms.find((t) => t.year === term.year && t.season === 't1-1')?.start : undefined;
  return first && first > today ? first : term.start;
}

export function preStudy(today: ISODate, terms: Term[], unitsOf: (code: string) => string[], done: Record<string, ISODate>): Schedule {
  const termStatus: Record<string, TermStatus> = {};
  const courseMode: Record<string, CourseMode> = {};
  const upcoming = terms.filter((t) => t.start > today).map((t) => ({ t, by: prepBy(t, terms, today) }));
  const nearest = upcoming.reduce<ISODate | null>((m, x) => (m === null || x.by < m ? x.by : m), null);

  for (const t of terms) {
    const up = upcoming.find((x) => x.t === t);
    termStatus[t.id] = t.end < today ? 'past' : !up ? 'now' : up.by === nearest ? 'pre-study' : 'later';
    const mode: CourseMode = !up ? 'review' : up.by === nearest ? 'pre-study' : 'later';
    for (const it of t.items) { const c = itemCode(it); if (c && !(c in courseMode)) courseMode[c] = mode; }
  }

  const seen = new Set<string>();
  const queue: QueuedUnit[] = [];
  for (const { t, by } of [...upcoming].sort((a, b) => (a.by < b.by ? -1 : a.by > b.by ? 1 : 0))) {
    for (const it of t.items) {
      const code = itemCode(it);
      if (!code || seen.has(code) || courseMode[code] === 'review') continue;
      seen.add(code);
      for (const unitId of unitsOf(code)) if (!(done[unitId] && done[unitId] < today)) queue.push({ unitId, code, termId: t.id, prepBy: by });
    }
  }

  let rate = 0;
  for (const by of new Set(queue.map((q) => q.prepBy))) {
    const left = queue.filter((q) => q.prepBy <= by).length;
    rate = Math.max(rate, left / Math.max(1, daysBetween(today, by)));
  }
  const pace = rate > 0 ? { perDay: Math.max(1, Math.ceil(rate)), everyDays: rate >= 1 ? 1 : Math.max(1, Math.floor(1 / rate + 1e-9)) } : null;
  const lastDone = Object.values(done).filter((d) => d < today).sort().pop();
  const due = !!pace && (!lastDone || daysBetween(lastDone, today) >= pace.everyDays);
  const todayUnits = due ? queue.slice(0, pace!.perDay) : [];
  const nextDue = !pace ? null : due ? today : addDays(lastDone!, pace.everyDays);

  const unlocked = new Set<string>([...Object.keys(done), ...todayUnits.map((q) => q.unitId)]);
  for (const [code, mode] of Object.entries(courseMode)) if (mode === 'review') unitsOf(code).forEach((u) => unlocked.add(u));

  const next = terms.find((t) => t.start > today);
  return { today, termStatus, courseMode, nextStart: next ? { term: next, days: daysBetween(today, next.start) } : null, queue, todayUnits, pace, nextDue, unlocked };
}
