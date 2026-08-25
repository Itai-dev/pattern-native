/**
 * Pain through the day — one day, drawn against the clock.
 *
 * THIS IS THE ONLY SCREEN THAT SWIPES BETWEEN DAYS. Today used to carry
 * the gesture, and it was in the wrong place: Today is where you act, and
 * a surface you act on should not be able to become Tuesday underneath
 * the button. Here the day IS the subject — the chart, the three figures
 * and the list are all about one date and nothing else — so sideways
 * meaning "a different day" is the only thing it could mean. Nowhere else
 * in the app takes the gesture.
 *
 * The mechanics are the ones Today proved and are deliberately unchanged:
 * a page is one card wide rather than one screen wide, neighbours peek so
 * the swipe is discoverable without a hint, disableIntervalMomentum keeps
 * a hard flick to a single day, and cards scale and fade continuously
 * with the scroll rather than snapping when it settles.
 *
 * It is a layer inside the Today tab rather than a modal, because the tab
 * bar stays live: this is a place in the app, not something covering it.
 * It arrives on the house curve — the same ease-out every press and
 * transition in this app uses — and leaves on it, and both are silent
 * under Reduce Motion.
 *
 * WHAT IT DOES NOT DO is edit. Tapping a check-in, or asking for all of
 * them, opens the day detail that already owns editing, deleting, events
 * and the day's questions. One place writes; this one reads.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, NativeScrollEvent, NativeSyntheticEvent, ScrollView, StyleSheet, Text,
  View, useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing, Extrapolation, SharedValue, interpolate, runOnJS,
  useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import DayLine from './DayLine';
import { Press, useReduceMotion } from './motion';
import {
  Entries, Entry, Moment, QUALITY_NAMES, checkinCount, dailyAverage,
  dateFromISO, fmtTime, iso, logsOf, todayISO,
} from './model';
import {
  formatRange, formatScore, painColor, speakScore,
} from './painScale';
import { color, font, radius } from './theme';

/* the pager's proportions — see the comment at the top of the file. SIDE
   is the content padding at both ends, so an offset of i × itemW puts
   card i dead centre; GAP is the black between one card and the next. */
const SIDE = 16;
const GAP = 6;
/** how small a neighbour draws; the card is translated back out by
 *  whatever the scale pulls in, so the peek costs nothing */
const MIN_SCALE = 0.94;
/** how far off centre a card can be and still show its words — past this
 *  it is a blank surface, so a swipe never crosses a dark gap */
const READABLE = 0.35;

/** check-in rows a page shows before it defers to the day detail. The
 *  same three Today used, and for the same reason: a page that unfolds
 *  changes height, and a pager whose pages differ in height shifts the
 *  screen as you swipe. */
const ROWS = 3;

/** how far back the pager goes. Ninety days is a season — longer than
 *  anyone swipes, and History is still the way to anything older. */
const MAX_PAGES = 90;

/** the plot's drawing height. Tall enough that a one-point difference is
 *  visible and short enough that three check-ins still fit beneath it. */
const PLOT_H = 150;

/** quality words shown beside a check-in before the row gives up. Two
 *  fits the narrowest phone without the time being pushed off. */
const CHIPS = 2;

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon, 24 Aug" — short enough for the large title on the narrowest
 *  phone, which is why the app writes a date this way everywhere */
export function fmtDay(dateIso: string): string {
  const d = dateFromISO(dateIso);
  return WD[d.getDay()] + ', ' + d.getDate() + ' ' + M3[d.getMonth()];
}

export interface DayScreenProps {
  entries: Entries;
  /** the day to open on. The pager starts there and can walk either way. */
  dateIso: string;
  /** the day detail — where editing, deleting and events already live */
  onOpenDay: (dateIso: string) => void;
  onClose: () => void;
}

/* ── one figure of three ────────────────────────────────────── */
function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={label + ' ' + value + (unit || '')}>
      <Text style={styles.statV} allowFontScaling maxFontSizeMultiplier={1.3}>
        {value}
        {!!unit && <Text style={styles.statUnit}>{unit}</Text>}
      </Text>
      <Text style={styles.statL} allowFontScaling maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

/* ── one check-in ───────────────────────────────────────────── */
function Row({ log, first, onPress }: { log: Moment; first: boolean; onPress: () => void }) {
  const chips = (log.q || []).map((id) => QUALITY_NAMES[id] || id).slice(0, CHIPS);
  return (
    <Press
      onPress={onPress}
      pressOpacity={0.7}
      style={[styles.row, !first && styles.rowDivider]}
      accessibilityRole="button"
      accessibilityLabel={fmtTime(log.h) + ', ' + speakScore(log.pain)
        + (chips.length ? ', ' + chips.join(', ') : '')}
      accessibilityHint="Opens the day’s detail"
    >
      <View style={[styles.swatch, { backgroundColor: painColor(log.pain) }]} />
      <Text style={styles.rowScore} allowFontScaling maxFontSizeMultiplier={1.3}>
        {formatScore(log.pain)}<Text style={styles.rowOutOf}>/10</Text>
      </Text>
      <View style={styles.chips}>
        {chips.map((c) => (
          <View key={c} style={styles.chip}>
            <Text style={styles.chipText} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.2}>
              {c}
            </Text>
          </View>
        ))}
      </View>
      <Text style={styles.rowTime} allowFontScaling maxFontSizeMultiplier={1.2}>{fmtTime(log.h)}</Text>
      <Text style={styles.chev}>›</Text>
    </Press>
  );
}

/* ── one day ────────────────────────────────────────────────── */
function DayPage({
  dateIso, entry, index, itemW, scrollX, onOpenDay,
}: {
  dateIso: string;
  entry: Entry | null;
  index: number;
  itemW: number;
  /** live scroll offset, so a card sizes itself by how far off centre it
   *  is rather than waiting for the swipe to finish */
  scrollX: SharedValue<number>;
  onOpenDay: (dateIso: string) => void;
}) {
  const pageStyle = useAnimatedStyle(() => {
    const d = scrollX.value / itemW - index;
    const off = Math.abs(d);
    const scale = interpolate(off, [0, 1], [1, MIN_SCALE], Extrapolation.CLAMP);
    /* push back out by exactly what the scale pulled in, toward whichever
       edge of this card the screen can actually see */
    const back = (d === 0 ? 0 : Math.sign(d)) * (itemW * (1 - scale)) / 2;
    return {
      transform: [{ translateX: back }, { scale }],
      opacity: interpolate(off, [0, 1], [1, 0.75], Extrapolation.CLAMP),
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const off = Math.abs(scrollX.value / itemW - index);
    return { opacity: interpolate(off, [READABLE, 1], [1, 0], Extrapolation.CLAMP) };
  });

  const logs = logsOf(entry).slice().sort((a, b) => b.h - a.h);
  const avg = dailyAverage(entry);
  const count = entry ? checkinCount(entry) : 0;
  const shown = logs.slice(0, ROWS);
  const hidden = logs.length - shown.length;
  /* the day's own extremes, and they fall back to the day value rather
     than to the seeds: a legacy day carries an answer with no moments
     behind it, and seeding from 10 and 0 would print a range of 10–0 over
     a day that only ever said one thing */
  const low = logs.length ? logs.reduce((m, l) => (l.pain < m ? l.pain : m), 10) : avg;
  const high = logs.length ? logs.reduce((m, l) => (l.pain > m ? l.pain : m), 0) : avg;

  return (
    <Animated.View style={[{ width: itemW }, pageStyle]}>
      {/* each page scrolls on its own. A card sized for eleven check-ins
          and Dynamic Type at its largest will not fit every phone, and the
          alternative — one fixed height for every page — either clips the
          longest day or leaves the shortest one floating in space. */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <Animated.View style={contentStyle}>
          <View style={styles.card}>
            <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
              Pain through the day
            </Text>

            {avg == null ? (
              <Text style={styles.empty} allowFontScaling maxFontSizeMultiplier={1.4}>
                {dateIso === todayISO()
                  ? 'No check-ins yet today.'
                  : 'Nothing was logged on this day.'}
              </Text>
            ) : (
              <>
                {logs.length > 0 ? (
                  <View style={styles.plotWrap}>
                    <DayLine logs={logs} height={PLOT_H} dot={13} grid axis />
                  </View>
                ) : (
                  /* a day carrying an answer with no moment behind it —
                     legacy, or restored from an old backup. The figures
                     below are still true; there is simply no clock to put
                     them on, and drawing one would invent a time. */
                  <Text style={styles.empty} allowFontScaling maxFontSizeMultiplier={1.4}>
                    This day was recorded without a time, so there is nothing to
                    place against the clock.
                  </Text>
                )}

                <View style={styles.stats}>
                  <Stat value={formatScore(avg)} unit="/10" label="Average" />
                  <View style={styles.statRule} />
                  <Stat
                    value={low == null || high == null ? '—' : formatRange(low, high)}
                    label="Range"
                  />
                  <View style={styles.statRule} />
                  {/* a count, so it stays white — the ramp means pain, and
                      a tally of check-ins is not a pain value */}
                  <Stat value={String(count)} label={count === 1 ? 'Check-in' : 'Check-ins'} />
                </View>

                {/* what the drawing is NOT, inside the card it qualifies */}
                <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
                  The line joins the times you checked in. The stretches between
                  them are hours you didn’t record, not hours without pain.
                </Text>

                {logs.length > 0 && (
                  <>
                    <View style={styles.rule} />
                    <Text style={styles.listTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
                      Check-ins
                    </Text>
                    {shown.map((l, i) => (
                      <Row key={l.h} log={l} first={i === 0} onPress={() => onOpenDay(dateIso)} />
                    ))}

                    {/* the count is named rather than implied: a list holding
                        back an unknown number is a list you cannot trust. It
                        opens the detail rather than unfolding — a card that
                        grows when tapped moves every other page with it. */}
                    {hidden > 0 && (
                      <Press
                        onPress={() => onOpenDay(dateIso)}
                        pressOpacity={0.7}
                        style={styles.moreRow}
                        accessibilityRole="button"
                        accessibilityLabel={'View all ' + logs.length + ' check-ins'}
                      >
                        <Text style={styles.moreText}>View all {logs.length}</Text>
                      </Press>
                    )}
                  </>
                )}
              </>
            )}
          </View>

          {/* said in words under the card, because the peeking neighbour is
              the real affordance and some people never see it. No arrow:
              an arrow on a screen about pain is a control, and this is a
              sentence. */}
          <Text style={styles.swipeHint} allowFontScaling maxFontSizeMultiplier={1.3}>
            Swipe sideways for another day
          </Text>
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

export default function DayScreen({ entries, dateIso, onOpenDay, onClose }: DayScreenProps) {
  const t = todayISO();
  const { width } = useWindowDimensions();
  const rm = useReduceMotion();

  /* Oldest first, today last — so the pager's resting place is the
     right-hand end and swiping right goes back in time, the direction a
     calendar runs and the direction History already scrolls. */
  const days = useMemo(() => {
    const keys = Object.keys(entries).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    const first = keys.length ? keys[0] : t;
    const oldest = dateFromISO(first < dateIso ? first : dateIso);
    const span = Math.round((dateFromISO(t).getTime() - oldest.getTime()) / 86400000) + 1;
    const n = Math.max(1, Math.min(MAX_PAGES, span));
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = dateFromISO(t);
      d.setDate(d.getDate() - i);
      out.push(iso(d));
    }
    return out;
  }, [entries, t, dateIso]);

  const last = days.length - 1;
  const itemW = width - SIDE * 2;
  const start = Math.max(0, Math.min(last, days.indexOf(dateIso)));

  const list = useRef<FlatList<string>>(null);
  const [at, setAt] = useState(start);

  /* Declared ABOVE the scroll worklet, and it has to be: Reanimated builds
     a worklet's closure the moment the worklet is created, so a const
     referenced inside one but declared after it is read in its temporal
     dead zone — a ReferenceError on the first frame that TypeScript is
     happy to compile, because the reference sits inside a function body. */
  const land = useCallback((i: number) => {
    setAt(Math.max(0, Math.min(last, i)));
  }, [last]);
  const settle = (x: number) => land(Math.round(x / itemW));

  const scrollX = useSharedValue(start * itemW);
  const page = useSharedValue(start);
  const onScroll = useAnimatedScrollHandler((ev) => {
    scrollX.value = ev.contentOffset.x;
    const i = Math.round(ev.contentOffset.x / itemW);
    if (i !== page.value) {
      page.value = i;
      runOnJS(land)(i);
    }
  }, [itemW, last]);

  /* ── arriving and leaving ─────────────────────────────────
     The house curve, the one every press and transition in this app eases
     on. 1 = fully off to the right; the layer is opaque, so what it
     covers never shows through mid-slide. */
  const off = useSharedValue(1);
  const EASE = Easing.bezier(0.23, 1, 0.32, 1);
  useEffect(() => {
    off.value = withTiming(0, { duration: rm ? 0 : 340, easing: EASE });
  }, []);
  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: off.value * width }],
  }));
  const dismiss = useCallback(() => {
    off.value = withTiming(1, { duration: rm ? 0 : 260, easing: EASE }, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [rm, onClose]);

  const onDate = days[at] || dateIso;

  return (
    <Animated.View style={[styles.layer, layerStyle]}>
      <View style={styles.topBar}>
        <Press
          onPress={dismiss}
          pressScale={0.94}
          style={styles.back}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backChev} allowFontScaling={false}>‹</Text>
        </Press>
        <Text
          style={styles.title}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          allowFontScaling
          maxFontSizeMultiplier={1.2}
        >
          {fmtDay(onDate)}
        </Text>
        {/* one tap out of a pager you can swipe a long way into — the same
            control History carries, and only once you have gone somewhere */}
        {onDate !== t && (
          <Press
            onPress={() => { list.current?.scrollToOffset({ offset: last * itemW, animated: true }); land(last); }}
            pressOpacity={0.7}
            style={styles.todayBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Back to today"
          >
            <Text style={styles.todayText}>Today</Text>
          </Press>
        )}
      </View>

      <Animated.FlatList
        ref={list}
        data={days}
        keyExtractor={(d: string) => d}
        horizontal
        showsHorizontalScrollIndicator={false}
        /* snapToInterval rather than pagingEnabled: a page is one card
           wide, not one screen wide, and pagingEnabled only ever snaps to
           the screen. disableIntervalMomentum keeps a hard flick to one
           day — flying past four at a time is how you lose your place. */
        snapToInterval={itemW}
        disableIntervalMomentum
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: SIDE }}
        initialScrollIndex={start}
        getItemLayout={(_: unknown, i: number) => ({ length: itemW, offset: itemW * i, index: i })}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(ev: NativeSyntheticEvent<NativeScrollEvent>) =>
          settle(ev.nativeEvent.contentOffset.x)}
        /* a slow drag released without a flick never fires momentum end,
           and the title above would sit on the wrong day until the next
           swipe. Both endings are handled. */
        onScrollEndDrag={(ev: NativeSyntheticEvent<NativeScrollEvent>) =>
          settle(ev.nativeEvent.contentOffset.x)}
        style={styles.pager}
        renderItem={({ item, index }: { item: string; index: number }) => (
          <DayPage
            dateIso={item}
            entry={entries[item] || null}
            index={index}
            itemW={itemW}
            scrollX={scrollX}
            onOpenDay={onOpenDay}
          />
        )}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* opaque and full-bleed: it is a place in the app, over the tab it
     belongs to, with the tab bar still live beneath it */
  layer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: color.bgRoot,
  },
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: SIDE, paddingTop: 6, paddingBottom: 14,
  },
  back: {
    width: 38, height: 38, borderRadius: 19, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  backChev: { color: color.textPrimary, fontSize: 26, lineHeight: 30, marginTop: -3 },
  title: {
    flex: 1, color: color.textPrimary, fontSize: font.title1, fontWeight: '700',
    letterSpacing: -0.5,
  },
  todayBtn: { minHeight: 38, justifyContent: 'center', paddingLeft: 6 },
  todayText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  pager: { flex: 1 },
  /* room for the last line to clear the floating tab bar, which this
     screen keeps rather than covering */
  page: { paddingBottom: 132 },

  card: {
    marginHorizontal: GAP,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8,
  },
  cardTitle: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.2,
  },
  plotWrap: { marginTop: 20 },
  empty: { color: color.textSecondary, fontSize: font.body, marginTop: 16, marginBottom: 10 },

  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 22 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  statRule: { width: StyleSheet.hairlineWidth, height: 34, backgroundColor: color.borderDivider },
  statV: {
    color: color.textPrimary, fontSize: 28, fontWeight: '700', letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  statUnit: { fontSize: font.body, fontWeight: '600', color: color.textSecondary },
  statL: { color: color.textSecondary, fontSize: font.footnote },

  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 18 },
  rule: {
    height: StyleSheet.hairlineWidth, backgroundColor: color.borderDivider, marginTop: 16,
  },
  listTitle: {
    color: color.textPrimary, fontSize: font.body, fontWeight: '700',
    marginTop: 14, marginBottom: 2,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider },
  swatch: {
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  rowScore: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rowOutOf: { fontSize: font.footnote, fontWeight: '600', color: color.textSecondary },
  chips: { flex: 1, flexDirection: 'row', gap: 6, flexShrink: 1 },
  chip: {
    flexShrink: 1, borderRadius: 9, borderCurve: 'continuous',
    backgroundColor: color.bgSegmentTrack, paddingHorizontal: 9, paddingVertical: 4,
  },
  chipText: { color: color.textSecondary, fontSize: font.footnote },
  rowTime: {
    color: color.textSecondary, fontSize: font.subheadline,
    fontVariant: ['tabular-nums'],
  },
  chev: { color: color.textTertiary, fontSize: 20, marginTop: -2 },
  moreRow: {
    minHeight: 46, alignItems: 'center', justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  moreText: { color: color.tint, fontSize: font.subheadline, fontWeight: '500' },

  swipeHint: {
    color: color.textTertiary, fontSize: font.footnote,
    textAlign: 'center', marginTop: 14, paddingHorizontal: 24,
  },
});
