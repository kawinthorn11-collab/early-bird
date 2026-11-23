import type { TrackId } from './music';
import type { Profile } from './curriculum';
import type { ISODate } from './dates';

export type MCQ = {
  id: string;
  skill: string;
  difficulty: 1 | 2 | 3;
  stage?: 1 | 2; // 1 = single sentence, 2 = short paragraph
  stem: string; // blank written as ___
  options: string[];
  answer: number;
  explanation_th: string;
  why_wrong: (string | null)[]; // aligned with options; null at the correct answer
};

export type Twist =
  | { id: string; skill: string; type: 'error'; parts: string[]; answer: number; explanation_th: string; why_wrong: (string | null)[] }
  | { id: string; skill: string; type: 'fill'; stem: string; accept: string[]; hint_th: string; explanation_th: string }
  | { id: string; skill: string; type: 'order'; words: string[]; explanation_th: string }
  | { id: string; skill: string; type: 'match'; prompt_th: string; pairs: [string, string][]; explanation_th: string };

export type Beat = { say: string; actor?: 'guide' | 'villain'; anim?: 'enter' | 'shake' | 'jump' | 'zap' | 'swap' | 'think'; board?: string };

export type Lesson = {
  id: string;
  phase: 1 | 2 | 3;
  skill: string;
  title_th: string;
  title_en: string;
  villain: string;
  hook: { beats: Beat[] };
  discover: { examples: string[]; question_th: string; options_th: string[]; answer: number; reveal_th: string };
  rule: { line_th: string; memory_th: string; terms: [string, string][] };
  speak: string[];
  twists: Twist[];
  questions: MCQ[];
  cloze: string;
};

export type Cloze = { id: string; title: string; genre: string; level: 'A2' | 'B1' | 'B2'; text: string; items: MCQ[] };

export type InterviewQ = {
  id: string; cat: string; q: string; q_th: string; follow: string[]; sample: string; frame: string; tip_th: string;
};
export type Interview = { categories: { id: string; name_th: string }[]; questions: InterviewQ[]; survival: { en: string; th: string }[] };
export type Shadow = { id: string; text: string; th: string; level: 'A2' | 'B1' };
export type Skill = { id: string; group: string; name_th: string; name_en: string; lesson?: string };
export type Video = { id: string; topic: string; lang: 'th' | 'en'; title: string; channel: string; duration: string; checked: string; notes_th: { vocab: [string, string][]; questions: string[] } };
export type VideoFile = { topics: { id: string; name_th: string }[]; videos: Video[] };

export type Settings = {
  profile: Profile; name: string;
  theme: 'auto' | 'light' | 'dark'; music: boolean; musicTrack: TrackId; musicVol: number; sfx: boolean;
  stt: 'auto' | 'local' | 'eleven' | 'webspeech'; aiModel: string;
};

export type Attempt = { q: string; s: string; ok: boolean; t: number };
export type SrsItem = { skill: string; qid: string; stage: number; due: number };

export type Progress = {
  createdAt: number;
  xp: number;
  days: Record<string, { xp: number; done: string[] }>;
  attempts: Attempt[];
  lastSeen: Record<string, number>;
  srs: Record<string, SrsItem>;
  lessons: Record<string, { step: number; done: boolean; best?: number }>;
  /** Course units finished, with the day they were finished (drives the pre-study schedule). */
  units: Record<string, { done: ISODate; best?: number }>;
  vocab: { word: string; th?: string; src?: string; t: number }[];
  speak: { sessions: number[]; interviews: number };
  myAnswers: Record<string, { th: string; en: string }>;
  runs?: { t: number; xp: number; best: number; ok: number; n: number }[];
};

export type RecordingMeta = {
  id: string; t: number; kind: string; prompt: string; transcript: string; seconds: number;
  wpm: number; pauses: number; fillers: number; loudOk: number; // share of speaking time in green zone (0-1)
};
