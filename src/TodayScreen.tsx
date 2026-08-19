/**
 * Today — the page that acts. One big square carrying the day so far, the
 * word for it, the times you logged, and a single button. Everything else
 * lives one tab away, on the Pattern.
 *
 * The square is the map's cell magnified, so the gradient you watch build
 * through the day is exactly what the month will remember.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DaySquare from './DaySquare';
import { Press } from './motion';
import { Entries, fmtTime, logsOf, todayISO } from './model';
import { PAINWORDS, color, radius, size } from './theme';

const SQUARE = 128, SQ_RADIUS = 30;

export interface TodayScreenProps {
  entries: Entries;
  onLog: () => void;
  onOpenDay: (dateIso: string) => void;
}

export default function TodayScreen({ entries, onLog, onOpenDay }: TodayScreenProps) {
  const t = todayISO();
  const e = entries[t] || null;
  const logs = logsOf(e);

  const caption = e
    ? 'Today is logged. You don’t need to solve it right now.'
    : (Object.keys(entries).length ? 'Tap the square to add today.' : 'Tap the square to begin.');

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

      <View style={styles.privacyRow}>
        <Text style={styles.privacy}>Stored privately on this device</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: size.pageX },
  centre: { alignItems: 'center', marginTop: 44 },
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
    alignItems: 'center', justifyContent: 'center', marginTop: 30,
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  privacyRow: { alignItems: 'center', marginTop: 26 },
  privacy: { color: color.textTertiary, fontSize: 12 },
});
