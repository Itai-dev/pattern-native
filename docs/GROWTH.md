# Pattern — from here to a thousand people who stay

*Written 24 August 2026. Extends `ROADMAP.md`, which owns the phases and the
kill criteria; this owns the audience, the instrumentation and the retention
mechanics. Where the two disagree, ROADMAP wins and this file is wrong.*

---

## 0. The number, honestly

**A thousand retained users is roughly three to five thousand installs.** Symptom
trackers lose most people in the first week — the category's day-28 retention
sits somewhere near 10–15%. Pattern should beat that, for reasons set out below,
but not by a factor that makes the arithmetic go away.

More importantly: **the number is the output, not the goal.** A thousand people
recruited before the app can hold fifteen produces a thousand churned users, no
learning, and a burnt channel — chronic pain communities remember apps that
wasted their time. Every gate below is about whether people *stay*, and the count
follows.

Realistic horizon at the current pace: **public listing around Q1 2027, a
thousand retained somewhere in mid-2027.** Anything faster is either luck or a
decision to stop being careful.

---

## 1. The asset nobody named yet: the retention ladder

Pattern already contains a progressive-disclosure schedule, built for
statistical honesty rather than for engagement — and it happens to be a textbook
retention ladder. It was designed for one reason and works for another. That is
worth protecting deliberately rather than discovering by accident.

| Day | What the app can newly do | Why it holds someone |
|---|---|---|
| 0 | Log in seconds; the record starts | Immediate completion, no setup tax |
| 1–6 | Squares accumulate; History fills | The thing you cannot get from memory |
| **7** | The focus question; reminders offered | A chosen commitment, in their own words |
| **14** | First-half vs second-half; the review | "Is it getting worse" gets a real answer |
| **21** | Hardest / easiest days appear | The record starts describing itself |
| **~30+** | Enough paired days that the engine has something to chew | The promise starts being testable |
| Any appointment | The report | The one moment with external stakes |

**Design rule that follows:** every threshold in `thresholds.ts` is now doing two
jobs. Loosening one to make a screen appear sooner is not only a statistical
decision — it spends a rung of the ladder early. Tightening one delays a payoff.
Neither is forbidden; both must be decided knowing they are two decisions.

**The gap in the ladder is days 15–20.** After the day-14 review, nothing new
appears for a week. That is the most likely churn window in the design, and it is
where the first retention experiment belongs.

---

## 2. The blocker: you cannot see retention

There are no analytics. That is correct for privacy and fatal for this plan —
"optimise retention" without measurement is a vibe.

`SPEC.md` §21 already defines the privacy-safe event set: behaviour only, never
the content of a health answer. It has never been built.

**Build it before recruiting anyone beyond friends.** The minimum that makes the
gates below decidable:

- `install`, `onboarding_completed`, `first_checkin` (with seconds since install)
- `checkin_completed` — with duration, and whether context was added
- `day_active` — the one event that makes a retention curve possible
- `focus_started`, `focus_review_seen`, `focus_changed`
- `report_previewed`, `pdf_shared`
- `reminder_enabled`, and which slot
- `trends_opened`, `history_opened`

Never: a pain score, a note, a body area, a factor answer, a hypothesis.

**Choose a processor that can be named plainly in the privacy policy**, or
self-host. The policy currently says "Pattern does not currently collect product
analytics at all; if that ever changes, it will measure actions… and this page
will be updated first." That sentence is a promise with a date on it.

---

## 3. The staircase

Each step has one question and one gate. Failing a gate means fixing, not
proceeding — the count is never the reason to advance.

### Step 1 — One person · now → mid-Sep
*Does the person who built it use it?*

- **Gate:** 20 of 28 days logged, and logging does not feel like a chore.
- This is ROADMAP's Phase 0 kill criterion, unchanged. It has not fired yet.
- Also this window: the clinician test, the name decision, the privacy policy
  hosted, the Sep 1 build.

### Step 2 — Three people · Sep
*Does a stranger understand it without you in the room?*

- Friends and family, internal TestFlight, no review needed.
- Watch a first launch **without speaking**. Every app's first outside user finds
  five obvious things the builder is blind to.
- **Gate:** all three complete a check-in unaided, and none asks what the app is for.

### Step 3 — Fifteen people · Oct → Nov
*Do strangers with chronic pain come back?*

- ROADMAP's Phase 2. External TestFlight, so: Beta App Review, privacy policy
  URL, test instructions.
- Recruit from communities where you already participate — Reddit's r/ChronicPain
  and r/Fibromyalgia have strict, enforced self-promotion rules; read them, and
  post as a person building something, not as a product.
- **Gate:** **8 of 15 still logging in week 4.** ROADMAP says 5 of 10; this is the
  same bar.
- Also learns: median check-in duration, what proportion adds context, whether
  anyone reaches day 14 with enough to compare.

### Step 4 — Fifty people · Dec → Feb
*Does the loop pay off, and does the engine survive contact?*

- Requires the noise harness (`SPEC.md` §13.4) to have passed — null arm under 5%,
  power arm over 60%. **Nothing is exposed to fifty people on the strength of an
  argument.**
- First shadow data at real scale: does anyone actually reach n≥8 in both extreme
  groups, and how often would each of the three rules have fired?
- **Gate:** week-4 retention holds at ≥ 40%, and at least three people describe a
  decision or a clinical conversation the app improved.

### Step 5 — Two hundred · Q1 2027
*Does it hold without you personally onboarding anyone?*

- Public App Store listing. Needs: the resolved name, ASO for the terms people
  actually search ("pain diary", "pain tracker", "symptom journal"), screenshots
  that show the honesty rather than hiding it.
- **Gate:** organic installs retain within 10 points of recruited installs. If
  hand-recruited users stay and strangers do not, the product is being carried by
  your enthusiasm and the funnel is a mirage.

### Step 6 — A thousand · mid-2027
*Does it scale without breaking the promises?*

- **Gate:** day-28 retention ≥ 30%, and the support load is survivable by one
  person.

---

## 4. What breaks at each scale

Worth fixing *before* the step that triggers it, not after.

| Scale | What breaks | The fix |
|---|---|---|
| 15 | No way to hear from users | A feedback route that is not TestFlight-only |
| 15 | You cannot see what happened | Analytics (§2) |
| 50 | Someone loses their phone and their whole record | Decide the backup story — see below |
| 50 | Support becomes a second job | Canned answers, a FAQ page, expectations set in-app |
| 200 | App Store review for a health app | Copy audited for claims; no outcome promises anywhere |
| 200 | Non-English speakers arrive | Decide Hebrew, or decide English-only and say so |
| 1000 | One bad update reaches everyone at once | Staged OTA rollout; a rollback rehearsed before it is needed |

### The backup problem is the sharp one

Local-first means **a lost phone is a lost record.** At fifteen users that is
unlucky; at a thousand it is a certainty and a bad story from someone who trusted
you with two years of their pain.

Three options, and the second is probably right:

1. **Nothing.** Honest, brutal, and consistent. Says so loudly at onboarding.
2. **Lean on iOS backup.** App data already travels in iCloud device backups
   unless excluded. It is encrypted, Apple-held, and requires no server of yours —
   the privacy line survives, because *you* still collect nothing. **Verify the
   database is not excluded from backup**, then say so plainly.
3. **Your own sync.** Breaks "no data collected" outright. Only with a deliberate,
   announced change of position — and it would be a different product.

---

## 5. Retention mechanics, week by week

Ordered by leverage, highest first.

**The first sixty seconds.** Onboarding ends in a check-in — already built. The
single highest-leverage number in the funnel is *installs that produce a first
check-in*. Instrument it, then defend it: nothing new gets added before the first
log, ever.

**The reminder ask.** Offered after the first successful log, opt-in, default off.
This is the strongest habit lever available and the most easily abused. Keep one
default slot; keep the "no missed-day nudges" rule. A tracker that nags about
missed days teaches people to feel watched, and they delete it.

**Days 15–20 — the hole.** After the review, nothing new until day 21. Options, in
order of my preference:
1. Move the hardest/easiest section to appear at 18 days rather than 21 if the
   tercile spread already qualifies — a real payoff, not a fake one.
2. A "your record so far" moment at day 20: the report preview, unprompted, once.
3. Nothing. Accept the dip and let the appointment-driven payoff carry it.

**The appointment.** The one recurring external reason to open the app. Worth
asking, once, whether they have one coming — and if so, surfacing the report
before it. This is the highest-intent moment Pattern will ever have.

**The widget.** Passive presence, one tap to log. It is the only surface that
reaches someone who was not already thinking about the app.

---

## 6. What we refuse, and why it matters commercially

Every item here would raise short-term retention. Each is refused, and the refusal
is the product.

- **Streaks, badges, completion rings.** They manufacture guilt on missed days,
  and a person in a flare who feels judged deletes the app. Already in non-goals.
- **A finding before the gate.** The fastest possible retention win is telling
  someone what causes their pain. Doing it before the rule survives its test buys
  a month of engagement and spends the only thing that makes Pattern different.
- **Daily nudges about missed days.** See above.
- **"Your pain is down 12% this week."** The calm-surface rule exists because an
  always-visible number turns a record into a fixation. `RESEARCH.md` flags this
  and `SPEC.md` §21 asks about it directly — it is a beta *question*, not a
  settled matter. **Watch for it at n=15 and n=50, and be willing to hear yes.**
- **Selling or sharing data.** Nothing to sell; keep it that way.

The commercial argument, not just the ethical one: the differentiator is that
Pattern refuses to lie to you. Every refusal above is that promise being kept
where it costs something. Break one and the positioning is a slogan.

---

## 7. The channel

**Build the audience before you need it.** ROADMAP puts this in Phase 1
deliberately; audiences take months and a waitlist takes a day.

**The angle:** *"I built a pain tracker that refuses to tell you what's causing
your pain."* True, contrarian, verifiable, and it filters correctly — it attracts
sceptics who have been burned by insight-promising apps, and repels people
looking for a miracle. Those sceptics are the users who stay.

**Publish as a person, not a brand.** A LinkedIn company page has nothing to say
yet; a founder building in public does. Specifics that are genuinely interesting
and genuinely yours:

- Why the first rule fired on noise 35–43% of the time, and what replaced it
- Why the engine ships switched off
- The report shown to a real clinician, and what they did with it
- Why the app asks nothing at install

**Sequence:** content now → waitlist after the clinician test → App Store listing
after Step 4. A waitlist is a promise; do not make it while a kill criterion could
still fire.

**Open before deciding the pool:** the app is English-only and you are in Israel.
Local recruiting is higher-trust and easier to follow up; it also means
English-comfortable Israelis only. Hebrew is parked in ROADMAP. Decide before
writing the first post, because it determines where the post goes.

---

## 8. The next four weeks

1. Log daily. The 20/28 gate is the only one that can kill everything downstream.
2. Book the clinician appointment — its lead time is probably longer than the wait.
3. **Decide the name.** It blocks the landing page, the listing, and every asset.
4. Host the privacy policy; fill in the contact address.
5. Sep 1: build production and development; install Pattern Dev; run a true cold start.
6. Build the analytics from §2.
7. First friend test.
8. Write the first two posts. Publish neither until the clinician has seen the report.
