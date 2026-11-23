// Joins the stored profile and progress to the pure plan and scheduler, once per render.
import { useMemo } from 'react';
import { useStore, dateKey } from './store';
import { myPlan } from './curriculum';
import { preStudy } from './schedule';
import { unitsOf, unitById } from './courses';
import { fallbackSources, unitSource } from './run';
import type { Progress } from './types';

const unitIds = (code: string) => unitsOf(code).map((u) => u.id);
const doneDays = (p: Progress) => Object.fromEntries(Object.entries(p.units).map(([id, u]) => [id, u.done]));

export function usePlan() {
  const { p, s } = useStore();
  const today = dateKey();
  const terms = useMemo(() => myPlan(s.profile), [s.profile]);
  const sched = useMemo(() => preStudy(today, terms, unitIds, doneDays(p)), [today, terms, p.units]);
  return { terms, sched, today };
}

/** Share of a course's units finished, or null when the course has no pre-study content yet. */
export function readiness(p: Progress, code: string): number | null {
  const us = unitsOf(code);
  return us.length ? us.filter((u) => p.units[u.id]).length / us.length : null;
}

/** Quick Run material: every open unit; before any exists, the opening grammar lessons. */
export function runSources(unlocked: Set<string>) {
  const open = [...unlocked].flatMap((id) => unitById(id) ?? []).map(unitSource);
  return open.length ? open : fallbackSources();
}
