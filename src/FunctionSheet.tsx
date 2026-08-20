/**
 * The function check-in: how able you are to do the one activity you want
 * back. A SEPARATE 0–10 scale from pain, stored in its own table and never
 * averaged with a pain score.
 *
 * Two modes over one layout:
 *   baseline — right after the activity is chosen: "Set your starting
 *              point" / "How able are you to do this activity today?"
 *   weekly   — from seven days after the last rating: "This week" /
 *              "How able were you to do this activity this week?"
 *
 * The activity's free-text name is never interpolated into the question —
 * it is shown separately under its own label, so the sentence stays
 * grammatical for every possible name.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import * as db from './db';
import { Press } from './motion';
import {
  FUNC_BASELINE_QUESTION, FUNC_BASELINE_TITLE, FUNC_WEEKLY_QUESTION,
  FUNC_WEEKLY_TITLE, mondayOf, todayISO,
} from './model';
import { ABILITY_END_HIGH, ABILITY_END_LOW, ABILITY_MAX } from './painScale';
import { color, font, radius, size } from './theme';

export interface FunctionSheetProps {
  goalText: string;
  /** true = the first-ever rating, taken right after choosing the activity */
  baseline?: boolean;
  onDone: () => void;
  onClose: () => void;
}

export default function FunctionSheet({ goalText, baseline, onDone, onClose }: FunctionSheetProps) {
  const [ability, setAbility] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const save = () => {
    if (ability == null || saving) return;
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const today = todayISO();
    db.putFunc({ week: mondayOf(today), ability, note: note.trim(), savedOn: today });
    onDone();
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.navBar}>
        <Press
          onPress={onClose}
          style={[styles.navBtn, styles.navLeft]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.navBtnText}>Cancel</Text>
        </Press>
        <Text style={styles.navTitle} numberOfLines={1}>
          {baseline ? FUNC_BASELINE_TITLE : FUNC_WEEKLY_TITLE}
        </Text>
        <View style={styles.navSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.q} allowFontScaling maxFontSizeMultiplier={1.6}>
          {baseline ? FUNC_BASELINE_QUESTION : FUNC_WEEKLY_QUESTION}
        </Text>

        {/* the activity, named apart from the sentence */}
        <View style={styles.activity}>
          <Text style={styles.activityLabel}>Activity</Text>
          <Text style={styles.activityName} allowFontScaling maxFontSizeMultiplier={1.5}>
            {goalText}
          </Text>
        </View>

        <Text style={styles.sub} allowFontScaling maxFontSizeMultiplier={1.5}>
          Your own judgement, on its own scale — this is not a pain score.
        </Text>

        <Text style={styles.value} allowFontScaling maxFontSizeMultiplier={1.5}>
          {ability == null ? 'Not set' : ability + '/' + ABILITY_MAX}
        </Text>
        <Slider
          value={ability}
          onChange={setAbility}
          accessibilityLabel={(baseline
            ? 'Ability to do this activity today'
            : 'Ability to do this activity this week') + ', 0 to 10'}
          accessibilityValue={ability == null
            ? { text: 'Not set' }
            : { min: 0, max: ABILITY_MAX, now: ability }}
        />
        <View style={styles.ends}>
          <Text style={styles.endText}>{ABILITY_END_LOW}</Text>
          <Text style={styles.endText}>{ABILITY_END_HIGH}</Text>
        </View>

        <Text style={[styles.q, styles.qLater]} allowFontScaling maxFontSizeMultiplier={1.5}>
          {baseline ? 'Anything worth noting about where you’re starting?' : 'Anything worth remembering about this week?'}
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Optional"
          placeholderTextColor={color.textTertiary}
          style={styles.input}
          multiline
          accessibilityLabel="Optional note"
        />

        <Press
          onPress={save}
          disabled={ability == null || saving}
          pressScale={ability == null ? 1 : 0.985}
          accessibilityRole="button"
          accessibilityState={{ disabled: ability == null || saving }}
          accessibilityHint={ability == null ? 'Move the slider to choose a value first' : undefined}
          style={[styles.primary, (ability == null || saving) && styles.primaryOff]}
        >
          <Text style={[styles.primaryText, (ability == null || saving) && styles.primaryTextOff]}>
            Save
          </Text>
        </Press>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 72 },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 72, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navLeft: { alignItems: 'flex-start' },
  navBtnText: { color: color.tint, fontSize: font.body },
  body: { padding: size.sheetX, paddingTop: 22, paddingBottom: 30 },
  q: { color: color.textPrimary, fontSize: font.title3, fontWeight: '600', lineHeight: 27 },
  qLater: { marginTop: 34, fontSize: font.body, fontWeight: '400', lineHeight: 23 },
  activity: {
    marginTop: 16, padding: 14, borderRadius: radius.card,
    backgroundColor: color.bgSurface, gap: 2,
  },
  activityLabel: { color: color.textSecondary, fontSize: font.footnote },
  activityName: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  sub: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 14 },
  value: {
    color: color.textPrimary, fontSize: 34, fontWeight: '700',
    marginTop: 22, marginBottom: 6, fontVariant: ['tabular-nums'],
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 8 },
  endText: { color: color.textTertiary, fontSize: font.footnote },
  input: {
    marginTop: 10, minHeight: 64, borderRadius: 12, padding: 12,
    backgroundColor: color.bgSurface, color: color.textPrimary, fontSize: font.body,
    textAlignVertical: 'top',
  },
  primary: {
    minHeight: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 30, paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
  primaryOff: { backgroundColor: color.bgSegmentActive },
  primaryTextOff: { color: color.textTertiary },
});
