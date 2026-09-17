import React, { useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { Press } from './motion';
import { Comparison, leadingComparison } from './health/comparisons';
import ComparisonDetail from './ComparisonDetail';
import { color, font, radius } from './theme';

const FAMILIES: Comparison['family'][] = ['Sleep', 'Activity', 'Medications', 'Mood', 'Nutrition'];

/** One headline, then quiet rows. Only a chosen family opens its data;
 *  early pictures and collection counters never fill the landing view. */
export default function PatternComparisons({ rows, onOpenDay, initialComparisonId, onOpenHealth, onOpenData, rangeLabel }: {
  rows: Comparison[];
  onOpenDay: (date: string) => void;
  initialComparisonId?: string;
  onOpenHealth?: () => void;
  onOpenData?: () => void;
  rangeLabel?: string;
}) {
  const [open, setOpen] = useState<Comparison['family'] | null>(null);
  const [selectedId, setSelectedId] = useState(initialComparisonId || null);
  const [detailVisible, setDetailVisible] = useState(!!initialComparisonId);
  const selected = rows.find(r => r.id === selectedId);
  const afterDismiss = useRef<(() => void) | null>(null);
  const finishDismiss = () => {
    setSelectedId(null);
    const run = afterDismiss.current; afterDismiss.current = null; run?.();
  };
  const showComparison = (id: string) => { setSelectedId(id); setDetailVisible(true); };
  const closeComparison = () => {
    setDetailVisible(false);
    if (Platform.OS !== 'ios') finishDismiss();
  };
  const openDay = (date: string) => {
    afterDismiss.current = () => onOpenDay(date);
    closeComparison();
  };
  const lead = rows.find(r => r.id === initialComparisonId && r.status === 'Worth watching') || leadingComparison(rows);
  return <>
    <View style={styles.card}>
      <Text style={styles.eyebrow}>{lead ? lead.family + ' · Worth watching' : 'Your observations'}</Text>
      {lead ? <>
        <Text style={styles.title}>{lead.summary}</Text>
        <Text style={styles.meta}>{lead.title}</Text>
        <Text style={styles.meta}>{lead.evidence}</Text>
        <Text style={styles.meta}>{lead.caveat}</Text>
        <Press style={styles.action} accessibilityRole="button" onPress={() => showComparison(lead.id)}
          accessibilityLabel={'See the evidence for ' + lead.title}>
          <Text style={styles.link}>View comparison ›</Text>
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
          {expanded && items.map(item => <Press key={item.id} style={styles.evidence}
            accessibilityRole="button" accessibilityLabel={'View comparison: ' + item.title + '. ' + item.status}
            onPress={() => showComparison(item.id)}>
            <Text style={styles.status}>{item.status}</Text>
            <Text style={styles.title}>{item.status === 'Worth watching' ? item.summary : item.title}</Text>
            {item.status === 'Worth watching' && <Text style={styles.meta}>{item.caveat}</Text>}
            {!!item.evidence && <Text style={styles.meta}>{item.evidence}</Text>}
            <Text style={styles.link}>View comparison ›</Text>
          </Press>)}
        </View>;
      })}
    </View>}
    {!!onOpenData && <Press onPress={onOpenData} style={styles.action}
      accessibilityRole="button" accessibilityLabel="Connected data">
      <Text style={styles.link}>Connected data ›</Text>
    </Press>}
    <Modal visible={detailVisible && !!selected} animationType="slide" presentationStyle="pageSheet"
      onRequestClose={closeComparison} onDismiss={finishDismiss}>
      {selected && <ComparisonDetail key={selected.id} item={selected} rangeLabel={rangeLabel}
        onDone={closeComparison} onOpenDay={openDay} />}
    </Modal>
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
