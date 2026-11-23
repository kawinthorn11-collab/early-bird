import { useEffect, useRef, useState } from 'react';
import { useStore, level } from './store';
import { Home, DailyPage, PlanPage, CalendarPage, SettingsPage, useTheme } from './pages';
import { CoursePage, UnitPlayer } from './Course';
import { LessonPlayer } from './Lesson';
import { SpeakHub, Survival, Calm, VoiceProgress } from './Speak';
import { InterviewRoom } from './Interview';
import { Builder } from './Builder';
import { VideosPage, VideoPage, VocabPage } from './Videos';
import { LearnPage } from './Learn';
import { QuickRun } from './QuickRun';
import { Disclaimer, celebrate, go } from './ui';
import { reducedMotion } from './motion';

export const APP_NAME = 'Early Bird';

function useHash() {
  const [h, setH] = useState(location.hash.slice(1) || '/');
  useEffect(() => {
    const f = () => {
      setH(location.hash.slice(1) || '/'); window.scrollTo(0, 0);
      const still = reducedMotion();
      document.querySelector('main.wrap')?.animate(
        still ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
        { duration: still ? 150 : 320, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    };
    addEventListener('hashchange', f); return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

/** Level chip that floats every real XP gain above the header, and celebrates once when the level goes up. */
function XpChip({ xp }: { xp: number }) {
  const prev = useRef(xp);
  const [gain, setGain] = useState<{ n: number; up: number | null; id: number } | null>(null);
  useEffect(() => {
    const before = prev.current; prev.current = xp;
    if (xp <= before) { setGain(null); return; }
    const up = level(xp) > level(before) ? level(xp) : null;
    setGain({ n: xp - before, up, id: Date.now() });
    if (up) celebrate();
    const t = setTimeout(() => setGain(null), up ? 3200 : 1800);
    return () => clearTimeout(t);
  }, [xp]);
  return (
    <>
      <span className={`lv ${gain ? 'bump' : ''}`} key={`lv${gain?.id ?? ''}`}>Lv.{level(xp)} · {xp} XP</span>
      {gain && <div className={`xp-toast ${gain.up ? 'level-up' : ''}`} key={gain.id} role="status">
        <span>+{gain.n} XP</span>{gain.up && <b>เลเวลอัป! Lv.{gain.up}</b>}
      </div>}
    </>
  );
}

const TABS: { path: string; label: string; match: string[] }[] = [
  { path: '', label: 'วันนี้', match: ['', 'run', 'daily'] },
  { path: 'plan', label: 'แผน 4 ปี', match: ['plan', 'course', 'lesson'] },
  { path: 'calendar', label: 'ปฏิทิน', match: ['calendar'] },
  { path: 'speak', label: 'ฝึกพูด', match: ['speak', 'interview', 'builder', 'survival', 'calm', 'voice-progress', 'videos', 'video', 'vocab'] },
  { path: 'settings', label: 'ตั้งค่า', match: ['settings', 'learn'] },
];

export default function App() {
  const { ready, p, s, setSettings } = useStore();
  const h = useHash();
  useTheme();
  const [, a = '', b, c] = h.split('/');
  const route = a.replace(/[^a-z-]/g, '') || 'home';
  useEffect(() => { document.documentElement.dataset.route = route; }, [route]);
  if (!ready) return <div className="center pad">กำลังโหลด…</div>;
  let page;
  switch (a) {
    case '': page = <Home />; break;
    case 'run': page = <QuickRun />; break;
    case 'daily': page = <DailyPage />; break;
    case 'plan': page = <PlanPage />; break;
    case 'course': page = c ? <UnitPlayer key={c} code={b} unitId={c} /> : <CoursePage key={b} code={b} />; break;
    case 'lesson': page = <LessonPlayer key={b} id={b} />; break;
    case 'calendar': page = <CalendarPage />; break;
    case 'speak': page = <SpeakHub key={b} step={b ? Number(b) : undefined} />; break;
    case 'interview': page = <InterviewRoom />; break;
    case 'builder': page = <Builder />; break;
    case 'survival': page = <Survival />; break;
    case 'calm': page = <Calm />; break;
    case 'voice-progress': page = <VoiceProgress />; break;
    case 'videos': page = <VideosPage />; break;
    case 'video': page = <VideoPage key={b} id={b} />; break;
    case 'vocab': page = <VocabPage />; break;
    case 'settings': page = <SettingsPage />; break;
    case 'learn': page = <LearnPage />; break;
    default: page = <Home />;
  }
  const tab = TABS.find((t) => t.match.includes(a));
  return (
    <>
      <header className="top">
        <button className="brand" onClick={() => go('/')}><span className="brand-mark" aria-hidden="true" />{APP_NAME}<small className="brand-sub">เรียนล่วงหน้า เอกอังกฤษ</small></button>
        <nav className="tabs-nav" aria-label="เมนูหลัก">
          {TABS.map((t) => <button key={t.path} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => go(`/${t.path}`)}>{t.label}</button>)}
        </nav>
        <div className="top-tools">
          <button className={`sound-toggle ${s.music ? 'on' : ''}`} aria-pressed={s.music} title={s.music ? 'ปิดเสียงประกอบ' : 'เปิดเสียงประกอบ'} onClick={() => setSettings({ music: !s.music })}>
            <span className="eq" aria-hidden="true"><i /><i /><i /></span><span className="sr">เสียงประกอบ</span>
          </button>
          <XpChip xp={p.xp} />
        </div>
      </header>
      <main className="wrap">{page}</main>
      <footer className="foot">
        <Disclaimer />
        <p>เตรียมตัวจากรายละเอียดหลักสูตร สาขาวิชาภาษาอังกฤษ (V.67.3), Year Plan 2570 และปฏิทินการศึกษา 2570 ที่มหาวิทยาลัยเผยแพร่ เนื้อหาจริงในห้องขึ้นกับอาจารย์ผู้สอน วันที่อาจเปลี่ยนตามประกาศของมหาวิทยาลัย</p>
      </footer>
    </>
  );
}
