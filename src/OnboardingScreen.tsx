/**
 * The first ninety seconds — three screens, then a check-in.
 *
 * What this deliberately does NOT do is the whole design. It asks for no
 * account, no diagnosis list, no medication list, no activity goal, no
 * notification permission, no Health permission and no choice of what
 * to track. Every one of those is a question the app cannot yet make
 * useful, and asking them before someone has recorded a single day is
 * asking them to commit to a tool they have not used. Each of them has
 * a later moment that explains it: the reminder after the first log,
 * Health on day two, the background on day three, the focus after a
 * week — all as one card at a time on Today.
 *
 * THREE SCREENS, DOWN FROM SIX. The promise and the boundaries share
 * one screen, because the red flags are the one thing a person must
 * have seen and a screen of their own was where they got skipped past.
 * The usual places and how long, one screen, one tap each. Then the
 * one question that earns its place on day zero by asking for nothing:
 * "What are you trying to understand about your pain?" is answerable
 * now — arguably answered best now, because the reason someone just
 * downloaded a pain app is the freshest thing in their head. It
 * commits to no schedule, changes no behaviour, and goes into the
 * doctor summary in their own words whatever else happens.
 *
 * What went, and where. The body map now lives in the check-in's where
 * step, doing daily work instead of day-zero work. The suspicions chips
 * went with the focus flow, which already shows the whole library on
 * the day it is offered; asking them here a week early bought a name
 * for one card and cost a screen. The Health ask is a card on Today.
 *
 * THE SAFETY TEXT IS SHORT ON PURPOSE. A page of medical disclaimer is
 * read by nobody and protects no one — it is the interface equivalent of
 * a mumbled warning. Three sentences that a person actually reads do more
 * than three paragraphs they scroll past, and the red flags are the part
 * that matters: this app must never be the reason someone sits at home
 * with a symptom that needed a doctor tonight.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import { LOC_CHIP_IDS, LOC_NAMES, collapseSidedLocs } from './model';
import { themeBrand } from './painScale';
import { color, font, radius, size } from './theme';

export interface OnboardingResult {
  /** whatever they typed, trimmed; empty when skipped */
  understand: string;
  /** coarse location ids — the first check-in's usual-places offer */
  where: string[];
  /** '' when skipped */
  duration: '' | 'weeks' | 'months' | 'years';
  diagnosis: '' | 'yes' | 'no' | 'looking';
  /** what they were diagnosed with, when diagnosis is 'yes' — a bare
   *  yes gives the record nothing; a name gives the report page one */
  diagnosisText: string;
  /** kept for callers: the Health ask is a Today card now, so this is
   *  always false from here */
  connectHealth: boolean;
  /** kept for callers: the suspicions chips left onboarding, so this
   *  is always empty from here — the focus flow asks on the day it
   *  can use the answer */
  suspicions: string[];
  /** the step (0-based) the person left from, when they took the
   *  shortcut to the first check-in; undefined = walked the whole way */
  skippedAt?: number;
}

export interface OnboardingScreenProps {
  /** finished — record it and open the first check-in */
  onDone: (result: OnboardingResult) => void;
  /** Reading it again from Profile, not arriving for the first time. The
     spec requires the urgent-care guidance to stay reachable, and a
     safety card shown once and never again is not reachable — it is
     remembered or lost. */
  review?: boolean;
}

export default function OnboardingScreen({ onDone, review }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(0);
  const [understand, setUnderstand] = useState('');
  const [duration, setDuration] = useState<OnboardingResult['duration']>('');
  const [diagnosis, setDiagnosis] = useState<OnboardingResult['diagnosis']>('');
  const [diagnosisText, setDiagnosisText] = useState('');
  /* the usual places, in the coarse words the first check-in's offer
     speaks. collapseSidedLocs is a no-op on these and stays, so a sided
     answer from any future source still stores as the chips read it. */
  const [where, setWhere] = useState<string[]>([]);
  const brand = themeBrand();

  /* reading it again from Profile stops at the boundaries — the row says
     "what Pattern is and isn't", and re-asking the question of someone
     who answered it weeks ago is not what they tapped */
  const lastStep = review ? 0 : 2;

  const result = (skippedAt?: number): OnboardingResult => ({
    understand: understand.trim(),
    where: collapseSidedLocs(where),
    duration, diagnosis,
    diagnosisText: diagnosisText.trim(),
    suspicions: [], connectHealth: false,
    ...(skippedAt !== undefined ? { skippedAt } : {}),
  });

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step < lastStep) setStep(step + 1);
    else onDone(result());
  };

  /* A WAY OUT, from the second screen on. Someone who installed this
     during a flare should not have to finish a questionnaire to reach
     the one thing it is for. Everything after the first screen is
     optional and stores as skipped either way; this is the same door,
     earlier. The first screen is not skippable: the promise and the red
     flags are the two things a person must have seen. */
  const skipToCheckin = () => {
    Haptics.selectionAsync().catch(() => {});
    onDone(result(step));
  };
  const canSkip = !review && step >= 1 && step < lastStep;

  const toggleIn = (list: string[], set: (v: string[]) => void, id: string) => {
    Haptics.selectionAsync().catch(() => {});
    set(list.indexOf(id) >= 0 ? list.filter((x) => x !== id) : list.concat(id));
  };

  const chip = (on: boolean, label: string, onPress: () => void, role: 'radio' | 'checkbox') => (
    <Press
      key={label}
      onPress={onPress}
      pressOpacity={0.8}
      accessibilityRole={role}
      accessibilityState={role === 'radio' ? { selected: on } : { checked: on }}
      accessibilityLabel={label}
      style={[styles.chip, on && { backgroundColor: brand, borderColor: brand }]}
    >
      <Text style={[styles.chipText, on && styles.chipTextOn]}
        allowFontScaling maxFontSizeMultiplier={1.3}>{label}</Text>
    </Press>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View
        style={[
          styles.inner,
          { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
        ]}
      >
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {step === 0 ? (
          <>
            {/* three squares of the app's own language, standing in for a
                week — the product explained before a word of it is read */}
            <View style={styles.marks}>
              {[0.25, 0.7, 0.45].map((v, i) => (
                <View
                  key={i}
                  style={[
                    styles.mark,
                    { backgroundColor: brand, opacity: 0.25 + v * 0.75 },
                  ]}
                />
              ))}
            </View>

            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              Make pain feel{'\n'}less random.
            </Text>
            <Text style={styles.body1} allowFontScaling maxFontSizeMultiplier={1.4}>
              A quick check-in builds a record of how your pain changes and
              what happens around it — the thing memory cannot give a doctor
              — and turns it into a summary you can bring to an appointment.
            </Text>
            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              One answer is enough. Everything else is optional, always.
            </Text>

            {/* the boundaries, on the first screen and not a second one:
                the red flags are the sentences a person must have seen,
                and a screen of their own was where they got skipped past.
                Every red flag stays — numbness, weakness, fever and
                bladder or bowel loss are the signs that turn back pain
                into an emergency, and a safety card that drops them to
                read nicer protects nobody. */}
            <View style={styles.card}>
              <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
                Know when not to log
              </Text>
              <Text style={styles.cardBody} allowFontScaling maxFontSizeMultiplier={1.4}>
                Sudden severe pain, chest pain, a serious injury, or pain with
                numbness, weakness, fever, or loss of bladder or bowel control
                needs medical attention now — not a check-in. Pattern does not
                diagnose, identify causes, advise on medication, or replace
                medical care.
              </Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
                Your record stays on this iPhone
              </Text>
              <Text style={styles.cardBody} allowFontScaling maxFontSizeMultiplier={1.4}>
                No account, no sign-in, nothing uploaded. What you write leaves
                this phone only if you export it or share a summary yourself.
              </Text>
            </View>
          </>
        ) : step === 1 ? (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              Where does it{'\n'}usually hurt?
            </Text>
            <Text style={styles.body1} allowFontScaling maxFontSizeMultiplier={1.4}>
              Tap any that apply — one or more places, or none. It seeds your
              first check-in, nothing else.
            </Text>
            <View style={styles.chips}>
              {LOC_CHIP_IDS.map((id) => chip(
                where.indexOf(id) >= 0, LOC_NAMES[id],
                () => toggleIn(where, setWhere, id), 'checkbox'
              ))}
            </View>

            <Text style={styles.smallQ} allowFontScaling maxFontSizeMultiplier={1.3}>
              How long has this been going on?
            </Text>
            <View style={styles.chips}>
              {([['weeks', 'A few weeks'], ['months', 'Months'], ['years', 'A year or more']] as const)
                .map(([id, label]) => chip(
                  duration === id, label,
                  () => { Haptics.selectionAsync().catch(() => {}); setDuration(duration === id ? '' : id); },
                  'radio'
                ))}
            </View>

            <Text style={styles.smallQ} allowFontScaling maxFontSizeMultiplier={1.3}>
              Do you have a diagnosis?
            </Text>
            <View style={styles.chips}>
              {([['yes', 'Yes'], ['no', 'No'], ['looking', 'Still looking']] as const)
                .map(([id, label]) => chip(
                  diagnosis === id, label,
                  () => { Haptics.selectionAsync().catch(() => {}); setDiagnosis(diagnosis === id ? '' : id); },
                  'radio'
                ))}
            </View>
            {/* a bare yes gives the record nothing — the name is what a
                clinician reads. Optional even once opened. */}
            {diagnosis === 'yes' && (
              <TextInput
                value={diagnosisText}
                onChangeText={setDiagnosisText}
                placeholder="What were you diagnosed with?"
                placeholderTextColor={color.textTertiary}
                style={[styles.input, { minHeight: 48, marginTop: 10 }]}
                accessibilityLabel="What were you diagnosed with?"
              />
            )}
          </>
        ) : (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              What do you want{'\n'}to understand?
            </Text>
            <Text style={styles.body1} allowFontScaling maxFontSizeMultiplier={1.4}>
              In your own words — whatever made you open this app. It stays on
              this phone, and it goes into your doctor summary exactly as you
              write it.
            </Text>
            <TextInput
              value={understand}
              onChangeText={setUnderstand}
              placeholder="e.g. why some mornings are so much worse"
              placeholderTextColor={color.textTertiary}
              style={styles.input}
              multiline
              autoFocus={false}
              accessibilityLabel="What are you trying to understand about your pain?"
            />
            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              Optional, and you can change it later. After a week of check-ins,
              Pattern will offer to watch one thing you suspect, properly —
              this is what makes that offer specific instead of cold.
            </Text>
          </>
        )}
      </ScrollView>

      <View style={styles.bottom}>
        <Press
          onPress={advance}
          pressScale={0.985}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel={
            step < lastStep ? 'Continue'
              : review ? 'Done'
                : understand.trim() ? 'Start my first check-in' : 'Skip and start my first check-in'
          }
        >
          <Text style={styles.primaryText}>
            {step < lastStep ? 'Continue' : review ? 'Done' : 'Start my first check-in'}
          </Text>
        </Press>

        {/* the question is genuinely skippable, and says so — a blank
            answer walks through the same button */}
        {step === 2 && !understand.trim() && (
          <Text style={styles.skipHint} allowFontScaling maxFontSizeMultiplier={1.3}>
            Leave it blank if you’d rather just start.
          </Text>
        )}

        {canSkip && (
          <Press
            onPress={skipToCheckin}
            pressOpacity={0.7}
            style={styles.skipBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Skip the rest and start your first check-in"
          >
            <Text style={styles.skipText} allowFontScaling maxFontSizeMultiplier={1.3}>
              Skip the rest and check in
            </Text>
          </Press>
        )}

        <View style={styles.dots}>
          {(review ? [0] : [0, 1, 2]).map((i) => (
            <View
              key={i}
              style={[styles.dot, i === step && { backgroundColor: color.textSecondary }]}
            />
          ))}
        </View>
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  /* the avoider owns nothing it can overwrite — see CheckinScreen */
  root: { flex: 1, backgroundColor: color.bgRoot },
  inner: { flex: 1, paddingHorizontal: 28 },
  body: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20 },
  marks: { flexDirection: 'row', gap: 10, marginBottom: 34 },
  mark: { width: 34, height: 34, borderRadius: 10 },
  title: {
    color: color.textPrimary, fontSize: 34, fontWeight: '700',
    letterSpacing: -0.8, lineHeight: 40, marginBottom: 18,
  },
  body1: {
    color: color.textSecondary, fontSize: font.body, lineHeight: 24, marginBottom: 14,
  },
  fine: {
    color: color.textTertiary, fontSize: font.subheadline, lineHeight: 21, marginTop: 4,
  },
  card: {
    marginTop: 16, padding: 16, borderRadius: radius.card, borderCurve: 'continuous',
    backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider, gap: 6,
  },
  cardTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  cardBody: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21 },
  bottom: { flexShrink: 0, paddingTop: 10 },
  primary: {
    minHeight: size.buttonH, borderRadius: size.buttonH / 2, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
    backgroundColor: color.textPrimary,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
  dots: {
    flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 18,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: color.borderControl,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 19, borderCurve: 'continuous',
    borderWidth: 1, borderColor: color.borderControl, backgroundColor: color.bgSurface,
  },
  chipText: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '500' },
  chipTextOn: { color: '#FFFFFF', fontWeight: '600' },
  smallQ: {
    color: color.textPrimary, fontSize: font.body, fontWeight: '600',
    marginTop: 22, marginBottom: 8,
  },
  input: {
    marginTop: 6, minHeight: 92, borderRadius: 14, borderCurve: 'continuous', padding: 14,
    backgroundColor: color.bgSurface, color: color.textPrimary,
    fontSize: font.body, lineHeight: 22, textAlignVertical: 'top',
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
  },
  skipHint: {
    color: color.textTertiary, fontSize: font.footnote,
    textAlign: 'center', marginTop: 12,
  },
  /* the quiet door: tint, no chrome, a full-height tap target */
  skipBtn: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  skipText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
});
