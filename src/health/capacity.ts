/**
 * What you can do — conclusions about each activity, at each effort,
 * and the next step. Sentences, not statistics.
 *
 * WHY THIS EXISTS. Everything else in Pattern describes pain back to the
 * person, and a founder who uses it every day said so plainly (28 Sep
 * 2026): it shows me my pain and nothing else, and lately I see more of
 * it. A record that only ever reflects pain teaches attention to pain.
 * The goal was always to keep people active while pain is managed, and
 * the approach with the best evidence for that is pacing and graded
 * activity: find the amount of an activity that goes fine, do that on a
 * plan rather than on how today feels, and build in small steps.
 *
 * CONCLUSIONS, NOT DATA. The first version of this card said "went fine
 * 4 of the last 5 times, usual 30 min" and left the reading to the
 * person, who said the same day: bring me the answer, not the numbers I
 * have to analyse. So each card is one sentence that has already done
 * the reading — "easy walks are going well; go for 33 minutes next time"
 * — and the counts it rests on sit behind "Why?", inside the card. The
 * confidence is in the words ("so far" under six sessions), never a
 * percentage.
 *
 * EFFORT, NOT JUST MINUTES. Twenty hard minutes and an easy hour are not
 * the same session. Apple records a 1–10 effort on each workout — the
 * person's own rating in Fitness, or the Watch's estimate — and sessions
 * are grouped by activity AND effort band (thresholds.ts, Apple's own
 * bands), so a hard run and an easy run each get their own level. The
 * step only ever adds minutes at the same effort: pacing changes one
 * thing at a time, and an app that raised the effort for you would be
 * prescribing. A session with no effort is its own group, "effort not
 * recorded" — never guessed.
 *
 * "WENT FINE" IS THE NEXT MORNING. The first check-in in the morning
 * after the session against this day's own first morning check-in —
 * the same time of day, so a stiff start is compared with a stiff start.
 * A rise of CAPACITY_HARDER_POINTS or more is "ran harder". Soreness in
 * the hours right after exercise is expected and is not damage; judging
 * a session on it would teach the fear this card exists to undo, so the
 * physiotherapist's rule is the one used — it is fine if it has settled
 * by the next morning.
 *
 * THREE STATES, NEVER TWO. A session without both mornings is `unknown`
 * and counts toward nothing; one whose next morning has not happened yet
 * is `pending`. Neither is ever read as "ran harder".
 *
 * A DECISION REVERSED, ON PURPOSE. workouts.ts and budget.ts describe
 * and never advise; this is the one place that says a next step,
 * because the person asked for a tool rather than a mirror. The number
 * comes only from the person's own sessions, the step is small and
 * fixed, it eases back on its own, and the card says it is not medical
 * advice.
 *
 * NOT A PAIN SCORE. Pain values are read only to decide fine or harder;
 * none is shown, averaged or combined. The card shows words and minutes,
 * in neutral colour.
 */
import { Entries, addDays, logsOf, mondayOf } from '../model';
import {
  CAPACITY_EASE_AFTER, CAPACITY_HARDER_POINTS, CAPACITY_MIN_SESSIONS, CAPACITY_MIN_SESSION_MIN,
  CAPACITY_RECENT, CAPACITY_STEP, CAPACITY_STEP_MAX_MIN, CAPACITY_STEP_MIN_MIN,
  EFFORT_EASY_MAX, EFFORT_MODERATE_MAX,
} from '../thresholds';
import { HealthDay } from './types';
import { morningPain } from './windows';
import { capitalise, workoutName } from './workoutNames';

export type SessionOutcome = 'fine' | 'harder' | 'pending' | 'unknown';
export type EffortBand = 'easy' | 'moderate' | 'hard';

/** Apple's 1–10 effort as its band, or null when none was recorded */
export function effortBand(effort: number | undefined): EffortBand | null {
  if (effort == null) return null;
  if (effort <= EFFORT_EASY_MAX) return 'easy';
  if (effort <= EFFORT_MODERATE_MAX) return 'moderate';
  return 'hard';
}

const BAND_ORDER: Record<EffortBand, number> = { easy: 0, moderate: 1, hard: 2 };

export interface Session {
  date: string;
  /** minutes since local midnight the session started */
  h: number;
  /** the activity's plain name, as in workouts.ts */
  activity: string;
  band: EffortBand | null;
  minutes: number;
  outcome: SessionOutcome;
}

/**
 * Every session in the record, oldest first, each with its outcome.
 * Pure: entries, Health days and today's date in.
 *
 * Two sessions on one day share that day's next morning — the morning
 * cannot say which of them it followed, so it is read for both.
 */
export function sessions(
  entries: Entries, health: Record<string, HealthDay>, todayIso: string
): Session[] {
  const out: Session[] = [];
  Object.keys(health).sort().forEach((date) => {
    /* a workout filed after today is a clock error, not a session */
    if (date > todayIso) return;
    const ws = (health[date].workouts || []).slice().sort((a, b) => a.h - b.h);
    if (!ws.length) return;
    const next = addDays(date, 1);
    const thisMorning = morningPain(logsOf(entries[date]));
    const nextMorning = morningPain(logsOf(entries[next]));
    let outcome: SessionOutcome;
    if (thisMorning && nextMorning) {
      outcome = nextMorning.pain - thisMorning.pain >= CAPACITY_HARDER_POINTS ? 'harder' : 'fine';
    } else if (!nextMorning && next >= todayIso) {
      /* the next morning can still arrive: waiting, not unknown */
      outcome = 'pending';
    } else {
      outcome = 'unknown';
    }
    ws.forEach((w) => {
      if (w.minutes < CAPACITY_MIN_SESSION_MIN) return;
      out.push({
        date, h: w.h, activity: workoutName(w.activity), band: effortBand(w.effort),
        minutes: Math.round(w.minutes), outcome,
      });
    });
  });
  return out;
}

export type StepKind = 'up' | 'hold' | 'ease';

/** one activity at one effort, read */
export interface ActivityLevel {
  activity: string;
  band: EffortBand | null;
  /** the typical length of the recent sessions that went fine, in
   *  minutes; with none fine, of the recent sessions at all */
  level: number;
  /** the next session, in minutes, at the same effort */
  next: number;
  step: StepKind;
  /** recent sessions with a known outcome, and how many went fine */
  known: number;
  fine: number;
  /** the newest session's date — for ordering */
  last: string;
}

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

function stepOf(level: number): number {
  return Math.min(CAPACITY_STEP_MAX_MIN, Math.max(CAPACITY_STEP_MIN_MIN, Math.round(level * CAPACITY_STEP)));
}

/**
 * One group's level and next step from its sessions (oldest first), or
 * null short of CAPACITY_MIN_SESSIONS known ones.
 *
 * Up by CAPACITY_STEP after the newest known session went fine. Held
 * after it ran harder — one harder morning is a day. Eased back by the
 * same step when CAPACITY_EASE_AFTER of the last three ran harder, or
 * none of the recent ones went fine. Never below the shortest session
 * that counts.
 */
export function activityLevel(
  activity: string, band: EffortBand | null, all: Session[]
): ActivityLevel | null {
  const known = all.filter((s) => s.outcome === 'fine' || s.outcome === 'harder');
  if (known.length < CAPACITY_MIN_SESSIONS) return null;
  const recent = known.slice(-CAPACITY_RECENT);
  const fine = recent.filter((s) => s.outcome === 'fine');
  const level = Math.round(median((fine.length ? fine : recent).map((s) => s.minutes)));
  const harderRecently = recent.slice(-3).filter((s) => s.outcome === 'harder').length;
  const newest = recent[recent.length - 1];

  let step: StepKind;
  let next: number;
  if (!fine.length || harderRecently >= CAPACITY_EASE_AFTER) {
    step = 'ease';
    next = Math.max(CAPACITY_MIN_SESSION_MIN, level - stepOf(level));
  } else if (newest.outcome === 'harder') {
    step = 'hold';
    next = level;
  } else {
    step = 'up';
    next = level + stepOf(level);
  }
  return {
    activity, band, level, next, step, known: recent.length, fine: fine.length,
    last: all[all.length - 1].date,
  };
}

/* ── the conclusions ─────────────────────────────────────────
   Fixed sentence shapes, the numbers inserted. Each is one thing to
   know and, where there is one, one thing to do. Never "great job",
   never a verdict on today, never a pain number. */

export interface Insight {
  key: string;
  /** the conclusion, in one or two plain sentences */
  text: string;
  /** what it rests on — behind "Why?", inside the card */
  why: string;
  /** the newest session behind it, for ordering */
  last: string;
  /** most useful first: a contrast, then a warning, then the rest */
  rank: number;
}

/** "easy walking", "hard running", "walking" (no effort recorded) */
function named(activity: string, band: EffortBand | null): string {
  return band ? band + ' ' + activity : activity;
}

/** confidence, in words: "so far" until the level rests on a full window */
function sofar(l: ActivityLevel): string {
  return l.known >= CAPACITY_RECENT ? '' : ' so far';
}

function whyOf(l: ActivityLevel): string {
  const who = named(l.activity, l.band);
  const base = l.fine + ' of your last ' + l.known + ' ' + who + ' sessions were followed by a '
    + 'morning no worse than the one before' + (l.fine ? ', and those usually lasted about '
    + l.level + ' minutes.' : '.');
  return l.band ? base : base + ' Apple Health had no effort for these sessions, so they are read together.';
}

export function levelInsight(l: ActivityLevel): Insight {
  const who = named(l.activity, l.band);
  const key = 'level.' + l.activity + '.' + (l.band || 'none');
  let text: string;
  let rank: number;
  if (l.step === 'up') {
    rank = 3;
    text = capitalise(who) + ' is going well' + sofar(l) + '. Next time, go for '
      + l.next + ' minutes.';
  } else if (l.step === 'hold') {
    rank = 2;
    text = 'Your last ' + who + ' session was followed by a harder morning. Stay at '
      + l.next + ' minutes next time rather than going longer.';
  } else {
    rank = 1;
    const easier = l.band === 'hard' ? ' or keep it moderate' : l.band === 'moderate' ? ' or keep it easy' : '';
    text = capitalise(who) + ' is costing you the next morning' + sofar(l) + '. Try '
      + l.next + ' minutes next time' + easier + ', and build back up from there.';
  }
  return { key, text, why: whyOf(l), last: l.last, rank };
}

/**
 * The contrast within one activity: an effort that goes well beside a
 * harder one that does not. This is the finding the person cannot see
 * from any single session — "running is fine easy; hard runs are the
 * ones that cost you" — so it leads when it exists, and replaces the
 * two separate sentences it is made of.
 */
function contrastInsight(good: ActivityLevel, bad: ActivityLevel): Insight {
  return {
    key: 'contrast.' + good.activity,
    text: capitalise(good.activity) + ' goes well for you at ' + (good.band === 'easy' ? 'an easy' : 'a moderate')
      + ' effort. The ' + bad.band + ' sessions are the ones costing you the next morning — keep it '
      + good.band + ', and build minutes there: next time, ' + good.next + ' minutes.',
    why: whyOf(good) + ' ' + whyOf(bad),
    last: good.last > bad.last ? good.last : bad.last,
    rank: 0,
  };
}

export interface CapacityView {
  /** the headline, one sentence about the week */
  headline: string;
  /** conclusions, most useful first */
  insights: Insight[];
  /** what the activities still collecting are waiting for, one line */
  collecting: string | null;
}

function joinWords(words: string[]): string {
  if (words.length < 2) return words.join('');
  return words.slice(0, -1).join(', ') + ' and ' + words[words.length - 1];
}

/**
 * THE WEEK, NOT THE LAST SEVEN DAYS. A rolling window drops a session on
 * a day the person added nothing, which penalises a rest day. From
 * Monday, the number only grows until the week turns, and nothing
 * compares one week with another.
 */
function headlineOf(all: Session[], todayIso: string): string {
  const week = mondayOf(todayIso);
  const mins: Record<string, number> = {};
  let fine = 0, pending = 0;
  all.forEach((s) => {
    if (s.date < week) return;
    if (s.outcome === 'pending') pending += s.minutes;
    if (s.outcome !== 'fine') return;
    fine += s.minutes;
    const b = s.band || 'none';
    mins[b] = (mins[b] || 0) + s.minutes;
  });
  if (!fine) {
    return pending
      ? 'Tomorrow morning’s check-in will tell Pattern how today’s ' + pending + ' minutes went.'
      : 'Nothing this week has a next-morning answer yet.';
  }
  const bands = (['easy', 'moderate', 'hard'] as EffortBand[]).filter((b) => mins[b]);
  const mostly = bands.length > 1
    ? bands.slice().sort((a, b) => mins[b] - mins[a])[0] : null;
  return 'This week, your body handled ' + fine + ' minutes of activity'
    + (mostly ? ', mostly ' + mostly : bands.length === 1 && !mins.none ? ', all ' + bands[0] : '') + '.'
    + (pending ? ' Tomorrow morning will tell how today’s ' + pending + ' went.' : '');
}

/**
 * The whole card, or null when the record holds no session at all —
 * silence rather than an empty card.
 */
export function capacityView(
  entries: Entries, health: Record<string, HealthDay>, todayIso: string
): CapacityView | null {
  const all = sessions(entries, health, todayIso);
  if (!all.length) return null;

  const groups: Record<string, Session[]> = {};
  all.forEach((s) => {
    const k = s.activity + '|' + (s.band || '');
    (groups[k] = groups[k] || []).push(s);
  });
  const levels: ActivityLevel[] = [];
  const waiting: Record<string, number> = {};
  Object.keys(groups).forEach((k) => {
    const g = groups[k];
    const l = activityLevel(g[0].activity, g[0].band, g);
    if (l) { levels.push(l); return; }
    const known = g.filter((s) => s.outcome === 'fine' || s.outcome === 'harder').length;
    const name = named(g[0].activity, g[0].band);
    waiting[name] = CAPACITY_MIN_SESSIONS - known;
  });

  /* the contrast: within one activity, the easiest band going up beside
     a harder band easing back */
  const insights: Insight[] = [];
  const used: Record<string, true> = {};
  const byActivity: Record<string, ActivityLevel[]> = {};
  levels.forEach((l) => { if (l.band) (byActivity[l.activity] = byActivity[l.activity] || []).push(l); });
  Object.keys(byActivity).forEach((a) => {
    const ls = byActivity[a].slice().sort((x, y) => BAND_ORDER[x.band!] - BAND_ORDER[y.band!]);
    const good = ls.filter((l) => l.step === 'up')[0];
    const bad = good && ls.filter((l) => l.step === 'ease' && BAND_ORDER[l.band!] > BAND_ORDER[good.band!])[0];
    if (!good || !bad) return;
    insights.push(contrastInsight(good, bad));
    used[a + good.band] = true;
    used[a + bad.band] = true;
  });
  levels.forEach((l) => { if (!used[l.activity + l.band]) insights.push(levelInsight(l)); });
  insights.sort((a, b) => a.rank !== b.rank ? a.rank - b.rank
    : a.last !== b.last ? (a.last < b.last ? 1 : -1) : a.key.localeCompare(b.key));

  const names = Object.keys(waiting).sort();
  const most = names.reduce((m, n) => Math.max(m, waiting[n]), 0);
  const collecting = names.length
    ? 'Pattern will have an answer about ' + joinWords(names) + ' after '
      + (most === 1 ? 'one more session' : 'up to ' + most + ' more sessions')
      + ' with a morning check-in that day and the next.'
    : null;

  return { headline: headlineOf(all, todayIso), insights, collecting };
}

/** what the card does not mean — inside the card, behind its (i) */
export const CAPACITY_NOTE =
  'A session went fine when your next morning’s check-in was less than '
  + CAPACITY_HARDER_POINTS + ' points above that day’s morning. Soreness in the hours after '
  + 'exercise is common and is not damage. Effort is Apple’s 1–10 from your Watch or your own '
  + 'rating in Fitness. The next step comes from your own record, in small steps — it is not '
  + 'medical advice, and a clinician’s plan comes first.';
