/**
 * The pain ramps, generated — run `node tools/make-ramps.js` and paste
 * the JSON into src/theme.ts (or read the lightness table it prints to
 * check a hand edit). Why the ramps look like this is written above
 * PAIN_THEMES in theme.ts; this file is the arithmetic.
 *
 * OKLab, because its lightness is the one a person sees: equal steps in
 * L are equal steps on the calendar. The matrices are Ottosson's; the
 * round-trip line at the end proves them against a known colour, after
 * one mistyped constant produced a whole session of purple blues.
 */
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function toOk(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = lin((n >> 16) & 255), g = lin((n >> 8) & 255), b = lin(n & 255);
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;
  return { L, C: Math.hypot(a, bb), h: Math.atan2(bb, a) * 180 / Math.PI };
}
function fromOk(L, C, hdeg) {
  const h = hdeg * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const out = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
  ].map(gam);
  if (out.some((v) => v < -0.0005 || v > 1.0005)) return null;
  return '#' + out.map((v) => ('0' + Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16)).slice(-2)).join('').toUpperCase();
}
function fit(L, C, h) { for (let c = C; c >= 0; c -= 0.002) { const x = fromOk(L, c, h); if (x) return x; } return fromOk(L, 0, h); }
function mix(a, b, t) {
  const na = parseInt(a.slice(1), 16), nb = parseInt(b.slice(1), 16);
  const at = (n, s) => (n >> s) & 255;
  return '#' + [16, 8, 0].map((s) => Math.round(at(na, s) + (at(nb, s) - at(na, s)) * t)).map((v) => ('0' + v.toString(16)).slice(-2)).join('').toUpperCase();
}
function col(A, x) { for (let i = 1; i < A.length; i++) { const [v0, c0] = A[i - 1], [v1, c1] = A[i]; if (x <= v1) return mix(c0, c1, (x - v0) / (v1 - v0)); } return A[A.length - 1][1]; }

const OLD = {
  blue: [[0, '#070C16'], [2, '#152C52'], [5, '#0A84FF'], [8, '#5FBEFF'], [10, '#EAF6FF']],
  violet: [[0, '#0E0714'], [2, '#2E1650'], [5, '#A455F0'], [8, '#CDA0FF'], [10, '#F3EAFF']],
  rose: [[0, '#14070B'], [2, '#4A1430'], [5, '#F0447A'], [8, '#FC96B4'], [10, '#FFEAF4']],
  mint: [[0, '#071412'], [2, '#124A44'], [5, '#2AC0B0'], [8, '#8FE0D6'], [10, '#EAFBF8']],
};
const out = {};
for (const k in OLD) {
  const A = OLD[k];
  const L0 = toOk(col(A, 0)).L, L5 = toOk(col(A, 5)).L, L10 = toOk(col(A, 10)).L;
  out[k] = [];
  for (let i = 0; i <= 10; i++) {
    if (i === 0 || i === 5 || i === 10) { out[k].push(col(A, i)); continue; }
    const target = i < 5 ? L0 + (L5 - L0) * i / 5 : L5 + (L10 - L5) * (i - 5) / 5;
    let lo = 0, hi = 10;
    for (let n = 0; n < 40; n++) { const m = (lo + hi) / 2; if (toOk(col(A, m)).L < target) lo = m; else hi = m; }
    const o = toOk(col(A, (lo + hi) / 2));
    out[k].push(fit(target, o.C, o.h));
  }
}
/* the drift theme: violet's ends, hue sliding toward pink over the ramp */
const v0 = toOk('#0E0714'), v10 = toOk('#F3EAFF');
out.violetPink = [];
for (let i = 0; i <= 10; i++) {
  const t = i / 10;
  const L = v0.L + (v10.L - v0.L) * t;
  const C = 0.04 + 0.16 * Math.sin(Math.PI * t);
  out.violetPink.push(i === 0 ? '#0E0714' : i === 10 ? '#F3EAFF' : fit(L, C, toOk('#A455F0').h - 12 + 52 * t));
}
/* round trip proof */
const rt = fromOk(toOk('#11498C').L, toOk('#11498C').C, toOk('#11498C').h);
console.log('roundtrip #11498C ->', rt);
console.log(JSON.stringify(out));
for (const k in out) console.log(k.padEnd(11), out[k].map((h) => toOk(h).L.toFixed(2)).join(' '));
