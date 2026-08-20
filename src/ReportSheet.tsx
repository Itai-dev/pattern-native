/**
 * The doctor report — a designed preview and a genuinely shareable PDF.
 *
 * The screen shows the same structured data the PDF carries: key metrics,
 * a small pain-over-time chart with real gaps, function, locations and
 * events, in the app's own typography. "Share PDF" renders the light,
 * print-first document (report.ts) on the device with expo-print and
 * hands it to the iOS share sheet — paper, AirDrop, Messages, Files.
 * Nothing is uploaded anywhere.
 */
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as db from './db';
import { Press } from './motion';
import { EVENT_LABELS, dateFromISO, fmtTime, todayISO } from './model';
import { formatScore, painColor, painLabel } from './painScale';
import { ReportData, buildReportData, fmtReportDate, reportHtml } from './report';
import { color, font, radius, size } from './theme';

const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => {
  const d = dateFromISO(iso);
  return d.getDate() + ' ' + M3[d.getMonth()];
};

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.metric} accessible accessibilityLabel={label + ', ' + value + (sub ? ', ' + sub : '')}>
      <Text style={styles.metricV} allowFontScaling maxFontSizeMultiplier={1.4}>{value}</Text>
      <Text style={styles.metricL} allowFontScaling maxFontSizeMultiplier={1.4}>{label}</Text>
      {!!sub && <Text style={styles.metricS} numberOfLines={2}>{sub}</Text>}
    </View>
  );
}

/** the last 30 days as slim bars — logged days coloured by their average,
 *  unlogged days left as visible gaps */
function MiniChart({ data }: { data: ReportData }) {
  const byDate: Record<string, number> = {};
  data.days.forEach((d) => { byDate[d.date] = d.avg; });
  const end = dateFromISO(data.rangeEnd);
  const cols: { date: string; avg: number | null }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    cols.push({ date: k, avg: byDate[k] != null ? byDate[k] : null });
  }
  return (
    <View accessible accessibilityLabel="Daily average pain, last 30 days. Days without check-ins are gaps.">
      <View style={styles.chartRow}>
        {cols.map((c) => (
          <View key={c.date} style={styles.chartSlot}>
            {c.avg != null && (
              <View
                style={{
                  height: Math.max(3, (c.avg / 10) * 64),
                  backgroundColor: painColor(c.avg),
                  borderRadius: 2,
                }}
              />
            )}
          </View>
        ))}
      </View>
      <View style={styles.chartAxis}>
        <Text style={styles.axisText}>{shortDate(cols[0].date)}</Text>
        <Text style={styles.axisText}>{shortDate(cols[cols.length - 1].date)}</Text>
      </View>
    </View>
  );
}

export default function ReportSheet({ onDone }: { onDone: () => void }) {
  const data = useMemo(() => buildReportData({
    entries: db.getAll(),
    events: db.getEvents(),
    func: db.getFunc(),
    goalText: db.getGoal(),
    todayIso: todayISO(),
    windowDays: 90,
  }), []);

  const [sharing, setSharing] = useState(false);

  const sharePdf = async () => {
    if (!data || sharing) return;
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: reportHtml(data) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'Pattern — summary for your doctor',
        });
      } else {
        Alert.alert('Sharing isn’t available on this device.');
      }
    } catch {
      Alert.alert('Couldn’t create the PDF', 'Please try again.');
    } finally {
      setSharing(false);
    }
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
        <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.4}>
          Summary for your doctor
        </Text>
        <Text style={styles.sub} allowFontScaling maxFontSizeMultiplier={1.5}>
          Based on your self-recorded entries. This report does not provide a
          diagnosis or medical advice.
        </Text>

        {!data ? (
          <Text style={styles.empty}>
            Nothing logged yet — check in for a few days first, and the summary
            builds itself from your entries.
          </Text>
        ) : (
          <>
            {data.limited && (
              <View style={styles.limited}>
                <Text style={styles.limitedTitle}>
                  Limited record — {data.loggedDays} {data.loggedDays === 1 ? 'day' : 'days'} logged
                </Text>
                <Text style={styles.limitedSub}>
                  This short record shows what was logged. More days are needed
                  before changes over time can be meaningfully reviewed.
                </Text>
              </View>
            )}

            <Text style={styles.section}>Key metrics</Text>
            <Text style={styles.rangeLine}>
              {fmtReportDate(data.rangeStart)} – {fmtReportDate(data.rangeEnd)} · scale 0–10, 0 = no pain
            </Text>
            <View style={styles.metrics}>
              <Metric label="Average pain" value={formatScore(data.avg) + '/10'} sub={painLabel(data.avg)} />
              <Metric label="Lowest day" value={formatScore(data.lowestDay) + '/10'} />
              <Metric label="Highest day" value={formatScore(data.highestDay) + '/10'} />
              <Metric label="Logged days" value={String(data.loggedDays)} />
              <Metric label="Check-ins" value={String(data.totalCheckins)} />
              {data.goalText != null && data.latestAbility != null && (
                <Metric
                  label="Weekly ability"
                  value={data.latestAbility.ability + '/10'}
                  sub={data.goalText}
                />
              )}
            </View>

            <Text style={styles.section}>
              {data.limited ? 'Pain recorded so far' : 'Pain over time'}
            </Text>
            <MiniChart data={data} />
            <Text style={styles.noteLine}>
              Days without check-ins stay blank — nothing is filled in for you.
            </Text>

            {!!data.goalText && (
              <>
                <Text style={styles.section}>Function</Text>
                <Text style={styles.bodyText}>
                  {data.goalText}
                  {data.latestAbility
                    ? ' — latest weekly ability ' + data.latestAbility.ability + '/10'
                    : ' — no weekly ratings yet'}
                  {data.abilityChange && !data.limited
                    ? '. Since the first rating: ' + data.abilityChange.first.ability +
                      '/10 → ' + data.abilityChange.last.ability + '/10.'
                    : '.'}
                </Text>
              </>
            )}

            {data.locations.length > 0 && (
              <>
                <Text style={styles.section}>Pain locations</Text>
                {data.locations.slice(0, 6).map((l) => (
                  <View key={l.id} style={styles.locRow}>
                    <Text style={styles.bodyText}>{l.name}</Text>
                    <Text style={styles.locDays}>{l.days} {l.days === 1 ? 'day' : 'days'}</Text>
                  </View>
                ))}
              </>
            )}

            {data.events.length > 0 && (
              <>
                <Text style={styles.section}>Events</Text>
                {data.events.slice(-8).map((ev, i) => (
                  <View key={(ev.id != null ? ev.id : 'e' + i)} style={styles.locRow}>
                    <Text style={styles.bodyText} numberOfLines={2}>
                      {shortDate(ev.date)} {fmtTime(ev.h)} · {EVENT_LABELS[ev.kind]}
                      {ev.text ? ' — ' + ev.text : ''}
                    </Text>
                  </View>
                ))}
                <Text style={styles.noteLine}>
                  Events are shown alongside your check-ins without assuming they
                  caused a change.
                </Text>
              </>
            )}

            <Press
              onPress={sharePdf}
              disabled={sharing}
              pressScale={0.985}
              style={[styles.primary, sharing && styles.primaryOff]}
              accessibilityRole="button"
              accessibilityState={{ disabled: sharing }}
              accessibilityLabel="Share PDF"
              accessibilityHint="Creates the report as a PDF and opens the share sheet"
            >
              <Text style={[styles.primaryText, sharing && styles.primaryTextOff]}>
                {sharing ? 'Preparing…' : 'Share PDF'}
              </Text>
            </Press>
            <Text style={styles.noteLine}>
              The PDF is created on this iPhone and shared only where you send it.
            </Text>
          </>
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
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  body: { padding: size.sheetX, paddingTop: 22, paddingBottom: 34 },
  title: { color: color.textPrimary, fontSize: font.title2, fontWeight: '700', letterSpacing: -0.3 },
  sub: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 6 },
  empty: { color: color.textSecondary, fontSize: font.body, marginTop: 20, lineHeight: 24 },
  limited: {
    marginTop: 16, padding: 12, borderRadius: radius.card,
    backgroundColor: color.bgSurface, borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderControl, gap: 3,
  },
  limitedTitle: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  limitedSub: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },
  section: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    marginTop: 24, marginBottom: 8, letterSpacing: -0.2,
  },
  rangeLine: { color: color.textSecondary, fontSize: font.footnote, marginBottom: 10, marginTop: -4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    flexGrow: 1, flexBasis: '30%', borderRadius: 12, padding: 10,
    backgroundColor: color.bgSurface, gap: 1,
  },
  metricV: { color: color.textPrimary, fontSize: font.title3, fontWeight: '700', fontVariant: ['tabular-nums'] },
  metricL: { color: color.textSecondary, fontSize: font.footnote },
  metricS: { color: color.textTertiary, fontSize: font.footnote },
  chartRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 2,
    height: 68, paddingTop: 4,
  },
  chartSlot: { flex: 1, justifyContent: 'flex-end' },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { color: color.textTertiary, fontSize: font.footnote },
  noteLine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 8 },
  bodyText: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21, flexShrink: 1 },
  locRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 10,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  locDays: { color: color.textSecondary, fontSize: font.subheadline, fontVariant: ['tabular-nums'] },
  primary: {
    minHeight: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 26, paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
  primaryOff: { backgroundColor: color.bgSegmentActive },
  primaryTextOff: { color: color.textTertiary },
});
