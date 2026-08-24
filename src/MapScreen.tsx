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
 *
 * It moves now. The screen used to show the current month and only the
 * current month, which made a record older than a few weeks unreachable
 * from the one screen built to show it. Arrows step through, Today comes
 * back, and a week view trades breadth for size on the days you are
 * actually thinking about.
 *
 * Arrows rather than a swipe, deliberately: the three pages already sit
 * in a horizontal pager, and a second one nested inside it would leave
 * every left-right gesture on this screen ambiguous.
 */
import React, { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import { color, font, size } from './theme';
import {
  Entries, addDays, checkinCount, dailyAverage, dateFromISO, iso, todayISO,
} from './model';
import { formatCheckins, painColor, speakScore, themeBrand } from './painScale';
import { Press } from './motion';

const WD = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKSTART = 1; // Monday-first
const GAP = 7;
const MAX_DOTS = 3;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

type Mode = 'month' | 'week';

export interface MapScreenProps {
  entries: Entries;
  onDayPress: (dateIso: string) => void;
}

function cellMetrics(scale: number) {
  const w = Math.min(Dimensions.get('window').width, 520) - size.pageX * 2;
  const cell = ((w - GAP * 6) / 7) * scale;
  return { cell, radius: cell * 0.24 };
}

/** the Monday on or before a date */
function mondayOn(dateIso: string): string {
  const d = dateFromISO(dateIso);
  return addDays(dateIso, -((d.getDay() - WEEKSTART + 7) % 7));
}

export default function MapScreen({ entries, onDayPress }: MapScreenProps) {
  const t = todayISO();
  const [mode, setMode] = useState<Mode>('month');
  /* the first of the month being shown, and the Monday of the week */
  const [anchor, setAnchor] = useState<string>(t.slice(0, 8) + '01');
  const [weekOf, setWeekOf] = useState<string>(() => mondayOn(t));

  const brand = themeBrand();
  const { cell, radius } = useMemo(() => cellMetrics(1), []);
  const cellH = cell + 30;

  const days = useMemo(() => {
    if (mode === 'week') {
      const list: (string | null)[] = [];
      for (let i = 0; i < 7; i++) list.push(addDays(weekOf, i));
      return list;
    }
    const a = dateFromISO(anchor);
    const y = a.getFullYear(), m = a.getMonth();
    const count = new Date(y, m + 1, 0).getDate();
    const lead = (new Date(y, m, 1).getDay() - WEEKSTART + 7) % 7;
    const list: (string | null)[] = Array(lead).fill(null);
    for (let d = 1; d <= count; d++) list.push(iso(new Date(y, m, d)));
    return list;
  }, [mode, anchor, weekOf]);

  /* what the header says, and whether stepping forward is allowed —
     there is nothing to see in a month that has not happened */
  const a = dateFromISO(anchor);
  const title = mode === 'week'
    ? shortRange(weekOf)
    : MONTHS[a.getMonth()] + (a.getFullYear() !== dateFromISO(t).getFullYear()
      ? ' ' + a.getFullYear() : '');
  const atNow = mode === 'week'
    ? weekOf === mondayOn(t)
    : anchor === t.slice(0, 8) + '01';

  const step = (dir: number) => {
    if (mode === 'week') {
      const next = addDays(weekOf, dir * 7);
      if (dir > 0 && next > mondayOn(t)) return;
      setWeekOf(next);
      return;
    }
    const d = dateFromISO(anchor);
    d.setMonth(d.getMonth() + dir);
    const next = iso(d).slice(0, 8) + '01';
    if (dir > 0 && next > t.slice(0, 8) + '01') return;
    setAnchor(next);
  };

  const goToday = () => {
    setAnchor(t.slice(0, 8) + '01');
    setWeekOf(mondayOn(t));
  };

  /* how much of what is on screen was actually logged — the honest
     headline for a calendar, and the one number a gap-filled grid does
     not say by itself */
  const shown = days.filter((d): d is string => !!d && d <= t);
  const loggedShown = shown.filter((d) => dailyAverage(entries[d]) != null).length;

  return (
    <View style={styles.root}>
      {/* ── month or week, and which one ─────────────────────── */}
      <View style={styles.controls}>
        <View style={styles.modes}>
          {(['month', 'week'] as Mode[]).map((m) => {
            const on = mode === m;
            return (
              <Press
                key={m}
                onPress={() => setMode(m)}
                pressOpacity={0.85}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={m === 'month' ? 'Month view' : 'Week view'}
                style={[styles.mode, on && styles.modeOn]}
              >
                <Text style={[styles.modeText, on && styles.modeTextOn]}
                  allowFontScaling maxFontSizeMultiplier={1.2}>
                  {m === 'month' ? 'Month' : 'Week'}
                </Text>
              </Press>
            );
          })}
        </View>

        {!atNow && (
          <Press
            onPress={goToday}
            pressOpacity={0.8}
            style={styles.today}
            accessibilityRole="button"
            accessibilityLabel="Back to today"
          >
            <Text style={styles.todayText}>Today</Text>
          </Press>
        )}
      </View>

      {/* ── which month or week, and the way back and forward ─── */}
      <View style={styles.nav}>
        <Press
          onPress={() => step(-1)}
          pressOpacity={0.7}
          hitSlop={10}
          style={styles.arrow}
          accessibilityRole="button"
          accessibilityLabel={mode === 'week' ? 'Previous week' : 'Previous month'}
        >
          <Text style={styles.arrowGlyph}>‹</Text>
        </Press>
        <Text style={styles.navTitle} numberOfLines={1}
          allowFontScaling maxFontSizeMultiplier={1.3}>
          {title}
        </Text>
        <Press
          onPress={() => step(1)}
          disabled={atNow}
          pressOpacity={0.7}
          hitSlop={10}
          style={styles.arrow}
          accessibilityRole="button"
          accessibilityState={{ disabled: atNow }}
          accessibilityLabel={mode === 'week' ? 'Next week' : 'Next month'}
        >
          <Text style={[styles.arrowGlyph, atNow && styles.arrowOff]}>›</Text>
        </Press>
      </View>

      <Text style={styles.legend} allowFontScaling maxFontSizeMultiplier={1.4}>
        {loggedShown} of {shown.length} {shown.length === 1 ? 'day' : 'days'} logged
        {'  ·  '}colour = average pain, dots = check-ins
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

const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "18 – 24 Aug", or across a month boundary, "28 Jul – 3 Aug" */
function shortRange(mondayIso: string): string {
  const a = dateFromISO(mondayIso);
  const b = dateFromISO(addDays(mondayIso, 6));
  const left = a.getMonth() === b.getMonth()
    ? String(a.getDate())
    : a.getDate() + ' ' + M3[a.getMonth()];
  return left + ' – ' + b.getDate() + ' ' + M3[b.getMonth()];
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: size.pageX, paddingTop: 2 },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginBottom: 12,
  },
  modes: {
    flexDirection: 'row', gap: 3, padding: 3, borderRadius: 12,
    backgroundColor: color.bgSurface,
  },
  mode: {
    minHeight: 34, minWidth: 74, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
  },
  modeOn: { backgroundColor: color.bgSegmentActive },
  modeText: { color: color.textSecondary, fontSize: font.footnote, fontWeight: '600' },
  modeTextOn: { color: color.textPrimary },
  today: {
    minHeight: 34, borderRadius: 17, paddingHorizontal: 14, justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  todayText: { color: color.tint, fontSize: font.footnote, fontWeight: '600' },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 8,
  },
  arrow: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
  },
  arrowGlyph: { color: color.textPrimary, fontSize: 24, lineHeight: 28 },
  arrowOff: { color: color.textTertiary, opacity: 0.4 },
  navTitle: {
    flex: 1, textAlign: 'center', color: color.textPrimary,
    fontSize: font.title3, fontWeight: '700', letterSpacing: -0.2,
  },
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
