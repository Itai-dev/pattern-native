/**
 * Today's top two cards: the goal (or its setup) and today's guidance.
 * The model is recovery.ts; these only lay it out.
 *
 * SHORT ON PURPOSE. The screen they replace at the top was paragraphs;
 * a person should read these two in the time it takes to lift a phone.
 * The one qualifying sentence each card needs sits behind its (i),
 * inside the card, per the house rule.
 *
 * NEUTRAL THROUGHOUT. Nothing here is a pain value, so nothing takes
 * the ramp: the progress segments are white on the divider colour, the
 * way every count in the app is.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import InfoTip from './InfoTip';
import { Press } from './motion';
import {
  DailyGuidance, GOAL_ACTIVITIES, GoalActivity, RecoveryGoal, RecoveryHero, goalLabel,
} from './recovery';
import { capitalise } from './health/workoutNames';
import { color, font, radius, size } from './theme';

/* ── goal setup ─────────────────────────────────────────── */

const WEEKLY_CHOICES = [1, 2, 3, 4, 5];

export function GoalSetup({ initial, onSave, onSkip, onCancel }: {
  initial: RecoveryGoal | null;
  onSave: (activity: GoalActivity, other: string, weekly: number | null) => void;
  /** "not now": stored as a skip, so the card does not return */
  onSkip?: () => void;
  /** editing an existing goal: back out without changing it */
  onCancel?: () => void;
}) {
  const [picked, setPicked] = useState<GoalActivity | null>(initial && initial.activity ? initial.activity : null);
  const [other, setOther] = useState(initial && initial.activity === 'other' ? initial.label : '');
  const [step, setStep] = useState<'what' | 'often'>('what');

  if (step === 'often' && picked) {
    return (
      <View style={styles.card}>
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
    <View style={styles.card}>
      <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>Start with your goal</Text>
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
        Pattern will learn how your body responds as you build back.
      </Text>
      {(onSkip || onCancel) && (
        <Press onPress={onCancel || onSkip} style={styles.link} accessibilityRole="button"
          accessibilityLabel={onCancel ? 'Cancel' : 'Not now — the goal can be set later from Today'}>
          <Text style={styles.linkLater} allowFontScaling maxFontSizeMultiplier={1.3}>
            {onCancel ? 'Cancel' : 'Not now'}
          </Text>
        </Press>
      )}
    </View>
  );
}

/** turn the setup's answers into the stored goal */
export function makeGoal(activity: GoalActivity, other: string, weekly: number | null, today: string): RecoveryGoal {
  return { v: 1, activity, label: goalLabel(activity, other), weeklySessions: weekly, setOn: today };
}

/* ── the goal hero ──────────────────────────────────────── */

export function GoalHero({ hero, onEdit }: { hero: RecoveryHero; onEdit: () => void }) {
  const t = hero.weeklyTarget;
  return (
    <Press onPress={onEdit} pressScale={0.985} pressOpacity={0.92} style={styles.card}
      accessibilityRole="button"
      accessibilityLabel={hero.title + '. ' + hero.progressLine + '. ' + hero.status.line}
      accessibilityHint="Change your goal">
      <Text style={styles.heroTitle} allowFontScaling maxFontSizeMultiplier={1.3}>{hero.title}</Text>
      <Text style={styles.heroProgress} allowFontScaling maxFontSizeMultiplier={1.3}>{hero.progressLine}</Text>
      {/* one segment per planned session: a count, so neutral. More
          sessions than planned simply fill every segment — never an
          overflow badge, never a streak */}
      {!!t && (
        <View style={styles.segments} importantForAccessibility="no-hide-descendants">
          {Array.from({ length: t }, (_, i) => (
            <View key={i} style={[styles.segment, i < hero.sessionsThisWeek && styles.segmentOn]} />
          ))}
        </View>
      )}
      <Text style={styles.status} allowFontScaling maxFontSizeMultiplier={1.4}>{hero.status.line}</Text>
    </Press>
  );
}

/* ── today's guidance ───────────────────────────────────── */

export function GuidanceCard({ g, onCheckIn }: { g: DailyGuidance; onCheckIn: () => void }) {
  return (
    <View style={[styles.card, styles.gap]}>
      <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>For today</Text>
      <Text style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>{g.headline}</Text>
      <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>{g.recommendation}</Text>
      {!!g.recommendedLoad && (
        <Text style={styles.load} allowFontScaling maxFontSizeMultiplier={1.3}>{g.recommendedLoad}</Text>
      )}
      {g.checkIn && (
        <Press onPress={onCheckIn} style={styles.link} accessibilityRole="button" accessibilityLabel="Check in">
          <Text style={styles.linkGo} allowFontScaling maxFontSizeMultiplier={1.3}>Check in</Text>
        </Press>
      )}
      <InfoTip label="What this is based on" text={GUIDANCE_NOTE} />
    </View>
  );
}

/** what the guidance is and is not — inside the card, behind its (i) */
export const GUIDANCE_NOTE =
  'Read from your own sessions: a session went fine when your next morning’s check-in was not '
  + '2 or more points above that day’s morning. It shows what followed your sessions, not what '
  + 'caused anything. Soreness after exercise is common and is not damage. This is not medical '
  + 'advice, and a clinician’s plan comes first.';

const styles = StyleSheet.create({
  card: {
    marginHorizontal: size.pageX, marginTop: 14,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider, padding: 16,
  },
  gap: { marginTop: 14 },
  eyebrow: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '600' },
  title: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 24, marginTop: 6 },
  body: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 8 },
  load: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21, marginTop: 4 },
  heroTitle: { color: color.textPrimary, fontSize: 28, fontWeight: '700', letterSpacing: 0.2 },
  heroProgress: { color: color.textSecondary, fontSize: font.subheadline, marginTop: 6 },
  segments: { flexDirection: 'row', gap: 6, marginTop: 12 },
  segment: { flex: 1, height: 6, borderRadius: 3, backgroundColor: color.borderDivider },
  segmentOn: { backgroundColor: color.textPrimary },
  status: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21, marginTop: 12 },
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
  link: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', marginTop: 4 },
  linkGo: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  linkLater: { color: color.textTertiary, fontSize: font.subheadline, fontWeight: '500' },
  disabled: { opacity: 0.4 },
});
