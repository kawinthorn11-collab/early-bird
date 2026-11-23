import { useEffect, useMemo, useState } from 'react';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const ANSWER = 'au:answer';
/** Lets characters elsewhere on the page react to a right or wrong answer without threading props through every quiz. */
export const announceAnswer = (ok: boolean) => dispatchEvent(new CustomEvent<boolean>(ANSWER, { detail: ok }));

export function useAnswerReaction(enabled: boolean) {
  const [reaction, setReaction] = useState<{ ok: boolean; n: number } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let n = 0, t = 0;
    const on = (e: Event) => {
      setReaction({ ok: (e as CustomEvent<boolean>).detail, n: ++n });
      clearTimeout(t); t = window.setTimeout(() => setReaction(null), 1100);
    };
    addEventListener(ANSWER, on);
    return () => { removeEventListener(ANSWER, on); clearTimeout(t); };
  }, [enabled]);
  return reaction;
}

const segmenter = new Intl.Segmenter('th', { granularity: 'grapheme' });

/** Reveals `text` one grapheme at a time (Thai vowels and tone marks stay on their consonant). */
export function useTypewriter(text: string, perSec = 40): [string, string] {
  const parts = useMemo(() => Array.from(segmenter.segment(text), (s) => s.segment), [text]);
  const [n, setN] = useState(() => (reducedMotion() ? parts.length : 0));
  useEffect(() => {
    if (reducedMotion()) { setN(parts.length); return; }
    setN(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(parts.length, Math.floor(((t - t0) / 1000) * perSec));
      setN(k);
      if (k < parts.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [parts, perSec]);
  return [parts.slice(0, n).join(''), parts.slice(n).join('')];
}

const counted = new Set<string>();

/** Counts from 0 to `to` the first time `id` is shown in this session, then just shows the number. */
export function CountUp({ to, id, ms = 800 }: { to: number; id: string; ms?: number }) {
  const [v, setV] = useState(() => (counted.has(id) || reducedMotion() ? to : 0));
  useEffect(() => {
    if (counted.has(id) || reducedMotion()) { setV(to); return; }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick); else counted.add(id);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, id, ms]);
  return <>{v}</>;
}
