// The program as data: the official catalog, the Year Plan 2570 and the BU calendar, resolved for one student's profile.
import planJson from '../content/plan.json';
import calendarJson from '../content/calendar.json';
import catalogJson from '../content/catalog.json';
import { addDays, addYears, daysBetween, isISODate, type ISODate } from './dates';

export type Cohort = '1/1' | '1/2' | '2';
export type Track = 'normal' | 'coop';
export const COHORTS: Cohort[] = ['1/1', '1/2', '2'];
export const TRACKS: Record<Track, string> = { normal: 'แผนปกติ', coop: 'แผนสหกิจศึกษา' };

export type CatalogCourse = {
  code: string; code_th: string; name_th: string; name_en: string;
  credits: string; group: string; area?: string;
  desc_th: string; desc_en: string; prerequisite: string[];
  elective?: 'ME' | 'FE'; me_groups?: string[];
};
export const catalog = catalogJson.courses as CatalogCourse[];
const byCode = new Map(catalog.map((c) => [c.code, c]));
export const courseByCode = (code: string) => byCode.get(code);
/** "3 (3 – 0 – 6)" → 3 */
export const creditsOf = (c: Pick<CatalogCourse, 'credits'>) => Number(c.credits.match(/^\d+/)?.[0] ?? 0);

/* ---------- slots: elective placeholders in the plan (SI-1, FE-2, ME-3 ...) ---------- */
export type SlotKind = 'SI' | 'FE' | 'ME';
type SlotInfo = { th: string; en: string; credits: number };
export const SLOTS = planJson.slots as Record<SlotKind, SlotInfo>;
const SLOT_RE = /^(SI|FE|ME)-(\d+)$/;
export const parseSlot = (id: string): { kind: SlotKind; n: number } | null => {
  const m = id.match(SLOT_RE);
  return m ? { kind: m[1] as SlotKind, n: Number(m[2]) } : null;
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const slotLabel = (id: string) => { const s = parseSlot(id); return s ? `${SLOTS[s.kind].en} ${ROMAN[s.n] ?? s.n}` : id; };
/** Courses the curriculum lists for a slot. Special Interest has no list: the faculty or another faculty sets it. */
export const slotOptions = (kind: SlotKind): CatalogCourse[] => (kind === 'SI' ? [] : catalog.filter((c) => c.elective === kind));
export const SLOT_RULE_TH: Record<SlotKind, string> = {
  SI: 'เลือกจากกลุ่มวิชาความสนใจเฉพาะที่ภาควิชาอื่นในคณะ คณะอื่นที่คณะอนุมัติ หรือภาควิชาภาษาอังกฤษกำหนด (หลักสูตรไม่ได้ระบุรายชื่อวิชา)',
  FE: 'เลือกวิชาใดก็ได้ที่เปิดสอนในมหาวิทยาลัย หรือจากรายชื่อวิชาเลือกเสรีในหลักสูตร',
  ME: 'เลือกจากวิชาเฉพาะด้าน-เลือก 3 กลุ่มในหลักสูตร',
};

/* ---------- the student's profile ---------- */
export type TermDates = { start: ISODate; end: ISODate };
export type Profile = {
  cohort: Cohort;
  track: Track;
  /** Only the terms the student has edited. Every other term uses its calendar default. */
  termDates: Record<string, TermDates>;
  /** Slot id → chosen catalog code, or free text for a course outside the catalog. */
  slots: Record<string, string>;
  /** The elective advisor's questions: dream careers, interests and skills to grow (ids from content/advisor/goals.json). */
  advisor?: { dreams: string[]; interests: string[]; skills: string[] };
};
export const defaultProfile = (): Profile => ({ cohort: '1/1', track: 'coop', termDates: {}, slots: {} });

/** Year Plan term ids end in the season: y1t1-1, y1t1-2, y1t2, y1s, y2t1 ... */
export type Season = 't1-1' | 't1-2' | 't1' | 't2' | 's';
export const seasonOf = (id: string): Season => id.replace(/^y\d+/, '') as Season;
const yearOf = (id: string) => Number(id.match(/^y(\d+)/)?.[1] ?? 1);

export type CalCell = { text: string; time?: string; from: ISODate; to?: ISODate };
export type CalTermId = '1' | '2' | 'S';
export type CalRow = { th: string; sub?: string; key?: 'start' | 'end' | 'pay'; cells: Record<CalTermId, CalCell[] | null> };
/** BU's official calendar table, row for row (validate checks every date text against source/calendar-2570.txt). */
export type FreshmanItem = { th: string; text: string; from: ISODate; to?: ISODate; precision: 'day' | 'month' | 'unknown'; key?: string; source?: string; note_th?: string };
export const calendar = calendarJson as {
  year: string; source: string; note_th: string; terms: { id: CalTermId; th: string }[]; rows: CalRow[];
  /** Cohort 1/1 starts in June with the preparatory term 1/1; term 1/2 is the university's semester 1. */
  freshman: { th: string; how_th: string; items: FreshmanItem[] };
};
const keyDate = (key: 'start' | 'end', term: CalTermId) => {
  const cell = calendar.rows.find((r) => r.key === key)?.cells[term]?.[0];
  if (!cell) throw new Error(`calendar.json has no "${key}" row for term ${term}`);
  return cell.from;
};
const SEM1 = { start: keyDate('start', '1'), end: keyDate('end', '1') };
const SEM2 = { start: keyDate('start', '2'), end: keyDate('end', '2') };
const SUMMER = { start: keyDate('start', 'S'), end: keyDate('end', 'S') };
const freshDate = (key: string) => {
  const it = calendar.freshman.items.find((x) => x.key === key);
  if (!it) throw new Error(`calendar.json freshman has no "${key}"`);
  return it.from;
};
const PREP = { start: freshDate('t1-1-start'), end: freshDate('t1-1-end') };

export const ESTIMATE_NOTE = 'ค่าประมาณ ยืนยันที่ registration.bu.ac.th';

/** Calendar 2570 dates for year 1, shifted one year per study year. Only year 1's full-term dates are printed by BU. */
export function defaultTermDates(id: string): TermDates & { estimate: boolean; startKnown: boolean } {
  const season = seasonOf(id);
  const shift = yearOf(id) - 1;
  const base: Record<Season, TermDates> = {
    't1-1': PREP,
    't1-2': SEM1,
    t1: SEM1, t2: SEM2, s: SUMMER,
  };
  const b = base[season];
  // BU prints only the month 1/1 starts and not its end; 1/2 is semester 1, printed in full
  const prep = season === 't1-1';
  return { start: addYears(b.start, shift), end: addYears(b.end, shift), estimate: shift > 0 || prep, startKnown: shift === 0 && !prep };
}

/* ---------- the resolved plan ---------- */
export type PlanItem =
  | { kind: 'course'; code: string; course: CatalogCourse; credits: number }
  | { kind: 'slot'; id: string; slot: SlotKind; label: string; credits: number; choice?: string; course?: CatalogCourse };

export type Term = {
  id: string; year: number; label: string; season: Season;
  start: ISODate; end: ISODate;
  /** Some date of this term is a default, not printed by BU. `startKnown`: the start date itself is printed (or edited). */
  estimate: boolean; startKnown: boolean; edited: boolean;
  items: PlanItem[]; credits: number;
};

type RawTerm = { id: string; year: number; label: string; courses: Record<string, string[]> };
const rawTerms = planJson.terms as unknown as RawTerm[];

/** Plan keys: a cohort ("1/1") wins, then the track for every cohort ("*coop"), then everyone ("*"). */
export const termCodes = (t: RawTerm, p: Pick<Profile, 'cohort' | 'track'>) => t.courses[p.cohort] ?? t.courses[`*${p.track}`] ?? t.courses['*'] ?? [];

function resolveItem(code: string, p: Profile): PlanItem {
  const slot = parseSlot(code);
  if (slot) {
    const choice = p.slots[code]?.trim() || undefined;
    return { kind: 'slot', id: code, slot: slot.kind, label: slotLabel(code), credits: SLOTS[slot.kind].credits, choice, course: choice ? courseByCode(choice) : undefined };
  }
  const course = courseByCode(code);
  if (!course) throw new Error(`plan.json names ${code}, which is not in catalog.json`);
  return { kind: 'course', code, course, credits: creditsOf(course) };
}

/** This student's terms in order, with courses, credits and dates (edited dates win over calendar defaults). */
export function myPlan(p: Profile): Term[] {
  return rawTerms.flatMap((t) => {
    const codes = termCodes(t, p);
    if (!codes.length) return [];
    const items = codes.map((c) => resolveItem(c, p));
    const def = defaultTermDates(t.id);
    const own = p.termDates[t.id];
    const edited = !!own && isISODate(own.start) && isISODate(own.end) && daysBetween(own.start, own.end) >= 0;
    const dates = edited ? own : def;
    return [{ id: t.id, year: t.year, label: t.label, season: seasonOf(t.id), start: dates.start, end: dates.end, estimate: !edited && def.estimate, startKnown: edited || def.startKnown, edited, items, credits: items.reduce((a, x) => a + x.credits, 0) }];
  });
}

export const totalCredits = (terms: Term[]) => terms.reduce((a, t) => a + t.credits, 0);
/** Codes of real courses in plan order (slots resolve to their chosen catalog course, if any). */
export const itemCode = (it: PlanItem) => (it.kind === 'course' ? it.code : it.course?.code);

/** Where a course sits in this student's plan: the first term that holds it. */
export function termOfCourse(terms: Term[], code: string) {
  return terms.find((t) => t.items.some((it) => itemCode(it) === code));
}
