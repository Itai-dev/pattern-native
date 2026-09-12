/**
 * Starting an experiment — one phrase, in the person's words, and Start.
 *
 * The sheet is deliberately small. Two weeks is fixed, the outcome is
 * fixed (the next morning's number), and the only thing to decide is
 * what to try. Four examples are offered as chips because a blank field
 * asks for imagination on a day that may not have any; a tap fills the
 * field and the words stay editable. Nothing here suggests what WOULD
 * help — the examples are the four most ordinary things people try,
 * and the sheet says what the app will and will not do with the answer.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as db from './db';
import { Press } from './motion';
import { EXPERIMENT_DAYS } from './thresholds';
import { EXPERIMENT_EXAMPLES, EXPERIMENT_WHAT_MAX } from './experiment';
import { todayISO } from './model';
import { themeBrand } from './painScale';
import { color, font, radius, size } from './theme';

export interface ExperimentSheetProps {
  onDone: () => void;
  onClose: () => void;
}

export default function ExperimentSheet({ onDone, onClose }: ExperimentSheetProps) {
  const [what, setWhat] = useState('');
  /* the selected chip wears the theme's brand, as onboarding's do — a
     colour that carries no pain meaning */
  const brand = themeBrand();
  const ready = what.trim().length > 0;

  const start = () => {
    if (!ready) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    db.startExperiment(what, todayISO());
    onDone();
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
          One thing, for {EXPERIMENT_DAYS} days.
        </Text>
        <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.4}>
          Each evening Pattern asks whether it happened. At the end it
          compares the mornings after the days it did with the mornings
          after the days it didn’t, and tells you what it found — a
          difference, no difference, or too few days to say.
        </Text>

        <Text style={styles.label} allowFontScaling maxFontSizeMultiplier={1.3}>
          What will you try?
        </Text>
        <TextInput
          value={what}
          onChangeText={(t) => setWhat(t.slice(0, EXPERIMENT_WHAT_MAX))}
          placeholder="In your own words"
          placeholderTextColor={color.textTertiary}
          style={styles.input}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={start}
          accessibilityLabel="What will you try?"
        />
        <View style={styles.chips}>
          {EXPERIMENT_EXAMPLES.map((ex) => (
            <Press
              key={ex}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setWhat(ex); }}
              pressOpacity={0.8}
              style={[styles.chip, what === ex && { backgroundColor: brand, borderColor: brand }]}
              accessibilityRole="button"
              accessibilityLabel={'Try: ' + ex}
            >
              <Text style={[styles.chipText, what === ex && styles.chipTextOn]}
                allowFontScaling maxFontSizeMultiplier={1.3}>{ex}</Text>
            </Press>
          ))}
        </View>

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
