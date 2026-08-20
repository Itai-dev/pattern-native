/**
 * Today — the page that acts. The big square carrying the day so far, one
 * button to log, and two quiet doorways that appear only when they have
 * something to offer: the weekly questions when the week is due, and
 * "Something changed?" for flares and treatments. No stats, no streaks,
 * no badges.
 */
import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import DaySquare from './DaySquare';
import * as db from './db';
import { Press } from './motion';
import { Entries, WeeklyEntry, fmtTime, logsOf, todayISO, weeklyDue } from './model';
import { PAINWORDS, color, radius, size } from './theme';

const SQUARE = 128, SQ_RADIUS = 30;

export interface TodayScreenProps {
  entries: Entries;
  weekly: WeeklyEntry[];
  goalText: string | null;
  onLog: () => void;
  onOpenDay: (dateIso: string) => void;
  onEvent: () => void;
  onWeekly: () => void;
  onChanged: () => void;
}

export default function TodayScreen({
  entries, weekly, goalText, onLog, onOpenDay, onEvent, onWeekly, onChanged,
}: TodayScreenProps) {
  const t = todayISO();
  const e = entries[t] || null;
  const logs = logsOf(e);
  const showWeekly = weeklyDue(weekly, t);

  const caption = e
    ? 'Today is logged. You don’t need to solve it right now.'
    : (Object.keys(entries).length ? 'Tap the square to add today.' : 'Tap the square to begin.');

  const askGoal = () => {
    // the one activity you want back — named once, rated weekly
    Alert.prompt(
      'One activity you want back',
      'Finish the sentence: “I want to be able to …” — one specific thing pain took. You’ll rate it weekly; it becomes the headline of your doctor summary.',
      (text) => {
        if (text && text.trim()) { db.setGoal(text.trim()); onChanged(); }
      },
      'plain-text'
    );
  };

  return (
    <View style={styles.root}>
      <View style={styles.centre}>
        <Press onPress={() => (e ? onOpenDay(t) : onLog())} pressScale={0.97} pressOpacity={0.9}>
          <DaySquare entry={e} size={SQUARE} radius={SQ_RADIUS} plus today />
        </Press>
        <Text style={styles.word}>{e ? PAINWORDS[e.pain] : 'Today'}</Text>
        <Text style={styles.caption}>{caption}</Text>
        <Text style={styles.times}>{logs.map((l) => fmtTime(l.h)).join(' · ')}</Text>
      </View>

      <Press onPress={onLog} pressScale={0.985} style={styles.primary}>
        <Text style={styles.primaryText}>{e ? 'Add a log' : 'Add today'}</Text>
      </Press>

      <Press onPress={onEvent} style={styles.quiet}>
        <Text style={styles.quietText}>Something changed? Flare, treatment, unusual day</Text>
      </Press>

      {showWeekly && (
        <Press onPress={onWeekly} pressOpacity={0.85} style={styles.card}>
          <Text style={styles.cardTitle}>Your week, in three questions</Text>
          <Text style={styles.cardSub}>Under a minute. It becomes the trend your doctor sees.</Text>
        </Press>
      )}

      {!goalText && Object.keys(entries).length >= 3 && (
        <Press onPress={askGoal} pressOpacity={0.85} style={styles.card}>
          <Text style={styles.cardTitle}>Name one activity you want back</Text>
          <Text style={styles.cardSub}>
            Progress will be measured against your life, not just a pain score.
          </Text>
        </Press>
      )}

      <View style={styles.privacyRow}>
        <Text style={styles.privacy}>Stored privately on this phone</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: size.pageX },
  centre: { alignItems: 'center', marginTop: 40 },
  word: {
    color: color.textPrimary, fontSize: 22, fontWeight: '600',
    letterSpacing: -0.3, marginTop: 20,
  },
  caption: {
    color: color.textSecondary, fontSize: 14, lineHeight: 21,
    marginTop: 6, textAlign: 'center', maxWidth: 300,
  },
  times: { color: color.textTertiary, fontSize: 12, marginTop: 8, minHeight: 15 },
  primary: {
    height: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 26,
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  quiet: { paddingVertical: 13, alignItems: 'center' },
  quietText: { color: color.textTertiary, fontSize: 13 },
  card: {
    borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderDivider, backgroundColor: color.bgSurface,
    padding: 16, marginTop: 10,
  },
  cardTitle: { color: color.textPrimary, fontSize: 15, fontWeight: '600' },
  cardSub: { color: color.textTertiary, fontSize: 13, lineHeight: 18, marginTop: 3 },
  privacyRow: { alignItems: 'center', marginTop: 22 },
  privacy: { color: color.textTertiary, fontSize: 12 },
});
