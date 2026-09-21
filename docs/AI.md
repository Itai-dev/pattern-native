# Words in, answers out — the on-device model

*Decided 21 Sep 2026. SPEC.md §19.4 carried the AI posture and still
does; this file is the design for the one feature that posture allows,
and the argument for every constraint on it. Nothing here is built.*

## Why now, and why this

The pressure is real: a pain diary that only takes taps reads as a
form, and the person POSITIONING.md describes — health-literate, already
wearing a watch, tired of logging — expects to be able to say what
happened and have the app understand it. "Less logging, not more" was
written with Apple Health in mind, and Health will never know that the
person slept badly because of a worry, or that they carried the shopping
up four flights. Those are sentences. Today they go into a note the
engine never reads, and the two context questions get answered, or not,
by hand afterwards.

What the app must not become is a chatbot over health data. Pattern's
claim is that every number a clinician sees is deterministic and pinned
by tests, and that nothing readable leaves the phone. A generic "ask
about your pain" surface gives up both for a feature any competitor can
add in a week. So the model is admitted as a **reading layer over the
input**, never as the engine, and the first and only feature in this
design is:

**Free text in, structured answers out, confirmed by the person before
anything is saved.**

"Slept badly, long walk, ibuprofen at lunch" becomes a proposed level
for the sleep question and a proposed level for the movement question,
shown as suggestions on the check-in the same way `matchFactors`
pre-highlights the factor library today. The person taps to accept,
changes, or ignores. The ibuprofen stays in the note: medication is not
a protocol factor (SPEC.md §22), doses come from Health, and the model
has nowhere lawful to put it.

## What it is not

- **Not the engine.** The model never sees a number it could compute
  with and never returns one. Every statistic still comes from
  `report.ts`, `engine.ts` and the thresholds beside them.
- **Not a verdict.** It never proposes the pain score. Pain is the one
  mandatory answer and it is the person's number, entered by the person.
  A model that reads "awful morning" and fills in a 7 has invented data
  in the field the whole record rests on.
- **Not prose.** The output schema has no free-text field at all. That
  is the enforcement, not a prompt instruction: a schema that cannot
  carry a sentence cannot rate today, name a diagnosis, or turn "sleep
  made it worse" into a finding, whatever the model would have liked to
  say.
- **Not a cloud call.** Apple's Foundation Models framework runs the
  model on the phone's Neural Engine, with no network, no key and no
  account. The privacy policy, the store labels and `docs/POSITIONING.md`
  do not change, because the sentence "nothing you told it about your
  body leaves the phone in a form anyone else can read" stays literally
  true. A remote model is a different decision, taken in that file
  first, and only ever for text the person explicitly chooses to send
  after the encrypted account in `docs/ACCOUNTS.md` exists.
- **Not a new source of truth.** A suggestion the person did not tap is
  nothing. It is not stored, not counted as an answer, not a skip. The
  three states survive untouched: never asked, asked and skipped,
  answered. Provenance is the only addition, below.

## The contract, and how each line is tested

1. **Ids in, ids out.** The schema handed to the model is generated from
   the metric registry (`metrics.ts`): for each question eligible at
   this moment, an enum of its level ids. The model cannot propose a
   level that does not exist, a question that was not asked, or a
   wording version other than the one in force. Anything outside the
   schema is dropped whole, not repaired: a half-valid proposal is a
   guess dressed as an answer.
2. **Pain is never in the schema.** Not as a number, not as a band, not
   as "worse than usual". Tested by construction: the schema builder has
   no path that emits it.
3. **The model is non-deterministic, so the tests pin everything around
   it.** The schema builder, the validator, the mapping from a proposal
   to `Answer` objects, and the confirmation state machine all run in
   Node against a fake model that returns fixtures. A fixture suite of
   notes and expected proposals is a regression test for the prompt, run
   on a device before a binary ships, and its failures are copy changes,
   not test edits.
4. **Provenance, not weight.** An answer accepted from a suggestion
   carries `sug: 1` on the `Answer`. The engine ignores it; it exists so
   the beta can answer an honest question — does a suggested level get
   accepted more than a typed one is chosen, and is that the model
   reading the person or the person deferring to the model? The report
   does not show it. Backup and restore carry it like any other field.
5. **Analytics count, never read.** Events: suggestion offered (metric
   id, count), accepted, changed, ignored — no value and never the text,
   exactly the discipline §21 already sets for skips.
6. **Silent where it cannot run.** The framework needs iOS 26 and Apple
   Intelligence switched on, on an iPhone 15 Pro or newer. Everywhere
   else the check-in is exactly what it is today and the keyword map in
   `matchFactors` keeps doing the hypothesis-setup job. No "upgrade to
   unlock" copy, no greyed-out row: a feature about reading your words
   that half the phones cannot have is presented as an absence, not a
   promise.

## Where it runs, and the guard

The Foundation Models framework reaches React Native through a native
module, so this is the expo-glass-effect pattern and the HealthKit
pattern once more: `src/ai/foundation.ts` requires the module inside
try/catch, old binaries take the catch, and the runtime version does
**not** bump (AGENTS.md, "an ADDITIVE native module does not bump the
runtime"). It still needs one `eas build` and a TestFlight submission,
from a computer, and no new Xcode target — so no provisioning round trip.
The framework itself needs no entitlement and no usage string; that is
to be confirmed against the build, not assumed, and the first build's
notes should say which it was.

**Module candidates, as of 21 Sep 2026.** Several community packages
wrap the framework; none is Expo's own. Version numbers below could not
be verified from this session (the registry pages were blocked), so
check them before adding a dependency:

- `react-native-apple-llm` — plain module: an availability enum
  (`available`, `appleIntelligenceNotEnabled`, `modelNotReady`,
  `unavailable`), sessions, and `generateStructuredOutput(schema)` with
  string enums. MIT. iOS 26, Xcode 26. No framework of its own to adopt.
  **Preferred**, because the feature is one schema call and an
  availability check, and every extra layer is surface to guard.
- `@react-native-ai/apple` (Callstack) — a Vercel AI SDK v5 provider:
  `generateObject`, streaming, tool calls, transcription and speech.
  Requires the New Architecture, which RN 0.86 already runs. The wider
  API is the argument against it for now and the argument for it when
  voice arrives.
- `expo-foundation-models`, `expo-apple-intelligence`, `expo-local-llm`,
  `@ratley/react-native-apple-foundation-models` — Expo-module wrappers
  of varying age; `expo-local-llm` also covers Gemini Nano, which this
  iOS-only app has no use for.

Whichever is chosen, `src/ai/foundation.ts` is the only file that
imports it, so swapping is one file — the same rule `healthkit.ts`
enforces for HealthKit. The session context window is 4096 tokens; a
280-character note and a schema of two questions is nowhere near it,
and the adapter refuses inputs that would be.

## The person's side of the screen

- The note field on the check-in gains nothing visible until the model
  has answered. Suggestions then appear as highlighted-but-unselected
  levels on the context questions below it, with one line beside them:
  *Suggested from what you wrote. Tap to keep, or pick your own.* The
  line lives inside the card it qualifies (AGENTS.md, "say what a thing
  does not mean, next to the thing").
- Latency: the model answers in well under a second on device, but the
  check-in must never wait for it. Pain plus Done stays a two-tap log;
  a suggestion that arrives after Done is discarded, not applied.
- Nothing is cheerful. No sparkle glyph, no "AI" badge, no "we
  understood you". The colour rules hold: a suggestion is a neutral
  outline, never a tint from the pain ramp.
- Off switch in Profile, beside analytics: *Read my notes for
  suggestions*. On by default only where the framework is available,
  because it is on-device; the row explains that in one sentence.

## What comes after, in order, and only if the first earns it

1. **Voice.** The same feature with on-device transcription in front of
   it (Apple's Speech framework, also on the phone). Needs a microphone
   usage string, so a binary; the words go through the identical schema,
   so no new contract.
2. **Ask your record.** "Was the fortnight after I started swimming any
   different?" answered by the model choosing which EXISTING statistic
   answers the question, and the app rendering that statistic's own
   deterministic sentence from `digest.ts`. Again ids out, no prose: the
   model routes, the digest speaks, the thresholds still gate. If the
   record cannot say yet, the answer is the countdown the digest already
   has.
3. **The cover note.** A paragraph for the clinician drafted from the
   deterministic report, shown as an editable draft before the share.
   This is the first place model prose would reach a reader, which is
   why it is last, and why it needs its own entry in this file before it
   is built.

**Kill criterion.** By the end of Phase 2, if suggestions are changed or
ignored more often than accepted, the model is not reading these people
and the feature comes out rather than being tuned in the dark. If
context-answer rates do not move for testers who have it against those
who do not, the same.

## Order of work

1. This file; SPEC.md §19.4 and §22 amended to point here; ROADMAP.md
   entry; AGENTS.md rule. *(this commit)*
2. `src/ai/propose.ts` — schema from the registry, validation, mapping
   to `Answer` with `sug: 1`, the confirmation state. Pure, Node-tested
   against a fake model. Ships as dead code over the air, exactly as the
   engine ran dark.
3. `src/ai/foundation.ts` — the guarded adapter, one import.
4. The check-in hint and the Profile row. Analytics events.
5. The binary. Device pass on TestFlight with the fixture suite before
   the row is visible to anyone but the founder.
