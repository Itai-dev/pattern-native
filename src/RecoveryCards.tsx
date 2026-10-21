/**
 * The activity card on Today, the goal's setup, and the goal's row in
 * Profile. The model is recovery.ts and health/capacity.ts; these only
 * lay it out.
 *
 * ONE CARD, NOT THREE (28 Sep 2026). Today briefly opened on a goal
 * card, a "For today" card and a "What you can do" card — three reads
 * of the same sessions against the same next mornings, each saying
 * "your load appears well tolerated" in its own words before the
 * person reached their own check-in. They are one card now: the goal
 * on top, the one suggestion for today under it, and the per-activity
 * conclusions folded behind a single toggle for whoever wants the why.
 *
 * NO BAR. The goal's weekly target used to be a row of segments that
 * filled — a completion meter by another name. The count is a sentence
 * now, with the target beside it, and a week short of it is just a
 * smaller number.
 *
 * NEUTRAL THROUGHOUT. Nothing here is a pain value, so nothing takes
 * the ramp. The short "not medical advice" line stays in plain view
 * beside the minutes, inside the card, per the house rule; the full
 * note is under "Why?".
 *
 * ONE WAY IN TO THE WORKING (21 Oct 2026, the calm pass). The card had
 * two doors to the same question — "What your sessions show" and an (i)
 * on its own row — and four visible readings of one suggestion: the
 * effort, the minutes, the recommendation and a grey headline. Testers
 * read it as crowded. The visible card is now the suggestion and its
 * one not-line; the headline, the per-activity conclusions, what is
 * still collecting and the full note sit together under a single
 * "Why?". The card's "Check in" link went too: the + and the check-in
 * card below already ask, and the empty card still says "Due now"
 * when a check-in this morning would answer a waiting session.
 *
 * HEALTH'S ANATOMY (21 Oct 2026, the approved Main mockup). The goal
 * stands on the ground above the card as Today's section title, the way
 * Health puts "Activity" over its cards; the card under it leads with
 * the suggested minutes as a big rounded value and keeps every sentence
 * it had. Only the look moved — the order of Today, what the card says
 * and when it says it are recovery.ts's, untouched.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Press } from './motion';
import {
  DailyGuidance, GOAL_ACTIVITIES, GoalActivity, RecoveryGoal, RecoveryHero, goalLabel,
} from './recovery';
import { CapacityView } from './health/capacity';
import { capitalise } from './health/workoutNames';
import { CAPACITY_HARDER_POINTS } from './thresholds';
import { color, font, radius, size } from './theme';
import { BigValue, CardHeader, Chevron, Num, ROUNDED, card as summaryCard, summary } from './SummaryCard';
import { activityIcon } from './Icon';

/** the choices for a weekly target — shared with onboarding */
export const WEEKLY_CHOICES = [1, 2, 3, 4, 5];

/** the stored form of "asked, and not now" */
export function skippedGoal(today: string): RecoveryGoal {
  return { v: 1, activity: null, label: '', weeklySessions: null, setOn: today };
}

/** turn the setup's answers into the stored goal */
export function makeGoal(activity: GoalActivity, other: string, weekly: number | null, today: string): RecoveryGoal {
  return { v: 1, activity, label: goalLabel(activity, other), weeklySessions: weekly, setOn: today };
}

/* ── goal setup ─────────────────────────────────────────── */

export function GoalSetup({ initial, onSave, onSkip, onCancel, onRemove, flush }: {
  initial: RecoveryGoal | null;
  onSave: (activity: GoalActivity, other: string, weekly: number | null) => void;
  /** "not now": stored as a skip, so the offer does not return */
  onSkip?: () => void;
  /** editing an existing goal: back out without changing it */
  onCancel?: () => void;
  /** editing an existing goal: stop having one */
  onRemove?: () => void;
  /** no page gutter — inside a sheet that already has one */
  flush?: boolean;
}) {
  const [picked, setPicked] = useState<GoalActivity | null>(initial && initial.activity ? initial.activity : null);
  const [other, setOther] = useState(initial && initial.activity === 'other' ? initial.label : '');
  const [step, setStep] = useState<'what' | 'often'>('what');
  /* On Today it wears the Summary card; in Profile (flush) it keeps the
     sheet's grammar, which is that screen's to change, not this one's. */
  const card = flush ? [styles.card, styles.flush] : summaryCard.box;
  const head = flush
    ? <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>Your goal</Text>
    : <CardHeader icon="flag.fill" label="Your goal" />;
  const title = flush ? styles.title : [summaryCard.question, styles.question];

  if (step === 'often' && picked) {
    return (
      <View style={card}>
        {head}
        <Text style={title} allowFontScaling maxFontSizeMultiplier={1.3}>
          How many sessions a week are you aiming for?
        </Text>
        <View style={styles.chips}>
          {WEEKLY_CHOICES.map((n) => (
            <Press key={n} onPress={() => onSave(picked, other, n)} style={styles.chip}
              hitSlop={{ top: 8, bottom: 4, left: 4, right: 4 }}
              accessibilityRole="button" accessibilityLabel={n + ' a week'}>
              <Text style={[styles.chipText, styles.chipNum]} allowFontScaling maxFontSizeMultiplier={1.3}>{n}</Text>
            </Press>
          ))}
        </View>
        <Press onPress={() => onSave(picked, other, null)} style={styles.link}
          accessibilityRole="button" accessibilityLabel="No weekly target">
          <Text style={styles.linkLater} allowFontScaling maxFontSizeMultiplier={1.3}>No target</Text>
        </Press>
      </View>
    );
  }

  return (
    <View style={card}>
      {head}
      <Text style={title} allowFontScaling maxFontSizeMultiplier={1.3}>
        What are you trying to get back to?
      </Text>
      <View style={styles.chips}>
        {GOAL_ACTIVITIES.map((a) => (
          <Press key={a} onPress={() => { setPicked(a); if (a !== 'other') setStep('often'); }}
            style={[styles.chip, picked === a && styles.chipOn]}
            hitSlop={4}
            accessibilityRole="button" accessibilityState={{ selected: picked === a }}
            accessibilityLabel={capitalise(a)}>
            <Text style={[styles.chipText, picked === a && styles.chipTextOn]}
              allowFontScaling maxFontSizeMultiplier={1.3}>{capitalise(a)}</Text>
          </Press>
        ))}
      </View>
      {picked === 'other' && (
        <>
          <TextInput value={other} onChangeText={setOther} maxLength={40} autoFocus
            placeholder="In your words" placeholderTextColor={color.textTertiary}
            accessibilityLabel="Your activity, in your words" style={styles.input} />
          <Press onPress={() => setStep('often')} disabled={!other.trim()} style={styles.link}
            accessibilityRole="button" accessibilityLabel="Next">
            <Text style={[styles.linkGo, !other.trim() && styles.disabled]}
              allowFontScaling maxFontSizeMultiplier={1.3}>Next</Text>
          </Press>
        </>
      )}
      <Text style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>
        Pattern reads how your body responds to it, from your own sessions and mornings.
      </Text>
      <View style={styles.actions}>
        {(onSkip || onCancel) && (
          <Press onPress={onCancel || onSkip} style={styles.link} accessibilityRole="button"
            accessibilityLabel={onCancel ? 'Cancel' : 'Not now — the goal stays in Profile'}>
            <Text style={styles.linkLater} allowFontScaling maxFontSizeMultiplier={1.3}>
              {onCancel ? 'Cancel' : 'Not now'}
            </Text>
          </Press>
        )}
        {onRemove && (
          <Press onPress={onRemove} style={styles.link} accessibilityRole="button"
            accessibilityLabel="Remove your goal">
            <Text style={styles.linkLater} allowFontScaling maxFontSizeMultiplier={1.3}>Remove goal</Text>
          </Press>
        )}
      </View>
    </View>
  );
}

/* ── the goal in Profile ────────────────────────────────── */

/** The goal's one home outside Today. `goal` is what the app reads
 *  (recovery.ts currentGoal). Removing it stores a skip, not a
 *  deletion: the person was asked, and the offer must not come back. */
export function GoalRow({ goal, today, onChange }: {
  goal: RecoveryGoal | null;
  today: string;
  onChange: (g: RecoveryGoal) => void;
}) {
  const [editing, setEditing] = useState(false);
  const answered = !!goal && !!goal.activity;
  if (editing) {
    return (
      <GoalSetup
        flush
        initial={goal}
        onSave={(a, other, weekly) => { onChange(makeGoal(a, other, weekly, today)); setEditing(false); }}
        onCancel={() => setEditing(false)}
        onRemove={answered ? () => { onChange(skippedGoal(today)); setEditing(false); } : undefined}
      />
    );
  }
  return (
    <Press onPress={() => setEditing(true)} style={[styles.card, styles.flush]}
      accessibilityRole="button"
      accessibilityLabel={answered ? 'Your goal: back to ' + goal!.label + '. Change it' : 'Set a goal'}>
      <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>Your goal</Text>
      <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
        {answered ? 'Back to ' + goal!.label : 'What are you trying to get back to?'}
      </Text>
      {answered && !!goal!.weeklySessions && (
        <Text style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>
          Aiming for {goal!.weeklySessions} a week
        </Text>
      )}
      <Text style={[styles.linkGo, styles.rowLink]} allowFontScaling maxFontSizeMultiplier={1.3}>
        {answered ? 'Change' : 'Set a goal, if you want'}
      </Text>
    </Press>
  );
}

/* ── the goal, as Today's section title ─────────────────── */

// GOAL HEADER
/**
 * "Back to running" and the week's sessions as a sentence, standing on
 * the ground above the activity card — Health's section header, not a
 * card of its own, because it is the heading the card is read under and
 * a box around it made two things of one. ONE block on purpose: the
 * goal and its line are found here and only here, so whatever this
 * comes to open (it opens the goal's setup today) changes in one place.
 * The chevron is the promise that it opens something.
 *
 * A TITLE AND ONE LINE (21 Oct 2026, the calm pass). The roadmap's
 * place used to be a third line here, stacked over the card; it is the
 * first thing the roadmap the chevron opens says, so on Today it is
 * spoken to VoiceOver and not drawn. Two lines read as a heading; three
 * read as another card without a box.
 */
export function GoalHeader({ hero, onPress, roadmapLine }: {
  hero: RecoveryHero; onPress: () => void;
  /** where they are on the roadmap (coach.ts) — present when the
   *  header opens the roadmap rather than the goal's setup; heard, not
   *  shown */
  roadmapLine?: string | null;
}) {
  return (
    <Press onPress={onPress} pressOpacity={0.7} style={styles.goalHead} accessibilityRole="button"
      accessibilityLabel={hero.title + '. ' + hero.progressLine + (roadmapLine ? '. ' + roadmapLine : '')}
      accessibilityHint={roadmapLine ? 'Opens your roadmap and achievements' : 'Change your goal'}>
      <View style={styles.goalText}>
        <Text style={styles.goalTitle} allowFontScaling maxFontSizeMultiplier={1.3}>{hero.title}</Text>
        <Text style={styles.goalLine} allowFontScaling maxFontSizeMultiplier={1.3}>
          <Num>{hero.progressLine}</Num>
        </Text>
      </View>
      <Chevron />
    </Press>
  );
}

/* The load arrives as one sentence from recovery.ts — "28–33 min at an
   easy effort", "Up to 33 min at a moderate effort", "Around 30 min, at
   an easy effort". The card takes it apart only to SET it: the minutes
   become the big value, the effort the fact at the top right. Anything
   the pattern does not recognise is shown whole, as before, so a new
   wording in recovery.ts can never lose its words on this card. */
const LOAD = /^(Up to |Around )?(\d+(?:–\d+)?) min(?:,? at (?:an?) (easy|moderate|hard) effort)?$/;

function splitLoad(load: string): { prefix?: string; minutes: string; effort?: string } | null {
  const m = LOAD.exec(load);
  if (!m) return null;
  return {
    prefix: m[1] ? m[1].trim() : undefined,
    minutes: m[2],
    effort: m[3] ? capitalise(m[3]) + ' effort' : undefined,
  };
}

/* ── the activity card ──────────────────────────────────── */

/**
 * The goal, today's suggestion, and — folded under one "Why?" — what
 * it rests on. `hero` is null without an answered goal; the card still
 * speaks when there are sessions to read.
 */
export function ActivityCard({ hero, guidance, capacity, onEdit, roadmapLine, onRoadmap, activity }: {
  hero: RecoveryHero | null;
  guidance: DailyGuidance;
  capacity: CapacityView | null;
  onEdit: () => void;
  /** the roadmap (coach.ts): with it, the goal header opens the roadmap,
   *  and the goal itself is changed from there or from Profile */
  roadmapLine?: string | null;
  onRoadmap?: () => void;
  /** the goal's activity, for the card's figure */
  activity?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const load = guidance.recommendedLoad ? splitLoad(guidance.recommendedLoad) : null;
  return (
    <>
      {hero && (onRoadmap
        ? <GoalHeader hero={hero} onPress={onRoadmap} roadmapLine={roadmapLine} />
        : <GoalHeader hero={hero} onPress={onEdit} />)}
      <View style={summaryCard.box}>
        <CardHeader icon={activityIcon(activity)} label="Your activity" meta={load ? load.effort : undefined} />

        {load ? (
          /* WITH A NUMBER: the minutes first, as Health leads with the
             value, then what to consider doing. What it rests on is the
             first thing under "Why?". VoiceOver hears the load exactly
             as recovery.ts wrote it. */
          <>
            <View style={styles.value} accessible accessibilityLabel={guidance.recommendedLoad!}>
              <BigValue prefix={load.prefix} value={load.minutes} unit="min" />
            </View>
            <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.3}>
              <Num>{guidance.recommendation}</Num>
            </Text>
          </>
        ) : (
          /* WITHOUT ONE: the sentences in the order they always had —
             what the record shows, then what would move it. They are the
             card's content here, so they stay in view. No value is
             drawn, because a big number the card does not have would be
             the one thing on it that is made up. */
          <>
            <Text style={[summaryCard.sub, styles.first]} allowFontScaling maxFontSizeMultiplier={1.4}>
              <Num>{guidance.headline}</Num>
            </Text>
            <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.3}>
              <Num>{guidance.recommendation}</Num>
            </Text>
            {!!guidance.recommendedLoad && (
              <Text style={styles.load} allowFontScaling maxFontSizeMultiplier={1.3}>
                <Num>{guidance.recommendedLoad}</Num>
              </Text>
            )}
          </>
        )}
        {/* the flare note stays in view: it is the reason the card is not
            suggesting longer today, and a reason folded away reads as the
            card going quiet for nothing */}
        {!!guidance.note && (
          <Text style={[summaryCard.sub, styles.subGap]} allowFontScaling maxFontSizeMultiplier={1.4}>
            {guidance.note}
          </Text>
        )}
        {/* the "not" line the mockup carries under the minutes: a number
            this card suggests is the one most likely to be read as an
            instruction, so the sentence that says it is not one sits in
            plain view beside it. The full note is under "Why?". */}
        {!!guidance.recommendedLoad && (
          <Text style={[summaryCard.fine, styles.fineGap]} allowFontScaling maxFontSizeMultiplier={1.4}>
            From your own sessions — not medical advice.
          </Text>
        )}

        {/* ONE DOOR TO THE WORKING: what the suggestion rests on, each
            activity's conclusions, what is still collecting, and the full
            note — folded, because the suggestion is the answer and this
            is the working. It replaces a toggle and a separate (i) that
            opened two halves of the same explanation. */}
        <Press onPress={() => setOpen(!open)} style={styles.link} accessibilityRole="button"
          accessibilityState={{ expanded: open }} accessibilityLabel="Why this suggestion"
          hitSlop={{ top: 6, bottom: 6 }}>
          <Text style={styles.linkGo} allowFontScaling maxFontSizeMultiplier={1.3}>
            {open ? 'Hide' : 'Why?'}
          </Text>
        </Press>
        {open && (
          <View style={styles.detail}>
            {load && (
              <Text style={[summaryCard.sub, styles.subGap]} allowFontScaling maxFontSizeMultiplier={1.4}>
                <Num>{guidance.headline}</Num>
              </Text>
            )}
            {!!capacity && capacity.insights.length > 0 && (
              <Text style={[summaryCard.sub, styles.subGap]} allowFontScaling maxFontSizeMultiplier={1.4}>
                <Num>{capacity.headline}</Num>
              </Text>
            )}
            {!!capacity && capacity.insights.slice(0, 3).map((c) => (
              <View key={c.key} style={styles.insight}>
                <Text style={styles.insightText} allowFontScaling maxFontSizeMultiplier={1.4}>
                  <Num>{c.text}</Num>
                </Text>
                <Text style={[summaryCard.fine, styles.whyGap]} allowFontScaling maxFontSizeMultiplier={1.4}>
                  <Num>{c.why}</Num>
                </Text>
              </View>
            ))}
            {!!capacity && !!capacity.collecting && (
              <Text style={[summaryCard.sub, styles.subGap]} allowFontScaling maxFontSizeMultiplier={1.4}>
                <Num>{capacity.collecting}</Num>
              </Text>
            )}
            <Text style={[summaryCard.fine, styles.noteGap]} allowFontScaling maxFontSizeMultiplier={1.4}>
              {ACTIVITY_NOTE}
            </Text>
          </View>
        )}
      </View>
    </>
  );
}

/** what the card is and is not — inside the card, under "Why?". The
 *  two notes the old cards carried, said once. */
export const ACTIVITY_NOTE =
  'Read from your own sessions: a session went fine when your next morning’s check-in was less than '
  + CAPACITY_HARDER_POINTS + ' points above that day’s morning. It shows what followed your sessions, '
  + 'not what caused anything. A morning can also be harder for reasons that have nothing to do with the session — a bad night, a flare, or the morning stiffness some conditions bring — which is why one harder morning only holds the next step, and never sets it back on its own. Soreness after exercise is common and is not damage. Effort is Apple’s '
  + '1–10 from your Watch or your own rating in Fitness. This is not medical advice, and a clinician’s '
  + 'plan comes first.';

const styles = StyleSheet.create({
  card: {
    marginHorizontal: size.pageX, marginTop: 14,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider, padding: 16,
  },
  flush: { marginHorizontal: 0, marginTop: 0 },
  eyebrow: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '600' },
  title: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 24, marginTop: 6 },
  body: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 8 },

  /* the goal header: the mockup's section title, 22 bold over a 15 grey
     line, on the ground at the cards' edge. 6 above lands it 24 under
     the large title (the bar's 14 and the page's 4 come first); 4 below
     plus the card's own 10 is the mockup's 14 to the card. */
  goalHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: size.pageX, marginTop: 6, paddingBottom: 4,
  },
  goalText: { flex: 1, gap: 2 },
  goalTitle: { color: summary.text, fontSize: 22, fontWeight: '700', letterSpacing: -0.33 },
  goalLine: { color: summary.secondary, fontSize: 15, lineHeight: 20 },

  /* the activity card, in the Summary grammar (SummaryCard.tsx) */
  value: { marginTop: 10 },
  lead: { color: summary.text, fontSize: font.body, fontWeight: '600', lineHeight: 22, marginTop: 8 },
  first: { marginTop: 10 },
  subGap: { marginTop: 6 },
  fineGap: { marginTop: 10 },
  whyGap: { marginTop: 4 },
  noteGap: { marginTop: 12 },
  load: { color: summary.text, fontSize: font.subheadline, lineHeight: 21, marginTop: 4 },
  detail: { marginTop: 2 },
  insight: { marginTop: 12 },
  insightText: { color: summary.text, fontSize: font.subheadline, lineHeight: 21 },
  /* the goal setup's question on Today, set as the check-in's is */
  question: { marginTop: 10 },
  chipNum: { fontFamily: ROUNDED, fontWeight: '600' },
  /* 4 + 8 = the old 12, with the first row's top slop inside the box */
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, paddingTop: 8 },
  chip: {
    minHeight: 36, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 18,
    borderWidth: 1, borderColor: color.borderControl,
  },
  chipOn: { backgroundColor: color.textPrimary, borderColor: color.textPrimary },
  chipText: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '500' },
  chipTextOn: { color: color.bgSurface },
  input: {
    color: color.textPrimary, borderColor: color.borderControl, borderWidth: 1,
    borderRadius: 10, padding: 12, marginTop: 12, fontSize: font.body,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  link: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', marginTop: 4 },
  linkGo: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  rowLink: { marginTop: 10 },
  linkLater: { color: color.textTertiary, fontSize: font.subheadline, fontWeight: '500' },
  disabled: { opacity: 0.4 },
});
