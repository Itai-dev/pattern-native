/**
 * The month, in the calendar grammar of Apple's State of Mind: the DATE
 * NUMBER sits ABOVE each shape, plain text on the black ground, and the
 * shape below it carries the day. Colour shows the day's AVERAGE pain,
 * and small dots under the shape show how many check-ins that average
 * came from — colour alone never carries the value, and VoiceOver reads
 * date, average and count as one sentence.
 *
 * A day with no logs stays a visibly empty outline; today's number is set
 * in the theme's accent so the eye lands on it before any colour does.
 */
import React, { useMemo } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { color, font, size } from './theme';
import { Entries, checkinCount, dailyAverage, iso, todayISO } from './model';
import { formatCheckins, painColor, speakScore, themeBrand } from './painScale';
import { Press } from './motion';

const WD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
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
  const brand = themeBrand();
  /* number above + shape + dots below */
  const cellH = cell + 30;

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
      {/* the month name is the screen's large title, up in the top bar */}
      <Text style={styles.legend} allowFontScaling maxFontSizeMultiplier={1.4}>
        Colour = average pain, 0–10 · dots = check-ins
      </Text>

      <View style={[styles.grid, { columnGap: GAP, rowGap: 4 }]}>
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
          if (!dISO) return <View key={'b' + i} style={{ width: cell, height: cellH }} />;
          const e = entries[dISO] || null;
          const avg = dailyAverage(e);
          const n = e ? checkinCount(e) : 0;
          const isToday = dISO === t;
          const future = dISO > t;
          const dayNum = Number(dISO.slice(8, 10));

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
              style={[styles.cell, { width: cell, height: cellH }]}
            >
              {/* the date lives OUTSIDE the shape — a calendar first,
                  a chart second. Today's is the theme accent. */}
              <Text
                allowFontScaling={false}
                style={[
                  styles.dayNum,
                  { color: future ? color.textTertiary : color.textSecondary },
                  isToday && { color: brand, fontWeight: '700' },
                ]}
              >
                {dayNum}
              </Text>

              <View
                style={[
                  { width: cell, height: cell, borderRadius: radius },
                  avg == null
                    ? {
                        borderWidth: 1,
                        borderColor: future ? color.bgSegmentTrack : color.borderControl,
                      }
                    : {
                        backgroundColor: painColor(avg),
                        /* keeps a near-black low-pain day visible on the
                           black ground */
                        borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
                      },
                ]}
              />

              {/* how many check-ins the average came from — under the
                  shape, in the margin, like the reference */}
              <View style={styles.dots}>
                {n > 0 && Array.from({ length: Math.min(n, MAX_DOTS) }).map((_, k) => (
                  <View key={k} style={[styles.dot, { backgroundColor: color.textSecondary }]} />
                ))}
                {n > MAX_DOTS && <Text style={styles.more}>+</Text>}
              </View>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: size.pageX, paddingTop: 2 },
  legend: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginBottom: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  wd: {
    textAlign: 'center', color: color.textTertiary,
    fontSize: 11, fontWeight: '600', paddingBottom: 2,
  },
  cell: { alignItems: 'center' },
  dayNum: {
    fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'],
    marginBottom: 4, height: 15, textAlign: 'center',
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 2, height: 8, marginTop: 3 },
  dot: { width: 3.5, height: 3.5, borderRadius: 2, opacity: 0.9 },
  more: { fontSize: 8, fontWeight: '700', marginLeft: 1, color: color.textSecondary },
});
