/**
 * The Today tab: the day so far, the actions, the activity you want back.
 * The month lives one tab away — act here, reflect there.
 *
 * The hero states TODAY'S AVERAGE across completed check-ins, and says so.
 * It is not "your pain right now" — a single word floating over a colour
 * invited exactly that misreading. Number, label and count are all present,
 * so the value never depends on the colour alone. No "Today" caption:
 * the selected tab already says it.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DaySquare from './DaySquare';
import { Press } from './motion';
import {
  Entries, FuncEntry, QUALITY_NAMES, checkinCount, dailyAverage, dateFromISO,
  fmtTime, funcStatus, funcTrend, latestFunc, todayISO,
} from './model';
import {
  ABILITY_MAX, formatCheckins, formatScore, formatScoreAndLabel, inkOn,
  painColor, painLabel, speakScore,
} from './painScale';
import { color, font, radius, size } from './theme';

const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDay = (dateIso: string) => {
  const d = dateFromISO(dateIso);
  return d.getDate() + ' ' + M3[d.getMonth()];
};

const SQUARE = 116, SQ_RADIUS = 27;

export interface HomeScreenProps {
  entries: Entries;
  func: FuncEntry[];
  goalText: string | null;
  onLog: () => void;
  onOpenDay: (dateIso: string) => void;
  onEvent: () => void;
  /** true = the starting-point rating, false = the weekly one */
  onFunc: (baseline: boolean) => void;
  onSetGoal: () => void;
}

export default function HomeScreen({
  entries, func, goalText, onLog, onOpenDay, onEvent, onFunc, onSetGoal,
}: HomeScreenProps) {
  const t = todayISO();
  const e = entries[t] || null;
  const avg = dailyAverage(e);
  const count = e ? checkinCount(e) : 0;

  const latest = latestFunc(func);
  const trend = funcTrend(func);
  const status = funcStatus(func, t, !!goalText);

  /* today's check-ins, newest first — the most recent one is "the current
     log", the rest are the day so far */
  const logs = (e && e.logs ? e.logs.slice() : []).sort((a, b) => b.h - a.h);

  return (
    <View>
      {/* today, as an average — labelled as one */}
      <View style={styles.today}>
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
          <DaySquare
            entry={e}
            value={avg}
            size={SQUARE}
            radius={SQ_RADIUS}
            plus
            today
          />
        </Press>

        {avg == null ? (
          <Text style={styles.empty} allowFontScaling maxFontSizeMultiplier={1.5}>
            No check-ins yet today
          </Text>
        ) : (
          <>
            <Text style={styles.avg} allowFontScaling maxFontSizeMultiplier={1.5}>
              {formatScoreAndLabel(avg)}
            </Text>
            <Text style={styles.count} allowFontScaling maxFontSizeMultiplier={1.4}>
              {formatCheckins(count)}
              {count > 1 ? ' · average' : ''}
            </Text>
          </>
        )}
      </View>

      <View style={styles.actions}>
        <Press
          onPress={onLog}
          pressScale={0.985}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel="Check in now"
        >
          <Text style={styles.primaryText} allowFontScaling maxFontSizeMultiplier={1.4}>
            Check in now
          </Text>
        </Press>

        {/* a real secondary action, not helper text */}
        <Press
          onPress={onEvent}
          pressOpacity={0.85}
          style={styles.secondary}
          accessibilityRole="button"
          accessibilityLabel="Log something that changed"
        >
          <Text style={styles.secondaryText} allowFontScaling maxFontSizeMultiplier={1.4}>
            Log something that changed
          </Text>
        </Press>
      </View>

      {/* what was actually logged today: each check-in with its time, its
          score, and how it felt — the day's record, not just its average */}
      {logs.length > 0 && (
        <View style={styles.logsCard}>
          <Text style={styles.logsKicker}>Today’s check-ins</Text>
          {logs.map((l, i) => {
            const q = (l.q || []).map((id) => QUALITY_NAMES[id] || id).join(', ');
            return (
              <Press
                key={l.h + '-' + i}
                onPress={() => onOpenDay(t)}
                pressOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={fmtTime(l.h) + ', pain ' + speakScore(l.pain) +
                  (q ? ', ' + q : '')}
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
                    <Text style={styles.logQuality} numberOfLines={1}
                      allowFontScaling maxFontSizeMultiplier={1.4}>
                      {q}
                    </Text>
                  )}
                </View>
                <Text style={styles.logTime} allowFontScaling maxFontSizeMultiplier={1.4}>
                  {fmtTime(l.h)}
                </Text>
              </Press>
            );
          })}
        </View>
      )}

      {/* the activity you want back — the outcome the app is actually for.
          Three states: no starting point yet → set it; rated within the
          last seven days → the next date, plainly; seven days elapsed →
          this week's check-in. */}
      {goalText ? (
        <Press
          onPress={() => {
            if (status.kind === 'baseline') onFunc(true);
            else if (status.kind === 'due') onFunc(false);
          }}
          disabled={status.kind === 'wait'}
          pressOpacity={status.kind === 'wait' ? 1 : 0.85}
          style={styles.card}
          accessibilityRole="button"
          accessibilityLabel={'Activity I want back: ' + goalText +
            (latest ? '. Weekly ability ' + latest.ability + ' out of ' + ABILITY_MAX : '. Not rated yet')}
          accessibilityHint={status.kind === 'baseline'
            ? 'Opens the starting-point rating'
            : status.kind === 'due'
              ? 'Opens this week’s check-in'
              : status.kind === 'wait'
                ? 'The next check-in opens on ' + fmtDay(status.until)
                : undefined}
        >
          <Text style={styles.cardKicker}>Activity I want back</Text>
          <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
            {goalText}
          </Text>
          {/* one status line is enough — "Not rated yet" next to "Set your
              starting point" said the same thing twice */}
          {latest && (
            <Text style={styles.cardSub} allowFontScaling maxFontSizeMultiplier={1.4}>
              {'Weekly ability: ' + latest.ability + '/' + ABILITY_MAX}
              {trend
                ? '  ·  ' + trend.first.ability + ' → ' + trend.last.ability + ' so far'
                : ''}
            </Text>
          )}
          {status.kind === 'baseline' && (
            <Text style={styles.cardDue} allowFontScaling maxFontSizeMultiplier={1.4}>
              Set your starting point →
            </Text>
          )}
          {status.kind === 'wait' && (
            <Text style={styles.cardWait} allowFontScaling maxFontSizeMultiplier={1.4}>
              Next check-in available {fmtDay(status.until)}
            </Text>
          )}
          {status.kind === 'due' && (
            <Text style={styles.cardDue} allowFontScaling maxFontSizeMultiplier={1.4}>
              This week’s check-in is ready →
            </Text>
          )}
        </Press>
      ) : (
        <Press
          onPress={onSetGoal}
          pressOpacity={0.85}
          style={styles.card}
          accessibilityRole="button"
          accessibilityLabel="Choose one activity you want back"
        >
          <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
            Choose one activity you want back
          </Text>
          <Text style={styles.cardSub} allowFontScaling maxFontSizeMultiplier={1.4}>
            So progress is measured against your life, not only a pain score.
          </Text>
        </Press>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  today: { alignItems: 'center', marginTop: 26 },
  /* the main pain value — a large display size, still scaling with
     Dynamic Type. It can breathe now that the month lives on its own tab. */
  avg: {
    color: color.textPrimary, fontSize: font.largeTitle, fontWeight: '700',
    letterSpacing: -0.7, marginTop: 18, textAlign: 'center',
  },
  count: { color: color.textSecondary, fontSize: font.subheadline, marginTop: 4 },
  empty: { color: color.textSecondary, fontSize: font.body, marginTop: 18 },
  actions: { paddingHorizontal: size.pageX, marginTop: 26 },
  primary: {
    minHeight: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
  secondary: {
    minHeight: 48, borderRadius: radius.button, marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
  },
  secondaryText: { color: color.textPrimary, fontSize: font.body, fontWeight: '500' },
  card: {
    marginHorizontal: size.pageX, marginTop: 14, minHeight: 44,
    borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderDivider, backgroundColor: color.bgSurface, padding: 16,
  },
  cardKicker: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    marginBottom: 4,
  },
  cardTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  cardSub: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 20, marginTop: 4 },
  cardDue: { color: color.tint, fontSize: font.subheadline, fontWeight: '500', marginTop: 8 },
  cardWait: { color: color.textSecondary, fontSize: font.subheadline, marginTop: 8 },
  logsCard: {
    marginHorizontal: size.pageX, marginTop: 14,
    borderRadius: radius.card, backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  logsKicker: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    marginBottom: 4,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54 },
  logRowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider },
  logSquare: {
    width: 34, height: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  logScore: { fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  logMain: { flex: 1, gap: 1 },
  logLabel: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  logQuality: { color: color.textSecondary, fontSize: font.footnote },
  logTime: { color: color.textSecondary, fontSize: font.subheadline, fontVariant: ['tabular-nums'] },
});
