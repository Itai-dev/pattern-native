import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import HomeScreen from './src/HomeScreen';
import CheckinScreen from './src/CheckinScreen';
import DaySheet from './src/DaySheet';
import WeeklySheet from './src/WeeklySheet';
import EventSheet from './src/EventSheet';
import ReportSheet from './src/ReportSheet';
import RemindersSection from './src/RemindersSection';
import * as db from './src/db';
import { cancelAll, configureHandler } from './src/reminders';
import { todayISO } from './src/model';
import { color, size } from './src/theme';

configureHandler(); // set once, before anything can be delivered

type Sheet = null | 'checkin' | 'weekly' | 'event' | 'report';

/**
 * One screen and a profile. The tab bar is gone — it navigated between the
 * map and a smaller copy of the map, which is cost without content.
 * Everything about the data itself lives behind the person icon.
 */
export default function App() {
  const [entries, setEntries] = useState(() => db.getAll());
  const [weekly, setWeekly] = useState(() => db.getWeekly());
  const [goalText, setGoalText] = useState(() => db.getGoal());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const [profile, setProfile] = useState(false);

  const refresh = useCallback(() => {
    setEntries(db.getAll());
    setWeekly(db.getWeekly());
    setGoalText(db.getGoal());
  }, []);

  const closeSheet = useCallback(() => { setSheet(null); refresh(); }, [refresh]);
  const closeDay = useCallback(() => { setDaySheet(null); refresh(); }, [refresh]);

  const importBackup = useCallback(async () => {
    // the bridge from the web app: Profile → Save backup file → pick it here
    const res = await DocumentPicker.getDocumentAsync({ type: 'application/json' }).catch(() => null);
    if (!res || res.canceled || !res.assets?.length) return;
    try {
      const json = await FileSystem.readAsStringAsync(res.assets[0].uri);
      const n = db.importBackup(json);
      refresh();
      Alert.alert(
        n >= 0 ? 'Restored ' + n + ' days' : 'Couldn’t read that file',
        n >= 0 ? 'Your history is on this phone now.' : 'It doesn’t look like a Pattern backup.'
      );
    } catch {
      Alert.alert('Couldn’t read that file');
    }
  }, [refresh]);

  const wipe = useCallback(() => {
    Alert.alert(
      'Delete all entries from this phone?',
      'This permanently removes your map, events, weeks, goal and reminders. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete all data', style: 'destructive',
          onPress: () => { db.deleteAll(); cancelAll().catch(() => {}); refresh(); setProfile(false); },
        },
      ]
    );
  }, [refresh]);

  const editGoal = useCallback(() => {
    Alert.prompt(
      'One activity you want back',
      'Rated weekly; it becomes the headline of your doctor summary.',
      (text) => { if (text != null) { db.setGoal(text); refresh(); } },
      'plain-text',
      goalText || ''
    );
  }, [goalText, refresh]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.topBar}>
            <Text style={styles.wordmark}>Pattern</Text>
            <Pressable onPress={() => setProfile(true)} hitSlop={8} style={styles.person}>
              <View style={styles.personHead} />
              <View style={styles.personBody} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
            <HomeScreen
              entries={entries} weekly={weekly} goalText={goalText}
              onLog={() => setSheet('checkin')} onOpenDay={setDaySheet}
              onEvent={() => setSheet('event')} onWeekly={() => setSheet('weekly')}
              onChanged={refresh}
            />
          </ScrollView>
        </SafeAreaView>

        <Modal visible={sheet === 'checkin'} animationType="fade" presentationStyle="fullScreen">
          <CheckinScreen onDone={closeSheet} onClose={closeSheet} />
        </Modal>

        <Modal visible={sheet === 'weekly'} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}>
          <WeeklySheet onDone={closeSheet} />
        </Modal>

        <Modal visible={sheet === 'event'} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}>
          <EventSheet onDone={closeSheet} />
        </Modal>

        <Modal visible={sheet === 'report'} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}>
          <ReportSheet onDone={closeSheet} />
        </Modal>

        <Modal visible={!!daySheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeDay}>
          {daySheet && (
            <DaySheet
              dateIso={daySheet}
              entry={db.getDay(daySheet)}
              onChanged={refresh}
              onAddLog={() => { setDaySheet(null); setSheet('checkin'); }}
              onClose={closeDay}
            />
          )}
        </Modal>

        <Modal visible={profile} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setProfile(false)}>
          <View style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetTitle}>Profile</Text>

              <Pressable onPress={() => { setProfile(false); setSheet('report'); }} style={styles.row}>
                <Text style={styles.rowLabel}>Summary for your doctor</Text>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>

              <Pressable onPress={editGoal} style={styles.row}>
                <Text style={styles.rowLabel}>Activity I want back</Text>
                <Text style={styles.rowValue} numberOfLines={1}>{goalText || 'Name one'}</Text>
              </Pressable>

              <View style={styles.row}>
                <Text style={styles.rowLabel}>Days logged</Text>
                <Text style={styles.rowValue}>{Object.keys(entries).length}</Text>
              </View>

              <RemindersSection />

              <Text style={styles.groupTitle}>Data</Text>
              <Pressable onPress={importBackup} style={styles.row}>
                <Text style={styles.rowLabel}>Import backup</Text>
                <Text style={styles.rowValue}>From the web app</Text>
              </Pressable>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Data stays on this phone</Text>
                <Text style={styles.rowValue}>✓</Text>
              </View>

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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgRoot },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: size.pageX, paddingTop: 4,
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
  page: { paddingBottom: 40 },
  sheet: { flex: 1, backgroundColor: color.bgSheet },
  sheetBody: { padding: size.sheetX, paddingTop: 22 },
  sheetTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600', marginBottom: 8 },
  groupTitle: {
    color: color.textTertiary, fontSize: 12, fontWeight: '600',
    letterSpacing: 0.4, textTransform: 'uppercase', marginTop: 28, marginBottom: 2,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: size.rowH, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  rowLabel: { color: color.textPrimary, fontSize: 17 },
  rowValue: { color: color.textSecondary, fontSize: 15, flexShrink: 1 },
  rowChevron: { color: color.textTertiary, fontSize: 20 },
  deleteRow: { marginTop: 34, paddingVertical: 10 },
  danger: { color: color.danger, fontSize: 15 },
  done: { paddingVertical: 16, alignItems: 'center' },
  doneText: { color: color.textSecondary, fontSize: 16 },
});
