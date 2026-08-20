/**
 * One screen. Today at the top, the month beneath it, and the occasional
 * card in between.
 *
 * There used to be two tabs. "Today" showed the same square the map already
 * drew, so the tab bar was navigation between a thing and a smaller copy of
 * itself — cost with no content. Scrolling beats tapping when there are only
 * two destinations, and the day you just logged is now visible in the same
 * glance as the month it belongs to.
 */
import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import DaySquare from './DaySquare';
import MapScreen from './MapScreen';
import * as db from './db';
import { Press } from './motion';
import { Entries, WeeklyEntry, fmtTime, logsOf, todayISO, weeklyDue } from './model';
import { PAINWORDS, color, radius, size } from './theme';

const SQUARE = 116, SQ_RADIUS = 27;

export interface HomeScreenProps {
  entries: Entries;
  weekly: WeeklyEntry[];
  goalText: string | null;
  onLog: () => void;
  onOpenDay: (dateIso: string) => void;
  onEvent: () => void;
  onWeekly: () => void;
  onChanged: () => void;
}

export default function HomeScreen({
  entries, weekly, goalText, onLog, onOpenDay, onEvent, onWeekly, onChanged,
}: HomeScreenProps) {
  const t = todayISO();
  const e = entries[t] || null;
  const logs = logsOf(e);
  const dayCount = Object.keys(entries).length;

  const askGoal = () => {
    Alert.prompt(
      'One activity you want back',
      'Finish the sentence: “I want to be able to …” — one specific thing. You’ll rate it weekly, and it becomes the headline of your doctor summary.',
      (text) => { if (text && text.trim()) { db.setGoal(text.trim()); onChanged(); } },
      'plain-text'
    );
  };

  return (
    <View>
      {/* today */}
      <View style={styles.today}>
        <Press onPress={() => (e ? onOpenDay(t) : onLog())} pressScale={0.97} pressOpacity={0.9}>
          <DaySquare entry={e} size={SQUARE} radius={SQ_RADIUS} plus today />
        </Press>
        <Text style={styles.word}>{e ? PAINWORDS[e.pain] : 'Today'}</Text>
        {logs.length > 0 && (
          <Text style={styles.times}>{logs.map((l) => fmtTime(l.h)).join(' · ')}</Text>
        )}
      </View>

      <View style={styles.actions}>
        <Press onPress={onLog} pressScale={0.985} style={styles.primary}>
          <Text style={styles.primaryText}>{e ? 'Add a log' : 'Add today'}</Text>
        </Press>
        <Press onPress={onEvent} style={styles.quiet}>
          <Text style={styles.quietText}>Something changed? Flare, treatment, unusual day</Text>
        </Press>
      </View>

      {weeklyDue(weekly, t) && (
        <Press onPress={onWeekly} pressOpacity={0.85} style={styles.card}>
          <Text style={styles.cardTitle}>Your week, in three questions</Text>
          <Text style={styles.cardSub}>Under a minute. It becomes the trend your doctor sees.</Text>
        </Press>
      )}

      {!goalText && dayCount >= 3 && (
        <Press onPress={askGoal} pressOpacity={0.85} style={styles.card}>
          <Text style={styles.cardTitle}>Name one activity you want back</Text>
          <Text style={styles.cardSub}>So progress is measured against your life, not a pain score.</Text>
        </Press>
      )}

      {/* the month */}
      <View style={styles.mapWrap}>
        <MapScreen entries={entries} onDayPress={onOpenDay} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  today: { alignItems: 'center', marginTop: 24 },
  word: {
    color: color.textPrimary, fontSize: 20, fontWeight: '600',
    letterSpacing: -0.3, marginTop: 16,
  },
  times: { color: color.textTertiary, fontSize: 12, marginTop: 5 },
  actions: { paddingHorizontal: size.pageX, marginTop: 20 },
  primary: {
    height: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  quiet: { paddingVertical: 12, alignItems: 'center' },
  quietText: { color: color.textTertiary, fontSize: 13 },
  card: {
    marginHorizontal: size.pageX, marginTop: 6,
    borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderDivider, backgroundColor: color.bgSurface, padding: 16,
  },
  cardTitle: { color: color.textPrimary, fontSize: 15, fontWeight: '600' },
  cardSub: { color: color.textTertiary, fontSize: 13, lineHeight: 18, marginTop: 3 },
  mapWrap: { marginTop: 26 },
});
