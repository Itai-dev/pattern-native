/**
 * A day's detail: what the day averaged, from how many check-ins, and each
 * check-in with its own time, number, label and places.
 *
 * The ambiguous ✕ beside every row is gone. A row is tapped to edit; it is
 * deleted by swiping it away, which asks for confirmation first and then
 * recalculates the day's average immediately.
 */
import React, { useCallback, useState } from 'react';
import {
  Alert, LayoutAnimation, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import DaySquare from './DaySquare';
import * as db from './db';
import { Press, reduceMotion } from './motion';
import {
  Entry, EVENT_LABELS, LOC_NAMES, QUALITY_NAMES, checkinCount, dailyAverage,
  dateFromISO, fmtTime, logsOf, todayISO,
} from './model';
import {
  formatCheckins, formatOutOf, formatScoreAndLabel, painColor, speakScore,
} from './painScale';
import { color, radius, size } from './theme';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function names(ids: string[] | undefined, map: Record<string, string>): string {
  return (ids || []).map((id) => map[id] || id).join(', ');
}

export interface DaySheetProps {
  dateIso: string;
  entry: Entry | null;
  onChanged: () => void;
  onAddLog: () => void;
  onEditLog: (h: number) => void;
  onClose: () => void;
}

export default function DaySheet({
  dateIso, entry, onChanged, onAddLog, onEditLog, onClose,
}: DaySheetProps) {
  const [, force] = useState(0);
  const d = dateFromISO(dateIso);
  const isToday = dateIso === todayISO();
  const live = db.getDay(dateIso) || entry;   // always the current truth
  const logs = logsOf(live);
  const avg = dailyAverage(live);
  const count = live ? checkinCount(live) : 0;

  const places: string[] = [];
  const seen: Record<string, true> = {};
  logs.forEach((l) => (l.loc || []).forEach((id) => {
    if (!seen[id]) { seen[id] = true; places.push(id); }
  }));

  /* deleting is destructive, so it asks first and says what it removes */
  const confirmDelete = useCallback((h: number) => {
    Alert.alert(
      'Delete this check-in?',
      'The ' + fmtTime(h) + ' check-in will be removed and the day’s average recalculated. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            if (!reduceMotion) {
              LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
            }
            db.dropMoment(dateIso, h);
            force((n) => n + 1);   // the header's average updates in place
            onChanged();
          },
        },
      ]
    );
  }, [dateIso, onChanged]);

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <View style={styles.navSpacer} />
        <Text style={styles.navTitle} numberOfLines={1}>
          {d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}
        </Text>
        <Press
          onPress={onClose}
          style={styles.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.navBtnText}>Done</Text>
        </Press>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <DaySquare entry={live} value={avg} size={44} radius={11} />
          <View style={styles.headerText}>
            <Text style={styles.date} allowFontScaling maxFontSizeMultiplier={1.4}>
              {DAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}
            </Text>
            {avg == null ? (
              <Text style={styles.sub}>No check-ins on this day</Text>
            ) : (
              <>
                <Text
                  style={styles.avg}
                  allowFontScaling
                  maxFontSizeMultiplier={1.4}
                  accessibilityLabel={'Daily average ' + speakScore(avg)}
                >
                  Daily average {formatScoreAndLabel(avg)}
                </Text>
                <Text style={styles.sub}>{formatCheckins(count)}</Text>
              </>
            )}
            {places.length > 0 && (
              <Text style={styles.sub}>Where: {names(places, LOC_NAMES)}</Text>
            )}
          </View>
        </View>

        {logs.length > 0 && (
          <View style={styles.list}>
            <Text style={styles.listTitle}>CHECK-INS</Text>
            {logs.map((l) => (
              <Swipeable
                key={l.h}
                overshootRight={false}
                renderRightActions={() => (
                  <Press
                    onPress={() => confirmDelete(l.h)}
                    style={styles.deleteAction}
                    accessibilityRole="button"
                    accessibilityLabel={'Delete the ' + fmtTime(l.h) + ' check-in'}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </Press>
                )}
              >
                <Press
                  onPress={() => onEditLog(l.h)}
                  pressOpacity={0.7}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={fmtTime(l.h) + ', ' + speakScore(l.pain) +
                    (l.loc && l.loc.length ? ', ' + names(l.loc, LOC_NAMES) : '')}
                  accessibilityHint="Opens this check-in to edit. Swipe left to delete."
                >
                  <View style={[styles.swatch, { backgroundColor: painColor(l.pain) }]} />
                  <Text style={styles.time} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {fmtTime(l.h)}
                  </Text>
                  <View style={styles.rowMid}>
                    <Text style={styles.rowScore} allowFontScaling maxFontSizeMultiplier={1.3}>
                      {formatOutOf(l.pain)} · {formatScoreAndLabel(l.pain).split(' · ')[1]}
                    </Text>
                    {l.loc && l.loc.length > 0 && (
                      <Text style={styles.rowSub}>{names(l.loc, LOC_NAMES)}</Text>
                    )}
                    {l.q && l.q.length > 0 && (
                      <Text style={styles.rowSub}>{names(l.q, QUALITY_NAMES)}</Text>
                    )}
                  </View>
                  <Text style={styles.chev}>›</Text>
                </Press>
              </Swipeable>
            ))}
            <Text style={styles.swipeHint}>Tap to edit · swipe left to delete</Text>
          </View>
        )}

        {/* events recorded that day — listed as events, with no suggestion
            that any of them explains the pain */}
        {(() => {
          const evs = db.getEventsFor(dateIso);
          if (!evs.length) return null;
          return (
            <View style={styles.list}>
              <Text style={styles.listTitle}>EVENTS</Text>
              {evs.map((ev) => (
                <View
                  key={ev.id}
                  style={styles.eventRow}
                  accessible
                  accessibilityLabel={fmtTime(ev.h) + ', ' + EVENT_LABELS[ev.kind] +
                    (ev.text ? ', ' + ev.text : '')}
                >
                  <Text style={styles.time}>{fmtTime(ev.h)}</Text>
                  <View style={styles.rowMid}>
                    <Text style={styles.rowScore}>{EVENT_LABELS[ev.kind]}</Text>
                    {!!ev.text && <Text style={styles.rowSub}>{ev.text}</Text>}
                    {ev.helped != null && (
                      <Text style={styles.rowSub}>Reported effect {ev.helped} / 10</Text>
                    )}
                  </View>
                </View>
              ))}
              <Text style={styles.swipeHint}>Recorded as events. No cause is implied.</Text>
            </View>
          );
        })()}

        {live?.note ? <Text style={styles.note}>“{live.note}”</Text> : null}

        {isToday && (
          <Press
            onPress={onAddLog}
            pressScale={0.985}
            style={styles.primary}
            accessibilityRole="button"
            accessibilityLabel="Add another check-in"
          >
            <Text style={styles.primaryText}>Add a check-in</Text>
          </Press>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 64 },
  navTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: '#5BA8FF', fontSize: 17, fontWeight: '600' },
  body: { padding: size.sheetX, paddingTop: 20, paddingBottom: 30 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  headerText: { flex: 1, gap: 3 },
  date: { color: color.textPrimary, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  avg: { color: color.textPrimary, fontSize: 15, fontWeight: '500' },
  sub: { color: color.textSecondary, fontSize: 13 },
  list: {
    marginTop: 22, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  listTitle: {
    color: color.textSecondary, fontSize: 11, fontWeight: '600',
    letterSpacing: 0.6, marginBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 56, backgroundColor: color.bgSheet, paddingRight: 4,
  },
  swatch: { width: 16, height: 16, borderRadius: 5 },
  time: {
    color: color.textPrimary, fontSize: 14, minWidth: 48,
    fontVariant: ['tabular-nums'],
  },
  rowMid: { flex: 1 },
  rowScore: { color: color.textPrimary, fontSize: 14 },
  rowSub: { color: color.textSecondary, fontSize: 12, marginTop: 1 },
  chev: { color: color.textTertiary, fontSize: 20 },
  deleteAction: {
    width: 96, minHeight: 56, backgroundColor: color.danger,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  swipeHint: { color: color.textSecondary, fontSize: 11, marginTop: 10 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44, paddingVertical: 6 },
  note: {
    marginTop: 18, paddingTop: 14, color: color.textSecondary, fontSize: 15,
    lineHeight: 23, fontStyle: 'italic',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  primary: {
    height: 48, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  primaryText: { color: '#000000', fontSize: 15, fontWeight: '600' },
});
