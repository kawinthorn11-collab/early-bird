import { useMemo, useState } from 'react';
import { lessonById, clozeById } from './content';
import { useStore, addXp, markDone } from './store';
import { HookScene } from './HookScene';
import { Quiz } from './Quiz';
import { ClozePractice } from './Passage';
import { TwistCard } from './Twist';
import { RecordPanel } from './Speak';
import { speak, sfx } from './audio';
import { Pip, Villain, villainColor, villainName } from './characters';
import { CountUp, announceAnswer } from './motion';
import { tint } from './theme';
import { Back, Card, Listen, Steps, celebrate, go, rich } from './ui';
import { pickForSkill, shuffle } from './practice';

const LABELS = ['การ์ตูน', 'เดากฎ', 'กฎ 1 บรรทัด', 'ฝึก+ทำไมผิด', 'Cloze 10 ช่อง', 'พูดออกมา', 'โจทย์พลิก'];

export function LessonPlayer({ id }: { id: string }) {
  const l = lessonById(id);
  const { p, update } = useStore();
  const [step, setStep] = useState(() => Math.min(p.lessons[id]?.step ?? 0, 6));
  const [guess, setGuess] = useState<number | null>(null);
  const [score, setScore] = useState({ ok: 0, n: 0 });
  const [twistI, setTwistI] = useState(0);
  const [spoken, setSpoken] = useState(0);
  const [finished, setFinished] = useState(false);
  // 5 single-sentence items then 3 short-paragraph items, unseen-in-7-days first
  const practice = useMemo(() => {
    if (!l) return [];
    const s1 = l.questions.filter((q) => (q.stage ?? 1) === 1).map((q) => q.id);
    const s2 = l.questions.filter((q) => q.stage === 2).map((q) => q.id);
    const pool = l.questions;
    const a = pickForSkill(p, l.skill, 5, s2, pool.filter((q) => s1.includes(q.id)));
    const b = pickForSkill(p, l.skill, 3, s1, pool.filter((q) => s2.includes(q.id)));
    return [...a, ...b];
  }, [id]);
  const twists = useMemo(() => (l ? shuffle(l.twists).slice(0, 3) : []), [id]);
  if (!l) return <div className="card">ไม่พบด่านนี้ <Back /></div>;
  const cloze = clozeById(l.cloze);

  const next = () => {
    const n = step + 1;
    setStep(n); sfx('tap'); window.scrollTo(0, 0);
    update((pp) => { const s = (pp.lessons[id] ??= { step: 0, done: false }); s.step = Math.max(s.step, n); });
  };
  const finish = () => {
    setFinished(true); celebrate(); sfx('win');
    update((pp) => {
      const s = (pp.lessons[id] ??= { step: 0, done: false });
      s.done = true; s.step = 7; s.best = Math.max(s.best ?? 0, score.n ? Math.round((100 * score.ok) / score.n) : 0);
      addXp(pp, 80); markDone(pp, `lesson-${id}`);
    });
  };

  if (finished) return (
    <div className="center finish">
      <div className="finish-hero"><Pip size={96} mood="wow" /></div>
      <h2>ผ่านด่าน “{l.title_th}” แล้ว</h2>
      <p>เก็บกฎนี้ได้แล้ว <b className="xp-gain">+<CountUp to={80} id={`finish-${id}`} ms={900} /> XP</b></p>
      <Card className="rulecard card-collect"><b>{l.title_en}</b><p>{l.rule.line_th}</p><p className="muted">{l.rule.memory_th}</p></Card>
      <p className="muted">ความแม่นในด่านนี้ {score.n ? Math.round((100 * score.ok) / score.n) : 0}% · ข้อที่ผิดจะกลับมาในคิวทบทวนพรุ่งนี้</p>
      <div className="row center"><button onClick={() => history.back()}>กลับหน่วยเตรียมตัว</button><button className="primary" onClick={() => go('/')}>กลับหน้าวันนี้</button></div>
    </div>
  );

  return (
    <div className="lesson">
      <Back />
      <header className="lesson-head" style={tint(villainColor(l.villain))}>
        <div>
          <p className="eyebrow">ด่าน {l.id}</p>
          <h2>{l.title_th}</h2>
          <p className="muted">{l.title_en} · <span className="mark" aria-hidden="true" />ตัวป่วน {villainName(l.villain)}</p>
        </div>
        <Villain id={l.villain} size={72} still reacts />
      </header>
      <Steps labels={LABELS} at={step} />

      {step === 0 && <HookScene beats={l.hook.beats} villain={l.villain} land={l.phase} onDone={next} />}

      {step === 1 && (
        <Card>
          <h3>ดูตัวอย่างก่อน แล้วเดากฎเอง</h3>
          <ul className="examples">{l.discover.examples.map((e, i) => <li key={i}>{rich(e)} <Listen onClick={() => speak(e.replace(/\*\*/g, ''), 'reader')} /></li>)}</ul>
          <p><b>{l.discover.question_th}</b></p>
          <div className="opts">{l.discover.options_th.map((o, i) => (
            <button key={i} className={`opt ${guess === null ? '' : i === l.discover.answer ? 'right' : i === guess ? 'wrong' : 'dim'} ${guess === i ? 'picked' : ''}`} onClick={() => { if (guess === null) { setGuess(i); sfx(i === l.discover.answer ? 'ok' : 'no'); announceAnswer(i === l.discover.answer); } }}>{o}</button>
          ))}</div>
          {guess !== null && <div className="explain ok"><p>{guess === l.discover.answer ? 'เดาถูก สมองจับกฎได้เองแล้ว' : 'ใกล้แล้ว ไม่เป็นไร'}</p><p>{l.discover.reveal_th}</p><button className="primary" onClick={next}>ไปดูกฎ →</button></div>}
        </Card>
      )}

      {step === 2 && (
        <Card className="rulecard">
          <h3>กฎใน 1 บรรทัด</h3>
          <p className="rule-line">{l.rule.line_th}</p>
          <p className="memory"><b>ภาพจำ</b> {l.rule.memory_th}</p>
          <div className="terms">{l.rule.terms.map(([en, th]) => <span key={en} className="term"><b>{en}</b> = {th}</span>)}</div>
          <button className="primary" onClick={next}>ลองฝึกเลย →</button>
        </Card>
      )}

      {step === 3 && (
        <div>
          <p className="muted">ประโยคเดี่ยว 5 ข้อ → ย่อหน้าสั้น 3 ข้อ · ตอบแล้วดู <b>ทำไมตัวเลือกอื่นผิด</b> ทุกข้อ นี่แหละที่ทำให้โจทย์พลิกแล้วไม่มึน</p>
          <Quiz items={practice} title="ฝึกไล่ระดับ" onDone={(ok, n) => { setScore((s) => ({ ok: s.ok + ok, n: s.n + n })); next(); }} />
        </div>
      )}

      {step === 4 && (cloze
        ? <div><p className="muted">Cloze 10 ช่อง (มีหลายกฎปนกัน เหมือนการใช้ภาษาจริง)</p>
          <ClozePractice c={cloze} onDone={(ok, n) => { setScore((s) => ({ ok: s.ok + ok, n: s.n + n })); next(); }} /></div>
        : <Card>ด่านนี้ยังไม่มี cloze <button onClick={next}>ข้าม</button></Card>)}

      {step === 5 && (
        <Card>
          <h3>พูดออกมา ({Math.min(spoken, l.speak.length)}/{l.speak.length})</h3>
          <p className="muted">อ่านประโยคที่ใช้กฎนี้ออกเสียงดัง ๆ ไม่มีถูกผิด คำที่ระบบฟังไม่ออกจะเป็นสีส้ม</p>
          {l.speak.map((t, i) => (
            <div key={i} className="speak-item">
              <div className="big-text">{t} <Listen onClick={() => speak(t, 'reader')} /> <button className="link" onClick={() => speak(t, 'reader', { slow: true })}>ช้า</button></div>
              <RecordPanel target={t} kind="lesson" maxSec={20} onFinished={() => setSpoken((n) => n + 1)} />
            </div>
          ))}
          <button className={spoken >= 2 ? 'primary' : 'ghost'} onClick={next}>{spoken >= 2 ? 'ไปโจทย์พลิก →' : 'ข้ามไปก่อน (ไมค์ไม่พร้อม)'}</button>
        </Card>
      )}

      {step === 6 && twists[twistI] && (
        <div>
          <p className="muted">โจทย์พลิก {twistI + 1}/{twists.length} · กฎเดิม หน้าตาใหม่</p>
          <TwistCard key={twists[twistI].id} t={twists[twistI]} onDone={(ok) => { setScore((s) => ({ ok: s.ok + (ok ? 1 : 0), n: s.n + 1 })); if (twistI + 1 < twists.length) setTwistI(twistI + 1); else finish(); }} />
        </div>
      )}
    </div>
  );
}
