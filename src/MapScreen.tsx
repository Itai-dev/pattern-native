/**
 * The month — a grid of rounded-square day cells. A day logged once is a
 * flat colour; several logs blend into concentric bands, earliest at the
 * rim and latest at the core, drawn as nested rounded squares since native
 * has no inset shadows. Corners stay parallel by construction.
 *
 * This is a section of the home screen, not a page of its own, so it owns
 * only its heading and grid.
 */
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { color, size, theme } from './theme';
import { Entries, Entry, dayLayers, iso, todayISO } from './model';
import { Press } from './motion';

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
  const layers = dayLayers(e, cell / 2, theme.ramp);
  return (
    <View style={{
      width: cell, height: cell, borderRadius: radius,
      backgroundColor: layers[0].color, overflow: 'hidden',
    }}>
      {layers.slice(1).map((l, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: l.inset, right: l.inset, top: l.inset, bottom: l.inset,
            borderRadius: Math.max(2, radius - l.inset),
            backgroundColor: l.color,
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

  return (
    <View style={styles.root}>
      <Text style={styles.title}>{MONTHS[now.getMonth()]}</Text>
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
            <Press
              key={dISO}
              disabled={future}
              onPress={() => onDayPress(dISO)}
              pressScale={0.96}
              pressOpacity={1}
              style={{ width: cell, height: cell, borderRadius: radius }}
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
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: size.pageX },
  title: {
    color: color.textPrimary, fontSize: 22, fontWeight: '600',
    letterSpacing: -0.4, marginBottom: 12,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  wd: {
    textAlign: 'center', color: color.textTertiary,
    fontSize: 11, fontWeight: '500', paddingBottom: 2,
  },
});
