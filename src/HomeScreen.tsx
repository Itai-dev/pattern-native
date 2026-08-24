/**
 * The Today tab: the day, and the one action that matters.
 * The record lives in Trends, the month on the Map — act here, look there.
 *
 * The hero states the DAY'S AVERAGE across completed check-ins, and says
 * so. It is not "your pain right now" — a single word floating over a
 * colour invited exactly that misreading. Number, label and count are all
 * present, so the value never depends on the colour alone.
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
  FlatList, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import Animated, {
  SharedValue, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import DaySquare from './DaySquare';
import FocusCard from './FocusCard';
import { Press, reduceMotion } from './motion';
import {
  Entries, Entry, Protocol, QUALITY_NAMES, checkinCount, dailyAverage,
  dateFromISO, fmtTime, iso, todayISO,
} from './model';
import { HYPOTHESIS_OFFER_AFTER_DAYS } from './thresholds';
import {
  formatCheckins, formatScore, inkOn, painColor, painLabel, speakScore,
} from './painScale';
import { color, font, radius, size } from './theme';

const SQUARE = 132, SQ_RADIUS = 31;

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
}

/* ── one day ──────────────────────────────────────────────────
   Extracted so the pager can render it for any date without the page
   and the day being the same thing — which is what made "Today" a screen
   that could only ever be today. */
function DayCard({
  dateIso, entry, isToday, width, breath, onOpenDay, onLog,
}: {
  dateIso: string;
  entry: Entry | null;
  isToday: boolean;
  width: number;
  /** the screen's one breath clock; a card that is not today ignores it */
  breath: SharedValue<number>;
  onOpenDay: (dateIso: string) => void;
  onLog: () => void;
}) {
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isToday ? 1 + breath.value * 0.025 : 1 }],
  }));
  const avg = dailyAverage(entry);
  const count = entry ? checkinCount(entry) : 0;
  const logs = (entry && entry.logs ? entry.logs.slice() : []).sort((a, b) => b.h - a.h);
  const shown = logs.slice(0, ROWS);
  const hidden = logs.length - shown.length;
  const d = dateFromISO(dateIso);
  const when = isToday ? 'TODAY' : (WD[d.getDay()] + ', ' + d.getDate() + ' ' + M3[d.getMonth()]).toUpperCase();

  return (
    <View style={{ width }}>
      <View style={[styles.dayCard, { flex: 1 }]}>
        {/* the page says which day it is before anything else does — the
            one thing a swipeable card cannot leave to context */}
        <Text style={styles.when} allowFontScaling maxFontSizeMultiplier={1.3}>
          {when}
        </Text>

        <View style={styles.hero}>
          <Press
            onPress={() => (entry ? onOpenDay(dateIso) : isToday ? onLog() : undefined)}
            pressScale={0.97}
            pressOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel={(isToday ? 'Today' : when) + ', '
              + (avg == null
                ? 'no check-ins'
                : 'average pain ' + speakScore(avg) + ', ' + formatCheckins(count))}
            accessibilityHint={entry ? 'Opens the day’s detail'
              : isToday ? 'Starts a check-in' : undefined}
          >
            {/* only today breathes. A past day is finished, and a record
                that stirs is a record that looks like it is still moving */}
            <Animated.View style={breathStyle}>
              <DaySquare
                entry={entry} value={avg} size={SQUARE} radius={SQ_RADIUS}
                plus={isToday} today={isToday}
              >
                {avg != null && (
                  /* inkOn is the contrast-tested ink for this colour — the
                     number never depends on the square being mid-ramp */
                  <Text
                    allowFontScaling={false}
                    style={[styles.inSquare, { color: inkOn(avg) }]}
                  >
                    {formatScore(avg)}
                  </Text>
                )}
              </DaySquare>
            </Animated.View>
          </Press>

          {avg == null ? (
            <Text style={styles.empty} allowFontScaling maxFontSizeMultiplier={1.5}>
              {isToday ? 'No check-ins yet today' : 'Nothing logged'}
            </Text>
          ) : (
            /* the word and the provenance in one quiet line — the number
               already said the value from inside the square, and the small
               log squares below set this precedent long ago */
            <Text style={styles.underLine} allowFontScaling maxFontSizeMultiplier={1.4}>
              <Text style={styles.underWord}>{painLabel(avg)}</Text>
              {'  ·  ' + formatCheckins(count)}{count > 1 ? ' · average' : ''}
            </Text>
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
                  <View style={[styles.logSquare, { backgroundColor: painColor(l.pain) }]}>
                    <Text
                      allowFontScaling={false}
                      style={[styles.logScore, { color: inkOn(l.pain) }]}
                    >
                      {formatScore(l.pain)}
                    </Text>
                  </View>
                  <View style={styles.logMain}>
                    <Text style={styles.logLabel} allowFontScaling maxFontSizeMultiplier={1.4}>
                      {painLabel(l.pain)}
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
      </View>
    </View>
  );
}

export default function HomeScreen({
  entries, protocol, onLog, onOpenDay, onFocus, onKeepFocus, onTestFactor,
}: HomeScreenProps) {
  const t = todayISO();
  const { width } = useWindowDimensions();

  /* the same slow, shallow breath the pain shape and the Logged square
     carry — presence, not decoration. ±2.5% over 2.6s; still under
     Reduce Motion. */
  const breath = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    breath.value = withRepeat(withTiming(1, { duration: 2600 }), -1, true);
  }, []);
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

  /* A new day, or a first entry that lengthens the record, changes what
     the last index IS. Without this the pager keeps the pixel offset it
     had and quietly lands on yesterday at midnight. */
  useEffect(() => {
    list.current?.scrollToOffset({ offset: last * width, animated: false });
  }, [last, width]);

  const [onToday, setOnToday] = useState(true);

  /* the focus question is worth asking only once there is a record to
     form a hypothesis about — a first-day user has nothing to suspect */
  const offerSetup = Object.keys(entries).length >= HYPOTHESIS_OFFER_AFTER_DAYS;

  return (
    <View>
      <FlatList
        ref={list}
        data={days}
        keyExtractor={(d) => d}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={last}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(ev) => {
          const i = Math.round(ev.nativeEvent.contentOffset.x / width);
          setOnToday(i >= last);
        }}
        style={{ height: PAGE_H }}
        renderItem={({ item }) => (
          <DayCard
            dateIso={item}
            entry={entries[item] || null}
            isToday={item === t}
            width={width}
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
            list.current?.scrollToOffset({ offset: last * width, animated: true });
            setOnToday(true);
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
  + SQUARE + 12 + 20        // the square, the line under it
  + 20 + 14 + 18            // the rule and CHECK-INS
  + ROWS * 60               // the rows
  + 46                      // Show all
  + 16 + 8;                 // padding, and the card's bottom margin

const styles = StyleSheet.create({
  /* one card for the day: the average, a rule, and the check-ins behind
     it. The same grammar Trends uses, and the same reason — a boundary
     says what belongs together. */
  dayCard: {
    marginHorizontal: size.pageX, marginTop: 8, marginBottom: 8,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
  },
  when: {
    color: color.textTertiary, fontSize: font.footnote, fontWeight: '600',
    letterSpacing: 0.6, marginBottom: 4,
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
  /* the value lives inside the square, at the same weight the small log
     squares carry theirs — the hero is the row magnified. No "/10": the
     slider's ends and the report define the scale; a person reading
     their own day does not need reminding what it is out of. */
  inSquare: {
    fontSize: 46, fontWeight: '700', letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  underLine: { color: color.textTertiary, fontSize: font.subheadline, marginTop: 12 },
  underWord: { color: color.textSecondary, fontWeight: '600' },
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
  logSquare: {
    width: 38, height: 38, borderRadius: 10, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  logScore: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  logMain: { flex: 1, gap: 2 },
  logLabel: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  logQuality: { color: color.textSecondary, fontSize: font.footnote },
  logTime: {
    color: color.textSecondary, fontSize: font.subheadline, fontVariant: ['tabular-nums'],
  },
});
