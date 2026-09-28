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
 * the ramp. The one qualifying sentence sits behind the (i), inside the
 * card, per the house rule.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import InfoTip from './InfoTip';
import { Press } from './motion';
import {
  DailyGuidance, GOAL_ACTIVITIES, GoalActivity, RecoveryGoal, RecoveryHero, goalLabel,
} from './recovery';
import { CapacityView } from './health/capacity';
import { capitalise } from './health/workoutNames';
import { CAPACITY_HARDER_POINTS } from './thresholds';
import { color, font, radius, size } from './theme';

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
  const card = [styles.card, flush && styles.flush];

  if (step === 'often' && picked) {
    return (
      <View style={card}>
        <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>Your goal</Text>
        <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
          How many sessions a week are you aiming for?
        </Text>
        <View style={styles.chips}>
          {WEEKLY_CHOICES.map((n) => (
            <Press key={n} onPress={() => onSave(picked, other, n)} style={styles.chip}
              accessibilityRole="button" accessibilityLabel={n + ' a week'}>
              <Text style={styles.chipText} allowFontScaling maxFontSizeMultiplier={1.3}>{n}</Text>
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
      <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>Your goal</Text>
      <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
        What are you trying to get back to?
      </Text>
      <View style={styles.chips}>
        {GOAL_ACTIVITIES.map((a) => (
          <Press key={a} onPress={() => { setPicked(a); if (a !== 'other') setStep('often'); }}
            style={[styles.chip, picked === a && styles.chipOn]}
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

/* ── the activity card ──────────────────────────────────── */

/**
 * The goal, today's suggestion, and — folded — what each activity's
 * sessions have shown. `hero` is null without an answered goal; the
 * card still speaks when there are sessions to read.
 */
export function ActivityCard({ hero, guidance, capacity, onEdit, onCheckIn }: {
  hero: RecoveryHero | null;
  guidance: DailyGuidance;
  capacity: CapacityView | null;
  onEdit: () => void;
  onCheckIn: () => void;
}) {
  const [open, setOpen] = useState(false);
  const detail = !!capacity && (capacity.insights.length > 0 || !!capacity.collecting);
  return (
    <View style={styles.card}>
      {hero ? (
        <Press onPress={onEdit} pressOpacity={0.7} accessibilityRole="button"
          accessibilityLabel={hero.title + '. ' + hero.progressLine}
          accessibilityHint="Change your goal">
          <View style={styles.headRow}>
            <Text style={styles.heroTitle} allowFontScaling maxFontSizeMultiplier={1.3}>{hero.title}</Text>
            <Text style={styles.chev} allowFontScaling={false}>›</Text>
          </View>
          <Text style={styles.heroProgress} allowFontScaling maxFontSizeMultiplier={1.3}>{hero.progressLine}</Text>
        </Press>
      ) : (
        <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>Your activity</Text>
      )}

      {hero && <View style={styles.rule} />}
      <Text style={[styles.body, hero && styles.first]} allowFontScaling maxFontSizeMultiplier={1.4}>
        {guidance.headline}
      </Text>
      <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>{guidance.recommendation}</Text>
      {!!guidance.recommendedLoad && (
        <Text style={styles.load} allowFontScaling maxFontSizeMultiplier={1.3}>{guidance.recommendedLoad}</Text>
      )}
      {guidance.checkIn && (
        <Press onPress={onCheckIn} style={styles.link} accessibilityRole="button" accessibilityLabel="Check in">
          <Text style={styles.linkGo} allowFontScaling maxFontSizeMultiplier={1.3}>Check in</Text>
        </Press>
      )}

      {/* the per-activity conclusions: the evidence under the one
          suggestion above, for whoever wants it — folded, because the
          suggestion is the answer and this is the working */}
      {detail && (
        <>
          <Press onPress={() => setOpen(!open)} style={styles.link} accessibilityRole="button"
            accessibilityState={{ expanded: open }} accessibilityLabel="What your sessions show">
            <Text style={styles.linkGo} allowFontScaling maxFontSizeMultiplier={1.3}>
              {open ? 'Hide' : 'What your sessions show'}
            </Text>
          </Press>
          {open && (
            <View style={styles.detail}>
              <Text style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>{capacity!.headline}</Text>
              {capacity!.insights.slice(0, 3).map((c) => (
                <View key={c.key} style={styles.insight}>
                  <Text style={styles.insightText} allowFontScaling maxFontSizeMultiplier={1.4}>{c.text}</Text>
                  <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>{c.why}</Text>
                </View>
              ))}
              {!!capacity!.collecting && (
                <Text style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>{capacity!.collecting}</Text>
              )}
            </View>
          )}
        </>
      )}
      <InfoTip label="What this is based on" text={ACTIVITY_NOTE} />
    </View>
  );
}

/** what the card is and is not — inside the card, behind its (i). The
 *  two notes the old cards carried, said once. */
export const ACTIVITY_NOTE =
  'Read from your own sessions: a session went fine when your next morning’s check-in was less than '
  + CAPACITY_HARDER_POINTS + ' points above that day’s morning. It shows what followed your sessions, '
  + 'not what caused anything. Soreness after exercise is common and is not damage. Effort is Apple’s '
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
  first: { marginTop: 0 },
  load: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21, marginTop: 4 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTitle: { flex: 1, color: color.textPrimary, fontSize: font.title2, fontWeight: '700', letterSpacing: -0.2 },
  chev: { color: color.textTertiary, fontSize: 18, marginTop: -2 },
  heroProgress: { color: color.textSecondary, fontSize: font.subheadline, marginTop: 4 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: color.borderDivider, marginVertical: 14 },
  detail: { marginTop: 2 },
  insight: { marginTop: 12 },
  insightText: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21 },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
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
