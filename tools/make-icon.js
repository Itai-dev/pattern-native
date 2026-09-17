/* Pattern's iOS app icon at App Store resolution (1024), rendered from
   assets/icon.svg — the source of truth: four day squares carrying four
   values of the blue pain ramp. Full-bleed black: iOS masks its own
   corners. The SVG says why it looks the way it does.

   The three bars and the slider of 16–17 Sep, and the glowing square
   before them, are in git history; this file only renders whatever the
   SVG says.

   Run:  node tools/make-icon.js
   (needs a local Chrome; renders headless, no npm dependency) */
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

/* The owner's machine is the Windows box and its Chrome is first, so
   nothing changes there. The rest are for rendering the icon somewhere
   else — a session with no Windows Chrome could otherwise only hand
   back an SVG and ask for the PNGs to be made by hand. PATTERN_CHROME
   overrides all of it. */
const CHROME = [
  process.env.PATTERN_CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => p && fs.existsSync(p));
if (!CHROME) throw new Error('no Chrome found — set PATTERN_CHROME to one');
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

/* Chrome refuses its sandbox as root and exits 1 — which only ever
   happens in a container, never on the owner's machine, so the flag is
   conditional rather than always on. The page is a local SVG this repo
   wrote; there is nothing untrusted to sandbox from. */
const asRoot = process.getuid && process.getuid() === 0;

const tmp = path.join(require('os').tmpdir(), 'pattern-icon');
fs.mkdirSync(tmp, { recursive: true });
for (const j of JOBS) {
  const html = path.join(tmp, path.basename(j.file, '.png') + '.html');
  fs.writeFileSync(html, markup(j.size, j.scale));
  const out = path.resolve(__dirname, j.file);
  execFileSync(CHROME, [
    '--headless=new', '--hide-scrollbars', '--force-device-scale-factor=1',
    ...(asRoot ? ['--no-sandbox'] : []),
    '--window-size=' + j.size + ',' + j.size,
    '--screenshot=' + out,
    'file:///' + html.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  console.log('wrote', j.file);
}
