import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Press } from './motion';
import { Comparison, leadingComparison } from './health/comparisons';
import { factorLabel } from './health/engine';
import { formatScore } from './painScale';
import { fmtReportDate } from './report';
import { GroupBars, DoseBars } from './ComparisonBars';
import { color, font, radius } from './theme';

const FAMILIES: Comparison['family'][] = ['Sleep', 'Activity', 'Medications', 'Mood', 'Nutrition'];

function Evidence({ item, onOpenDay }: { item: Comparison; onOpenDay: (date: string) => void }) {
  return <View style={styles.evidence}>
    <Text style={styles.title}>{item.title}</Text>
    <Text style={styles.status}>{item.status}</Text>
    <Text style={styles.body}>{item.summary}</Text>
    {(item.health?.low || item.early || item.dose?.before !== undefined) && (
      <Text style={styles.meta}>Average pain · 0–10</Text>
    )}
    {item.health?.low ? <GroupBars a={item.health} /> : item.early ? <GroupBars a={item.early} /> : null}
    {!!item.dose && <DoseBars a={item.dose} />}
    {item.first?.map(p => <Text key={p.date} style={styles.body}>
      {fmtReportDate(p.date)}: {factorLabel(item.health!.kind, p.factor)} · pain {formatScore(p.pain)}/10
    </Text>)}
    {item.firstDoses?.map(p => <Text key={p.date} style={styles.body}>
      {fmtReportDate(p.date)}: pain {formatScore(p.before)}/10 before · {formatScore(p.after)}/10 after
    </Text>)}
    {!!item.evidence && <Text style={styles.meta}>{item.evidence}</Text>}
    {!!item.from && !!item.to && <Text style={styles.meta}>
      {fmtReportDate(item.from)} – {fmtReportDate(item.to)}
    </Text>}
    <Text style={styles.meta}>{item.timing}</Text>
    <Text style={styles.meta}>{item.caveat}</Text>
    {!!item.from && <View style={styles.actions}>
      <Press style={styles.action} accessibilityRole="button" onPress={() => onOpenDay(item.from!)}>
        <Text style={styles.link}>First paired day ›</Text>
      </Press>
      {item.to !== item.from && !!item.to && <Press style={styles.action} accessibilityRole="button" onPress={() => onOpenDay(item.to!)}>
        <Text style={styles.link}>Latest paired day ›</Text>
      </Press>}
    </View>}
  </View>;
}

/** One headline, then quiet rows. Only a chosen family opens its data;
 *  early pictures and collection counters never fill the landing view. */
export default function PatternComparisons({ rows, onOpenDay, initialComparisonId, onOpenHealth }: {
  rows: Comparison[];
  onOpenDay: (date: string) => void;
  initialComparisonId?: string;
  onOpenHealth?: () => void;
}) {
  const [open, setOpen] = useState<Comparison['family'] | null>(
    () => rows.find(r => r.id === initialComparisonId)?.family || null
  );
  const lead = rows.find(r => r.id === initialComparisonId && r.status === 'Worth watching') || leadingComparison(rows);
  return <>
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Worth your attention</Text>
      {lead ? <>
        <Text style={styles.title}>{lead.title}</Text>
        <Text style={styles.body}>{lead.summary}</Text>
        <Text style={styles.meta}>{lead.evidence}</Text>
        <Text style={styles.meta}>{lead.caveat}</Text>
        <Press style={styles.action} accessibilityRole="button" onPress={() => setOpen(lead.family)}
          accessibilityLabel={'See the evidence for ' + lead.title}>
          <Text style={styles.link}>See why ›</Text>
        </Press>
      </> : <>
        <Text style={styles.title}>{rows.length ? 'No clear pattern in this range yet' : 'Put context beside your pain'}</Text>
        <Text style={styles.body}>{rows.length
          ? 'Open a comparison below to see what is available and what is still missing. You do not need to log more just to fill this page.'
          : 'Sleep, activity and logged medication from Apple Health can sit beside your check-ins. Your pain history is available below.'}</Text>
        {!rows.length && onOpenHealth && <Press style={styles.action} accessibilityRole="button" onPress={onOpenHealth}>
          <Text style={styles.link}>Review Apple Health ›</Text>
        </Press>}
      </>}
    </View>
    {!!rows.length && <View style={styles.card}>
      <Text style={styles.eyebrow}>What we’re comparing</Text>
      {FAMILIES.map(family => {
        const items = rows.filter(r => r.family === family);
        if (!items.length) return null;
        const supported = items.filter(r => r.status === 'Worth watching').length;
        const status = supported ? supported + (supported === 1 ? ' observation worth watching' : ' observations worth watching')
          : items.every(r => r.status === 'Still collecting') ? 'Still collecting' : 'No clear association yet';
        const expanded = open === family;
        return <View key={family} style={styles.family}>
          <Press accessibilityRole="button" accessibilityState={{ expanded }} style={styles.row}
            accessibilityLabel={family + '. ' + status}
            onPress={() => setOpen(expanded ? null : family)}>
            <View style={styles.rowText}>
              <Text style={styles.title}>{family}</Text>
              <Text style={styles.meta}>{status}</Text>
            </View>
            <Text style={styles.link}>{expanded ? '−' : '+'}</Text>
          </Press>
          {expanded && items.map(item => <Evidence key={item.id} item={item} onOpenDay={onOpenDay} />)}
        </View>;
      })}
    </View>}
  </>;
}

const styles = StyleSheet.create({
  card: { marginTop: 14, borderRadius: radius.card, backgroundColor: color.bgSurface, padding: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider },
  eyebrow: { color: color.textSecondary, fontSize: font.footnote, marginBottom: 6 },
  title: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 24 },
  body: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 22, marginTop: 8 },
  meta: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 19, marginTop: 6 },
  status: { color: color.textSecondary, fontSize: font.footnote, marginTop: 4 },
  family: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10 },
  rowText: { flex: 1 },
  evidence: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider, paddingVertical: 14 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  action: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  link: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
});
