/**
 * Flare mode and somatic tracking: the words, kept apart from the screens.
 *
 * WHY A MODULE FOR COPY. Every sentence here is one a person reads at the
 * worst moment of their week, and several of them sit right on the line
 * between education and a medical claim. Kept as data, the line can be
 * tested: tools/test-flare.js fails the build if a sentence promises less
 * pain, names the pain "neuroplastic" or "in your head", or if a warning
 * sign stops routing to care. Scattered through JSX, those regressions
 * would arrive one innocent copy edit at a time.
 *
 * WHAT IS NOT HERE: a pain number. Flare mode never asks for a score and
 * somatic tracking never reports one, before or after. A practice that
 * ends "pain down by two" turns noticing into another way of measuring
 * pain, which is the monitoring it exists to loosen (docs/POSITIONING.md,
 * "Pain is information"). Nothing in this file is stored, either: the
 * answers shape the next screen and are gone when the sheet closes.
 */

/** said inside every screen that teaches, not once in a settings page */
export const NOT_ADVICE =
  'This is not medical advice and does not replace care. If something feels wrong, trust that and get it checked.';

/* ── the safety check ───────────────────────────────────────
   FIRST, before anything that could read as "this is nothing". The list
   is the common red flags for persistent musculoskeletal pain, worded as
   a person would notice them rather than as a clinician names them. Any
   one of them ends the routine on the care screen: a breathing exercise
   offered to someone with new leg weakness is a harm, however gently it
   is worded. */
export const WARNING_SIGNS: readonly string[] = [
  'New numbness, tingling or weakness in your legs or arms',
  'Numbness around your groin or buttocks, or a change in bladder or bowel control',
  'Pain after a fall, an accident or an injury',
  'Fever, chills or feeling generally unwell with the pain',
  'Chest pain, or trouble breathing',
  'Pain that is severe and constant, and does not ease with rest or any position',
];

export type FlareCheck = 'familiar' | 'different';

/** the answer to "is this your familiar pain?" — 'different' goes to care */
export const CHECK_OPTIONS: readonly { id: FlareCheck; label: string }[] = [
  { id: 'familiar', label: 'It’s my familiar pain, just louder' },
  { id: 'different', label: 'It’s new, or different from usual' },
];

export const CARE_TITLE = 'Get this checked';
export const CARE_BODY: readonly string[] = [
  'Something new or different deserves a person looking at it, not an app. Contact your doctor or an urgent care service today.',
  'If you have any of the warning signs, especially numbness around the groin, a change in bladder or bowel control, new weakness, or chest pain, call emergency services now.',
];

/* ── settle: a minute, eyes open ────────────────────────────
   Orienting rather than meditating. "Breathe and relax" fails exactly
   when it is needed — a person told to relax who cannot feels they are
   failing at that too. Looking around the room is something anyone can
   do with pain at any level. */
export const SETTLE_SECONDS = 60;
export const SETTLE_LINES: readonly string[] = [
  'Let your eyes move slowly around the room. Find three things you can see.',
  'Let your breath out be a little longer than your breath in. No need to get it right.',
  'Notice what is holding you up: the floor, the chair, the bed.',
];

/* ── somatic tracking: ninety seconds of noticing ───────────
   Where, then what it is like in plain words, then whether it moves.
   The words are sensations, not verdicts: "pressure" rather than
   "damage", "heat" rather than "inflammation". */
export const TRACK_SECONDS = 90;

export const TRACK_WHERE: readonly string[] = [
  'Back', 'Neck', 'Shoulders', 'Head', 'Hips', 'Legs', 'Arms', 'Stomach', 'Somewhere else',
];

export const TRACK_FEELS: readonly string[] = [
  'Pressure', 'Heat', 'Tightness', 'Tingling', 'Aching', 'Sharp', 'Buzzing', 'Something else',
];

export const TRACK_LINES: readonly string[] = [
  'Don’t try to change it yet. Just find its edges.',
  'Is it the same all the way through, or stronger in one spot?',
  'Watch it for a few breaths. Does it stay still, move, pulse, spread, or fade?',
  'See if you can look at it as a sensation, with curiosity, rather than as evidence that something is wrong.',
];

/** the close. It names what was practised, never what happened to the pain. */
export const TRACK_DONE =
  'You practised noticing a sensation without treating it as an emergency. That is the whole exercise, whatever the sensation did.';

/* ── what are you afraid this means? ────────────────────────
   Each reply says what a flare of FAMILIAR pain usually is, never that
   this one is harmless: the safety check above is what earns even that
   much, and only for familiar pain. */
export type FlareFear = 'damage' | 'forever' | 'plans' | 'other';

export const FEARS: readonly { id: FlareFear; label: string; reply: string }[] = [
  {
    id: 'damage',
    label: 'That I’ve damaged something',
    reply: 'A flare of pain you already know, without any of the warning signs, often comes from a sensitive system rather than new damage. Hurt and harm are not always the same thing.',
  },
  {
    id: 'forever',
    label: 'That it won’t stop',
    reply: 'Flares of familiar pain usually settle, even when it doesn’t feel like they will. Think of the last one: it ended.',
  },
  {
    id: 'plans',
    label: 'That it will wreck my day',
    reply: 'It may change the day, but it doesn’t have to take all of it. Something smaller than planned still counts.',
  },
  {
    id: 'other',
    label: 'Something else',
    reply: 'Name it to yourself, in words. A fear said plainly is often smaller than one left in the background.',
  },
];

/* ── one small thing, then leave the app ────────────────────
   The routine ends by pointing AWAY from Pattern. Checking the pain again
   every few minutes keeps the alarm on; twenty minutes of something that
   matters is the experiment. */
export const ACT_TITLE = 'One small thing for the next 20 minutes';
export const ACTIONS: readonly string[] = [
  'A slow, short walk',
  'Something with your hands',
  'Message or call someone',
  'Go back to what you were doing, gently',
];
export const ACT_BODY =
  'Pick one and do it. Try not to check how much it hurts every few minutes — that keeps the alarm on. Come back later if you want to add this flare to your record.';

/** the steps, in order. 'care' is reachable only from 'check'. */
export type FlareStep = 'check' | 'care' | 'settle' | 'track' | 'fear' | 'act';
export const FLARE_STEPS: readonly FlareStep[] = ['check', 'settle', 'track', 'fear', 'act'];

/** where the check answer leads — the one branch in the routine */
export function afterCheck(answer: FlareCheck, warningSign: boolean): FlareStep {
  return answer === 'different' || warningSign ? 'care' : 'settle';
}

/** the next step on the familiar path, or null at the end */
export function nextStep(step: FlareStep): FlareStep | null {
  if (step === 'care') return null;
  const i = FLARE_STEPS.indexOf(step);
  return i >= 0 && i < FLARE_STEPS.length - 1 ? FLARE_STEPS[i + 1] : null;
}
