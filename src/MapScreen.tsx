/**
 * The record, month by month, in the calendar grammar of Apple's State of
 * Mind: the DATE NUMBER sits ABOVE each shape, plain text on the black
 * ground, and the shape below it carries the day. Colour shows the day's
 * AVERAGE pain, and small dots under the shape show how many check-ins
 * that average came from — colour alone never carries the value, and
 * VoiceOver reads date, average and count as one sentence.
 *
 * A day with no logs stays a visibly empty outline; today's number is set
 * in the theme's accent so the eye lands on it before any colour does.
 *
 * MONTHS ARE STACKED, NEWEST FIRST, and you scroll back through them.
 * Stepping with arrows made the record feel like a filing cabinet you had
 * to operate; a list you scroll is the same record as one continuous
 * thing. Newest first means today is always at the top, so "back to now"
 * is a flick rather than a button that has to exist.
 *
 * It stops at the first month that holds anything. There is no value in
 * scrolling through empty grids for a year before the record starts.
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
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** a long record still has an end — two years of grids is enough scroll */
const MAX_MONTHS = 24;

export interface MapScreenProps {
  entries: Entries;
  onDayPress: (dateIso: string) => void;
}

function cellMetrics() {
  const w = Math.min(Dimensions.get('window').width, 520) - size.pageX * 2;
  const cell = (w - GAP * 6) / 7;
  return { cell, radius: cell * 0.24 };
}

interface MonthBlock {
  key: string;
  label: string;
  days: (string | null)[];
}

export default function MapScreen({ entries, onDayPress }: MapScreenProps) {
  const t = todayISO();
  const brand = themeBrand();
  const { cell, radius } = useMemo(cellMetrics, []);
  const cellH = cell + 30;

  /* every month from this one back to the one holding the oldest entry,
     newest first */
  const months = useMemo<MonthBlock[]>(() => {
    /* only well-formed date keys decide how far back the stack goes — a
       single malformed key from an old import would otherwise pin
       "oldest" somewhere meaningless and unroll a year of empty grids,
       which is exactly what it did */
    const keys = Object.keys(entries)
      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
      .sort();
    const now = new Date();
    let oldest = keys.length
      ? new Date(+keys[0].slice(0, 4), +keys[0].slice(5, 7) - 1, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1);
    if (isNaN(oldest.getTime()) || oldest > now) {
      oldest = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const out: MonthBlock[] = [];
    const cur = new Date(now.getFullYear(), now.getMonth(), 1);
    while (out.length < MAX_MONTHS) {
      const y = cur.getFullYear(), m = cur.getMonth();
      const count = new Date(y, m + 1, 0).getDate();
      const lead = (new Date(y, m, 1).getDay() - WEEKSTART + 7) % 7;
      const days: (string | null)[] = Array(lead).fill(null);
      for (let d = 1; d <= count; d++) days.push(iso(new Date(y, m, d)));
      out.push({
        key: y + '-' + m,
        label: MONTHS[m] + (y !== now.getFullYear() ? ' ' + y : ''),
        days,
      });
      if (cur <= oldest) break;
      cur.setMonth(cur.getMonth() - 1);
    }
    return out;
  }, [entries, t]);

  return (
    <View style={styles.root}>
      <Text style={styles.legend} allowFontScaling maxFontSizeMultiplier={1.4}>
        Colour = average pain, 0–10 · dots = check-ins · scroll back for earlier months
      </Text>

      {months.map((month, mi) => {
        const shown = month.days.filter((d): d is string => !!d && d <= t);
        const logged = shown.filter((d) => dailyAverage(entries[d]) != null).length;
        return (
          <View key={month.key} style={mi > 0 && styles.laterMonth}>
            <View style={styles.monthHead}>
              <Text style={styles.monthName} allowFontScaling maxFontSizeMultiplier={1.3}>
                {month.label}
              </Text>
              {/* what a grid of holes does not say by itself */}
              <Text style={styles.monthCount} allowFontScaling maxFontSizeMultiplier={1.3}>
                {logged} of {shown.length} logged
              </Text>
            </View>

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

              {month.days.map((dISO, i) => {
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
                              /* keeps a near-black low-pain day visible on
                                 the black ground */
                              borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
                            },
                      ]}
                    />

                    {/* how many check-ins the average came from — under the
                        shape, in the margin, like the reference */}
                    <View style={styles.dots}>
                      {n > 0 && Array.from({ length: Math.min(n, MAX_DOTS) }).map((_, k) => (
                        <View key={k}
                          style={[styles.dot, { backgroundColor: color.textSecondary }]} />
                      ))}
                      {n > MAX_DOTS && <Text style={styles.more}>+</Text>}
                    </View>
                  </Press>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: size.pageX, paddingTop: 2 },
  legend: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginBottom: 16 },
  laterMonth: {
    marginTop: 26, paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  monthHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    gap: 10, marginBottom: 10,
  },
  monthName: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700', letterSpacing: -0.2,
  },
  monthCount: {
    color: color.textTertiary, fontSize: font.footnote, fontVariant: ['tabular-nums'],
  },
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
