// Focus sound, synthesized in the browser so it works offline and costs nothing.
// Every track is wordless on purpose: lyrics are what interferes with reading (Vasilev et al. 2018 meta-regression).

export type TrackId = 'calm' | 'piano' | 'rain' | 'pink' | 'brown' | 'alpha';
type Stop = () => void;
type Track = { name_th: string; note_th: string; start: (c: AudioContext, out: AudioNode) => Stop };

function note(c: AudioContext, out: AudioNode, freq: number, at: number, dur: number, type: OscillatorType, gain: number, attack = 0.02) {
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(out); o.start(at); o.stop(at + dur + 0.05);
}

/** Runs `step` just ahead of the audio clock; `step` returns seconds until its next call. */
function loop(c: AudioContext, step: (at: number) => number): Stop {
  let next = c.currentTime + 0.05;
  const tick = () => { while (next < c.currentTime + 0.6) next += step(next); };
  tick();
  const t = window.setInterval(tick, 200);
  return () => clearInterval(t);
}

function noise(c: AudioContext, color: 'pink' | 'brown') {
  const len = c.sampleRate * 4;
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11; }
    }
  }
  const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
  return src;
}

function noiseTrack(color: 'pink' | 'brown', gain: number, shape?: (c: AudioContext, src: AudioNode) => AudioNode) {
  return (c: AudioContext, out: AudioNode): Stop => {
    const src = noise(c, color); const g = c.createGain(); g.gain.value = gain;
    (shape ? shape(c, src) : src).connect(g).connect(out);
    src.start();
    return () => { src.stop(); g.disconnect(); };
  };
}

const CHORDS = [[130.8, 164.8, 196], [110, 130.8, 164.8], [87.3, 110, 130.8], [98, 123.5, 146.8]];
const PENTA = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];

export const TRACKS: Record<TrackId, Track> = {
  calm: {
    name_th: 'คอร์ดช้า ผ่อนคลาย',
    note_th: 'คอร์ดยาว ๆ จังหวะช้า ไม่มีเนื้อร้อง เหมาะกับการอ่านและทำโจทย์',
    start: (c, out) => { let i = 0; return loop(c, (at) => { CHORDS[i++ % CHORDS.length].forEach((f, k) => note(c, out, f, at + k * 0.03, 4.4, 'sine', 0.16, 0.9)); return 4; }); },
  },
  piano: {
    name_th: 'เปียโนเบา ๆ',
    note_th: 'โน้ตเปียโนห่าง ๆ แบบสุ่ม ไม่มีทำนองให้ร้องตาม จึงไม่ดึงความสนใจ',
    start: (c, out) => {
      let beat = 0;
      return loop(c, (at) => {
        if (beat++ % 6 === 0) note(c, out, PENTA[beat % 3] / 4, at, 5, 'sine', 0.22, 0.4);
        const f = PENTA[Math.floor(Math.random() * PENTA.length)];
        note(c, out, f, at, 2.6, 'triangle', 0.13);
        note(c, out, f * 2, at, 1.2, 'sine', 0.03);
        return 0.7 + Math.random() * 1.1;
      });
    },
  },
  rain: {
    name_th: 'เสียงฝน',
    note_th: 'เสียงธรรมชาติสม่ำเสมอ ช่วยกลบเสียงรบกวนรอบตัว',
    start: noiseTrack('pink', 0.55, (c, src) => {
      const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      return src.connect(hp).connect(lp);
    }),
  },
  pink: {
    name_th: 'Pink noise',
    note_th: 'งานวิจัยพบว่าช่วยคนที่มีอาการสมาธิสั้นได้เล็กน้อย แต่ไม่ช่วยคนทั่วไป ลองแล้วไม่ชอบก็ปิดได้',
    start: noiseTrack('pink', 0.5),
  },
  brown: {
    name_th: 'Brown noise',
    note_th: 'เสียงทุ้มคล้ายน้ำตกไกล ๆ หลายคนชอบ แต่ยังไม่มีงานวิจัยยืนยันผล',
    start: noiseTrack('brown', 0.5),
  },
  alpha: {
    name_th: 'Binaural 10 Hz (ต้องใส่หูฟัง)',
    note_th: 'หูซ้ายขวาได้ยินความถี่ต่างกัน 10 Hz งานวิจัยยังขัดแย้งกัน ถ้าจะลอง ให้ฟังก่อนเริ่มเรียนสัก 5 นาที',
    start: (c, out) => {
      const g = c.createGain(); g.gain.value = 0.12; g.connect(out);
      const os = ([[200, -1], [210, 1]] as const).map(([f, pan]) => {
        const o = c.createOscillator(); o.frequency.value = f;
        const p = c.createStereoPanner(); p.pan.value = pan;
        o.connect(p).connect(g); o.start(); return o;
      });
      return () => { os.forEach((o) => o.stop()); g.disconnect(); };
    },
  },
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let stopCurrent: Stop | null = null;
let volume = 0.4;
let ducked = false;

const level = () => (ducked ? 0 : volume * 0.5);

function apply() {
  if (ctx && master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.15);
}

/** Start a track, or stop when `track` is null. Safe to call repeatedly. */
export function playMusic(track: TrackId | null, vol = volume) {
  volume = vol;
  stopCurrent?.(); stopCurrent = null;
  if (!track) return;
  ctx ??= new AudioContext();
  if (!master) { master = ctx.createGain(); master.gain.value = level(); master.connect(ctx.destination); }
  apply();
  stopCurrent = TRACKS[track].start(ctx, master);
  // browsers keep audio suspended until the first tap
  if (ctx.state === 'suspended') addEventListener('pointerdown', () => ctx?.resume(), { once: true });
}

export function setMusicVolume(v: number) { volume = v; apply(); }

/** Silence the music while the microphone is recording so it never leaks into the transcript. */
export function duckMusic(on: boolean) { ducked = on; apply(); }
