/**
 * The return-to-activity model behind Today: the goal, where the person
 * stands against it, and what the record suggests for the next session.
 *
 * WHY THIS EXISTS. Today used to open on the last pain number. The
 * product question moved (28 Sep 2026, docs/POSITIONING.md): not "how
 * much did I hurt" but "what am I getting back to, how is my body
 * responding, and what next". The loop is activity → body response →
 * recovery → next load → progress, and pain is one signal inside "body
 * response", never the subject of the screen.
 *
 * NOTHING HERE IS MOCK. Real testers run master, and a hero reading
 * "3.8 / 5.0 km" that is not their data is fake certainty. Every value
 * comes from the goal they set, the sessions Health recorded and the
 * check-ins they entered; where there is not enough, the state says so
 * ("still learning") rather than filling the gap.
 *
 * THE READING IS capacity.ts's. Outcomes (next morning against this
 * morning), effort bands and the level/step rule are defined once there
 * and only re-worded here, so Today's two cards can never disagree
 * about the same session.
 *
 * WORDS. "Followed by", "appears", "consider", "you may want to" —
 * never "caused", "safe to train" or "push harder". An association read
 * from someone's own week is not a claim about what the exercise did,
 * and a suggestion about a session is not clearance to do it.
 */
import { Entries, logsOf, mondayOf } from './model';
import { MORNING_FROM, MORNING_UNTIL } from './metrics';
import { CAPACITY_MIN_SESSIONS } from './thresholds';
import { ActivityLevel, EffortBand, Session, activityLevel, sessions } from './health/capacity';
import { morningPain } from './health/windows';
import { HealthDay } from './health/types';

/* ── the goal ─────────────────────────────────────────────── */

/** the activities offered at setup — the common ones people come back
 *  to, as Apple Health names them, plus "other" in the person's words */
export const GOAL_ACTIVITIES = [
  'running', 'strength training', 'swimming', 'cycling', 'walking', 'pilates', 'other',
] as const;
export type GoalActivity = typeof GOAL_ACTIVITIES[number];

/**
 * What the person is getting back to. THREE STATES: no stored goal is
 * "never asked"; `activity: null` is "asked and skipped"; otherwise
 * answered. `label` is what the screen says — the activity's own name,
 * or their words for "other".
 */
export interface RecoveryGoal {
  v: 1;
  activity: GoalActivity | null;
  label: string;
  /** sessions a week they are aiming for, or null for no target */
  weeklySessions: number | null;
  setOn: string;
}

/** Health activity names that count toward each goal. A goal is a
 *  person's word and Health's names are Apple's, so a few neighbours
 *  count: a hike is walking, core work is strength. "Other" counts
 *  every session — there is no name to match it against. */
const GOAL_MATCHES: Record<Exclude<GoalActivity, 'other'>, string[]> = {
  running: ['running'],
  'strength training': ['strength training', 'core training', 'functional strength training'],
  swimming: ['swimming'],
  cycling: ['cycling'],
  walking: ['walking', 'hiking'],
  pilates: ['pilates'],
};

export function goalMatches(goal: RecoveryGoal, activity: string): boolean {
  if (!goal.activity) return false;
  if (goal.activity === 'other') return true;
  return GOAL_MATCHES[goal.activity].indexOf(activity) >= 0;
}

/** a goal's display name, trimmed of anything the storage should not hold */
export function goalLabel(activity: GoalActivity, other?: string): string {
  if (activity !== 'other') return activity;
  const t = (other || '').trim().slice(0, 40);
  return t || 'my activity';
}

/**
 * ONE GOAL, NOT TWO. Before the structured goal there was a free-text
 * intention ("What do you want to keep doing?", prefs `goal.text`), and
 * it is still what the clinician report prints and what a backup
 * carries. Rather than migrate it — a write the person never made — the
 * intention is READ as a goal whenever no structured one is stored: a
 * known activity named in it becomes that activity, anything else is
 * "other" in their own words. Saving a goal writes its label back to
 * `goal.text`, so the report, the backup and Today can never name two
 * different things. A stored skip wins over an old intention: the
 * person was asked, and said not now.
 */
export function goalFromIntention(text: string | null): RecoveryGoal | null {
  const t = (text || '').trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  const known = GOAL_ACTIVITIES.filter((a) => a !== 'other' && lower.indexOf(a) >= 0)[0];
  return known
    ? { v: 1, activity: known, label: known, weeklySessions: null, setOn: '' }
    : { v: 1, activity: 'other', label: goalLabel('other', t), weeklySessions: null, setOn: '' };
}

/** the goal Today and Profile read: the stored one, else the intention's */
export function currentGoal(stored: RecoveryGoal | null, intention: string | null): RecoveryGoal | null {
  return stored || goalFromIntention(intention);
}

/* ── where they stand ────────────────────────────────────── */

export type RecoveryStatusKind = 'learning' | 'tolerating' | 'hold' | 'lighter';

export interface RecoveryStatus {
  kind: RecoveryStatusKind;
  line: string;
}

export interface RecoveryHero {
  /** "Back to running" */
  title: string;
  /** goal sessions since Monday, any outcome — a session done is done */
  sessionsThisWeek: number;
  weeklyTarget: number | null;
  /** "2 sessions this week · aiming for 3", or "2 sessions this week" */
  progressLine: string;
  status: RecoveryStatus;
}

/** the goal's sessions, oldest first */
function goalSessions(all: Session[], goal: RecoveryGoal | null): Session[] {
  if (!goal || !goal.activity) return all;
  return all.filter((s) => goalMatches(goal, s.activity));
}

/**
 * The level to read the goal by: the effort band of the newest session,
 * if that band has a level; else every goal session together. The
 * newest band is what the person is doing now, and a level for a band
 * they have moved away from answers yesterday's question.
 */
function currentLevel(gs: Session[]): ActivityLevel | null {
  if (!gs.length) return null;
  const newest = gs[gs.length - 1];
  const name = newest.activity;
  const sameBand = gs.filter((s) => s.band === newest.band && s.activity === name);
  return activityLevel(name, newest.band, sameBand) || activityLevel(name, null, gs);
}

function statusOf(level: ActivityLevel | null): RecoveryStatus {
  if (!level) return { kind: 'learning', line: 'Still learning how your body responds.' };
  if (level.step === 'up') return { kind: 'tolerating', line: 'Your recent sessions went fine.' };
  if (level.step === 'hold') return { kind: 'hold', line: 'Your last session was followed by a harder next morning.' };
  return { kind: 'lighter', line: 'Your recent sessions were mostly followed by a harder next morning.' };
}

/** the hero's content, or null without an answered goal */
export function recoveryHero(
  goal: RecoveryGoal | null, entries: Entries, health: Record<string, HealthDay>, todayIso: string
): RecoveryHero | null {
  if (!goal || !goal.activity) return null;
  const gs = goalSessions(sessions(entries, health, todayIso), goal);
  const week = mondayOf(todayIso);
  const n = gs.filter((s) => s.date >= week).length;
  const t = goal.weeklySessions;
  return {
    title: 'Back to ' + goal.label,
    sessionsThisWeek: n,
    weeklyTarget: t,
    /* the target is named beside the count, never as a fraction of it:
       "1 / 3" and a bar that fills are a completion meter, and a week
       short of its number reads as a failed week */
    progressLine: n + (n === 1 ? ' session' : ' sessions') + ' this week'
      + (t ? ' · aiming for ' + t : ''),
    status: statusOf(currentLevel(gs)),
  };
}

/* ── today's guidance ────────────────────────────────────── */

export type GuidanceState = 'repeat' | 'lighter' | 'waiting' | 'learning' | 'noActivity';

export interface DailyGuidance {
  state: GuidanceState;
  /** what the record shows, in one sentence */
  headline: string;
  /** what to consider doing — a suggestion, never an instruction */
  recommendation: string;
  /** the load, in minutes and effort, when there is one to name */
  recommendedLoad: string | null;
  /** how much the reading rests on */
  sufficiency: 'none' | 'early' | 'enough';
  /** a check-in would answer something right now */
  checkIn: boolean;
  /** one line under the suggestion saying why it is what it is — only
   *  on a day the person logged a flare, otherwise absent */
  note?: string;
}

/* A FLARE DAY DOES NOT GET "LONGER". When the person has logged a flare
   for today, the card stops offering the step up and offers the same
   length instead — at their own level, with no number of the app's own.
   The pacing leaflets agree a flare is when you stop BUILDING, not when
   you stop moving (NHS Fife, OUH, SFH; Nielson 2013 on the two pacing
   traditions). Rejected: a line of caution under "a little longer" (two
   messages, and the action wins); cutting the minutes (that is a flare
   plan written by the app, which is a clinician's to write, and it makes
   load follow pain); hiding the suggestion (reads as "don't move").
   Gated ONLY on the person's own flare report, never a pain value — a
   pain cut-off here would be a readiness score by another name. It
   changes what Today shows today and nothing else: no level, outcome or
   session is touched, so the report is not an attribution fed to the
   engine. Not "flares aren't damage": for inflammatory pain a flare can
   be active disease. (18 Oct 2026) */
export const FLARE_NOTE =
  'You logged a flare today, so this isn’t suggesting longer. Your own flare plan, or your clinician’s, comes first.';

function atEffort(band: EffortBand | null): string {
  return band ? ' at ' + (band === 'easy' ? 'an easy' : band === 'moderate' ? 'a moderate' : 'a hard') + ' effort' : '';
}

function easier(band: EffortBand | null): string {
  return band === 'hard' ? ', at a moderate effort' : band === 'moderate' ? ', at an easy effort' : '';
}

/**
 * What Today suggests, from the goal's sessions (every session when no
 * goal is set). Order matters: a session still waiting on its morning
 * is the freshest fact and speaks first; then a level if there is one;
 * then the early read.
 *
 * `nowMin` is the minute of the day, because whether a check-in can
 * still answer a session depends on it. Left out, it is the start of
 * the morning — the reading every caller got before the clock arrived.
 */
export function dailyGuidance(
  goal: RecoveryGoal | null, entries: Entries, health: Record<string, HealthDay>, todayIso: string,
  flareToday = false, nowMin: number = MORNING_FROM,
): DailyGuidance {
  const gs = goalSessions(sessions(entries, health, todayIso), goal);
  if (!gs.length) {
    return {
      state: 'noActivity', sufficiency: 'none', recommendedLoad: null, checkIn: false,
      headline: 'No sessions recorded yet.',
      recommendation: 'When Apple Health records one, Pattern starts learning how your body responds.',
    };
  }

  const newest = gs[gs.length - 1];
  if (newest.outcome === 'pending') {
    /* CAN A CHECK-IN STILL ANSWER IT? capacity.ts has no clock, so it
       calls a session pending until midnight — but the answer is the
       first check-in of the MORNING band on each of the two days, so
       after noon nothing logged today can give it one, and a session
       whose own day had no morning check-in never will. The button used
       to stay up regardless: the check-in landed, the card did not
       move, and it asked again. Now it shows only inside the band, and
       once the answer is out of reach the card says the session is in
       and how a session is read. Never that a morning was missed —
       Today does not mention a missed check-in. It stays 'waiting'
       rather than falling through to a level, so the only thing noon
       takes away is an ask that could not be met; at midnight the
       session turns 'unknown' and counts toward nothing, as capacity.ts
       already rules, and the card reads on. (18 Oct 2026) */
    const yesterday = newest.date < todayIso;
    const ownMorning = !!morningPain(logsOf(entries[newest.date]));
    const morningLeft = nowMin < MORNING_UNTIL;
    const readable = yesterday ? ownMorning && morningLeft : ownMorning || morningLeft;
    if (!readable) {
      return {
        state: 'waiting', sufficiency: 'early', recommendedLoad: null, checkIn: false,
        headline: yesterday ? 'Yesterday’s session is in.' : 'Today’s session is in.',
        recommendation: 'Pattern reads a session against a morning check-in that day and the next.',
      };
    }
    /* yesterday's session and no morning check-in yet today: the one
       tap that answers it is right here — from five, because a check-in
       at three is the night's and answers nothing */
    const mine = yesterday && !morningPain(logsOf(entries[todayIso]));
    const inBand = nowMin >= MORNING_FROM;
    return {
      state: 'waiting', sufficiency: 'early', recommendedLoad: null, checkIn: mine && inBand,
      headline: mine ? 'Yesterday’s session is waiting on this morning’s check-in.'
        : 'Today’s session is in.',
      recommendation: !mine ? 'Tomorrow morning’s check-in will show how it went.'
        : inBand ? 'One check-in shows how it went.'
        : 'A check-in once it’s morning shows how it went.',
    };
  }

  const level = currentLevel(gs);
  if (level) {
    if (level.step === 'up' && flareToday) {
      return {
        state: 'repeat', sufficiency: 'enough', checkIn: false,
        headline: 'Your recent sessions went fine.',
        recommendation: 'A similar session.',
        recommendedLoad: level.level + ' min' + atEffort(level.band),
        note: FLARE_NOTE,
      };
    }
    if (level.step === 'up') {
      return {
        state: 'repeat', sufficiency: 'enough', checkIn: false,
        headline: 'Your recent sessions went fine.',
        recommendation: 'A similar session, or a little longer.',
        recommendedLoad: level.level + '–' + level.next + ' min' + atEffort(level.band),
      };
    }
    if (level.step === 'hold') {
      return {
        state: 'lighter', sufficiency: 'enough', checkIn: false,
        headline: 'Your last session was followed by a harder next morning.',
        recommendation: 'The same length again, rather than longer.',
        recommendedLoad: 'Up to ' + level.level + ' min' + atEffort(level.band),
      };
    }
    return {
      state: 'lighter', sufficiency: 'enough', checkIn: false,
      headline: 'Your recent sessions were mostly followed by a harder next morning.',
      recommendation: 'A little less for now, then building back up.',
      recommendedLoad: 'Around ' + level.next + ' min' + easier(level.band),
    };
  }

  /* short of a level: the newest known session speaks, and the count
     says how far the baseline is */
  const known = gs.filter((s) => s.outcome === 'fine' || s.outcome === 'harder');
  const lastKnown = known[known.length - 1];
  const more = Math.max(1, CAPACITY_MIN_SESSIONS - known.length);
  const moreWords = more === 1 ? '1 more session' : more + ' more sessions';
  if (lastKnown && lastKnown.outcome === 'harder') {
    return {
      state: 'lighter', sufficiency: 'early', recommendedLoad: null, checkIn: false,
      headline: 'Your last session was followed by a harder next morning.',
      recommendation: 'The same length again, rather than longer.',
    };
  }
  return {
    state: 'learning', sufficiency: known.length ? 'early' : 'none', recommendedLoad: null, checkIn: false,
    headline: lastKnown ? 'Your last session went fine.' : 'Still learning how your sessions go.',
    recommendation: moreWords + ' with a morning check-in that day and the next, and Pattern will have an answer.',
  };
}
