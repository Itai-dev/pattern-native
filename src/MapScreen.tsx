/**
 * The month.
 *
 * Every cell carries its DATE NUMBER, so the grid is a calendar before it
 * is a chart. Colour shows the day's AVERAGE pain, and small dots show how
 * many check-ins that average came from — colour alone never carries the
 * value, and VoiceOver reads date, average and count as one sentence.
 *
 * A day with no logs stays visibly empty; today is marked with an outline
 * that is distinct from any pain fill.
 */
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { color, size } from './theme';
import { Entries, checkinCount, dailyAverage, iso, todayISO } from './model';
import { formatCheckins, inkOn, painColor, speakScore } from './painScale';
import { Press } from './motion';

const WD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const WEEKSTART = 1; // Monday-first
const GAP = 7;
const MAX_DOTS = 3;

export interface MapScreenProps {
  entries: Entries;
  onDayPress: (dateIso: string) => void;
}

function cellMetrics() {
  const w = Math.min(Dimensions.get('window').width, 520) - size.pageX * 2;
  const cell = (w - GAP * 6) / 7;
  return { cell, radius: cell * 0.24 };
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
      <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.4}>
        {MONTHS[now.getMonth()]}
      </Text>
      <Text style={styles.legend} allowFontScaling maxFontSizeMultiplier={1.4}>
        Colour shows each day’s average pain, 0–10. Dots show check-ins.
      </Text>

      <View style={[styles.grid, { columnGap: GAP, rowGap: GAP }]}>
        {WD.map((w, i) => (
          <Text
            key={w + i}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={[styles.wd, { width: cell }]}
          >
            {w}
          </Text>
        ))}

        {days.map((dISO, i) => {
          if (!dISO) return <View key={'b' + i} style={{ width: cell, height: cell }} />;
          const e = entries[dISO] || null;
          const avg = dailyAverage(e);
          const n = e ? checkinCount(e) : 0;
          const isToday = dISO === t;
          const future = dISO > t;
          const dayNum = Number(dISO.slice(8, 10));
          const numColour = avg == null
            ? (future ? color.textTertiary : color.textSecondary)
            : inkOn(avg);

          const label = new Date(dISO.replace(/-/g, '/')).toDateString().slice(0, 10) +
            (avg == null
              ? ', no check-ins'
              : ', average pain ' + speakScore(avg) + ', ' + formatCheckins(n));

          return (
            <Press
              key={dISO}
              disabled={future || !e}
              onPress={() => onDayPress(dISO)}
              pressScale={0.96}
              pressOpacity={1}
              accessibilityRole="button"
              accessibilityLabel={(isToday ? 'Today, ' : '') + label}
              accessibilityHint={e ? 'Opens the day' : undefined}
              style={{ width: cell, height: cell, borderRadius: radius }}
            >
              <View
                style={[
                  { width: cell, height: cell, borderRadius: radius },
                  styles.cell,
                  avg == null
                    ? {
                        borderWidth: 1,
                        borderColor: future ? color.bgSegmentTrack : color.borderControl,
                      }
                    : { backgroundColor: painColor(avg) },
                ]}
              >
                <Text
                  allowFontScaling={false}
                  style={[styles.dayNum, { color: numColour, fontSize: Math.max(11, cell * 0.3) }]}
                >
                  {dayNum}
                </Text>

                {/* how many check-ins the average came from */}
                {n > 0 && (
                  <View style={styles.dots}>
                    {Array.from({ length: Math.min(n, MAX_DOTS) }).map((_, k) => (
                      <View
                        key={k}
                        style={[styles.dot, { backgroundColor: avg == null ? color.textTertiary : numColour }]}
                      />
                    ))}
                    {n > MAX_DOTS && (
                      <Text style={[styles.more, { color: numColour }]}>+</Text>
                    )}
                  </View>
                )}
              </View>

              {isToday && (
                <View
                  pointerEvents="none"
                  style={{
                    position: 'absolute', left: -3, top: -3, right: -3, bottom: -3,
                    borderRadius: radius + 3, borderWidth: 2,
                    borderColor: '#FFFFFF',
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
    letterSpacing: -0.4, marginBottom: 4,
  },
  legend: { color: color.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  wd: {
    textAlign: 'center', color: color.textSecondary,
    fontSize: 11, fontWeight: '600', paddingBottom: 2,
  },
  cell: { alignItems: 'center', justifyContent: 'center' },
  dayNum: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  dot: { width: 3, height: 3, borderRadius: 1.5, opacity: 0.85 },
  more: { fontSize: 8, fontWeight: '700', marginLeft: 1 },
});
