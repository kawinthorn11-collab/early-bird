import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { buildRun, score, ROUND_SECONDS, RUN_FINISH_XP, SAY_XP, type Round } from './run';
import { useStore, recordAnswer, addXp, markDone, dateKey } from './store';
import { lessons, interview } from './content';
import { shuffle } from './practice';
import { unitById, courseOfUnit } from './courses';
import { usePlan, runSources } from './usePlan';
import { daysBetween } from './dates';
import { speak, stopAll, sfx, interviewerFor } from './audio';
import { Pip, Villain, Interviewer } from './characters';
import { CountUp, announceAnswer, reducedMotion } from './motion';
import { Check, Icon, celebrate, comfort, go, rich } from './ui';

const KIND_LABEL: Record<Round['kind'], string> = {
  pick: 'เลือก 1 จาก 4',
  spot: 'จุดไหนผิด',
  order: 'เรียงให้เป็นประโยค',
  match: 'จับคู่ให้ถูก',
  say: 'พูดออกเสียง',
};
const RIGHT = ['เป๊ะ', 'ใช่เลย', 'ไวมาก', 'สวย', 'ถูกเผง', 'เก่งอะ'];
const villainFor = (skill: string) => lessons.find((l) => l.skill === skill)?.villain;

type Outcome = { ok: boolean; gained: number; mult: number; fast: boolean };
type Missed = { round: Round; why: string };
type Tally = { combo: number; best: number; xp: number; right: number; missed: Missed[] };
const EMPTY: Tally = { combo: 0, best: 0, xp: 0, right: 0, missed: [] };

export function QuickRun() {
  const { p, update } = useStore();
  const { sched } = usePlan();
  const make = () => buildRun(p, runSources(sched.unlocked), sched.todayUnits.map((q) => q.unitId));
  const [rounds, setRounds] = useState(make);
  const [i, setI] = useState(0);
  const [tally, setTally] = useState(EMPTY);
  const live = useRef(EMPTY);
  const { combo, best, xp, right, missed } = tally;
  const [out, setOut] = useState<Outcome | null>(null);
  const [why, setWhy] = useState('');
  const [ended, setEnded] = useState(false);
  const started = useRef(performance.now());
  const advance = useRef<number>();

  const round = rounds[i];
  useEffect(() => { started.current = performance.now(); }, [i, rounds]);
  useEffect(() => () => { clearTimeout(advance.current); stopAll(); }, []);

  function next() {
    clearTimeout(advance.current);
    setOut(null); setWhy('');
    if (i + 1 < rounds.length) { setI(i + 1); return; }
    finish();
  }

  function finish() {
    setEnded(true);
    window.scrollTo(0, 0);
    sfx('win'); celebrate();
    update((pp) => {
      addXp(pp, RUN_FINISH_XP);
      markDone(pp, 'quick-run');
      const t = live.current;
      pp.runs = [...(pp.runs ?? []), { t: Date.now(), xp: t.xp + RUN_FINISH_XP, best: t.best, ok: t.right, n: rounds.filter((r) => r.kind !== 'say').length }].slice(-90);
    });
  }

  function answer(ok: boolean, explain = '') {
    if (out) return;
    const fast = performance.now() - started.current < ROUND_SECONDS[round.kind] * 1000;
    const sc = score(combo, ok, fast);
    const base = round.kind === 'say' ? SAY_XP : ok ? 10 : 2;
    const gained = base + sc.bonus;
    setOut({ ok, gained, mult: sc.mult, fast });
    const t = live.current;
    live.current = {
      combo: sc.combo, best: Math.max(t.best, sc.combo), xp: t.xp + gained,
      right: t.right + (ok && round.kind !== 'say' ? 1 : 0), missed: ok ? t.missed : [...t.missed, { round, why: explain }],
    };
    setTally(live.current);
    if (!ok) setWhy(explain);
    sfx(ok ? 'ok' : 'no');
    if (ok && sc.mult === 4 && combo === 2) sfx('level');
    announceAnswer(ok);
    update((pp) => {
      if (round.kind === 'say') addXp(pp, SAY_XP);
      else if (round.kind === 'pick') recordAnswer(pp, round.q, ok, round.srsKey);
      else recordAnswer(pp, { id: round.key, skill: round.skill }, ok);
      if (sc.bonus) addXp(pp, sc.bonus);
    });
    if (ok) advance.current = window.setTimeout(next, reducedMotion() ? 500 : 850);
  }

  function again() {
    setRounds(make());
    live.current = EMPTY; setTally(EMPTY);
    setI(0); setOut(null); setEnded(false);
    window.scrollTo(0, 0);
  }

  if (!rounds.length) return <div className="run-empty"><p>ยังไม่มีโจทย์ให้เล่น</p><button onClick={() => go('/')}>กลับหน้าแรก</button></div>;
  if (ended) return <RunEnd xp={xp + RUN_FINISH_XP} best={best} right={right} total={rounds.filter((r) => r.kind !== 'say').length} missed={missed} rounds={rounds} onAgain={again} />;

  const seconds = ROUND_SECONDS[round.kind];
  return (
    <div className={`run ${out ? (out.ok ? 'is-right' : 'is-wrong') : ''}`}>
      <div className="run-top">
        <button className="run-exit" onClick={() => go('/')} aria-label="ออกไปหน้าแรก">✕</button>
        <ol className="run-dots" aria-label={`ข้อ ${i + 1} จาก ${rounds.length}`}>
          {rounds.map((r, k) => <li key={r.key} className={k < i || (k === i && out) ? 'done' : k === i ? 'now' : ''} />)}
        </ol>
        <span className={`combo ${combo >= 2 ? 'hot' : ''}`} key={combo} aria-live="polite">{combo >= 2 ? <>คอมโบ <b>x{Math.min(4, combo)}</b></> : <b>{xp}</b>}{combo < 2 && <small> XP</small>}</span>
      </div>
      {seconds > 0 && <div className={`timer-bar ${out ? 'stop' : ''}`} key={`t${i}`} style={{ '--sec': `${seconds}s` } as CSSProperties}><i /></div>}
      {seconds === 0 && <div className="timer-bar calm"><span>ไม่จับเวลา ชิล ๆ</span></div>}

      <section className="round" key={round.key}>
        <div className="round-head">
          <span className="kind-tag">{KIND_LABEL[round.kind]}</span>
          {round.kind === 'pick' && round.srsKey && <span className="again-tag">ข้อที่เคยพลาด มาแก้มือ</span>}
          <SourceTag src={round.src} skill={round.skill} />
        </div>
        {round.kind === 'pick' && <PickRound r={round} onAnswer={answer} locked={!!out} />}
        {round.kind === 'match' && <MatchRound r={round} onAnswer={answer} locked={!!out} />}
        {round.kind === 'spot' && <SpotRound r={round} onAnswer={answer} locked={!!out} />}
        {round.kind === 'order' && <OrderRound r={round} onAnswer={answer} locked={!!out} />}
        {round.kind === 'say' && <SayRound r={round} onAnswer={answer} locked={!!out} />}
        {out && <div className={`gain ${out.ok ? '' : 'soft'}`} key={`g${i}`}>+{out.gained}{out.ok && out.fast && round.kind !== 'say' && <small>ไว!</small>}</div>}
      </section>

      {out?.ok && <p className="cheer-line" key={`c${i}`}>{RIGHT[(i + xp) % RIGHT.length]}{out.mult > 1 && ` · x${out.mult}`}</p>}
      {out && !out.ok && (
        <div className="miss">
          <p className="miss-head">{comfort()}</p>
          {why && <p>{rich(why)}</p>}
          <button className="primary big next" onClick={next} autoFocus>{i + 1 < rounds.length ? 'ไปต่อ' : 'ดูผล'} →</button>
        </div>
      )}
    </div>
  );
}

/** Which course a round comes from; lesson-only rounds keep their grammar villain. */
function SourceTag({ src, skill }: { src: string; skill: string }) {
  const u = unitById(src);
  const v = villainFor(skill);
  return (
    <>
      {u && <span className="src-tag">{courseOfUnit(src)} · {u.title_th}</span>}
      {v && <span className="round-villain"><Villain id={v} size={56} still reacts /></span>}
    </>
  );
}

function useKeys(n: number, pick: (k: number) => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const on = (e: KeyboardEvent) => { const k = Number(e.key) - 1; if (k >= 0 && k < n) pick(k); };
    addEventListener('keydown', on);
    return () => removeEventListener('keydown', on);
  }, [n, pick, active]);
}

type RoundProps<K extends Round['kind']> = { r: Extract<Round, { kind: K }>; onAnswer: (ok: boolean, why?: string) => void; locked: boolean };

function Options({ options, answer, onPick, locked, picked }: { options: string[]; answer: number; onPick: (k: number) => void; locked: boolean; picked: number | null }) {
  useKeys(options.length, onPick, !locked);
  return (
    <div className="run-opts">
      {options.map((o, k) => {
        const st = picked === null ? '' : k === answer ? 'right' : k === picked ? 'wrong' : 'dim';
        return (
          <button key={k} className={`run-opt ${st} ${picked === k ? 'picked' : ''}`} onClick={() => onPick(k)} disabled={locked && picked !== k && k !== answer}>
            <span className="optn">{st === 'right' ? <Check size={18} /> : st === 'wrong' ? <Check size={18} cross /> : k + 1}</span>
            <span className="opt-text">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

function PickRound({ r, onAnswer, locked }: RoundProps<'pick'>) {
  const [picked, setPicked] = useState<number | null>(null);
  const q = r.q;
  const choose = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    onAnswer(k === q.answer, k === q.answer ? '' : `**${q.options[q.answer]}** ${q.explanation_th}`);
  };
  return (
    <>
      <p className="run-stem">{rich(q.stem.replace(/___/g, '＿＿＿'))}</p>
      <Options options={q.options} answer={q.answer} onPick={choose} locked={locked} picked={picked} />
    </>
  );
}

function MatchRound({ r, onAnswer, locked }: RoundProps<'match'>) {
  const [picked, setPicked] = useState<number | null>(null);
  const choose = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    onAnswer(k === r.answer, `**${r.left}** คู่กับ **${r.options[r.answer]}** ${r.explain}`);
  };
  return (
    <>
      <p className="run-prompt">{rich(r.prompt)}</p>
      <p className="run-stem match-left">{r.left} <span aria-hidden="true">→ ?</span></p>
      <Options options={r.options} answer={r.answer} onPick={choose} locked={locked} picked={picked} />
    </>
  );
}

function SpotRound({ r, onAnswer, locked }: RoundProps<'spot'>) {
  const [picked, setPicked] = useState<number | null>(null);
  const t = r.t;
  const choose = (k: number) => {
    if (picked !== null) return;
    setPicked(k);
    onAnswer(k === t.answer, t.explanation_th);
  };
  useKeys(t.parts.length, choose, !locked);
  return (
    <div className="spot">
      {t.parts.map((part, k) => {
        const st = picked === null ? '' : k === t.answer ? 'right' : k === picked ? 'wrong' : 'dim';
        return <button key={k} className={`spot-seg ${st} ${picked === k ? 'picked' : ''}`} onClick={() => choose(k)}>{part}<sub>{k + 1}</sub></button>;
      })}
    </div>
  );
}

const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();

function OrderRound({ r, onAnswer, locked }: RoundProps<'order'>) {
  const t = r.t;
  const pool = useMemo(() => { let x = shuffle(t.words.map((w, k) => ({ w, k }))); if (x.every((y, k) => y.k === k)) x = x.reverse(); return x; }, [t]);
  const [chosen, setChosen] = useState<number[]>([]);
  const [result, setResult] = useState<boolean | null>(null);
  const tap = (k: number) => {
    if (locked || chosen.includes(k)) return;
    const nextChosen = [...chosen, k];
    setChosen(nextChosen);
    sfx('tap');
    if (nextChosen.length === pool.length) {
      const ok = norm(nextChosen.map((c) => pool[c].w).join(' ')) === norm(t.words.join(' '));
      setResult(ok);
      onAnswer(ok, `**${t.words.join(' ')}** ${t.explanation_th}`);
    }
  };
  return (
    <>
      <div className={`order-slot ${result === null ? '' : result ? 'right' : 'wrong'}`}>
        {chosen.length ? chosen.map((c) => <span key={c} className="word-in">{pool[c].w}</span>) : <span className="muted">แตะคำตามลำดับ</span>}
      </div>
      <div className="word-bank">
        {pool.map((x, k) => <button key={k} className="word-chip" disabled={locked || chosen.includes(k)} onClick={() => tap(k)}>{x.w}</button>)}
      </div>
      {!locked && chosen.length > 0 && <button className="ghost undo" onClick={() => setChosen(chosen.slice(0, -1))}>ถอย 1 คำ</button>}
    </>
  );
}

function SayRound({ r, onAnswer, locked }: RoundProps<'say'>) {
  const [heard, setHeard] = useState(false);
  const listen = async () => { setHeard(true); await speak(r.text, 'reader'); };
  useEffect(() => { const t = setTimeout(listen, 350); return () => { clearTimeout(t); stopAll(); }; }, [r.text]);
  return (
    <div className="say">
      <p className="say-line">{r.text}</p>
      <p className="say-th">{r.th}</p>
      <div className="say-actions">
        <button className="ghost-ink" onClick={listen}><Icon name="speaker" />ฟังอีกที</button>
        <button className="ghost-ink" onClick={() => speak(r.text, 'reader', { slow: true })}>ฟังช้า</button>
      </div>
      <button className={`say-done ${heard ? 'ready' : ''}`} disabled={locked} onClick={() => { stopAll(); onAnswer(true); }}>
        <Icon name="mic" /><span>พูดออกเสียงแล้ว</span>
      </button>
      <p className="say-note">ไม่มีใครฟัง ไม่มีตรวจ พูดดัง ๆ 1 ครั้งก็นับ</p>
    </div>
  );
}

function RunEnd({ xp, best, right, total, missed, rounds, onAgain }: { xp: number; best: number; right: number; total: number; missed: Missed[]; rounds: Round[]; onAgain: () => void }) {
  const { p } = useStore();
  const learned = missed[0]?.why
    ?? (() => {
      const src = rounds.find((r) => r.kind !== 'say')?.src ?? '';
      const u = unitById(src);
      if (u?.cards[0]) return `**${u.cards[0].title_th}** ${u.cards[0].body_th}`;
      const l = lessons.find((x) => x.id === src || x.skill === rounds.find((r) => r.kind !== 'say')?.skill);
      return l ? `**${l.title_th}** ${l.rule.memory_th}` : '';
    })();
  const day = Math.max(0, daysBetween('2026-01-01', dateKey()));
  const q = interview.questions[day % interview.questions.length];
  const talked = p.days[dateKey()]?.done.includes('daily-q');
  const runs = p.runs ?? [];
  const runsToday = runs.filter((r) => dateKey(r.t) === dateKey()).length;
  const record = runs.length > 1 && xp > Math.max(...runs.slice(0, -1).map((r) => r.xp));
  return (
    <div className="run-end">
      <div className={`end-stamp ${record ? 'is-record' : ''}`} aria-hidden="true"><span>{record ? 'สถิติ\nใหม่!' : 'ครบ!'}</span></div>
      <h1 className="end-title">วันนี้นับแล้ว</h1>
      <p className="end-sub">{runsToday > 1 ? `รอบที่ ${runsToday} ของวันนี้ ขยันเกิน` : 'แค่นี้ก็ถือว่าทำวันนี้แล้วจริง ๆ'}</p>
      <dl className="end-stats">
        <div><dt>XP</dt><dd>+<CountUp to={xp} id={`run-xp-${p.runs?.length ?? 0}`} ms={900} /></dd></div>
        <div><dt>คอมโบสูงสุด</dt><dd>x{Math.min(4, best)}</dd></div>
        <div><dt>ถูก</dt><dd>{right}/{total}</dd></div>
      </dl>
      {learned && <div className="takeaway"><span className="takeaway-tag">จำไว้ 1 อย่าง</span><p>{rich(learned)}</p></div>}
      <div className="end-actions">
        <button className="go-again" onClick={onAgain}><span>อีกรอบ</span></button>
        <button className="enough" onClick={() => go('/')}>พอแล้ว</button>
      </div>
      {!talked && (
        <button className="dare" onClick={() => go('/daily')}>
          <span className="dare-face"><Interviewer id={interviewerFor(q.id)} size={72} /></span>
          <span className="dare-text"><small>ท้าเล็ก ๆ 30 วินาที</small><b>{q.q}</b><span>{q.q_th} · ตอบสั้น ๆ 1 ประโยคก็นับ</span></span>
        </button>
      )}
      {talked && <p className="end-sub"><Pip size={40} still /> ฝึกพูดแล้ววันนี้ด้วย ครบเซ็ต</p>}
    </div>
  );
}
