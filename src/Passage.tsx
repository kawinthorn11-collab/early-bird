import { Fragment, useState } from 'react';
import { Quiz } from './Quiz';
import type { Cloze } from './types';

/** Cloze text with numbered blanks "(1)". `fills` shows chosen words; `focus` highlights the current blank. */
export function ClozeText({ c, focus, fills = {} }: { c: Cloze; focus?: number; fills?: Record<number, string> }) {
  const parts = c.text.split(/(\(\d+\))/g);
  return (
    <div className="passage cloze-text">
      {parts.map((p, i) => {
        const m = p.match(/^\((\d+)\)$/);
        if (!m) return <Fragment key={i}>{p.split('\n').map((line, k) => <Fragment key={k}>{k > 0 && <br />}{line}</Fragment>)}</Fragment>;
        const n = Number(m[1]);
        return <span key={i} className={`blank ${focus === n ? 'focus' : ''}`}>{fills[n] ? <b>{fills[n]}</b> : `__(${n})__`}</span>;
      })}
    </div>
  );
}

export function ClozePractice({ c, onDone }: { c: Cloze; onDone: (score: number, total: number) => void }) {
  const [cur, setCur] = useState(0);
  return (
    <div className="split">
      <div className="sticky">
        <h3>{c.title}</h3>
        <ClozeText c={c} focus={Number(c.items[cur]?.stem.match(/\((\d+)\)/)?.[1])} />
      </div>
      <Quiz items={c.items} title="Cloze" onDone={onDone} onIndex={setCur} />
    </div>
  );
}
