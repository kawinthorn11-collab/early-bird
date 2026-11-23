import tips from '../content/learn.json';
import { Back, go } from './ui';

const STRENGTH: Record<string, string> = { strong: 'หลักฐานแน่น', medium: 'หลักฐานปานกลาง', weak: 'ยังสรุปไม่ได้' };

export function LearnPage() {
  return (
    <div className="learn">
      <Back />
      <h2>วิธีเรียนให้จำ</h2>
      <p className="muted">สรุปจากงานวิจัยด้านการเรียนรู้ บอกตรง ๆ ว่าข้อไหนหลักฐานแน่น ข้อไหนยังไม่ชัด และแอปนี้ใช้ข้อนั้นตรงไหน</p>
      <ol className="tips">
        {tips.map((t, i) => (
          <li key={t.id} className="tip" style={{ '--i': i } as never}>
            <div className="tip-head"><h3>{t.title}</h3><span className={`strength ${t.strength}`}>{STRENGTH[t.strength]}</span></div>
            <p className="tip-do">{t.do}</p>
            <p className="small muted">{t.evidence}</p>
            <button className="link" onClick={() => go(t.go)}>{t.app}</button>
          </li>
        ))}
      </ol>
    </div>
  );
}
