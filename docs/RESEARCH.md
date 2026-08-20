# Pattern — research distillation

*Source: `docs/pattern_chronic_pain_research_database.xlsx` (Itai, 2026-08-20),
stress-tested in session on 2026-08-20. This file records what the research
says AND what we decided to do about it — they are not the same thing.*

## The one-line conclusion

Tracking without output is the control arm of the PROSPER-FM trial (22% vs
71% for guided ACT). Pattern's defensible wedge is: extremely short daily
journal → function emphasis → a clinician-ready report → cautious
self-experiments. Measurement sophistication is not the bottleneck; output is.

## Scorecard stress test (2026-08-20)

The database weights implementation feasibility at 0.10. Re-ranking with
solo-founder weights (feasibility 0.25) was arithmetic-verified against the
sheet's own weighted column. Findings:

- **PEG is #1 under both weightings** — robust, not an artifact. Build it.
- **PROMIS (#6→#19) and BPI (#12→#25) collapse** — licensing + feasibility,
  as the sheet's own rights column warns.
- **Management methods (ACT, flare plan, breathing) rise** — but this exposes
  the scorecard's blind spot: their feasibility is scored as engineering
  (screens are easy) while their true cost is clinical authorship and
  accountability, for which no column exists.
- **The clinician report is never scored in either table** despite appearing
  in the principles and build-now grid — the highest-value zero-governance
  component is missing from the model.

## What clinicians actually ask (verified against clinical frameworks)

Every pain assessment runs SOCRATES (Site, Onset, Character, Radiation,
Associated symptoms, Timing, Exacerbating/relieving, Severity) or OPQRST.
Intake forms add function (work, self-care, recreation, social), what was
tried and whether it helped, sleep, and mood.

Pattern's gaps against that list, found 2026-08-20:
1. **Character** (burning/aching/stabbing) — asked at every appointment,
   absent from the app. → quality words on the flare log.
2. **Treatments tried + perceived effect** — asked every visit, absent.
   → event log with kind=treatment and a "did it help" rating.
3. **Function in named terms** — the M01 goal. → weekly goal rating.

## The report constraint (patient-generated-data literature)

Clinicians describe app data as a firehose; time pressure and unfamiliarity
are the documented reasons they disengage. Therefore: **one page, ≤30
seconds, ordered as SOCRATES** — severity, site, timing, character,
relieving/worsening, function, tried — with the map as the only second page.
A report that needs scrolling has already failed.

## Instruments

- **PEG (3 items, 0–10, past week):** pain average, enjoyment of life,
  general activity; score = mean. Validated, responsive to change, freely
  usable. Weekly cadence.
- **PGIC** (global impression of change): candidate for monthly, later.
- **NRS 0–10**: stays as the daily pain question with a consistent window.
- **PROMIS / BPI / GCPS-R:** not without licenses. Do not embed wording.

## Key sources

- PEG validation: pubmed.ncbi.nlm.nih.gov/19418100
- Pain recall bias / EMA: systematic reviews per database Journals sheet
- IMMPACT domains: pubmed.ncbi.nlm.nih.gov/14659516
- PROSPER-FM (digital ACT phase 3): 2024, fibromyalgia, 71% vs 22%
- NICE NG193 chronic primary pain guideline
- SOCRATES/OPQRST: standard clinical assessment mnemonics
- PGHD clinician-burden literature: JMIR / npj Digital Medicine, per session
  search 2026-08-20
