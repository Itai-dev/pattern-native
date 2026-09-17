import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Press } from './motion';
import { HealthCategory, HealthDay } from './health/types';
import { HealthSyncStatus, connectedDataRows } from './health/status';
import { fmtReportDate } from './report';
import { color, font, radius } from './theme';

const time = (iso: string) => new Date(iso).toLocaleString();
export default function ConnectedDataSheet({ days, categories, status, today, refreshing, available,
  onRefresh, onManage, onDone }: {
  days: Record<string, HealthDay>; categories: HealthCategory[]; status: HealthSyncStatus | null;
  today: string; refreshing: boolean; available: boolean;
  onRefresh: () => void; onManage: () => void; onDone: () => void;
}) {
  const rows = connectedDataRows(days, categories, today);
  const enabled = available && categories.length > 0;
  return <View style={styles.sheet}>
    <View style={styles.nav}>
      <Text style={styles.navTitle}>Connected data</Text>
      <Press onPress={onDone} style={styles.action} accessibilityRole="button" accessibilityLabel="Done with connected data">
        <Text style={styles.link}>Done</Text>
      </Press>
    </View>
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.title}>What reached Pattern</Text>
      <Text style={styles.copy}>Read from Apple Health and kept on this iPhone. The dates below describe recorded days, not when your watch last synced.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{!available ? 'Apple Health is unavailable in this install'
          : !categories.length ? 'No categories selected' : refreshing ? 'Refreshing Apple Health…'
            : status?.outcome === 'partial' ? 'Some days could not refresh' : 'Refresh status'}</Text>
        {!available ? <Text style={styles.copy}>Check that you have the latest iPhone build of Pattern.</Text>
          : !categories.length ? <Text style={styles.copy}>Choose what Pattern can request. Connecting is optional.</Text>
          : <>
            <Text style={styles.copy}>{status?.lastSuccess ? 'Last successful refresh: ' + time(status.lastSuccess)
              : 'No completed refresh has been recorded yet.'}</Text>
            {!!status && <Text style={styles.meta}>Last attempt: {time(status.lastAttempt)}</Text>}
            {status?.outcome === 'partial' && <Text style={styles.copy}>Existing readings were kept for days that could not refresh. You can try again.</Text>}
            <Text style={styles.meta}>A refresh can finish with no readings. Apple Health does not tell Pattern whether read access was declined.</Text>
          </>}
        {enabled && <Press onPress={onRefresh} disabled={refreshing} accessibilityRole="button"
          accessibilityLabel="Refresh connected data" accessibilityState={{ disabled: refreshing, busy: refreshing }}
          style={[styles.action, refreshing && styles.disabled]}>
          <Text style={styles.link}>{refreshing ? 'Refreshing…' : 'Refresh now'}</Text>
        </Press>}
      </View>
      {rows.map(row => <View key={row.id} style={styles.card}>
        <Text style={styles.label}>{row.name}</Text>
        <Text style={styles.copy}>{row.latest ? 'Latest recorded day: ' + fmtReportDate(row.latest) : 'No readings in the stored data'}</Text>
        <Text style={styles.meta}>{row.latest ? row.readings.join(' · ')
          : 'This can mean no records, a device that has not synced, or data that is not shared. Pattern cannot tell which.'}</Text>
      </View>)}
      <Press onPress={onManage} style={styles.action} accessibilityRole="button" accessibilityLabel="Manage Apple Health connection">
        <Text style={styles.link}>Manage Apple Health connection ›</Text>
      </Press>
      <Text style={styles.meta}>For missing readings, check the records and sharing settings in Apple Health. Nothing here is written back to Health.</Text>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.bgSheet },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20,
    paddingTop: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', flex: 1 },
  body: { padding: 20, paddingBottom: 40 },
  title: { color: color.textPrimary, fontSize: font.title2, fontWeight: '700' },
  card: { borderRadius: radius.card, backgroundColor: color.bgSurface, padding: 16, marginVertical: 10 },
  label: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  copy: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 23, marginTop: 8 },
  meta: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 20, marginTop: 8 },
  action: { minHeight: 44, justifyContent: 'center', paddingVertical: 12 },
  link: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  disabled: { opacity: 0.5 },
});
