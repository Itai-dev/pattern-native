import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Press } from './motion';
import { Comparison } from './health/comparisons';
import { factorLabel } from './health/engine';
import { formatScore } from './painScale';
import { fmtReportDate } from './report';
import { GroupBars, DoseBars } from './ComparisonBars';
import { color, font, radius } from './theme';

/** A single comparison gets its own reading surface. Recorded days stay
 *  attached to the evidence so a summary can always be checked. */
export default function ComparisonDetail({ item, rangeLabel, onDone, onOpenDay }: {
  item: Comparison; rangeLabel?: string; onDone: () => void; onOpenDay: (date: string) => void;
}) {
  const [allDays, setAllDays] = useState(false);
  const days = item.paired?.map(p => ({ date: p.date,
    value: factorLabel(item.health!.kind, p.factor) + ' · pain ' + formatScore(p.pain) + '/10' }))
    || item.pairedDoses?.map(p => ({ date: p.date,
      value: 'Pain ' + formatScore(p.before) + '/10 before · ' + formatScore(p.after) + '/10 after' })) || [];
  const shown = allDays ? days : days.slice(-5);
  return <View style={styles.sheet}>
    <View style={styles.nav}>
      <Text style={styles.navTitle}>Comparison</Text>
      <Press onPress={onDone} style={styles.action} accessibilityRole="button" accessibilityLabel="Done with comparison">
        <Text style={styles.link}>Done</Text>
      </Press>
    </View>
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.meta}>{item.family} · {item.status}</Text>
      <Text style={styles.title}>{item.title}</Text>
      {!!rangeLabel && <Text style={styles.meta}>Selected period: {rangeLabel}</Text>}
      <View style={styles.card}>
        <Text style={styles.label}>What your record shows</Text>
        <Text style={styles.summary}>{item.summary}</Text>
        <Text style={styles.meta}>{item.caveat}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>The evidence</Text>
        {!!item.evidence && <Text style={styles.copy}>{item.evidence}</Text>}
        {!!item.from && !!item.to && <Text style={styles.meta}>
          Paired records: {fmtReportDate(item.from)} to {fmtReportDate(item.to)}
        </Text>}
        {(item.health?.low || item.early || item.dose?.before !== undefined) && <>
          <Text style={styles.meta}>Average pain · 0–10</Text>
          {item.health?.low ? <GroupBars a={item.health} /> : item.early ? <GroupBars a={item.early} /> : null}
          {!!item.dose && <DoseBars a={item.dose} />}
        </>}
        <Text style={styles.meta}>{item.timing}</Text>
        <Text style={styles.meta}>{item.caveat}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.label}>How to use this</Text>
        <Text style={styles.copy}>{item.status === 'Worth watching'
          ? 'Look at the recorded days below. This observation can help you frame a question for your clinician; it does not tell you which activity or treatment to change.'
          : item.status === 'Still collecting'
            ? 'The available records do not support a finding yet. Keep using Pattern when it is useful to you. Extra logging does not guarantee a pattern.'
            : 'There is no consistent association to act on in these records. That does not establish whether an activity is safe or a treatment is effective.'}</Text>
      </View>
      {!!days.length && <View style={styles.card}>
        <Text style={styles.label}>Recorded days</Text>
        <Text style={styles.meta}>{allDays || days.length <= 5 ? 'All paired days in this period.' : 'The latest five paired days. Open a day to see its context.'}</Text>
        {shown.map(d => <Press key={d.date} onPress={() => onOpenDay(d.date)} style={styles.day}
          accessibilityRole="button" accessibilityLabel={'Open ' + fmtReportDate(d.date) + '. ' + d.value}>
          <Text style={styles.link}>{fmtReportDate(d.date)} ›</Text>
          <Text style={styles.meta}>{d.value}</Text>
        </Press>)}
        {days.length > 5 && <Press onPress={() => setAllDays(!allDays)} style={styles.action}
          accessibilityRole="button" accessibilityState={{ expanded: allDays }}>
          <Text style={styles.link}>{allDays ? 'Show fewer days' : 'Show all ' + days.length + ' paired days'}</Text>
        </Press>}
      </View>}
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.bgSheet },
  nav: { paddingHorizontal: 20, paddingTop: 10, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', flex: 1 },
  body: { padding: 20, paddingBottom: 40 },
  title: { color: color.textPrimary, fontSize: font.title2, fontWeight: '700', marginTop: 8 },
  card: { borderRadius: radius.card, padding: 16, backgroundColor: color.bgSurface, marginTop: 16 },
  label: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  summary: { color: color.textPrimary, fontSize: font.body, lineHeight: 25, marginTop: 10 },
  copy: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 23, marginTop: 8 },
  meta: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 20, marginTop: 8 },
  link: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  action: { minHeight: 44, justifyContent: 'center', paddingVertical: 10 },
  day: { minHeight: 56, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderDivider, marginTop: 10 },
});
