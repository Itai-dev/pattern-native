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
 * So: what it is for, what it is not, and then out of the way.
 *
 * THE SAFETY SCREEN IS SHORT ON PURPOSE. A page of medical disclaimer is
 * read by nobody and protects no one — it is the interface equivalent of
 * a mumbled warning. Three sentences that a person actually reads do more
 * than three paragraphs they scroll past, and the red flags are the part
 * that matters: this app must never be the reason someone sits at home
 * with a symptom that needed a doctor tonight.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import { inkForBg, themeBrand } from './painScale';
import { color, font, radius, size } from './theme';

export interface OnboardingScreenProps {
  /** finished — record it and open the first check-in */
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<0 | 1>(0);
  const brand = themeBrand();

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step === 0) setStep(1);
    else onDone();
  };

  return (
    <View
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
        ) : (
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
        )}
      </ScrollView>

      <View style={styles.bottom}>
        <Press
          onPress={advance}
          pressScale={0.985}
          style={[styles.primary, { backgroundColor: brand }]}
          accessibilityRole="button"
          accessibilityLabel={step === 0 ? 'Continue' : 'Start my first check-in'}
        >
          <Text style={[styles.primaryText, { color: inkForBg(brand) }]}>
            {step === 0 ? 'Continue' : 'Start my first check-in'}
          </Text>
        </Press>

        {/* two dots, no skip: two screens is not a queue to escape */}
        <View style={styles.dots}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={[styles.dot, i === step && { backgroundColor: color.textSecondary }]}
            />
          ))}
        </View>
      </View>
    </View>
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
    marginTop: 16, padding: 16, borderRadius: radius.card,
    backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider, gap: 6,
  },
  cardTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  cardBody: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21 },
  bottom: { flexShrink: 0, paddingTop: 10 },
  primary: {
    minHeight: size.buttonH, borderRadius: size.buttonH / 2,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  primaryText: { fontSize: font.title3, fontWeight: '600' },
  dots: {
    flexDirection: 'row', gap: 7, justifyContent: 'center', marginTop: 18,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: color.borderControl,
  },
});
