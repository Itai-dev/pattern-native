# Pattern — Product Spec v4

*The current specification. Supersedes the v1 (correlation-first), v2 (report-first) and
v3 (hypothesis-led) drafts. `POSITIONING.md` is the argument; `ROADMAP.md` is the schedule;
`RESEARCH.md` is the evidence; this is the build.*

Platform: iOS, Expo + React Native TypeScript
Decision: **The user names a hypothesis and Pattern observes it consistently. Their own record
is a screen they can open, not a document they have to generate. The inferential engine runs
dark until it survives a test it can fail.**

---

## 0. What changed in v4

One change, and it improves the thing v2 and v3 were both reaching for.

v2 and v3 made the clinician report the payoff — correctly — and then buried it behind
*generate a report*. The user had to know to go looking, and it only paid off when they
remembered. v4 makes the record **a tab you can open**, with sharing on it. The PDF becomes an
export of what you are already looking at rather than a separate artefact you build.

| | v3 | v4 |
|---|---|---|
| Where the record lives | Behind a report flow in History | Its own tab, always current |
| Sharing | The point of the flow | One action on a screen that already exists |
| The PDF | A document you generate | An export of the tab |
| Day-14 review | Felt empty, because nothing else was visible | A checkpoint on a screen already full of your data |
| Tab count | Two | Three |

**This reverses an earlier call.** v2 and v3 argued against a third tab on the grounds it
would duplicate the report preview. If the tab *is* the primary surface and the report exports
from it, there is no duplication — there is one `buildReportData` feeding three renderers
instead of two. That is less code than v3 describes, not more.

**What did not change:** the engine stays dark, the exposure rule stays exactly as strict, and
the split between *your data shown back to you* and *a claim about what affects you* is the
whole basis of the design. Everything on the Trends tab is the first kind.

---

## 1. Product definition

Pattern helps people with persistent or recurring pain understand how their pain changes
across days, body areas, times, and everyday context.

> Pain can feel random. Pattern helps you observe it consistently, so you can see whether
> what you suspect actually holds.

Shortest expression:

> Make pain feel less random.

The user names what they want to understand. Pattern keeps that question steady, records the
answers honestly — including the ones they skipped — and shows the record back to them as a
screen they can open and a summary they can hand to a clinician. It is also, quietly, testing
whether it can say something reliable, and it will not say it until it can show it is not
inventing it.

Pattern does not diagnose, determine causes, or prescribe treatment. It uses no
Chinese-medicine terminology or diagnostic concepts anywhere in the interface.

## 2. The hypothesis loop

### 2.1 Setup — three questions, free text

Offered **after seven logged days**, not during onboarding. A user with no record has nothing
to hypothesize about, and onboarding stays two screens.

1. *What are you trying to understand about your pain?*
2. *What do you think makes it harder?*
3. *What seems to help?*

Free text, all optional, **stored verbatim and never parsed for meaning by any remote
service.** The text reaches the report unaltered — which justifies collecting it on its own,
independently of factor selection.

### 2.2 Factor selection — deterministic, on device

Pattern shows the factor library with likely matches pre-highlighted by a local keyword map
(`matchFactors` in `metrics.ts`). A lookup table in the repo: no network call, no model, and
wrong in ways a person can see and correct on the confirmation screen.

**The user picks exactly one factor.** Pattern adds a second.

### 2.3 The second factor is one the user did not nominate

A protocol tracking only what the user already believes can confirm but never discover — and
the same person rates both the factor and the pain, at the same moment, holding a stated
theory about how they relate. One factor nobody nominated is the cheapest available check on
that.

Selection is deterministic (`pickSecondFactor`): exclude the chosen factor, every factor the
user's own words matched, and the previous period's second factor; then take the next from
library order using a rotation counter that increments per protocol.

> **Your focus for the next 14 days**
>
> You'll answer two short questions each day.
>
> - **Stress** — the one you chose
> - **Physical load** — one more, so there's something to compare against
>
> We'll keep both questions consistent so you can see whether a pattern develops.

It is **not** labelled a control, and the screen does not tell the user their judgment is
being checked — that framing is both discourteous and likely to change how they answer.
Whether naming it at all changes the answering is an open empirical question; `shadow_eval`
records both factors identically, with a `factorRole` column, so the beta can compare them.

### 2.4 Fourteen days is a review point, not a promise

Copy must never imply a conclusion arrives on day 14. Hormonal, menstrual and seasonal
hypotheses need far longer. §13.1 defines exactly what day 14 delivers.

### 2.5 Protocols

One active period at a time. Editing a factor **closes** the period and opens a new one;
answers are never retro-labelled, because a question that changed mid-way is two questions.
Every answer carries the protocol id at capture (`pid`).

**Pooling rule.** Analysis pools by `(metricId, wordingVersion)`, *not* by protocol — two
consecutive periods asking the same question at the same wording pool correctly, which is the
only thing that makes a slow hypothesis reachable. `pid` is provenance.

## 3. The core product loop

1. Log pain in a few seconds.
2. Answer up to two personalized factor questions — optional, and only when the moment can
   honestly answer them.
3. Optionally add context: quality words, body areas, a note, something you tried.
4. Repeat naturally, without streak pressure.
5. **Open Trends whenever you want to see what you have.**
6. Share it when you have an appointment.
7. Later, once the engine is validated, Pattern surfaces at most one cautious association.

| Stage | Payoff |
|---|---|
| First log | A clear record of the moment |
| First week | A timeline with locations, quality words and honest gaps — **visible, not buried** |
| End of week 1 | The hypothesis setup: the app asks what *you* want to know |
| Day 14 | A checkpoint on a screen already showing your record |
| Before an appointment | A structured summary, shared from the screen you were already reading |
| Post-validation | A possible association, if one survives the gate |

## 4. Product principles

1. **One answer is a successful check-in.** Pain is the only mandatory response.
2. **Broad underneath, narrow for the user.** Many factors in the model; two in the check-in.
3. **Ask only what this moment can answer.** Sleep in the morning; load at the end of the day.
4. **Track what the user wants to know — and one thing they didn't ask for.**
5. **Your record is yours to look at.** Description is always available; claims are not.
6. **Association is not causation.** Pattern never labels a factor as a proven trigger.
7. **Missing data stays missing.** Unasked, skipped and answered are three distinct states.
8. **A calm surface.** Nothing rewards checking often. See §13.4.
9. **No guilt mechanics.**
10. **Silence beats a manufactured insight.** The engine's default output is nothing.
11. **AI never computes.** Statistics are deterministic, local and testable.

## 5. Information architecture

Three tabs.

### Today — act
- Primary action: Log pain
- **Last check-in** — the latest moment: its value, its word, its time, its
  quality and body-area tags. Opens the day detail, where editing lives.
- **Today so far** — today's check-ins drawn against the clock, and one
  sentence reading the latest against the first of the same day (never
  against another day, and never below `DAY_SHAPE_MIN_DELTA`). Opens
  *Pain through the day*.
- Active protocol status: one quiet line, *Day 9 of 14 · stress, physical load*
- Meaningful activity card, after ~7 logged days
- Hypothesis setup card, after ~7 logged days, once

### Pain through the day — one day, against the clock

Reached from Today so far. The chart on a fixed midnight-to-midnight axis,
the day's average, range and check-in count, and the check-ins themselves.

*The only screen in the app that swipes between days*, one day per page.
Today deliberately does not: it is where you act, and Log always means now.
Editing is not here — a row, or "View all", opens the day detail that owns it.

### Trends — see
Everything Pattern knows because you told it. No inference anywhere on this screen.

- Pain over time, gaps preserved
- Body areas by frequency
- **Described as** — quality-word frequency
- Time of day, gated per §9
- Function: weekly ability and daily interference, labelled distinctly
- Hardest / easiest days — describing the pain on each end, gated per §13.5
- Interventions and what followed
- Protocol progress — completeness only (§13.1)
- **Share** → the PDF

### Map — check and correct

*Named Map, not History. Earlier drafts of this spec said History; the repo has called the
calendar the Map since commit `3bf5f0a` ("act on Today, reflect on the Map"), the screen and
the glyph are built around it, and there was no reason beyond my own habit to rename it.*
- Calendar coloured by daily average pain
- Gaps visibly empty; multiple moments as a count or dots
- Day detail: every timestamped log, its context, body areas, quality words, day-scoped
  answers, interventions and events, and which protocol was active
- Edit and delete, deletion confirmed

Settings from the top-right profile button.

### Naming

**Trends**, not *Insights*. "Insights" implies the app worked something out; on this screen it
has not. "Your record" is the most honest and the flattest. Trends says what it is without
overselling it.

### One data path

`buildReportData()` already computes every block above. v4 gives it a third renderer rather
than a second data source: preview sheet, PDF, and now the tab, all from one function. A
number can never differ between the screen and the shared document, because there is only one
place it is computed.

## 6. Onboarding

Two screens. No account, no diagnosis, no medication list, no activity goal, no notification
permission, **and no hypothesis** — that comes at day 7.

**Screen 1 — Value**

> Make pain feel less random.
>
> A quick daily check-in builds a clear record of how your pain changes across time, body
> areas, and everyday context — and turns it into a summary worth bringing to your doctor.

**Start my first check-in**

**Screen 2 — Scope and safety**

> Pattern helps you record and understand your experience. It does not diagnose conditions
> or replace medical care.

Urgent-care guidance stays accessible.

## 7. Daily check-in

Pain alone in a few seconds; pain plus both factors under 20 seconds; the full optional sheet
under ~35.

### Step 1 — Baseline pain (mandatory)

> How is your pain right now?

0–10 integer slider · 0 No pain · 1–3 Mild · 4–6 Moderate · 7–9 Severe · 10 Most intense.
Full-width, 44pt minimum, integer snapping, light haptic on change, one animated pain square
with continuous colour interpolation. The primary action stays disabled until the user
intentionally chooses a value.

**Log pain** → a timestamped record immediately, with UTC instant and offset. Complete even if
the user stops here.

### Step 2 — The two active factors

Shown only if a protocol is active, and only for factors this moment is eligible to answer.
Optional, individually skippable, consistent in wording and scale for the period.

### Step 3 — Optional context

> Add context

Pain quality words · body areas · what you tried · a short note. Never mandatory. The
interface must never call a pain-only entry incomplete.

### 7.1 Timing eligibility

Personalized factors and timing windows must **compose**. If sleep is a chosen factor asked at
21:00, the rating is a recall made after a full day of pain — contaminated by the outcome it
is meant to predict.

| Rule | Meaning | Factors |
|---|---|---|
| `firstOfDayMorning` | First check-in of the local day, 05:00–11:59 | sleep, stiffness |
| `firstOfDay` | First check-in of the local day, any time | stress, fatigue, interference |
| `firstAfter1700` | First check-in from 17:00 to 23:59 | load, movement, lifting, weather, alcohol, recovery |
| `everyMoment` | Every check-in | body areas, quality words, note |

- A factor whose window is missed that day is **not asked and not recorded.**
- **Evening follow-up.** If an evening-eligible factor is still unanswered, the first check-in
  at or after 17:00 offers it as a single one-question prompt, not the full sheet. Without
  this, morning-only loggers never record it at all.
- Logs before 05:00 carry the following local date and are excluded from evening eligibility.
- Day-scoped answers are revisable from the day detail. Revising rewrites the answer; it does
  not create a second one.
- A factor the user never logs inside the window is surfaced honestly:
  *"Sleep is asked in the morning; you haven't had a morning check-in this week."*
  (`unreachableFactors` in `protocol.ts`.)

## 8. Body map

- First relevant check-in asks for active pain areas.
- Later check-ins show *Same areas as last time?* — explicit **Same / Change / Skip**.
- Previous areas may be shown as reference but **must not be pre-selected.** This replaces
  `defaultLocs` and the hint *"Your usual places are already selected"*, which recorded
  unconfirmed locations as confirmed.
- Front and back regions with laterality where relevant.
- One overall pain score per moment; no per-area intensity.
- The existing 14-region system is extended, never replaced.
- "Asked, nothing selected" is distinguishable from "never asked" (`locAsked`).

Safe: *Hand areas were selected on 9 of 14 logged days.*
Unsafe: *Your hand pattern indicates rheumatoid arthritis.*

## 9. Time of day

Every entry stores exact local time, local date and UTC offset automatically.

| Band | Range |
|---|---|
| Morning | 05:00–11:59 |
| Afternoon | 12:00–16:59 |
| Evening | 17:00–21:59 |
| Night | 22:00–04:59 |

Night wraps midnight deliberately: pain that wakes you belongs with pain at 23:00.

A band renders only with **≥5 check-ins across ≥3 distinct days**. A band resting on one
reading used to display an "average" indistinguishable from one resting on forty, and forty
readings from one sleepless night are one night. Bands falling short are omitted, not greyed
out — a number the reader is told to discount is still a number they saw.

Days with no timestamped moments carry no time and are excluded.

## 10. Reminders

Asked only after the first successful log.

> Want a daily reminder?
>
> Checking in around the same time makes your record more useful.

**Remind me at 8:00 PM** · **Choose another time** · **Not now**

- The three shipped slots (08:00 / 13:00 / 20:00) are retained, all **default off.**
- Onboarding offers one; the others live in Settings.
- If a protocol contains a morning-eligible factor, setup offers the 08:00 slot specifically,
  saying why. Still opt-in.
- Tapping opens directly to the pain question.
- Suppress a slot if a check-in already exists in that band today.
- No missed-day nudges. No pain scores or body areas on the lock screen.
- Copy: *Time for a quick check-in. Take a moment to notice how you feel.*

The "possible pattern ready" notification is deferred with the engine.

## 11. Meaningful function

Introduced after ~7 logged days: one named activity, 0–10 ability where higher is better,
repeated no more than once per 7 elapsed days, small card on Today.

The function goal and the hypothesis setup both surface around day 7. **Show the function card
first and the hypothesis card the following day** — two setup asks in one session is where a
light app starts to feel like a form.

Two function-adjacent metrics coexist: `pain.interference.v1` (daily, un-anchored) and
`function.ability.v1` (weekly, goal-anchored). Both are kept; Trends and the report must state
the distinction so a clinician does not read them as duplicates.

## 12. Interventions, events and self-care

Entry point: **Something changed**

| Kind | Status |
|---|---|
| `flare`, `treatment`, `activity`, `other` | Shipped |
| `medication`, `illness` | New |
| `sleep` | **Legacy-readable only** — out of the picker, never rewritten |

What was tried: medication · heat · cold · movement · rest · breathing · exercise ·
physiotherapy · massage · shiatsu · acupuncture · other. Records of actions, with no
theoretical framing attached to any of them.

**Baseline pain is recorded before any in-app breathing or calming exercise**, never after —
otherwise the measurement and the intervention are mixed.

> Did it help? — **Better · About the same · Worse · Not sure**

Stored as `resp`. The legacy 0–10 `helped` is **retained and never rewritten**; no cutpoint
between the two would be anything but invented, so both are stored and the report says which
it is showing. Intervention response is never averaged into baseline pain.

## 13. What the user sees, and when

### 13.1 The first beta: the record, and honest progress

**No inferential finding is shown to any user.** The Trends tab is full of the user's own data
from day one — that is the payoff, and it needs no gate beyond the descriptive thresholds.

What stays gated is the *comparison*. The day-14 review reports **completeness only:**

> **Day 14 of your first observation period**
>
> You logged 11 of 14 days and answered the stress question on 9 of them.
>
> To compare your high-stress days against your low ones, Pattern needs about 8 of each.
> You have 5 and 4 so far.
>
> **Keep observing** · **Change my focus**

No pain-by-factor counts. *"On your harder days, stress was high 4 times out of 6"* is
descriptive in form and inferential in effect; at that sample size it invites exactly the
conclusion the threshold exists to prevent, and no hedging copy undoes a number on a screen.

v3 worried this would feel empty. On a tab already showing the user's whole record, it reads
as a checkpoint rather than a void — which is the strongest argument for the v4 surface.

### 13.2 Shadow mode

On each app open the engine evaluates every candidate and writes a local `shadow_eval` row.
Nothing renders.

Stored: protocol, factor, wording version, relation (`sameDay` / `nextDay`), the two levels
compared, group sizes, group means, delta, both half-record deltas, direction stability,
days observed, days missing, skip count, `factorRole`, and **whether each of three rules would
have fired** — the retired v1 rule (4 obs / 1.0 point), the holistic-brief rule (5 obs / no
effect size) and the current one. The disagreement between three specifications becomes a
question real data answers, at no risk to the person generating it.

`factorRole` is the column that matters most: it compares how often the **chosen** factor
fires against the **second** factor nobody nominated. Similar rates mean the app is measuring
belief, not pain.

**Privacy.** Shadow rows are health-derived. They stay local, never enter product analytics,
and leave the device only through the user's own export with the diagnostics toggle on
(off by default). A restore never reads them back — derived data is recomputed, not carried,
so a restore can never import a conclusion. Analytics may record counts only.

**What shadow mode can and cannot tell you.** Ten people cannot estimate a ~5% false-positive
rate. Its real outputs are the distribution of group sizes — does anyone reach n≥8, and after
how many days — and the chosen-vs-second comparison. Correctness comes from §13.4.

### 13.3 The exposure rule

A finding may render only when **every** condition holds:

1. **`nA ≥ 8` and `nB ≥ 8`** paired observations per group.
2. **Extremes only** — sleep `poor` vs `good`, stress `low` vs `high`, load `less` vs `more`.
   Caps comparisons at 2 same-day + 2 next-day per protocol instead of nine.
3. **`|delta| ≥ 1.5` points** of mean daily pain.
4. **Direction stable** — same sign in both halves of the record, each holding ≥3 per group.
5. **One card at a time**, the largest surviving `|delta|`. Never a list.
6. **Same-day and next-day findings stay separate**, labelled distinctly, never merged.
7. **The release gate (§13.4) has passed** for the shipped constants.

All constants live in `src/thresholds.ts` and appear as literals nowhere else.

**Expected false-positive rate.** At `n=8` per group with a within-person SD of 1.5–2.0, the
standard error of the difference is 0.75–1.0 points; a 1.5-point threshold sits at z ≈ 1.5–2.0
— roughly **5–10% per comparison** under the null. Direction stability cuts that further,
though not by a clean factor of two (the halves correlate with the pooled estimate), so treat
5–10% as the planning number. Across four comparisons: roughly **1 in 5 to 1 in 10** users
with no real pattern would eventually see one spurious card.

Under the holistic brief's rule the same user faces roughly **two-thirds to seven-eighths**.
Under v1's, near-certainty.

An improvement, not a guarantee. The copy keeps saying so.

### 13.4 The calm-surface rule

An always-available record of your own pain is the surface most likely to turn *"I keep a
record"* into *"I check my numbers five times a day."* `RESEARCH.md` flags exactly this, and
§21 asks about it directly. The Trends tab is therefore deliberately undramatic:

- **No week-over-week deltas.** No *"up 12% this week"*, no arrows, no trend badges.
- **No comparison to other periods** beyond the first-half / second-half figure the report
  already carries, which is descriptive and gated at 14 days.
- **Nothing changes between two opens on the same day** except data the user themselves added.
- **No count of consecutive days**, no completion ring, nothing that makes a gap feel like a
  failure.
- **The tab never notifies and never nudges.** It is somewhere to go, not something that asks.
- Motion follows the existing language and respects reduced-motion; opening Trends is not an
  event.

### 13.5 "Harder days" and "easier days" — descriptive only

**Definition.** Over the window, take each logged day's daily average and compute terciles.
Top third = harder days, bottom third = easier days, **middle third discarded.** Requires
`TERCILE_MIN_DAYS = 21` logged days, and the two tercile boundaries must sit at least
`TERCILE_MIN_SPREAD = 1.5` points apart — someone whose days run 5, 5, 6, 5, 6 has no
meaningfully harder days and the section does not render.

**Confinement, tightened in implementation.** This drives the descriptive section only, and
that section describes **the pain** — where it was, what words were used for it — and **never
the factors.**

Sleep, stress and load are what the engine tests, under a rule needing eight observations at
each end and 1.5 points between them. Printing *"stress was high on 8 of your 11 hardest
days"* is that comparison, run at whatever sample size happens to exist, with the arithmetic
left to the reader. Same claim, no gate. So the section stops at the pain itself and the
factors wait for the engine.

The reason is precise: dichotomizing pain into harder/easier throws away the outcome's
magnitude and turns effect size into a proportion, which is exactly how the holistic brief
reached a 23%-per-comparison false-positive rate. The inferential engine stays **factor-first**
— group days by factor level, compare mean pain in points. Same data, other direction,
information kept.

### 13.6 Insight copy, when the day comes

> **Possible pattern**
> On days you rated stress as high, your average pain was 1.7 points higher than on days you
> rated it as low. Based on 11 high and 9 low days.
>
> This is a pattern in your entries, not proof of cause.

Next-day findings are always labelled as such. When evidence is insufficient, state what is
missing rather than generating anything.

### 13.7 Known confounding, documented not hidden

- **Stress** is measured at the same moment as pain; pain causes stress at least as much as the
  reverse. Likely the most frequent survivor and the least interpretable. **Consider
  suppressing same-day stress cards entirely at exposure time** and keeping stress as Trends
  context. Next-day stress is more defensible.
- **Sleep** is protected by the morning-only rule but remains open to reverse causation.
- **Load and movement** are the cleanest and the best candidates for a first exposed card.
- **The chosen factor carries the user's stated prior.** `factorRole` exists to measure it.

### 13.8 Descriptive thresholds

| Logged days | What Trends shows |
|---|---|
| < 7 | Raw history, **Limited record** |
| 7–13 | Descriptive trends |
| 14+ | First-half vs second-half |
| 21+, spread ≥1.5 | Harder / easier descriptive section |
| per §9 | Time-of-day bands |

### 13.9 The noise-data release gate

A CI harness that must pass before the engine is exposed.

**Null arm.** 1,000 synthetic users; daily pain as AR(1), within-person SD uniform on 1.2–2.2,
autocorrelation 0.3–0.6; context labels random and independent of pain with realistic
marginals; missingness 60–85% of days, 0–2 logs per logged day, records 28–90 days.
→ **Gate: fewer than 5% produce any card.**

**Power arm.** Same generator with a true 2.0-point effect injected.
→ **Gate: ≥60% detection at 90 days.** A rule that never fires on a real effect is not
conservative, it is broken. Both arms pass together or neither counts.

**Next-day arm.** Both arms again at a one-day lag — fewer usable pairs, different failure
modes, its own numbers.

**Reachability arm.** Median day count at which a candidate first reaches n≥8 in both groups.
The number that decides what may honestly be promised.

Output is a committed artefact, regenerated whenever a constant changes.

## 14. The shared summary

The PDF is an **export of the Trends tab**, not a separate document. Same `ReportData`, same
numbers, a print-first renderer. Neutral clinical language throughout.

Adds, beyond what Trends shows on screen:

- **The user's hypothesis, verbatim** — the three free-text answers, unedited
- Observation period: protocol dates, active factors, completion rate
- Exact timestamps
- Symptom modifiers, if recorded
- **Missing-data limitations**, stated explicitly rather than implied by absence
- User-written *What I want to discuss*

No inferential findings in the first beta. No AI-generated text. No diagnostic labels, no
Chinese-medicine terminology, no treatment recommendations.

> This report summarizes information recorded by the user. It may support a clinical
> conversation, but it does not provide a diagnosis or establish causes.

Rules: **Limited record** banner under 7 days · lines break across missing dates, never
bridging · the pain scale definition and version shown · pain (lower generally better)
distinguished from ability (higher better) · sample sizes beside every summary figure ·
figures drawn partly from offset-unknown records marked as such · no unlicensed PROMIS or BPI
wording.

**Share PDF**

## 15. History

- Days coloured by the **average** of their moments.
- The stored day value remains the **peak**, legacy floor intact; the average is derived and
  never stored, so the two cannot drift.
- Missing days visibly empty; multiple moments as a count or dots.
- Day detail shows everything recorded, including which protocol was active.
- Everything editable; deletion confirmed.

## 16. Breathing

Out of scope as a feature. If added, **baseline pain is recorded before it starts**, and the
optional response after it is stored as an intervention response, never as a pain entry.

## 17. The factor library and metric registry

See `src/metrics.ts`, which is the specification.

**Fixed core:** `pain.intensity.v3` (mandatory) · timestamp with UTC and offset ·
`body.areas.v1` · `pain.quality.v1` — **the shipped eight-word vocabulary is retained**,
including tingling, numbness and sensitivity, which are the neuropathic descriptors a
clinician looks for · `pain.interference.v1` · `pain.modifiers.v1`, asked once at protocol
start, not daily · `function.ability.v1`.

**Protocol-eligible:** stress · sleep · fatigue · stiffness · physical load · movement ·
lifting/carrying · weather · alcohol · recovery practice. All three-level ordinals with
declared extremes.

**Deliberately not protocol-eligible**, each carrying its reason so the setup flow can say it
plainly rather than offering a worse proxy:

| Category | Why |
|---|---|
| Menstrual / hormonal | A phase, not a scale. Needs months, not weeks. |
| Food | One question covers too much to measure anything. |
| Medication | The one thing Pattern must never analyse causally. |
| Injury / unusual event | An event, not a daily state. |

Wording changes bump `wordingVersion`. **Answers across versions never pool.**

## 18. Settings and data control

Reminder toggles and times · active protocol (view, edit factors, end early) · hypothesis
(view, edit) · meaningful activity editor · export, restore, delete all ·
**include analysis diagnostics in export** (off by default) · privacy and medical scope ·
accessibility preferences.

Backups validate fully before offering **Replace** or **Merge**. Replace requires destructive
confirmation; Merge deduplicates conservatively on content, since row ids are not stable
across devices. Reminder and protocol preferences are preserved.

## 19. Architecture

Expo + React Native TypeScript. No SwiftUI rewrite. Least invasive change; no rewrites of
unrelated screens.

### 19.1 Design decision: extend, do not restructure

A year of daily use is a few hundred day rows and `report.ts` already computes everything in
memory. Moving moments into their own table buys query power the app does not need and costs
a risky migration. Moments stay as JSON on the day row; day-scoped context is a new JSON
column; protocols, hypotheses and shadow rows get small tables.

### 19.2 Three states, never two

For every optional answer: **absent** = never asked · **present with `skipped: 1`** = asked
and declined · **present with a value** = answered. No state is coerced into another, and a
skip is never read as a negative answer.

### 19.3 Timestamps are additive and never invented

`Moment.ts` (UTC epoch ms) and `Moment.tz` (offset in minutes) are recorded at write time.
They are **never backfilled**: the offset in force at an old capture is unrecoverable, and
guessing it would be inventing data. Absent means offset-unknown; display uses local `h` and
is unaffected; any analysis needing real elapsed time skips those records, and report figures
partly drawn from them are marked.

### 19.4 AI posture

**No AI service ships, and no AI interface is stubbed.** With no backend, a fallback is what
would actually ship — so the abstraction would be unused code carrying a real liability. The
local keyword matcher does the job in a testable lookup table.

If AI is added later, three constraints hold:

1. **It never computes statistics.** Every number a user or clinician sees comes from
   deterministic, unit-tested code.
2. **On-device only**, or the privacy line changes deliberately and publicly. `POSITIONING.md`
   requires "no data collected" to stay literally true, and a sentence about your own pain is
   health data.
3. **No secret ships in the client**, and no new tracked factor appears without explicit user
   confirmation.

### 19.5 Privacy posture

Local-first · no account · no advertising SDK · **no health-content values in product
analytics, including shadow results** · hypothesis text never leaves the device · export and
deletion user-controlled · cloud sync and Apple Health remain later decisions.

## 20. Accessibility and visual behaviour

Existing visual language preserved. Dynamic Type via RN font scaling; system fonts; ≥44pt
targets; VoiceOver labels for every score, region, factor question and ordinal level; never
communicate pain through colour alone — the five written labels accompany numeric values;
sufficient contrast across the ramp; reduced motion respected.

## 21. Beta analytics and what the beta can answer

Behaviour only, never the content of health responses.

Events: first pain log · context opened, saved · factor question skipped (metric id, **no
value**) · hypothesis setup started, completed, abandoned · protocol started, edited, ended ·
reminder enabled · additional moment logged · intervention recorded · **Trends opened** ·
PDF shared · shadow evaluation counts.

### Answerable

1. Can users log pain in a few seconds without confusion?
2. Does the hypothesis setup get completed, and does it change context-answer rates?
3. Do users return often enough to generate paired data?
4. **Is the record understandable and worth sharing?** — the primary question
5. **Does tracking increase control, or increase fixation?** Trends-open frequency is now a
   direct read on this, and a rising one is a signal to act on, not a success metric.
6. Does anyone reach the exposure gate at all, and after how many days?
7. Does the chosen factor get answered more consistently than the second one?

### Struck

*"Does anyone discover a genuinely useful possible pattern?"* Almost no tester reaches n≥8 in
both extreme groups inside the beta window, and ten users cannot estimate a ~5% false-positive
rate. Correctness moves to the noise harness; usefulness to a later, longer cohort.

### Readiness signals

- Median quick log under five seconds; pain plus two factors under twenty
- No data loss across update, export, restore, edit or delete — including deleting a day's
  only moment while its context survives
- Several testers describe a decision or clinical conversation improved by the record
- Shadow mode ran on every tester with zero user-visible findings
- Every user-facing threshold traces to a named constant

## 22. Explicit non-goals

- **User-visible inferential findings** — built, running dark, gated on §13.9
- The "possible pattern ready" notification
- Any AI service, on-device or remote, in this version; any AI chatbot or coaching
- App-generated diagnosis; pain predictions; automatic causal trigger labels
- Medication or dosage recommendations of any kind
- Tongue-photo analysis · pulse or camera diagnosis · meridian maps · qi or energy scores ·
  Chinese-medicine diagnostic labels or terminology anywhere in the interface
- Daily questionnaires containing every possible factor; more than two active factors
- Menstrual/hormonal, food and medication as protocol factors
- Apple Watch · Apple Health / HRV · sleep-stage interpretation
- A user-facing question builder
- Mandatory morning, afternoon and evening logs — three opt-in, default-off reminder slots are
  not the same thing
- Streaks, badges, logging rewards, completion rings, social comparison, community features
- Week-over-week deltas or any surface that rewards frequent checking (§13.4)
- Large educational library; full ACT, CBT, CBT-I, flare-plan or exercise programmes
- Unnecessary redesigns of working screens

Holistic means understanding context, not collecting everything.

## 23. Build order

**Step 1 — Schema and data preservation** ✅ *shipped, see §26*

**Step 2 — Pain-first check-in** ✅ *shipped, see §26*
- Pain remains the only mandatory answer, with UTC and offset
- Two-factor step driven by the active protocol and gated by §7.1
- Evening one-question follow-up for missed evening-eligible factors
- Optional context: quality words, body areas, interventions, note
- Remove body-area pre-selection; ship Same / Change / Skip
- Everything editable, including day-scoped answers
- Reminders: three opt-in slots, default off; morning slot offered when the protocol needs it

**Step 3 — The Trends tab** ✅ *shipped, see §26*

**Step 4 — The hypothesis loop** ✅ *shipped, see §26*
- Setup at day 7, after the function card, once
- Keyword matcher, factor picker, deterministic second factor with rotation
- Confirmation screen, protocol creation, status line on Today
- Day-14 review — completeness only

**Step 5 — Report extensions**
- Hypothesis verbatim; protocol summary; modifiers; missing-data limitations

**Step 6 — Engine in shadow** *(next)*
- Same-day and next-day, writing `shadow_eval` with all three rules and `factorRole`
- Zero user-facing surface

**Step 7 — The gate**
- Noise harness: null, power, next-day, reachability arms; committed artefact
- Expose findings only after both arms pass; consider suppressing same-day stress

**Step 8 — Ship**
- Verify backup, restore, accessibility, notifications, timezone and DST
- Privacy-safe analytics; small external TestFlight cohort

> **Scope note.** Steps 2–3 are one piece of work. Step 4 is another. Steps 6–7 are a third.
> All of it in one pass produces a diff too large to review, in a repository whose character
> is small commits with reasoned messages.

## 24. Definition of done for the first beta

- A first-time user understands the promise and logs pain without instruction.
- Pain-only log in a few seconds; pain plus both factors under twenty.
- Onboarding is two screens and asks for no hypothesis.
- A hypothesis can be entered in the user's own words, stored verbatim, reaching the report
  unaltered.
- Factor selection proposes two: one chosen, one not nominated, both editable before
  activation.
- Questions stay consistent for the whole protocol; editing ends the period rather than mixing.
- **No question is asked at a time it cannot honestly be answered.**
- Multiple same-day logs retain correct timestamps, offsets and order.
- **Trends is available from the first log and always current**, and sharing is one action
  from it.
- Everything recorded appears correctly in Trends, History and the report.
- Unasked, skipped and answered remain three distinct states everywhere.
- **No inferential finding is shown to any user.** The engine runs, records evidence, stays
  silent.
- Day 14 delivers a completeness review with no content-level counts.
- Shadow output never leaves the device except through the user's own export.
- **No AI service, no network call carrying health data, no secret in the client.**
- Reminders opt-in, private, default off, opening directly to the check-in.
- Edit, delete, export, restore and share all work — including deleting a day's last moment
  without losing that day's context.
- Clear urgent-care and non-diagnosis boundaries; no Chinese-medicine terminology anywhere.
- Every user-facing threshold traces to a named constant in one file.
- Accessibility, TypeScript, domain-model, migration and production-build verification pass;
  the noise harness exists and runs in CI.

## 25. Final product statement

Pattern is a lightweight chronic pain journal that begins with one question. After a week it
asks a second: what are you trying to understand? It keeps that question steady — along with
one you did not think to ask — and records the answers honestly, including the ones you
skipped. What you get back is your own record, on a screen you can open whenever you want and
share when it matters: the thing that replaces a biased memory with a record. Pattern is also
learning, quietly, whether it can say something useful about what moves your pain. It will not
say it until it can show that it is not inventing it.

---

## 25b. Apple Health integration

Read-only HealthKit context beside the pain record, behind one interface
(`src/health/types.ts` — `HealthService`), with the store touched in exactly
one file (`src/health/healthkit.ts`, `@kingstinct/react-native-healthkit`,
required lazily inside try/catch so binaries without the module get
`UnavailableHealthService` and the same runtime keeps serving every phone).

**Layers.** Raw samples (provenance intact) → `normalize.ts` (one honest day:
sleep intervals merged to their asleep-union and filed under the morning they
end on; steps credited to the single source that saw the most, never summed
across a phone and a watch; workouts deduplicated by HealthKit UUID; missing
stays missing — no zeros, ever) → `windows.ts` (the temporal law: mornings
pair only with the previous night and previous day; evenings with hours
before the check-in; one pair per day per question, first-morning /
last-evening fixed outcomes so repeated check-ins never inflate a group) →
`engine.ts` (outer terciles of the person's own distribution, gates named in
`thresholds.ts`: 14 paired days, 5 per group, real factor spread, 1.5-point
delta; verdicts `insufficient | observation | possible | fading` and nothing
else). `noticed.ts` licenses associations from the Health CATEGORIES the
user connected — consent lives in the Health setup itself (Pattern's
category sheet plus Apple's per-type sheet), and demanding a second
confirmation through Focus was double consent: connect sleep, see nothing,
because a different switch was off. Heart and mind license nothing; the
search space is the predefined comparisons, never a scan. Focus remains the
sole vehicle for factors no sensor can answer (stress, weather, alcohol…)
and gates the manual daily questions exactly as before. One claim card at
most, Trends' "What Pattern noticed", sample sizes and the non-causation
line on the card itself.

**Setup** lives in Profile (`HealthSheet.tsx`): pick categories → Apple's own
sheet → done. The screen speaks only states it can know — HealthKit hides
read denials, so "no data yet" is never rendered as "denied". Stored context
is derived data: local SQLite (`health_day`), excluded from backups (another
phone must not inherit sensor readings it didn't take), wiped by delete-all
and by disconnecting.

**Decisions.** Foreground-only sync (open + return from background,
`HEALTH_RESYNC_DAYS` re-derived for late-arriving watch data,
`HEALTH_BACKFILL_DAYS` on first connect) — background delivery deferred
until a tester's data proves too late too often. Heart and State of Mind are
imported and normalized but generate no claims. Medication: never. The
future one-question selector consumes `coverage.ts` (`factorCoverage`) —
interfaces only, no UI, by design. Onboarding untouched: Profile is the one
door until the connection has earned a second.

## 26. Implementation status

### Step 1 — shipped

Branch `step1-schema-and-migrations`. `npm run verify` passes: TypeScript clean, **291
assertions across two suites, 0 failures**, iOS production bundle exports.

**New files**

| File | What it holds |
|---|---|
| `src/thresholds.ts` | Every number that decides what Pattern will say out loud, with the reasoning for each |
| `src/metrics.ts` | The metric registry, the four time bands (one definition, shared with the report), eligibility rules, and the local hypothesis matcher |
| `src/protocol.ts` | Second-factor selection, question eligibility, unreachable-factor detection, review progress |
| `tools/test-step1.js` | 99 assertions over the above |

**Changed**

- `src/model.ts` — `Moment.ts`/`tz`/`sv`/`locAsked`; `Answer` and `ContextAnswers` with the
  three-state rule; `Hypothesis` and `Protocol` with cleaners; `resp` and `intervention` on
  events; `medication` and `illness` kinds with `sleep` legacy-readable; `BACKUP_VERSION` → 5;
  **the `removeMoment` fix**
- `src/db.ts` — migrations M1–M9; `hypotheses`, `protocols`, `shadow_eval` tables;
  `setAnswer` / `skipAnswer` / `clearAnswer`; protocol and shadow CRUD; v5 export with the
  diagnostics toggle; content-based merge for hypotheses and protocols
- `src/report.ts` — band sufficiency gate; bands imported from `metrics.ts` rather than
  redefined; both response formats rendered; magic numbers replaced by named thresholds
- `tools/test-model.js` — five assertions updated where they encoded superseded behaviour

**Two data-loss paths closed.** `removeMoment` anchored a day on its note alone, so deleting a
day's last moment dropped `cap` and `factors` — harmless while both were vestigial, and not
harmless at all once `ctx` landed on that row. Separately, the pain-scale migration rewrote
day rows with an explicit six-column `INSERT OR REPLACE`, which would have silently dropped
the new `ctx` column; it now writes through `put()`, so a future column cannot be lost the
same way.

**Migration stance.** `factors` and `cap` are retired but retained for restore fidelity, and
`factors` is never converted — a presence-only tag cannot become a graded level. Timestamps
are never backfilled. No existing event row is rewritten.

### Step 3 — shipped

`npm run verify` passes: TypeScript clean, **301 assertions, 0 failures**, iOS bundle exports.

**New** — `src/TrendsScreen.tsx`, the record as a tab: metrics, pain over time with gaps, the
two ends, time of day, where, described as, function, what you tried, events, and **Share with
your doctor**. `TabBar.tsx` gains a third tab and a bar glyph in the app's square language;
the item lays out vertically so three fit beside the profile circle on a 375pt screen.

**Removed** — `src/ReportSheet.tsx`. Its content is the tab now, and the Settings row that used
to open it jumps to Trends instead of opening a second copy of the same thing.

**`report.ts`** — `harderEasierOf()`: the outer terciles with the middle discarded, gated at
21 logged days and 1.5 points of spread. Rendered in both the tab and the PDF.

**Two deviations from the spec as written, both now folded back into it:**

- **The third tab is Map, not History.** The repo has called the calendar the Map since
  `3bf5f0a`, and the screen and glyph are built around it. Renaming it was my habit, not a
  requirement.
- **The hardest/easiest section describes the pain, never the factors** (§13.5). Showing a
  factor breakdown there would be the engine's comparison at whatever sample size existed,
  with the arithmetic left to the reader — the same claim without the gate.

**Not verifiable here.** The iOS simulator does not run on Windows and `expo-sqlite` has no web
target, so the tab has been typechecked, unit-tested and bundled but **not seen running on a
device.** The PDF renderer was checked visually against synthetic data. Someone should open
Trends on a phone before this is called done.

### Step 2 — shipped

`npm run verify` passes: TypeScript clean, **313 assertions, 0 failures**, iOS bundle exports.

`CheckinScreen.tsx` keeps its one-question-per-screen cadence and gains:

- **"Just log the pain"** beside "Add context" on the first screen. Pain alone was always a
  complete entry; the flow now says so instead of marching you onward with a ✕ as the only way
  out.
- **A questions step**, shown only when something is eligible: the active period's factors and
  then interference, each skippable, the step skipped entirely when the list is empty (which is
  every day until Step 4 ships a protocol).
- **A question left alone is stored as skipped**, not left absent — asked-and-declined is a
  different fact from never-asked, and `persistAnswers` writes one or the other for every
  question actually put on screen.
- **Where is confirmed, not assumed.** `defaultLocs` no longer pre-ticks anything. The previous
  areas are shown as a reminder of what was true then, under **Same / Change / Skip**, and
  Change opens the picker empty.
- `Moment.locSkipped` — the third state for body areas. "No areas today" and "I'd rather not
  say" were collapsing into one another, which principle 7 forbids.

`DaySheet.tsx` lists the day's questions with their answers, shows a skip as *Skipped* rather
than hiding it, and lets one be swiped away — which returns it to never-asked rather than
recording a decline.

**Worth reconsidering before beta:** interference is a second 0–10 slider immediately after the
pain slider, every first check-in of the day. It is specced (§7.1, `firstOfDay`) and it is
built, but it is the heaviest single addition to the daily loop and it overlaps the weekly
ability question (§11). If the 20-second target slips in real use, this is the first thing to
cut or move to weekly.

**Not verifiable here.** No iOS simulator on Windows and no web target for `expo-sqlite`, so
the whole check-in is typechecked, unit-tested and bundled but **not seen running.**

### Step 4 — shipped

`npm run verify` passes: TypeScript clean, **322 assertions, 0 failures**, iOS bundle exports.

- `src/FocusSheet.tsx` — three free-text questions, then the factor picker with the
  user's own words floated to the top, then the confirmation. The hypothesis is stored
  verbatim and read only by a lookup table on the device.
- `src/FocusCard.tsx` — the invitation before a period exists, one quiet line while one runs
  (*Day 9 of 14 · Stress · Physical load*), and the day-14 review.
- `db.extendProtocol` — **Keep observing** pushes the review out by another period rather
  than restarting the run, which would orphan every answer already given from the period it
  belongs to.
- Settings gains an **Observation** group with the active factors and a way to change them.

**The review reports completeness and nothing else**, and there is now a test that proves it:
a deliberately lopsided fixture — high stress on exactly the painful days, the shape a naive
reader would call a finding — produces a sentence with no pain figure anywhere in it, and the
whole progress object is asserted to contain no mean, average or delta.

**Two things fall out of the ordering.** The hypothesis card appears at 7 logged days, and the
questions step in the check-in stays empty until a period exists — so on a fresh install the
first week is pain-only by design, which is what §2.1 intends but is worth knowing when
testing. And "Change my focus" reuses the same sheet as first-time setup, so changing a factor
re-asks the three questions; the previous answers are not pre-filled. Fine for now, mildly
annoying on the second run.

**Not verifiable here.** No iOS simulator on Windows, no web target for `expo-sqlite`.
Typechecked, unit-tested and bundled; not seen running.

### Deferred: the home-screen widget

Decided, not built. SDK 57 ships `expo-widgets`, which authors widget UI in TypeScript that
compiles to SwiftUI and handles the App Group and extension target via its config plugin.

**Design agreed:** a small widget showing the last seven days as colour-only squares, with the
whole widget tapping through to the check-in. No number on the home screen — §13.4's
calm-surface rule applies with more force to a surface you cannot choose not to look at, and
the week strip serves `POSITIONING.md`'s second benefit without one.

**What it needs when it happens:** a native build and a fresh TestFlight submission (a config
plugin cannot ship over OTA) · a version bump to 1.3.0, because `runtimeVersion` is
`appVersion` and today every OTA targets 1.2.0 including builds with no widget extension · a
URL scheme in `app.json`, which does not currently have one, since a widget tap can only open
the app at a URL · App Group entitlement and an extension bundle id, which EAS will provision
on first build.

### Open before Step 6

- **Interference wording** needs a licensing review. The `weekly` table was retired because
  *"that wording was not ours to ship"*; the current item is original text, but this spec is
  not the authority on that.
- **`POSITIONING.md` still ranks the insight engine below the report.** v4 agrees with it in
  substance — the engine ships dark — but the doc predates the hypothesis loop and should be
  updated or explicitly reaffirmed.
