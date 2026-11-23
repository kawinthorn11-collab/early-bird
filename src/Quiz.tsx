import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { shuffled } from './practice';
import { sfx } from './audio';
import { Check, cheer, comfort, rich, LETTERS } from './ui';
import { announceAnswer } from './motion';
import { useStore, recordAnswer } from './store';
import { skillName } from './content';
import { unitById } from './courses';
import type { MCQ } from './types';

/** Feedback panel shown after every answer: why the right one is right AND why each wrong option is wrong. */
export function Explain({ q, picked }: { q: MCQ; picked: number }) {
  const [all, setAll] = useState(false);
  const ok = picked === q.answer;
  return (
    <div className={`explain ${ok ? 'ok' : 'no'}`}>
      <div className="explain-head">{ok ? cheer() : comfort()}</div>
      {!ok && <p><b>ที่เลือก "{q.options[picked]}" ผิดเพราะ:</b> {q.why_wrong[picked]}</p>}
      <p><b>คำตอบคือ "{q.options[q.answer]}":</b> {q.explanation_th}</p>
      <button className="link" onClick={() => setAll(!all)}>{all ? 'ซ่อน' : 'ดูว่าทำไมตัวเลือกอื่นผิดทุกตัว'}</button>
      {all && (
        <ul className="why">
          {q.options.map((o, i) => i !== q.answer && <li key={i}><b>{o}</b>: {q.why_wrong[i]}</li>)}
        </ul>
      )}
      <div className="muted small">{unitById(q.skill) ? `หน่วย: ${unitById(q.skill)!.title_th}` : `กฎ: ${skillName(q.skill)}`}</div>
    </div>
  );
}

export function QuestionCard({ q, onAnswered, context }: { q: MCQ; onAnswered: (ok: boolean, picked: number) => void; context?: ReactNode }) {
  const [picked, setPicked] = useState<number | null>(null);
  const choose = (i: number) => {
    if (picked !== null) return;
    setPicked(i);
    sfx(i === q.answer ? 'ok' : 'no');
    announceAnswer(i === q.answer);
    onAnswered(i === q.answer, i);
  };
  return (
    <div className="qcard">
      {context}
      <div className="stem">{rich(q.stem.replace(/___/g, '_____'))}</div>
      <div className="opts">
        {q.options.map((o, i) => {
          const state = picked === null ? '' : i === q.answer ? 'right' : i === picked ? 'wrong' : 'dim';
          return (
            <button key={i} onClick={() => choose(i)} className={`opt ${state} ${picked === i ? 'picked' : ''}`}>
              <span className="optn">{state === 'right' ? <Check size={16} /> : state === 'wrong' ? <Check size={16} cross /> : LETTERS[i]}</span>{o}
            </button>
          );
        })}
      </div>
      {picked !== null && <Explain q={q} picked={picked} />}
    </div>
  );
}

/** Runs a list of questions one by one. Records stats + SRS for each answer. */
export function Quiz({ items, onDone, title, srsKeys, context, onIndex }: {
  items: MCQ[]; onDone: (score: number, total: number) => void; title?: string; srsKeys?: string[]; context?: (q: MCQ) => ReactNode; onIndex?: (i: number) => void;
}) {
  const qs = useMemo(() => items.map(shuffled), [items]);
  const { update } = useStore();
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  useEffect(() => { onIndex?.(i); }, [i]);
  if (!qs.length) return <div className="card">ยังไม่มีข้อในหมวดนี้ <button onClick={() => onDone(0, 0)}>ไปต่อ</button></div>;
  const q = qs[i];
  return (
    <div>
      <div className="quiz-top"><span>{title}</span><span>ข้อ {i + 1}/{qs.length} · ถูก <span className="bump" key={score}>{score}</span></span></div>
      <QuestionCard key={`${q.id}-${i}`} q={q} context={context?.(q)} onAnswered={(ok) => {
        setAnswered(true);
        if (ok) setScore((s) => s + 1);
        update((p) => recordAnswer(p, items[i], ok, srsKeys?.[i]));
      }} />
      {answered && (
        <button className="primary next" onClick={() => {
          setAnswered(false);
          if (i + 1 < qs.length) setI(i + 1); else onDone(score, qs.length);
        }}>{i + 1 < qs.length ? 'ข้อต่อไป →' : 'ดูผล →'}</button>
      )}
    </div>
  );
}
