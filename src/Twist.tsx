import { useMemo, useState } from 'react';
import { shuffle } from './practice';
import { sfx } from './audio';
import { useStore, recordAnswer } from './store';
import { cheer, comfort, LETTERS } from './ui';
import { announceAnswer } from './motion';
import type { Twist } from './types';

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();

/** "Twisted" formats so a rule is recognised in any shape, not just 4-option gap-fills. */
export function TwistCard({ t, onDone }: { t: Twist; onDone: (ok: boolean) => void }) {
  const { update } = useStore();
  const [result, setResult] = useState<null | boolean>(null);
  const finish = (ok: boolean) => {
    if (result !== null) return;
    setResult(ok); sfx(ok ? 'ok' : 'no'); announceAnswer(ok);
    update((p) => recordAnswer(p, { id: t.id, skill: t.skill }, ok));
  };
  return (
    <div className="qcard twist">
      {t.type === 'error' && <ErrorSpot t={t} onAnswer={finish} done={result !== null} />}
      {t.type === 'fill' && <Fill t={t} onAnswer={finish} done={result !== null} />}
      {t.type === 'order' && <Order t={t} onAnswer={finish} done={result !== null} />}
      {t.type === 'match' && <Match t={t} onAnswer={finish} done={result !== null} />}
      {result !== null && (
        <div className={`explain ${result ? 'ok' : 'no'}`}>
          <div className="explain-head">{result ? cheer() : comfort()}</div>
          <p>{t.explanation_th}</p>
          <button className="primary" onClick={() => onDone(result)}>ไปต่อ →</button>
        </div>
      )}
    </div>
  );
}

function ErrorSpot({ t, onAnswer, done }: { t: Extract<Twist, { type: 'error' }>; onAnswer: (ok: boolean) => void; done: boolean }) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <>
      <div className="twist-kind">หาจุดผิด: ส่วนไหนของประโยคผิด?</div>
      <div className="stem err-sentence">
        {t.parts.map((p, i) => (
          <button key={i} disabled={done} onClick={() => { setPicked(i); onAnswer(i === t.answer); }}
            className={`seg ${picked === null ? '' : i === t.answer ? 'right' : i === picked ? 'wrong' : ''} ${picked === i ? 'picked' : ''}`}>
            {p}<sub>{LETTERS[i]}</sub>
          </button>
        ))}
      </div>
      {picked !== null && picked !== t.answer && <p className="muted">ส่วนที่เลือก: {t.why_wrong[picked]}</p>}
    </>
  );
}

function Fill({ t, onAnswer, done }: { t: Extract<Twist, { type: 'fill' }>; onAnswer: (ok: boolean) => void; done: boolean }) {
  const [v, setV] = useState('');
  const [hint, setHint] = useState(false);
  const [a, b] = t.stem.split('___');
  return (
    <>
      <div className="twist-kind">เติมคำเอง (ไม่มีตัวเลือก)</div>
      <div className="stem">{a}<input className="fill" value={v} disabled={done} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && v && onAnswer(t.accept.some((x) => norm(x) === norm(v)))} autoFocus />{b}</div>
      {!done && <div className="row"><button className="primary" disabled={!v} onClick={() => onAnswer(t.accept.some((x) => norm(x) === norm(v)))}>ตรวจ</button>
        <button className="ghost" onClick={() => setHint(true)}>ขอคำใบ้</button></div>}
      {hint && <p className="muted">คำใบ้: {t.hint_th}</p>}
      {done && <p>คำตอบที่ยอมรับ: <b>{t.accept.join(' / ')}</b></p>}
    </>
  );
}

function Order({ t, onAnswer, done }: { t: Extract<Twist, { type: 'order' }>; onAnswer: (ok: boolean) => void; done: boolean }) {
  const pool = useMemo(() => { let s = shuffle(t.words.map((w, i) => ({ w, i }))); if (s.every((x, k) => x.i === k)) s = s.reverse(); return s; }, [t]);
  const [chosen, setChosen] = useState<number[]>([]);
  const sentence = chosen.map((k) => pool[k].w).join(' ');
  return (
    <>
      <div className="twist-kind">เรียงประโยคให้ถูก</div>
      <div className="order-line">{sentence || <span className="muted">แตะคำด้านล่างตามลำดับ</span>}</div>
      <div className="chips">
        {pool.map((x, k) => <button key={k} className="chip" disabled={done || chosen.includes(k)} onClick={() => setChosen([...chosen, k])}>{x.w}</button>)}
      </div>
      {!done && <div className="row">
        <button className="ghost" onClick={() => setChosen(chosen.slice(0, -1))}>ลบคำล่าสุด</button>
        <button className="primary" disabled={chosen.length !== pool.length} onClick={() => onAnswer(norm(sentence) === norm(t.words.join(' ')))}>ตรวจ</button>
      </div>}
      {done && <p>ประโยคที่ถูก: <b>{t.words.join(' ')}</b></p>}
    </>
  );
}

function Match({ t, onAnswer, done }: { t: Extract<Twist, { type: 'match' }>; onAnswer: (ok: boolean) => void; done: boolean }) {
  const rights = useMemo(() => shuffle(t.pairs.map((p, i) => ({ r: p[1], i }))), [t]);
  const [sel, setSel] = useState<number | null>(null);
  const [links, setLinks] = useState<Record<number, number>>({});
  const all = Object.keys(links).length === t.pairs.length;
  return (
    <>
      <div className="twist-kind">จับคู่: {t.prompt_th}</div>
      <div className="match">
        <div>{t.pairs.map((p, i) => <button key={i} disabled={done} className={`chip ${sel === i ? 'sel' : ''} ${links[i] !== undefined ? 'linked' : ''}`} onClick={() => setSel(i)}>{p[0]}{links[i] !== undefined && ` → ${rights[links[i]].r}`}</button>)}</div>
        <div>{rights.map((x, k) => <button key={k} disabled={done || sel === null || Object.values(links).includes(k)} className="chip" onClick={() => { if (sel === null) return; setLinks({ ...links, [sel]: k }); setSel(null); }}>{x.r}</button>)}</div>
      </div>
      {!done && <div className="row"><button className="ghost" onClick={() => setLinks({})}>เริ่มใหม่</button>
        <button className="primary" disabled={!all} onClick={() => onAnswer(Object.entries(links).every(([l, r]) => rights[r].i === Number(l)))}>ตรวจ</button></div>}
      {done && <ul>{t.pairs.map((p, i) => <li key={i}>{p[0]} → <b>{p[1]}</b></li>)}</ul>}
    </>
  );
}

