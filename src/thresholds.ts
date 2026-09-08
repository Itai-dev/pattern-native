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

/** How far back a check-in may be added after the fact. A fortnight:
 *  recalling yesterday or the weekend is memory doing its normal job;
 *  recalling last month is reconstruction wearing memory's clothes, and
 *  a record padded with reconstructions stops being the thing worth
 *  showing a clinician. The capture timestamp on every moment keeps
 *  even the fortnight honest — a recalled entry is permanently
 *  distinguishable from one made in the moment. */
export const RETRO_CHECKIN_MAX_DAYS = 14;

/** A place or word is called DIFFERENT between the record's two ends
 *  only when the share of days carrying it differs by at least half.
 *  Half, because the smallest tercile this can run on is 7 days a side
 *  (21-day gate above): a gap of 0.5 means at least 4 days of
 *  separation there, which survives one oddball day either side. A
 *  smaller gap prints coincidences with a heading over them. */
export const TERCILE_CONTRAST_MIN_SHARE_GAP = 0.5;

/** ...and the dominant end must carry it on at least this many days.
 *  Three, so a word used twice on hard days and never on easy ones —
 *  which clears the share gap easily — cannot be presented as a
 *  difference between kinds of days. Two of anything is an anecdote. */
export const TERCILE_CONTRAST_MIN_DAYS = 3;

/* ── the chart's grain ──────────────────────────────────────── */

/** Above this many days in view, the pain chart draws weeks rather
 *  than days. One column per day at 180 days is about 1.5 points wide
 *  on a phone — a texture, not a bar, and a tap target nobody can hit.
 *  Sixty: two months of daily bars still read, and the first record to
 *  outgrow it is a quarter old, which is when a week is the honest
 *  unit anyway. A week's bar is the MEAN of its logged days only, and a
 *  week with none stays a gap. */
export const CHART_WEEKLY_ABOVE_DAYS = 60;

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

/* ── early looks ─────────────────────────────────────────────
   Below the gates nothing may be CLAIMED — but a person who connected
   Health on day one and sees nothing for a fortnight learns that the
   connection does nothing. An early look is the same two groups,
   drawn, with words that say "too few days to call" beside them; the
   picture exists, the sentence does not. It changes only when a day
   is added, like everything on the screen. */

/** paired days before the picture is drawn at all. Four: two a side,
 *  which is the smallest thing that is a comparison and not a day */
export const EARLY_MIN_PAIRED_DAYS = 4;

/** days in each half of an early look. Two — a single day is an
 *  anecdote wearing a bar */
export const EARLY_MIN_GROUP_DAYS = 2;

/** dose pairs before the before/after picture is drawn. Three: each
 *  pair is its own control, so the picture is worth showing sooner */
export const DOSE_EARLY_MIN_PAIRS = 3;

/** The factor itself must differ meaningfully between the groups, or the
 *  comparison is noise sorted into piles. Group MEANS must sit at least
 *  this far apart, per factor kind. */
export const HEALTH_SLEEP_MIN_SPREAD_MINUTES = 60;
export const HEALTH_STEPS_MIN_SPREAD = 2000;
export const HEALTH_ENERGY_MIN_SPREAD_KCAL = 150;
/** Workout-load groups (total workout minutes on the day) must differ by
 *  at least this much. Twenty minutes: below that, a "harder" and a
 *  "lighter" workout day are one stretching session apart, and the
 *  comparison is rounding sorted into piles. */
export const HEALTH_WORKOUT_MIN_SPREAD_MINUTES = 20;
/** upright-time groups must differ by at least this much. An hour:
 *  Watch stand-time credits a minute for very little, so less than an
 *  hour between a "less upright" and a "more upright" day is posture
 *  noise, not a different kind of day. */
export const HEALTH_STAND_MIN_SPREAD_MINUTES = 60;

/* ── "than your usual" on the day's context lines ────────────
   Descriptive comparison of ONE day's sensor value against the person's
   own recent baseline — Apple Health's card grammar. It never touches
   pain and never pairs with it in a sentence: the conjunction would be
   the claim, and one night is one coin flip. */

/** covered days required before "your usual" is a real thing to compare
 *  against — below a week it is an anecdote average */
export const CONTEXT_USUAL_MIN_DAYS = 7;

/** how far back the baseline reaches. Four weeks: long enough to be
 *  stable, short enough to still be "your usual" and not "your spring" */
export const CONTEXT_USUAL_WINDOW_DAYS = 28;

/** minutes a night must differ from the baseline before the deviation
 *  earns words — under this, "more than your usual" is describing
 *  rounding */
export const CONTEXT_SLEEP_USUAL_DELTA_MIN = 45;

/** fraction a day's steps must differ from the baseline before the
 *  deviation earns words */
export const CONTEXT_STEPS_USUAL_RATIO = 0.25;

/** minutes of upright time a day must differ from the baseline before
 *  the deviation earns words — same reasoning as sleep's floor */
export const CONTEXT_STAND_USUAL_DELTA_MIN = 45;

/** days of the recent record the foreground sync re-derives on each
 *  open — Health data arrives late (a watch syncs when it syncs), so
 *  recent days are recomputed rather than trusted */
export const HEALTH_RESYNC_DAYS = 10;

/** how far back the first sync reaches. Ninety days is the span the
 *  report and pager already treat as the working record; anything older
 *  is History, and a full-history HealthKit query is cost without a
 *  question to answer. */
export const HEALTH_BACKFILL_DAYS = 90;

/* ── medication doses, from the Health app ───────────────────
   A dose is an instant, so it is not split into groups of days: each
   dose is paired with the check-in shortly before it and the first
   one a while after, and the comparison is the mean of those paired
   differences. The control for a dose is the person's own number an
   hour earlier — which is also why the result is expected to read
   "lower after" for almost anything, and why the card says so. */

/** how long before a dose the "before" check-in may be. Three hours:
 *  a number from the morning says nothing about the state a lunchtime
 *  tablet was taken in. */
export const DOSE_BEFORE_WINDOW_MIN = 180;

/** the earliest an "after" check-in counts. Forty-five minutes: an
 *  oral analgesic takes thirty to sixty minutes to do anything, and a
 *  check-in five minutes after a tablet measures the tablet's absence. */
export const DOSE_AFTER_MIN_MIN = 45;

/** the latest an "after" check-in counts. Six hours: past that the day
 *  has moved on, and a second dose or a night's sleep is the better
 *  explanation of whatever the number is. */
export const DOSE_AFTER_MAX_MIN = 360;

/** paired doses before any sentence. Eight, the protocol's minimum: a
 *  before/after pair is a within-person difference that carries its
 *  own control, so the paired-difference SD is well under the daily
 *  SD (about 1.2 against 1.5–2.0) and eight pairs put the 1.5-point
 *  bar at z ≈ 3.5 — the gate is far stricter than the tercile one
 *  and cheap in days, since each pair is one afternoon. What it does
 *  not buy is causation; see DOSE_NON_CAUSATION. */
export const DOSE_MIN_PAIRS = PATTERN_MIN_N;

/* ── when to ask: the reminder plan learned from Health ──────
   A fixed time is the wrong time for most of the questions this
   record asks. These decide how far Health may move a prompt, when an
   "after" prompt lands, and how many a day may carry at all. */

/** prompts a day, ceiling, whatever Health suggests. Five: three slots
 *  the person can set plus two "after" prompts on a full day, and a
 *  record kept under more than that is a record abandoned */
export const PROMPTS_MAX_PER_DAY = 5;

/** minutes between two prompts, minimum. Ninety: closer than that and
 *  the second is a nag about the first, and a check-in within that
 *  span already answers it */
export const PROMPT_MIN_GAP_MIN = 90;

/** the waking window an "after" prompt may land in — outside it, a
 *  learned habit stays a habit and not a 5 a.m. notification */
export const PROMPT_EARLIEST_MIN = 6 * 60;
export const PROMPT_LATEST_MIN = 23 * 60;

/** nights of the recent record used to learn wake and bed times, and
 *  days used for dose habits — two weeks: current, and enough for a
 *  median to mean something */
export const PROMPT_SLEEP_DAYS = 14;

/** nights (or dose days) before a learned time is trusted over the
 *  time the person set — five, the same floor the context lines use */
export const PROMPT_MIN_DAYS = 5;

/** minutes after the usual wake before the morning asks. Thirty: up,
 *  moving, and the night still fresh — the morning pain the sleep
 *  comparison reads */
export const PROMPT_AFTER_WAKE_MIN = 30;

/** minutes before the usual bedtime for the evening prompt. Forty-five:
 *  the day is over and the phone is still in hand */
export const PROMPT_BEFORE_BED_MIN = 45;

/** minutes after a workout usually ends. Forty-five: showered, sat
 *  down, and the body's first word on it in */
export const PROMPT_AFTER_WORKOUT_MIN = 45;

/** weeks of the same weekday looked at, and how many of them need a
 *  workout before that weekday earns an "after your workout" prompt.
 *  Two of four: a habit, not a one-off, and learnable in a fortnight */
export const PROMPT_WORKOUT_WEEKS = 4;
export const PROMPT_MIN_RECURRENCE = 2;

/** minutes after a usual dose time. Sixty: past the DOSE_AFTER_MIN_MIN
 *  floor with margin, so the check-in it invites can be the "after"
 *  half of a dose pair */
export const PROMPT_AFTER_DOSE_MIN = 60;

/** how far apart two learned dose times must be to be two habits */
export const PROMPT_DOSE_SEPARATION_MIN = 120;

/** how long after a workout ends the pain step still mentions it.
 *  Three hours: the window the after-workout question is about; past
 *  it the workout is the day's context, not the moment's */
export const NOW_HINT_WORKOUT_MIN = 180;

/** background prompts a day — the ones fired at the moment a workout
 *  ends or a night is in, on binaries with the entitlement. Two: a
 *  morning and a workout, and the planned prompts already carry the
 *  rest of the day */
export const BG_PROMPTS_MAX_PER_DAY = 2;

/** minutes after which a delivered sample is history, not a moment.
 *  Forty-five: past it a workout the store handed over late is context
 *  for the day and the planned prompt has already done its job */
export const BG_PROMPT_STALE_MIN = 45;

/** how far above the day's earlier check-ins a number must be before
 *  "where" is asked again that day. Two points: a change worth
 *  locating, not the slider's ordinary drift */
export const WHERE_REASK_DELTA = 2;
