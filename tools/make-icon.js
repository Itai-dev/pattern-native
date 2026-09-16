/* Pattern's iOS app icon at App Store resolution (1024), rendered from
   assets/icon.svg — the source of truth, drawn by Itai (17 Sep 2026):
   three rounded bars on black, light to dark blue left to right, the
   Patterns tab's own glyph. Full-bleed black: iOS masks its own corners.

   The slider icon of 16 Sep and the glowing square before it are in
   git history; this file only renders whatever the SVG says.

   Run:  node tools/make-icon.js
   (needs a local Chrome; renders headless, no npm dependency) */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SVG = path.resolve(__dirname, '../assets/icon.svg');

/** the SVG inline, scaled about the centre on a black ground */
function markup(size, scale) {
  const k = scale || 1;
  const svg = fs.readFileSync(SVG, 'utf8');
  const w = size * k, off = (size - w) / 2;
  return '<!doctype html><html><body style="margin:0;background:#000">' +
    '<div style="position:relative;width:' + size + 'px;height:' + size + 'px;background:#000;overflow:hidden">' +
    '<div style="position:absolute;left:' + off + 'px;top:' + off + 'px;width:' + w + 'px;height:' + w + 'px">' +
    svg.replace(/<svg /, '<svg style="width:100%;height:100%" ') +
    '</div></div></body></html>';
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
