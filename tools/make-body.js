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
    [50, 99.5],
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
  [28.2, 70], [26.8, 84],
  [22.2, 83.2], [22.6, 69],
  [23.6, 56], [25, 44],
  [27.5, 33],
];
// hands overlap the wrist so no seam shows
const handL = [[21.4, 79], [27.8, 80], [28.4, 89], [25.8, 95.5], [20.8, 94.5], [19.2, 86.5]];

const mirror = (pts) => pts.map(([x, y]) => [100 - x, y]);
shapes.push({ pts: armL }, { pts: mirror(armL) });
shapes.push({ pts: handL }, { pts: mirror(handL) });

// legs: thigh, knee tuck, calf swell, ankle
const legL = [
  [38.5, 91.5], [49.6, 94.5],
  [49.6, 128], [48, 141],
  [48.6, 152], [47.6, 168], [46.8, 177],
  [42.2, 177], [41.6, 168], [40.4, 152],
  [39.6, 141], [37.6, 128],
  [36.4, 110],
];
const footL = [[41.4, 175], [47.6, 175], [48.2, 182.5], [46.5, 187], [35.5, 186.5], [36.5, 181], [40, 178]];
shapes.push({ pts: legL }, { pts: mirror(legL) });
shapes.push({ pts: footL }, { pts: mirror(footL) });

/* ── smooth the outlines ─────────────────────────────────────
   Closed Catmull-Rom through each polygon's vertices, sampled densely —
   straight edges are what made the first figure read as cut from card.
   The point tables stay coarse and editable; the curves are derived. */
function smoothPoly(pts, steps) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let t = 0; t < steps; t++) {
      const u = t / steps, u2 = u * u, u3 = u2 * u;
      out.push([
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
      ]);
    }
  }
  return out;
}
for (const sh of shapes) if (sh.pts) sh.pts = smoothPoly(sh.pts, 8);

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

/* ── shade ───────────────────────────────────────────────────
   The rounded-form illusion, without a renderer: distance from the
   nearest edge, darker at the rim and lighter through the core — the
   same soft reading the clinical reference silhouettes carry. Chamfer
   distance transform, two passes, cheap and deterministic. */
const INF = 1e9;
const dist = new Float32Array(W * H);
for (let i = 0; i < W * H; i++) dist[i] = cov[i] > 127 ? INF : 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (!dist[i]) continue;
  if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
  if (y > 0) dist[i] = Math.min(dist[i], dist[i - W] + 1);
  if (x > 0 && y > 0) dist[i] = Math.min(dist[i], dist[i - W - 1] + 1.414);
  if (x < W - 1 && y > 0) dist[i] = Math.min(dist[i], dist[i - W + 1] + 1.414);
}
for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
  const i = y * W + x;
  if (!dist[i]) continue;
  if (x < W - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
  if (y < H - 1) dist[i] = Math.min(dist[i], dist[i + W] + 1);
  if (x < W - 1 && y < H - 1) dist[i] = Math.min(dist[i], dist[i + W + 1] + 1.414);
  if (x > 0 && y < H - 1) dist[i] = Math.min(dist[i], dist[i + W - 1] + 1.414);
}

/* ── PNG encode (RGBA, filter 0) ───────────────────────────── */

const RIM = [38, 38, 43];        // near the ground, at the edge
const CORE = [82, 82, 92];       // lifted through the middle
const CAP = 22;                  // px at which the core tone is reached
const raw = Buffer.alloc(H * (W * 4 + 1));
for (let y = 0; y < H; y++) {
  const row = y * (W * 4 + 1);
  raw[row] = 0;
  for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    const a = cov[idx];
    const t = Math.min(dist[idx], CAP) / CAP;
    const o = row + 1 + x * 4;
    raw[o]     = Math.round(RIM[0] + (CORE[0] - RIM[0]) * t);
    raw[o + 1] = Math.round(RIM[1] + (CORE[1] - RIM[1]) * t);
    raw[o + 2] = Math.round(RIM[2] + (CORE[2] - RIM[2]) * t);
    raw[o + 3] = a;
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
