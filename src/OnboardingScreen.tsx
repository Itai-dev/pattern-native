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
 * So: what it is for, what it is not, one question, and out of the way.
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
import { themeBrand } from './painScale';
import { color, font, radius, size } from './theme';

export interface OnboardingScreenProps {
  /** finished — record it and open the first check-in. `understand` is
   *  whatever they typed, trimmed; empty when skipped. */
  onDone: (understand: string) => void;
  /** Reading it again from Profile, not arriving for the first time. The
     spec requires the urgent-care guidance to stay reachable, and a
     safety card shown once and never again is not reachable — it is
     remembered or lost. */
  review?: boolean;
}

export default function OnboardingScreen({ onDone, review }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [understand, setUnderstand] = useState('');
  const brand = themeBrand();

  /* reading it again from Profile stops at the boundaries — the row says
     "what Pattern is and isn't", and re-asking the question of someone
     who answered it weeks ago is not what they tapped */
  const lastStep = review ? 1 : 2;

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step < lastStep) setStep((step + 1) as 0 | 1 | 2);
    else onDone(understand.trim());
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.root,
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
              A quick daily check-in builds a clear record of how your pain
              changes across time, body areas, and everyday context.
            </Text>
            <Text style={styles.body1} allowFontScaling maxFontSizeMultiplier={1.4}>
              Over weeks it becomes something better than memory — and a
              summary worth bringing to your doctor.
            </Text>
            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              One answer is a complete check-in. Everything else is optional,
              always.
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
                Don’t log it — get help
              </Text>
              <Text style={styles.cardBody} allowFontScaling maxFontSizeMultiplier={1.4}>
                Sudden severe pain, pain after a serious injury, chest pain, or
                pain with numbness, weakness, fever, or loss of bladder or
                bowel control needs a doctor or emergency services now — not a
                check-in.
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
              Optional, and you can change it later. In about a week Pattern
              will use it to suggest something worth watching day to day.
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

        <View style={styles.dots}>
          {(review ? [0, 1] : [0, 1, 2]).map((i) => (
            <View
              key={i}
              style={[styles.dot, i === step && { backgroundColor: color.textSecondary }]}
            />
          ))}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgRoot, paddingHorizontal: 28 },
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
});
