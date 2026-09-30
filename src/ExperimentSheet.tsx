/**
 * Starting an experiment — one phrase, in the person's words, and Start.
 *
 * The sheet is deliberately small. Two weeks is fixed, the outcome is
 * fixed (the next morning's number), and the only thing to decide is
 * what to try. Examples are offered as chips because a blank field
 * asks for imagination on a day that may not have any; a tap fills the
 * field and the words stay editable. Nothing here suggests what WOULD
 * help — the examples are ordinary things people try, two of them
 * about food because that is the most suspected and least answered
 * thing of all, and the sheet says what the app will and will not do
 * with the answer.
 *
 * COMPARE TWO (1 Oct 2026). Back on Today as the centre of "what helps,
 * what makes it worse", with a second shape: two options instead of
 * yes-or-no, for the question testers actually had — the usual dose or
 * the lower one, morning or evening. The options are the person's
 * words. The dose note sits under them, before anyone commits a
 * fortnight: Pattern compares mornings, and a dose changes only with
 * the person who prescribed it.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as db from './db';
import { Press } from './motion';
import { EXPERIMENT_DAYS } from './thresholds';
import {
  EXPERIMENT_AB_EXAMPLES, EXPERIMENT_DOSE_NOTE, EXPERIMENT_EXAMPLES, EXPERIMENT_WHAT_MAX,
} from './experiment';
import { EXPERIMENT_OPTION_MAX } from './model';
import { todayISO } from './model';
import { themeBrand } from './painScale';
import { color, font, radius, size } from './theme';

export interface ExperimentSheetProps {
  /** started — true when it compares two options */
  onDone: (two: boolean) => void;
  onClose: () => void;
}

export default function ExperimentSheet({ onDone, onClose }: ExperimentSheetProps) {
  const [what, setWhat] = useState('');
  const [mode, setMode] = useState<'one' | 'two'>('one');
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  /* the selected chip wears the theme's brand, as onboarding's do — a
     colour that carries no pain meaning */
  const brand = themeBrand();
  const two = mode === 'two';
  const ready = what.trim().length > 0
    && (!two || (a.trim().length > 0 && b.trim().length > 0
      && a.trim().toLowerCase() !== b.trim().toLowerCase()));

  const start = () => {
    if (!ready) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    db.startExperiment(what, todayISO(), two ? { a, b } : undefined);
    onDone(two);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View style={styles.navBar}>
        <Press
          onPress={onClose}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.navCancel}>Cancel</Text>
        </Press>
        <Text style={styles.navTitle}>Try something</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
          {two ? 'Two ways, for ' + EXPERIMENT_DAYS + ' days.' : 'One thing, for ' + EXPERIMENT_DAYS + ' days.'}
        </Text>

        {/* the shape: a segmented pair, neutral — neither is the default
            answer to anything, and neither wears a colour */}
        <View style={styles.seg} accessibilityRole="radiogroup">
          {(['one', 'two'] as const).map((m) => (
            <Press key={m} onPress={() => { Haptics.selectionAsync().catch(() => {}); setMode(m); setWhat(''); }}
              style={[styles.segBtn, mode === m && styles.segOn]}
              accessibilityRole="radio" accessibilityState={{ selected: mode === m }}
              accessibilityLabel={m === 'one' ? 'Try one thing' : 'Compare two'}>
              <Text style={[styles.segText, mode === m && styles.segTextOn]}
                allowFontScaling maxFontSizeMultiplier={1.3}>
                {m === 'one' ? 'Try one thing' : 'Compare two'}
              </Text>
            </Press>
          ))}
        </View>

        <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.4}>
          {two
            ? 'Each evening Pattern asks which one it was. At the end it compares the mornings '
              + 'after each, and tells you what it found — a difference, no difference, or too '
              + 'few days to say.'
            : 'Each evening Pattern asks whether it happened. At the end it compares the mornings '
              + 'after the days it did with the mornings after the days it didn’t, and tells you '
              + 'what it found — a difference, no difference, or too few days to say.'}
        </Text>

        <Text style={styles.label} allowFontScaling maxFontSizeMultiplier={1.3}>
          {two ? 'What are you comparing?' : 'What will you try?'}
        </Text>
        <TextInput
          value={what}
          onChangeText={(t) => setWhat(t.slice(0, EXPERIMENT_WHAT_MAX))}
          placeholder="In your own words"
          placeholderTextColor={color.textTertiary}
          style={styles.input}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={two ? undefined : start}
          accessibilityLabel={two ? 'What are you comparing?' : 'What will you try?'}
        />
        {two && (
          <View style={styles.pair}>
            <TextInput value={a} onChangeText={(t) => setA(t.slice(0, EXPERIMENT_OPTION_MAX))}
              placeholder="First" placeholderTextColor={color.textTertiary}
              style={[styles.input, styles.pairInput]} accessibilityLabel="The first option" />
            <Text style={styles.or}>or</Text>
            <TextInput value={b} onChangeText={(t) => setB(t.slice(0, EXPERIMENT_OPTION_MAX))}
              placeholder="Second" placeholderTextColor={color.textTertiary}
              style={[styles.input, styles.pairInput]} accessibilityLabel="The second option" />
          </View>
        )}
        <View style={styles.chips}>
          {two ? EXPERIMENT_AB_EXAMPLES.map((ex) => (
            <Press
              key={ex.what}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setWhat(ex.what); setA(ex.a); setB(ex.b);
              }}
              pressOpacity={0.8}
              hitSlop={6}
              style={[styles.chip, what === ex.what && { backgroundColor: brand, borderColor: brand }]}
              accessibilityRole="button"
              accessibilityLabel={'Compare: ' + ex.a + ' or ' + ex.b}
            >
              <Text style={[styles.chipText, what === ex.what && styles.chipTextOn]}
                allowFontScaling maxFontSizeMultiplier={1.3}>{ex.a} or {ex.b}</Text>
            </Press>
          )) : EXPERIMENT_EXAMPLES.map((ex) => (
            <Press
              key={ex}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setWhat(ex); }}
              pressOpacity={0.8}
              hitSlop={6}
              style={[styles.chip, what === ex && { backgroundColor: brand, borderColor: brand }]}
              accessibilityRole="button"
              accessibilityLabel={'Try: ' + ex}
            >
              <Text style={[styles.chipText, what === ex && styles.chipTextOn]}
                allowFontScaling maxFontSizeMultiplier={1.3}>{ex}</Text>
            </Press>
          ))}
        </View>

        {two && (
          <Text style={styles.dose} allowFontScaling maxFontSizeMultiplier={1.4}>
            {EXPERIMENT_DOSE_NOTE}
          </Text>
        )}

        {/* what it is not, beside the thing — the same sentence the
            result will carry, said before anyone commits a fortnight */}
        <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
          A missed evening is just a missed evening. The result describes
          your record; it is not advice, and it never says what caused what.
        </Text>
      </ScrollView>

      <View style={styles.bottom}>
        <Press
          onPress={start}
          disabled={!ready}
          pressScale={0.985}
          style={[styles.primary, !ready && styles.primaryOff]}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          accessibilityLabel={'Start ' + EXPERIMENT_DAYS + ' days'}
        >
          <Text style={styles.primaryText}>Start {EXPERIMENT_DAYS} days</Text>
        </Press>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: size.sheetX, paddingTop: 14, paddingBottom: 6,
  },
  navCancel: { color: color.tint, fontSize: font.body, width: 56 },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  body: { paddingHorizontal: size.sheetX, paddingTop: 18, paddingBottom: 24, gap: 12 },
  title: {
    color: color.textPrimary, fontSize: font.title2, fontWeight: '700', letterSpacing: -0.3,
  },
  lead: { color: color.textSecondary, fontSize: font.body, lineHeight: 22 },
  label: {
    color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600', marginTop: 10,
  },
  input: {
    color: color.textPrimary, fontSize: font.body,
    backgroundColor: color.bgSurface, borderRadius: radius.card, borderCurve: 'continuous',
    paddingHorizontal: 14, paddingVertical: 12, minHeight: 48,
  },
  seg: {
    flexDirection: 'row', backgroundColor: color.bgSegmentTrack, borderRadius: 10,
    padding: 2, marginTop: 2,
  },
  segBtn: { flex: 1, minHeight: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: color.bgSegmentActive },
  segText: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '500' },
  segTextOn: { color: color.textPrimary, fontWeight: '600' },
  pair: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pairInput: { flex: 1 },
  or: { color: color.textTertiary, fontSize: font.subheadline },
  dose: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    backgroundColor: color.bgSurface,
  },
  chipText: { color: color.textPrimary, fontSize: font.subheadline },
  chipTextOn: { color: '#FFFFFF', fontWeight: '600' },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 6 },
  bottom: { paddingHorizontal: size.sheetX, paddingBottom: 28, paddingTop: 8 },
  primary: {
    /* white on every theme — buttons carry no pain colour (AGENTS.md) */
    minHeight: size.buttonH, borderRadius: size.buttonH / 2, borderCurve: 'continuous',
    backgroundColor: color.textPrimary, alignItems: 'center', justifyContent: 'center',
  },
  primaryOff: { opacity: 0.4 },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
});
