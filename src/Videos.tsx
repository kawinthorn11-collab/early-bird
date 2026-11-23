import { HAS_SERVER } from './audio';
import { useEffect, useRef, useState } from 'react';
import { videos } from './content';
import { useStore, addXp, markDone } from './store';
import { Back, Card, go } from './ui';

type Cue = { start: number; end: number; text: string };

export function parseSubs(txt: string): Cue[] {
  const ts = (s: string) => { const m = s.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)/); return m ? (Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) : 0; };
  return txt.replace(/\r/g, '').split(/\n\n+/).map((block) => {
    const lines = block.split('\n').filter((l) => l && l !== 'WEBVTT' && !/^\d+$/.test(l.trim()));
    const t = lines.find((l) => l.includes('-->'));
    if (!t) return null;
    const [a, b] = t.split('-->');
    return { start: ts(a), end: ts(b.split(' ')[1] ? b.trim().split(' ')[0] : b), text: lines.filter((l) => l !== t).join(' ').replace(/<[^>]+>/g, '') };
  }).filter(Boolean) as Cue[];
}

declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }
const ytReady = () => new Promise<void>((res) => {
  if (window.YT?.Player) return res();
  const prev = window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady = () => { prev?.(); res(); };
  if (!document.getElementById('yt-api')) { const s = document.createElement('script'); s.id = 'yt-api'; s.src = 'https://www.youtube.com/iframe_api'; document.head.append(s); }
});

export function VideosPage() {
  const [topic, setTopic] = useState(videos.topics[0]?.id);
  return (
    <div>
      <Back />
      <h2>คลิปเสริม</h2>
      <p className="muted">คลิปทุกลิงก์ถูกเปิดตรวจแล้วว่าเล่นได้และตรงหัวข้อ (วันที่ตรวจอยู่ใต้คลิป) · อ่านโน้ตก่อนดู แล้วตอบคำถาม 3 ข้อหลังดู</p>
      <div className="tabs wrap">{videos.topics.map((t) => <button key={t.id} className={t.id === topic ? 'on' : ''} onClick={() => setTopic(t.id)}>{t.name_th}</button>)}</div>
      <div className="grid2">{videos.videos.filter((v) => v.topic === topic).map((v) => (
        <Card key={v.id} onClick={() => go(`/video/${v.id}`)}>
          <img className="thumb" src={`https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`} alt="" loading="lazy" />
          <b><span className="lang-tag">{v.lang === 'th' ? 'TH' : 'EN'}</span>{v.title}</b><div className="small muted">{v.channel} · {v.duration}</div>
        </Card>))}</div>
    </div>
  );
}

export function VideoPage({ id }: { id: string }) {
  const v = videos.videos.find((x) => x.id === id);
  const { s, update } = useStore();
  const box = useRef<HTMLDivElement>(null);
  const player = useRef<any>(null);
  const [cues, setCues] = useState<Cue[]>([]);
  const [now, setNow] = useState(0);
  const [th, setTh] = useState<Record<number, string>>({});
  const [word, setWord] = useState<{ w: string; th?: string } | null>(null);
  const [answers, setAnswers] = useState<string[]>(['', '', '']);

  useEffect(() => {
    if (HAS_SERVER) fetch(`/api/subs?id=${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setCues(parseSubs(d.text))).catch(() => {});
    let timer: number;
    ytReady().then(() => {
      if (!box.current) return;
      player.current = new window.YT.Player(box.current, { videoId: id, playerVars: { cc_load_policy: 1, cc_lang_pref: v?.lang === 'th' ? 'th' : 'en', rel: 0 } });
      timer = window.setInterval(() => { const t = player.current?.getCurrentTime?.(); if (typeof t === 'number') setNow(t); }, 250);
    });
    return () => { clearInterval(timer); player.current?.destroy?.(); };
  }, [id]);

  const ci = cues.findIndex((c) => now >= c.start && now <= c.end);
  useEffect(() => {
    if (!HAS_SERVER || ci < 0 || th[ci] !== undefined) return;
    setTh((x) => ({ ...x, [ci]: '' }));
    fetch('/api/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: cues[ci].text, model: s.aiModel }) })
      .then((r) => (r.ok ? r.json() : null)).then((d) => d && setTh((x) => ({ ...x, [ci]: d.text }))).catch(() => {});
  }, [ci]);

  async function lookup(w: string) {
    const clean = w.replace(/[^A-Za-z'-]/g, '');
    if (!clean) return;
    player.current?.pauseVideo?.();
    setWord({ w: clean });
    const r = HAS_SERVER ? await fetch('/api/translate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: clean, model: s.aiModel }) }).catch(() => null) : null;
    const d = r && r.ok ? await r.json() : null;
    setWord({ w: clean, th: d?.text ?? '(ออฟไลน์ — เก็บคำไว้ก่อน ค่อยหาความหมาย)' });
  }

  if (!v) return <div><Back to="/videos" />ไม่พบคลิป</div>;
  return (
    <div>
      <Back to="/videos" />
      <h2>{v.title}</h2>
      <Card className="note"><b>โน้ตก่อนดู: ศัพท์สำคัญ</b>
        <div className="terms">{v.notes_th.vocab.map(([en, t]) => <span key={en} className="term"><b>{en}</b> = {t}</span>)}</div>
      </Card>
      <div className="video"><div ref={box} /></div>
      <div className="small muted">{v.channel} · {v.duration} · ตรวจว่าเล่นได้เมื่อ {v.checked}</div>
      {cues.length > 0 ? (
        <div className="subs">
          <div className="sub-en">{ci >= 0 ? cues[ci].text.split(' ').map((w, k) => <span key={k} className="word" onClick={() => lookup(w)}>{w} </span>) : '…'}</div>
          <div className="sub-th">{ci >= 0 ? th[ci] || '' : ''}</div>
        </div>
      ) : <p className="small muted">ไม่มีไฟล์ซับของเราเอง — วางไฟล์ <code>subs/{v.id}.srt</code> หรือ <code>.vtt</code> แล้วรีเฟรช จะได้ซับสองบรรทัดที่คลิกคำได้</p>}
      {word && <Card className="word-card"><b>{word.w}</b> = {word.th ?? 'กำลังหา…'}
        <div className="row"><button className="primary" onClick={() => { update((p) => { if (!p.vocab.some((x) => x.word === word.w)) p.vocab.push({ word: word.w, th: word.th, src: v.id, t: Date.now() }); }); setWord(null); player.current?.playVideo?.(); }}>เก็บเข้าคลังศัพท์</button>
          <button onClick={() => { setWord(null); player.current?.playVideo?.(); }}>ปิด</button></div></Card>}
      <Card>
        <h3>คำถามหลังดู</h3>
        {v.notes_th.questions.map((q, i) => <label key={i} className="field">{i + 1}. {q}<input value={answers[i]} onChange={(e) => setAnswers(answers.map((a, k) => (k === i ? e.target.value : a)))} /></label>)}
        <button className="primary" disabled={answers.some((a) => !a.trim())} onClick={() => { update((p) => { addXp(p, 25); markDone(p, 'video'); }); go('/'); }}>ตอบครบแล้ว +25 XP</button>
      </Card>
    </div>
  );
}

export function VocabPage() {
  const { p, update } = useStore();
  return (
    <div>
      <Back />
      <h2>คลังศัพท์ของฉัน ({p.vocab.length})</h2>
      {!p.vocab.length && <Card>คลิกคำในซับของคลิปเพื่อเก็บคำ</Card>}
      {p.vocab.map((x) => <Card key={x.word}><div className="row spread"><span><b>{x.word}</b> = {x.th}</span><button className="link" onClick={() => update((pp) => { pp.vocab = pp.vocab.filter((y) => y.word !== x.word); })}>ลบ</button></div></Card>)}
    </div>
  );
}
