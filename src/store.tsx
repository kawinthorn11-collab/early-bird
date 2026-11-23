import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { idbGet, idbSet } from './db';
import type { MCQ, Progress, Settings } from './types';
import { defaultProfile } from './curriculum';
import { todayISO } from './dates';

export const DAY = 86400000;
export const SRS_DAYS = [1, 3, 7, 16];

export const dateKey = todayISO;

export const defaultSettings = (): Settings => ({
  profile: defaultProfile(), name: '', theme: 'auto', music: false, musicTrack: 'calm', musicVol: 0.4, sfx: true,
  stt: 'auto', aiModel: 'cx/gpt-6.1-terra',
});

export const emptyProgress = (): Progress => ({
  createdAt: Date.now(), xp: 0, days: {}, attempts: [], lastSeen: {}, srs: {},
  lessons: {}, units: {}, vocab: [], speak: { sessions: [0, 0, 0, 0, 0], interviews: 0 }, myAnswers: {},
});

type Store = {
  p: Progress; s: Settings; ready: boolean;
  update: (fn: (p: Progress) => void) => void;
  setSettings: (s: Partial<Settings>) => void;
};
const Ctx = createContext<Store>(null as unknown as Store);
export const useStore = () => useContext(Ctx);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [p, setP] = useState<Progress>(emptyProgress);
  const [s, setS] = useState<Settings>(defaultSettings);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<number>();

  useEffect(() => {
    Promise.all([idbGet<Progress>('progress'), idbGet<Settings>('settings')]).then(([pp, ss]) => {
      if (pp) setP({ ...emptyProgress(), ...pp });
      if (ss) setS({ ...defaultSettings(), ...ss, profile: { ...defaultProfile(), ...ss.profile } });
      setReady(true);
    });
  }, []);

  const update = (fn: (p: Progress) => void) =>
    setP((old) => {
      const next: Progress = structuredClone(old);
      fn(next);
      clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => idbSet('progress', next), 300);
      return next;
    });

  const setSettings = (patch: Partial<Settings>) =>
    setS((old) => { const next = { ...old, ...patch }; idbSet('settings', next); return next; });

  return <Ctx.Provider value={{ p, s, ready, update, setSettings }}>{children}</Ctx.Provider>;
}

/* ---------- pure helpers that mutate a draft Progress ---------- */

export function addXp(p: Progress, n: number) {
  p.xp += n;
  const d = (p.days[dateKey()] ??= { xp: 0, done: [] });
  d.xp += n;
}

export function markDone(p: Progress, blockId: string) {
  const d = (p.days[dateKey()] ??= { xp: 0, done: [] });
  if (!d.done.includes(blockId)) d.done.push(blockId);
}

/** Record one answer: stats, 7-day no-repeat, spaced repetition (1, 3, 7, 16 days). */
export function recordAnswer(p: Progress, q: Pick<MCQ, 'id' | 'skill'>, ok: boolean, srsKey?: string) {
  const now = Date.now();
  p.attempts.push({ q: q.id, s: q.skill, ok, t: now });
  if (p.attempts.length > 20000) p.attempts.splice(0, p.attempts.length - 20000);
  p.lastSeen[q.id] = now;
  const key = srsKey ?? q.id;
  const item = p.srs[key];
  if (!ok) {
    p.srs[key] = { skill: q.skill, qid: item?.qid ?? q.id, stage: 0, due: now + SRS_DAYS[0] * DAY };
  } else if (item) {
    item.stage += 1;
    if (item.stage >= SRS_DAYS.length) delete p.srs[key];
    else item.due = now + SRS_DAYS[item.stage] * DAY;
  }
  addXp(p, ok ? 10 : 2);
}

export function skillStats(p: Progress) {
  const st: Record<string, { ok: number; n: number }> = {};
  // recent attempts weigh most: last 40 per skill
  const per: Record<string, boolean[]> = {};
  for (const a of p.attempts) (per[a.s] ??= []).push(a.ok);
  for (const [k, arr] of Object.entries(per)) {
    const recent = arr.slice(-40);
    st[k] = { ok: recent.filter(Boolean).length, n: recent.length };
  }
  return st;
}

/** Finishing a unit is recorded once, on the first day it was finished, so the schedule's pace stays honest. */
export function finishUnit(p: Progress, unitId: string, best: number) {
  const had = p.units[unitId];
  p.units[unitId] = { done: had?.done ?? dateKey(), best: Math.max(had?.best ?? 0, best) };
  if (!had) addXp(p, 60);
  markDone(p, `unit-${unitId}`);
}

export const level = (xp: number) => Math.floor(Math.sqrt(xp / 60)) + 1;
