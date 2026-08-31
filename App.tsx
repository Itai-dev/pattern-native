import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, AppState, Linking, Modal, NativeScrollEvent, NativeSyntheticEvent,
  Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from './src/HomeScreen';
import TabBar, { TAB_ORDER, Tab } from './src/TabBar';
import CheckinScreen from './src/CheckinScreen';
import DayScreen, { fmtDay } from './src/DayScreen';
import HealthSheet from './src/HealthSheet';
import { HealthKitService, deviceClock } from './src/health/healthkit';
import {
  healthCategories, healthRequestedOn, storedHealthDays, syncHealth,
} from './src/health/sync';
import { noticedAssociations, strongestPossible } from './src/health/noticed';
import { PairKind } from './src/health/windows';
import EventSheet from './src/EventSheet';
import FocusSheet from './src/FocusSheet';
import TrendsScreen from './src/TrendsScreen';
import AppearanceSheet from './src/AppearanceSheet';
import BackgroundSheet from './src/BackgroundSheet';
import OnboardingScreen from './src/OnboardingScreen';
import RemindersSection from './src/RemindersSection';
import * as db from './src/db';
import { cancelAll, configureHandler } from './src/reminders';
import { drainWatchCheckins } from './src/watch';
import { PainEvent, ValidBackup, iso, todayISO } from './src/model';
import { buildReportData, reportHtml } from './src/report';
import { refreshWidget } from './src/widgetPush';
import {
  analyticsEnabled, setAnalyticsEnabled, track, trackLaunch,
} from './src/analytics';
import { activeFactors } from './src/protocol';
import { HYPOTHESIS_OFFER_AFTER_DAYS } from './src/thresholds';
import { getPainTheme, setPainTheme, themeBrand } from './src/painScale';
import {
  DEFAULT_PAIN_THEME, PAIN_THEMES, PainThemeId, color, font, size,
} from './src/theme';

configureHandler(); // set once, before anything can be delivered
/* the chosen hue is part of the app's identity — restore it before the
   first frame ever renders */
setPainTheme(db.getPref<PainThemeId>('theme.pain', DEFAULT_PAIN_THEME));

type Sheet = null | 'checkin' | 'event' | 'focus';

/* "Thu, 21 Aug" comes from DayScreen, which is the other place a date is
   a heading. Two copies of the same format is how two screens end up
   naming the same day differently. */

/* Where feedback goes — and the address the privacy policy still needs.
   A placeholder that bounces is worse than no row at all, so this ships
   pointing at the account already tied to the developer profile; swap it
   the moment a dedicated address exists. */
const FEEDBACK_EMAIL = 'itaiagami@gmail.com';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "Wednesday 20 August" — the day is the screen's subject, so the day is
 *  the title */
function todayTitle(): string {
  const d = new Date();
  return WEEKDAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()];
}

/** The floating return pill — the tab bar's glass, one word of it.
 *  Top right, under the headline, where the eye goes for "take me back";
 *  the availability check is guarded for the same reason the tab bar's
 *  is: it throws on binaries that predate the native module. */
const PILL_LIQUID = (() => {
  try { return isLiquidGlassAvailable(); } catch { return false; }
})();

function GlassPill({ onPress, label, accessibilityLabel }: {
  onPress: () => void; label: string; accessibilityLabel: string;
}) {
  const inner = (
    <Pressable onPress={onPress} style={styles.pillHit}
      accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      <Text style={styles.backToTodayText}>{label}</Text>
    </Pressable>
  );
  return PILL_LIQUID ? (
    <GlassView glassEffectStyle="regular" colorScheme="dark" style={styles.backToToday}>
      {inner}
    </GlassView>
  ) : (
    <BlurView intensity={80} tint="systemChromeMaterialDark" style={styles.backToToday}>
      {inner}
    </BlurView>
  );
}

/** a settings row's glyph: the outline form, in line weight, the way
 *  this app draws everything else. The coloured chips were the one place
 *  the interface used colour as decoration rather than meaning. */
function RowIcon({ name }: { name: keyof typeof Ionicons.glyphMap }) {
  return (
    <View style={styles.rowIcon}>
      <Ionicons name={name} size={21} color={color.textSecondary} />
    </View>
  );
}

/**
 * TWO tabs under a floating glass bar, and a profile built like the iOS
 * Settings app. Today is where you act; Record is everything that has
 * been recorded — led by the record itself, which is one card wearing
 * two views: the trend, or the months as a calendar whose squares open
 * their days.
 * They used to be three: History and Trends each held half of the same
 * answer, and the user had to decide which half they wanted before they
 * could look at either.
 *
 * The top bar carries the screen's large title, and one day surface sits
 * over whichever tab opened it. Sheets are real iOS page sheets, each
 * with a native control in its own navigation bar — the check-in keeps
 * its ✕ because it is a full-screen flow, everything else says Done.
 */
export default function App() {
  const [entries, setEntries] = useState(() => db.getAll());
  /* Anyone with a record has already been onboarded, whatever the pref
     says — the flag arrived after the app did, and showing a returning
     user an introduction to something they have been using for a week is
     worse than never having had one. */
  const [onboarded, setOnboarded] = useState(
    () => db.getPref<boolean>('onboarded', db.countDays() > 0)
  );
  const [events, setEvents] = useState(() => db.getEvents());
  const [protocol, setProtocol] = useState(() => db.activeProtocol());
  /* a factor the chips pointed at, carried into the focus flow so the
     picker opens on it instead of making the user find it again */
  const [seedFactor, setSeedFactor] = useState<string | null>(null);
  /* act on Today, read the record on Record — the two sit side by side,
     so a swipe moves between them and the tab bar is a shortcut rather
     than the only way */
  const [tab, setTab] = useState<Tab>('today');
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);

  /* One day, open on this date — THE day surface, and the only one.
     A layer inside the tab rather than a sheet, so the tab bar stays
     live, and null the rest of the time, which is what keeps its pager
     unmounted and its sideways gesture off every other screen. */
  const [dayScreen, setDayScreen] = useState<string | null>(null);
  /* every route into a day goes through here: Today's card, and any
     square on the calendar */
  const openDay = useCallback((d: string) => {
    track('day_opened');
    setDayScreen(d);
  }, []);

  /** tapping a tab drives the pager, and always leaves the day screen —
   *  including when it is the tab you are already on, which is how
   *  "Today" gets you back to Today from a day you had walked into. A
   *  tab change is the one navigation in this app that is instant, and
   *  animating out of a layer nobody is looking at any more would only
   *  delay it. */
  const goToTab = useCallback((t: Tab) => {
    if (t !== tab && t === 'trends') track('trends_opened');
    setDayScreen(null);
    setTab(t);
    pager.current?.scrollTo({ x: TAB_ORDER.indexOf(t) * width, animated: true });
  }, [tab, width]);

  const onPageSettled = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!width) return;
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    const next = TAB_ORDER[Math.max(0, Math.min(TAB_ORDER.length - 1, i))];
    if (next && next !== tab) {
      if (next === 'trends') track('trends_opened');
      setTab(next);
    }
  }, [tab, width]);

  const [sheet, setSheet] = useState<Sheet>(null);
  /* The record is a long page now — the charts, then the calendar of
     every day stacked newest-first — so the way back to the top is a
     pill rather than a lot of scrolling. It appears only once you have
     actually gone somewhere. */
  const recordScroll = useRef<ScrollView>(null);
  const [recordAway, setRecordAway] = useState(false);
  const [profile, setProfile] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const [background, setBackgroundOpen] = useState(false);
  const [about, setAbout] = useState(false);
  /* TEMPORARY — see the "Preview onboarding" row this drives */
  const [previewOnboarding, setPreviewOnboarding] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(() => analyticsEnabled());
  /* bumping this repaints every pain colour in the app after a theme pick */
  const [, setThemeTick] = useState(0);

  /* ── Apple Health ─────────────────────────────────────────
     One service for the whole app. On binaries without the native
     module it reports unavailable and every path below is a no-op —
     the same guard discipline as the glass. */
  const health = useMemo(() => new HealthKitService(), []);
  const [healthSheet, setHealthSheet] = useState(false);
  const [healthDays, setHealthDays] = useState(() => storedHealthDays());

  /* Foreground sync: on launch and on every return from background,
     because Health data arrives late — a watch syncs when it syncs.
     Deliberately NOT background delivery; the decision and its reasons
     live in health/sync.ts. */
  const resyncHealth = useCallback(() => {
    syncHealth(health, deviceClock)
      .then(() => setHealthDays(storedHealthDays()))
      .catch(() => {});
  }, [health]);
  useEffect(() => {
    resyncHealth();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') resyncHealth();
    });
    return () => sub.remove();
  }, [resyncHealth]);

  /* What Pattern noticed — licensed by the Health categories the user
     connected (consent lives in the Health setup, not in a second
     switch), remembered so a shown finding that stops holding fades
     out loud instead of vanishing. */
  const healthNoticed = useMemo(() => {
    const shown = db.getPref<PairKind[]>('health.shownKinds', []);
    const all = noticedAssociations(
      entries, healthDays, healthCategories(), shown);
    const best = strongestPossible(all);
    if (best && shown.indexOf(best.kind) < 0) {
      db.setPref('health.shownKinds', shown.concat(best.kind));
    }
    const fading = all.filter((a) => a.verdict === 'fading');
    /* every association whose groups actually formed — Trends draws the
       comparison itself, claim or no claim; the claim stays gated */
    const groups = all.filter((a) =>
      (a.verdict === 'possible' || a.verdict === 'observation') && a.low && a.high);
    return { best, fading, groups };
  }, [entries, healthDays, protocol]);
  /* an event being edited. Nothing has to be closed to reach it any more:
     the day is a LAYER, not a modal, so the event sheet presents on top
     of it and the day is still there underneath when it dismisses. The
     whole reopen-after-dismiss dance the day sheet needed went with it. */
  const [editEvent, setEditEvent] = useState<PainEvent | null>(null);

  const refresh = useCallback(() => {
    const next = db.getAll();
    setEntries(next);
    setEvents(db.getEvents());
    setProtocol(db.activeProtocol());
    /* one place to feed the widget, so no screen has to remember to */
    refreshWidget(next);
  }, []);

  /* Check-ins made on the watch, waiting in the bridge's mailbox — the
     same launch-and-foreground rhythm Health follows, because both are
     data that arrived while nobody was looking at this screen. On
     binaries without the watch build this is a no-op. */
  useEffect(() => {
    const pull = () => { if (drainWatchCheckins() > 0) refresh(); };
    pull();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') pull();
    });
    return () => sub.remove();
  }, [refresh]);

  const closeSheet = useCallback(() => {
    setSheet(null);
    setEditEvent(null);
    refresh();
  }, [refresh]);

  /* ── one modal at a time, SEQUENCED ───────────────────────
     Everywhere the app closes one sheet and opens another — day detail
     to event, day detail to check-in, profile to focus — the second
     presentation must wait for the first dismissal to complete. The
     next action is parked here and fired from the closing modal's
     onDismiss (iOS-only callback, and this is an iOS-only app). */
  const afterDismiss = useRef<null | (() => void)>(null);
  const runAfterDismiss = useCallback(() => {
    const f = afterDismiss.current;
    afterDismiss.current = null;
    if (f) f();
  }, []);

  /* the widget's whole surface is one link, and it lands here. Cold start
     and warm resume both go through the same handler, so the tap behaves
     the same whether the app was already running or not. */
  useEffect(() => {
    const open = (url: string | null) => {
      if (url && url.indexOf('checkin') >= 0) { track('widget_tap'); setSheet('checkin'); }
    };
    Linking.getInitialURL().then(open).catch(() => {});
    const sub = Linking.addEventListener('url', (ev) => open(ev.url));
    return () => sub.remove();
  }, []);

  /* and once on launch, so a widget added before today's first check-in
     still shows the right caption */
  useEffect(() => { refreshWidget(db.getAll()); trackLaunch(todayISO()); }, []);

  /* "Keep observing" at the review: the same two questions carry on, and
     the next review is another fourteen days out. The period is not
     restarted — restarting it would orphan the answers already given from
     the run they belong to. */
  const keepFocus = useCallback(() => {
    track('focus_extended');
    const p = db.activeProtocol();
    if (p && p.id != null) db.extendProtocol(p.id, todayISO());
    refresh();
  }, [refresh]);

  const startEditEvent = useCallback((ev: PainEvent) => {
    setEditEvent(ev);
    setSheet('event');
  }, []);

  /* A plain mail draft. The app never learns whether it was sent and
     wants no inbox of its own to moderate; the version and update id go
     in the signature so "which build are you on" is never a question
     anyone has to ask a tester. */
  const openFeedback = useCallback(() => {
    const sig = '\n\n---\nPattern v' + (Constants.expoConfig?.version || '?')
      + (Updates.updateId ? ' | update ' + Updates.updateId.slice(0, 8) : ' | embedded');
    Linking.openURL(
      'mailto:' + FEEDBACK_EMAIL
      + '?subject=' + encodeURIComponent('Pattern feedback')
      + '&body=' + encodeURIComponent(sig)
    ).catch(() => {});
  }, []);

  /* how many days Trends is currently charting. Null until it has said
     — and the fallback is the WHOLE record rather than a month, because a
     summary that silently cropped a clinician's view would be the worst
     possible thing for this button to do. */
  const [trendsSpan, setTrendsSpan] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);

  const makePdf = useCallback(async (includeNotes: boolean) => {
    setSharing(true);
    try {
      const data = buildReportData({
        entries, events, func: [], goalText: null,
        todayIso: todayISO(), windowDays: trendsSpan || 36500,
        includeNotes,
        /* written FOR the report, so it rides every share — the sheet that
           collects it says so in its first sentence */
        background: db.getBackground(),
        /* the same health context Trends shows — one gate, two surfaces,
           so the preview and the PDF can never disagree about what the
           record supports */
        healthDays: storedHealthDays(),
        healthAssociation: healthNoticed.best,
      });
      if (!data) {
        Alert.alert('Nothing to share yet', 'Check in once and there will be a record to send.');
        return;
      }
      const { uri } = await Print.printToFileAsync({ html: reportHtml(data) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'Pattern — summary for your doctor',
        });
        /* declared in the analytics union since it was written and never
           once fired — the count of "someone took their record to an
           appointment" is the single most useful number this app has.
           Whether notes rode along is a fact about the share, not about
           what any note said. */
        track('pdf_shared', { notes: includeNotes });
      } else {
        Alert.alert('Sharing isn’t available on this device.');
      }
    } catch {
      Alert.alert('Couldn’t create the PDF', 'Please try again.');
    } finally {
      setSharing(false);
    }
  }, [entries, events, trendsSpan, healthNoticed]);

  const shareTrends = useCallback(() => {
    if (sharing) return;
    /* Day notes ride along only on an explicit yes, asked at every share
       rather than remembered from the last one. They are written with no
       audience in mind, and which audience gets them is a decision about
       THIS copy — a doctor's PDF and one for a work absence claim are not
       the same share. No notes in the window, no question. */
    const start = new Date();
    start.setDate(start.getDate() - ((trendsSpan || 36500) - 1));
    const startIso = iso(start);
    const hasNotes = Object.keys(entries)
      .some((k) => k >= startIso && !!(entries[k].note || '').trim());
    if (!hasNotes) { makePdf(false); return; }
    Alert.alert(
      'Include your day notes?',
      'Notes you wrote on your days can go into the PDF, word for word, ' +
      'in their own section. The numbers and charts are included either way.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Without notes', onPress: () => makePdf(false) },
        { text: 'Include notes', onPress: () => makePdf(true) },
      ]
    );
  }, [entries, trendsSpan, sharing, makePdf]);

  const pickTheme = useCallback((id: PainThemeId) => {
    setPainTheme(id);
    db.setPref('theme.pain', id);
    setThemeTick((v) => v + 1);
    /* the widget's colours are computed HERE, by painScale, and pushed as
       hex — a theme change has to push a fresh snapshot or the home
       screen keeps wearing the old palette until the next check-in */
    refreshWidget(db.getAll());
  }, []);

  /* Restore: the file is fully validated BEFORE anything is touched, then
     the user chooses what the restore means — replace or merge. */
  const applyRestore = useCallback((backup: ValidBackup, mode: db.RestoreMode) => {
    try {
      const r = db.applyBackup(backup, mode);
      track('backup_restored', { mode });
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
    track('backup_exported');
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

  /* The focus question is worth asking only once there is a record to
     form a hypothesis about — Today's card has always waited a week for
     that reason, and this row was letting a day-one user walk in the side
     door and commit to a fortnight of questions about nothing. */
  const focusReady = Object.keys(entries).length >= HYPOTHESIS_OFFER_AFTER_DAYS;
  const themeName = (PAIN_THEMES.find((t) => t.id === getPainTheme()) || PAIN_THEMES[0]).name;

  if (!onboarded) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <OnboardingScreen
            onDone={(r) => {
              /* counts only, never content — the closed-list rule */
              track('onboarding_completed', {
                wroteHypothesis: !!r.understand,
                suspicions: r.suspicions.length,
                where: r.where.length,
              });
              db.setPref('onboarded', true);
              setOnboarded(true);
              /* their words, verbatim, from the moment they had the
                 clearest reason to open this. The focus flow finds it a
                 week later and builds its offer on it. */
              if (r.understand) {
                db.addHypothesis({
                  createdOn: todayISO(), understand: r.understand, harder: '', helps: '',
                });
              }
              /* the suspicions, in tap order — what makes the week-later
                 focus offer specific instead of cold. Stored as metric
                 ids, the focus flow's own vocabulary. */
              if (r.suspicions.length) db.setPref('suspicions.v1', r.suspicions);
              /* usual places, for the first check-in's offer — a record
                 with no history yet has no last time to be the same as */
              if (r.where.length) db.setPref('onboard.loc.v1', r.where);
              /* duration and diagnosis seed the report background, and
                 only into empty fields — words already written win. A
                 bare "yes" to diagnosis writes nothing: a name belongs
                 there, and the Background sheet asks for it properly. */
              if (r.duration || r.diagnosis || r.diagnosisText) {
                const bg = db.getBackground() || { v: 1 as const };
                if (!bg.onset && r.duration) {
                  bg.onset = r.duration === 'weeks' ? 'Started a few weeks ago'
                    : r.duration === 'months' ? 'Going on for months'
                      : 'Going on for a year or more';
                }
                if (!bg.diagnoses && r.diagnosisText) bg.diagnoses = r.diagnosisText;
                if (!bg.diagnoses && r.diagnosis === 'no') bg.diagnoses = 'No formal diagnosis';
                if (!bg.diagnoses && r.diagnosis === 'looking') bg.diagnoses = 'Still being investigated';
                db.setBackground(bg);
              }
              /* the Health offer taken at onboarding opens the real setup
                 first, and the first check-in follows when it closes —
                 sequenced through onDismiss like every other sheet swap */
              if (r.connectHealth) {
                track('health_setup_opened');
                afterDismiss.current = () => setSheet('checkin');
                setHealthSheet(true);
              } else {
                setSheet('checkin');
              }
            }}
          />
          <StatusBar style="light" />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

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
              minimumFontScale={0.8}
              allowFontScaling
              maxFontSizeMultiplier={1.2}
            >
              {/* the date, not the word "Today": the screen below it is
                  now fixed on today, and a heading that names the day is
                  the one thing on it that a person reads back weeks later
                  in a screenshot and can still place */}
              {tab === 'today' ? fmtDay(todayISO()) : 'Patterns'}
            </Text>
            <View style={styles.topActions}>
              {tab === 'today' && (
                <Pressable
                  onPress={() => setSheet('checkin')}
                  style={({ pressed }) => [
                    styles.logPill, pressed && { opacity: 0.85 },
                  ]}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Check in"
                  accessibilityHint="Records how your pain is right now"
                >
                  <Text
                    style={styles.logPillText}
                    allowFontScaling maxFontSizeMultiplier={1.2}
                    numberOfLines={1}
                  >
                    Log
                  </Text>
                </Pressable>
              )}
              {tab === 'trends' && (
                <Pressable
                  onPress={shareTrends}
                  disabled={sharing}
                  style={[styles.profileBtn, sharing && styles.profileBtnBusy]}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: sharing }}
                  accessibilityLabel={sharing
                    ? 'Preparing the PDF'
                    : 'Share this record as a PDF'}
                  accessibilityHint="Creates the PDF and opens the share sheet"
                >
                  <Ionicons
                    name={sharing ? 'ellipsis-horizontal' : 'share-outline'}
                    size={21}
                    color={sharing ? color.textTertiary : color.textSecondary}
                  />
                </Pressable>
              )}
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
          </View>

          {/* three pages side by side. Each keeps its own scroll position,
              which the old key-per-tab remount threw away every time you
              looked at something else. Everything scrolls on under the
              floating glass. */}
          {/* Sideways moves between tabs everywhere — including Today,
              where the day card keeps the gesture that starts ON it.

              iOS gives an inner scroll view the gesture that begins
              inside its bounds and does not hand it back at the ends, so
              the two never chain, but they also never fight: the card is
              a bounded object with a visible edge, and everything outside
              it is page. On the card, days. Off it, tabs. */}
          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            bounces={false}
            scrollEventThrottle={16}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onPageSettled}
          >
            <ScrollView style={{ width }} contentContainerStyle={styles.page}
              showsVerticalScrollIndicator={false}>
              <HomeScreen
                entries={entries}
                protocol={protocol}
                onLog={() => setSheet('checkin')}
                onOpenDay={openDay}
                onOpenToday={() => openDay(todayISO())}
                onFocus={() => { setSeedFactor(null); setSheet('focus'); }}
                onKeepFocus={keepFocus}
                onTestFactor={(id) => { setSeedFactor(id); setSheet('focus'); }}
                onAddEvent={() => { setEditEvent(null); setSheet('event'); }}
                onOpenBackground={() => { setProfile(true); setBackgroundOpen(true); }}
              />
            </ScrollView>

            {/* The activity goal and its weekly rating are out of the app
                for now — they asked for a second commitment before the
                first had proved itself. The TABLE and the backup are
                untouched, and any rating already recorded still exports
                and restores; passing nothing here is what keeps it off the
                screen and out of the PDF, and putting the two values back
                is what brings it all back. */}
            <ScrollView
              ref={recordScroll}
              style={{ width }} contentContainerStyle={styles.page}
              showsVerticalScrollIndicator={false}
              scrollEventThrottle={64}
              onScroll={(e) => setRecordAway(e.nativeEvent.contentOffset.y > 600)}
            >
              <TrendsScreen
                entries={entries}
                events={events}
                func={[]}
                goalText={null}
                todayIso={todayISO()}
                onOpenDay={openDay}
                onSpanChange={setTrendsSpan}
                healthNoticed={healthNoticed}
                onShare={shareTrends}
                sharing={sharing}
                protocol={protocol}
              />
            </ScrollView>
          </ScrollView>

          {/* Pain through the day — over the pages, under the tab bar.
              Absolutely filling the safe area, so it covers the large
              title too and brings its own; the tab bar is a sibling
              rendered after it and stays reachable. */}
          {dayScreen && (
            <DayScreen
              entries={entries}
              dateIso={dayScreen}
              onChanged={refresh}
              onAddLog={() => setSheet('checkin')}
              onEditLog={() => setSheet('checkin')}
              onEditEvent={startEditEvent}
              onAddEvent={() => { setEditEvent(null); setSheet('event'); }}
              onClose={() => setDayScreen(null)}
            />
          )}

          {tab === 'trends' && recordAway && (
            <GlassPill
              onPress={() => recordScroll.current?.scrollTo({ y: 0, animated: true })}
              label="Top ↑"
              accessibilityLabel="Back to the top of the record"
            />
          )}

          <TabBar tab={tab} onChange={goToTab} />
        </SafeAreaView>

        {/* a full-screen flow keeps its own ✕ */}
        <Modal visible={sheet === 'checkin'} animationType="fade" presentationStyle="fullScreen">
          <CheckinScreen onDone={closeSheet} onClose={closeSheet} />
        </Modal>

        <Modal visible={sheet === 'focus'} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeSheet}>
          <FocusSheet seedFactor={seedFactor} onDone={closeSheet} onClose={closeSheet} />
        </Modal>

        <Modal
          visible={sheet === 'event'}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeSheet}
          onDismiss={runAfterDismiss}
        >
          <EventSheet event={editEvent} onDone={closeSheet} onClose={closeSheet} />
        </Modal>

        {/* the profile — grouped like the iOS Settings app: inset cards,
            uniform rows, a coloured icon leading each one */}
        <Modal visible={profile} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setProfile(false)} onDismiss={runAfterDismiss}>
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
              {/* the record used to have a row here too — a door to a tab
                  that is one swipe away, kept from when the summary was a
                  buried sheet. The tab and its Share button are the
                  feature now; a second entrance was furniture. */}
              <Text style={styles.groupTitle}>Observation</Text>
              <View style={styles.group}>
                <Pressable
                  onPress={() => {
                    afterDismiss.current = () => { setSeedFactor(null); setSheet('focus'); };
                    setProfile(false);
                  }}
                  disabled={!protocol && !focusReady}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={protocol ? 'Change your focus' : 'Choose a focus'}
                >
                  <RowIcon name="search-outline" />
                  <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                    <Text style={styles.rowLabel}>Your focus</Text>
                    <Text style={styles.rowValue} numberOfLines={1}>
                      {protocol
                        ? activeFactors(protocol).map((m) => m.name).join(' · ')
                        : focusReady ? 'Not set' : 'After a week of logging'}
                    </Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>
              </View>

              {/* Only offered where the binary can actually do it — a
                  row promising a connection an old build cannot make is
                  a broken promise on a settings screen. The sheet
                  itself explains the TestFlight path if opened on the
                  boundary. */}
              {health.available() && (
                <>
                  <Text style={styles.groupTitle}>Apple Health</Text>
                  <View style={styles.group}>
                    <Pressable
                      onPress={() => { track('health_setup_opened'); setHealthSheet(true); }}
                      style={styles.row}
                      accessibilityRole="button"
                      accessibilityLabel="Apple Health. Use sleep and activity to add context automatically."
                    >
                      <RowIcon name="heart-outline" />
                      <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                        <Text style={styles.rowLabel}>Apple Health</Text>
                        <Text style={styles.rowValue}>
                          {healthRequestedOn() ? 'On' : 'Off'}
                        </Text>
                        <Text style={styles.rowChevron}>›</Text>
                      </View>
                    </Pressable>
                  </View>
                  <Text style={styles.groupFooter}>
                    Use sleep and activity to add context automatically. Optional,
                    read-only, and everything imported stays on this iPhone.
                  </Text>
                </>
              )}

              <Text style={styles.groupTitle}>Reminders</Text>
              <View style={[styles.group, styles.groupPad]}>
                <RemindersSection />
              </View>

              <Text style={styles.groupTitle}>Your report</Text>
              <View style={styles.group}>
                <Pressable
                  onPress={() => setBackgroundOpen(true)}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel="Background for your clinician report"
                  accessibilityHint="Diagnoses, medications, history — printed on the report's first page, in your words"
                >
                  <RowIcon name="document-text-outline" />
                  <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                    <Text style={styles.rowLabel}>Background</Text>
                    <Text style={styles.rowValue}>{db.getBackground() ? 'Written' : ''}</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>
              </View>

              <Text style={styles.groupTitle}>Appearance</Text>
              <View style={styles.group}>
                <Pressable
                  onPress={() => setAppearance(true)}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={'Colour theme, ' + themeName}
                >
                  {/* the one row whose subject IS a colour shows it: the
                      glyph and its frame in the palette you chose */}
                  <View style={[styles.rowIcon, styles.themeIcon, { borderColor: themeBrand() }]}>
                    <Ionicons name="color-palette-outline" size={19} color={themeBrand()} />
                  </View>
                  <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                    <Text style={styles.rowLabel}>Colour theme</Text>
                    <Text style={styles.rowValue}>{themeName}</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>
              </View>

              <Text style={styles.groupTitle}>About</Text>
              <View style={styles.group}>
                <Pressable
                  onPress={() => setAbout(true)}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel="What Pattern is, and when not to log"
                >
                  <RowIcon name="information-circle-outline" />
                  <View style={[styles.rowMain, styles.rowLine]}>
                    <Text style={styles.rowLabel}>What Pattern is — and isn’t</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>
                <Pressable
                  onPress={openFeedback}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel="Send feedback by email"
                >
                  <RowIcon name="chatbubble-outline" />
                  <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                    <Text style={styles.rowLabel}>Send feedback</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>
              </View>

              {/* TEMPORARY — a look at the full onboarding flow without
                  re-installing. Runs the real screens; onDone here just
                  closes it and writes nothing, so previewing costs
                  nothing to undo. Remove this row once the new steps
                  have been seen. */}
              <View style={styles.group}>
                <Pressable
                  onPress={() => setPreviewOnboarding(true)}
                  style={[styles.row, styles.rowCentre]}
                  accessibilityRole="button"
                  accessibilityLabel="Preview the onboarding flow"
                >
                  <Text style={{ color: color.tint, fontSize: font.body, fontWeight: '600' }}>
                    Preview onboarding
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.groupTitle}>Your data</Text>
              <View style={styles.group}>
                <Pressable
                  onPress={() => {
                    setAnalyticsEnabled(!analyticsOn);
                    setAnalyticsOn(!analyticsOn);
                  }}
                  style={styles.row}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: analyticsOn }}
                  accessibilityLabel="Share anonymous usage counts"
                >
                  <RowIcon name="stats-chart-outline" />
                  <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                    <Text style={styles.rowLabel}>Share anonymous usage counts</Text>
                    <Text style={styles.rowValue}>{analyticsOn ? 'On' : 'Off'}</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>
              </View>
              <Text style={styles.groupFooter}>
                Counts that a thing happened — a check-in was completed, the app
                was opened — never what you recorded. No pain scores, notes or
                answers ever leave this phone.
              </Text>

              <View style={styles.group}>
                <Pressable
                  onPress={exportBackup}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel="Export backup"
                >
                  <RowIcon name="share-outline" />
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
                  <RowIcon name="download-outline" />
                  <View style={[styles.rowMain, styles.rowLine, styles.rowLineLast]}>
                    <Text style={styles.rowLabel}>Restore backup</Text>
                    <Text style={styles.rowChevron}>›</Text>
                  </View>
                </Pressable>
              </View>
              {/* a fact, not a row — iOS puts it under the group */}
              <Text style={styles.groupFooter}>
                Stored only on this iPhone. Your Pattern record and any imported
                Apple Health context stay here unless you choose to export or
                restore a backup — and Health context never travels in a backup,
                because it can always be re-read from Health itself. Restoring
                lets you replace or merge; you decide before anything changes.
              </Text>
              {/* which code is actually running — the end of guessing
                  whether an update has landed. updateId is null when the
                  app runs its embedded bundle. */}
              <Text style={styles.groupFooter} allowFontScaling maxFontSizeMultiplier={1.4}>
                {'Pattern v' + (Constants.expoConfig?.version || '?')
                  + ' · ' + (Updates.updateId ? 'update ' + Updates.updateId.slice(0, 8) : 'embedded bundle')}
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
            {/* nested inside the profile sheet, like Appearance — iOS
                will not present a sibling sheet while this one is up,
                which is why the first placement never opened */}
            <Modal visible={about} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAbout(false)}>
              <OnboardingScreen review onDone={() => setAbout(false)} />
            </Modal>

            {/* TEMPORARY — see the row above. The full five-step flow,
                writing nothing: onDone just closes it. */}
            <Modal
              visible={previewOnboarding}
              animationType="slide"
              presentationStyle="pageSheet"
              onRequestClose={() => setPreviewOnboarding(false)}
            >
              <OnboardingScreen onDone={() => setPreviewOnboarding(false)} />
            </Modal>

            <Modal visible={background} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBackgroundOpen(false)}>
              <BackgroundSheet onClose={() => setBackgroundOpen(false)} />
            </Modal>

            <Modal visible={appearance} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAppearance(false)}>
              <AppearanceSheet onPick={pickTheme} onDone={() => setAppearance(false)} />
            </Modal>

            <Modal visible={healthSheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHealthSheet(false)}>
              <HealthSheet
                service={health}
                onChanged={resyncHealth}
                onDone={() => setHealthSheet(false)}
              />
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
  /* hovers top right, under the headline, only on Record and only once
     you have left — glass, so it sits over the grids without occluding */
  backToToday: {
    position: 'absolute', top: 78, right: size.pageX,
    borderRadius: 19, borderCurve: 'continuous', overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  pillHit: { minHeight: 38, paddingHorizontal: 16, justifyContent: 'center' },
  backToTodayText: { color: color.textPrimary, fontSize: font.footnote, fontWeight: '600' },
  themeIcon: {
    borderWidth: 1.5, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logPill: {
    minHeight: 38, borderRadius: 19, borderCurve: 'continuous', paddingHorizontal: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.textPrimary,
  },
  logPillText: {
    color: '#000000', fontSize: font.body, fontWeight: '700', letterSpacing: -0.2,
  },
  profileBtnBusy: { opacity: 0.5 },
  profileBtn: {
    width: 44, height: 44, borderRadius: 22, borderCurve: 'continuous',
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
    color: color.textPrimary, fontSize: font.title1, fontWeight: '700',
    letterSpacing: -0.5, flex: 1,
  },
  /* room at the bottom so the last content clears the floating bar, and
     a little at the top so a page never begins hard against its heading */
  page: { paddingTop: 4, paddingBottom: 140 },
  sheet: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 64 },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  sheetBody: { padding: 20, paddingTop: 18, paddingBottom: 40 },

  /* ── iOS Settings grammar: inset groups, uniform rows, coloured icons ── */
  group: {
    borderRadius: 12, borderCurve: 'continuous', backgroundColor: color.bgSegmentTrack,
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
