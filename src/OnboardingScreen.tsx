/**
 * The first ninety seconds — two screens, then a check-in.
 *
 * What this deliberately does NOT do is the whole design. It asks for no
 * account, no diagnosis, no medication list, no activity goal, no
 * notification permission and no choice of what to track. Every one of
 * those is a question the app cannot yet make useful, and asking them
 * before someone has recorded a single day is asking them to commit to a
 * tool they have not used. The focus question waits a week for exactly
 * this reason; the reminder question waits until after the first log.
 *
 * So: what it is for, what it is not, a few questions that are cheap to
 * answer on day zero, and out of the way — still under two minutes, and
 * every answer skippable by the same button that submits it.
 *
 * THE NEW QUESTIONS EARN THEIR PLACE THE SAME WAY the understand
 * question always did: they are answerable before the app has been
 * used, and they ask for no commitment. Where it hurts and how long
 * seeds the first check-in's usual-places offer and the report's
 * background. WHAT YOU SUSPECT is the one that matters most — the
 * suspicions are stored, and when the focus offer arrives a week in,
 * it names the thing the person already suspected instead of asking
 * cold. What onboarding still does NOT do is start daily questions:
 * committing to a question a day before answering anything once is
 * committing to a tool you have not used, and the suspicions do not
 * change that — they only make the later offer specific. Nor does the
 * closing line predict a DIRECTION: telling a self-reporting person
 * what you expect biases the reports themselves, so Pattern says what
 * it will watch and never which way it is betting.
 *
 * THE ONE QUESTION IS THE EXCEPTION, and it earns it by asking for
 * nothing. "What are you trying to understand about your pain?" is
 * answerable on day zero — arguably answered best then, because the
 * reason someone just downloaded a pain app is the freshest thing in
 * their head. It commits to no schedule, changes no behaviour, and goes
 * into the doctor summary in their own words whatever else happens.
 *
 * What it does NOT do is choose what to track. That decision waits a
 * week, because picking two questions to answer daily before answering
 * anything once is committing to a tool you have not used. When the week
 * comes, this answer is what makes the offer specific instead of cold.
 *
 * THE SAFETY SCREEN IS SHORT ON PURPOSE. A page of medical disclaimer is
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
import { protocolFactors } from './metrics';
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
  /** they took the Apple Health offer on the final step */
  connectHealth: boolean;
  /** protocol-eligible metric ids, in the order they were tapped —
   *  the first is what the week-later focus offer names */
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
  const [suspicions, setSuspicions] = useState<string[]>([]);
  const [diagnosisText, setDiagnosisText] = useState('');
  const [connectHealth, setConnectHealth] = useState(false);
  /* the usual places, in the coarse words the first check-in's offer
     speaks. collapseSidedLocs is a no-op on these and stays, so a sided
     answer from any future source still stores as the chips read it. */
  const [mapSel, setMapSel] = useState<string[]>([]);
  const brand = themeBrand();
  /* the pool the focus flow itself draws from — one vocabulary, so a
     suspicion marked here IS a factor the offer can test later */
  const factors = protocolFactors();

  /* reading it again from Profile stops at the boundaries — the row says
     "what Pattern is and isn't", and re-asking the question of someone
     who answered it weeks ago is not what they tapped */
  const lastStep = review ? 1 : 5;

  const result = (skippedAt?: number): OnboardingResult => ({
    understand: understand.trim(),
    where: collapseSidedLocs(mapSel),
    duration, diagnosis,
    diagnosisText: diagnosisText.trim(),
    suspicions, connectHealth,
    ...(skippedAt !== undefined ? { skippedAt } : {}),
  });

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step < lastStep) setStep(step + 1);
    else onDone(result());
  };

  /* A WAY OUT, from the third screen on. Six screens is the longest
     stretch between install and first check-in this app has had, and
     someone who installed it during a flare should not have to finish a
     questionnaire to reach the one thing it is for. Everything after
     the boundaries screen is optional and stores as skipped either way;
     this is the same door, earlier. The first two screens are not
     skippable: the promise and the red flags are the two things a
     person must have seen. */
  const skipToCheckin = () => {
    Haptics.selectionAsync().catch(() => {});
    onDone(result(step));
  };
  const canSkip = !review && step >= 2 && step < lastStep;

  const toggleIn = (list: string[], set: (v: string[]) => void, id: string) => {
    Haptics.selectionAsync().catch(() => {});
    set(list.indexOf(id) >= 0 ? list.filter((x) => x !== id) : list.concat(id));
  };

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
              what happens around it. Over time, Pattern helps you notice
              relationships worth paying attention to — and makes a summary
              you can bring to your doctor.
            </Text>
            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              One answer is enough. Everything else is optional, always.
            </Text>
          </>
        ) : step === 1 ? (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              What Pattern{'\n'}is and isn’t.
            </Text>
            <Text style={styles.body1} allowFontScaling maxFontSizeMultiplier={1.4}>
              Pattern helps you record and understand your own experience. It
              does not diagnose conditions, identify causes, advise on
              medication, or replace medical care.
            </Text>

            <View style={styles.card}>
              <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
                Know when not to log
              </Text>
              {/* shorter, but every red flag stays: numbness, weakness,
                  fever and bladder or bowel loss are the signs that turn
                  back pain into an emergency, and a safety card that
                  drops them to read nicer protects nobody */}
              <Text style={styles.cardBody} allowFontScaling maxFontSizeMultiplier={1.4}>
                Sudden severe pain, chest pain, a serious injury, or pain with
                numbness, weakness, fever, or loss of bladder or bowel control
                needs medical attention now — not a check-in.
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
        ) : step === 2 ? (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              Where does it{'\n'}usually hurt?
            </Text>
            <Text style={styles.body1} allowFontScaling maxFontSizeMultiplier={1.4}>
              Tap any that apply — one or more places, or none. It seeds your
              first check-in, nothing else.
            </Text>
            {/* the coarse chips, not the body map. The map lived here for
                a while; it made this the heaviest screen a person in pain
                met in the whole app, and it now lives in the check-in's
                where step, where it does daily work. Day zero needs the
                usual places in one tap each, and nothing more precise. */}
            <View style={styles.chips}>
              {LOC_CHIP_IDS.map((id) => {
                const on = mapSel.indexOf(id) >= 0;
                return (
                  <Press
                    key={id}
                    onPress={() => toggleIn(mapSel, setMapSel, id)}
                    pressOpacity={0.8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={LOC_NAMES[id]}
                    style={[styles.chip, on && { backgroundColor: brand, borderColor: brand }]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>
                      {LOC_NAMES[id]}
                    </Text>
                  </Press>
                );
              })}
            </View>

            <Text style={styles.smallQ} allowFontScaling maxFontSizeMultiplier={1.3}>
              How long has this been going on?
            </Text>
            <View style={styles.chips}>
              {([['weeks', 'A few weeks'], ['months', 'Months'], ['years', 'A year or more']] as const).map(([id, label]) => {
                const on = duration === id;
                return (
                  <Press key={id}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setDuration(on ? '' : id); }}
                    pressOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={label}
                    style={[styles.chip, on && { backgroundColor: brand, borderColor: brand }]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>{label}</Text>
                  </Press>
                );
              })}
            </View>

            <Text style={styles.smallQ} allowFontScaling maxFontSizeMultiplier={1.3}>
              Do you have a diagnosis?
            </Text>
            <View style={styles.chips}>
              {([['yes', 'Yes'], ['no', 'No'], ['looking', 'Still looking']] as const).map(([id, label]) => {
                const on = diagnosis === id;
                return (
                  <Press key={id}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setDiagnosis(on ? '' : id); }}
                    pressOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={label}
                    style={[styles.chip, on && { backgroundColor: brand, borderColor: brand }]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>{label}</Text>
                  </Press>
                );
              })}
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
        ) : step === 3 ? (
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
              Optional, and you can change it later. Pattern will use it to
              decide what may be worth investigating first — no promises about
              when, because that depends on how the record grows.
            </Text>
          </>
        ) : step === 4 ? (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              What do you{'\n'}already wonder about?
            </Text>
            <Text style={styles.body1} allowFontScaling maxFontSizeMultiplier={1.4}>
              Mark anything you suspect. Pattern won’t treat these as answers —
              they decide which questions are worth asking.
            </Text>

            {/* two kinds of suspicion, kept apart on purpose: an
                influence could act ON pain; an accompanying state
                travels WITH it, and a comparison against it asks
                pain↔X rather than X→pain. Blending them is how a
                symptom gets mistaken for a cause. */}
            <Text style={styles.smallQ} allowFontScaling maxFontSizeMultiplier={1.3}>
              Things that might affect it
            </Text>
            <View style={styles.chips}>
              {factors.filter((m) => m.suspectKind === 'influence').map((m) => {
                const on = suspicions.indexOf(m.id) >= 0;
                return (
                  <Press
                    key={m.id}
                    onPress={() => toggleIn(suspicions, setSuspicions, m.id)}
                    pressOpacity={0.8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={m.name}
                    style={[styles.chip, on && { backgroundColor: brand, borderColor: brand }]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>
                      {m.name}
                    </Text>
                  </Press>
                );
              })}
            </View>

            <Text style={styles.smallQ} allowFontScaling maxFontSizeMultiplier={1.3}>
              Things that often come with it
            </Text>
            <View style={styles.chips}>
              {factors.filter((m) => m.suspectKind === 'accompanies').map((m) => {
                const on = suspicions.indexOf(m.id) >= 0;
                return (
                  <Press
                    key={m.id}
                    onPress={() => toggleIn(suspicions, setSuspicions, m.id)}
                    pressOpacity={0.8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={m.name}
                    style={[styles.chip, on && { backgroundColor: brand, borderColor: brand }]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>
                      {m.name}
                    </Text>
                  </Press>
                );
              })}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              Some of this can{'\n'}arrive on its own.
            </Text>
            {/* the permission request at the moment it has a reason —
                "find it later in Profile" was friction wearing a
                privacy costume. Still a choice, defaulting to no. */}
            <Text style={styles.body1} allowFontScaling maxFontSizeMultiplier={1.4}>
              Connect Apple Health, and last night’s sleep and today’s activity
              sit beside your check-ins on their own. You choose exactly what
              Pattern can read, nothing is written back, and it all stays on
              this iPhone.
            </Text>
            <View style={styles.chips}>
              {([[true, 'Connect Apple Health'], [false, 'Not now']] as const).map(([v, label]) => {
                const on = connectHealth === v;
                return (
                  <Press key={label}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setConnectHealth(v); }}
                    pressOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={label}
                    style={[styles.chip, on && { backgroundColor: brand, borderColor: brand }]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>{label}</Text>
                  </Press>
                );
              })}
            </View>

            {/* SOURCES, never directions — a predicted direction handed
                to a self-reporting person biases the reports themselves */}
            <View style={styles.card}>
              <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
                What Pattern will watch
              </Text>
              <Text style={styles.cardBody} allowFontScaling maxFontSizeMultiplier={1.4}>
                {'Your check-ins, always.'
                  + (connectHealth ? ' Sleep and activity, from Apple Health.' : '')
                  + (suspicions.length
                    ? ' As your record grows, Pattern will offer to properly test '
                      + (factors.filter((m) => m.id === suspicions[0])[0] || { name: 'it' }).name.toLowerCase()
                      + (suspicions.length > 1 ? ' first — the rest wait their turn.' : '.')
                    : ' As your record grows, it will offer something worth testing.')}
              </Text>
            </View>
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
        {step === 3 && !understand.trim() && (
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
          {(review ? [0, 1] : [0, 1, 2, 3, 4, 5]).map((i) => (
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
