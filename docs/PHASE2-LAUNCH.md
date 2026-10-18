# Phase 2 — from today to ten testers and the week-4 read

*Written 18 Oct 2026 by the team loop's go-to-market role. A checklist,
not a strategy: ROADMAP owns the phase and its kill criterion (fewer than
5 of 10 logging in week 4), GROWTH the audience and the counting,
AGENTS.md how a change ships; where this disagrees, this is wrong. Every
step exists because skipping it makes the week-4 number unreadable.
Delete this file after the last read on 28 Dec.*

---

## 1. Before anyone is invited · by Wed 21 Oct

**Fix the token first.** This session's `eas whoami` failed with "bearer
token is invalid", so nothing from today is on a phone. New access token
at expo.dev → Account settings → Access tokens (a phone's browser will
do), set as `EXPO_TOKEN` locally and in the cloud environment's secrets —
never in a chat or a commit. `npx eas-cli@latest whoami` prints `itai26`
before anything below starts.

1. **Merge PR #21** (this session: the tap at five, the morning reminder
   offer, the after-noon card, colour means pain, one name for each thing).
2. **Decide PR #22 (`week_active`) the same day, either way.** It is the
   only way week 4 becomes countable without an install id, and it changes
   what leaves the phone, so it is yours, not the team's. If yes: merge
   before the publish so one update carries both, re-host
   `docs/privacy.html`, and check the store label still reads Product
   Interaction, not linked. If no: §5's fallback is the only count you
   will have. *Why the same day:* phones that predate the event anchor on
   the record's first day, so only cohorts whose first check-in comes
   after it reaches phones can be read. Merging on 2 Nov loses wave 1.
3. **Ship it, all four steps** (AGENTS.md, "How to ship a change"):
   `npm run verify` → commit → `git push origin master` →
   `npx eas-cli@latest update --branch production --environment production --message "..."`.
   If verify ends in `spawn UNKNOWN`, push and use
   `workflow:run .eas/workflows/publish-update.yml`; never publish around
   a red verify.
4. **Head check.** `npx eas-cli@latest update:list --branch production --limit 3`:
   the top row is your commit, authored by `itai26`. `workflow:runs`
   shows nothing queued. Read the list, not the green tick.
5. **Existing testers force-quit twice** — one launch downloads, the next
   applies. Tell them in those words.
6. **The morning-reminder fix only helps people who say yes after it
   ships.** Whoever took the evening offer keeps it and never sees the
   morning one (the Today freeze, on purpose). One message to current
   testers — the morning reminder is in Profile, and mornings are what the
   card reads — once, never again.

## 2. The build · build 49, in TestFlight by Fri 23 Oct

**Build 48 expires about 14 Dec** (uploaded 15 Sep, commit 0b9c4a0; 90
days) — two days after wave 2's week 4, on the first day of wave 3's. An
expired build is a phone that will not open, and the usual response is
delete and reinstall: the one case the phone's backup does not cover
(ROADMAP, "The record's only copy"). Cohorts start on a fresh binary.

**What it carries — native, guarded, no new runtime.** Since 48: Skia and
`thinking-orbs` (the orb; `PainOrb.tsx` requires Skia in try/catch, so 48
draws the square), the privacy manifest, the reworded HealthKit write
string and a Reminders string, the watch's second page (`WeekView.swift`).
`tools/test-native-guards.js` passes on all of it (run 18 Oct). The
on-device model is NOT in it — ROADMAP expected Phase 2's build to carry
it, and `package.json` has no such module. It goes in before Mon 19 Oct
or waits until after 28 Dec; not a second binary mid-cohort.

**No new native target**: `targets/watch` and `targets/watch-complication`
have been signed since build 47, profiles in EAS's store
(`TWO-THINGS-AT-THE-COMPUTER.md` §2). AGENTS.md's one-human step does not
apply, and the build runs on EAS's servers:

```bash
npx eas-cli@latest workflow:run .eas/workflows/build-ios.yml
```

It builds and submits, never publishes; `autoIncrement` with a remote
version source makes it 49. **`version` in `app.json` stays 1.3.0.**
Changing it silently strands every phone on 1.3.0 until a new binary;
`tools/test-runtime.js` fails verify on a mismatch, and the answer is
never to edit the guard. Bump only when a native build for everyone is
coming, said out loud. For build 49 it is not.

**Needs you, not a session:** the token; the "What to Test" text (§5) on
build 49; Beta App Review if 1.3.0 has never been in an external group
(policy URL, contact — usually a day or two); the clinics (§4). **Needs
your computer:** nothing, if `build-ios.yml` succeeds. If it fails, the
fallback is `npx eas-cli@latest build --platform ios --profile production --auto-submit`
in your own terminal. Skia is the first native compile since 48 and the
likeliest failure, so start Mon 19 Oct, not Friday.

**Then, on your own phone:** install 49, open it cold, check in at 5 with
one tap, see the orb, open the watch app, force-quit twice and confirm
the OTA from step 3 reached 49 too.

**If 49 is not in TestFlight by Fri 23 Oct, every date below moves two
weeks.** Starting on 48 would change the check-in screen, square to orb,
in the middle of a cohort; the read is worth more than the fortnight.
Build 49 stops about 19 Jan 2027, after the last read.

## 3. Cohorts · one calendar week each, a week of nobody between

`week_active` carries a week number and nothing else, so cohorts are told
apart only by when they started. A cohort is the seven days in which its
testers make their FIRST check-in; its week 4 runs from 21 days after
that week's first day to 27 days after its last. Back-to-back cohorts
overlap by six days and only their sum can be read
(`git show claude/week-active-oct18:docs/GROWTH.md`, §2). Hence the gap
weeks below — nobody is invited in them, and nobody is told "next week".

| Wave | Invites go out | Cohort week | Size | Week-4 window | Read on |
|---|---|---|---|---|---|
| 1 | Mon 26 Oct | 26 Oct – 1 Nov | 3–4 | 16 – 28 Nov | Mon 30 Nov |
| — | gap | 2 – 8 Nov | 0 | | |
| 2 | Mon 9 Nov | 9 – 15 Nov | 4 | 30 Nov – 12 Dec | Mon 14 Dec |
| — | gap | 16 – 22 Nov | 0 | | |
| 3 | Mon 23 Nov | 23 – 29 Nov | to reach 10 (≤15) | 14 – 26 Dec | Mon 28 Dec |

The Phase 2 answer is the sum of the three numerators over the sum of the
three denominators, read on 28 Dec: 5 of 10 passes (GROWTH's Step 3 asks
8 of 15 — the same bar, if wave 3 tops up to fifteen).

**Wave 1 is small** so a broken core loop costs three strangers, not ten.
It is also the warmest wave and will read high; do not let it set
expectations for wave 2.

**Keeping a cohort clean:**
- TestFlight **email invites only**, on the wave's Monday. A public link
  in a post spreads past the week and the count. A reply after Wednesday
  waits for the next wave.
- Ask for the first check-in on install day. A straggler whose first
  falls in a gap week is in no denominator and can add one to a
  numerator; note them.
- **No fresh install and no first check-in on any test phone during a
  wave week** — it is a `first_checkin` like any other.
- The ledger holds dates and channel only. Answers to the invite email's
  three questions are about someone's body; they stay in your inbox and
  go in no sheet, tool or session.

## 4. Channels · no paid ads

The audience is active people with recurring musculoskeletal or
inflammatory pain who wear a watch (POSITIONING, "Living actively with
pain"), found where they train and where they do physio, not in
chronic-illness forums. English-only app, founder in Israel: wave 1 is
local and English-comfortable, where follow-up is a coffee, not a thread.
**Read each community's rules before posting, every time; they change.**
The post is the team log's draft (round 2), unchanged.

| Channel | The ask | Who to approach | The one risk |
|---|---|---|---|
| Your own physio, then two clinics you know | Put the post on the noticeboard or hand it to patients who still train | The clinic owner, in person, with the clinician page printed | It reads as the clinic recommending a medical app. The clinic agrees first, never passes you a patient's name, and the patient emails you themselves |
| Running clubs (club chat, not a race) | Post once in the club's chat; offer to talk after a session | The coach or chat admin, asked before posting | Skews to the least affected — people who are fine say yes to be nice. The screening questions sort them |
| parkrun, where there is one | Ask whether a mention is allowed at all | The event director, never the finish funnel | parkrun forbids commercial promotion at events; leafleting burns the one local channel that recurs every Saturday |
| Climbing gyms | Noticeboard post; recurring finger, shoulder, elbow pain | Gym manager or the route-setting staff | Climbing pain is often acute. Recurring means it keeps coming back or has lasted three months — say so in the post |
| r/AdvancedRunning, r/climbharder and similar | Only in a thread the rules allow (often a weekly self-promotion or survey thread), as a person building something | The moderators, by modmail, before the first post | A removal or ban is public and permanent, and most readers are not on iPhone with a watch — expect one tester per post, not ten |
| Your own posts (GROWTH §7: a person, not a brand) | "I built a pain tracker that refuses to tell you what's causing your pain" — the angle, with an invite at the end | Your own network | Friends without pain join to be kind and churn; that is a retention number about friendship |

Not on the list on purpose: r/ChronicPain, r/Fibromyalgia and other
chronic-illness forums (ROADMAP narrowed the audience away from them),
anything paid, and any channel that cannot be told apart by wave.

## 5. The TestFlight "What to Test" note · final, for build 49

Assembled from the round 2 draft and GTM's round 4 line. "Runs" became
"sessions" because climbers and swimmers read this too.

> Thanks for trying Pattern. Check in when you can — mornings matter
> most, because the activity card reads each session against the next
> morning. If Today offers a morning reminder, that's the one.
>
> Your sessions come from Apple Health; until it is connected (on Today,
> or in Profile) the card has nothing to read. Its first answer comes
> after three sessions, each with a morning check-in that day and the
> next — about a week at three sessions a week. Until then it says it is
> still learning.
>
> Before deleting or reinstalling — including when this build expires —
> save a copy in Profile: your iPhone's backup will not bring the record
> back to a reinstalled app; a saved copy will.
>
> Tell me anything that confused you or felt like a chore — reply to my
> email or use TestFlight's feedback. Pattern is not medical advice, and
> your own physio's or clinician's plan comes first.

**If PR #22 is not merged, the fallback count:** App Store Connect →
TestFlight lists each tester's sessions on a build. Two looks a week apart
inside the cohort's week-4 window; a count that rose is a tester who
opened the app. It counts launches, not check-ins, so it is a ceiling on
"still logging", where `week_active` is a floor. Write down which one you
read.

## 6. While a cohort is running · 26 Oct → 28 Dec

- **Today is frozen** — layout, order, the ramp, the orb (the team loop's
  standing rule) — until 28 Dec. Copy and bug fixes ship as normal, each
  with the head check and "force-quit twice". **No second binary** unless
  §7 forces one.
- **Day 8 of each wave** (3 Nov, 17 Nov, 1 Dec): one short email — has
  the activity card said anything but "still learning", and what
  confused you? In Aptabase, per wave: `first_checkin`,
  `health_connected`, `reminder_enabled` with slot `m`. The core loop,
  counted without reading a word anyone wrote.
- No nudge about missed days, by any route, the email included. A tester
  who has gone quiet has answered the question.

## 7. What stops recruiting early

Stop inviting — finish the cohorts already running, add nobody — on any
of these. Each is a fix-first, not a pivot.

**Safety.**
- A tester followed "next time, N minutes" into a flare or an injury, or
  over their physio's plan. The not-medical-advice line did not hold;
  read every word of that card's path before inviting again.
- A tester checks their numbers many times a day, or feels watched — the
  harm "nothing rewards looking at your pain" exists to prevent. It
  outranks any retention number.
- A record lost to an update, a build change or a restore that did not
  restore. One is enough.
- Someone in crisis writes to you. Answer as a person, point them to
  their clinician or the local emergency number; it is not feedback.

**A broken core loop.**
- By day 8 of wave 1, nobody has morning check-ins on two consecutive
  days, or nobody has connected Health: the card can answer no one, and
  wave 2 would only measure that again.
- An old commit at the head of `production`, or a tester not on the
  update you published: no fix reaches anyone until that is repaired.
- Build 49 crashes at launch or a check-in does not save: roll back
  (`npx eas-cli@latest update:rollback`) and keep invites closed until it
  is understood.

**Not on the list:** a wave that reads low. That is the answer Phase 2
exists to get. Read it on 28 Dec with the others, and do not recruit past
fifteen to outrun it — the count is never the reason to advance.
