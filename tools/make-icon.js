/* Pattern's iOS app icon at App Store resolution (1024), built exactly as
   the Design System draws it (eukSIre8T0UGEZKERZk2qe node 57:13): three
   concentric rounded squares — #0A84FF / #64D2FF / #B6EAFF — the inner two
   Gaussian-blurred so they melt together. Full-bleed black: iOS masks its
   own corners. Values are fractions of the icon edge (÷360 from Figma).

   Run:  node tools/make-icon.js
   (needs puppeteer-core on NODE_PATH and a local Chrome) */
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const LAYERS = [
  { c: '#0a84ff', s: 213 / 360, r: 54 / 360, b: 0 },
  { c: '#64d2ff', s: 157 / 360, r: 29 / 360, b: 10.05 / 360 },
  { c: '#b6eaff', s: 94 / 360, r: 16 / 360, b: 10.05 / 360 },
];

function markup(size, scale) {
  const k = scale || 1;
  const squares = LAYERS.map((l) => {
    const w = l.s * size * k, off = (size - w) / 2;
    return '<div style="position:absolute;left:' + off + 'px;top:' + off + 'px;' +
      'width:' + w + 'px;height:' + w + 'px;border-radius:' + l.r * size * k + 'px;' +
      'background:' + l.c + ';' + (l.b ? 'filter:blur(' + l.b * size * k + 'px);' : '') + '"></div>';
  }).join('');
  return '<!doctype html><body style="margin:0"><div style="position:relative;' +
    'width:' + size + 'px;height:' + size + 'px;background:#000;overflow:hidden">' +
    squares + '</div></body>';
}

const JOBS = [
  { file: '../assets/icon.png', size: 1024 },
  // adaptive foreground: Android shows ~the middle 2/3, so the mark scales in
  { file: '../assets/android-icon-foreground.png', size: 1024, scale: 0.62 },
];

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  for (const j of JOBS) {
    const p = await browser.newPage();
    await p.setViewport({ width: j.size, height: j.size, deviceScaleFactor: 1 });
    await p.setContent(markup(j.size, j.scale), { waitUntil: 'load' });
    await p.screenshot({ path: path.join(__dirname, j.file) });
    await p.close();
    console.log('wrote', j.file);
  }
  await browser.close();
})();
