import { Fragment, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import confetti from 'canvas-confetti';

export const go = (path: string) => { location.hash = path; };

/** Render **bold** and __blank__ markers in content strings. */
export function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') ? <b key={i} className="hl">{part.slice(2, -2)}</b> : <Fragment key={i}>{part}</Fragment>);
}

export function Card({ children, className = '', onClick, style }: { children: ReactNode; className?: string; onClick?: () => void; style?: CSSProperties }) {
  return <div className={`card ${className} ${onClick ? 'clickable' : ''}`} style={style} onClick={onClick}
    {...(onClick && { role: 'button', tabIndex: 0, onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } })}>{children}</div>;
}

export function Steps({ labels, at }: { labels: string[]; at: number }) {
  return (
    <div className="track">
      <ol className="steps" style={{ '--n': labels.length, '--at': Math.min(at, labels.length - 1) } as CSSProperties}>
        {labels.map((l, i) => <li key={l} className={i < at ? 'done' : i === at ? 'now' : ''}><span>{i < at ? <Check size={14} label="ผ่านแล้ว" /> : i + 1}</span><em>{l}</em></li>)}
      </ol>
      <div className="steps-cap">ขั้น {Math.min(at + 1, labels.length)}/{labels.length} · {labels[Math.min(at, labels.length - 1)]}</div>
    </div>
  );
}

const ICONS = {
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  speaker: 'M4 9h4l5-4v14l-5-4H4zM16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11',
  check: 'M5 12.5l4.5 4.5L19 7',
};

export function Icon({ name }: { name: keyof typeof ICONS }) {
  return <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={ICONS[name]} {...(name === 'check' && { className: 'draw', pathLength: 1 })} /></svg>;
}

/** A check or cross that draws itself in, for answer feedback. */
export function Check({ size = 18, label, cross = false }: { size?: number; label?: string; cross?: boolean }) {
  return <svg className="tick" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
    {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}>
    <path className="draw" pathLength={1} d={cross ? 'M7 7l10 10M17 7L7 17' : ICONS.check} /></svg>;
}

/** Small speaker button that reads `text` aloud. */
export function Listen({ onClick, label = 'ฟัง' }: { onClick: () => void; label?: string }) {
  return <button className="link icon-btn" aria-label={label} title={label} onClick={onClick}><Icon name="speaker" /></button>;
}

export function Back({ to = '/' }: { to?: string }) {
  return <button className="ghost back" onClick={() => go(to)}>← กลับ</button>;
}

export function Disclaimer() {
  return <p className="disclaimer">ไม่ใช่เว็บไซต์ทางการของมหาวิทยาลัยกรุงเทพ</p>;
}

export function celebrate() {
  confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 }, disableForReducedMotion: true });
}

const cheers = ['เก่งมาก', 'แบบนี้แหละ', 'ถูกเผง', 'สบายมาก', 'โอ้โห ไวด้วย', 'ใช่เลย'];
const comforts = ['ไม่เป็นไรนะ ผิดตอนซ้อมดีกว่าผิดตอนสอบ', 'เกือบแล้ว! ดูเหตุผลข้างล่างนิดนึง', 'ข้อนี้จะกลับมาให้แก้มือในวันพรุ่งนี้', 'จุดนี้หลอกคนเยอะมาก ไม่ใช่เราคนเดียว'];
export const cheer = () => cheers[Math.floor(Math.random() * cheers.length)];
export const comfort = () => comforts[Math.floor(Math.random() * comforts.length)];

export const LETTERS = ['1', '2', '3', '4'];
