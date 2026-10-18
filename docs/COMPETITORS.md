# Competitors — a brief for Phase 2 recruiting conversations

*Written 18 Oct 2026 by the team loop's go-to-market role, for whoever
answers "why this?" in a club chat or a physio's waiting room. Checked
that day against each US App Store listing and the developer's policy;
store privacy labels are self-reported and unverified by Apple.
**(unverified)** marks what could not be checked. POSITIONING owns the
argument; where this disagrees, this is wrong. Prices change — re-check.*

---

## 1. The field, one app at a time

**Manage My Pain** (ManagingLife, Toronto). *For:* chronic pain broadly —
back, neck, fibromyalgia, arthritis. *Loop:* a sub-minute daily check-in,
charts, a doctor report; the Pain Guide (education) and, in the newest
release, **Solace**, an AI companion doing ACT-style pain psychology and goal
setting from the app's data. *Data:* offline by default, on the device;
reports and sharing need an account; Health & Fitness linked to you. No
sale of health information, but anonymised data "may be used and
disclosed for any purpose" (policy, Jan 2026). *Price:* free, insights
capped at 30 days; $4.99 / $11.99 / $19.99 a month. *What Pattern
refuses:* Solace. A model holding a conversation about your pain off the
phone breaks **"a model proposes, a person
answers, and the engine never hears the model"** and **"sends a word of
the record off the phone"**.

**Bearable.** *For:* chronic illness of every kind — pain, migraine, mood,
PoTS, EDS, endometriosis — and their doctors. *Loop:* log symptoms and any
factor you choose, read correlations, export a report; Apple Health and
Fitbit for steps, sleep, heart rate. *Data:* an account puts health data
on Firebase in Frankfurt, "encrypted on the server end" — not end-to-end;
the policy never says Bearable cannot read it. Never sold; but the
Facebook SDK shares ad identifiers "to target our advertising", and the
label lists contact info and identifiers as used to track you. *Price:*
free; premium about $6.99/month or $34.99/year (third-party review; store
IAPs run $4.49–$49.99). *What Pattern refuses:* the "total symptom score"
in its check-ins (release notes) — **"never invent a derived or composite
score"**.

**Curable.** *For:* adults with persistent pain who will do a daily
programme. *Loop:* audio pain-science lessons, somatic tracking, cognitive
reflection, expressive writing, Pain Reprocessing Therapy exercises, live
workshops. *Data:* account, US servers; the policy allows disclosure to ad
companies and email-based ad matching. *Price:* $11.99/month; $95.90 and
$399.99 tiers, durations unlabelled (likely year and lifetime,
**unverified**). *What Pattern refuses:* psychological treatment content.
AGENTS.md has no line for it; the refusal is POSITIONING's — ACT, CBT and
PRT **wait for clinical authorship** while there is one founder.

**Pathways Pain Relief.** *For:* persistent pain, mind-body. *Loop:* a
70-session programme — pain science, breathing, physio, yoga — with
Challenges that unlock on progress. *Data:* label shows anonymous usage
counts only. *Price:* $12.99–14.99/month, $59.99–69.99/year. **Last update
31 May 2022** — possibly dormant. *What Pattern refuses:* progress
rewards — **"no completion percentages"** — and Curable's rule again.

**CareClinic.** *For:* anyone managing a condition, and caregivers of
dependants. *Loop:* everything — medication with interaction warnings,
symptoms, vitals, PHQ-9, journal, care team sharing. *Data:* account;
Health & Fitness linked to you. *Price:* IAPs $5.99–$79.99, unlabelled.
*What Pattern refuses:* **daily streaks**, even dependants' streaks
(release notes) — **"no streaks"**, the refusal's first word.

**Migraine Buddy** (listed under Voluntis / Aptar Digital Health).
*For:* migraine and headache only. *Loop:* record an attack, its triggers
and treatments; neurologist export; weather forecast; premium coaching.
*Data:* label says nothing is linked to you, yet lists Health & Fitness
and email as collected; its owner advertises running virtual pharma
studies by "leveraging" the user community — what is shared, and on what
terms, is **unverified**. *Price:* $9.99–12.99/month, $69.99–89.99/year.
*What Pattern refuses:* the community, chat and sharing with other users —
**"nothing you told it about your body leaves the phone in a form
anyone else can read."**

**PainScale** (Boston Scientific). US store page 404 on 18 Oct; withdrawn
in New Zealand. Likely gone (**unverified**) — a recruit naming it wants a
replacement.

**PhysiApp** (Physitrack). *For:* a patient whose physio prescribed a home
programme. *Loop:* exercise videos, adherence, "discomfort level"
reports, messages; the clinician sets pain alerts. *Data:* login by a
clinician-issued code; health data and user content linked to you,
contact info listed for tracking; UK servers for NHS use (a provider's
page). *Price:* free to the patient; the clinic pays. *What Pattern
refuses:* a pain report made **to be read by someone else**, and
adherence as a completion measure. A neighbour more than a rival: it ends
when the plan ends.

**Exakt** (Exakt Health, Berlin) — the nearest thing to Pattern. *For:*
runners, including **return to running after injury**, 15+ rehab plans.
*Loop:* prescribed plans; it **asks about pain the day after a rehab
session and adjusts the plan**; Apple Health sync. Certified as a medical
device in the EU. *Data:* identifiers used to track you. *Price:*
$19.99/month, $59.99/six months. *What Pattern refuses:* a programme that
sets the load — Pattern's step is **"at most ten per cent longer at the
same effort"**, read from sessions you chose, and **says it is not medical
advice**.

**Reficio** (a solo developer; first release 20 June, year not shown). *For:* runners with one running
injury. *Loop:* an intake that gives a "pattern-based assessment of likely
causes", a phased return-to-run plan, a pain journal, Strava, an AI coach.
*Data:* health data linked to you. *Price:* free. *What Pattern refuses:*
its Recovery, Load and Rehab **rings** — **"no rings"** — and naming a
cause, which POSITIONING calls a regression even when asked for.

## 2. "I already use Bearable / Manage My Pain — why this?"

> Keep it if it's helping. Those are good at recording pain; Pattern asks
> one number and reads the runs, climbs and classes your Watch already
> logged against the next morning, so you find out which ones are going
> fine — with no account, and nothing you tell it about your body
> leaving your phone.

Never knock the other app; a person who left one has a reason — ask it.

## 3. What only Pattern can say — and what it must not

Checked against the code on `claude/team-loop-oct18`, 18 Oct 2026.

1. **No account, no server copy, and the doctor's PDF still works.**
   Local SQLite; the report printed on the phone by `expo-print`
   (`src/report.ts`); the encrypted copy (`src/cloudSync.ts`) imported by
   nothing, no Supabase in `package.json`. Only counts leave — closed
   list, 24-character values, opt-out (`src/analytics.ts`) — so say
   "nothing you told it about your body", never "nothing leaves". Manage
   My Pain's offline mode is local too, but its reports need the account.
   When ours ships, this narrows to the server-cannot-read version.
2. **It reads the sessions you already do, against the next morning.**
   Any activity Apple Health records, grouped by Apple's effort bands; a
   session went fine if the next morning is under two points above this
   morning; first answer after three such sessions (`src/thresholds.ts`,
   `CAPACITY_*`). Exakt reads the next day too — for **its own**
   prescribed plan. Pattern reads yours, with no plan.
3. **No score, no streak, no ring.** Every pain number on screen is one
   the person entered, or a plain average of those labelled as one
   (Patterns); the card shows minutes, never pain, and pain and ability
   are never averaged together (`src/health/capacity.ts`: none shown,
   averaged or combined). Verified
   against Bearable (total symptom score), CareClinic (streaks), Reficio
   (rings), Pathways (unlockable Challenges); not checked for Manage My
   Pain or Migraine Buddy — say "unlike the ones I've looked at".

**The claim we must not make: that Pattern tells you how much activity is
safe, or that the step is physio-approved.** It is not reviewed by a
clinician — POSITIONING names that as the first job when one joins — and
it is General Wellness, not a device (Exakt *is* one). Say "it reads your
own sessions and suggests a small step; your physio's plan comes first",
as the TestFlight note does. Never call it a rehab app, and never mention
the on-device model (`docs/AI.md`): as planned it is not in build 49
(PHASE2-LAUNCH §2), so no tester has it.

## 4. The segment nobody serves

Every app above has one of two shapes. **Chronic-pain diaries and
courses** (Manage My Pain, Bearable, CareClinic, Curable, Pathways) assume
pain is the life and the task is coping. **Injury rehab** (Exakt,
Reficio, PhysiApp) assumes one injury, one plan, an end date.

Between them: pain that **keeps coming back or never quite left** — the
knee, the lower back, the climber's fingers — in someone who has not
stopped training, is in no programme, will not journal, and already wears
a Watch that knows every session. Their question is POSITIONING's — *what
is affecting my pain, and what can I actually do with that?* — answered
from what they already do, with no plan to finish and no score to watch.
That is "living actively with pain"; nothing found here is built for it.
**A hypothesis until wave 1's week-1 calls (PHASE2-INTERVIEWS §3) say
otherwise.** And the
landing page's "the part no other tracker does" holds for trackers, not
for Exakt — keep the word "tracker" in it.

---

*Sources, 18 Oct 2026:* each app's US App Store listing; the Bearable
(6 Feb 2025), Manage My Pain (15 Jan 2026) and Curable (16 Jun 2025)
privacy policies; managinglife.com/solace; aptardigitalhealth.com;
healthify.nz; choosingtherapy.com; connecthealth.co.uk.
