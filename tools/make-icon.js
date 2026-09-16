/* Pattern's iOS app icon at App Store resolution (1024): THE SLIDER.
   The one control every check-in touches — a grey track and a white
   thumb parked at the middle, where an untouched check-in starts. White
   on black, because a control is white on every theme and the icon
   carries no score; the glowing blue square it replaced (16 Sep 2026)
   was, in the Blue theme, literally the colour of pain 5. Flat, no
   glow: the glow belongs to the pain square, not to a control. Full-
   bleed black: iOS masks its own corners. Values are fractions of the
   icon edge, drawn thicker than the on-screen slider so the mark still
   reads at 60 points on a home screen.

   Run:  node tools/make-icon.js
   (needs a local Chrome; renders headless, no npm dependency) */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/* the on-screen palette: bgSegmentTrack-ish grey for the track, so the
   icon and the slider on the pain step are the same object */
const TRACK = { c: '#3A3A3C', w: 0.72, h: 0.07 };
const THUMB = { c: '#FFFFFF', d: 0.36 };

function markup(size, scale) {
  const k = scale || 1;
  const tw = TRACK.w * size * k, th = TRACK.h * size * k;
  const td = THUMB.d * size * k;
  const rect = (w, h, c) =>
    '<div style="position:absolute;left:' + (size - w) / 2 + 'px;top:' + (size - h) / 2 + 'px;' +
    'width:' + w + 'px;height:' + h + 'px;border-radius:' + h / 2 + 'px;background:' + c + '"></div>';
  return '<!doctype html><html><body style="margin:0;background:#000">' +
    '<div style="position:relative;width:' + size + 'px;height:' + size + 'px;background:#000;overflow:hidden">' +
    rect(tw, th, TRACK.c) + rect(td, td, THUMB.c) +
    '</div></body></html>';
}

const JOBS = [
  { file: '../assets/icon.png', size: 1024 },
  // adaptive foreground: Android shows ~the middle 2/3, so the mark scales in
  { file: '../assets/android-icon-foreground.png', size: 1024, scale: 0.62 },
];

const tmp = path.join(require('os').tmpdir(), 'pattern-icon');
fs.mkdirSync(tmp, { recursive: true });
for (const j of JOBS) {
  const html = path.join(tmp, path.basename(j.file, '.png') + '.html');
  fs.writeFileSync(html, markup(j.size, j.scale));
  const out = path.resolve(__dirname, j.file);
  execFileSync(CHROME, [
    '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1',
    '--window-size=' + j.size + ',' + j.size,
    '--screenshot=' + out,
    'file:///' + html.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  console.log('wrote', j.file);
}
