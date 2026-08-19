import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapScreen from './src/MapScreen';
import TodayScreen from './src/TodayScreen';
import CheckinScreen from './src/CheckinScreen';
import DaySheet from './src/DaySheet';
import RemindersSection from './src/RemindersSection';
import * as db from './src/db';
import { configureHandler } from './src/reminders';
import { todayISO } from './src/model';
import { color, size } from './src/theme';

configureHandler(); // set once, before anything can be delivered

type Tab = 'today' | 'map';

/**
 * The shell: two pages and a profile, mirroring the web app. Today acts,
 * the Pattern reflects, and the person icon holds everything about the data
 * itself. Sheets are real iOS page sheets — the platform's own grabber and
 * swipe-to-dismiss, which is what the web version spends code imitating.
 */
export default function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [entries, setEntries] = useState(() => db.getAll());
  const [checkin, setCheckin] = useState<null | { step?: 'capacity' }>(null);
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const [profile, setProfile] = useState(false);

  const refresh = useCallback(() => setEntries(db.getAll()), []);

  const openLog = useCallback(() => setCheckin({}), []);
  const closeCheckin = useCallback(() => { setCheckin(null); refresh(); }, [refresh]);
  const closeDay = useCallback(() => { setDaySheet(null); refresh(); }, [refresh]);

  /* deletion is real and confirmed with the platform's own dialog — no demo
     seeds and no dev shortcuts live on a device that holds real history */
  const wipe = useCallback(() => {
    Alert.alert(
      'Delete all entries from this phone?',
      'This permanently removes your map. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all data', style: 'destructive',
          onPress: () => { db.deleteAll(); refresh(); setProfile(false); },
        },
      ]
    );
  }, [refresh]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Text style={styles.wordmark}>Pattern</Text>
          <Pressable onPress={() => setProfile(true)} hitSlop={8} style={styles.person}>
            <View style={styles.personHead} />
            <View style={styles.personBody} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
          {tab === 'today'
            ? <TodayScreen entries={entries} onLog={openLog} onOpenDay={setDaySheet} />
            : <MapScreen entries={entries} onDayPress={setDaySheet} />}
        </ScrollView>

        <View style={styles.tabBar}>
          {(['today', 'map'] as Tab[]).map((k) => (
            <Pressable key={k} onPress={() => setTab(k)} style={styles.tab}>
              <View style={[styles.tabIcon, k === 'today' ? styles.tabIconToday : styles.tabIconMap,
                { borderColor: tab === k ? color.textPrimary : color.textTertiary,
                  backgroundColor: k === 'map' && tab === k ? color.textPrimary : 'transparent' }]} />
              <Text style={[styles.tabLabel, { color: tab === k ? color.textPrimary : color.textTertiary }]}>
                {k === 'today' ? 'Today' : 'Pattern'}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>

      <Modal visible={!!checkin} animationType="fade" presentationStyle="fullScreen">
        <CheckinScreen onDone={closeCheckin} onClose={closeCheckin} />
      </Modal>

      <Modal visible={!!daySheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeDay}>
        {daySheet && (
          <DaySheet
            dateIso={daySheet}
            entry={db.getDay(daySheet)}
            onChanged={refresh}
            onAddLog={() => { setDaySheet(null); setCheckin({}); }}
            onAddCapacity={() => { setDaySheet(null); setCheckin({ step: 'capacity' }); }}
            onClose={closeDay}
          />
        )}
      </Modal>

      <Modal visible={profile} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setProfile(false)}>
        <View style={styles.sheet}>
          <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
            <Text style={styles.sheetTitle}>Profile</Text>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Data stays on this phone</Text>
              <Text style={styles.rowValue}>✓</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.rowLabel}>Days logged</Text>
              <Text style={styles.rowValue}>{Object.keys(entries).length}</Text>
            </View>
            <RemindersSection />
            <Pressable onPress={wipe} style={styles.deleteRow}>
              <Text style={styles.danger}>Delete all my data</Text>
            </Pressable>
          </ScrollView>
          <Pressable onPress={() => setProfile(false)} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </Modal>

      <StatusBar style="light" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgRoot },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: size.pageX, paddingTop: 8, paddingBottom: 4,
  },
  wordmark: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  person: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  personHead: {
    width: 8, height: 8, borderRadius: 4, borderWidth: 1.4,
    borderColor: color.textSecondary, marginBottom: 1,
  },
  personBody: {
    width: 16, height: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8,
    borderWidth: 1.4, borderBottomWidth: 0, borderColor: color.textSecondary,
  },
  page: { paddingBottom: 24 },
  tabBar: {
    flexDirection: 'row', justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
    paddingTop: 7,
  },
  tab: { width: 112, alignItems: 'center', gap: 3, paddingVertical: 3 },
  tabIcon: { width: 19, height: 19, borderWidth: 1.6 },
  tabIconToday: { borderRadius: 5 },
  tabIconMap: { borderRadius: 4 },
  tabLabel: { fontSize: 11, fontWeight: '500' },
  sheet: { flex: 1, backgroundColor: color.bgSheet },
  sheetBody: { padding: size.sheetX, paddingTop: 22 },
  sheetTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: size.rowH,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  rowLabel: { color: color.textPrimary, fontSize: 17 },
  rowValue: { color: color.textSecondary, fontSize: 15 },
  deleteRow: { marginTop: 34, paddingVertical: 10 },
  danger: { color: color.danger, fontSize: 15 },
  done: { paddingVertical: 16, alignItems: 'center' },
  doneText: { color: color.textSecondary, fontSize: 16 },
});
