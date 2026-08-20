import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import {
  Alert, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import HomeScreen from './src/HomeScreen';
import MapScreen from './src/MapScreen';
import TabBar, { Tab } from './src/TabBar';
import CheckinScreen from './src/CheckinScreen';
import DaySheet from './src/DaySheet';
import FunctionSheet from './src/FunctionSheet';
import EventSheet from './src/EventSheet';
import GoalSheet from './src/GoalSheet';
import ReportSheet from './src/ReportSheet';
import RemindersSection from './src/RemindersSection';
import * as db from './src/db';
import { cancelAll, configureHandler } from './src/reminders';
import { PainEvent, ValidBackup, todayISO } from './src/model';
import { color, font, size } from './src/theme';

configureHandler(); // set once, before anything can be delivered

type Sheet = null | 'checkin' | 'func' | 'funcBaseline' | 'event' | 'report' | 'goal';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/**
 * Two tabs and a profile. The top bar carries the screen's large title —
 * the wordmark on Today, the month name on the Map — so both tabs share
 * one hierarchy. Sheets are real iOS page sheets, each with a native
 * control in its own navigation bar — the check-in keeps its ✕ because
 * it is a full-screen flow, everything else says Done or Close.
 */
export default function App() {
  const [entries, setEntries] = useState(() => db.getAll());
  const [func, setFunc] = useState(() => db.getFunc());
  const [goalText, setGoalText] = useState(() => db.getGoal());
  const [tab, setTab] = useState<Tab>('today'); // act first, reflect one tab away
  const [sheet, setSheet] = useState<Sheet>(null);
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const [profile, setProfile] = useState(false);
  /* an event being edited, and the day sheet to return to afterwards */
  const [editEvent, setEditEvent] = useState<PainEvent | null>(null);
  const [returnDay, setReturnDay] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setEntries(db.getAll());
    setFunc(db.getFunc());
    setGoalText(db.getGoal());
  }, []);

  const closeSheet = useCallback(() => {
    setSheet(null);
    setEditEvent(null);
    refresh();
    /* editing was reached from a day's detail — go back there */
    if (returnDay) { setDaySheet(returnDay); setReturnDay(null); }
  }, [refresh, returnDay]);
  const closeDay = useCallback(() => { setDaySheet(null); refresh(); }, [refresh]);

  const editGoal = useCallback(() => {
    setProfile(false);
    setSheet('goal');
  }, []);

  const startEditEvent = useCallback((ev: PainEvent) => {
    setReturnDay(daySheet);
    setDaySheet(null);
    setEditEvent(ev);
    setSheet('event');
  }, [daySheet]);

  /* Restore: the file is fully validated BEFORE anything is touched, then
     the user chooses what the restore means — replace or merge. */
  const applyRestore = useCallback((backup: ValidBackup, mode: db.RestoreMode) => {
    try {
      const r = db.applyBackup(backup, mode);
      refresh();
      Alert.alert(
        mode === 'replace' ? 'Backup restored' : 'Backup merged',
        r.days + (r.days === 1 ? ' day' : ' days') +
        (r.events ? ', ' + r.events + (r.events === 1 ? ' event' : ' events') : '') +
        (r.func ? ', ' + r.func + ' weekly ' + (r.func === 1 ? 'rating' : 'ratings') : '') +
        (mode === 'replace' ? ' now replace what was here.' : ' were brought in. Nothing was duplicated or deleted.')
      );
    } catch {
      Alert.alert('Restore failed', 'Nothing was changed. Your current data is intact.');
    }
  }, [refresh]);

  const restoreBackup = useCallback(async () => {
    const res = await DocumentPicker
      .getDocumentAsync({ type: 'application/json' })
      .catch(() => null);
    if (!res || res.canceled || !res.assets?.length) return;
    let backup: ValidBackup | null = null;
    try {
      const json = await FileSystem.readAsStringAsync(res.assets[0].uri);
      backup = db.inspectBackup(json);
    } catch {
      backup = null;
    }
    if (!backup) {
      Alert.alert('Couldn’t read that file', 'It doesn’t look like a Pattern backup. Nothing was changed.');
      return;
    }
    const b = backup;
    const summary = Object.keys(b.entries).length + ' days, ' +
      b.events.length + ' events, ' + b.func.length + ' weekly ratings';
    Alert.alert(
      'Restore backup',
      'This file holds ' + summary + '.\n\n' +
      'Replace: everything currently in Pattern is removed and the backup takes its place.\n' +
      'Merge: backup days replace those same days, other days are kept, and nothing is duplicated.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge without duplicates', onPress: () => applyRestore(b, 'merge') },
        {
          text: 'Replace current data',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Replace everything?',
              'Your current check-ins, events and weekly ratings will be removed and replaced by the backup. Export a backup of the current data first if you are unsure.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Replace', style: 'destructive', onPress: () => applyRestore(b, 'replace') },
              ]
            );
          },
        },
      ]
    );
  }, [applyRestore]);

  const exportBackup = useCallback(async () => {
    const json = db.exportBackup(todayISO());
    const path = FileSystem.cacheDirectory + 'pattern-backup-' + todayISO() + '.json';
    try {
      await FileSystem.writeAsStringAsync(path, json);
      await Share.share({ url: path, message: 'Pattern backup ' + todayISO() });
    } catch {
      // sharing the text itself still gets the data out of the app
      Share.share({ message: json }).catch(() => {});
    }
  }, []);

  /* two steps, and the second one says what is lost */
  const wipe = useCallback(() => {
    Alert.alert(
      'Delete all my data?',
      'Every check-in, event, weekly rating, your activity and your reminders will be removed from this iPhone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'This is permanent',
              'There is no copy anywhere else. Deleted data cannot be recovered unless you exported a backup.',
              [
                { text: 'Keep my data', style: 'cancel' },
                {
                  text: 'Delete everything',
                  style: 'destructive',
                  onPress: () => {
                    db.deleteAll();
                    cancelAll().catch(() => {});
                    refresh();
                    setProfile(false);
                  },
                },
              ]
            );
          },
        },
      ]
    );
  }, [refresh]);

  const dayCount = Object.keys(entries).length;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top']}>
          {/* one large title per screen, always in the same place */}
          <View style={styles.topBar}>
            <Text
              style={styles.wordmark}
              numberOfLines={1}
              allowFontScaling
              maxFontSizeMultiplier={1.2}
            >
              {tab === 'today' ? 'Pattern' : MONTHS[new Date().getMonth()]}
            </Text>
            <Pressable
              onPress={() => setProfile(true)}
              hitSlop={8}
              style={styles.person}
              accessibilityRole="button"
              accessibilityLabel="Profile and settings"
            >
              <View style={styles.personHead} />
              <View style={styles.personBody} />
            </Pressable>
          </View>

          {/* keyed per tab so each place starts at its own top */}
          <ScrollView key={tab} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
            {tab === 'today' ? (
              <HomeScreen
                entries={entries}
                func={func}
                goalText={goalText}
                onLog={() => setSheet('checkin')}
                onOpenDay={setDaySheet}
                onEvent={() => setSheet('event')}
                onFunc={(baseline) => setSheet(baseline ? 'funcBaseline' : 'func')}
                onSetGoal={editGoal}
              />
            ) : (
              <MapScreen entries={entries} onDayPress={setDaySheet} />
            )}
          </ScrollView>

          <TabBar tab={tab} onChange={setTab} />
        </SafeAreaView>

        {/* a full-screen flow keeps its own ✕ */}
        <Modal visible={sheet === 'checkin'} animationType="fade" presentationStyle="fullScreen">
          <CheckinScreen onDone={closeSheet} onClose={closeSheet} />
        </Modal>

        <Modal
          visible={sheet === 'func' || sheet === 'funcBaseline'}
          animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}
        >
          {goalText && (
            <FunctionSheet
              goalText={goalText}
              baseline={sheet === 'funcBaseline'}
              onDone={closeSheet}
              onClose={closeSheet}
            />
          )}
        </Modal>

        <Modal visible={sheet === 'goal'} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}>
          <GoalSheet initialText={goalText} onDone={closeSheet} onClose={closeSheet} />
        </Modal>

        <Modal visible={sheet === 'event'} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}>
          <EventSheet event={editEvent} onDone={closeSheet} onClose={closeSheet} />
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
              onEditLog={() => { setDaySheet(null); setSheet('checkin'); }}
              onEditEvent={startEditEvent}
              onClose={closeDay}
            />
          )}
        </Modal>

        <Modal visible={profile} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setProfile(false)}>
          <View style={styles.sheet}>
            <View style={styles.navBar}>
              <View style={styles.navSpacer} />
              <Text style={styles.navTitle}>Profile</Text>
              <Pressable
                onPress={() => setProfile(false)}
                style={styles.navBtn}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={styles.navBtnText}>Done</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
              <Pressable
                onPress={() => { setProfile(false); setSheet('report'); }}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={'Summary for your doctor, based on ' + dayCount + ' logged days'}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowLabel}>Summary for your doctor</Text>
                  <Text style={styles.rowSub}>
                    Based on {dayCount} logged {dayCount === 1 ? 'day' : 'days'}
                  </Text>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>

              <Pressable
                onPress={editGoal}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel={'Activity I want back' + (goalText ? ': ' + goalText : ', not set')}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowLabel}>Activity I want back</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {goalText || 'Not set'}
                  </Text>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>

              <RemindersSection />

              <Text style={styles.groupTitle}>Your data</Text>
              {/* a fact, not a row — nothing here to tap */}
              <Text style={styles.privacyNote}>
                Stored only on this iPhone. Your health data stays here unless
                you choose to export or restore a backup.
              </Text>

              <Pressable
                onPress={exportBackup}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel="Export backup"
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowLabel}>Export backup</Text>
                  <Text style={styles.rowSub}>A JSON file you can keep or move to another device</Text>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>

              <Pressable
                onPress={restoreBackup}
                style={styles.row}
                accessibilityRole="button"
                accessibilityLabel="Restore backup"
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowLabel}>Restore backup</Text>
                  <Text style={styles.rowSub}>Choose a file, then replace or merge — you decide before anything changes</Text>
                </View>
                <Text style={styles.rowChevron}>›</Text>
              </Pressable>

              <Pressable
                onPress={wipe}
                style={styles.deleteRow}
                accessibilityRole="button"
                accessibilityLabel="Delete all my data"
              >
                <Text style={styles.danger}>Delete all my data</Text>
              </Pressable>
            </ScrollView>
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
  /* the main screen's title — iOS large-title weight and size */
  wordmark: { color: color.textPrimary, fontSize: font.largeTitle, fontWeight: '700', letterSpacing: -0.5 },
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
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 64 },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  sheetBody: { padding: size.sheetX, paddingTop: 14, paddingBottom: 40 },
  groupTitle: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    marginTop: 30, marginBottom: 6,
  },
  privacyNote: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 18,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 56, gap: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  rowMain: { flex: 1, gap: 2 },
  rowLabel: { color: color.textPrimary, fontSize: font.body },
  rowSub: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 20 },
  rowChevron: { color: color.textTertiary, fontSize: 20 },
  deleteRow: { marginTop: 34, minHeight: 44, justifyContent: 'center' },
  danger: { color: color.danger, fontSize: font.body },
});
