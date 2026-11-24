// "อาชีพและวิชาเลือก": three questions -> career paths and a plan for every elective slot, with backups.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import { usePlan } from './usePlan';
import { SLOT_RULE_TH, SLOTS } from './curriculum';
import { goals, planSlots, rankCareers, hasAnswers, emptyAnswers, isMajorElective, JEV_MODEL, type Answers, type CourseFit, type Goal } from './advisor';
import { HAS_SERVER } from './audio';
import { thaiRange } from './dates';
import { Back } from './ui';

const MAX_DREAMS = 3;

function Chips({ list, sel, onToggle, max }: { list: Goal[]; sel: string[]; onToggle: (id: string) => void; max?: number }) {
  return (
    <div className="chips">
      {list.map((g) => {
        const on = sel.includes(g.id);
        const full = !on && max !== undefined && sel.length >= max;
        return <button key={g.id} className={`chip ${on ? 'sel' : ''}`} aria-pressed={on} disabled={full} onClick={() => onToggle(g.id)}>{g.th}</button>;
      })}
    </div>
  );
}

function CourseLine({ c, rank }: { c: CourseFit; rank?: number }) {
  return (
    <span className="adv-course">
      {rank !== undefined && <span className="adv-rank">{rank}</span>}
      <a href={`#/course/${c.course.code}`}><b>{c.course.code}</b> {c.course.name_th}</a>
      <span className="adv-fit" title="ความตรงกับเป้าหมาย จากคะแนนของ Jev"><i style={{ width: `${Math.round(c.fit * 100)}%` }} /></span>
      {c.best && <small>ตรงกับ{c.best.th}</small>}
      {c.unsure && <span className="est-tag">Jev ไม่ค่อยมั่นใจ</span>}
    </span>
  );
}

/** Free-text dream, read by Jev on the local dev server (the API key never reaches the browser or GitHub Pages). */
function DreamText({ onCareers }: { onCareers: (ids: string[]) => void }) {
  const [ok, setOk] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { if (HAS_SERVER) fetch('/api/status').then((r) => r.json()).then((d) => setOk(!!d.jev)).catch(() => setOk(false)); }, []);
  if (!ok) return null;
  const ask = async () => {
    setBusy(true); setMsg('');
    try {
      const r = await fetch('/api/dream', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      const hits = (d.careers as { id: string; p: number }[]).filter((x) => x.p >= 0.6).slice(0, MAX_DREAMS);
      if (!hits.length) setMsg('Jev ยังจับคู่กับอาชีพในรายการไม่ได้ ลองเล่าเพิ่มว่าอยากทำงานแบบไหน หรือเลือกจากปุ่มด้านบน');
      else { onCareers(hits.map((x) => x.id)); setMsg(`Jev เลือกให้ ${hits.length} อาชีพ แก้ได้จากปุ่มด้านบน`); }
    } catch (e) { setMsg(`ติดต่อ Jev ไม่ได้: ${(e as Error).message}`); }
    setBusy(false);
  };
  return (
    <div className="adv-dream">
      <label htmlFor="dream">หรือเล่าความฝันด้วยคำพูดของคุณเอง แล้วให้ Jev อ่าน</label>
      <textarea id="dream" rows={3} value={text} maxLength={1000} placeholder="เช่น อยากทำงานที่ได้เดินทาง เจอคนต่างชาติ และพูดภาษาอังกฤษทุกวัน" onChange={(e) => setText(e.target.value)} />
      <button className="ghost" disabled={busy || !text.trim()} onClick={ask}>{busy ? 'Jev กำลังอ่าน…' : 'ให้ Jev อ่าน'}</button>
      {msg && <p className="small">{msg}</p>}
    </div>
  );
}

export function AdvisorPage() {
  const { s, setSettings } = useStore();
  const { terms } = usePlan();
  const a: Answers = { ...emptyAnswers(), ...s.profile.advisor };
  const save = (next: Answers) => setSettings({ profile: { ...s.profile, advisor: next } });
  const toggle = (k: keyof Answers, id: string) => save({ ...a, [k]: a[k].includes(id) ? a[k].filter((x) => x !== id) : [...a[k], id] });
  const careers = useMemo(() => rankCareers(a), [s.profile.advisor]);
  const plan = useMemo(() => (hasAnswers(a) ? planSlots(terms, a) : []), [s.profile.advisor, terms]);
  const [applied, setApplied] = useState(false);
  const picks = plan.filter((p) => p.main);
  const changes = picks.filter((p) => s.profile.slots[p.item.id] !== p.main!.course.code);
  const apply = () => {
    setSettings({ profile: { ...s.profile, slots: { ...s.profile.slots, ...Object.fromEntries(picks.map((p) => [p.item.id, p.main!.course.code])) } } });
    setApplied(true);
  };
  const topCareers = careers.filter((c) => c.fit > 0).slice(0, 3);

  return (
    <div className="advisor">
      <Back to="/plan" />
      <h1 className="page-title">อาชีพในฝันและวิชาเลือก</h1>
      <p className="muted">ตอบ 3 ข้อ แล้วระบบจะแนะนำแนวอาชีพ และวางวิชาเลือกให้ทุกช่องในแผน พร้อมวิชาสำรองถ้าวิชาเต็มหรือลงไม่ทัน คะแนนความตรงของแต่ละวิชามาจาก Jev ของ TypeSafe ซึ่งอ่านคำอธิบายรายวิชาทุกวิชาไว้แล้ว</p>

      <section className="card">
        <h2>1. อาชีพในฝัน <small className="muted">เลือกได้ {MAX_DREAMS} อย่าง ยังไม่รู้ก็ข้ามได้</small></h2>
        <Chips list={goals.careers} sel={a.dreams} max={MAX_DREAMS} onToggle={(id) => toggle('dreams', id)} />
        <DreamText onCareers={(ids) => save({ ...a, dreams: ids })} />
      </section>
      <section className="card">
        <h2>2. ชอบทำอะไร <small className="muted">เลือกได้หลายอย่าง</small></h2>
        <Chips list={goals.interests} sel={a.interests} onToggle={(id) => toggle('interests', id)} />
      </section>
      <section className="card">
        <h2>3. อยากต่อยอดทักษะไหน <small className="muted">เลือกได้หลายอย่าง</small></h2>
        <Chips list={goals.skills} sel={a.skills} onToggle={(id) => toggle('skills', id)} />
      </section>

      {!hasAnswers(a) ? <p className="muted center">เลือกอย่างน้อย 1 ข้อเพื่อดูคำแนะนำ</p> : (
        <>
          {topCareers.length > 0 && (
            <section className="card adv-careers">
              <h2>แนวอาชีพที่เหมาะกับคุณ</h2>
              <ol>
                {topCareers.map((c) => (
                  <li key={c.career.id}>
                    <b>{c.career.th}</b>
                    {c.dream && <span className="adv-tag">อาชีพในฝัน</span>}
                    {c.because.length > 0 && <small>งานนี้ได้{c.because.map((g) => g.th).join(' และ')}บ่อย ซึ่งคุณบอกว่าชอบ</small>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="card adv-plan">
            <h2>แผนวิชาเลือกของคุณ</h2>
            <p className="small muted">ลงตัวหลักก่อน ถ้าวิชาเต็ม ไม่เปิด หรือลงไม่ทัน ให้ลงตัวสำรองตามลำดับ ข้ามวิชาที่ลงไปแล้วในช่องอื่น ดูวิชาที่เปิดจริงแต่ละเทอมที่ ursa2.bu.ac.th/seat/seat1.cfm</p>
            <ol className="adv-slots">
              {plan.map((p, i) => (
                <li key={p.item.id} className="adv-slot">
                  <div className="adv-slot-head">
                    <span className="code slot-code">{p.item.id}</span>
                    <b>{SLOTS[p.item.slot].th}</b>
                    <small className="muted">{p.term.label} · {thaiRange(p.term.start, p.term.end)}</small>
                  </div>
                  {p.main ? (
                    <>
                      <p className="adv-main"><span className="adv-tag">ตัวหลัก</span><CourseLine c={p.main} /></p>
                      {p.item.slot === 'FE' && isMajorElective(p.main.course.code) && <p className="small muted">วิชานี้เป็นวิชาเอกเลือก หลักสูตรให้เลือกวิชาใดก็ได้ที่เปิดในมหาวิทยาลัยเป็นวิชาเลือกเสรี ยืนยันกับภาควิชาก่อนลง</p>}
                      {p.backups.length > 0 && (
                        <div className="adv-backups">
                          <span className="small">ถ้าเต็มหรือลงไม่ทัน</span>
                          <ol>{p.backups.map((b, i) => <li key={b.course.code}><CourseLine c={b} rank={i + 1} /></li>)}</ol>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      {p.note_th && <p className="adv-main"><span className="adv-tag">แนวทาง</span>{p.note_th}</p>}
                      {i === plan.findIndex((x) => x.item.slot === p.item.slot) && <p className="small muted">{SLOT_RULE_TH[p.item.slot]} ถามภาควิชาว่าเทอมนั้นมีกลุ่มวิชาไหนให้เลือก</p>}
                    </>
                  )}
                </li>
              ))}
            </ol>
            <div className="adv-apply">
              <button className="primary" disabled={!changes.length} onClick={apply}>{changes.length ? `ใช้ตัวหลักในแผน 4 ปี (${changes.length} ช่อง)` : 'แผน 4 ปีใช้ตัวหลักชุดนี้แล้ว'}</button>
              {applied && <a href="#/plan">ดูแผน 4 ปี →</a>}
            </div>
          </section>
          <p className="small muted">คะแนนจาก Jev ({JEV_MODEL}) ซึ่งประเมินจากคำอธิบายรายวิชาในหลักสูตร ไม่ใช่คำแนะนำทางการของมหาวิทยาลัย ปรึกษาอาจารย์ที่ปรึกษาก่อนลงทะเบียน</p>
        </>
      )}
    </div>
  );
}
