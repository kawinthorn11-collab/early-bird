// Reused content from the grammar lessons and speaking bank, bundled at build time so it works offline.
import type { Lesson, Cloze, Interview, Shadow, Skill, VideoFile } from './types';
import skillsJson from '../content/skills.json';
import interviewJson from '../content/interview.json';
import shadowJson from '../content/shadowing.json';
import videosJson from '../content/videos.json';

const pick = <T,>(mods: Record<string, unknown>) =>
  Object.keys(mods).sort().map((k) => (mods[k] as { default: T }).default);

export const lessons: Lesson[] = pick<Lesson>(import.meta.glob('../content/lessons/*.json', { eager: true }));
export const clozes: Cloze[] = pick<Cloze>(import.meta.glob('../content/cloze/*.json', { eager: true }));
export const interview = interviewJson as Interview;
export const shadowing = shadowJson as Shadow[];
export const skills = skillsJson as Skill[];
export const videos = videosJson as VideoFile;

export const lessonById = (id: string) => lessons.find((l) => l.id === id);
export const clozeById = (id: string) => clozes.find((c) => c.id === id);
export const skillName = (id: string) => skills.find((s) => s.id === id)?.name_th ?? id;
