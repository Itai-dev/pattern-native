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
  BANDS, IMPACT_BETTER, IMPACT_WORSE, TimeBandKey, bandOf, impactName,
} from './metrics';
import {
  Entries, EVENT_LABELS, EventKind, FuncEntry, LOC_NAMES, PainEvent,
  DURATION_LABELS, INTERVENTIONS, ONSET_LABELS, QUALITY_NAMES, RESPONSE_LABELS,
  Response, checkinCount, dailyAverage,
  dateFromISO, fmtTime, funcTrend, iso, logsOf, valuesOf,
} from './model';
import { BAND_AT, formatScore, painLabel } from './painScale';
import {
  BAND_MIN_CHECKINS, BAND_MIN_DAYS, HALVES_MIN_DAYS, LIMITED_RECORD_DAYS,
  TERCILE_MIN_DAYS, TERCILE_MIN_SPREAD,
} from './thresholds';
import { Association, associationCopy } from './health/engine';
import { HEALTH_CATEGORIES, HealthDay } from './health/types';

export interface ReportInput {
  entries: Entries;
  events: PainEvent[];
  func: FuncEntry[];
  goalText: string | null;
  todayIso: string;
  windowDays: number; // typically 90
  /** Day notes go into the PDF only when this is true, and the user is
   *  asked at share time — never a buried setting. Notes are the one part
   *  of the record written with no audience in mind, and a month of
   *  private paragraphs must not ride along because a toggle was
   *  forgotten. Absent = out. */
  includeNotes?: boolean;
  /** Apple Health context, when connected: the normalized days (for the
   *  coverage statement) and the single strongest association the engine
   *  let through — already gated upstream by the same rules Trends
   *  renders under. Absent = the section is not drawn. */
  healthDays?: Record<string, HealthDay>;
  healthAssociation?: Association | null;
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
  /** parts of the day that hold check-ins. EMPTY on a limited record:
   *  under seven logged days there is not enough to compare parts of a
   *  day against each other, and gating it here means the preview and
   *  the PDF can never disagree about that. */
  timeOfDay: TimeBand[];
  goalText: string | null;
  func: FuncEntry[]; // ascending by week
  latestAbility: FuncEntry | null;
  abilityChange: { first: FuncEntry; last: FuncEntry } | null;
  locations: { id: string; name: string; days: number }[];
  qualities: { id: string; name: string; count: number }[];
  events: PainEvent[]; // chronological
  /** the two ends of the record, described. null until there is enough
   *  of a record for the ends to be different from the middle. */
  harderEasier: HarderEasier | null;
  /** what the user pointed at, counted. ATTRIBUTIONS, not findings. */
  flagged: { worse: FlagCount[]; better: FlagCount[] };
  /** Day notes, verbatim, chronological — EMPTY unless the share asked
   *  for them. They render as their own section at the end and are never
   *  woven into the charts: the report's body is numbers and computed
   *  sentences, and these are the patient's words, kept apart so neither
   *  can be mistaken for the other. */
  notes: { date: string; text: string }[];
  /** Apple Health context: how much sensor data actually stood behind
   *  the record in this window, per category, and the one association
   *  that cleared the gates (or null). null overall = Health was never
   *  connected or produced nothing in the window — the section simply
   *  does not exist, rather than existing to say it is empty. */
  health: {
    coverage: { name: string; covered: number }[];
    association: Association | null;
  } | null;
}

/* ── what you flagged ────────────────────────────────────────
   A tally of the chips, and nothing more.

   This is the one section of the record that is explicitly SUBJECTIVE,
   and it has to be labelled that way everywhere it appears. "You pointed
   at sleep on 9 days" is a fact about what the user thought. It is not a
   fact about sleep, and it cannot become one, because a day is only in
   the tally if they already believed sleep was the problem — there is no
   set of days they thought sleep was fine sitting next to it.

   Worth printing anyway. A clinician asking "what do you think sets it
   off" gets a considered answer recorded across weeks instead of an
   answer improvised in the room, and that is a genuinely better input to
   the conversation than nothing. It just is not evidence. */

export interface FlagCount {
  id: string;
  name: string;
  days: number;
}

/* ── the two ends of the record ──────────────────────────────
   The days that were hardest and the days that were easiest, with the
   middle third thrown away, and what was RECORDED on each side.

   Two limits on this, and both matter.

   It needs TERCILE_MIN_DAYS days, and the two boundaries have to sit
   TERCILE_MIN_SPREAD apart. Someone whose days run 5, 5, 6, 5, 6 has a
   "hardest third" that is not meaningfully harder than the rest, and
   ranking it would manufacture a difference out of rounding.

   And it describes the PAIN — where it was, what words were used for it —
   never the factors. Sleep, stress and load are what the engine tests,
   under a rule that needs eight observations at each end and a point and
   a half between them. Printing "stress was high on 8 of your 11 hardest
   days" would be that comparison, run at whatever sample size happened to
   exist, with the arithmetic left to the reader. Same claim, no gate. So
   this section stops at the pain itself, and the factors wait. */

export interface EndOfRecord {
  days: number;
  avg: number;
  locations: { id: string; name: string; days: number }[];
  qualities: { id: string; name: string; count: number }[];
}

export interface HarderEasier {
  harder: EndOfRecord;
  easier: EndOfRecord;
  /** the daily averages the two groups are divided at */
  boundaryLow: number;
  boundaryHigh: number;
  /** days in the discarded middle — shown, so the split is not a mystery */
  middleDays: number;
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
  const { entries, events, func, goalText, todayIso, windowDays, includeNotes } = inp;
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
  if (days.length >= HALVES_MIN_DAYS) {
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
  const limited = days.length < LIMITED_RECORD_DAYS;

  return {
    rangeStart: days[0].date,
    rangeEnd: todayIso,
    exportDate: todayIso,
    loggedDays: days.length,
    totalCheckins: days.reduce((s, d) => s + d.count, 0),
    limited,
    avg: avgOf(avgs),
    lowestDay: Math.min.apply(null, avgs),
    highestDay: Math.max.apply(null, avgs),
    halves,
    days,
    timeOfDay: limited ? [] : timeOfDayBands(entries, days),
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
    harderEasier: harderEasierOf(entries, days),
    flagged: {
      worse: countFlags(entries, days, IMPACT_WORSE),
      better: countFlags(entries, days, IMPACT_BETTER),
    },
    /* from every day in the window, logged or not — a note can sit on a
       day whose check-ins were all removed, and it is still theirs */
    notes: !includeNotes ? [] : Object.keys(entries)
      .filter((k) => k >= startIso && k <= todayIso && !!(entries[k].note || '').trim())
      .sort()
      .map((k) => ({ date: k, text: entries[k].note.trim() })),
    health: healthContext(inp.healthDays, inp.healthAssociation || null, days),
  };
}

/** Coverage counted against LOGGED days: "sleep data on 9 of 14 logged
 *  days" is the number a clinician needs to weigh the association — a
 *  covered day with no pain recorded joins no comparison and does not
 *  belong in the denominator's story. */
function healthContext(
  healthDays: Record<string, HealthDay> | undefined,
  association: Association | null,
  days: ReportDay[]
): ReportData['health'] {
  if (!healthDays) return null;
  const counts: Record<string, number> = {};
  days.forEach((d) => {
    const h = healthDays[d.date];
    if (!h) return;
    Object.keys(h.coverage).forEach((c) => { counts[c] = (counts[c] || 0) + 1; });
  });
  const coverage = HEALTH_CATEGORIES
    .filter((c) => counts[c.id])
    .map((c) => ({ name: c.name, covered: counts[c.id] }));
  if (!coverage.length) return null;
  return { coverage, association };
}

/** how many days each chip was ticked on one side */
function countFlags(entries: Entries, days: ReportDay[], metricId: string): FlagCount[] {
  const n: Record<string, number> = {};
  days.forEach((d) => {
    const ids = valuesOf(entries[d.date], metricId);
    if (!ids) return;
    ids.forEach((id) => { n[id] = (n[id] || 0) + 1; });
  });
  return Object.keys(n)
    .sort((a, b) => n[b] - n[a])
    .map((id) => ({ id, name: impactName(id), days: n[id] }));
}

/** what was recorded across one set of days */
function describeDays(entries: Entries, days: ReportDay[]): EndOfRecord {
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
  return {
    days: days.length,
    avg: round1(days.reduce((s, d) => s + d.avg, 0) / days.length),
    locations: Object.keys(locDays)
      .sort((a, b) => locDays[b] - locDays[a])
      .map((id) => ({ id, name: LOC_NAMES[id] || id, days: locDays[id] })),
    qualities: Object.keys(qual)
      .sort((a, b) => qual[b] - qual[a])
      .map((id) => ({ id, name: QUALITY_NAMES[id] || id, count: qual[id] })),
  };
}

/** the outer terciles, middle discarded. null when the record is too
 *  short, or when its two ends are not far enough apart to be different
 *  from each other in any way worth printing. */
export function harderEasierOf(entries: Entries, days: ReportDay[]): HarderEasier | null {
  if (days.length < TERCILE_MIN_DAYS) return null;
  const byAvg = days.slice().sort((a, b) => a.avg - b.avg);
  const third = Math.floor(byAvg.length / 3);
  if (third < 1) return null;

  const easierDays = byAvg.slice(0, third);
  const harderDays = byAvg.slice(byAvg.length - third);
  const boundaryLow = easierDays[easierDays.length - 1].avg;
  const boundaryHigh = harderDays[0].avg;
  if (boundaryHigh - boundaryLow < TERCILE_MIN_SPREAD) return null;

  return {
    harder: describeDays(entries, harderDays),
    easier: describeDays(entries, easierDays),
    boundaryLow, boundaryHigh,
    middleDays: byAvg.length - easierDays.length - harderDays.length,
  };
}

/* ── time of day ─────────────────────────────────────────────
   Timing is one of the standard questions a clinician asks, and every
   check-in already carries the minute it was recorded — so the report can
   answer it instead of throwing that away into the daily average.

   What it reports is DESCRIPTIVE only: the average of the check-ins
   recorded in each part of the day, always beside the number of check-ins
   behind it, so a band resting on four answers can never read like one
   resting on forty. It is not a claim about when pain is worst — when a
   check-in happens is itself a choice, and with reminders on it is a
   schedule.

   Days with no timestamped moments (legacy and backfilled records) carry
   no time at all and are left out rather than guessed at. */

/* The bands themselves live in metrics.ts, because the question windows
   and the report headings have to mean the same thing by the same
   numbers. Re-exported here so existing callers keep working. */
export { bandOf, BANDS } from './metrics';
export type { TimeBandKey } from './metrics';

export interface TimeBand {
  key: TimeBandKey;
  label: string;
  range: string;
  avg: number;
  checkins: number;
  /** how many distinct days contributed — a band can hold many check-ins
   *  from very few days */
  days: number;
}

/** Bands with enough behind them to sit beside each other.
 *
 *  A band needs BAND_MIN_CHECKINS check-ins across BAND_MIN_DAYS distinct
 *  days before it appears. Two reasons, and the second is the real one:
 *  a band resting on a single reading rendered an "average" that looked
 *  exactly like one resting on forty; and forty readings from one
 *  sleepless night are one night, not a pattern about nights.
 *
 *  Bands that fall short are omitted rather than shown greyed out. A
 *  number the reader is told to discount is still a number they saw. */
export function timeOfDayBands(entries: Entries, days: ReportDay[]): TimeBand[] {
  const acc: Record<string, { sum: number; n: number; days: Record<string, true> }> = {};
  days.forEach((d) => {
    logsOf(entries[d.date]).forEach((l) => {
      const k = bandOf(l.h);
      const a = acc[k] || (acc[k] = { sum: 0, n: 0, days: {} });
      a.sum += l.pain;
      a.n += 1;
      a.days[d.date] = true;
    });
  });
  return BANDS
    .filter((b) => {
      const a = acc[b.key];
      return !!a && a.n >= BAND_MIN_CHECKINS
        && Object.keys(a.days).length >= BAND_MIN_DAYS;
    })
    .map((b) => ({
      key: b.key,
      label: b.label,
      range: b.range,
      avg: round1(acc[b.key].sum / acc[b.key].n),
      checkins: acc[b.key].n,
      days: Object.keys(acc[b.key].days).length,
    }));
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

  /* The patient's own easier third, shaded FIRST so the gridlines draw
     over it — the same reading aid the app carries, because "which way
     is good" must never be left to chart instinct on a plot where down
     is improvement. Only when the tercile gates passed; a band from a
     short record is a guess wearing a fact's clothes. */
  if (data.harderEasier) {
    const yTop = yOf(data.harderEasier.boundaryLow);
    parts.push('<rect x="' + L + '" y="' + yTop.toFixed(1) + '" width="' + (W - L - R) +
      '" height="' + (yOf(0) - yTop).toFixed(1) + '" fill="#F0F6EF"/>');
    parts.push('<text x="' + (W - R - 4) + '" y="' + (yOf(0) - 5).toFixed(1) +
      '" text-anchor="end" font-size="9" fill="#4B7C57">patient’s easier third</text>');
  }

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

  // ── days by band — the count that grows as things improve ──
  /* The line chart below falls when the patient improves, which is
     correct and reads as decline. This section is the same record
     counted instead of plotted: days per severity band, in the app's
     own five words, where a growing pile of milder days IS the
     improvement. It comes first so the document's first data view is
     the one whose direction cannot be misread. */
  {
    const bands = BAND_AT
      .map((atV) => {
        const label = painLabel(atV);
        return { label, n: data.days.filter((d) => painLabel(d.avg) === label).length };
      })
      .filter((b) => b.n > 0);
    if (bands.length) {
      const maxN = Math.max.apply(null, bands.map((b) => b.n));
      s.push('<section><h2>Days like this</h2>');
      s.push('<div class="note">Logged days grouped by their daily average, using the same ' +
        'five bands as every other number here. As a record improves, the milder rows grow.</div>');
      s.push('<table style="margin-top:8px"><tr><th>Band</th><th>Days</th></tr>');
      bands.forEach((b) => {
        s.push('<tr><td style="width:130px">' + esc(b.label) + '</td>' +
          '<td class="num"><span class="bar" style="width:' +
          Math.max(6, Math.round((b.n / maxN) * 220)) + 'px"></span>' + b.n +
          (b.n === 1 ? ' day' : ' days') + '</td></tr>');
      });
      s.push('</table></section>');
    }
  }

  // ── pain over time ──
  s.push('<section><h2>' + (data.limited ? 'Pain recorded so far' : 'Pain over time') + '</h2>');
  s.push('<div class="note">Daily average pain, 0–10. Days without check-ins are shown as gaps' +
    ' — the line never bridges a day that was not logged. Lower is better on this chart' +
    (data.harderEasier ? '; the shaded band is the patient’s own easier third.' : '.') + '</div>');
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

  // ── time of day ──
  if (data.timeOfDay.length) {
    const timed = data.timeOfDay.reduce((s, b) => s + b.checkins, 0);
    s.push('<section><h2>Time of day</h2>');
    s.push('<div class="note">Average of the check-ins recorded in each part of the day, ' +
      'shown with the number of check-ins behind it. This reflects when check-ins were made ' +
      '— including any reminder times — and is not a claim about when pain is worst.</div>');
    s.push('<table style="margin-top:8px"><tr><th>Part of day</th><th>Average pain</th>' +
      '<th>Check-ins</th><th>Days</th></tr>');
    data.timeOfDay.forEach((b) => {
      s.push('<tr><td>' + esc(b.label) + ' <span class="note num">' + esc(b.range) + '</span></td>' +
        '<td class="num"><span class="bar" style="width:' + Math.round(b.avg * 8) + 'px"></span>' +
        formatScore(b.avg) + '/10</td>' +
        '<td class="num">' + b.checkins + '</td>' +
        '<td class="num">' + b.days + '</td></tr>');
    });
    s.push('</table>');
    s.push('<div class="note num" style="margin-top:6px">Based on ' + timed +
      ' timestamped check-in' + (timed === 1 ? '' : 's') +
      '. Parts of the day with nothing recorded are not listed.</div>');
    s.push('</section>');
  }

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

  // ── the two ends of the record ──
  if (data.harderEasier) {
    const he = data.harderEasier;
    const side = (title: string, e: typeof he.harder, cmp: string) => {
      const locs = e.locations.slice(0, 5)
        .map((l) => esc(l.name) + ' (' + l.days + ')').join(' · ') || '—';
      const qs = e.qualities.slice(0, 5)
        .map((q) => esc(q.name) + ' ×' + q.count).join(' · ') || '—';
      return '<tr><td><b>' + esc(title) + '</b><br><span class="note num">' + e.days +
        ' days, ' + cmp + ', averaging ' + formatScore(e.avg) + '/10</span></td>' +
        '<td>' + locs + '</td><td>' + qs + '</td></tr>';
    };
    s.push('<section><h2>Hardest and easiest days</h2>');
    s.push('<div class="note">The highest and lowest third of logged days by daily average, ' +
      'with the middle third set aside. This describes where the pain was and how it was ' +
      'described on each group of days. It is not a comparison of anything else that was ' +
      'recorded, and it does not identify a cause.</div>');
    s.push('<table style="margin-top:8px"><tr><th>Group</th><th>Locations (days)</th>' +
      '<th>Described as</th></tr>');
    s.push(side('Hardest days', he.harder, formatScore(he.boundaryHigh) + '/10 and above'));
    s.push(side('Easiest days', he.easier, formatScore(he.boundaryLow) + '/10 and below'));
    s.push('</table>');
    s.push('<div class="note num" style="margin-top:6px">' + he.middleDays +
      ' day' + (he.middleDays === 1 ? '' : 's') + ' in the middle third were set aside.</div>');
    s.push('</section>');
  }

  // ── what the patient points at ──
  if (data.flagged.worse.length || data.flagged.better.length) {
    const list = (f: typeof data.flagged.worse) =>
      f.slice(0, 8).map((x) => esc(x.name) + ' (' + x.days + ')').join(' · ') || '—';
    s.push('<section><h2>What the patient points to</h2>');
    s.push('<div class="note"><b>Self-attributed.</b> These are the things the patient ' +
      'identified on the day, with the number of days each was selected. They record what ' +
      'the patient believes affects their pain. They are not a comparison and carry no ' +
      'evidence about whether the association holds — a factor appears here only on days ' +
      'it was already suspected, so there is no unaffected group to weigh it against.</div>');
    s.push('<table style="margin-top:8px"><tr><th>Direction</th><th>Selected on (days)</th></tr>');
    if (data.flagged.worse.length) {
      s.push('<tr><td><b>Reported as making it worse</b></td><td>' +
        list(data.flagged.worse) + '</td></tr>');
    }
    if (data.flagged.better.length) {
      s.push('<tr><td><b>Reported as helping</b></td><td>' +
        list(data.flagged.better) + '</td></tr>');
    }
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
      /* Two response formats coexist on purpose. Older records carry a
         0–10 impression; newer ones carry Better / About the same /
         Worse / Not sure. Mapping one onto the other would mean choosing
         cutpoints nobody chose, so the report shows whichever was
         actually recorded and names the scale it belongs to. */
      const tried = ev.intervention
        ? ' <span class="note">tried: ' + esc(INTERVENTIONS[ev.intervention] || ev.intervention) + '</span>'
        : '';
      const outcome = ev.resp
        ? ' <span class="note">(patient-reported: ' + esc(RESPONSE_LABELS[ev.resp as Response]) + ')</span>'
        : (ev.helped != null
          ? ' <span class="note num">(patient-reported effect ' + ev.helped + '/10)</span>'
          : '');
      /* SOCRATES onset and radiation, where they were answered. These
         are the two questions asked first in a consultation and the two
         nobody can reconstruct weeks later, which is the whole reason
         they are collected at the time. */
      const guided: string[] = [];
      if (ev.onset) guided.push(esc(ONSET_LABELS[ev.onset]));
      if (ev.doing) guided.push('doing: ' + esc(ev.doing));
      if (ev.spread) guided.push('spread: ' + esc(ev.spread));
      if (ev.duration) guided.push('lasted: ' + esc(DURATION_LABELS[ev.duration]));
      const detail = guided.length
        ? '<br><span class="note">' + guided.join(' · ') + '</span>'
        : '';
      const note = (ev.text ? esc(ev.text) : '—') + tried + outcome + detail;
      s.push('<tr><td class="num">' + esc(fmtShortDate(ev.date)) + '</td>' +
        '<td class="num">' + esc(fmtTime(ev.h)) + '</td>' +
        '<td>' + esc(EVENT_LABELS[ev.kind as EventKind] || ev.kind) + '</td>' +
        '<td>' + note + '</td></tr>');
    });
    s.push('</table></section>');
  }

  /* ── Apple Health context ────────────────────────────────
     Sensor context beside the self-report, stated the way everything
     else here is stated: what was measured, over how many days, with
     any association carrying its group sizes, its timing, and the
     sentence that refuses causation. Read-only data the patient chose
     to connect; no raw sensor charts — a clinician who wants those has
     the Health app itself. When nothing cleared the gates, the section
     says what is being collected and that nothing has met the bar,
     which for a clinician is information, not absence. */
  if (data.health) {
    s.push('<section><h2>Context from Apple Health</h2>');
    s.push('<div class="note">The patient connected Apple Health (read-only). ' +
      'Coverage below counts the logged days that also carried sensor data — ' +
      'days without Health data are left out of any comparison, never counted as zero.</div>');
    s.push('<table><tr><th>Category</th><th>Coverage</th></tr>');
    data.health.coverage.forEach((c) => {
      s.push('<tr><td>' + esc(c.name) + '</td><td class="num">' + c.covered
        + ' of ' + data.loggedDays + ' logged days</td></tr>');
    });
    s.push('</table>');
    const hc = data.health.association ? associationCopy(data.health.association) : null;
    if (hc && data.health.association) {
      const a = data.health.association;
      s.push('<div style="margin-top:10px"><b>' + esc(hc.title) + '</b></div>');
      s.push('<div style="margin-top:4px">' + esc(hc.body) + '</div>');
      s.push('<div class="note num" style="margin-top:4px">' + esc(hc.sample)
        + (a.from && a.to
          ? ' ' + esc(fmtReportDate(a.from)) + ' – ' + esc(fmtReportDate(a.to)) + '.'
          : '') + '</div>');
      s.push('<div class="note" style="margin-top:4px">' + esc(hc.timing) + '</div>');
      s.push('<div class="note" style="margin-top:6px"><b>' + esc(hc.disclaimer) + '</b></div>');
    } else {
      s.push('<div class="note" style="margin-top:10px">No association between ' +
        'this context and the pain record has met Pattern’s reporting bar in ' +
        'this window (paired days, group sizes, and effect size are all gated).</div>');
    }
    s.push('</section>');
  }

  /* ── the patient's own words ─────────────────────────────
     Last, in their own section, verbatim. Never woven into the charts:
     the body of this report is numbers and computed sentences, and these
     are neither — they are what the patient chose to write down, present
     only because they chose again, at share time, to include them. No
     truncation and no paraphrase; an edited quotation in a medical
     document is the reader's problem wearing the writer's name. */
  if (data.notes.length) {
    s.push('<section><h2>In the patient’s own words</h2>');
    s.push('<div class="note">Day notes, included by the patient’s choice, ' +
      'reproduced exactly as written. These are personal context, not ' +
      'clinical observations.</div>');
    s.push('<table><tr><th>Date</th><th>Note</th></tr>');
    data.notes.forEach((n) => {
      s.push('<tr><td class="num">' + esc(fmtShortDate(n.date)) + '</td>' +
        '<td>' + esc(n.text) + '</td></tr>');
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
