/**
 * Words in, answers out — the pure half of the on-device model.
 *
 * docs/AI.md is the design; this file is its contract, written so the
 * model has nothing to be trusted with. The model is handed a SCHEMA
 * built from the registry — for each question being asked right now,
 * the closed list of ids a tap could have chosen — and hands back ids.
 * Nothing else can pass through here: not a number, not a sentence,
 * not a question that was not asked, not a level that does not exist.
 *
 * What this file refuses, and how each refusal is mechanical rather
 * than a prompt instruction the model could ignore:
 *
 *  - A NUMERIC question is never in the schema. Pain and "how much did
 *    it limit today" are the person's numbers; buildSchema drops them
 *    on type, so there is no path that emits one (tested over the
 *    whole registry, not a sample).
 *  - There is no free-text field in the schema. A shape with no string
 *    property cannot carry a verdict, a diagnosis or a sentence about
 *    what caused what, whatever the model would have liked to say.
 *  - Output outside the schema is DROPPED WHOLE, not repaired. A reply
 *    with one invented id beside two good ones is a guess wearing an
 *    answer's clothes; the honest reading is that the model did not
 *    understand, and the check-in stays exactly as it was.
 *  - Nothing here writes. A proposal becomes an answer only when the
 *    person taps it, and the confirmation state below records what they
 *    did with it — accepted, changed, ignored — as counts, never text.
 *
 * Pure and Node-tested (tools/test-propose.js) against fixtures, because
 * the model itself is non-deterministic and the only things worth
 * pinning are the walls around it. The native adapter that actually
 * calls the model lives in foundation.ts, guarded like HealthKit, and
 * imports this; this file imports nothing native and never will.
 */
import {
  IMPACT_CHIPS, MODIFIER_NAMES, MetricDef, getMetric,
} from '../metrics';
import { LOC_CHIP_IDS, LOC_NAMES, QUALITY_NAMES } from '../model';
import { AI_INPUT_MAX_CHARS } from '../thresholds';

/* ── the schema ─────────────────────────────────────────────── */

export interface ProposalOption {
  id: string;
  label: string;
}

export interface ProposalField {
  /** the metric id — the storage key the answer will be written under */
  id: string;
  /** the id as a JSON property name: Apple's structured output binds
   *  properties to identifiers, and 'sleep.quality.v1' is not one */
  key: string;
  /** one id (ordinal) or a list (set) */
  kind: 'one' | 'many';
  /** the question as the person reads it — the model's only context
   *  for what the ids mean */
  question: string;
  options: ProposalOption[];
}

export interface ProposalSchema {
  fields: ProposalField[];
}

/** the property name a metric id wears inside the model's JSON */
export function keyOf(metricId: string): string {
  return metricId.replace(/[^A-Za-z0-9]+/g, '_');
}

/** the ids a set question could have been answered with — the CHIPS the
 *  person could tap, never the whole vocabulary. Body areas have a
 *  sided vocabulary behind fourteen coarse chips; a proposal of
 *  'kneeL' would be an answer no tap on the where step can give, and a
 *  suggestion has to be something the person can accept by tapping. */
function setOptions(m: MetricDef): ProposalOption[] | null {
  switch (m.vocabulary) {
    case 'body':
      return LOC_CHIP_IDS.map((id) => ({ id, label: LOC_NAMES[id] || id }));
    case 'quality':
      return Object.keys(QUALITY_NAMES).map((id) => ({ id, label: QUALITY_NAMES[id] }));
    case 'impact':
      return IMPACT_CHIPS.map((c) => ({ id: c.id, label: c.name }));
    case 'modifiers':
      return Object.keys(MODIFIER_NAMES).map((id) => ({ id, label: MODIFIER_NAMES[id] }));
    default:
      return null;
  }
}

/** the field for one metric, or null when the model may not be asked
 *  about it: unknown, numeric, or without a closed list of ids */
export function fieldFor(metricId: string): ProposalField | null {
  const m = getMetric(metricId);
  if (!m) return null;
  if (m.type === 'ordinal') {
    if (!m.levels || !m.levels.length) return null;
    return {
      id: m.id, key: keyOf(m.id), kind: 'one', question: m.question,
      options: m.levels.map((l) => ({ id: l.id, label: l.label })),
    };
  }
  if (m.type === 'set') {
    const options = setOptions(m);
    if (!options || !options.length) return null;
    return { id: m.id, key: keyOf(m.id), kind: 'many', question: m.question, options };
  }
  return null;   // numeric: the person's number, never the model's
}

/** the schema for the questions on screen right now, in the order
 *  given, duplicates and ineligible ids dropped. An empty schema means
 *  there is nothing to ask the model and the adapter must not call it. */
export function buildSchema(metricIds: string[]): ProposalSchema {
  const seen: Record<string, true> = {};
  const fields: ProposalField[] = [];
  metricIds.forEach((id) => {
    if (seen[id]) return;
    seen[id] = true;
    const f = fieldFor(id);
    if (f) fields.push(f);
  });
  return { fields };
}

/** the schema as the JSON-schema-shaped object the native adapters
 *  take. Every property is optional and nullable: a model made to fill
 *  every slot invents, and "the text said nothing about this" has to
 *  be an answer it can give. No property is a string without an enum,
 *  and no property is a number — by construction, and tested. */
export function toJsonSchema(schema: ProposalSchema): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  schema.fields.forEach((f) => {
    const ids = f.options.map((o) => o.id);
    const description = f.question + ' Options: '
      + f.options.map((o) => o.id + ' = ' + o.label).join(', ')
      + '. Leave out if the text does not say.';
    properties[f.key] = f.kind === 'one'
      ? { type: 'string', enum: ids, description }
      : { type: 'array', items: { type: 'string', enum: ids }, description };
  });
  return { type: 'object', properties };
}

/** what the model is told, once, before the person's words. Written
 *  from the record's side: read, do not infer; leave out, do not guess.
 *  The prompt cannot make the schema safe — the schema is safe — but a
 *  model told to fill everything fills everything, and a wrong
 *  suggestion the person has to un-tap is a cost too. */
export function instructions(schema: ProposalSchema): string {
  const lines = [
    'The text is what a person wrote about their own day and their pain.',
    'For each question below, pick the option the text plainly states. If the text does not say, leave that question out.',
    'Never guess from mood or tone. Never add anything that is not in the text. Only use the option ids listed.',
  ];
  schema.fields.forEach((f) => {
    lines.push(f.key + ': ' + f.question + (f.kind === 'many' ? ' (choose every option that applies)' : ' (choose one)'));
  });
  return lines.join('\n');
}

/* ── the input ──────────────────────────────────────────────── */

/** the person's words as the model gets them, or null when there is
 *  nothing to read or too much. Whitespace collapsed because the model
 *  is billed in tokens and a note is not a layout. Over the cap is a
 *  refusal, not a trim: cutting a sentence changes what it says, and
 *  every field feeding this is already capped far below the limit, so
 *  an input over it is a bug upstream rather than a long note. */
export function prepareInput(parts: (string | null | undefined)[]): string | null {
  const text = parts
    .map((p) => (typeof p === 'string' ? p : ''))
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  if (!text) return null;
  if (text.length > AI_INPUT_MAX_CHARS) return null;
  return text;
}

/* ── the output ─────────────────────────────────────────────── */

export interface ProposedAnswer {
  /** the metric id, never the JSON key */
  id: string;
  /** the proposed ids — exactly one for an ordinal, one or more for a
   *  set. Never empty: "nothing" is the field being absent. */
  ids: string[];
}

/** the model's reply, or null. The whole reply is rejected when ANY of
 *  it is outside the schema: an unknown property, a value that is not
 *  in that field's options, a list where one id was asked for or the
 *  reverse, a non-string in a list. Null, empty string and empty list
 *  are the model's way of leaving a question out and are accepted as
 *  absence. A reply that leaves every question out is a valid empty
 *  proposal, not an error. Order is the schema's, never the reply's. */
export function validate(schema: ProposalSchema, raw: unknown): ProposedAnswer[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const byKey: Record<string, ProposalField> = {};
  schema.fields.forEach((f) => { byKey[f.key] = f; });
  for (const k of Object.keys(r)) if (!byKey[k]) return null;

  const out: ProposedAnswer[] = [];
  for (const f of schema.fields) {
    const v = r[f.key];
    if (v == null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    const allowed: Record<string, true> = {};
    f.options.forEach((o) => { allowed[o.id] = true; });
    if (f.kind === 'one') {
      if (typeof v !== 'string' || !allowed[v]) return null;
      out.push({ id: f.id, ids: [v] });
    } else {
      if (!Array.isArray(v)) return null;
      const ids: string[] = [];
      for (const x of v) {
        if (typeof x !== 'string' || !allowed[x]) return null;
        if (ids.indexOf(x) < 0) ids.push(x);
      }
      out.push({ id: f.id, ids });
    }
  }
  return out;
}

/* ── the confirmation ───────────────────────────────────────── */

/** what the person did with a suggestion. Counts for analytics, a flag
 *  for provenance, and nothing else — the ids never leave this file as
 *  anything but the answer the person actually tapped. */
export type SuggestionOutcome = 'accepted' | 'changed' | 'ignored';

export interface SuggestionState {
  /** what was put on screen, in schema order */
  offered: ProposedAnswer[];
  /** metric id → what became of it, once the question was left */
  outcome: Record<string, SuggestionOutcome>;
}

export function offer(proposal: ProposedAnswer[]): SuggestionState {
  return { offered: proposal.map((p) => ({ id: p.id, ids: p.ids.slice() })), outcome: {} };
}

/** the offered ids for one question, or null when nothing was offered */
export function offeredFor(state: SuggestionState, metricId: string): string[] | null {
  const p = state.offered.filter((o) => o.id === metricId)[0];
  return p ? p.ids.slice() : null;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s: Record<string, true> = {};
  a.forEach((x) => { s[x] = true; });
  return b.every((x) => s[x]);
}

/** was what the person chose exactly what was offered? True is the one
 *  case that earns `sug: 1` on the stored answer: an answer the model
 *  proposed and the person confirmed, distinguishable six weeks later
 *  from one they chose unprompted. Anything else — no offer, a changed
 *  choice, a skip — is the person's own and carries no flag. */
export function wasSuggested(state: SuggestionState, metricId: string, chosen: string[] | null | undefined): boolean {
  const off = offeredFor(state, metricId);
  if (!off || !chosen || !chosen.length) return false;
  return sameSet(off, chosen);
}

/** record the person's decision on one question as they leave it. A
 *  question nothing was offered for records nothing — there was no
 *  suggestion to accept or refuse. Calling it twice keeps the LAST
 *  decision: the person may go back and change their mind, and the
 *  count should say what they finally did. */
export function resolve(
  state: SuggestionState, metricId: string, chosen: string[] | null | undefined
): SuggestionState {
  const off = offeredFor(state, metricId);
  if (!off) return state;
  const outcome: SuggestionOutcome = !chosen || !chosen.length ? 'ignored'
    : sameSet(off, chosen) ? 'accepted' : 'changed';
  return { offered: state.offered, outcome: { ...state.outcome, [metricId]: outcome } };
}

/** the numbers analytics may count — how many questions were offered a
 *  suggestion and what happened to each. Offered-but-unresolved (the
 *  person backed out) counts under neither, deliberately: a decision
 *  never made is not an ignore. Metric ids are registry ids, the same
 *  ones checkin_step_left already sends; no value and no text. */
export function summary(state: SuggestionState): {
  offered: number; accepted: number; changed: number; ignored: number;
  perMetric: { id: string; outcome: SuggestionOutcome | null }[];
} {
  let accepted = 0, changed = 0, ignored = 0;
  const perMetric = state.offered.map((o) => {
    const oc = state.outcome[o.id] || null;
    if (oc === 'accepted') accepted++;
    else if (oc === 'changed') changed++;
    else if (oc === 'ignored') ignored++;
    return { id: o.id, outcome: oc };
  });
  return { offered: state.offered.length, accepted, changed, ignored, perMetric };
}
