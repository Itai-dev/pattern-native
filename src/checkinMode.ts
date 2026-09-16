/**
 * Which check-in the pain step leads with — the number alone, or the
 * number and then where it hurts and the rest — inferred from what the
 * person actually did last time, never from a settings page.
 *
 * "As much or as little as I can today" is the ask, and a setting is the
 * wrong answer to it: on a bad day nobody opens Profile to turn the
 * questions off, they just stop answering them, and on a good week they
 * start again. So the flow watches. Three quick check-ins in a row and
 * Log it leads; one walk into the details and Continue leads next time.
 * (Until 16 Sep 2026 a two-segment switch on the pain step let a person
 * make this choice by hand; it duplicated the two buttons beneath it and
 * went. chooseMode stays for the day a control wants it back.)
 * The learned mode is the same decision made by
 * hand, for the person who knows today already.
 *
 * WHAT THIS CHANGES AND WHAT IT DOES NOT. Only which of the two buttons
 * is filled. Both are always there, the record written is the same
 * either way, and a pain-only check-in is complete under either lead.
 * Nothing here is a streak: the count exists to decide a button, is
 * never shown, and resets the moment it has done its job.
 *
 * `mode` is null until the record has said something — the app's own
 * default then applies (the number leads, except in the evening, when
 * the limitation question leads because intensity and cost are the two
 * numbers the record is for). A learned or chosen mode overrides that
 * evening rule: three "Just the number"s in the evening are a person
 * declining the question, and the button should stop asking.
 */
import { QUICK_DEFAULT_AFTER } from './thresholds';

export type CheckinMode = 'quick' | 'detailed';

export interface ModeState {
  /** null = nothing learned yet; the app's default applies */
  mode: CheckinMode | null;
  /** consecutive quick check-ins since the last detailed one or the
   *  last choice by hand. A counter for a decision, never a display. */
  quickRun: number;
}

export const PREF_CHECKIN_MODE = 'checkin.mode';
export const MODE_DEFAULT: ModeState = { mode: null, quickRun: 0 };

/** what a finished check-in teaches: quick counts toward quick, and
 *  detailed decides at once — a person who just walked the details
 *  wants them offered again */
export function afterCheckin(s: ModeState, outcome: CheckinMode): ModeState {
  if (outcome === 'detailed') return { mode: 'detailed', quickRun: 0 };
  const run = s.quickRun + 1;
  return { mode: run >= QUICK_DEFAULT_AFTER ? 'quick' : s.mode, quickRun: run };
}

/** the switch: chosen by hand, and the run starts over — a choice is
 *  not something three check-ins should quietly undo */
export function chooseMode(mode: CheckinMode): ModeState {
  return { mode, quickRun: 0 };
}

/** the stored state, or the default when the pref is missing or junk */
export function cleanModeState(raw: unknown): ModeState {
  if (!raw || typeof raw !== 'object') return MODE_DEFAULT;
  const r = raw as { mode?: unknown; quickRun?: unknown };
  const mode = r.mode === 'quick' || r.mode === 'detailed' ? r.mode : null;
  const run = typeof r.quickRun === 'number' && isFinite(r.quickRun) && r.quickRun >= 0
    ? Math.floor(r.quickRun) : 0;
  return { mode, quickRun: run };
}
