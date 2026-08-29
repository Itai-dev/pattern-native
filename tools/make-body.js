/**
 * Generates assets/body.png — the body-map silhouette.
 *
 * Drawn from code, not licensed from a stock library, so the outline and
 * the touch regions in BodyMap.tsx share one coordinate system (100×200
 * design units) and can never drift apart. Rendered at 4× with 2×2
 * supersampling for soft edges, flat fill in the app's surface grey —
 * Pattern draws flat, and the figure is an input surface, not an
 * illustration.
 *
 *   node tools/make-body.js     → writes assets/body.png (and body@dbg.txt)
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ── the figure, as shapes in 100×200 design space ─────────── */

// ellipse: {cx, cy, rx, ry}   polygon: {pts: [[x,y]...]}
const shapes = [];

// head + neck
shapes.push({ cx: 50, cy: 10.5, rx: 8.2, ry: 9.8 });
shapes.push({ pts: [[45.5, 17], [54.5, 17], [54, 27], [46, 27]] });

// torso: rounded shoulder caps, waist tuck, hip flare, soft crotch V
shapes.push({
  pts: [
    [31, 32], [34, 28.5], [40, 26.5], [60, 26.5], [66, 28.5], [69, 32],
    [69.5, 38], [66.5, 45],
    [63, 56], [62, 66],
    [65, 74], [65.5, 84], [63, 91], [57, 95.5],
    [50, 97],
    [43, 95.5], [37, 91], [34.5, 84], [35, 74],
    [38, 66], [37, 56],
    [33.5, 45], [30.5, 38],
  ],
});

// arms, held a touch away from the torso so the armpit reads - the gap
// is what makes it a figure rather than a slab
const armL = [
  [32, 31.5], [34.5, 36.5],
  [31.5, 47], [29.8, 58],
  [28.2, 70], [26.8, 82],
  [22.2, 81.2], [22.6, 69],
  [23.6, 56], [25, 44],
  [27.5, 33],
];
// hands overlap the wrist so no seam shows
const handL = [[21.6, 80.5], [27.4, 81.5], [27.8, 89.5], [25.4, 94.5], [21.2, 93.5], [19.8, 86.5]];

const mirror = (pts) => pts.map(([x, y]) => [100 - x, y]);
shapes.push({ pts: armL }, { pts: mirror(armL) });
shapes.push({ pts: handL }, { pts: mirror(handL) });

// legs: thigh, knee tuck, calf swell, ankle
const legL = [
  [38.5, 92], [49.2, 96.5],
  [49.3, 128], [48, 141],
  [48.6, 152], [47.6, 168], [46.8, 177],
  [42.2, 177], [41.6, 168], [40.4, 152],
  [39.6, 141], [37.6, 128],
  [36.4, 110],
];
const footL = [[41.4, 175], [47.6, 175], [48.2, 182.5], [46.5, 187], [35.5, 186.5], [36.5, 181], [40, 178]];
shapes.push({ pts: legL }, { pts: mirror(legL) });
shapes.push({ pts: footL }, { pts: mirror(footL) });

/* ── rasterize ─────────────────────────────────────────────── */

const SCALE = 4;                 // design → output px
const SS = 2;                    // supersample factor
const W = 100 * SCALE, H = 200 * SCALE;
const sw = W * SS, sh = H * SS;

function insidePoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inside(x, y) {          // x,y in design units
  for (const s of shapes) {
    if (s.rx != null) {
      const dx = (x - s.cx) / s.rx, dy = (y - s.cy) / s.ry;
      if (dx * dx + dy * dy <= 1) return true;
    } else if (insidePoly(s.pts, x, y)) return true;
  }
  return false;
}

// coverage per output pixel via SS×SS subsamples
const cov = new Uint8Array(W * H);
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    let hit = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const dx = (px + (sx + 0.5) / SS) / SCALE;
        const dy = (py + (sy + 0.5) / SS) / SCALE;
        if (inside(dx, dy)) hit++;
      }
    }
    cov[py * W + px] = Math.round((hit / (SS * SS)) * 255);
  }
}

/* ── PNG encode (RGBA, filter 0) ───────────────────────────── */

const FILL = [58, 58, 64];       // #3A3A40 — a step over bgSurface, flat
const raw = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) {
  const row = y * (W * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < W; x++) {
    const a = cov[y * W + x];
    const o = row + 1 + x * 4;
    raw[o] = FILL[0]; raw[o + 1] = FILL[1]; raw[o + 2] = FILL[2]; raw[o + 3] = a;
  }
}
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);
const out = path.join(__dirname, '..', 'assets', 'body.png');
fs.writeFileSync(out, png);
console.log('wrote', out, png.length, 'bytes,', W + 'x' + H);
