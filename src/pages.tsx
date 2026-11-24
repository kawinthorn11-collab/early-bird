import { useEffect, useState, type CSSProperties } from 'react';
import { useStore, dateKey, defaultSettings } from './store';
import { usePlan, readiness } from './usePlan';
import { COHORTS, TRACKS, ESTIMATE_NOTE, SLOTS, SLOT_RULE_TH, calendar, courseByCode, defaultTermDates, itemCode, slotOptions, termOfCourse, totalCredits, type Cohort, type PlanItem, type Term, type Track } from './curriculum';
import { unitById } from './courses';
import { daysBetween, thaiDate, thaiRange, isISODate } from './dates';
import type { TermStatus } from './schedule';
import { Pip } from './characters';
import { DailyQuestion } from './Speak';
import { exportAll, importAll, idbSet } from './db';
import { Back, Card, Check, go } from './ui';
import { setSfx, sfx, HAS_SERVER } from './audio';
import { TRACKS as SOUNDS, playMusic, type TrackId } from './music';
import { reducedMotion } from './motion';

const PIP_LINES = ['แค่ 2 นาที เดี๋ยวก็จบ', 'วันนี้ไม่ต้องเก่ง แค่เริ่ม', 'เตรียมโจทย์ไว้ 6 ข้อแล้ว', 'มีข้อพูดด้วย 1 ประโยค', 'แตะปุ่มเหลืองเลย'];
const WEEK = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];
let arrived = false;

const STATUS: Record<TermStatus, string> = { 'pre-study': 'กำลังเตรียม', now: 'กำลังเรียน', past: 'ผ่านแล้ว', later: 'ภายหลัง' };
const shortTerm = (t: Term) => t.label.replace(/^ปี \d+ /, '');

export const courseName = (code: string) => courseByCode(code)?.name_th ?? code;

/* ---------------- วันนี้ ---------------- */
export function Home() {
  const { p, s } = useStore();
  const { sched, terms } = usePlan();
  const today = p.days[dateKey()]?.done ?? [];
  const ranToday = today.includes('quick-run');
  const [arrive, setArrive] = useState(() => !arrived && !reducedMotion());
  useEffect(() => { arrived = true; const t = setTimeout(() => setArrive(false), 2600); return () => clearTimeout(t); }, []);
  const line = PIP_LINES[(daysBetween('2026-01-01', dateKey()) + (p.runs?.length ?? 0)) % PIP_LINES.length];
  const monday = Date.now() - ((new Date().getDay() + 6) % 7) * 86400000;
  const week = WEEK.map((d, k) => {
    const key = dateKey(monday + k * 86400000);
    return { d, key, done: (p.days[key]?.done.length ?? 0) > 0, today: key === dateKey() };
  });
  const next = sched.nextStart;
  const preparing = terms.filter((t) => sched.termStatus[t.id] === 'pre-study');
  return (
    <div className={`home ${arrive ? 'arrive' : ''}`} onPointerDown={() => arrive && setArrive(false)}>
      <section className="entry">
        <div className="entry-copy">
          <p className="kicker">{s.name ? `${s.name} ` : ''}{ranToday ? 'วันนี้ทำแล้ว เก่งมาก' : 'ไม่ต้องคิด ไม่ต้องเลือก'}</p>
          <h1 className="riso" data-text={ranToday ? 'ครบแล้ว\nวันนี้' : 'วันนี้\nเอาแค่\n2 นาที'}>
            {ranToday ? <><span>ครบแล้ว</span><span>วันนี้</span></> : <><span>วันนี้</span><span>เอาแค่</span><span>2 นาที</span></>}
          </h1>
          <p className="entry-sub">{ranToday ? 'จะเล่นอีกรอบก็ได้ หรือพักเลยก็ได้' : 'โจทย์ไว ๆ จากวิชาที่กำลังเตรียม กับพูด 1 ประโยค จบแล้วนับว่าวันนี้ทำแล้ว'}</p>
          <ol className="week" aria-label="7 วันของสัปดาห์นี้">
            {week.map((w) => <li key={w.key} className={`${w.done ? 'done' : ''} ${w.today ? 'today' : ''}`}><span className="week-d">{w.d}</span><span className="week-box">{w.done && <Check size={16} />}</span></li>)}
          </ol>
        </div>
        <div className="entry-go">
          <button className={`go ${ranToday ? 'small' : ''}`} onClick={() => { sfx('tap'); go('/run'); }}>
            <span className="go-dots" aria-hidden="true" />
            <span className="go-face"><b>{ranToday ? 'อีกรอบ' : 'เริ่ม'}</b><small>2 นาที</small></span>
          </button>
          <div className="pip-perch" aria-hidden="true">
            <span className="pip-say">{ranToday ? 'วันนี้ครบแล้วนะ' : line}</span>
            <Pip size={92} mood={ranToday ? 'wow' : 'happy'} />
          </div>
        </div>
      </section>

      <section className="today-grid">
        {next && (
          <div className="countdown">
            <span className="eyebrow">นับถอยหลัง</span>
            <p className="count-n"><b>{next.days}</b> วัน</p>
            <p className="count-what">ถึงวันเปิด{shortTerm(next.term)} <span className="nowrap">{thaiDate(next.term.start)}</span></p>
            {!next.term.startKnown && <p className="est">{ESTIMATE_NOTE}</p>}
          </div>
        )}
        <PrepCard />
      </section>

      {preparing.length > 0 && (
        <section>
          <h2 className="section-title"><span>วิชาที่กำลังเตรียม</span><span>{preparing.map(shortTerm).join(' + ')}</span></h2>
          <ul className="prep-courses">
            {preparing.flatMap((t) => t.items).map((it) => {
              const code = itemCode(it);
              if (!code) return null;
              const r = readiness(p, code);
              return <li key={code}><a href={`#/course/${code}`}><span className="code">{code}</span><span className="pc-name">{courseName(code)}</span><Ready r={r} /></a></li>;
            })}
          </ul>
        </section>
      )}

      {ranToday && !today.includes('daily-q') && (
        <button className="dare wide" onClick={() => go('/daily')}>
          <span className="dare-text"><small>ท้าเล็ก ๆ 30 วินาที</small><b>ตอบคำถามฝึกพูด 1 ข้อ</b><span>ซ้อมให้คลาส EN101 / ENL111 · ไม่มีถูกผิด พูด 1 ประโยคก็นับ</span></span>
        </button>
      )}

      <section className="contents">
        <h2 className="section-title"><span>ทางลัด</span></h2>
        <ol className="toc">
          {[
            { path: '/plan', label: 'แผน 4 ปีของฉัน', note: `${totalCredits(terms)} หน่วยกิต` },
            { path: '/calendar', label: 'ปฏิทินการศึกษา 2570', note: 'วันลงทะเบียน เปิดภาค' },
            { path: '/speak', label: 'ฝึกพูดสำหรับคลาส', note: 'EN101 · ENL111' },
            { path: '/videos', label: 'คลิปไวยากรณ์พร้อมซับ', note: 'ENL101 · ENL102' },
            { path: '/vocab', label: 'คลังศัพท์ที่เก็บไว้', note: 'จากคลิป' },
            { path: '/learn', label: 'วิธีเรียนให้จำ', note: 'จากงานวิจัย' },
          ].map((x, k) => <li key={x.path}><a href={`#${x.path}`}><span className="toc-n">{String(k + 1).padStart(2, '0')}</span><span className="toc-label">{x.label}</span><span className="toc-note">{x.note}</span></a></li>)}
        </ol>
      </section>
    </div>
  );
}

/** Today's pre-study unit, or when the next one is due. */
function PrepCard() {
  const { p } = useStore();
  const { sched } = usePlan();
  const unitLink = (id: string, code: string) => go(`/course/${code}/${id}`);
  const first = sched.todayUnits[0];
  const pace = sched.pace;
  const paceText = pace && (pace.perDay > 1 ? `วันละ ${pace.perDay} หน่วย` : pace.everyDays > 1 ? `1 หน่วยทุก ${pace.everyDays} วัน` : 'วันละ 1 หน่วย');
  if (first) {
    const todo = sched.todayUnits.filter((q) => !p.units[q.unitId]);
    const u = unitById((todo[0] ?? first).unitId);
    const after = sched.queue.find((q) => !p.units[q.unitId] && !sched.todayUnits.includes(q));
    if (!todo.length) return (
      <div className="prep done">
        <span className="eyebrow">เตรียมวันนี้</span>
        <p className="prep-title"><Check size={22} /> หน่วยของวันนี้เสร็จแล้ว</p>
        <p className="small muted">ตามแผน {paceText} ก็ทันเปิดภาค</p>
        {after && <button onClick={() => unitLink(after.unitId, after.code)}>ทำล่วงหน้าอีกหน่วย: {after.code} {unitById(after.unitId)?.title_th}</button>}
      </div>
    );
    const q = todo[0];
    return (
      <div className="prep">
        <span className="eyebrow">เตรียมวันนี้{todo.length > 1 ? ` (${todo.length} หน่วย)` : ''}</span>
        <p className="prep-course"><span className="code">{q.code}</span> {courseName(q.code)}</p>
        <p className="prep-title">{u?.title_th}</p>
        <p className="small muted">{u?.title_en} · ประมาณ {u?.minutes} นาที · แผน {paceText}</p>
        <button className="primary" onClick={() => unitLink(q.unitId, q.code)}>เริ่มหน่วยนี้ →</button>
      </div>
    );
  }
  const nextUnit = sched.queue.find((q) => !p.units[q.unitId]);
  if (nextUnit) return (
    <div className="prep rest">
      <span className="eyebrow">เตรียมวันนี้</span>
      <p className="prep-title">วันนี้ไม่มีหน่วยใหม่ พักได้</p>
      <p className="small muted">หน่วยถัดไป {nextUnit.code} {unitById(nextUnit.unitId)?.title_th} ถึงคิว{sched.nextDue ? ` ${thaiDate(sched.nextDue, false)}` : ''} · แผน {paceText}</p>
      <button onClick={() => unitLink(nextUnit.unitId, nextUnit.code)}>ทำล่วงหน้าเลยก็ได้</button>
    </div>
  );
  return (
    <div className="prep rest">
      <span className="eyebrow">เตรียมวันนี้</span>
      <p className="prep-title">เนื้อหาเตรียมตัวกำลังมา</p>
      <p className="small muted">วิชาของภาคถัดไปยังไม่มีหน่วยเตรียมตัว ระหว่างนี้ Quick Run ใช้บทเรียนไวยากรณ์พื้นฐานไปก่อน และดูคำอธิบายรายวิชาได้ในแผน 4 ปี</p>
      <button onClick={() => go('/plan')}>ดูแผน 4 ปี</button>
    </div>
  );
}

export function Ready({ r }: { r: number | null }) {
  if (r === null) return <span className="ready none">ยังไม่มีเนื้อหา</span>;
  const pct = Math.round(r * 100);
  return <span className={`ready ${pct === 100 ? 'full' : ''}`} style={{ '--r': r } as CSSProperties} aria-label={`พร้อม ${pct}%`}><i aria-hidden="true" /><b>{pct}%</b></span>;
}

export function DailyPage() {
  return <div className="daily-page"><Back /><DailyQuestion /></div>;
}

/* ---------------- แผน 4 ปี ---------------- */
export function PlanPage() {
  const { s } = useStore();
  const { terms, sched } = usePlan();
  const years = [...new Set(terms.map((t) => t.year))];
  const order = new Map(terms.map((t, i) => [t.id, i]));
  return (
    <div className="plan-page">
      <p className="eyebrow">{s.profile.cohort === '2' ? 'รุ่น 2' : `รุ่น ${s.profile.cohort}`} · {TRACKS[s.profile.track]}</p>
      <h1 className="page-title">แผน 4 ปีของฉัน</h1>
      <p className="muted">ตาม Year Plan 2570 รวม <b>{totalCredits(terms)} หน่วยกิต</b> แตะวิชาเพื่อดูคำอธิบายรายวิชาและหน่วยเตรียมตัว เปลี่ยนรุ่นหรือแผนได้ใน <a href="#/settings">ตั้งค่า</a></p>
      <ul className="legend" aria-label="สถานะ">
        {(['pre-study', 'now', 'later', 'past'] as TermStatus[]).map((k) => <li key={k} className={`status ${k}`}>{STATUS[k]}</li>)}
      </ul>
      <ol className="years">
        {years.map((y) => {
          const ts = terms.filter((t) => t.year === y);
          return (
            <li key={y} className="year">
              <h2 className="year-head"><span className="year-n">ปี {y}</span><span className="year-be">ปีการศึกษา {2569 + y}</span><span className="year-cr">{totalCredits(ts)} หน่วยกิต</span></h2>
              <ol className="plan-terms">
                {ts.map((t) => (
                  <li key={t.id} className={`plan-term ${sched.termStatus[t.id]}`}>
                    <span className="pt-dot" aria-hidden="true" />
                    <div className="pt-head">
                      <h3>{shortTerm(t)}</h3>
                      <span className={`status ${sched.termStatus[t.id]}`}>{STATUS[sched.termStatus[t.id]]}</span>
                      <span className="pt-dates">{thaiRange(t.start, t.end)}{t.estimate && <span className="est-tag" title={ESTIMATE_NOTE}>ค่าประมาณ</span>}</span>
                      <span className="pt-cr">{t.credits} หน่วยกิต</span>
                    </div>
                    <ul className="course-list">
                      {t.items.map((it) => <PlanRow key={it.kind === 'course' ? it.code : it.id} it={it} at={order.get(t.id)!} terms={terms} order={order} />)}
                    </ul>
                  </li>
                ))}
              </ol>
            </li>
          );
        })}
      </ol>
      <p className="small muted">วันที่ที่ไม่ได้พิมพ์ในปฏิทินของมหาวิทยาลัยเป็น{ESTIMATE_NOTE} ปี 2 ถึง 4 เลื่อนจากปฏิทิน 2570 ไปปีละ 1 ปี</p>
    </div>
  );
}

function Prereqs({ code, at, terms, order }: { code: string; at: number; terms: Term[]; order: Map<string, number> }) {
  const pre = courseByCode(code)?.prerequisite ?? [];
  if (!pre.length) return null;
  return (
    <span className="prereqs">
      {pre.map((x) => {
        const t = termOfCourse(terms, x);
        const ok = !!t && order.get(t.id)! < at;
        return <a key={x} href={`#/course/${x}`} className={`prereq ${ok ? '' : 'warn'}`} title={ok ? `เรียน ${x} ใน${t!.label}` : `ต้องผ่าน ${x} ก่อน`}><span aria-hidden="true">←</span> ต้องผ่าน {x}{t ? ` (${t.label})` : ''}</a>;
      })}
    </span>
  );
}

function PlanRow({ it, at, terms, order }: { it: PlanItem; at: number; terms: Term[]; order: Map<string, number> }) {
  const { p, s, setSettings } = useStore();
  if (it.kind === 'course') return (
    <li className="course-row">
      <a href={`#/course/${it.code}`} className="course-link">
        <span className="code">{it.code}</span>
        <span className="cr-main"><b>{it.course.name_th}</b><span className="small muted">{it.course.name_en}</span></span>
        <span className="cr-credits">{it.credits}<small>นก.</small></span>
        <Ready r={readiness(p, it.code)} />
      </a>
      <Prereqs code={it.code} at={at} terms={terms} order={order} />
    </li>
  );
  const choose = (v: string) => setSettings({ profile: { ...s.profile, slots: { ...s.profile.slots, [it.id]: v } } });
  const options = slotOptions(it.slot);
  return (
    <li className="course-row slot">
      <div className="slot-head">
        <span className="code slot-code">{it.id}</span>
        <span className="cr-main"><b>{SLOTS[it.slot].th}</b><span className="small muted">{it.label} · ยังเลือกได้</span></span>
        <span className="cr-credits">{it.credits}<small>นก.</small></span>
      </div>
      <label className="slot-pick">
        <span className="sr">เลือกวิชาสำหรับ {it.label}</span>
        {options.length ? (
          <select value={it.choice ?? ''} onChange={(e) => choose(e.target.value)}>
            <option value="">ยังไม่เลือก</option>
            {it.slot === 'ME'
              ? [...new Set(options.flatMap((c) => c.me_groups ?? []))].map((g) => <optgroup key={g} label={g}>{options.filter((c) => c.me_groups?.includes(g)).map((c) => <option key={c.code} value={c.code}>{c.code} {c.name_th}</option>)}</optgroup>)
              : options.map((c) => <option key={c.code} value={c.code}>{c.code} {c.name_th}</option>)}
          </select>
        ) : <input value={it.choice ?? ''} placeholder="พิมพ์ชื่อวิชาที่เลือก" onChange={(e) => choose(e.target.value)} />}
      </label>
      {it.course ? <a className="small" href={`#/course/${it.course.code}`}>ดูคำอธิบาย {it.course.code} →</a> : <p className="small muted slot-rule">{SLOT_RULE_TH[it.slot]}</p>}
      {it.course && <Prereqs code={it.course.code} at={at} terms={terms} order={order} />}
    </li>
  );
}

/* ---------------- ปฏิทิน ---------------- */
type CalTermId = (typeof calendar.terms)[number]['id'];
const cellEnd = (c: { from: string; to?: string }) => c.to ?? c.from;
const countdown = (today: string, c: { from: string; to?: string }) => {
  if (c.from <= today && today <= cellEnd(c)) return c.to ? 'อยู่ในช่วงนี้' : 'วันนี้';
  const d = daysBetween(today, c.from);
  return d > 0 ? `อีก ${d} วัน` : 'ผ่านแล้ว';
};

export function CalendarPage() {
  const { terms, today } = usePlan();
  // the first date that has not finished yet, across the whole table
  const upcoming = calendar.rows
    .flatMap((r) => calendar.terms.flatMap((t) => (r.cells[t.id] ?? []).map((c) => ({ r, t, c }))))
    .filter((x) => cellEnd(x.c) >= today)
    .sort((a, b) => (a.c.from < b.c.from ? -1 : a.c.from > b.c.from ? 1 : 0))[0];
  const [term, setTerm] = useState<CalTermId>(upcoming?.t.id ?? '1');
  const { s } = useStore();
  const fresh = s.profile.cohort === '1/1' ? calendar.freshman : null;
  const prep = terms.find((t) => t.season === 't1-1' && t.year === 1);
  return (
    <div className="calendar-page">
      <h1 className="page-title">ปฏิทินการศึกษา 2570</h1>
      <p className="muted">ระดับปริญญาตรี ภาคการศึกษาที่ 1/2570 ถึงภาคฤดูร้อน/2570 ตามตารางของมหาวิทยาลัย {calendar.note_th} · ที่มา <a href="https://www.bu.ac.th/th/calendar/bachelor-degree/2027" target="_blank" rel="noreferrer">bu.ac.th/th/calendar</a> (ข้อมูลล่าสุด ณ วันที่ 9 พ.ย. 2569)</p>
      {fresh && (
        <section className="card cal-fresh">
          <h2>{fresh.th}</h2>
          <p>{fresh.how_th}</p>
          <ol className="cal-fresh-list">
            {fresh.items.map((it) => {
              const past = (it.to ?? it.from) < today && it.precision !== 'unknown';
              return (
                <li key={it.th} className={past ? 'past' : ''}>
                  <span className="cal-date">{it.text}</span>
                  <span>
                    <b>{it.th}</b>
                    {it.precision !== 'day' && <span className="est-tag">{it.precision === 'month' ? 'รู้แค่เดือน' : 'ยังไม่ประกาศ'}</span>}
                    {it.precision === 'day' && <span className="cal-when">{countdown(today, it)}</span>}
                    {it.note_th && <small>{it.note_th}</small>}
                  </span>
                </li>
              );
            })}
          </ol>
          {prep && <p className="small">ระบบใช้วันภาค 1/1 เป็น {thaiRange(prep.start, prep.end)}{prep.edited ? ' (ตามที่คุณแก้)' : ` (${ESTIMATE_NOTE})`} <button className="link" onClick={() => go('/settings')}>แก้วัน</button></p>}
        </section>
      )}
      {upcoming && (
        <div className="cal-next">
          <span className="next-tag">ถัดไป</span>
          <b>{upcoming.r.th}</b>
          <span>{upcoming.t.th} · {upcoming.c.text}{upcoming.c.time ? ` ${upcoming.c.time}` : ''}</span>
          <span className="cal-when">{countdown(today, upcoming.c)}</span>
        </div>
      )}
      <div className="tabs cal-tabs" role="tablist" aria-label="เลือกภาคการศึกษา">
        {calendar.terms.map((t) => <button key={t.id} role="tab" aria-selected={t.id === term} className={t.id === term ? 'on' : ''} onClick={() => setTerm(t.id)}>{t.th.replace('ภาคการศึกษาที่ ', 'ภาค ').replace('ภาคฤดูร้อน', 'ฤดูร้อน')}</button>)}
      </div>
      <table className="cal-table" data-term={term}>
        <thead>
          <tr><th scope="col">กำหนดการ</th>{calendar.terms.map((t) => <th key={t.id} scope="col" data-t={t.id}>{t.th}</th>)}</tr>
        </thead>
        <tbody>
          {calendar.rows.map((r) => (
            <tr key={r.th} className={r.key === 'start' || r.key === 'end' ? 'key' : ''}>
              <th scope="row">{r.th}{r.sub && <small>{r.sub}</small>}</th>
              {calendar.terms.map((t) => {
                const cells = r.cells[t.id];
                return (
                  <td key={t.id} data-t={t.id}>
                    {!cells ? <span className="muted">-</span> : cells.map((c) => {
                      const past = cellEnd(c) < today;
                      const isNext = upcoming?.c === c;
                      return (
                        <div key={c.text} className={`cal-cell ${past ? 'past' : ''} ${isNext ? 'next' : ''}`}>
                          <span className="cal-date">{c.text}</span>
                          {c.time && <span className="cal-time">{c.time}</span>}
                          <span className="cal-when">{countdown(today, c)}</span>
                        </div>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">วันสอบกลางภาค ปลายภาค และวันปฐมนิเทศไม่อยู่ในปฏิทินนี้ ดูประกาศของมหาวิทยาลัยหรือ registration.bu.ac.th</p>
    </div>
  );
}

/* ---------------- ตั้งค่า ---------------- */
export function SettingsPage() {
  const { s, setSettings } = useStore();
  const { terms } = usePlan();
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState<{ mlxWhisper: boolean; elevenlabs: boolean; routerKey: boolean } | null>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (HAS_SERVER) fetch('/api/status').then((r) => r.json()).then((d) => { setModels(d.routerModels); setStatus(d); }).catch(() => setStatus(null)); }, []);
  const profile = s.profile;
  const setProfile = (patch: Partial<typeof profile>) => setSettings({ profile: { ...profile, ...patch } });
  const setDate = (t: Term, k: 'start' | 'end', v: string) => {
    if (!isISODate(v)) return;
    setProfile({ termDates: { ...profile.termDates, [t.id]: { start: t.start, end: t.end, [k]: v } } });
  };
  const resetDate = (id: string) => { const { [id]: _, ...rest } = profile.termDates; setProfile({ termDates: rest }); };
  return (
    <div>
      <h1 className="page-title">ตั้งค่า</h1>
      <div className="settings stagger">
        <Card>
          <h3>แผนการเรียนของฉัน</h3>
          <label className="field">ชื่อเล่น <input value={s.name} onChange={(e) => setSettings({ name: e.target.value })} /></label>
          <div className="field-row">
            <label className="field">รุ่น <select value={profile.cohort} onChange={(e) => setProfile({ cohort: e.target.value as Cohort })}>{COHORTS.map((c) => <option key={c} value={c}>รุ่น {c}</option>)}</select></label>
            <label className="field">แผนการเรียน <select value={profile.track} onChange={(e) => setProfile({ track: e.target.value as Track })}>{(Object.keys(TRACKS) as Track[]).map((t) => <option key={t} value={t}>{TRACKS[t]}</option>)}</select></label>
          </div>
          <p className="small muted">รวม {totalCredits(terms)} หน่วยกิต ใน {terms.length} ภาค</p>
        </Card>
        <Card>
          <h3>วันเปิดและปิดภาค</h3>
          <p className="small muted">ค่าเริ่มต้นมาจากปฏิทิน 2570 และหน้ารับสมัคร Dek70: ภาค 1/1 (ภาคเตรียมความพร้อม) เริ่มเรียนมิถุนายน 2570 ยังไม่ประกาศวันที่ ระบบนับจาก 1 มิ.ย. ถึง 31 ก.ค. ไว้ก่อน ({ESTIMATE_NOTE}) ภาค 1/2 คือภาคเรียนที่ 1 ของมหาวิทยาลัย 16 ส.ค. ถึง 5 ธ.ค. 2570 ปี 2 ถึง 4 เลื่อนไปปีละ 1 ปี แก้ได้เมื่อมหาวิทยาลัยประกาศ</p>
          <ol className="date-list">
            {terms.map((t) => (
              <li key={t.id} className="date-row">
                <span className="date-label"><b>{t.label}</b>{t.estimate && <span className="est-tag">ค่าประมาณ</span>}{t.edited && <span className="edited-tag">แก้แล้ว</span>}</span>
                <label><span className="sr">วันเปิด {t.label}</span><input type="date" value={t.start} onChange={(e) => setDate(t, 'start', e.target.value)} /></label>
                <span aria-hidden="true">ถึง</span>
                <label><span className="sr">วันปิด {t.label}</span><input type="date" value={t.end} onChange={(e) => setDate(t, 'end', e.target.value)} /></label>
                {t.edited && <button className="link" onClick={() => resetDate(t.id)}>คืนค่า ({thaiRange(defaultTermDates(t.id).start, defaultTermDates(t.id).end)})</button>}
              </li>
            ))}
          </ol>
        </Card>
        <Card>
          <h3>หน้าตาและเสียง</h3>
          <label className="field">ธีม <select value={s.theme} onChange={(e) => setSettings({ theme: e.target.value as never })}><option value="auto">ตามเครื่อง</option><option value="light">สว่าง</option><option value="dark">มืด</option></select></label>
          <label className="check"><input type="checkbox" checked={s.sfx} onChange={(e) => { setSettings({ sfx: e.target.checked }); setSfx(e.target.checked); }} /> เสียงเอฟเฟกต์</label>
          <label className="check"><input type="checkbox" checked={s.music} onChange={(e) => setSettings({ music: e.target.checked })} /> เสียงประกอบตอนเรียน</label>
          <div className="sound-list" role="radiogroup" aria-label="แนวเสียง">
            {(Object.keys(SOUNDS) as TrackId[]).map((id) => (
              <label key={id} className={`sound ${s.musicTrack === id ? 'on' : ''}`}>
                <input type="radio" name="track" checked={s.musicTrack === id} onChange={() => setSettings({ musicTrack: id, music: true })} />
                <span><b>{SOUNDS[id].name_th}</b><span className="small muted">{SOUNDS[id].note_th}</span></span>
              </label>
            ))}
          </div>
          <label className="field">ความดัง <input type="range" min="0.05" max="1" step="0.05" value={s.musicVol} onChange={(e) => setSettings({ musicVol: Number(e.target.value) })} /></label>
          <p className="small muted">ทุกแนวไม่มีเนื้อร้อง เพราะเนื้อร้องรบกวนการอ่าน เสียงจะเงียบเองตอนอัดเสียงพูด อ่านเพิ่มที่ <a href="#/learn">วิธีเรียนให้จำ</a></p>
        </Card>
        {HAS_SERVER && (
          <Card>
            <h3>เสียงและ AI (เฉพาะตอนรันในเครื่อง)</h3>
            <label className="field">ระบบถอดเสียงพูด <select value={s.stt} onChange={(e) => setSettings({ stt: e.target.value as never })}>
              <option value="auto">อัตโนมัติ (ในเครื่องก่อน)</option><option value="local">MLX Whisper ในเครื่อง {status?.mlxWhisper ? '(พร้อม)' : '(ไม่พบ)'}</option>
              <option value="eleven">ElevenLabs Speech-to-Text {status?.elevenlabs ? '(พร้อม)' : '(ไม่มี key)'}</option><option value="webspeech">Web Speech ของเบราว์เซอร์</option></select></label>
            <label className="field">โมเดล AI สำหรับคำถามต่อเนื่องและผลตอบกลับ <select value={s.aiModel} onChange={(e) => setSettings({ aiModel: e.target.value })}>
              <option value="">ไม่ใช้ AI (ใช้ชุดคำถามที่เตรียมไว้)</option>{models.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
            {!models.length && <p className="small muted">ไม่พบ 9Router แอปยังใช้ได้ครบโดยไม่ต้องมี AI</p>}
          </Card>
        )}
        <Card>
          <h3>สำรองข้อมูล</h3>
          <p className="small muted">ความคืบหน้าเก็บในเครื่องนี้เท่านั้น Export ไว้ก่อนเปลี่ยนเครื่องหรือล้างเบราว์เซอร์</p>
          <div className="row">
            <button onClick={async () => { const blob = new Blob([await exportAll()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `early-bird-backup-${dateKey()}.json`; a.click(); }}>Export</button>
            <label className="button">Import <input type="file" accept=".json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { await importAll(await f.text()); setMsg('นำเข้าแล้ว กำลังโหลดใหม่…'); setTimeout(() => location.reload(), 800); } catch (err) { setMsg((err as Error).message); } }} /></label>
            <button className="danger" onClick={async () => { if (confirm('ล้างความคืบหน้าทั้งหมด? (export ไว้ก่อนนะ)')) { await idbSet('progress', undefined); await idbSet('settings', defaultSettings()); location.reload(); } }}>ล้างข้อมูล</button>
          </div>
          {msg && <p>{msg}</p>}
        </Card>
      </div>
    </div>
  );
}

export function useTheme() {
  const { s } = useStore();
  useEffect(() => { document.documentElement.dataset.theme = s.theme; setSfx(s.sfx); }, [s.theme, s.sfx]);
  useEffect(() => { playMusic(s.music ? s.musicTrack : null, s.musicVol); }, [s.music, s.musicTrack, s.musicVol]);
}

