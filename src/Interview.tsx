import { useEffect, useRef, useState } from 'react';
import { interview } from './content';
import { useStore, addXp, markDone } from './store';
import { useRecorder, transcribe, analyse, feedback, type Analysis, type Feedback } from './speech';
import { speak, stopAll, sfx, interviewerFor, HAS_SERVER } from './audio';
import { Interviewer, INTERVIEWERS, type InterviewerId } from './characters';
import { Meter, liveLevel, saveRecording } from './Speak';
import { Back, Card, Icon, Listen, celebrate, go } from './ui';
import { shuffle } from './practice';
import type { InterviewQ } from './types';

type Turn = { who: InterviewerId; q: string; base: InterviewQ; follow?: boolean; a?: Analysis; f?: Feedback };
const ORDER = ['intro', 'faculty', 'strength', 'goal', 'scenario', 'personal', 'ending'];
const WHO: InterviewerId[] = ['kind', 'strict', 'asian'];

function planQuestions(): InterviewQ[] {
  const by = (c: string) => shuffle(interview.questions.filter((q) => q.cat === c))[0];
  const mid = shuffle(ORDER.slice(1, -1)).slice(0, 4);
  return [by('intro'), ...ORDER.slice(1, -1).filter((c) => mid.includes(c)).map(by), by('ending')].filter(Boolean);
}

export function InterviewRoom() {
  const { s, update } = useStore();
  const [stage, setStage] = useState<'lobby' | 'room' | 'end'>('lobby');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [cur, setCur] = useState(0);
  const [talking, setTalking] = useState<InterviewerId | null>(null);
  const [busy, setBusy] = useState(false);
  const queue = useRef<InterviewQ[]>([]);
  const r = useRecorder();

  useEffect(() => () => stopAll(), []);

  async function ask(t: Turn) {
    setTalking(t.who);
    await speak(t.q, t.who);
    setTalking(null);
  }

  async function enter() {
    queue.current = planQuestions();
    const first: Turn = { who: interviewerFor(queue.current[0].id), q: queue.current[0].q, base: queue.current[0] };
    setTurns([first]); setCur(0); setStage('room');
    setTalking('kind');
    await speak("Good morning, everyone. Let's start today's speaking practice.", 'kind');
    await ask(first);
  }

  async function answered() {
    const out = await r.stop();
    setBusy(true);
    const tr = await transcribe(out.blob, s, out.webText);
    const a = analyse(tr.text, tr.engine, out.timeline);
    const t = turns[cur];
    saveRecording(out.blob, { id: `${Date.now()}`, t: Date.now(), kind: 'interview', prompt: t.q, transcript: a.transcript, seconds: out.seconds, wpm: a.wpm, pauses: a.pauses, fillers: a.fillers, loudOk: a.loudOk });
    const done = [...turns]; done[cur] = { ...t, a };
    // follow-up question: AI reacts to what was said; otherwise use the pre-written follow-up
    let next: Turn | null = null;
    if (!t.follow && Math.random() < 0.55) {
      let fq = '';
      if (HAS_SERVER && s.aiModel && a.transcript) {
        try {
          const res = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: s.aiModel, maxTokens: 80, messages: [
            { role: 'system', content: `You are ${INTERVIEWERS[t.who].name}, a ${t.who === 'strict' ? 'strict but fair' : 'kind'} teacher or classmate in a first-year university English speaking class in Thailand. The student is a Thai English major with A2 English. Ask ONE short, friendly follow-up question (max 15 words, simple words) that reacts to their answer. Output only the question.` },
            { role: 'user', content: `Question: ${t.q}\nAnswer: ${a.transcript}` }] }) });
          if (res.ok) fq = ((await res.json()).content as string).trim().split('\n')[0];
        } catch {}
      }
      if (!fq && t.base.follow.length) fq = shuffle(t.base.follow)[0];
      if (fq) next = { who: t.who, q: fq, base: t.base, follow: true };
    }
    const qi = queue.current.indexOf(t.base);
    if (!next && qi + 1 < queue.current.length) { const b = queue.current[qi + 1]; next = { who: interviewerFor(b.id), q: b.q, base: b }; }
    setBusy(false);
    if (next) { setTurns([...done, next]); setCur(cur + 1); await ask(next); }
    else await finish(done);
  }

  async function finish(done: Turn[]) {
    setTurns(done); setStage('end'); sfx('win'); celebrate();
    update((p) => { p.speak.interviews++; p.speak.sessions[4] = (p.speak.sessions[4] ?? 0) + 1; addXp(p, 120); markDone(p, 'interview'); });
    const withFb = await Promise.all(done.filter((x) => x.a).map(async (x) => ({ ...x, f: await feedback(x.a!, { question: x.q, sample: x.base.sample }, s) })));
    setTurns(withFb);
  }

  if (stage === 'lobby') return (
    <div>
      <Back to="/speak" />
      <h2>วงคุยในคลาสจำลอง</h2>
      <div className="panel-row stagger">{WHO.map((w) => <div key={w} className="judge"><Interviewer id={w} /><b>{INTERVIEWERS[w].name}</b><div className="small muted">{INTERVIEWERS[w].role}</div></div>)}</div>
      <Card>
        <p>ซ้อมพูดแบบคลาส EN101 / ENL111 ประมาณ 5–8 นาที อาจารย์และเพื่อนจะถามต่อจากคำตอบของเรา กด “ตอบ” เมื่อพร้อม และกด “ตอบจบแล้ว” เมื่อพูดจบ ผลตอบกลับจะสรุปให้ตอนท้ายทีเดียว ไม่ขัดจังหวะ</p>
        <p className="muted small">{s.aiModel ? `คำถามต่อเนื่องโดย AI (${s.aiModel})` : 'คำถามต่อเนื่องจากชุดที่เตรียมไว้'}</p>
        <div className="row"><button onClick={() => go('/calm')}>หายใจ 4-7-8 ก่อน</button><button className="primary big" onClick={enter}>เข้าห้องเรียน →</button></div>
      </Card>
    </div>
  );

  const t = turns[cur];
  if (stage === 'end') return (
    <div>
      <h2>จบวงคุยแล้ว</h2>
      <p>ตอบไป {turns.filter((x) => x.a).length} คำถาม เก่งมากที่อยู่จนจบ คลาสจริงก็จะรู้สึกแบบนี้แหละ</p>
      {turns.map((x, i) => (
        <Card key={i}>
          <b>{INTERVIEWERS[x.who].name}:</b> {x.q}
          <p className="muted small">เราตอบ: “{x.a?.transcript || '…'}” · {x.a?.wpm ?? 0} คำ/นาที · คำเติม {x.a?.fillers ?? 0}</p>
          {x.f ? <div className="fb3"><div><b>ทำได้ดี</b><p>{x.f.good}</p></div><div><b>ลองแก้ 1 อย่าง</b><p>{x.f.fix}</p></div><div><b>พูดซ้ำประโยคนี้</b><p>{x.f.better} <Listen onClick={() => speak(x.f!.better, 'reader')} /></p></div></div> : <p className="muted">กำลังสรุปผลตอบกลับ…</p>}
        </Card>
      ))}
      <button className="primary" onClick={() => go('/')}>กลับหน้าแรก</button>
    </div>
  );

  return (
    <div className="room">
      <div className="panel-row">{WHO.map((w) => <div key={w} className={`judge ${t.who === w ? 'asking' : ''}`}><Interviewer id={w} talking={talking === w} listening={r.rec && t.who === w} /><b>{INTERVIEWERS[w].name}</b></div>)}</div>
      <Card className="question-bubble"><b>{INTERVIEWERS[t.who].name}:</b> {t.q} <button className="link" onClick={() => ask(t)}>ขอฟังอีกครั้ง</button>
        <div className="small muted">ฟังไม่ทัน? พูดว่า "Could you repeat that, please?" ได้เลย</div></Card>
      <div className="row center">
        {!r.rec ? <button className="primary big" disabled={busy || !!talking} onClick={() => { stopAll(); r.start(); }}><Icon name="mic" />ตอบ</button>
          : <button className="danger big rec-live" style={liveLevel(r.db)} onClick={answered}><span className="rec-dot" aria-hidden="true" />ตอบจบแล้ว</button>}
        <Meter db={r.db} />
      </div>
      {busy && <p className="muted center">กำลังฟังคำตอบ…</p>}
      {r.err && <p className="no-text">{r.err}</p>}
      <p className="small muted center">คำถามที่ {cur + 1} · <button className="link" onClick={async () => { if (r.rec) await r.stop(); stopAll(); finish(turns); }}>จบก่อน</button></p>
    </div>
  );
}
