// npm run icons: draws the app icon (a paper bird on a riso-printed sun) as SVG and as PNGs, with no image library.
import { writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public/icons');
const C = { paper: [243, 238, 226], pink: [255, 77, 148], yellow: [255, 210, 63], ink: [28, 26, 32], blue: [39, 71, 214], white: [255, 252, 242] };
const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** Shapes in a 100x100 design space. `pad` shrinks the art for maskable icons. */
const BIRD = [[24, 58], [80, 36], [58, 80]];
const WING = [[80, 36], [50, 61], [58, 80]];
const shapes = [
  { kind: 'circle', cx: 55, cy: 55, r: 34, fill: C.pink },
  { kind: 'circle', cx: 50, cy: 50, r: 34, fill: C.yellow, stroke: C.ink, w: 3.5 },
  { kind: 'poly', pts: BIRD.map(([x, y]) => [x + 3, y + 2.5]), fill: C.pink },
  { kind: 'poly', pts: BIRD, fill: C.white, stroke: C.blue, w: 3.2 },
  { kind: 'poly', pts: WING, fill: C.pink, stroke: C.blue, w: 3.2 },
  { kind: 'circle', cx: 63, cy: 48, r: 3.4, fill: C.ink },
];

function svg() {
  const body = shapes.map((s) => s.kind === 'circle'
    ? `<circle cx="${s.cx}" cy="${s.cy}" r="${s.r}" fill="${hex(s.fill)}"${s.stroke ? ` stroke="${hex(s.stroke)}" stroke-width="${s.w}"` : ''}/>`
    : `<path d="M${s.pts.map((p) => p.join(' ')).join(' L')} Z" fill="${hex(s.fill)}"${s.stroke ? ` stroke="${hex(s.stroke)}" stroke-width="${s.w}" stroke-linejoin="round"` : ''}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="${hex(C.paper)}"/>${body}</svg>\n`;
}

const inPoly = (x, y, pts) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const segDist = (x, y, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - ax - t * dx, y - ay - t * dy); };

/** Colour at a design-space point: paint shapes in order, strokes over fills. */
function colourAt(x, y, rounded) {
  if (rounded && (Math.max(Math.abs(x - 50) - 28, 0) ** 2 + Math.max(Math.abs(y - 50) - 28, 0) ** 2 > 22 ** 2)) return null;
  let c = C.paper;
  for (const s of shapes) {
    if (s.kind === 'circle') {
      const d = Math.hypot(x - s.cx, y - s.cy);
      if (d <= s.r) c = s.fill;
      if (s.stroke && Math.abs(d - s.r) <= s.w / 2) c = s.stroke;
    } else {
      if (inPoly(x, y, s.pts)) c = s.fill;
      if (s.stroke && s.pts.some((p, i) => segDist(x, y, p, s.pts[(i + 1) % s.pts.length]) <= s.w / 2)) c = s.stroke;
    }
  }
  return c;
}

function png(size, { pad = 0, rounded = true } = {}) {
  const SS = 4, raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const u = ((px + (sx + 0.5) / SS) / size) * 100, v = ((py + (sy + 0.5) / SS) / size) * 100;
        const x = pad ? 50 + (u - 50) / (1 - pad * 2) : u, y = pad ? 50 + (v - 50) / (1 - pad * 2) : v;
        const c = pad ? (x < 0 || x > 100 || y < 0 || y > 100 ? C.paper : colourAt(x, y, false) ?? C.paper) : colourAt(x, y, rounded);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
      }
      const n = SS * SS, o = py * (size * 4 + 1) + 1 + px * 4;
      const k = a ? a / 255 : 1;
      raw[o] = r / k; raw[o + 1] = g / k; raw[o + 2] = b / k; raw[o + 3] = a / n;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

await writeFile(path.join(OUT, 'icon.svg'), svg());
await writeFile(path.join(OUT, 'icon-192.png'), png(192));
await writeFile(path.join(OUT, 'icon-512.png'), png(512));
await writeFile(path.join(OUT, 'maskable-512.png'), png(512, { pad: 0.1 }));
await writeFile(path.join(OUT, 'apple-touch-icon.png'), png(180, { rounded: false }));
console.log('wrote public/icons: icon.svg, icon-192.png, icon-512.png, maskable-512.png, apple-touch-icon.png');
