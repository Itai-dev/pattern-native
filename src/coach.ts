/**
 * The coach — a roadmap back to the person's goal, and the achievements
 * along it. Pure domain: entries, Health days, the goal and today in.
 *
 * WHY THIS EXISTS (21 Oct 2026). Getting back to an activity takes
 * months, and the activity card says only the next step. The founder
 * asked for what the apps that keep people going have — milestones and
 * achievements — on one condition: it motivates doing more, responsibly,
 * and never makes pain the thing being scored. AGENTS.md, "A coach
 * rewards the doing, never the pain", is the rule; this file is where
 * it is enforced.
 *
 * EARNED BY WHAT YOU DID. Every medal is a session, a choice or a total:
 * a session at the length the plan suggested, a hold after a harder
 * morning, a report made, an experiment finished, ten sessions. No medal
 * reads a pain value, a pain trend or a count of check-ins, so there is
 * never a reason to answer a check-in lower. The plan itself does read
 * the next morning — that is its safety, capacity.ts — so a length
 * milestone arrives when the plan gets there, which a person cannot
 * hurry except by sessions that go fine.
 *
 * GOING PAST THE PLAN EARNS NOTHING. A length milestone needs a session
 * no longer than the suggestion at the time (plus COACH_PLAN_GRACE_MIN),
 * so the forty-five minute medal cannot be had by running forty-five
 * when the plan said thirty. The rule rewards pacing, not pushing.
 *
 * NOTHING RESETS. Totals are cumulative and never consecutive; a medal,
 * once earned, keeps its date for ever; a quiet week takes nothing
 * away. There are no streaks: a planned rest day would break one, so a
 * streak argues against the pacing this app exists for.
 *
 * THE SUGGESTION A SESSION WAS MEASURED AGAINST is replayed, not
 * stored: for each session, capacity.ts's own activityLevel over the
 * sessions before it, in the same activity-and-effort group. The coach
 * and the activity card therefore can never disagree about what the
 * plan said.
 */
import { Entries, mondayOf } from './model';
import { HealthDay } from './health/types';
import { EffortBand, Session, StepKind, activityLevel, sessions } from './health/capacity';
import { RecoveryGoal, goalMatches } from './recovery';
import {
  COACH_DEFAULT_WEEKLY, COACH_ON_PLAN_COUNT, COACH_PLAN_GRACE_MIN, COACH_SESSION_TOTALS,
  COACH_STAGE_MINUTES, COACH_STEADY_START_MIN, COACH_WEEK_TOTALS,
} from './thresholds';

/** a session with what the plan said before it */
export interface PlannedSession extends Session {
  /** the suggested length before this session, or null with no plan yet */
  suggested: number | null;
  /** what kind of step that suggestion was */
  step: StepKind | null;
  /** no plan yet, or no longer than the suggestion plus the grace */
  onPlan: boolean;
}

/**
 * Every session with the suggestion it was measured against, oldest
 * first. The group is capacity.ts's: activity and effort band, a session
 * without effort in a group of its own.
 */
export function plannedSessions(all: Session[]): PlannedSession[] {
  const seen: Record<string, Session[]> = {};
  return all.map((s) => {
    const k = s.activity + '|' + (s.band || '');
    const prior = seen[k] || [];
    const lvl = prior.length ? activityLevel(s.activity, s.band, prior) : null;
    seen[k] = prior.concat([s]);
    const suggested = lvl ? lvl.next : null;
    return {
      ...s,
      suggested,
      step: lvl ? lvl.step : null,
      onPlan: suggested == null || s.minutes <= suggested + COACH_PLAN_GRACE_MIN,
    };
  });
}

/* ── words ──────────────────────────────────────────────────── */

/** the goal's sessions as the screen says them: "run" / "runs" */
const NOUNS: Record<string, [string, string]> = {
  running: ['run', 'runs'],
  walking: ['walk', 'walks'],
  cycling: ['ride', 'rides'],
  swimming: ['swim', 'swims'],
  'strength training': ['strength session', 'strength sessions'],
  pilates: ['Pilates session', 'Pilates sessions'],
};

function nouns(goal: RecoveryGoal): [string, string] {
  return (goal.activity && NOUNS[goal.activity]) || ['session', 'sessions'];
}

function capital(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/* ── achievements ───────────────────────────────────────────── */

/** what the medal is made of — the KIND of thing done, never its rank */
export type MedalKind = 'roadmap' | 'pacing' | 'finding' | 'time';
export type MedalIcon = 'activity' | 'number' | 'flag' | 'hold' | 'ease' | 'plan' | 'report' | 'answer' | 'weeks';

export interface Achievement {
  id: string;
  kind: MedalKind;
  icon: MedalIcon;
  /** the number on a 'number' medal */
  num?: string;
  title: string;
  /** what earns it, in one or two sentences */
  body: string;
  /** the date it was earned, or null — never "lost" */
  earnedOn: string | null;
  /** an unearned total's count so far, in words */
  sofar?: string;
}

export interface CoachExtras {
  /** the first day a report was made, if ever */
  reportOn?: string | null;
  /** the first day an experiment reached an answer, if ever */
  answerOn?: string | null;
}

export interface Stage {
  id: string;
  title: string;
  state: 'done' | 'now' | 'next';
  /** the day it was reached, for a done stage */
  reachedOn: string | null;
  /** the stage's own line under the title */
  sub: string;
  /** the goal itself, drawn with a flag */
  goal: boolean;
}

export interface Roadmap {
  title: string;
  stages: Stage[];
  /** the current stage's next session, or null before there is a plan */
  next: { minutes: number; band: EffortBand | null; step: StepKind } | null;
  /** position, for the Today line: "Easy runs, building to 45 min" */
  nowLine: string | null;
}

export interface CoachView {
  roadmap: Roadmap | null;
  achievements: Achievement[];
}

function firstWhere<T>(xs: T[], f: (x: T, i: number) => boolean): T | undefined {
  for (let i = 0; i < xs.length; i++) if (f(xs[i], i)) return xs[i];
  return undefined;
}

/** the nth (1-based) matching item's date, or null */
function nthDate(xs: PlannedSession[], n: number, f: (s: PlannedSession) => boolean): string | null {
  let c = 0;
  for (const s of xs) if (f(s) && ++c === n) return s.date;
  return null;
}

/**
 * The roadmap and every achievement. The roadmap is null without a goal
 * (never asked, or skipped — a skip is not a goal of "nothing").
 */
export function coachView(
  entries: Entries, health: Record<string, HealthDay>, goal: RecoveryGoal | null,
  todayIso: string, extras: CoachExtras = {}
): CoachView {
  const all = plannedSessions(sessions(entries, health, todayIso));
  const achievements: Achievement[] = [];
  let roadmap: Roadmap | null = null;

  if (goal && goal.activity) {
    const [one, many] = nouns(goal);
    const since = goal.setOn || '';
    const mine = all.filter((s) => goalMatches(goal, s.activity) && s.date >= since);
    /* easy, or no effort recorded: many workouts carry no effort, and a
       roadmap that never moves for them would be worse than counting an
       unrated session at the gentlest band. The copy says so. */
    const gentle = mine.filter((s) => s.band === 'easy' || s.band == null);

    const first = mine[0];
    achievements.push({
      id: 'first', kind: 'roadmap', icon: 'activity',
      title: 'First ' + one + ' back',
      body: 'Your first ' + one + ' after setting your goal.',
      earnedOn: first ? first.date : null,
    });

    const lengths = COACH_STAGE_MINUTES.map((m) => {
      const s = firstWhere(gentle, (x) => x.onPlan && x.minutes >= m);
      const a: Achievement = {
        id: 'len' + m, kind: 'roadmap', icon: 'number', num: String(m),
        title: m + ' minutes',
        body: 'A ' + m + '-minute ' + one + ', easy or with no effort recorded, no longer than the plan suggested.',
        earnedOn: s ? s.date : null,
      };
      achievements.push(a);
      return a;
    });
    const top = lengths[lengths.length - 1];

    const steadyS = top.earnedOn
      ? firstWhere(mine, (x) => x.band === 'moderate' && x.date >= top.earnedOn!
        && (x.suggested == null ? x.minutes <= COACH_STEADY_START_MIN + COACH_PLAN_GRACE_MIN : x.onPlan))
      : undefined;
    const topMin = COACH_STAGE_MINUTES[COACH_STAGE_MINUTES.length - 1];
    const steady: Achievement = {
      id: 'steady', kind: 'roadmap', icon: 'activity',
      title: 'First steady ' + one,
      body: 'A ' + one + ' at a moderate effort, starting short again at up to ' + COACH_STEADY_START_MIN
        + ' minutes. The plan offers it once easy ' + many + ' reach ' + topMin + '.',
      earnedOn: steadyS ? steadyS.date : null,
    };
    achievements.push(steady);

    const target = goal.weeklySessions || COACH_DEFAULT_WEEKLY;
    let goalOn: string | null = null;
    if (steady.earnedOn) {
      const weeks: Record<string, PlannedSession[]> = {};
      mine.filter((s) => s.date >= steady.earnedOn!).forEach((s) => {
        const w = mondayOf(s.date);
        (weeks[w] = weeks[w] || []).push(s);
      });
      const hit = Object.keys(weeks).sort().map((w) => weeks[w])
        .filter((ws) => ws.length >= target && ws.every((s) => s.onPlan))[0];
      goalOn = hit ? hit[target - 1].date : null;
    }
    achievements.push({
      id: 'goal', kind: 'roadmap', icon: 'flag',
      title: 'Back to ' + goal.label,
      body: target + ' ' + many + ' in one week, each no longer than the plan suggested, after your first steady ' + one + '.',
      earnedOn: goalOn,
    });

    /* the roadmap is the roadmap medals, laid out as a path */
    const marks = lengths.map((a, i) => ({
      id: a.id, title: capital(many) + ' · ' + COACH_STAGE_MINUTES[i] + ' min', a,
    })).concat([
      { id: 'steady', title: 'Steady ' + many, a: steady },
      { id: 'goal', title: 'Back to ' + goal.label, a: achievements[achievements.length - 1] },
    ]);
    const nowIdx = marks.findIndex((m) => !m.a.earnedOn);
    const stages: Stage[] = marks.map((m, i) => {
      const state: Stage['state'] = m.a.earnedOn ? 'done' : i === nowIdx ? 'now' : 'next';
      let sub: string;
      if (state === 'done') sub = 'Reached';
      else if (m.id === 'steady') sub = 'From ' + COACH_STEADY_START_MIN + ' min, once ' + many + ' reach ' + topMin;
      else if (m.id === 'goal') sub = target + ' ' + many + ' a week, on plan';
      else sub = state === 'now' ? 'Building to ' + m.id.slice(3) + ' min' : 'Up to ' + m.id.slice(3) + ' min';
      return { id: m.id, title: m.title, state, reachedOn: m.a.earnedOn, sub, goal: m.id === 'goal' };
    });

    /* the next session for the stage they are on: the gentle group's
       current level, or the steady group's once easy has topped out */
    let next: Roadmap['next'] = null;
    const nowStage = stages[nowIdx];
    if (nowStage) {
      const steadyPhase = nowStage.id === 'steady' || nowStage.id === 'goal';
      const pool = steadyPhase ? mine.filter((s) => s.band === 'moderate') : gentle;
      /* the newest group in the pool: easy and unrated are separate
         groups in capacity.ts, so follow whichever was used last */
      const newest = pool[pool.length - 1];
      if (newest) {
        const group = pool.filter((s) => s.band === newest.band);
        const lvl = activityLevel(newest.activity, newest.band, group);
        if (lvl) next = { minutes: lvl.next, band: lvl.band, step: lvl.step };
      } else if (steadyPhase) {
        next = { minutes: COACH_STEADY_START_MIN, band: 'moderate', step: 'up' };
      }
    }
    roadmap = {
      title: 'Back to ' + goal.label,
      stages,
      next,
      nowLine: nowStage ? nowStage.title + (nowStage.state === 'now' && nowStage.id.indexOf('len') === 0
        ? ', building to ' + nowStage.id.slice(3) + ' min' : '') : 'Goal reached',
    };
  }

  /* pacing — any activity, the plan as it was at the time */
  const held = firstWhere(all, (s) => s.step === 'hold' && s.suggested != null && s.onPlan);
  achievements.push({
    id: 'held', kind: 'pacing', icon: 'hold', title: 'Held the line',
    body: 'Kept a session the same length after a harder morning. Holding is part of the plan, not a step back.',
    earnedOn: held ? held.date : null,
  });
  const eased = firstWhere(all, (s) => s.step === 'ease' && s.suggested != null && s.onPlan);
  achievements.push({
    id: 'eased', kind: 'pacing', icon: 'ease', title: 'Eased back',
    body: 'Took the shorter session the plan suggested, to build up again from there.',
    earnedOn: eased ? eased.date : null,
  });
  achievements.push({
    id: 'onplan', kind: 'pacing', icon: 'plan', title: 'On plan',
    body: COACH_ON_PLAN_COUNT + ' sessions no longer than the plan suggested. They don’t have to be in a row.',
    earnedOn: nthDate(all, COACH_ON_PLAN_COUNT, (s) => s.suggested != null && s.onPlan),
  });

  /* finding out */
  achievements.push({
    id: 'report', kind: 'finding', icon: 'report', title: 'For your clinician',
    body: 'Made your first report to take to an appointment.',
    earnedOn: extras.reportOn || null,
  });
  achievements.push({
    id: 'answer', kind: 'finding', icon: 'answer', title: 'First answer',
    body: 'Finished an experiment and got an answer, whichever way it went.',
    earnedOn: extras.answerOn || null,
  });

  /* over time — totals, never in a row. Every earned total shows, and
     the next one up; the rest stay out of sight rather than a wall of
     locked medals to chase. */
  const totals = (ids: number[], idp: string, icon: MedalIcon, count: number, dateOf: (n: number) => string | null,
    words: (n: number) => [string, string]) => {
    let shownNext = false;
    ids.forEach((n) => {
      const on = count >= n ? dateOf(n) : null;
      if (!on && shownNext) return;
      if (!on) shownNext = true;
      const [title, body] = words(n);
      achievements.push({
        id: idp + n, kind: 'time', icon, num: icon === 'number' ? String(n) : undefined, title, body,
        earnedOn: on, sofar: on ? undefined : count + ' so far',
      });
    });
  };
  totals(COACH_SESSION_TOTALS, 's', 'number', all.length, (n) => all[n - 1].date,
    (n) => [n + ' sessions', n + ' sessions in your record. Rest days in between never count against it.']);
  const weekStarts: string[] = [];
  const weekDone: string[] = [];
  all.forEach((s) => {
    const w = mondayOf(s.date);
    if (weekStarts.indexOf(w) < 0) { weekStarts.push(w); weekDone.push(s.date); }
  });
  totals(COACH_WEEK_TOTALS, 'w', 'weeks', weekStarts.length, (n) => weekDone[n - 1],
    (n) => [n + ' active weeks', n + ' weeks with at least one session. They don’t have to be in a row.']);

  return { roadmap, achievements };
}

/** the earned ids, for remembering what has been shown */
export function earnedIds(v: CoachView): string[] {
  return v.achievements.filter((a) => a.earnedOn).map((a) => a.id);
}

/**
 * The medal to show now: an earned one not yet seen, newest first.
 * With no memory at all (the first run after this shipped), nothing:
 * a person with months of record would otherwise open the app to a
 * stack of medals for things they did weeks ago. Those are in the list,
 * dated; only what is earned from here on arrives as a moment.
 */
export function unseenAchievement(v: CoachView, seen: string[] | null): Achievement | null {
  if (!seen) return null;
  const fresh = v.achievements.filter((a) => a.earnedOn && seen.indexOf(a.id) < 0);
  if (!fresh.length) return null;
  return fresh.slice().sort((a, b) => (a.earnedOn! < b.earnedOn! ? 1 : a.earnedOn! > b.earnedOn! ? -1 : 0))[0];
}

/** what the achievements do not mean — inside the list, at its top */
export const COACH_NOTE =
  'Earned by what you did and how you paced it — never by a pain number, so there is never a reason '
  + 'to answer lower. Nothing resets, nothing expires, and going past the plan earns nothing extra.';

/** what the roadmap does not mean — under the stages */
export const ROADMAP_NOTE =
  'Built from your own sessions: each one grows by at most a tenth, a harder morning holds it, and two '
  + 'ease it back. Staying on a stage a while is normal. A plan, not a promise, and not medical advice — '
  + 'check a big change with your clinician.';
