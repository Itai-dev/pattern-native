import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert, Linking, Modal, NativeScrollEvent, NativeSyntheticEvent, Pressable,
  ScrollView, Share, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from './src/HomeScreen';
import MapScreen from './src/MapScreen';
import TabBar, { TAB_ORDER, Tab } from './src/TabBar';
import CheckinScreen from './src/CheckinScreen';
import DaySheet from './src/DaySheet';
import EventSheet from './src/EventSheet';
import FocusSheet from './src/FocusSheet';
import TrendsScreen from './src/TrendsScreen';
import AppearanceSheet from './src/AppearanceSheet';
import RemindersSection from './src/RemindersSection';
import * as db from './src/db';
import { cancelAll, configureHandler } from './src/reminders';
import { PainEvent, ValidBackup, todayISO } from './src/model';
import { refreshWidget } from './src/widgetPush';
import { activeFactors } from './src/protocol';
import { getPainTheme, setPainTheme } from './src/painScale';
import {
  DEFAULT_PAIN_THEME, PAIN_THEMES, PainThemeId, color, font, size,
} from './src/theme';

configureHandler(); // set once, before anything can be delivered
/* the chosen hue is part of the app's identity — restore it before the
   first frame ever renders */
setPainTheme(db.getPref<PainThemeId>('theme.pain', DEFAULT_PAIN_THEME));

type Sheet = null | 'checkin' | 'event' | 'focus';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Wednesday 20 August" — the day is the screen's subject, so the day is
 *  the title */
function todayTitle(): string {
  const d = new Date();
  return WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
}

/** an iOS-Settings icon: a white glyph in a coloured rounded square */
function RowIcon({ name, bg }: { name: keyof typeof Ionicons.glyphMap; bg: string }) {
  return (
    <View style={[styles.rowIcon, { backgroundColor: bg }]}>
      <Ionicons name={name} size={17} color="#FFFFFF" />
    </View>
  );
}

/**
 * Two tabs under a floating glass bar, and a profile built like the iOS
 * Settings app. The top bar carries the screen's large title — today's
 * date on Today, the month name on the Map — so both tabs share one
 * hierarchy. Sheets are real iOS page sheets, each with a native control
 * in its own navigation bar — the check-in keeps its ✕ because it is a
 * full-screen flow, everything else says Done or Close.
 */
export default function App() {
  const [entries, setEntries] = useState(() => db.getAll());
  const [events, setEvents] = useState(() => db.getEvents());
  const [protocol, setProtocol] = useState(() => db.activeProtocol());
  /* a factor the chips pointed at, carried into the focus flow so the
     picker opens on it instead of making the user find it again */
  const [seedFactor, setSeedFactor] = useState<string | null>(null);
  /* act on Today, see the month on Pattern, see what it adds up to on
     Trends — and the three sit side by side, so a swipe moves between
     them and the tab bar is a shortcut rather than the only way */
  const [tab, setTab] = useState<Tab>('today');
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);

  /** tapping a tab drives the pager; the pager drives the tab back when
   *  the finger does the moving. Guarded so the two never fight. */
  const swiping = useRef(false);
  const goToTab = useCallback((t: Tab) => {
    setTab(t);
    pager.current?.scrollTo({ x: TAB_ORDER.indexOf(t) * width, animated: true });
  }, [width]);

  const onPageSettled = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    const next = TAB_ORDER[Math.max(0, Math.min(TAB_ORDER.length - 1, i))];
    if (next && next !== tab) setTab(next);
    swiping.current = false;
  }, [tab, width]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const [profile, setProfile] = useState(false);
  const [appearance, setAppearance] = useState(false);
  /* bumping this repaints every pain colour in the app after a theme pick */
  const [, setThemeTick] = useState(0);
  /* an event being edited, and the day sheet to return to afterwards */
  const [editEvent, setEditEvent] = useState<PainEvent | null>(null);
  const [returnDay, setReturnDay] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const next = db.getAll();
    setEntries(next);
    setEvents(db.getEvents());
    setProtocol(db.activeProtocol());
    /* one place to feed the widget, so no screen has to remember to */
    refreshWidget(next);
  }, []);

  const closeSheet = useCallback(() => {
    setSheet(null);
    setEditEvent(null);
    refresh();
    /* editing was reached from a day's detail — go back there */
    if (returnDay) { setDaySheet(returnDay); setReturnDay(null); }
  }, [refresh, returnDay]);
  const closeDay = useCallback(() => { setDaySheet(null); refresh(); }, [refresh]);

  /* the widget's whole surface is one link, and it lands here. Cold start
     and warm resume both go through the same handler, so the tap behaves
     the same whether the app was already running or not. */
  useEffect(() => {
    const open = (url: string | null) => {
      if (url && url.indexOf('checkin') >= 0) setSheet('checkin');
    };
    Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener('url', (ev) => open(ev.url));
    return () => sub.remove();
  }, []);

  /* and once on launch, so a widget added before today's first check-in
     still shows the right caption */
  useEffect(() => { refreshWidget(db.getAll()); }, []);

  /* "Keep observing" at the review: the same two questions carry on, and
     the next review is another fourteen days out. The period is not
     restarted — restarting it would orphan the answers already given from
     the run they belong to. */
  const keepFocus = useCallback(() => {
    const p = db.activeProtocol();
    if (p && p.id != null) db.extendProtocol(p.id, todayISO());
    refresh();
  }, [refresh]);

  const startEditEvent = useCallback((ev: PainEvent) => {
    setReturnDay(daySheet);
    setDaySheet(null);
    setEditEvent(ev);
    setSheet('event');
  }, [daySheet]);

  const pickTheme = useCallback((id: PainThemeId) => {
    setPainTheme(id);
    db.setPref('theme.pain', id);
    setThemeTick((v) => v + 1);
  }, []);

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
                    setPainTheme(DEFAULT_PAIN_THEME);
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
  const themeName = (PAIN_THEMES.find((t) => t.id === getPainTheme()) || PAIN_THEMES[0]).name;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.safe} edges={['top']}>
          {/* one large title per screen, always in the same place — the
              date on Today, the month on the Map */}
          {/* one large title per screen, and the person in the corner iOS
              keeps them in — off the tab bar, out of thumb reach, and out
              of the way of the three things the app is actually for */}
          <View style={styles.topBar}>
            <Text
              style={styles.wordmark}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              allowFontScaling
              maxFontSizeMultiplier={1.2}
            >
              {tab === 'today' ? 'Today' : tab === 'trends' ? 'Trends' : 'History'}
            </Text>
            <Pressable
              onPress={() => setProfile(true)}
              style={styles.profileBtn}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Profile and settings"
            >
              <View style={styles.personHead} />
              <View style={styles.personBody} />
            </Pressable>
          </View>

          {/* three pages side by side. Each keeps its own scroll position,
              which the old key-per-tab remount threw away every time you
              looked at something else. Everything scrolls on under the
              floating glass. */}
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            bounces={false}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            onScrollBeginDrag={() => { swiping.current = true; }}
            onMomentumScrollEnd={onPageSettled}
            onScrollEndDrag={onPageSettled}
          >
            <ScrollView style={{ width }} contentContainerStyle={styles.page}
              showsVerticalScrollIndicator={false}>
              <HomeScreen
                entries={entries}
                protocol={protocol}
                onLog={() => setSheet('checkin')}
                onOpenDay={setDaySheet}
                onFocus={() => { setSeedFactor(null); setSheet('focus'); }}
                onKeepFocus={keepFocus}
                onTestFactor={(id) => { setSeedFactor(id); setSheet('focus'); }}
              />
            </ScrollView>

            <ScrollView style={{ width }} contentContainerStyle={styles.page}
              showsVerticalScrollIndicator={false}>
              <MapScreen entries={entries} onDayPress={setDaySheet} />
            </ScrollView>

            {/* The activity goal and its weekly rating are out of the app
                for now — they asked for a second commitment before the
                first had proved itself. The TABLE and the backup are
                untouched, and any rating already recorded still exports
                and restores; passing nothing here is what keeps it off the
                screen and out of the PDF, and putting the two values back
                is what brings it all back. */}
            <ScrollView style={{ width }} contentContainerStyle={styles.page}
              showsVerticalScrollIndicator={false}>
              <TrendsScreen
                entries={entries}
                events={events}
                func={[]}
                goalText={null}
                todayIso={todayISO()}
              />
            </ScrollView>
          </ScrollView>

          <TabBar tab={tab} onChange={goToTab} />
        </SafeAreaView>

        {/* a full-screen flow keeps its own ✕ */}
        <Modal visible={sheet === 'checkin'} animationType="fade" presentationStyle="fullScreen">
          <CheckinScreen onDone={closeSheet} onClose={closeSheet} />
        </Modal>

        <Modal visible={sheet === 'focus'} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}>
          <FocusSheet seedFactor={seedFactor} onDone={closeSheet} onClose={closeSheet} />
        </Modal>

        <Modal visible={sheet === 'event'} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}>
          <EventSheet event={editEvent} onDone={closeSheet} onClose={closeSheet} />
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
              onAddEvent={() => {
                setReturnDay(daySheet);
                setDaySheet(null);
                setEditEvent(null);
                setSheet('event');
              }}
              onClose={closeDay}
            />
          )}
        </Modal>

        {/* the profile — grouped like the iOS Settings app: inset cards,
            uniform rows, a coloured icon leading each one */}
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
              <View style={styles.group}>
                <Pressable
                  onPress={() => { setProfile(false); setTab('trends'); }}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={'Your record and doctor summary, based on ' + dayCount + ' logged days'}
                  accessibilityHint="Opens the Trends tab"
                >
                  <RowIcon name="document-text" bg="#0A84FF" />
                  <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                    <Text style={styles.rowLabel}>Your record and summary</Text>
                    <Text style={styles.rowValue}>
                      {dayCount} {dayCount === 1 ? 'day' : 'days'}
                    </Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>

              </View>

              <Text style={styles.groupTitle}>Observation</Text>
              <View style={styles.group}>
                <Pressable
                  onPress={() => { setProfile(false); setSeedFactor(null); setSheet('focus'); }}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={protocol ? 'Change your focus' : 'Choose a focus'}
                >
                  <RowIcon name="search" bg="#5E5CE6" />
                  <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                    <Text style={styles.rowLabel}>Your focus</Text>
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {protocol
                        ? activeFactors(protocol).map((m) => m.name).join(' · ')
                        : 'Not set'}
                    </Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>
              </View>

              <Text style={styles.groupTitle}>Reminders</Text>
              <View style={[styles.group, styles.groupPad]}>
                <RemindersSection />
              </View>

              <Text style={styles.groupTitle}>Appearance</Text>
              <View style={styles.group}>
                <Pressable
                  onPress={() => setAppearance(true)}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={'Colour theme, ' + themeName}
                >
                  <RowIcon name="color-palette" bg="#BF5AF2" />
                  <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                    <Text style={styles.rowLabel}>Colour theme</Text>
                    <Text style={styles.rowValue}>{themeName}</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>
              </View>

              <Text style={styles.groupTitle}>Your data</Text>
              <View style={styles.group}>
                <Pressable
                  onPress={exportBackup}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel="Export backup"
                >
                  <RowIcon name="arrow-up" bg="#64D2FF" />
                  <View style={[styles.rowMain, styles.rowLine]}>
                    <Text style={styles.rowLabel}>Export backup</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>

                <Pressable
                  onPress={restoreBackup}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel="Restore backup"
                >
                  <RowIcon name="arrow-down" bg="#FF9F0A" />
                  <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                    <Text style={styles.rowLabel}>Restore backup</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>
              </View>
              {/* a fact, not a row — iOS puts it under the group */}
              <Text style={styles.groupFooter}>
                Stored only on this iPhone. Your health data stays here unless
                you choose to export or restore a backup. Restoring lets you
                replace or merge — you decide before anything changes.
              </Text>

              <View style={styles.group}>
                <Pressable
                  onPress={wipe}
                  style={[styles.row, styles.rowCentre]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete all my data"
                >
                  <Text style={styles.danger}>Delete all my data</Text>
                </Pressable>
              </View>
              <Text style={styles.groupFooter}>
                Removes every check-in, event and weekly rating from this
                iPhone. There is no copy anywhere else.
              </Text>
            </ScrollView>

            {/* the theme picker, pushed on top the way Settings pushes a
                detail page — Done falls back here */}
            <Modal visible={appearance} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAppearance(false)}>
              <AppearanceSheet onPick={pickTheme} onDone={() => setAppearance(false)} />
            </Modal>
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
  /* The title had 4pt above it and nothing below, so the first thing on
     every page started level with the headline and competed with it. A
     large title needs air under it more than over it — that gap is what
     makes it read as a heading rather than as the first row of content. */
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: size.pageX, paddingTop: 6, paddingBottom: 14,
  },
  /* The person is drawn at the tab bar's glyph size and stroke weight —
     21pt across, 1.9pt lines — because it sits in the same family of
     controls and was previously a lighter, smaller drawing that read as a
     different set of marks. */
  profileBtn: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  personHead: {
    width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.9,
    borderColor: color.textSecondary, marginBottom: 1.5,
  },
  personBody: {
    width: 19, height: 9, borderTopLeftRadius: 9.5, borderTopRightRadius: 9.5,
    borderWidth: 1.9, borderBottomWidth: 0, borderColor: color.textSecondary,
  },
  /* the main screen's title — iOS large-title weight and size */
  wordmark: {
    color: color.textPrimary, fontSize: font.largeTitle, fontWeight: '700',
    letterSpacing: -0.5, flex: 1,
  },
  /* room at the bottom so the last content clears the floating bar, and
     a little at the top so a page never begins hard against its heading */
  page: { paddingTop: 4, paddingBottom: 132 },
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
  sheetBody: { padding: 20, paddingTop: 18, paddingBottom: 40 },

  /* ── iOS Settings grammar: inset groups, uniform rows, coloured icons ── */
  group: {
    borderRadius: 12, backgroundColor: color.bgSegmentTrack,
    overflow: 'hidden', marginBottom: 22,
  },
  groupPad: { paddingHorizontal: 16, paddingVertical: 12 },
  groupTitle: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.3,
    marginBottom: 7, marginLeft: 16,
  },
  groupFooter: {
    color: color.textTertiary, fontSize: font.footnote, lineHeight: 18,
    marginTop: -14, marginBottom: 22, marginHorizontal: 16,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 48, paddingLeft: 16,
  },
  rowCentre: { justifyContent: 'center', paddingLeft: 0 },
  rowIcon: {
    width: 29, height: 29, borderRadius: 6.5,
    alignItems: 'center', justifyContent: 'center',
  },
  /* the divider is inset past the icon, exactly as Settings draws it */
  rowMain: {
    flex: 1, paddingRight: 14, minHeight: 48,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  rowLine: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  rowLineLast: { borderBottomWidth: 0 },
  rowLabel: { color: color.textPrimary, fontSize: font.body, flex: 1 },
  rowValue: { color: color.textSecondary, fontSize: font.body, maxWidth: 140 },
  rowChevron: { color: color.textTertiary, fontSize: 20, marginTop: -2 },
  danger: { color: color.danger, fontSize: font.body },
});
