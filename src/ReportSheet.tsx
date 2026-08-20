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
import { buildReport, todayISO } from './model';
import { color, radius, size } from './theme';

export default function ReportSheet({ onDone }: { onDone: () => void }) {
  const text = useMemo(() => buildReport({
    entries: db.getAll(),
    events: db.getEvents(),
    weekly: db.getWeekly(),
    goalText: db.getGoal(),
    todayIso: todayISO(),
    windowDays: 90,
  }), []);

  const share = () => {
    Share.share({ message: text }).catch(() => {});
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Summary for your doctor</Text>
        <Text style={styles.sub}>
          A plain summary of what you logged, in the order clinicians assess.
          Facts from your own entries — no diagnosis, no advice.
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
      <Press onPress={onDone} style={styles.done}>
        <Text style={styles.doneText}>Done</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  body: { padding: size.sheetX, paddingTop: 22, paddingBottom: 8 },
  title: { color: color.textPrimary, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  sub: { color: color.textTertiary, fontSize: 13, lineHeight: 19, marginTop: 6 },
  paper: {
    marginTop: 16, padding: 14, borderRadius: 12,
    backgroundColor: color.bgRoot, borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
  },
  mono: {
    color: color.textPrimary, fontSize: 12.5, lineHeight: 19,
    fontVariant: ['tabular-nums'],
  },
  empty: { color: color.textTertiary, fontSize: 14, marginTop: 20, lineHeight: 20 },
  primary: {
    height: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 18,
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  done: { paddingVertical: 14, alignItems: 'center' },
  doneText: { color: color.textSecondary, fontSize: 16 },
});
