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
import CheckinScreen from './src/CheckinScreen';
import DaySheet from './src/DaySheet';
import FunctionSheet from './src/FunctionSheet';
import EventSheet from './src/EventSheet';
import ReportSheet from './src/ReportSheet';
import RemindersSection from './src/RemindersSection';
import * as db from './src/db';
import { cancelAll, configureHandler } from './src/reminders';
import { todayISO } from './src/model';
import { color, size } from './src/theme';

configureHandler(); // set once, before anything can be delivered

type Sheet = null | 'checkin' | 'func' | 'event' | 'report';

/**
 * One screen and a profile. Sheets are real iOS page sheets, each with a
 * native control in its own navigation bar — the check-in keeps its ✕
 * because it is a full-screen flow, everything else says Done or Close.
 */
export default function App() {
  const [entries, setEntries] = useState(() => db.getAll());
  const [func, setFunc] = useState(() => db.getFunc());
  const [goalText, setGoalText] = useState(() => db.getGoal());
  const [sheet, setSheet] = useState<Sheet>(null);
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const [profile, setProfile] = useState(false);

  const refresh = useCallback(() => {
    setEntries(db.getAll());
    setFunc(db.getFunc());
    setGoalText(db.getGoal());
  }, []);

  const closeSheet = useCallback(() => { setSheet(null); refresh(); }, [refresh]);
  const closeDay = useCallback(() => { setDaySheet(null); refresh(); }, [refresh]);

  const editGoal = useCallback(() => {
    Alert.prompt(
      'Activity I want back',
      'One specific thing pain took — you will rate your ability at it each week.',
      (text) => { if (text != null) { db.setGoal(text); refresh(); } },
      'plain-text',
      goalText || ''
    );
  }, [goalText, refresh]);

  /* Restoring merges: a restored day replaces that same day and every other
     day is left alone. Said plainly before anything is touched. */
  const restoreBackup = useCallback(() => {
    Alert.alert(
      'Restore backup',
      'Days in the backup will replace those same days here. Days not in the backup are kept. This cannot be undone — export a backup first if you are unsure.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Choose file',
          onPress: async () => {
            const res = await DocumentPicker
              .getDocumentAsync({ type: 'application/json' })
              .catch(() => null);
            if (!res || res.canceled || !res.assets?.length) return;
            try {
              const json = await FileSystem.readAsStringAsync(res.assets[0].uri);
              const n = db.importBackup(json);
              refresh();
              Alert.alert(
                n >= 0 ? 'Restored ' + n + ' days' : 'Couldn’t read that file',
                n >= 0 ? 'Your history is on this iPhone now.' : 'It doesn’t look like a Pattern backup.'
              );
            } catch {
              Alert.alert('Couldn’t read that file');
            }
          },
        },
      ]
    );
  }, [refresh]);

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
        <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
          <View style={styles.topBar}>
            <Text style={styles.wordmark}>Pattern</Text>
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

          <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
            <HomeScreen
              entries={entries}
              func={func}
              goalText={goalText}
              onLog={() => setSheet('checkin')}
              onOpenDay={setDaySheet}
              onEvent={() => setSheet('event')}
              onFunc={() => setSheet('func')}
              onSetGoal={editGoal}
            />
          </ScrollView>
        </SafeAreaView>

        {/* a full-screen flow keeps its own ✕ */}
        <Modal visible={sheet === 'checkin'} animationType="fade" presentationStyle="fullScreen">
          <CheckinScreen onDone={closeSheet} onClose={closeSheet} />
        </Modal>

        <Modal visible={sheet === 'func'} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}>
          {goalText && <FunctionSheet goalText={goalText} onDone={closeSheet} onClose={closeSheet} />}
        </Modal>

        <Modal visible={sheet === 'event'} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}>
          <EventSheet onDone={closeSheet} onClose={closeSheet} />
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

              <Text style={styles.groupTitle}>YOUR DATA</Text>
              <View style={styles.infoBlock}>
                <Text style={styles.rowLabel}>Stored only on this iPhone</Text>
                <Text style={styles.rowSub}>
                  Your health data stays on this iPhone unless you choose to export
                  or restore a backup.
                </Text>
              </View>

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
                  <Text style={styles.rowSub}>Merges a file into what is already here</Text>
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
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 64 },
  navTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: '#5BA8FF', fontSize: 17, fontWeight: '600' },
  sheetBody: { padding: size.sheetX, paddingTop: 14, paddingBottom: 40 },
  groupTitle: {
    color: color.textSecondary, fontSize: 12, fontWeight: '600',
    letterSpacing: 0.5, marginTop: 30, marginBottom: 6,
  },
  infoBlock: {
    paddingVertical: 12, gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 56, gap: 12, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  rowMain: { flex: 1, gap: 2 },
  rowLabel: { color: color.textPrimary, fontSize: 17 },
  rowSub: { color: color.textSecondary, fontSize: 13, lineHeight: 18 },
  rowChevron: { color: color.textTertiary, fontSize: 20 },
  deleteRow: { marginTop: 34, minHeight: 44, justifyContent: 'center' },
  danger: { color: color.danger, fontSize: 17 },
});
