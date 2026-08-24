/**
 * The Today tab: the day so far, and the one action that matters.
 * The record lives in Trends, the month on the Map — act here, look there.
 *
 * The hero states TODAY'S AVERAGE across completed check-ins, and says so.
 * It is not "your pain right now" — a single word floating over a colour
 * invited exactly that misreading. Number, label and count are all present,
 * so the value never depends on the colour alone. No "Today" caption: the
 * selected tab already says it.
 *
 * One primary action, and nothing competing with it. The screen used to
 * carry a second button and a goal card underneath, which meant the thing
 * people opened the app to do shared the fold with two things they mostly
 * did not. Hierarchy here is a subtraction, not a type scale.
 */
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import DaySquare from './DaySquare';
import FocusCard from './FocusCard';
import { Press, reduceMotion } from './motion';
import {
  Entries, Protocol, QUALITY_NAMES, checkinCount, dailyAverage, fmtTime, todayISO,
} from './model';
import { HYPOTHESIS_OFFER_AFTER_DAYS } from './thresholds';
import {
  formatCheckins, formatScore, inkOn, painColor, painLabel, speakScore,
} from './painScale';
import { color, font, radius, size } from './theme';

const SQUARE = 132, SQ_RADIUS = 31;

export interface HomeScreenProps {
  entries: Entries;
  protocol: Protocol | null;
  onLog: () => void;
  onOpenDay: (dateIso: string) => void;
  onFocus: () => void;
  onKeepFocus: () => void;
  onTestFactor: (metricId: string) => void;
}

export default function HomeScreen({
  entries, protocol, onLog, onOpenDay, onFocus, onKeepFocus, onTestFactor,
}: HomeScreenProps) {
  const t = todayISO();
  const e = entries[t] || null;
  const avg = dailyAverage(e);
  const count = e ? checkinCount(e) : 0;

  /* the same slow, shallow breath the pain shape and the Logged square
     carry — presence, not decoration. ±2.5% over 2.6s; still under
     Reduce Motion. */
  const breath = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    breath.value = withRepeat(withTiming(1, { duration: 2600 }), -1, true);
  }, []);
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.025 }],
  }));

  /* today's check-ins, newest first — the most recent one is "the current
     log", the rest are the day so far */
  const logs = (e && e.logs ? e.logs.slice() : []).sort((a, b) => b.h - a.h);

  /* A heavy day can run to six or eight moments, and Today is where you
     act — the button belongs above the fold, not below a list. Three is
     enough to see the shape of the day; the rest are one tap away and
     the count says exactly how many, because a list that hides an
     unknown number is a list you cannot trust. */
  const [allLogs, setAllLogs] = useState(false);
  const shownLogs = allLogs ? logs : logs.slice(0, 3);

  /* the focus question is worth asking only once there is a record to
     form a hypothesis about — a first-day user has nothing to suspect */
  const offerSetup = Object.keys(entries).length >= HYPOTHESIS_OFFER_AFTER_DAYS;

  return (
    <View>
      {/* ── the day, as one value ─────────────────────────────
          Square, then number, then what the number means. Three sizes,
          descending, and nothing else at this level of the page. */}
      <View style={styles.dayCard}>
      <View style={styles.hero}>
        <Press
          onPress={() => (e ? onOpenDay(t) : onLog())}
          pressScale={0.97}
          pressOpacity={0.9}
          accessibilityRole="button"
          accessibilityLabel={avg == null
            ? 'Today, no check-ins yet'
            : 'Today, average pain ' + speakScore(avg) + ', ' + formatCheckins(count)}
          accessibilityHint={e ? 'Opens today’s detail' : 'Starts a check-in'}
        >
          <Animated.View style={breathStyle}>
          <DaySquare entry={e} value={avg} size={SQUARE} radius={SQ_RADIUS} plus today>
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
            No check-ins yet today
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
          <View>
            {shownLogs.map((l, i) => {
              const q = (l.q || []).map((id) => QUALITY_NAMES[id] || id).join(', ');
              return (
                <Press
                  key={l.h + '-' + i}
                  onPress={() => onOpenDay(t)}
                  pressOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={fmtTime(l.h) + ', pain ' + speakScore(l.pain)
                    + (q ? ', ' + q : '')}
                  accessibilityHint="Opens today’s detail"
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

            {logs.length > 3 && (
              <Press
                onPress={() => setAllLogs(!allLogs)}
                pressOpacity={0.7}
                style={styles.moreRow}
                accessibilityRole="button"
                accessibilityState={{ expanded: allLogs }}
                accessibilityLabel={allLogs
                  ? 'Show fewer check-ins'
                  : 'Show all ' + logs.length + ' check-ins'}
              >
                <Text style={styles.moreText}>
                  {allLogs ? 'Show fewer' : 'Show all ' + logs.length}
                </Text>
              </Press>
            )}
          </View>
        </>
      )}
      </View>

      {/* ── the period, or the invitation to start one ────────
          One render, not two mirrored ones: the card already draws itself
          differently for a null protocol, and keeping two call sites in
          step by hand was a bug waiting for the next change to this
          screen. It sits BELOW the day now — the day is why you opened
          the app; this is what to do next. */}
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

const styles = StyleSheet.create({
  /* one card for the day: the average, a rule, and the check-ins behind
     it. The same grammar Trends uses, and the same reason — a boundary
     says what belongs together. */
  dayCard: {
    marginHorizontal: size.pageX, marginTop: 8,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16,
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
