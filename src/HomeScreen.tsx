/**
 * The Today tab: the day, and the one action that matters.
 * The record lives in Trends, the month on the Map — act here, look there.
 *
 * The hero states the DAY'S AVERAGE across completed check-ins, and says
 * so. It is not "your pain right now" — a single word floating over a
 * colour invited exactly that misreading. The number and the word are
 * both there, so the value never depends on the colour alone; the count
 * moved to the list underneath, which names it once and in full ("Show
 * all 9") rather than three times over.
 *
 * THE DAY CARD SWIPES, the way State of Mind's does. Sideways moves back
 * through the record a day at a time; only the card moves, because only
 * the card is about a particular day. What is below it — the observation
 * period, the invitation to start one — is about the record as a whole
 * and would be lying if it slid past with Tuesday.
 *
 * LOG ALWAYS MEANS TODAY, on every page, and that is a deliberate
 * asymmetry rather than an oversight. A check-in is stamped when it
 * happened; back-dating one would put a number in the record that nobody
 * took at the time, which is the one thing this app must not do. So the
 * card you are reading can be any day and the button still records now.
 * The card names its own date in the corner, and a page that is not today
 * says so before you can reach the button.
 *
 * Every page is the same height on purpose. A pager whose pages differ in
 * height shifts the whole screen as you swipe, so the card is sized for
 * the hero plus three check-ins and holds that whether a day has eight or
 * none. A day with more says how many and opens the full list, which is
 * the same thing Apple's "Show More" does with the same constraint.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, NativeScrollEvent, NativeSyntheticEvent, StyleSheet, Text, View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Extrapolation, SharedValue, cancelAnimation, interpolate, runOnJS,
  useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withRepeat,
  withTiming,
} from 'react-native-reanimated';
import DaySquare from './DaySquare';
import FocusCard from './FocusCard';
import { Press, useReduceMotion } from './motion';
import {
  Entries, Entry, Protocol, QUALITY_NAMES, checkinCount, dailyAverage,
  dateFromISO, fmtTime, iso, todayISO,
} from './model';
import { HYPOTHESIS_OFFER_AFTER_DAYS } from './thresholds';
import {
  formatCheckins, formatScore, painColor, painLabel, speakScore,
} from './painScale';
import { color, font, radius, size } from './theme';

const SQUARE = 116, SQ_RADIUS = 27;

/** how much of the screen each neighbour shows. With no scaling in the
 *  way, exactly SIDE − GAP of a neighbour lands on screen. */
const SIDE = 24;
/** the black between one card and the next — real spacing, so the peek
 *  reads as a separate card rather than as this one running off */
const GAP = 9;
/** how small a neighbour draws. It costs the sliver nothing: the card is
 *  translated back out by whatever the scale pulls in. */
const MIN_SCALE = 0.92;
/** how far off centre a card can be and still show its words. Past this
 *  it is a blank surface; before it, fully readable — so a swipe never
 *  passes through a dark gap. */
const READABLE = 0.35;

/** check-in rows a page shows before it defers to the day detail */
const ROWS = 3;

/**
 * How far back the pager goes.
 *
 * Bounded, because an unbounded pager over an empty record is an infinite
 * corridor of days nobody logged. Ninety is a season — longer than anyone
 * swipes and short enough that the list is cheap — and History is still
 * the way to reach anything older, which is what History is for.
 */
const MAX_PAGES = 90;

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface HomeScreenProps {
  entries: Entries;
  protocol: Protocol | null;
  onLog: () => void;
  onOpenDay: (dateIso: string) => void;
  onFocus: () => void;
  onKeepFocus: () => void;
  onTestFactor: (metricId: string) => void;
  /** which day the pager has settled on, so the large title can stop
   *  saying "Today" over a card showing Tuesday */
  onDayChange?: (dateIso: string) => void;
}

/* ── one day ──────────────────────────────────────────────────
   Extracted so the pager can render it for any date without the page
   and the day being the same thing — which is what made "Today" a screen
   that could only ever be today. */
function DayCard({
  dateIso, entry, isToday, index, itemW, scrollX, breath, onOpenDay, onLog,
}: {
  dateIso: string;
  entry: Entry | null;
  isToday: boolean;
  index: number;
  itemW: number;
  /** live scroll offset, so a card can size itself by how far off-centre
   *  it is rather than waiting for the swipe to finish */
  scrollX: SharedValue<number>;
  /** the screen's one breath clock; a card that is not today ignores it */
  breath: SharedValue<number>;
  onOpenDay: (dateIso: string) => void;
  onLog: () => void;
}) {
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isToday ? 1 + breath.value * 0.025 : 1 }],
  }));
  /* full size at centre, smaller and dimmer at either side, continuously
     — a card that only resized once the swipe settled would read as a
     glitch rather than as depth */
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
  /* the words, separately: gone at rest, back well before centre */
  const contentStyle = useAnimatedStyle(() => {
    const off = Math.abs(scrollX.value / itemW - index);
    return { opacity: interpolate(off, [READABLE, 1], [1, 0], Extrapolation.CLAMP) };
  });
  const avg = dailyAverage(entry);
  const count = entry ? checkinCount(entry) : 0;
  const logs = (entry && entry.logs ? entry.logs.slice() : []).sort((a, b) => b.h - a.h);
  const shown = logs.slice(0, ROWS);
  const hidden = logs.length - shown.length;
  const d = dateFromISO(dateIso);
  /* spoken, not shown: VoiceOver reads a card on its own, with no title
     bar above it to supply the day */
  const when = isToday ? 'Today' : WD[d.getDay()] + ', ' + d.getDate() + ' ' + M3[d.getMonth()];

  return (
    <Animated.View style={[{ width: itemW }, pageStyle]}>
      <View style={[styles.dayCard, { flex: 1 }]}>
        <Animated.View style={[{ flex: 1 }, contentStyle]}>
        {/* not the date — the heading above the screen carries that, and
            tracks the swipe as it happens. This says what the number IS,
            which nothing else on the card does. */}
        <Text style={styles.when} allowFontScaling maxFontSizeMultiplier={1.3}>
          DAILY PAIN
        </Text>

        <View style={styles.hero}>
          <Press
            onPress={() => (entry ? onOpenDay(dateIso) : isToday ? onLog() : undefined)}
            pressScale={0.97}
            pressOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={when + ', '
              + (avg == null
                ? 'no check-ins'
                : 'average pain ' + speakScore(avg) + ', ' + formatCheckins(count))}
            accessibilityHint={entry ? 'Opens the day’s detail'
              : isToday ? 'Starts a check-in' : undefined}
          >
            {/* only today breathes. A past day is finished, and a record
                that stirs is a record that looks like it is still moving */}
            <Animated.View style={breathStyle}>
              {/* plus only where there is nothing yet — with the number
                  gone the square has no children to suppress it, and it
                  would otherwise sit over a logged day */}
              <DaySquare
                entry={entry} value={avg} size={SQUARE} radius={SQ_RADIUS}
                plus={isToday && avg == null} today={isToday}
              />
            </Animated.View>
          </Press>

          {avg == null ? (
            <Text style={styles.empty} allowFontScaling maxFontSizeMultiplier={1.5}>
              {isToday ? 'No check-ins yet today' : 'Nothing logged'}
            </Text>
          ) : (
            <>
              <Text style={styles.score} allowFontScaling maxFontSizeMultiplier={1.4}>
                {formatScore(avg)}
              </Text>
              {/* what the number means. Where it came from is the list
                  below, and it says so there rather than twice. */}
              <Text style={styles.underWord} allowFontScaling maxFontSizeMultiplier={1.4}>
                {painLabel(avg)}
              </Text>
            </>
          )}
        </View>

        {/* ── the moments the average is made of ───────────────
            Inside the card, under a rule: they are what the number above
            them IS, not a second topic that happens to share the date. */}
        {logs.length > 0 && (
          <>
            <View style={styles.cardRule} />
            <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
              CHECK-INS
            </Text>
            {shown.map((l, i) => {
              const q = (l.q || []).map((id) => QUALITY_NAMES[id] || id).join(', ');
              return (
                <Press
                  key={l.h + '-' + i}
                  onPress={() => onOpenDay(dateIso)}
                  pressOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={fmtTime(l.h) + ', pain ' + speakScore(l.pain)
                    + (q ? ', ' + q : '')}
                  accessibilityHint="Opens the day’s detail"
                  style={[styles.logRow, i > 0 && styles.logRowDivider]}
                >
                  <View style={[styles.logSquare, { backgroundColor: painColor(l.pain) }]} />
                  <View style={styles.logMain}>
                    <Text style={styles.logLabel} allowFontScaling maxFontSizeMultiplier={1.4}>
                      <Text style={styles.logScore}>{formatScore(l.pain)}</Text>
                      {'  ·  ' + painLabel(l.pain)}
                    </Text>
                    {!!q && (
                      <Text
                        style={styles.logQuality} numberOfLines={1}
                        allowFontScaling maxFontSizeMultiplier={1.3}
                      >
                        {q}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.logTime} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {fmtTime(l.h)}
                  </Text>
                </Press>
              );
            })}

            {/* the count is named rather than implied: a list that hides
                an unknown number is a list you cannot trust. It opens the
                day rather than unfolding, because a card in a pager that
                grows when you tap it moves every other page with it. */}
            {hidden > 0 && (
              <Press
                onPress={() => onOpenDay(dateIso)}
                pressOpacity={0.7}
                style={styles.moreRow}
                accessibilityRole="button"
                accessibilityLabel={'Show all ' + logs.length + ' check-ins'}
              >
                <Text style={styles.moreText}>Show all {logs.length}</Text>
              </Press>
            )}
          </>
        )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export default function HomeScreen({
  entries, protocol, onLog, onOpenDay, onFocus, onKeepFocus, onTestFactor,
  onDayChange,
}: HomeScreenProps) {
  const t = todayISO();
  const { width } = useWindowDimensions();

  /* the same slow, shallow breath the pain shape and the Logged square
     carry — presence, not decoration. ±2.5% over 2.6s; still under
     Reduce Motion. */
  const breath = useSharedValue(0);
  const rm = useReduceMotion();
  useEffect(() => {
    if (rm) { cancelAnimation(breath); breath.value = 0; return; }
    breath.value = withRepeat(withTiming(1, { duration: 2600 }), -1, true);
  }, [rm]);
  /* Oldest first, today last, so the pager's natural resting place is the
     right-hand end and swiping right goes back in time — the direction a
     calendar runs and the direction History already scrolls. */
  const days = useMemo(() => {
    const keys = Object.keys(entries).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    const oldest = keys.length ? dateFromISO(keys[0]) : dateFromISO(t);
    const span = Math.round((dateFromISO(t).getTime() - oldest.getTime()) / 86400000) + 1;
    const n = Math.max(1, Math.min(MAX_PAGES, span));
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = dateFromISO(t);
      d.setDate(d.getDate() - i);
      out.push(iso(d));
    }
    return out;
  }, [entries, t]);

  const list = useRef<FlatList<string>>(null);
  const last = days.length - 1;
  /* one card, plus the sliver each neighbour shows. Content is padded by
     SIDE at both ends, so an offset of i × itemW puts card i dead centre
     and the arithmetic below never needs to know about the padding. */
  const itemW = width - SIDE * 2;

  const [onToday, setOnToday] = useState(true);

  /* Declared ABOVE the scroll worklet, and it has to be. Reanimated
     builds a worklet's closure the moment the worklet is created, so a
     const referenced inside one but declared after it is read in its
     temporal dead zone — a ReferenceError on the first frame, which
     TypeScript is happy to compile because the reference is inside a
     function body. */
  const land = (i: number) => {
    const k = Math.max(0, Math.min(last, i));
    setOnToday(k >= last);
    if (onDayChange) onDayChange(days[k]);
  };
  const settle = (x: number) => land(Math.round(x / itemW));

  const scrollX = useSharedValue(last * itemW);
  const at = useSharedValue(last);
  const onScroll = useAnimatedScrollHandler((ev) => {
    scrollX.value = ev.contentOffset.x;
    const i = Math.round(ev.contentOffset.x / itemW);
    if (i !== at.value) {
      at.value = i;
      runOnJS(land)(i);
    }
  }, [itemW, last, days]);

  /* A new day, or a first entry that lengthens the record, changes what
     the last index IS. Without this the pager keeps the pixel offset it
     had and quietly lands on yesterday at midnight. */
  useEffect(() => {
    list.current?.scrollToOffset({ offset: last * itemW, animated: false });
  }, [last, itemW]);

  /* the focus question is worth asking only once there is a record to
     form a hypothesis about — a first-day user has nothing to suspect */
  const offerSetup = Object.keys(entries).length >= HYPOTHESIS_OFFER_AFTER_DAYS;

  return (
    <View>
      <Animated.FlatList
        ref={list}
        data={days}
        keyExtractor={(d: string) => d}
        horizontal
        showsHorizontalScrollIndicator={false}
        /* snapToInterval rather than pagingEnabled: a page is now one card
           wide, not one screen wide, and pagingEnabled only ever snaps to
           the screen. disableIntervalMomentum keeps a hard flick to one
           day — flying past four at a time is how you lose your place. */
        snapToInterval={itemW}
        disableIntervalMomentum
        decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: SIDE }}
        initialScrollIndex={last}
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
        style={{ height: PAGE_H }}
        renderItem={({ item, index }: { item: string; index: number }) => (
          <DayCard
            dateIso={item}
            entry={entries[item] || null}
            isToday={item === t}
            index={index}
            itemW={itemW}
            scrollX={scrollX}
            breath={breath}
            onOpenDay={onOpenDay}
            onLog={onLog}
          />
        )}
      />

      {/* Back to today, only when you are not on it — the same control
          History already carries, for the same reason: a pager you can
          swipe a long way into needs one tap out of it. */}
      {!onToday && (
        <Press
          onPress={() => {
            list.current?.scrollToOffset({ offset: last * itemW, animated: true });
            setOnToday(true);
            if (onDayChange) onDayChange(days[last]);
          }}
          pressOpacity={0.75}
          style={styles.backRow}
          accessibilityRole="button"
          accessibilityLabel="Back to today"
        >
          <Text style={styles.backText}>Back to today</Text>
        </Press>
      )}

      {/* ── the period, or the invitation to start one ────────
          Outside the pager: it is about the record rather than about a
          day, and sliding it past with Tuesday would say otherwise. */}
      <FocusCard
        protocol={protocol}
        entries={entries}
        todayIso={t}
        offerSetup={offerSetup}
        onStart={onFocus}
        onKeepGoing={onKeepFocus}
        onTest={onTestFactor}
      />
    </View>
  );
}

/* One height for every page, worked out from the parts rather than
   guessed, so a change to a row or the square cannot leave the pager
   silently clipping its own last line. */
const PAGE_H = 8            // card's top margin
  + 20 + 18                 // padding, the date line
  + SQUARE + 50 + 22        // the square, the score, the word under it
  + 20 + 14 + 18            // the rule and CHECK-INS
  + ROWS * 60               // the rows
  + 46                      // Show all
  + 16 + 8;                 // padding, and the card's bottom margin

const styles = StyleSheet.create({
  /* one card for the day: the average, a rule, and the check-ins behind
     it. The same grammar Trends uses, and the same reason — a boundary
     says what belongs together. */
  dayCard: {
    marginHorizontal: GAP, marginTop: 8, marginBottom: 8,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
  },
  /* centred over the square, like the number and the word beneath it —
     the whole hero block reads down one axis */
  when: {
    color: color.textTertiary, fontSize: font.footnote, fontWeight: '600',
    letterSpacing: 0.6, marginBottom: 4, textAlign: 'center',
  },
  cardRule: {
    height: StyleSheet.hairlineWidth, backgroundColor: color.borderDivider,
    marginTop: 20,
  },
  eyebrow: {
    color: color.textTertiary, fontSize: font.footnote, fontWeight: '600',
    letterSpacing: 0.6, marginTop: 14, marginBottom: 2,
  },
  hero: { alignItems: 'center' },
  /* the day's value, under the shape rather than on it. No "/10": the
     slider's ends and the report define the scale; a person reading their
     own day does not need reminding what it is out of. */
  score: {
    color: color.textPrimary, fontSize: 34, fontWeight: '700', letterSpacing: -0.8,
    lineHeight: 40, marginTop: 10, textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  underWord: {
    color: color.textSecondary, fontSize: font.subheadline, fontWeight: '600',
    marginTop: 2, textAlign: 'center',
  },
  empty: { color: color.textSecondary, fontSize: font.body, marginTop: 20 },
  backRow: {
    alignSelf: 'center', minHeight: 40, justifyContent: 'center',
    paddingHorizontal: 16,
  },
  backText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 60 },
  moreRow: {
    minHeight: 46, alignItems: 'center', justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  moreText: { color: color.tint, fontSize: font.subheadline, fontWeight: '500' },
  logRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider },
  /* a swatch now, not a badge — the value it used to hold sits in the
     row's own text, in one ink on every score */
  logSquare: {
    width: 34, height: 34, borderRadius: 10, borderCurve: 'continuous',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  logScore: { color: color.textPrimary, fontVariant: ['tabular-nums'] },
  logMain: { flex: 1, gap: 2 },
  logLabel: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  logQuality: { color: color.textSecondary, fontSize: font.footnote },
  logTime: {
    color: color.textSecondary, fontSize: font.subheadline, fontVariant: ['tabular-nums'],
  },
});
