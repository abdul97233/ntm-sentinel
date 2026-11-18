/**
 * Generates the extension PNG icons (shield mark on a blue→violet rounded square)
 * with no image dependencies: rasterised in JS, encoded with zlib.
 * Run: node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
mkdirSync(out, { recursive: true });

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Shape tests in unit coordinates (0..1)
const inRoundRect = (u, v, r) => {
  const dx = Math.max(r - u, 0, u - (1 - r));
  const dy = Math.max(r - v, 0, v - (1 - r));
  return dx * dx + dy * dy <= r * r;
};
// Shield: flat top, sides curving to a point at the bottom.
const inShield = (u, v) => {
  const top = 0.2, bottom = 0.84, cx = 0.5;
  if (v < top || v > bottom) return false;
  const t = (v - top) / (bottom - top);
  const half = t < 0.45 ? 0.3 : 0.3 * Math.cos(((t - 0.45) / 0.55) * (Math.PI / 2));
  return Math.abs(u - cx) <= half;
};
const inInnerShield = (u, v) => {
  const s = 0.7;
  return inShield(0.5 + (u - 0.5) / s, 0.52 + (v - 0.52) / s);
};

for (const size of [16, 32, 48, 128]) {
  const ss = 4; // supersampling
  const buf = png(size, (x, y) => {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < ss; sy++)
      for (let sx = 0; sx < ss; sx++) {
        const u = (x + (sx + 0.5) / ss) / size;
        const v = (y + (sy + 0.5) / ss) / size;
        let c = [0, 0, 0, 0];
        if (inRoundRect(u, v, 0.22)) {
          const t = (u + v) / 2;
          c = [Math.round(59 + (139 - 59) * t), Math.round(130 + (92 - 130) * t), Math.round(246 + (246 - 246) * t), 255];
          if (inShield(u, v)) c = [255, 255, 255, 255];
          if (size >= 32 && inInnerShield(u, v) && u < 0.5) c = [214, 226, 255, 255];
        }
        acc = acc.map((a, i) => a + c[i]);
      }
    return acc.map((a) => Math.round(a / (ss * ss)));
  });
  writeFileSync(resolve(out, `icon-${size}.png`), buf);
}
console.log('icons written to public/icons');
