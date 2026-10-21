# Redesign · 20 Oct 2026

*The founder asked for a major redesign: an app that feels active, like a
sports app, really clean and minimal; more precise pain tracking; a
clearer picture of where you are and what affects your pain through Apple
Health; the Watch included. This lifts the 18 Oct freeze on Today's
layout — the founder's call, not the team's. Mockups: the "Pattern
redesign" canvas (claude.ai artifact). Everything in "What this app
refuses to do" still holds.*

## What the research said

Four roles worked in parallel: forum and review research on people with
pain who train; a teardown of the closest apps; the clinical evidence on
measurement and Apple Health; a code audit of the app as it is.

**People judge a session by the next morning, not by a score.** Climbers
and runners go on when pain "settles"; the clinical form is the
pain-monitoring model — up to 5/10 during, settled by the next morning
(Silbernagel 2007). Pattern already reads the second rule and not the
first.

**Every wearable lacks an injured state.** "Since my injury, my 945 has
been rather demotivational." "The watch doesn't know you're rehabbing."
Readiness scores are distrusted, and an app that ignores Body Battery is
praised for it. A score that contradicts how you feel loses trust the
first time it does.

**Return-to-run plans jump too fast and ignore symptoms** ("insane jumps
in running time"; "doesn't adapt to any of your symptoms" — Runna
reviews). Pattern's step is at most about ten per cent, held after a
harder morning.

**Logging burden is what kills pain apps** (Bearable "super complex";
Manage My Pain praised because "it loads immediately so I can log… even
when I'm in a lot of pain"). On the wrist people want one tap, no typing.

**The white space.** Sports apps assume pain does not exist; pain apps
assume sport does not exist. Nobody reads the sessions a person already
logs against their next morning and says, plainly, what is going fine —
with no plan, no score, no account.

**Precision, where it pays:** a "pain during the session" rating after a
workout (optional, one tap); morning-stiffness duration only when
stiffness is tagged (>30 min is an inflammatory marker, Rudwaleit 2006).
Not a finer scale (the 0–10 NRS is the best-supported format), not sleep
stages (the Watch's weakest estimate), not HRV (not a surrogate for pain;
it invites a readiness score), not an acute:chronic load ratio
(discredited, and a readiness score by another name).

## The direction

Take the sports-app look — one family, big white tabular numerals, one
card, one action — and leave out its hero metric. The hero is minutes,
never a pain score.

**Today**
1. The rehab focus as the title: "Back to running · Right Achilles". An
   explicit injured state is what every wearable is missing.
2. When a session is waiting on this morning, the check-in IS the top
   card: "How is your Achilles this morning?" — the primary input.
3. Next step as the hero: "33 min · easy", one sentence of evidence, the
   not-medical-advice line, "Why?".
4. This week: seven pain squares (morning pain, the ramp) over seven
   white bars (session minutes). The "where am I" picture the phone app
   never had — the widget and Watch already draw it.

**Check-in** — context-aware, one screen. Morning: the body part, the
question, the number, optional stiffness duration. After a workout: the
session's minutes and effort as a header, "How intense was the pain
during the run?", Skip or Save; above 5 holds the next step (a named
threshold, never shown as a score).

**Sessions** (new tab) — a training log: each session with minutes,
effort, pain during (a pain value, so the ramp) and the next-morning
outcome in words. Above it, each activity's usual length from the
person's own history ("Easy running · 28–33 min · went fine 6 of 7") —
Gentler Streak's band, without zones or verdicts.

**Insights** (replaces the long Patterns scroll) — one glance: your usual
morning range (the middle half, ramp colours, "not a score"); what goes
with your pain, three rows max, each with its basis count; what is still
learning, as countdowns; Create the PDF. Everything else one tap down.

**Watch** — a morning notification with one crown number; a post-workout
"pain during" with Skip; a complication showing the next step in minutes.
Never a pain number on the face, never a streak.

**System** — black ground, #1C1C1E cards, white actions, two greys; the
pain ramp is the only hue. Type 72 / 32 / 22 / 17 / 15 / 13. Spacing
4–32. Every card ends with one grey "not" line. Detail one tap down.

## Checked against the refusals

- Colour means pain: the ramp appears only on morning pain, pain during,
  and the usual-range band. Bars, minutes, counts, buttons: white/grey.
- Nothing rewards looking at pain: no rings, streaks, deltas, arrows,
  percentages. "3 runs · aiming for 3" is a sentence, never a meter.
- The number is what the user entered: the hero is minutes; the range is
  the person's own middle half, labelled not a score.
- Three states: pain during and stiffness are optional; a skip is stored
  as a skip and never read as zero.
- Attributions are not findings: Insights rows come from the engine's
  gated comparisons, with their basis, not from what the person blamed.
- Thresholds named: the during-pain line (5) goes in `thresholds.ts`.

## Build plan

**Phase 1 — over the air (no new binary):** design tokens; new tab bar
(Today · Sessions · Insights · Log); Today rebuilt (focus title, morning
card, hero, week strip); context-aware check-in with pain during and
stiffness duration (storage + backup + migration keep three states);
Sessions tab; Insights first-glance over the existing engine; Profile
trimmed. All JS; `version` stays 1.3.0.

**Phase 2 — build 49 (native):** Watch morning and post-workout crown
prompts, the next-step complication, widget refresh. Build 48 expires
around 14 Dec, so a native build is due anyway.

**Risk to say out loud:** this is the sixth rebuild of Today since
28 Sep. A week-4 retention number means little if the screen changes
under it — so ship Phase 1 once, before wave 1 starts (26 Oct), and then
hold the layout for the length of Phase 2.

## Apple design pass · 20 Oct

Applied to the mockups the same day, from Apple's fluid-interface and
typography guidance:

- **Platform type.** SF Pro throughout; SF Pro Rounded for the big
  numbers (the sports feel comes from here, not from colour). Tracking
  per size: −3.5% on the hero, −2.2% on titles, +4% on small caps labels.
  Everything scales with Dynamic Type.
- **One filled card per screen** — the thing to do now. The next-step
  hero sits on the ground, unboxed. Simplicity, not minimalism: the most
  important thing is the most obvious.
- **Floating glass tab bar** (Today · Sessions · Insights) with a
  separate round + for logging, content scrolling under it, a soft fade
  instead of a divider. Reduce Transparency makes it solid.
- **Check-ins are sheets** with a grabber and Cancel top-left, rising
  from the bottom over a pushed-back Today, dismissed by a flick.
- **One continuous pain track** instead of eleven buttons: the thumb
  tracks the finger 1:1, snaps to the whole number with a critically
  damped spring, one selection haptic per step, VoiceOver adjustable.
- **Press feedback on touch-down** (scale 0.97, 100 ms). Reduce Motion
  swaps slides for cross-fades; nothing loops on a calm screen.
- **Grouped inset lists** for Sessions and Insights, inset separators,
  chevrons where a row opens detail. The PDF is a row with a document
  icon, named for what it is for.
- **Watch:** the crown is drawn and its scroll indicator shown; a Smart
  Stack widget carries the next step in minutes.

## Apple Health pass · 20 Oct

The founder pointed at Apple Health's Summary as the reference. Taken:

- **Today is a Summary.** Large title, the rehab focus as a section
  header with Edit, then a stack of cards in Health's anatomy: icon and
  label on top with a timestamp and chevron, a big rounded value with a
  small grey unit, one line under it. Cards: the check-in (the one with
  a button), Next run, Morning pain (with the week as seven small
  squares on the right, where Health puts its mini-visual), This week
  (Runs · Minutes · Longest, split by hairlines like Health's Activity
  card), Sleep from Apple Health.
- **Sessions is a Health chart page.** D / W / M / 6M, a TOTAL header,
  white minute bars on a light grid with the axis on the right, and each
  day's morning pain square under its bar. Tap a day and the header
  shows that day. Then "Highlights", Health's word for one sentence that
  says something true.
- **Insights is Highlights.** One card per finding: the category, one
  bold sentence, one small chart, the grey "not" line.
- **Check-in sheets** take Health's add-data bar: Cancel, the title with
  the time under it, Add.

Not taken, on purpose: **category colour.** Health's identity is an
orange Activity, a red Heart, a teal Sleep. Here colour means pain and
nothing else, so categories get white icons and the only hue on the
screen is a pain value. And no rings, which are Health's other signature.

## Type and icons · 20 Oct

- **Every number is SF Pro Rounded; all text is SF Pro.** In React Native
  on iOS the rounded face is the system font's rounded design — no font
  file ships. (The mockups fall back to Nunito and Inter only on
  non-Apple screens; Apple's licence does not allow hosting SF.)
- **Icons are SF Symbols, filled, white**: `figure.run`, `figure.walk`,
  `bed.double.fill`, `square.fill`, `clock.fill`, `calendar`,
  `chart.bar.fill`, `chart.line.uptrend.xyaxis`, `hourglass`,
  `doc.text.fill`. Apple's licence allows SF Symbols inside apps on Apple
  platforms; never in the app icon or a logo.
- **How they ship:** `expo-symbols` renders the real symbols natively, but
  it is a native module, so it rides build 49. It is required inside
  try/catch (AGENTS.md, additive native modules): binaries without it
  fall back to the nearest `@expo/vector-icons` glyph, which is already
  in every binary. The runtime does not bump.

## Onboarding · 21 Oct

Six screens, then the first check-in. Every step but the first can be
skipped, and nothing is written until the last screen (as today).

1. **Welcome** — "A record of your pain.", the red-flag card ("Know when
   not to log") and "Your record stays on this iPhone". Restore link kept.
2. **Goal** — what you are getting back to (`GOAL_ACTIVITIES`), plus an
   optional sessions-a-week. Feeds the activity card's goal line.
3. **Your focus** — NEW. One body part, a side where it has one, and an
   optional "how long". Produces the label Today and the check-in use
   ("Right Achilles"). Other places can still be added on any check-in.
4. **Diagnosis** — the three existing options; "Yes" opens optional chips
   from `DIAGNOSES`. Skip stays a third state, never a "no".
5. **Apple Health** — read-only: workouts, sleep, steps. "Not now" is a
   full-size button of equal weight; without Health, check-ins work and
   the activity card says it has no sessions to learn from.
6. **Morning reminder** — one reminder a day, never mentions a missed
   day; optional after-workout prompt. Ends on "Take your first
   check-in" or "Later — go to Today".

**Owner's call:** asking for Apple Health in onboarding reverses the
earlier decision to ask on Today, day two (ask after the app has shown
its worth). The case for moving it: the redesign leads with the activity
card, and it is empty without Health. The case against: a permission on
screen five of a pain app, before one check-in, may read as a grab.
