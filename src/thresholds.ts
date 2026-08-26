/**
 * Every number that decides what Pattern is willing to say out loud.
 *
 * They live together, named, in one file for one reason: a threshold
 * buried in the code that renders a finding is a threshold nobody can
 * argue with. These are product safeguards, not claims of statistical
 * significance, and they were chosen to be argued with — so the argument
 * needs somewhere to happen.
 *
 * The rule they enforce, in one line: Pattern says nothing until the same
 * difference has shown up in enough observations, at both ends of a
 * factor, at a size worth a sentence, in the same direction across the
 * record.
 *
 * Why these values. With eight observations per group and a within-person
 * pain SD of 1.5–2.0, the standard error of the difference between two
 * group means is 0.75–1.0 points. A 1.5-point threshold therefore sits at
 * roughly z = 1.5–2.0, so an unlucky-but-meaningless difference clears it
 * about 5–10% of the time per comparison. Comparing only the extreme
 * levels holds the number of comparisons at two per factor per relation
 * instead of nine, and requiring the direction to survive a split of the
 * record removes more.
 *
 * For contrast, the rule this replaced — four observations per group and
 * a one-point difference — sits BELOW one standard error, and fires on
 * noise 35–43% of the time per comparison. Across the comparisons a
 * protocol generates, a spurious finding was close to guaranteed.
 *
 * None of that makes a surviving finding true. It makes it worth showing.
 */

/* ── the exposure rule (used by the engine, Step 5) ─────────── */

/** paired observations required in EACH compared group */
export const PATTERN_MIN_N = 8;

/** points of mean daily pain a difference must reach to be worth a card */
export const PATTERN_MIN_DELTA = 1.5;

/** observations required per group, per half, for the stability check */
export const PATTERN_HALF_MIN_N = 3;

/** Optional second gate: also require the difference to clear
 *  k × the person's own within-person SD. 0 disables it.
 *  Try 0.5 if the noise harness shows the flat 1.5 is too permissive for
 *  high-variability users — it is one line, deliberately. */
export const PATTERN_SD_MULTIPLIER = 0;

/** never a list: only the single strongest surviving finding is shown */
export const PATTERN_MAX_CARDS = 1;

/* ── descriptive gates (no inference involved) ──────────────── */

/** under this, the record shows itself and draws no comparisons */
export const LIMITED_RECORD_DAYS = 7;

/** first-half vs second-half comparison needs this many logged days */
export const HALVES_MIN_DAYS = 14;

/** Harder / easier days are the outer terciles of a person's own daily
 *  averages, with the middle third discarded. Below this many logged days
 *  the terciles are noise wearing a label. */
export const TERCILE_MIN_DAYS = 21;

/** ...and if the two tercile boundaries sit closer than this, the person's
 *  days are not meaningfully different from each other and the section
 *  does not render at all. */
export const TERCILE_MIN_SPREAD = 1.5;

/* ── time of day ────────────────────────────────────────────── */

/** check-ins a band needs before it may be compared with another band */
export const BAND_MIN_CHECKINS = 5;

/** ...spread across at least this many distinct days, so forty check-ins
 *  from one sleepless night cannot look like a pattern */
export const BAND_MIN_DAYS = 3;

/** Points between the first and the latest check-in of a single day
 *  before Today is willing to call the day higher or lower rather than
 *  about the same.
 *
 *  Two, not one, and the reason is the same arithmetic as above: the
 *  within-person pain SD is 1.5–2.0 points, so the gap between two single
 *  self-reports taken hours apart is inside the noise until it reaches
 *  about that size. A one-point move is a person rounding differently at
 *  lunchtime, and a screen that calls it a rise teaches them to read
 *  rounding as a change.
 *
 *  This decides a WORD on Today, never a stored value: the sentence is
 *  computed from the two numbers on screen and thrown away. */
export const DAY_SHAPE_MIN_DELTA = 2;

/* ── from a flag to a question ───────────────────────────────
   A chip says "sleep made it worse today". That is an attribution — your
   reading of your own day — and it can never be checked against anything,
   because you only tick it when the answer is already yes. There are no
   good-sleep days in a list of days you blamed sleep.

   What it CAN do is point at what is worth actually measuring. Flag the
   same thing enough times and Pattern offers to ask about it properly:
   a graded question, every day, whether or not it seems relevant that
   morning. That is the version with something to compare against. */

/** flags of one factor before Pattern offers to test it */
export const IMPACT_PROMOTE_MIN = 6;

/** ...counted over this many days back, so an old run of flags does not
 *  keep suggesting something that stopped mattering months ago */
export const IMPACT_PROMOTE_WINDOW = 21;

/* ── observation protocols ──────────────────────────────────── */

/** factors active at once. Two is the whole point: broad underneath,
 *  narrow for the user. */
export const PROTOCOL_FACTOR_COUNT = 2;

/** days from a protocol's start to its first review. A review point, not
 *  a promise that a conclusion will be available. */
export const PROTOCOL_REVIEW_DAYS = 14;

/** logged days before the hypothesis setup is offered — a person with no
 *  record has nothing to form a hypothesis about */
export const HYPOTHESIS_OFFER_AFTER_DAYS = 7;

/* ── Apple Health context ────────────────────────────────────
   The same person, the same 0–10 pain scale, and the same question — do
   two groups of days differ — so the same arithmetic applies. What
   changes is the exposure: measured by a sensor rather than self-rated,
   split at the person's own distribution rather than at named levels.

   Groups are the OUTER TERCILES of the person's own factor values with
   the middle third discarded, the same construction harder/easier days
   already use: a median split puts near-identical days on opposite
   sides of the line, and the middle third is exactly the days that are
   not evidence either way. */

/** distinct paired days (factor value AND the right pain window on the
 *  same person-day) before any comparison is attempted */
export const HEALTH_MIN_PAIRED_DAYS = 14;

/** Days required in EACH tercile group. Five, not the protocol's eight:
 *  with a within-person daily-pain SD of 1.5–2.0, two groups of five have
 *  a difference SE of 0.95–1.26, so the 1.5-point delta below sits at
 *  z ≈ 1.2–1.6 — a noise-only difference clears it roughly 6–12% of the
 *  time per comparison, and there are at most four health comparisons,
 *  each user-confirmed, never a scan. Eight per group would need ~24
 *  paired mornings under a tercile split — most of a month of joint
 *  coverage before Pattern could say anything, which fails the person
 *  the feature exists for. The looser gate is priced, not overlooked. */
export const HEALTH_MIN_GROUP_DAYS = 5;

/** points of mean pain between the groups — the same bar as the
 *  protocol rule, for the same reason */
export const HEALTH_MIN_DELTA = PATTERN_MIN_DELTA;

/** The factor itself must differ meaningfully between the groups, or the
 *  comparison is noise sorted into piles. Group MEANS must sit at least
 *  this far apart, per factor kind. */
export const HEALTH_SLEEP_MIN_SPREAD_MINUTES = 60;
export const HEALTH_STEPS_MIN_SPREAD = 2000;
export const HEALTH_ENERGY_MIN_SPREAD_KCAL = 150;

/** days of the recent record the foreground sync re-derives on each
 *  open — Health data arrives late (a watch syncs when it syncs), so
 *  recent days are recomputed rather than trusted */
export const HEALTH_RESYNC_DAYS = 10;

/** how far back the first sync reaches. Ninety days is the span the
 *  report and pager already treat as the working record; anything older
 *  is History, and a full-history HealthKit query is cost without a
 *  question to answer. */
export const HEALTH_BACKFILL_DAYS = 90;
