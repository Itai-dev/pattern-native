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
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DaySquare from './DaySquare';
import FocusCard from './FocusCard';
import { Press } from './motion';
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
}

export default function HomeScreen({
  entries, protocol, onLog, onOpenDay, onFocus, onKeepFocus,
}: HomeScreenProps) {
  const t = todayISO();
  const e = entries[t] || null;
  const avg = dailyAverage(e);
  const count = e ? checkinCount(e) : 0;

  /* today's check-ins, newest first — the most recent one is "the current
     log", the rest are the day so far */
  const logs = (e && e.logs ? e.logs.slice() : []).sort((a, b) => b.h - a.h);

  /* the focus question is worth asking only once there is a record to
     form a hypothesis about — a first-day user has nothing to suspect */
  const offerSetup = Object.keys(entries).length >= HYPOTHESIS_OFFER_AFTER_DAYS;

  return (
    <View>
      {/* ── the day, as one value ─────────────────────────────
          Square, then number, then what the number means. Three sizes,
          descending, and nothing else at this level of the page. */}
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
          <DaySquare entry={e} value={avg} size={SQUARE} radius={SQ_RADIUS} plus today />
        </Press>

        {avg == null ? (
          <Text style={styles.empty} allowFontScaling maxFontSizeMultiplier={1.5}>
            No check-ins yet today
          </Text>
        ) : (
          <>
            <Text style={styles.score} allowFontScaling maxFontSizeMultiplier={1.4}>
              {formatScore(avg)}
              <Text style={styles.scoreOf}>/10</Text>
            </Text>
            <Text style={styles.label} allowFontScaling maxFontSizeMultiplier={1.4}>
              {painLabel(avg)}
            </Text>
            <Text style={styles.count} allowFontScaling maxFontSizeMultiplier={1.3}>
              {formatCheckins(count)}{count > 1 ? ' · average' : ''}
            </Text>
          </>
        )}
      </View>

      {/* ── the period, if one is running ────────────────────── */}
      {!!protocol && (
        <FocusCard
          protocol={protocol}
          entries={entries}
          todayIso={t}
          offerSetup={offerSetup}
          onStart={onFocus}
          onKeepGoing={onKeepFocus}
        />
      )}

      {/* ── the one action ───────────────────────────────────── */}
      <View style={styles.actions}>
        <Press
          onPress={onLog}
          pressScale={0.985}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel={logs.length ? 'Check in again' : 'Check in now'}
        >
          <Text style={styles.primaryText} allowFontScaling maxFontSizeMultiplier={1.4}>
            {logs.length ? 'Check in again' : 'Check in now'}
          </Text>
        </Press>
      </View>

      {/* ── the day so far ───────────────────────────────────
          A section heading outside the card rather than a caption inside
          it: the list is a part of the page, not a widget on it. */}
      {logs.length > 0 && (
        <>
          <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
            Today’s check-ins
          </Text>
          <View style={styles.logsCard}>
            {logs.map((l, i) => {
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
          </View>
        </>
      )}

      {/* ── and the invitation, below the day, when there is none ── */}
      {!protocol && (
        <FocusCard
          protocol={null}
          entries={entries}
          todayIso={t}
          offerSetup={offerSetup}
          onStart={onFocus}
          onKeepGoing={onKeepFocus}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginTop: 22 },
  /* the value, then its word, then its provenance — each step down in
     size is a step down in importance, and the gaps say the same thing */
  score: {
    color: color.textPrimary, fontSize: 52, fontWeight: '700',
    letterSpacing: -1.2, marginTop: 20, fontVariant: ['tabular-nums'],
    lineHeight: 56,
  },
  scoreOf: {
    color: color.textTertiary, fontSize: 24, fontWeight: '600', letterSpacing: -0.4,
  },
  label: {
    color: color.textSecondary, fontSize: font.title3, fontWeight: '600',
    letterSpacing: -0.2, marginTop: 2,
  },
  count: { color: color.textTertiary, fontSize: font.footnote, marginTop: 8 },
  empty: { color: color.textSecondary, fontSize: font.body, marginTop: 20 },

  actions: { paddingHorizontal: size.pageX, marginTop: 30 },
  primary: {
    minHeight: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },

  sectionTitle: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.2, marginTop: 34, marginBottom: 10,
    paddingHorizontal: size.pageX,
  },
  logsCard: {
    marginHorizontal: size.pageX,
    borderRadius: radius.card, backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    paddingHorizontal: 16,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 60 },
  logRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider },
  logSquare: {
    width: 38, height: 38, borderRadius: 10,
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
