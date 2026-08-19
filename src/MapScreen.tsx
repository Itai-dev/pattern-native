/**
 * The Pattern Map — month grid of rounded-square day cells, ported from
 * the PWA. Multi-log days paint concentric square bands (earliest at the
 * rim, latest at the core); in native these are nested rounded views,
 * whose corners stay parallel by construction — no shadow tricks needed.
 */
import React, { useMemo } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { color, themes, size } from './theme';
import { Entries, Entry, dayBands, iso, todayISO } from './model';

const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const WEEKSTART = 1; // Monday-first; Hebrew (Sunday-first) arrives with i18n

const GAP = 7;

export interface MapScreenProps {
  entries: Entries;
  onDayPress: (dateIso: string) => void;
}

function cellMetrics() {
  const w = Math.min(Dimensions.get('window').width, 520) - size.pageX * 2;
  const cell = (w - GAP * 6) / 7;
  return { cell, radius: cell * 0.24 };
}

function DayFill({ e, cell, radius }: { e: Entry; cell: number; radius: number }) {
  const ramp = themes.bloom.ramp;
  const bands = dayBands(e, cell / 2, ramp);
  if (!bands.length) {
    return <View style={{ width: cell, height: cell, borderRadius: radius, backgroundColor: ramp[e.pain] }} />;
  }
  return (
    <View style={{ width: cell, height: cell, borderRadius: radius, backgroundColor: bands[0].color, overflow: 'hidden' }}>
      {bands.slice(1).map((b, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: b.depth, right: b.depth, top: b.depth, bottom: b.depth,
            borderRadius: Math.max(3, radius - b.depth),
            backgroundColor: b.color,
          }}
        />
      ))}
    </View>
  );
}

export default function MapScreen({ entries, onDayPress }: MapScreenProps) {
  const t = todayISO();
  const now = new Date();
  const { cell, radius } = useMemo(cellMetrics, []);

  const days = useMemo(() => {
    const y = now.getFullYear(), m = now.getMonth();
    const count = new Date(y, m + 1, 0).getDate();
    const lead = (new Date(y, m, 1).getDay() - WEEKSTART + 7) % 7;
    const list: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= count; d++) list.push(iso(new Date(y, m, d)));
    return list;
  }, [t]);

  const sub = entries[t]
    ? 'Today is logged. You don’t need to solve it right now.'
    : (Object.keys(entries).length ? 'Tap the outlined square to add today.' : 'Tap today to begin.');

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{MONTHS[now.getMonth()]}</Text>
      <Text style={styles.sub}>{sub}</Text>
      <View style={[styles.grid, { columnGap: GAP, rowGap: GAP }]}>
        {WD.map((w) => (
          <Text key={w} style={[styles.wd, { width: cell }]}>{w}</Text>
        ))}
        {days.map((dISO, i) => {
          if (!dISO) return <View key={'b' + i} style={{ width: cell, height: cell }} />;
          const e = entries[dISO] || null;
          const isToday = dISO === t;
          const future = dISO > t;
          return (
            <Pressable
              key={dISO}
              disabled={future}
              onPress={() => onDayPress(dISO)}
              style={({ pressed }) => [
                { width: cell, height: cell, borderRadius: radius },
                pressed && { transform: [{ scale: 0.96 }] },
              ]}
            >
              {e
                ? <DayFill e={e} cell={cell} radius={radius} />
                : <View style={[
                    { width: cell, height: cell, borderRadius: radius, borderWidth: 1 },
                    { borderColor: future ? color.bgSegmentTrack : (isToday ? color.textTertiary : color.borderControl) },
                  ]} />}
              {isToday && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute', left: -3, top: -3, right: -3, bottom: -3,
                    borderRadius: radius + 3, borderWidth: 1.5,
                    borderColor: 'rgba(255,255,255,0.35)',
                  }}
                />
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.privacy}>Stored privately on this device</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: size.pageX },
  title: {
    color: color.textPrimary, fontSize: 34, fontWeight: '700',
    letterSpacing: -0.5, marginBottom: 6,
  },
  sub: { color: color.textSecondary, fontSize: 15, lineHeight: 21, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  wd: {
    textAlign: 'center', color: color.textTertiary,
    fontSize: 11, fontWeight: '500', paddingBottom: 2,
  },
  privacy: { color: color.textTertiary, fontSize: 12, marginTop: 16, textAlign: 'center' },
});
