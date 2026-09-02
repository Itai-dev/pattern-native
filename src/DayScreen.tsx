/**
 * Pain through the day — one day, drawn against the clock.
 *
 * THIS IS THE ONLY SCREEN THAT SWIPES BETWEEN DAYS, and only on its
 * card. Today used to carry the gesture, and it was in the wrong place:
 * Today is where you act, and a surface you act on should not be able to
 * become Tuesday underneath the button. Here the day IS the subject, so
 * sideways meaning "a different day" is the only thing it could mean.
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
 * THIS IS THE ONLY DAY SURFACE. It used to show three check-ins and hand
 * the rest to a sheet that opened on top of it — one day rendered twice,
 * the same list in two designs, and only the covered one could edit. The
 * sheet is gone: its sections are DayDetail, rendered under the chart
 * here, and every route into a day (Today's card, the calendar) lands on
 * this screen.
 *
 * ONLY THE CHART PAGES. The pager is the card at the top, not the whole
 * page — a horizontal FlatList around the detail would fight every
 * swipe-to-delete row inside it, and the card being the bounded thing
 * that moves is the same rule Today already follows: on the card, days;
 * off it, the page. That is also why the card is a FIXED height. A pager
 * whose pages differ in height shifts the screen as you swipe, so the
 * chart, the three figures and nothing else live inside it, and the
 * caveat that qualifies them sits directly under the pager where it can
 * wrap to any size Dynamic Type asks for.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, NativeScrollEvent, NativeSyntheticEvent, PixelRatio, ScrollView,
  StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing, Extrapolation, SharedValue, interpolate, runOnJS,
  useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DayLine from './DayLine';
import DayDetail from './DayDetail';
import * as db from './db';
import { Press, useReduceMotion } from './motion';
import {
  Entries, Entry, PainEvent, checkinCount, dailyAverage,
  dateFromISO, iso, logsOf, todayISO,
} from './model';
import { formatRange, formatScore } from './painScale';
import { color, font, radius, size } from './theme';

/* The pager's proportions — see the comment at the top of the file. SIDE
   is the content padding at both ends, so an offset of i × itemW puts
   card i dead centre; GAP is the black between one card and the next.

   They add up to size.pageX on purpose: the card's left edge lands on the
   same gutter every other card in the app sits in, so walking from Today
   into this screen does not shift the page under you. */
const SIDE = size.pageX - 6;
const GAP = 6;

/** how small a neighbour draws; the card is translated back out by
 *  whatever the scale pulls in, so the peek costs nothing */
const MIN_SCALE = 0.94;
/** how far off centre a card can be and still show its words — past this
 *  it is a blank surface, so a swipe never crosses a dark gap */
const READABLE = 0.35;

/** how far back the pager goes. Ninety days is a season — longer than
 *  anyone swipes, and the calendar in Trends is still the way to
 *  anything older. */
const MAX_PAGES = 90;

/** the plot's drawing height. Tall enough that a one-point difference is
 *  visible and short enough to leave the figures room beneath it. */
const PLOT_H = 150;

/** The pager's fixed height, in points: the fixed parts of a card (its
 *  padding and the plot) plus the parts that grow with Dynamic Type (the
 *  title and the three figures), scaled by the type size actually in
 *  force. Every page is this tall whatever it holds, because a pager
 *  whose pages differ in height shifts the screen as you swipe. */
function cardHeight(): number {
  const fs = Math.max(1, Math.min(PixelRatio.getFontScale(), 1.3));
  return Math.round(32 + PLOT_H + 16 + 18 + (26 + 48) * fs);
}

/* ── the nudge ──────────────────────────────────────────────
   How far the pager leans on arrival, and when.

   It replaces a line of text that said the same thing. A sentence
   explaining a gesture is a sentence admitting the gesture is not
   visible; showing the movement teaches it in less time than reading
   about it takes, and leaves the card its full width.

   It runs after the screen has finished arriving — a nudge under a
   slide-in is just a wobble — and it does not repeat once the gesture
   has actually been used. A hint that keeps arriving after it has been
   taken is nagging, and this app does not nag. */
const NUDGE = 32;
const NUDGE_OUT_MS = 520;
const NUDGE_BACK_MS = 900;

/** set the first time a real finger drags the pager. The programmatic
 *  nudge cannot set it — only onScrollBeginDrag fires for a touch. */
const PREF_SWIPED = 'daypager.swiped';

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
  /** the record changed under this screen — the app re-reads and the
   *  detail below re-renders from storage */
  onChanged: () => void;
  onAddLog: (dateIso: string) => void;
  onEditLog: (h: number) => void;
  onEditEvent: (ev: PainEvent) => void;
  onAddEvent: (dateIso: string) => void;
  onClose: () => void;
  /** open with the day's note already being edited. Applies to the day
   *  this screen opened on and to no other: the detail remounts as the
   *  pager walks, and a note that sprang open on every swiped-to day
   *  would be a trap, not a shortcut. */
  editNoteOnOpen?: boolean;
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

/* ── one day's chart ────────────────────────────────────────── */
function DayPage({
  dateIso, entry, index, itemW, cardH, scrollX,
}: {
  dateIso: string;
  entry: Entry | null;
  index: number;
  itemW: number;
  cardH: number;
  /** live scroll offset, so a card sizes itself by how far off centre it
   *  is rather than waiting for the swipe to finish */
  scrollX: SharedValue<number>;
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
  /* the day's own extremes, and they fall back to the day value rather
     than to the seeds: a legacy day carries an answer with no moments
     behind it, and seeding from 10 and 0 would print a range of 10–0 over
     a day that only ever said one thing */
  const low = logs.length ? logs.reduce((m, l) => (l.pain < m ? l.pain : m), 10) : avg;
  const high = logs.length ? logs.reduce((m, l) => (l.pain > m ? l.pain : m), 0) : avg;

  return (
    <Animated.View style={[{ width: itemW, height: cardH }, pageStyle]}>
        <Animated.View style={[contentStyle, { flex: 1 }]}>
          <View style={[styles.card, { flex: 1 }]}>
            <Text
              style={styles.cardTitle}
              allowFontScaling maxFontSizeMultiplier={1.3}
              /* the nudge teaches the gesture by doing it, which VoiceOver
                 cannot see. The hint is the same fact, said the one way a
                 screen reader can receive it. */
              accessibilityHint="Swipe left or right for another day"
            >
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
                    <DayLine logs={logs} height={PLOT_H} grid axis />
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

              </>
            )}
          </View>
        </Animated.View>
    </Animated.View>
  );
}

export default function DayScreen({
  editNoteOnOpen,
  entries, dateIso, onChanged, onAddLog, onEditLog, onEditEvent, onAddEvent, onClose,
}: DayScreenProps) {
  const t = todayISO();
  const { width } = useWindowDimensions();
  const cardH = useMemo(cardHeight, []);
  const rm = useReduceMotion();
  /* This layer is absolutely positioned inside the app's SafeAreaView,
     and Yoga measures an absolute child's offsets from its parent's
     BORDER box — the safe-area padding is not in that box. So top: 0 is
     the top of the phone, not the top of the safe area, and the heading
     landed across the clock and the battery. The inset is read again
     here and applied as padding, which is the only way an absolute layer
     can honour it. */
  const insets = useSafeAreaInsets();

  /* Oldest first, today last — so the pager's resting place is the
     right-hand end and swiping right goes back in time, the direction a
     calendar runs and the direction the calendar in Record already scrolls. */
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

  /* A jump to today is animated, and an animated scroll reports every
     index it flies over. Each one landed in `at`, so the heading counted
     backwards through the week and the Today button — which is drawn only
     when `at` is not today — blinked out, back in, and out again on the
     way. The destination of a jump is known the moment it starts, so the
     heading is set once, up front, and the indices in between are ignored
     until the scroll actually stops.

     Cleared on any real touch too: a finger landing mid-flight means the
     user has taken over, and their drag must be allowed to move the
     heading again. */
  const jumping = useRef(false);

  /* Declared ABOVE the scroll worklet, and it has to be: Reanimated builds
     a worklet's closure the moment the worklet is created, so a const
     referenced inside one but declared after it is read in its temporal
     dead zone — a ReferenceError on the first frame that TypeScript is
     happy to compile, because the reference sits inside a function body. */
  const land = useCallback((i: number) => {
    if (jumping.current) return;
    setAt(Math.max(0, Math.min(last, i)));
  }, [last]);
  /* the end of any scroll, however it started — so a jump that overshoots
     or a drag that never flicks both finish on a real index */
  const settle = (x: number) => {
    jumping.current = false;
    setAt(Math.max(0, Math.min(last, Math.round(x / itemW))));
  };

  const jumpToToday = useCallback(() => {
    jumping.current = true;
    setAt(last);
    list.current?.scrollToOffset({ offset: last * itemW, animated: true });
  }, [last, itemW]);

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

  /* ── the nudge ────────────────────────────────────────────
     Read once, at mount, so the pref cannot change under the effect.
     It leans toward whichever side actually has a day on it — leaning at
     an edge would bounce off nothing and teach the opposite lesson. The
     scroll's own curve is the platform's, deliberately: this is a scroll
     pretending to be a finger, and it should move like one. */
  const [taught] = useState(() => db.getPref<boolean>(PREF_SWIPED, false));
  /* someone who swipes inside the first half-second has answered the
     question the nudge was going to ask, and a programmatic scroll
     landing on top of their finger would drag them back off the day they
     just chose */
  const touched = useRef(false);
  useEffect(() => {
    if (rm || taught || days.length < 2) return;
    const home = start * itemW;
    const dir = start > 0 ? -1 : 1;
    const lean = (offset: number) => {
      if (!touched.current) list.current?.scrollToOffset({ offset, animated: true });
    };
    const out = setTimeout(() => lean(home + dir * NUDGE), NUDGE_OUT_MS);
    const back = setTimeout(() => lean(home), NUDGE_BACK_MS);
    return () => { clearTimeout(out); clearTimeout(back); };
  }, []);

  const onDate = days[at] || dateIso;

  return (
    <Animated.View style={[styles.layer, { paddingTop: insets.top }, layerStyle]}>
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
            control the record carries, and only once you have gone somewhere */}
        {onDate !== t && (
          <Press
            onPress={jumpToToday}
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

      {/* One vertical scroll for the whole day: the chart pager, the
          sentence that qualifies it, and everything the sheet used to
          hold. The pager is a bounded object inside it — sideways on the
          card is another day, sideways on a row is delete, and the two
          gestures never meet because one is not inside the other. */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        /* the note can now open focused from Today, far down this page;
           without the inset the keyboard covers the very field the
           shortcut promised, and the user is left typing blind */
        automaticallyAdjustKeyboardInsets
      >
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
        /* a finger, not the nudge: a programmatic scroll never begins a
           drag, so this fires only when the gesture has really been used
           — and once it has, the hint has done its job for good */
        onScrollBeginDrag={() => {
          touched.current = true;
          jumping.current = false;
          if (!taught) db.setPref(PREF_SWIPED, true);
        }}
        onMomentumScrollEnd={(ev: NativeSyntheticEvent<NativeScrollEvent>) =>
          settle(ev.nativeEvent.contentOffset.x)}
        /* a slow drag released without a flick never fires momentum end,
           and the title above would sit on the wrong day until the next
           swipe. Both endings are handled. */
        onScrollEndDrag={(ev: NativeSyntheticEvent<NativeScrollEvent>) =>
          settle(ev.nativeEvent.contentOffset.x)}
        style={[styles.pager, { height: cardH }]}
        renderItem={({ item, index }: { item: string; index: number }) => (
          <DayPage
            dateIso={item}
            entry={entries[item] || null}
            index={index}
            itemW={itemW}
            cardH={cardH}
            scrollX={scrollX}
          />
        )}
      />

      {/* what the drawing is NOT — under the pager rather than inside a
          card, so it can wrap to whatever length the type size needs
          instead of being clipped by a fixed page height */}
      <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.6}>
        The line joins the times you checked in. The stretches between them are
        hours you didn’t record, not hours without pain.
      </Text>

      {/* the rest of the day, keyed by date so walking to another day
          rebuilds it rather than editing the last one's draft note */}
      <DayDetail
        key={onDate}
        dateIso={onDate}
        onChanged={onChanged}
        onAddLog={() => onAddLog(onDate)}
        onEditLog={onEditLog}
        onEditEvent={onEditEvent}
        onAddEvent={() => onAddEvent(onDate)}
        editNoteOnOpen={!!editNoteOnOpen && onDate === dateIso}
      />
      </ScrollView>
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
  /* the same gutter and the same rhythm as the app's own top bar, so the
     title does not jump sideways on the way in */
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: size.pageX, paddingTop: 6, paddingBottom: 14,
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
  todayText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  pager: { flexGrow: 0 },
  /* room for the last line to clear the floating tab bar, which this
     screen keeps rather than covering */
  page: { paddingBottom: 140 },

  /* Trends' card, to the pixel — same surface, same 16pt padding, and
     below it the same type doing the same jobs: a figure is title3, a
     label is footnote, a sentence is subheadline. Nothing here gets a
     size no other card in the app uses. */
  card: {
    marginHorizontal: GAP,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    padding: size.cardPad,
  },
  cardTitle: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.2,
  },
  plotWrap: { marginTop: 16 },
  empty: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21,
    marginTop: 12,
  },

  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  stat: { flex: 1, alignItems: 'center', gap: 1 },
  statRule: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: color.borderDivider },
  /* the same spec as a Trends metric tile's value */
  statV: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statUnit: { fontSize: font.footnote, fontWeight: '600', color: color.textSecondary },
  statL: { color: color.textSecondary, fontSize: font.footnote },

  fine: {
    color: color.textTertiary, fontSize: font.footnote, lineHeight: 18,
    marginTop: 14, paddingHorizontal: size.contentX,
  },
});
