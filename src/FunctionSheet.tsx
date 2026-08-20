/**
 * The weekly function check-in: how able you felt to do the one activity
 * you want back.
 *
 * A SEPARATE 0–10 scale from pain, stored in its own table and never
 * averaged with a pain score. The point of the product is return to
 * meaningful life, which can improve while pain does not — so this number
 * has to be able to move on its own.
 *
 * Asked at most once a week; the same sheet is reachable by hand from the
 * home card whenever the user wants to revise it.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import * as db from './db';
import { Press } from './motion';
import { mondayOf, todayISO } from './model';
import { ABILITY_END_HIGH, ABILITY_END_LOW, ABILITY_MAX } from './painScale';
import { color, radius, size } from './theme';

export interface FunctionSheetProps {
  goalText: string;
  onDone: () => void;
  onClose: () => void;
}

export default function FunctionSheet({ goalText, onDone, onClose }: FunctionSheetProps) {
  const [ability, setAbility] = useState<number | null>(null);
  const [note, setNote] = useState('');

  const save = () => {
    if (ability == null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    db.putFunc({ week: mondayOf(todayISO()), ability, note: note.trim() });
    onDone();
  };

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <View style={styles.navSpacer} />
        <Text style={styles.navTitle} numberOfLines={1}>This week</Text>
        <Press
          onPress={onClose}
          style={styles.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Text style={styles.navBtnText}>Close</Text>
        </Press>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.q} allowFontScaling maxFontSizeMultiplier={1.6}>
          How able have you felt to {goalText} this week?
        </Text>
        <Text style={styles.sub}>
          Your own judgement, on its own scale — this is not a pain score.
        </Text>

        <Text style={styles.value} allowFontScaling maxFontSizeMultiplier={1.5}>
          {ability == null ? 'Not set' : ability + ' / ' + ABILITY_MAX}
        </Text>
        <Slider
          value={ability}
          onChange={setAbility}
          accessibilityLabel={'Ability to ' + goalText + ' this week, 0 to 10'}
          accessibilityValue={ability == null
            ? { text: 'Not set' }
            : { min: 0, max: ABILITY_MAX, now: ability }}
        />
        <View style={styles.ends}>
          <Text style={styles.endText}>{ABILITY_END_LOW}</Text>
          <Text style={styles.endText}>{ABILITY_END_HIGH}</Text>
        </View>

        <Text style={[styles.q, styles.qLater]} allowFontScaling maxFontSizeMultiplier={1.5}>
          Anything worth remembering about this week?
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Optional"
          placeholderTextColor={color.textTertiary}
          style={styles.input}
          multiline
          accessibilityLabel="Optional note about this week"
        />

        <Press
          onPress={save}
          disabled={ability == null}
          pressScale={ability == null ? 1 : 0.985}
          accessibilityRole="button"
          accessibilityState={{ disabled: ability == null }}
          style={[styles.primary, ability == null && styles.primaryOff]}
        >
          <Text style={[styles.primaryText, ability == null && styles.primaryTextOff]}>
            Save this week
          </Text>
        </Press>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 64 },
  navTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: '#5BA8FF', fontSize: 17 },
  body: { padding: size.sheetX, paddingTop: 22, paddingBottom: 30 },
  q: { color: color.textPrimary, fontSize: 18, fontWeight: '600', lineHeight: 25 },
  qLater: { marginTop: 34, fontSize: 15, fontWeight: '400' },
  sub: { color: color.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  value: {
    color: color.textPrimary, fontSize: 30, fontWeight: '700',
    marginTop: 26, marginBottom: 6, fontVariant: ['tabular-nums'],
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 8 },
  endText: { color: color.textSecondary, fontSize: 12 },
  input: {
    marginTop: 10, minHeight: 64, borderRadius: 12, padding: 12,
    backgroundColor: color.bgSurface, color: color.textPrimary, fontSize: 15,
    textAlignVertical: 'top',
  },
  primary: {
    height: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 30,
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  primaryOff: { backgroundColor: color.bgSegmentActive },
  primaryTextOff: { color: color.textTertiary },
});
