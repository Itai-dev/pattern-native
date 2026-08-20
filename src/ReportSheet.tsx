/**
 * The clinician report. One page, SOCRATES order, thirty seconds — the
 * constraint comes from the patient-generated-data literature: clinicians
 * set aside anything that reads like a firehose. Facts from the user's own
 * records, association language only, shared through the system share sheet
 * so it can reach paper, AirDrop, or a message without this app ever
 * touching a server.
 */
import React, { useMemo } from 'react';
import { ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import * as db from './db';
import { Press } from './motion';
import { buildReport, reportDayCount, todayISO } from './model';
import { color, radius, size } from './theme';

export default function ReportSheet({ onDone }: { onDone: () => void }) {
  const text = useMemo(() => buildReport({
    entries: db.getAll(),
    events: db.getEvents(),
    func: db.getFunc(),
    goalText: db.getGoal(),
    todayIso: todayISO(),
    windowDays: 90,
  }), []);

  const dayCount = useMemo(
    () => reportDayCount(db.getAll(), todayISO(), 90), []);

  const share = () => {
    Share.share({ message: text }).catch(() => {});
  };

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <View style={styles.navSpacer} />
        <Text style={styles.navTitle}>Doctor summary</Text>
        <Press onPress={onDone} style={styles.navBtn} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Done">
          <Text style={styles.navBtnText}>Done</Text>
        </Press>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Summary for your doctor</Text>
        <Text style={styles.sub}>
          Based on {dayCount} logged {dayCount === 1 ? 'day' : 'days'}. Facts from your own
          entries, in the order clinicians assess — no diagnosis, no advice.
          {dayCount < 14 ? ' A short record shows what was logged, not a pattern.' : ''}
        </Text>
        {text ? (
          <View style={styles.paper}>
            <Text style={styles.mono}>{text}</Text>
          </View>
        ) : (
          <Text style={styles.empty}>A few more logged days first — the summary needs at least five.</Text>
        )}
        {!!text && (
          <Press onPress={share} pressScale={0.985} style={styles.primary}>
            <Text style={styles.primaryText}>Share</Text>
          </Press>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  body: { padding: size.sheetX, paddingTop: 22, paddingBottom: 8 },
  title: { color: color.textPrimary, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  sub: { color: color.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  paper: {
    marginTop: 16, padding: 14, borderRadius: 12,
    backgroundColor: color.bgRoot, borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
  },
  mono: {
    color: color.textPrimary, fontSize: 12.5, lineHeight: 19,
    fontVariant: ['tabular-nums'],
  },
  empty: { color: color.textSecondary, fontSize: 14, marginTop: 20, lineHeight: 20 },
  primary: {
    height: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 18,
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 64 },
  navTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: '#5BA8FF', fontSize: 17, fontWeight: '600' },
});
