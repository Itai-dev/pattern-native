/**
 * One screen: today at the top, the activity you want back, the month
 * beneath.
 *
 * The hero states TODAY'S AVERAGE across completed check-ins, and says so.
 * It is not "your pain right now" — a single word floating over a colour
 * invited exactly that misreading. Number, label and count are all present,
 * so the value never depends on the colour alone.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import DaySquare from './DaySquare';
import MapScreen from './MapScreen';
import { Press } from './motion';
import {
  Entries, FuncEntry, checkinCount, dailyAverage, funcDue, funcTrend,
  latestFunc, todayISO,
} from './model';
import {
  ABILITY_MAX, formatCheckins, formatScore, formatScoreAndLabel, painLabel, speakScore,
} from './painScale';
import { color, radius, size } from './theme';

const SQUARE = 116, SQ_RADIUS = 27;

export interface HomeScreenProps {
  entries: Entries;
  func: FuncEntry[];
  goalText: string | null;
  onLog: () => void;
  onOpenDay: (dateIso: string) => void;
  onEvent: () => void;
  onFunc: () => void;
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
  const dueThisWeek = funcDue(func, t, !!goalText);

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

        <Text style={styles.todayLabel} allowFontScaling maxFontSizeMultiplier={1.5}>
          Today
        </Text>
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

      {/* the activity you want back — the outcome the app is actually for */}
      {goalText ? (
        <Press
          onPress={onFunc}
          pressOpacity={0.85}
          style={styles.card}
          accessibilityRole="button"
          accessibilityLabel={'Activity I want back: ' + goalText +
            (latest ? '. Weekly ability ' + latest.ability + ' out of ' + ABILITY_MAX : '. Not rated yet')}
          accessibilityHint="Opens this week’s function check-in"
        >
          <Text style={styles.cardKicker}>ACTIVITY I WANT BACK</Text>
          <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
            {goalText}
          </Text>
          <Text style={styles.cardSub} allowFontScaling maxFontSizeMultiplier={1.4}>
            {latest
              ? 'Weekly ability: ' + latest.ability + ' / ' + ABILITY_MAX
              : 'Not rated yet'}
            {trend
              ? '  ·  ' + trend.first.ability + ' → ' + trend.last.ability + ' so far'
              : ''}
          </Text>
          {dueThisWeek && (
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

      <View style={styles.mapWrap}>
        <MapScreen entries={entries} onDayPress={onOpenDay} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  today: { alignItems: 'center', marginTop: 22 },
  todayLabel: {
    color: color.textSecondary, fontSize: 13, fontWeight: '600',
    letterSpacing: 0.6, textTransform: 'uppercase', marginTop: 16,
  },
  avg: {
    color: color.textPrimary, fontSize: 24, fontWeight: '700',
    letterSpacing: -0.4, marginTop: 4, textAlign: 'center',
  },
  count: { color: color.textSecondary, fontSize: 13, marginTop: 4 },
  empty: { color: color.textSecondary, fontSize: 16, marginTop: 4 },
  actions: { paddingHorizontal: size.pageX, marginTop: 22 },
  primary: {
    height: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  secondary: {
    minHeight: 48, borderRadius: radius.button, marginTop: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12,
  },
  secondaryText: { color: color.textPrimary, fontSize: 15, fontWeight: '500' },
  card: {
    marginHorizontal: size.pageX, marginTop: 14, minHeight: 44,
    borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderDivider, backgroundColor: color.bgSurface, padding: 16,
  },
  cardKicker: {
    color: color.textSecondary, fontSize: 11, fontWeight: '600',
    letterSpacing: 0.6, marginBottom: 4,
  },
  cardTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  cardSub: { color: color.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  cardDue: { color: '#5BA8FF', fontSize: 13, marginTop: 8 },
  mapWrap: { marginTop: 26 },
});
