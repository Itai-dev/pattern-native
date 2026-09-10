# Pattern — roadmap

*Each phase answers the question that could kill the next one. Kill criteria
are commitments, not decoration. Updated 2026-09-10.*

## Phase 0 — Make it worth opening (n=1) · now → mid-Sep

Riskiest assumption: the founder opens it on day 26 without forcing himself.

- Native app daily-usable: rebuilt check-in (pain + where only), weekly PEG
  + function goal, flare/event log with quality words and treatments,
  clinician report, backup import from the web app.
- Retired: daily capacity slider (PEG covers it weekly, validated), nightly
  impact chips (moved into the flare log where they carry meaning), guided
  chat (pattern-matching theater), voice agent (contradicts the privacy
  line), 6 of 7 themes, the entire web reminder server (native reminders
  are local).

**Kill criterion:** fewer than 20/28 days logged, or logging feels like a
chore to the person who built it to his own taste.

## Phase 0.5 — The report, tested on a real clinician

- One page, SOCRATES order, ≤30 seconds; map as page two.
- Founder brings it to his own next appointment. Watch what the clinician
  does with it — engage or glance past. That single data point outranks a
  month of feature work.

**Kill criterion:** the clinician sets it aside. Then the format is wrong,
not the idea — iterate the page, not the app.

## Phase 1 — Get ahead of the flare · mid-Sep → mid-Oct

*Rewritten 2026-09-10.* The report answered "what happened"; a person
with pain already knows that by the time they read it. What they want is
the sentence BEFORE the workout, the bedtime, the second coffee — the
one that stops the session that costs tomorrow. The change is where and
when the app speaks, not what it is allowed to say: every sentence is
still a description of the person's own record, gated exactly as before,
and never "stop", "should" or a dose. Exercise helps most persistent
pain and the soreness after it is not damage; the target is
boom-and-bust, not exertion, and a nudge that breeds fear of moving is
a harm, not a feature. Exercise prescription still waits for a
clinician (POSITIONING.md).

Riskiest assumption: a person will act on their own threshold when it
is shown at the moment of decision, and would not have acted on the
same fact shown a week later on Trends.

1. **A personal load budget, from the record.** The workout-load
   association read forward: the person's usual workout in minutes, and
   the minutes past which their next mornings ran harder — the median
   and the upper tercile's first load, from the pairs the engine already
   evaluated. Silent until that association clears every gate it has
   now. Shown on Trends under *Before your next workout*. Ships OTA.
   *(built 2026-09-10: `src/health/budget.ts`)*
2. **Pre-workout delivery.** The reminder planner already knows when a
   workout usually starts. Deliver the budget sentence then, as a
   notification that says what the record says and nothing else. Ships
   OTA.
3. **Close the loop.** The after-workout prompt asks how you are; the
   next morning's check-in is the outcome. Make sure a person who logs
   after a workout is asked the next morning, so the budget keeps
   learning. Mostly exists.
4. **Live budget on the Watch.** Pattern's own Watch app starts the
   workout session for the chosen type, shows elapsed minutes and
   heart-rate zone against the budget, and gives one haptic with the
   record's sentence at the line. Never "stop"; always "your record
   says". A native build; the Watch target needs its provisioning step
   (AGENTS.md) if it has not been done. Heart-rate zones refine load
   here, not before — duration is the one measure every workout has.
5. **Same shape for sleep and food.** Bedtime: the sleep association
   read forward ("mornings after under six hours ran harder"). Evening:
   caffeine and water already pair with evening pain. Same engine,
   delivered before the decision instead of after.

Steps 1–3 make the app proactive on every tester's phone without a
native build. Step 4 is the real-time piece and a separate milestone.

**Kill criterion:** after four weeks with a budget shown, the founder's
workouts do not cluster under the line, or the mornings after workouts
are no better than before it was shown. Then the moment is wrong or the
number is, and the fix is the delivery, not the engine.

**What this retires from the old Phase 1:** the weekly story and the
self-experiment primitive. Both are still worth having; neither is
proactive, and the phase is one question.

## Phase 2 — n=10 · mid-Oct → Dec

- 10 chronic-pain testers via TestFlight external testing; recruit from
  content (channel must be built during Phase 1).
- One metric: who still logs in week 4.

**Kill criterion:** fewer than 5/10 logging at week 4.

## Phase 3 — The fork resolves · Dec →

With retention + report evidence in hand, choose: consumer wellness product
(App Store, freemium, solo) vs clinical-evidence path (partners, capital).
Deciding earlier is guessing.

## Parked (deliberately)

PROMIS/BPI (licensing), pain-quality beyond the flare log, HRV, widgets,
Apple Watch app (phase 2 hardware), Hebrew in native, the five-column
research DB expansion, ACT/CBT content (needs clinician), App Store public
name and listing.
