/**
 * The clinician report — data first, then two renderers over the same
 * data: the in-app preview (ReportSheet) and the shareable PDF (this
 * file's HTML, printed by expo-print on the device; nothing is uploaded).
 *
 * The report states observations as observations: what was recorded, over
 * how many days, with co-occurrence named as co-occurrence and never as
 * cause. Under seven logged days it calls itself a limited record and
 * draws no comparisons.
 *
 * The PDF is deliberately the inverse of the app: white paper, dark text,
 * Pattern blue as a restrained accent — readable in grayscale and worth
 * handing to a physician.
 */
import {
  Entries, EVENT_LABELS, EventKind, FuncEntry, LOC_NAMES, PainEvent,
  QUALITY_NAMES, checkinCount, dailyAverage, dateFromISO, fmtTime,
  funcTrend, iso, logsOf,
} from './model';
import { formatScore, painLabel } from './painScale';

export interface ReportInput {
  entries: Entries;
  events: PainEvent[];
  func: FuncEntry[];
  goalText: string | null;
  todayIso: string;
  windowDays: number; // typically 90
}

export interface ReportDay { date: string; avg: number; count: number }

export interface ReportData {
  rangeStart: string;
  rangeEnd: string;
  exportDate: string;
  loggedDays: number;
  totalCheckins: number;
  /** under seven logged days the record is labelled limited and no
   *  comparison over time is drawn */
  limited: boolean;
  avg: number;
  lowestDay: number;
  highestDay: number;
  /** only present with fourteen or more logged days */
  halves: { first: number; second: number } | null;
  days: ReportDay[]; // logged days only, ascending
  goalText: string | null;
  func: FuncEntry[]; // ascending by week
  latestAbility: FuncEntry | null;
  abilityChange: { first: FuncEntry; last: FuncEntry } | null;
  locations: { id: string; name: string; days: number }[];
  qualities: { id: string; name: string; count: number }[];
  events: PainEvent[]; // chronological
}

/** how many logged days the window covers — surfaced in the UI so a short
 *  history is never mistaken for a reliable pattern */
export function reportDayCount(entries: Entries, todayIso: string, windowDays: number): number {
  const start = dateFromISO(todayIso);
  start.setDate(start.getDate() - (windowDays - 1));
  const startIso = iso(start);
  return Object.keys(entries).filter((k) => k >= startIso && k <= todayIso).length;
}

const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtReportDate(dateIso: string): string {
  const d = dateFromISO(dateIso);
  return d.getDate() + ' ' + M3[d.getMonth()] + ' ' + d.getFullYear();
}

function fmtShortDate(dateIso: string): string {
  const d = dateFromISO(dateIso);
  return d.getDate() + ' ' + M3[d.getMonth()];
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** everything the report shows, computed once. null = nothing logged. */
export function buildReportData(inp: ReportInput): ReportData | null {
  const { entries, events, func, goalText, todayIso, windowDays } = inp;
  const start = dateFromISO(todayIso);
  start.setDate(start.getDate() - (windowDays - 1));
  const startIso = iso(start);

  const days: ReportDay[] = Object.keys(entries)
    .filter((k) => k >= startIso && k <= todayIso)
    .sort()
    .map((k) => {
      const e = entries[k];
      const avg = dailyAverage(e);
      return avg == null ? null : { date: k, avg, count: checkinCount(e) };
    })
    .filter((d): d is ReportDay => d != null);
  if (!days.length) return null;

  const avgs = days.map((d) => d.avg);
  const avgOf = (a: number[]) => round1(a.reduce((s, v) => s + v, 0) / a.length);

  let halves: { first: number; second: number } | null = null;
  if (days.length >= 14) {
    const half = Math.floor(days.length / 2);
    halves = { first: avgOf(avgs.slice(0, half)), second: avgOf(avgs.slice(half)) };
  }

  const locDays: Record<string, number> = {};
  const qual: Record<string, number> = {};
  days.forEach((d) => {
    const seen: Record<string, boolean> = {};
    logsOf(entries[d.date]).forEach((l) => {
      (l.loc || []).forEach((id) => { seen[id] = true; });
      (l.q || []).forEach((q) => { qual[q] = (qual[q] || 0) + 1; });
    });
    Object.keys(seen).forEach((id) => { locDays[id] = (locDays[id] || 0) + 1; });
  });

  const sortedFunc = func.slice().sort((a, b) => (a.week < b.week ? -1 : 1));
  const trend = funcTrend(func);

  return {
    rangeStart: days[0].date,
    rangeEnd: todayIso,
    exportDate: todayIso,
    loggedDays: days.length,
    totalCheckins: days.reduce((s, d) => s + d.count, 0),
    limited: days.length < 7,
    avg: avgOf(avgs),
    lowestDay: Math.min.apply(null, avgs),
    highestDay: Math.max.apply(null, avgs),
    halves,
    days,
    goalText,
    func: sortedFunc,
    latestAbility: sortedFunc.length ? sortedFunc[sortedFunc.length - 1] : null,
    abilityChange: trend,
    locations: Object.keys(locDays)
      .sort((a, b) => locDays[b] - locDays[a])
      .map((id) => ({ id, name: LOC_NAMES[id] || id, days: locDays[id] })),
    qualities: Object.keys(qual)
      .sort((a, b) => qual[b] - qual[a])
      .map((id) => ({ id, name: QUALITY_NAMES[id] || id, count: qual[id] })),
    events: events
      .filter((ev) => ev.date >= startIso && ev.date <= todayIso)
      .slice()
      .sort((a, b) => (a.date === b.date ? a.h - b.h : a.date < b.date ? -1 : 1)),
  };
}

/* ── the chart ───────────────────────────────────────────────
   Days without data are GAPS: the line breaks rather than bridging a day
   that was never logged, so the chart never invents data. */

/** consecutive-day runs of logged days — each run becomes one line */
export function chartSegments(days: ReportDay[]): ReportDay[][] {
  const out: ReportDay[][] = [];
  let run: ReportDay[] = [];
  days.forEach((d) => {
    if (run.length) {
      const prev = dateFromISO(run[run.length - 1].date);
      prev.setDate(prev.getDate() + 1);
      if (iso(prev) !== d.date) { out.push(run); run = []; }
    }
    run.push(d);
  });
  if (run.length) out.push(run);
  return out;
}

/** index of a date within the report's full calendar span */
function dayIndex(dateIso: string, startIso: string): number {
  return Math.round((dateFromISO(dateIso).getTime() - dateFromISO(startIso).getTime()) / 86400000);
}

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** the pain-over-time chart as inline SVG — axes labelled, gaps kept */
function chartSvg(data: ReportData): string {
  const W = 660, H = 230, L = 34, R = 10, T = 12, B = 34;
  const span = Math.max(1, dayIndex(data.rangeEnd, data.days[0].date));
  const xOf = (dateIso: string) =>
    L + (dayIndex(dateIso, data.days[0].date) / span) * (W - L - R);
  const yOf = (v: number) => T + (1 - v / 10) * (H - T - B);

  const parts: string[] = [];
  parts.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" ' +
    'style="max-width:100%;height:auto" ' +
    'xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Daily average pain over time">');

  // horizontal gridlines with y-axis labels every 2 points
  for (let v = 0; v <= 10; v += 2) {
    const y = yOf(v);
    parts.push('<line x1="' + L + '" y1="' + y + '" x2="' + (W - R) + '" y2="' + y +
      '" stroke="#E3E6EB" stroke-width="1"/>');
    parts.push('<text x="' + (L - 8) + '" y="' + (y + 3.5) +
      '" text-anchor="end" font-size="10" fill="#6B7280">' + v + '</text>');
  }

  // x-axis date labels: first, last, and up to three evenly spaced ticks
  const tickDates = [data.days[0].date];
  if (span > 0) {
    for (let i = 1; i <= 3; i++) {
      const d = dateFromISO(data.days[0].date);
      d.setDate(d.getDate() + Math.round((span * i) / 4));
      tickDates.push(iso(d));
    }
    tickDates.push(data.rangeEnd);
  }
  tickDates.forEach((t) => {
    parts.push('<text x="' + xOf(t) + '" y="' + (H - 12) +
      '" text-anchor="middle" font-size="10" fill="#6B7280">' + fmtShortDate(t) + '</text>');
  });

  // line segments per consecutive run — gaps stay gaps
  chartSegments(data.days).forEach((run) => {
    if (run.length > 1) {
      const pts = run.map((d) => xOf(d.date).toFixed(1) + ',' + yOf(d.avg).toFixed(1)).join(' ');
      parts.push('<polyline points="' + pts +
        '" fill="none" stroke="#0A84FF" stroke-width="2" stroke-linejoin="round"/>');
    }
    run.forEach((d) => {
      parts.push('<circle cx="' + xOf(d.date).toFixed(1) + '" cy="' + yOf(d.avg).toFixed(1) +
        '" r="2.8" fill="#0A84FF"/>');
    });
  });

  parts.push('</svg>');
  return parts.join('');
}

/* ── the PDF document ────────────────────────────────────── */

const INTRO =
  'Based on your self-recorded entries. This report does not provide a diagnosis or medical advice.';
const LIMITED_NOTE =
  'This short record shows what was logged. More days are needed before changes over time can be meaningfully reviewed.';
const FOOTER =
  'Self-recorded by the patient using Pattern. Events are shown alongside symptoms without implying causation.';

function metricCell(label: string, value: string, sub?: string): string {
  return '<div class="metric"><div class="metric-v">' + esc(value) + '</div>' +
    '<div class="metric-l">' + esc(label) + '</div>' +
    (sub ? '<div class="metric-s">' + esc(sub) + '</div>' : '') + '</div>';
}

/** the whole report as a print-first HTML document. White paper, dark
 *  text, Pattern blue as accent only — legible in grayscale, paginating
 *  naturally when long. */
export function reportHtml(data: ReportData): string {
  const s: string[] = [];

  s.push('<!DOCTYPE html><html><head><meta charset="utf-8">');
  s.push('<style>');
  s.push([
    '*{margin:0;padding:0;box-sizing:border-box}',
    'body{font-family:-apple-system,"SF Pro Text","Helvetica Neue",Helvetica,Arial,sans-serif;',
    'color:#1A1D21;background:#FFFFFF;font-size:12px;line-height:1.5;padding:36px 40px}',
    'header{border-bottom:2px solid #0A84FF;padding-bottom:14px}',
    '.brand{font-size:20px;font-weight:700;letter-spacing:-0.3px;color:#0A84FF}',
    'h1{font-size:15px;font-weight:600;margin-top:2px}',
    '.meta{margin-top:8px;color:#4B5563}',
    '.meta span{margin-right:16px;white-space:nowrap}',
    'section{margin-top:22px;page-break-inside:avoid}',
    'h2{font-size:13px;font-weight:700;margin-bottom:8px;',
    'border-bottom:1px solid #E3E6EB;padding-bottom:4px}',
    '.note{color:#4B5563}',
    '.limited{margin-top:14px;padding:10px 12px;border:1px solid #C9D4E3;',
    'border-radius:6px;background:#F4F7FB}',
    '.limited b{display:block;margin-bottom:2px}',
    '.metrics{display:flex;flex-wrap:wrap;gap:10px}',
    '.metric{flex:1 1 130px;min-width:120px;border:1px solid #E3E6EB;',
    'border-radius:6px;padding:8px 10px}',
    '.metric-v{font-size:17px;font-weight:700}',
    '.metric-l{color:#4B5563;margin-top:1px}',
    '.metric-s{color:#6B7280;font-size:10.5px;margin-top:1px}',
    'table{width:100%;border-collapse:collapse}',
    'th{text-align:left;font-weight:600;color:#4B5563;padding:4px 8px 4px 0;',
    'border-bottom:1px solid #E3E6EB}',
    'td{padding:4px 8px 4px 0;border-bottom:1px solid #F0F2F5;vertical-align:top}',
    '.num{font-variant-numeric:tabular-nums}',
    '.bar{display:inline-block;height:7px;background:#0A84FF;border-radius:3px;',
    'vertical-align:middle;margin-right:6px}',
    'footer{margin-top:26px;padding-top:10px;border-top:1px solid #E3E6EB;',
    'color:#6B7280;font-size:10.5px}',
  ].join(''));
  s.push('</style></head><body>');

  // ── header ──
  s.push('<header><div class="brand">Pattern</div>');
  s.push('<h1>Self-recorded pain and function summary</h1>');
  s.push('<div class="meta">');
  s.push('<span><b>' + esc(fmtReportDate(data.rangeStart)) + ' – ' + esc(fmtReportDate(data.rangeEnd)) + '</b></span>');
  s.push('<span>Exported ' + esc(fmtReportDate(data.exportDate)) + '</span>');
  s.push('<span>' + data.loggedDays + ' logged ' + (data.loggedDays === 1 ? 'day' : 'days') + '</span>');
  s.push('<span>' + data.totalCheckins + ' check-in' + (data.totalCheckins === 1 ? '' : 's') + '</span>');
  s.push('<span>Pain scale: 0 = no pain, 10 = most intense</span>');
  s.push('</div>');
  s.push('<div class="note" style="margin-top:6px">' + esc(INTRO) + '</div>');
  s.push('</header>');

  if (data.limited) {
    s.push('<div class="limited"><b>Limited record — ' + data.loggedDays +
      (data.loggedDays === 1 ? ' day' : ' days') + ' logged.</b>' + esc(LIMITED_NOTE) + '</div>');
  }

  // ── key metrics ──
  s.push('<section><h2>Key metrics</h2><div class="metrics">');
  s.push(metricCell('Average pain', formatScore(data.avg) + '/10', painLabel(data.avg)));
  s.push(metricCell('Lowest daily average', formatScore(data.lowestDay) + '/10'));
  s.push(metricCell('Highest daily average', formatScore(data.highestDay) + '/10'));
  s.push(metricCell('Logged days', String(data.loggedDays)));
  s.push(metricCell('Check-ins', String(data.totalCheckins)));
  if (data.goalText) {
    s.push(metricCell('Chosen activity', data.goalText));
    if (data.latestAbility) {
      s.push(metricCell('Latest weekly ability', data.latestAbility.ability + '/10',
        'week of ' + fmtShortDate(data.latestAbility.week)));
    }
    if (data.abilityChange && !data.limited) {
      s.push(metricCell('Change since first rating',
        data.abilityChange.first.ability + '/10 → ' + data.abilityChange.last.ability + '/10',
        fmtShortDate(data.abilityChange.first.week) + ' – ' + fmtShortDate(data.abilityChange.last.week)));
    }
  }
  s.push('</div></section>');

  // ── pain over time ──
  s.push('<section><h2>' + (data.limited ? 'Pain recorded so far' : 'Pain over time') + '</h2>');
  s.push('<div class="note">Daily average pain, 0–10. Days without check-ins are shown as gaps' +
    ' — the line never bridges a day that was not logged.</div>');
  s.push('<div style="margin-top:8px">' + chartSvg(data) + '</div>');
  s.push('<div class="note num">Overall average ' + formatScore(data.avg) +
    ' · lowest daily average ' + formatScore(data.lowestDay) +
    ' · highest daily average ' + formatScore(data.highestDay) + '.' +
    (data.halves
      ? ' First half of the period averaged ' + formatScore(data.halves.first) +
        ', second half ' + formatScore(data.halves.second) + '.'
      : '') +
    '</div>');
  s.push('</section>');

  // ── function over time ──
  if (data.goalText) {
    s.push('<section><h2>Function over time</h2>');
    s.push('<div class="note">Activity: <b>' + esc(data.goalText) + '</b>. Self-rated ability, ' +
      '0 = not able at all, 10 = fully able. Ability is a separate scale from pain — ' +
      'a higher number is better.</div>');
    if (data.func.length) {
      s.push('<table style="margin-top:8px"><tr><th>Week of</th><th>Ability</th><th>Note</th></tr>');
      data.func.forEach((f) => {
        s.push('<tr><td class="num">' + esc(fmtShortDate(f.week)) + '</td>' +
          '<td class="num"><span class="bar" style="width:' + (f.ability * 8) + 'px"></span>' +
          f.ability + '/10</td>' +
          '<td>' + esc(f.note || '') + '</td></tr>');
      });
      s.push('</table>');
    } else {
      s.push('<div class="note" style="margin-top:6px">Activity chosen; no weekly ratings recorded yet.</div>');
    }
    s.push('</section>');
  }

  // ── pain locations ──
  if (data.locations.length) {
    const maxDays = data.locations[0].days;
    s.push('<section><h2>Pain locations</h2>');
    s.push('<div class="note">Ranked by the number of days each location was recorded.</div>');
    s.push('<table style="margin-top:8px"><tr><th>Location</th><th>Days recorded</th></tr>');
    data.locations.forEach((l) => {
      s.push('<tr><td>' + esc(l.name) + '</td>' +
        '<td class="num"><span class="bar" style="width:' +
        Math.max(6, Math.round((l.days / maxDays) * 100)) + 'px"></span>' + l.days + '</td></tr>');
    });
    s.push('</table></section>');
  }

  // ── described as ──
  if (data.qualities.length) {
    s.push('<section><h2>Described as</h2>');
    s.push('<div class="note">' + data.qualities
      .map((q) => esc(q.name) + ' ×' + q.count).join(' · ') + '</div>');
    s.push('</section>');
  }

  // ── events ──
  if (data.events.length) {
    s.push('<section><h2>Events</h2>');
    s.push('<div class="note">Recorded as events, in the order they happened. ' +
      'No causal relationship with pain is implied.</div>');
    s.push('<table style="margin-top:8px"><tr><th>Date</th><th>Time</th><th>Type</th><th>Note</th></tr>');
    data.events.forEach((ev) => {
      const note = (ev.text ? esc(ev.text) : '—') +
        (ev.helped != null ? ' <span class="note num">(patient-reported effect ' + ev.helped + '/10)</span>' : '');
      s.push('<tr><td class="num">' + esc(fmtShortDate(ev.date)) + '</td>' +
        '<td class="num">' + esc(fmtTime(ev.h)) + '</td>' +
        '<td>' + esc(EVENT_LABELS[ev.kind as EventKind] || ev.kind) + '</td>' +
        '<td>' + note + '</td></tr>');
    });
    s.push('</table></section>');
  }

  s.push('<footer>' + esc(FOOTER) + '</footer>');
  s.push('</body></html>');
  return s.join('');
}

export const REPORT_INTRO = INTRO;
export const REPORT_LIMITED_NOTE = LIMITED_NOTE;
export const REPORT_FOOTER = FOOTER;
