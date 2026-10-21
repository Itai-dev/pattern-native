/**
 * What reached Pattern from Apple Health, category by category — the
 * facts the Health sheet cannot state, and nothing it cannot know.
 *
 * Drawn in Profile's grammar (SettingsList): black ground, a #1C1C1E
 * card per fact, white actions told apart by weight. Every date and time
 * is a number and takes the rounded face; the sentences that say what
 * an empty row does NOT mean stay inside the card they qualify.
 */
import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Press } from './motion';
import { HealthCategory, HealthDay } from './health/types';
import { HealthSyncStatus, connectedDataRows } from './health/status';
import { fmtReportDate } from './report';
import Icon from './Icon';
import { RowChevron, list, settings } from './SettingsList';
import { Num } from './SummaryCard';
import { font } from './theme';

const time = (iso: string) => new Date(iso).toLocaleString();
export default function ConnectedDataSheet({ days, categories, status, today, refreshing, available,
  onRefresh, onManage, onDone }: {
  days: Record<string, HealthDay>; categories: HealthCategory[]; status: HealthSyncStatus | null;
  today: string; refreshing: boolean; available: boolean;
  onRefresh: () => void; onManage: () => void; onDone: () => void;
}) {
  const rows = connectedDataRows(days, categories, today);
  const enabled = available && categories.length > 0;
  return <View style={settings.sheet}>
    <View style={settings.navBar}>
      <View style={settings.navSpacer} />
      <Text style={settings.navTitle}>Connected data</Text>
      <Press onPress={onDone} style={settings.navBtn} hitSlop={10} accessibilityRole="button" accessibilityLabel="Done with connected data">
        <Text style={settings.navBtnText}>Done</Text>
      </Press>
    </View>
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>What reached Pattern</Text>
      <Text style={styles.lede}>Read from Apple Health and kept on this iPhone. The dates below describe recorded days, not when your watch last synced.</Text>
      <View style={styles.card}>
        <Text style={styles.label}>{!available ? 'Apple Health is unavailable in this install'
          : !categories.length ? 'No categories selected' : refreshing ? 'Refreshing Apple Health…'
            : status?.outcome === 'partial' ? 'Some days could not refresh' : 'Refresh status'}</Text>
        {!available ? <Text style={styles.copy}>Check that you have the latest iPhone build of Pattern.</Text>
          : !categories.length ? <Text style={styles.copy}>Choose what Pattern can request. Connecting is optional.</Text>
          : <>
            <Text style={styles.copy}><Num>{status?.lastSuccess ? 'Last successful refresh: ' + time(status.lastSuccess)
              : 'No completed refresh has been recorded yet.'}</Num></Text>
            {!!status && <Text style={styles.meta}><Num>{'Last attempt: ' + time(status.lastAttempt)}</Num></Text>}
            {status?.outcome === 'partial' && <Text style={styles.copy}>Existing readings were kept for days that could not refresh. You can try again.</Text>}
            <Text style={styles.meta}>A refresh can finish with no readings. Apple Health does not tell Pattern whether read access was declined.</Text>
          </>}
        {enabled && <Press onPress={onRefresh} disabled={refreshing} accessibilityRole="button"
          accessibilityLabel="Refresh connected data" accessibilityState={{ disabled: refreshing, busy: refreshing }}
          style={[styles.action, refreshing && styles.disabled]}>
          <Icon name="arrow.clockwise" size={16} color={list.text} />
          <Text style={styles.link}>{refreshing ? 'Refreshing…' : 'Refresh now'}</Text>
        </Press>}
      </View>
      {rows.map(row => <View key={row.id} style={styles.card}>
        <Text style={styles.label}>{row.name}</Text>
        <Text style={styles.copy}><Num>{row.latest ? 'Latest recorded day: ' + fmtReportDate(row.latest) : 'No readings in the stored data'}</Num></Text>
        <Text style={styles.meta}><Num>{row.latest ? row.readings.join(' · ')
          : 'This can mean no records, a device that has not synced, or data that is not shared. Pattern cannot tell which.'}</Num></Text>
      </View>)}
      {/* a page one level up, so it is a row with a chevron rather than
          a line of text with one typed into it */}
      <Press onPress={onManage} style={[settings.group, styles.manage]} accessibilityRole="button" accessibilityLabel="Manage Apple Health connection">
        <Text style={settings.rowLabel}>Manage Apple Health connection</Text>
        <RowChevron />
      </Press>
      <Text style={styles.foot}>For missing readings, check the records and sharing settings in Apple Health. Nothing here is written back to Health.</Text>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 48 },
  title: { color: list.text, fontSize: font.title2, fontWeight: '700', letterSpacing: -0.33, marginHorizontal: 4 },
  lede: { color: list.secondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 8, marginBottom: 10, marginHorizontal: 4 },
  card: {
    borderRadius: list.radius, borderCurve: 'continuous', backgroundColor: list.surface,
    paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16, marginVertical: 5,
  },
  label: { color: list.text, fontSize: font.subheadline, fontWeight: '600' },
  copy: { color: list.secondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 6 },
  meta: { color: list.tertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 6 },
  action: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: -8 },
  link: { color: list.text, fontSize: font.subheadline, fontWeight: '600' },
  disabled: { opacity: 0.5 },
  manage: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 48, paddingHorizontal: 16, marginTop: 15, marginBottom: 8,
  },
  foot: { color: list.tertiary, fontSize: font.footnote, lineHeight: 18, marginHorizontal: 16 },
});
