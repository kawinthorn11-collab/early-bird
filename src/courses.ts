// Pre-study content per course (content/courses/<CODE>.json, see content/COURSE_SCHEMA.md). A course may have no file yet.
import { lessonById, lessons, interview } from './content';
import type { InterviewQ, Lesson, MCQ } from './types';

export type UnitCard = { title_th: string; body_th: string; example?: string };
export type CourseUnit = {
  id: string; title_th: string; title_en: string; covers: string; minutes: number;
  lessons?: string[]; interview?: string[];
  cards: UnitCard[]; vocab: [string, string][]; questions: MCQ[]; say: string[]; task_th: string;
};
export type CourseFile = { code: string; basis_th: string; in_class_th: string[]; units: CourseUnit[] };

const files = import.meta.glob('../content/courses/*.json', { eager: true }) as Record<string, { default: CourseFile }>;
const byCode = new Map(Object.values(files).map((m) => [m.default.code, m.default]));

export const courseFile = (code: string) => byCode.get(code);
export const unitsOf = (code: string): CourseUnit[] => byCode.get(code)?.units ?? [];
const unitIndex = new Map([...byCode.values()].flatMap((c) => c.units.map((u) => [u.id, { unit: u, code: c.code }] as const)));
export const unitById = (id: string) => unitIndex.get(id)?.unit;
export const courseOfUnit = (id: string) => unitIndex.get(id)?.code ?? id.replace(/-U\d+$/, '');

/** Old grammar lessons and interview questions a unit reuses, skipping ids that do not exist. */
export const lessonsOf = (u: CourseUnit): Lesson[] => (u.lessons ?? []).flatMap((id) => lessonById(id) ?? []);
export const interviewOf = (u: CourseUnit): InterviewQ[] => (u.interview ?? []).flatMap((id) => interview.questions.find((q) => q.id === id) ?? []);

/** Every MCQ the app can ask: all course units plus all grammar lessons. Review of a missed item draws from here. */
export const allMcqs: MCQ[] = [...[...byCode.values()].flatMap((c) => c.units.flatMap((u) => u.questions)), ...lessons.flatMap((l) => l.questions)];
