import { useState } from 'react';
import { interview } from './content';
import { useStore } from './store';
import { speak, interviewerFor, HAS_SERVER } from './audio';
import { Back, Card, Listen } from './ui';

/** Helps the student turn THEIR OWN true story (written in Thai) into English they can actually say. Never invents facts. */
export function Builder() {
  const { p, s, update } = useStore();
  const [qid, setQid] = useState(interview.questions[0].id);
  const q = interview.questions.find((x) => x.id === qid)!;
  const saved = p.myAnswers[qid];
  const [th, setTh] = useState(saved?.th ?? '');
  const [en, setEn] = useState(saved?.en ?? '');
  const [back, setBack] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pick = (id: string) => { setQid(id); setTh(p.myAnswers[id]?.th ?? ''); setEn(p.myAnswers[id]?.en ?? ''); setBack(''); setErr(''); };

  async function polish() {
    setBusy(true); setErr('');
    if (!HAS_SERVER) { setErr('เวอร์ชันออนไลน์ยังเรียบเรียงด้วย AI ไม่ได้ ใช้โครงประโยคด้านล่างเขียนเองได้เลย'); setBusy(false); return; }
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        model: s.aiModel, json: true, maxTokens: 500,
        messages: [
          { role: 'system', content: 'You help a Thai first-year English major (CEFR A2) prepare a spoken answer for a university speaking class. Use ONLY the facts in the student\'s Thai notes. Do NOT add any experience, award, number, name, or feeling they did not write. If the notes are too thin, keep the answer short. Write 3-5 short, natural spoken sentences at A2-B1 level (common words, simple tenses). Reply ONLY JSON {"en":"...","th_back":"<Thai back-translation of your English so the student can check nothing was invented>"}.' },
          { role: 'user', content: `Speaking question: ${q.q}\nStudent notes (Thai): ${th}` },
        ] }) });
      if (!r.ok) throw new Error('AI ไม่ตอบ');
      const d = JSON.parse((await r.json()).content.replace(/^```json|```$/g, ''));
      setEn(d.en); setBack(d.th_back);
    } catch (e) { setErr(`เรียบเรียงอัตโนมัติไม่ได้ (${(e as Error).message}) — ใช้โครงประโยคด้านล่างเขียนเองได้เลย`); }
    setBusy(false);
  }

  return (
    <div>
      <Back to="/speak" />
      <h2>สร้างคำตอบของฉันเอง</h2>
      <p className="muted">เขียน <b>เรื่องจริง</b> ของเราเป็นภาษาไทย แอปจะช่วยเรียบเรียงเป็นอังกฤษง่าย ๆ ที่พูดได้จริง โดยไม่แต่งเรื่องเพิ่ม อาจารย์หรือเพื่อนถามต่อเมื่อไหร่ เราจะตอบได้เพราะมันคือเรื่องของเราเอง</p>
      <label className="field">คำถาม <select value={qid} onChange={(e) => pick(e.target.value)}>
        {interview.categories.map((c) => <optgroup key={c.id} label={c.name_th}>{interview.questions.filter((x) => x.cat === c.id).map((x) => <option key={x.id} value={x.id}>{p.myAnswers[x.id] ? '✓ ' : ''}{x.q}</option>)}</optgroup>)}
      </select></label>
      <Card>
        <b>{q.q}</b> <Listen onClick={() => speak(q.q, interviewerFor(q.id))} /><div className="muted">{q.q_th}</div>
        <p className="small">{q.tip_th}</p>
        <label className="field">เรื่องจริงของฉัน (ภาษาไทย)<textarea rows={4} value={th} onChange={(e) => setTh(e.target.value)} placeholder="เช่น ชอบดูซีรีส์ภาษาอังกฤษ เคยช่วยฝรั่งถามทาง อยากเป็นล่าม…" /></label>
        <div className="row">
          <button className="primary" disabled={!th || busy || !s.aiModel} onClick={polish}>{busy ? 'กำลังเรียบเรียง…' : 'เรียบเรียงเป็นอังกฤษ'}</button>
          {!s.aiModel && <span className="small muted">เลือกโมเดล AI ในตั้งค่าเพื่อใช้ปุ่มนี้ หรือเขียนเองตามโครง</span>}
        </div>
        {err && <p className="no-text">{err}</p>}
        <p className="small">โครงประโยค: <code>{q.frame}</code></p>
        <label className="field">คำตอบภาษาอังกฤษของฉัน<textarea rows={4} value={en} onChange={(e) => setEn(e.target.value)} /></label>
        {back && <p className="small muted">แปลกลับเพื่อเช็กว่าไม่มีเรื่องที่เราไม่ได้เขียน: {back}</p>}
        <div className="row">
          <button disabled={!en} onClick={() => speak(en, 'reader')}>ฟัง</button>
          <button disabled={!en} onClick={() => speak(en, 'reader', { slow: true })}>ฟังช้า</button>
          <button className="primary" disabled={!en} onClick={() => update((pp) => { pp.myAnswers[qid] = { th, en }; })}>บันทึก</button>
        </div>
        {saved && <p className="small ok-text">บันทึกแล้ว — จะโผล่ในขั้น 4 "ตอบเอง" ให้ซ้อมพูด</p>}
        <details><summary>ดูคำตอบตัวอย่าง (ของคนอื่น ห้ามลอก ใช้ดูโครงเท่านั้น)</summary><p>{q.sample}</p></details>
      </Card>
    </div>
  );
}
