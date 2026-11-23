import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, finishUnit } from './store';
import { usePlan, readiness } from './usePlan';
import { catalog, courseByCode, termOfCourse } from './curriculum';
import { courseFile, interviewOf, lessonsOf, unitsOf, type CourseUnit } from './courses';
import { thaiDate, thaiRange } from './dates';
import { pickForSkill } from './practice';
import { Quiz } from './Quiz';
import { RecordPanel } from './Speak';
import { speak, sfx } from './audio';
import { Pip } from './characters';
import { CountUp, reducedMotion } from './motion';
import { Back, Card, Check, Disclaimer, Icon, Listen, Steps, celebrate, go } from './ui';
import { Ready } from './pages';

const MODE: Record<string, string> = { review: 'ทบทวน (เปิดภาคแล้ว)', 'pre-study': 'กำลังเตรียม', later: 'เตรียมภายหลัง' };
const SPEAKING = ['EN101', 'ENL111', 'EN102'];
const GRAMMAR = ['ENL101', 'ENL102'];

export function CoursePage({ code }: { code: string }) {
  const { p } = useStore();
  const { terms, sched } = usePlan();
  const c = courseByCode(code);
  if (!c) return <div><Back to="/plan" /><Card>ไม่พบวิชา {code} ในหลักสูตร</Card></div>;
  const file = courseFile(code);
  const units = unitsOf(code);
  const term = termOfCourse(terms, code);
  const mode = sched.courseMode[code];
  const next = catalog.filter((x) => x.prerequisite.includes(code));
  const r = readiness(p, code);
  return (
    <div className="course-page">
      <Back to="/plan" />
      <header className="course-head">
        <p className="eyebrow">{c.code_th} · {c.code}</p>
        <h1 className="page-title">{c.name_th}</h1>
        <p className="course-en">{c.name_en}</p>
        <ul className="chips-row">
          <li>{c.credits} หน่วยกิต</li>
          <li>{c.group}{c.area ? ` · ${c.area}` : ''}</li>
          {term && <li>{term.label} · {thaiRange(term.start, term.end)}{term.estimate ? ' (ค่าประมาณ)' : ''}</li>}
          {mode && <li className={`status ${mode}`}>{MODE[mode]}</li>}
        </ul>
        {(c.prerequisite.length > 0 || next.length > 0) && (
          <p className="prereqs">
            {c.prerequisite.map((x) => <a key={x} className="prereq" href={`#/course/${x}`}><span aria-hidden="true">←</span> ต้องผ่าน {x} ก่อน</a>)}
            {next.map((x) => <a key={x.code} className="prereq after" href={`#/course/${x.code}`}>ปูทางไป {x.code} <span aria-hidden="true">→</span></a>)}
          </p>
        )}
      </header>
      <Disclaimer />

      <Card className="desc-card">
        <h3>คำอธิบายรายวิชา (จากหลักสูตร)</h3>
        <p lang="th">{c.desc_th}</p>
        <p lang="en" className="desc-en">{c.desc_en}</p>
      </Card>

      {file ? (
        <>
          {file.in_class_th.length > 0 && (
            <Card className="inclass">
              <h3>สิ่งที่น่าจะเจอในห้อง</h3>
              <ul>{file.in_class_th.map((x, i) => <li key={i}>{x}</li>)}</ul>
              <p className="small muted">{file.basis_th}</p>
            </Card>
          )}
          <h2 className="section-title"><span>หน่วยเตรียมตัว {units.length} หน่วย</span><Ready r={r} /></h2>
          <ol className="unit-list">
            {units.map((u, i) => {
              const done = p.units[u.id];
              const today = sched.todayUnits.some((q) => q.unitId === u.id);
              const open = sched.unlocked.has(u.id);
              return (
                <li key={u.id}>
                  <a className={`unit-row ${done ? 'done' : ''} ${today ? 'today' : ''}`} href={`#/course/${code}/${u.id}`}>
                    <span className="unit-n">{i + 1}</span>
                    <span className="unit-main"><b>{u.title_th}</b><span className="small muted">{u.title_en} · {u.minutes} นาที</span></span>
                    <span className="unit-state">{done ? <><Check size={16} />เสร็จ</> : today ? 'วันนี้' : open ? 'เปิดแล้ว' : 'ทำล่วงหน้าได้'}</span>
                  </a>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <Card className="coming">
          <h3>เนื้อหาเตรียมตัวกำลังมา</h3>
          <p>วิชานี้ยังไม่มีหน่วยเตรียมตัว ตอนนี้อ่านคำอธิบายรายวิชาด้านบนไว้ก่อนได้ หน่วยเตรียมตัวจะเพิ่มทีละปี เริ่มจากวิชาปี 1</p>
        </Card>
      )}

      {(SPEAKING.includes(code) || GRAMMAR.includes(code)) && (
        <div className="row">
          {SPEAKING.includes(code) && <button onClick={() => go('/speak')}><Icon name="mic" />ฝึกพูดสำหรับคลาสนี้</button>}
          {(GRAMMAR.includes(code) || code === 'ENL111') && <button onClick={() => go('/videos')}>คลิปพร้อมซับ</button>}
        </div>
      )}
    </div>
  );
}

const LABELS = ['การ์ด', 'ศัพท์', 'ฝึก', 'พูด', 'งาน'];

export function UnitPlayer({ code, unitId }: { code: string; unitId: string }) {
  const u = unitsOf(code).find((x) => x.id === unitId);
  if (!u) return <div><Back to={`/course/${code}`} /><Card>ไม่พบหน่วยนี้</Card></div>;
  return <Unit code={code} u={u} />;
}

function Unit({ code, u }: { code: string; u: CourseUnit }) {
  const { p, update } = useStore();
  const [step, setStep] = useState(0);
  const [score, setScore] = useState<{ ok: number; n: number } | null>(null);
  const [finished, setFinished] = useState<null | 'first' | 'again'>(null);
  const reused = lessonsOf(u);
  const asks = interviewOf(u);
  const practice = useMemo(() => [...u.questions, ...reused.flatMap((l) => pickForSkill(p, l.skill, 3, [], l.questions.filter((q) => (q.stage ?? 1) === 1)))], [u.id]);
  const done = p.units[u.id];
  const units = unitsOf(code);
  const nextUnit = units[units.indexOf(u) + 1];
  const to = (n: number) => { setStep(n); sfx('tap'); window.scrollTo(0, 0); };

  const complete = () => {
    const best = score && score.n ? Math.round((100 * score.ok) / score.n) : 0;
    update((pp) => finishUnit(pp, u.id, best));
    setFinished(done ? 'again' : 'first'); celebrate(); sfx('win'); window.scrollTo(0, 0);
  };

  if (finished) return (
    <div className="center finish">
      <div className="finish-hero"><Pip size={96} mood="wow" /></div>
      <h2>เตรียม “{u.title_th}” เสร็จแล้ว</h2>
      <p>{finished === 'again' ? 'ทบทวนอีกรอบ เก่งมาก' : <>ได้ <b className="xp-gain">+<CountUp to={60} id={`unit-${u.id}`} ms={900} /> XP</b></>} · ข้อที่พลาดจะกลับมาใน Quick Run ตามรอบ</p>
      {score && <p className="muted">ฝึกถูก {score.ok}/{score.n} ข้อ</p>}
      <div className="row center">
        <button onClick={() => go(`/course/${code}`)}>กลับหน้าวิชา</button>
        {nextUnit ? <button className="primary" onClick={() => go(`/course/${code}/${nextUnit.id}`)}>หน่วยถัดไป →</button> : <button className="primary" onClick={() => go('/')}>กลับหน้าวันนี้</button>}
      </div>
    </div>
  );

  return (
    <div className="unit">
      <Back to={`/course/${code}`} />
      <header className="unit-head">
        <p className="eyebrow">{code} · หน่วย {units.indexOf(u) + 1}/{units.length} · ประมาณ {u.minutes} นาที</p>
        <h2>{u.title_th}</h2>
        <p className="muted">{u.title_en}</p>
        {done && <p className="done-banner"><Check size={18} /> ทำเสร็จแล้วเมื่อ {thaiDate(done.done)} ทำซ้ำเพื่อทบทวนได้</p>}
        <p className="covers small muted">จากคำอธิบายรายวิชา: “{u.covers}”</p>
      </header>
      <Steps labels={LABELS} at={step} />

      {step === 0 && <CardDeck u={u} onDone={() => to(1)} />}

      {step === 1 && (
        <Card>
          <h3>ศัพท์สำคัญ ({u.vocab.length})</h3>
          <ul className="vocab-list">
            {u.vocab.map(([en, th]) => (
              <li key={en}><button className="vocab-say" onClick={() => speak(en, 'reader')} aria-label={`ฟัง ${en}`}><Icon name="speaker" /></button><b lang="en">{en}</b><span>{th}</span></li>
            ))}
          </ul>
          <button className="primary" onClick={() => to(2)}>ไปฝึก →</button>
        </Card>
      )}

      {step === 2 && (
        <div>
          <p className="muted">{u.questions.length} ข้อของหน่วยนี้{reused.length ? ` + ${practice.length - u.questions.length} ข้อจากบทไวยากรณ์ที่ใช้ร่วม` : ''} · ตอบแล้วดูเหตุผลทุกตัวเลือก</p>
          <Quiz items={practice} title="ฝึกหน่วยนี้" onDone={(ok, n) => { setScore({ ok, n }); to(3); }} />
        </div>
      )}

      {step === 3 && (
        <Card>
          <h3>พูดออกเสียง</h3>
          <p className="muted">ฟังแล้วพูดตาม อัดเสียงได้ถ้าอยากรู้ว่าระบบฟังออกไหม ไม่มีถูกผิด</p>
          {u.say.map((t, i) => (
            <div key={i} className="speak-item">
              <div className="big-text" lang="en">{t} <Listen onClick={() => speak(t, 'reader')} /> <button className="link" onClick={() => speak(t, 'reader', { slow: true })}>ช้า</button></div>
              <RecordPanel target={t} kind="unit" maxSec={20} />
            </div>
          ))}
          {asks.map((q) => (
            <div key={q.id} className="speak-item">
              <p className="small muted">ลองตอบคำถามนี้แบบสั้น ๆ</p>
              <div className="big-text" lang="en">{q.q} <Listen onClick={() => speak(q.q, 'reader')} /></div>
              <div className="muted">{q.q_th}</div>
              <div className="frame">{q.frame}</div>
              <RecordPanel question={q.q} sample={q.sample} kind="unit-q" maxSec={45} />
            </div>
          ))}
          <button className="primary" onClick={() => to(4)}>ไปงานเล็ก →</button>
        </Card>
      )}

      {step === 4 && (
        <Card className="task-card">
          <h3>งานเล็ก 1 อย่าง</h3>
          <p className="task">{u.task_th}</p>
          {reused.length > 0 && <p className="small">อยากเรียนเต็มบท: {reused.map((l) => <a key={l.id} href={`#/lesson/${l.id}`} className="lesson-link">{l.id} {l.title_th}</a>)}</p>}
          <button className="primary big" onClick={complete}><Check size={20} />ทำหน่วยนี้เสร็จ</button>
        </Card>
      )}
    </div>
  );
}

/** Explainer cards: swipe on a phone (scroll snap), arrows or keys anywhere. */
function CardDeck({ u, onDone }: { u: CourseUnit; onDone: () => void }) {
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const n = u.cards.length;
  const aiming = useRef<number | null>(null);
  const goTo = (k: number) => {
    const el = track.current;
    setI(k); aiming.current = k;
    el?.scrollTo({ left: k * el.clientWidth, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    // a swipe moves the dots; a button press already set them, so ignore the scroll it starts until it lands
    const on = () => {
      const k = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
      if (aiming.current === null) setI(k);
      else if (k === aiming.current) aiming.current = null;
    };
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  return (
    <div className="deck">
      <div className="deck-track" ref={track} tabIndex={0} aria-label="การ์ดอธิบาย เลื่อนซ้ายขวา"
        onKeyDown={(e) => { if (e.key === 'ArrowRight') goTo(Math.min(n - 1, i + 1)); if (e.key === 'ArrowLeft') goTo(Math.max(0, i - 1)); }}>
        {u.cards.map((c, k) => (
          <article key={k} className="deck-card" aria-label={`การ์ด ${k + 1} จาก ${n}`}>
            <span className="deck-n">{k + 1}/{n}</span>
            <h3>{c.title_th}</h3>
            <p>{c.body_th}</p>
            {c.example && <p className="deck-ex">{c.example}{/[a-z]/i.test(c.example) && <Listen onClick={() => speak(c.example!, 'reader')} />}</p>}
          </article>
        ))}
      </div>
      <div className="deck-nav">
        <button disabled={i === 0} onClick={() => goTo(i - 1)} aria-label="การ์ดก่อนหน้า">←</button>
        <ol className="deck-dots" aria-hidden="true">{u.cards.map((_, k) => <li key={k} className={k === i ? 'on' : ''} />)}</ol>
        {i < n - 1 ? <button onClick={() => goTo(i + 1)} aria-label="การ์ดถัดไป">→</button> : <button className="primary" onClick={onDone}>ไปศัพท์ →</button>}
      </div>
    </div>
  );
}
