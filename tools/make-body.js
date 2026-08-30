/**
 * Generates assets/body-front.png and assets/body-back.png — the body
 * map's two figures, drawn in the clinical outline style: a light
 * contour line, a barely-there fill, and a few faint anatomy lines
 * (collar and knees on the front; spine, blades and glutes on the
 * back). Drawn from code, not licensed, so the outlines and BodyMap's
 * touch regions share one 100×200 coordinate system per figure.
 *
 *   node tools/make-body.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ── the figure, as shapes in 100×200 design space ─────────── */

function baseShapes() {
  const shapes = [];
  shapes.push({ cx: 50, cy: 10.5, rx: 8.2, ry: 9.8 });
  shapes.push({ pts: [[45.5, 17], [54.5, 17], [54, 27], [46, 27]] });
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
  const armL = [
    [32, 31.5], [34.5, 36.5],
    [31.5, 47], [29.8, 58],
    [28.2, 70], [26.8, 84],
    [22.2, 83.2], [22.6, 69],
    [23.6, 56], [25, 44],
    [27.5, 33],
  ];
  const handL = [[21.4, 79], [27.8, 80], [28.4, 89], [25.8, 95.5], [20.8, 94.5], [19.2, 86.5]];
  const mirror = (pts) => pts.map(([x, y]) => [100 - x, y]);
  shapes.push({ pts: armL }, { pts: mirror(armL) });
  shapes.push({ pts: handL }, { pts: mirror(handL) });
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
  return shapes;
}

/* faint interior anatomy, per view — polylines in design units */
const mirrorLine = (pts) => pts.map(([x, y]) => [100 - x, y]);
const FRONT_LINES = [
  // collar / upper chest
  [[38, 39], [44, 42], [49.5, 42.5]],
  mirrorLine([[38, 39], [44, 42], [49.5, 42.5]]),
  // knees
  [[40.5, 133], [43, 135.5], [45.8, 133.5]],
  mirrorLine([[40.5, 133], [43, 135.5], [45.8, 133.5]]),
];
const BACK_LINES = [
  // spine
  [[50, 29], [50, 72]],
  // shoulder blades
  [[41.5, 36], [44.5, 40.5], [42.5, 46]],
  mirrorLine([[41.5, 36], [44.5, 40.5], [42.5, 46]]),
  // glutes
  [[42.5, 84], [50, 88.5], [57.5, 84]],
  [[50, 88.5], [50, 95]],
  // backs of the knees
  [[41, 134], [43.5, 133], [45.5, 134]],
  mirrorLine([[41, 134], [43.5, 133], [45.5, 134]]),
];

/* ── smooth the outlines ─────────────────────────────────────── */
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

/* ── rasterize one view ─────────────────────────────────────── */

const SCALE = 4, SS = 2;
const W = 100 * SCALE, H = 200 * SCALE;

function insidePoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
  const cx = ax + t * dx, cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function render(lines, outFile) {
  const shapes = baseShapes();
  for (const sh of shapes) if (sh.pts) sh.pts = smoothPoly(sh.pts, 8);
  const inside = (x, y) => {
    for (const s of shapes) {
      if (s.rx != null) {
        const dx = (x - s.cx) / s.rx, dy = (y - s.cy) / s.ry;
        if (dx * dx + dy * dy <= 1) return true;
      } else if (insidePoly(s.pts, x, y)) return true;
    }
    return false;
  };

  const cov = new Uint8Array(W * H);
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    let hit = 0;
    for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
      if (inside((px + (sx + 0.5) / SS) / SCALE, (py + (sy + 0.5) / SS) / SCALE)) hit++;
    }
    cov[py * W + px] = Math.round((hit / (SS * SS)) * 255);
  }

  /* chamfer distance from the edge, inside */
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

  /* the clinical-outline palette: light contour, whisper fill, faint
     interior lines */
  const OUTLINE = [148, 148, 155];
  const FILL = [19, 19, 22];
  const DETAIL = [92, 92, 100];
  const EDGE_PX = 0.55 * SCALE;
  const LINE_PX = 0.4 * SCALE;

  const raw = Buffer.alloc(H * (W * 4 + 1));
  for (let y = 0; y < H; y++) {
    const row = y * (W * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      const a = cov[idx];
      const o = row + 1 + x * 4;
      let c = FILL;
      if (a > 0 && dist[idx] <= EDGE_PX) c = OUTLINE;
      else if (a > 200) {
        const dx = x / SCALE, dy = y / SCALE;
        for (const ln of lines) {
          let d = INF;
          for (let s = 0; s < ln.length - 1; s++) {
            d = Math.min(d, distToSeg(dx, dy, ln[s][0], ln[s][1], ln[s + 1][0], ln[s + 1][1]));
          }
          if (d * SCALE <= LINE_PX) { c = DETAIL; break; }
        }
      }
      raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2]; raw[o + 3] = a;
    }
  }

  const crcTable = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let kk = 0; kk < 8; kk++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  const crc32 = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const out = path.join(__dirname, '..', 'assets', outFile);
  fs.writeFileSync(out, png);
  console.log('wrote', out, png.length, 'bytes');
}

render(FRONT_LINES, 'body-front.png');
render(BACK_LINES, 'body-back.png');
