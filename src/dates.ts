/** Calendar days as `YYYY-MM-DD` strings. Arithmetic runs on UTC day numbers so time zones and clock times never shift a date. */
export type ISODate = string;

const DAY_MS = 86400000;
const toDayNumber = (d: ISODate) => { const [y, m, dd] = d.split('-').map(Number); return Date.UTC(y, m - 1, dd) / DAY_MS; };
const fromDayNumber = (n: number): ISODate => new Date(n * DAY_MS).toISOString().slice(0, 10);

export const isISODate = (s: unknown): s is ISODate => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fromDayNumber(toDayNumber(s)) === s;
export const addDays = (d: ISODate, n: number) => fromDayNumber(toDayNumber(d) + n);
/** Days from `a` to `b` (positive when b is later). */
export const daysBetween = (a: ISODate, b: ISODate) => toDayNumber(b) - toDayNumber(a);
export const addYears = (d: ISODate, n: number) => `${Number(d.slice(0, 4)) + n}${d.slice(4)}`;
export const midpoint = (a: ISODate, b: ISODate) => addDays(a, Math.floor(daysBetween(a, b) / 2));

/** Today in the device's own time zone. */
export const todayISO = (t: number | Date = Date.now()): ISODate => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const MONTHS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
/** 16 ส.ค. 2570 (Buddhist-era year, as BU's own calendar prints it). */
export const thaiDate = (d: ISODate, withYear = true) => {
  const [y, m, dd] = d.split('-').map(Number);
  return `${dd} ${MONTHS_TH[m - 1]}${withYear ? ` ${y + 543}` : ''}`;
};
export const thaiRange = (a: ISODate, b?: ISODate) => {
  if (!b || b === a) return thaiDate(a);
  return a.slice(0, 4) === b.slice(0, 4) ? `${thaiDate(a, false)} – ${thaiDate(b)}` : `${thaiDate(a)} – ${thaiDate(b)}`;
};
