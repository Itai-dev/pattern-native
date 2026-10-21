import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, AppState, Linking, Modal, NativeScrollEvent, NativeSyntheticEvent,
  Pressable, ScrollView, Share, StyleSheet, Switch, Text, View, useWindowDimensions,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import HomeScreen from './src/HomeScreen';
import Icon from './src/Icon';
import { RowChevron, RowIcon, list, settings } from './src/SettingsList';
import TabBar, { TAB_ORDER, Tab } from './src/TabBar';
import CheckinScreen from './src/CheckinScreen';
import DayScreen, { fmtDay } from './src/DayScreen';
import AddInfoSheet from './src/AddInfoSheet';
import HealthSheet from './src/HealthSheet';
import ConnectedDataSheet from './src/ConnectedDataSheet';
import { HealthKitService, deviceClock } from './src/health/healthkit';
import {
  healthCategories, healthRequestedOn, markHealthRequested, storedHealthDays, syncHealth,
} from './src/health/sync';
import {
  earlyLooks, firstDays, healthProgress, loadBudgetFor, noticedAssociations, strongestPossible,
} from './src/health/noticed';
import { afterWorkouts } from './src/health/afterWorkouts';
import {
  doseAssociations, doseProgress, earlyDoses, firstDoses, strongestDose,
} from './src/health/doses';
import {
  earlyWorkouts, firstWorkouts, strongestWorkout, workoutAssociations, workoutProgress,
} from './src/health/workouts';
import { PairKind } from './src/health/windows';
import EventSheet from './src/EventSheet';
import TrendsScreen from './src/TrendsScreen';
import AppearanceSheet from './src/AppearanceSheet';
import BackgroundSheet from './src/BackgroundSheet';
import DiagnosisSheet from './src/DiagnosisSheet';
import OnboardingScreen from './src/OnboardingScreen';
import PrivacySheet from './src/PrivacySheet';
import AppointmentRow, { PREF_APPOINTMENT } from './src/AppointmentRow';
import RemindersSection from './src/RemindersSection';
import * as db from './src/db';
import { cancelAll, configureHandler, isReminderId, registerCategory } from './src/reminders';
import { startBackgroundPrompts } from './src/health/background';
import {
  CalendarEvent, calendarAvailable, calendarEditable, calendarEvents, calendarOn, editEventInCalendar,
  requestCalendar, setCalendarOn,
} from './src/calendar';
import { aheadKey, bookedPastLine } from './src/health/ahead';
import { enableMorningReminderAt, syncReminders } from './src/reminderSchedule';
import { drainWatchCheckins, onWatchCheckin, pushWatchContext } from './src/watch';
import {
  Moment, PainEvent, ValidBackup, addDays, cleanDiagnosis, diagnosisShort, iso, minutesNow, todayISO,
} from './src/model';
import { buildReportData, reportHtml } from './src/report';
import { GoalRow } from './src/RecoveryCards';
import { Num } from './src/SummaryCard';
import { RecoveryGoal, currentGoal } from './src/recovery';
import { coachView, earnedIds, unseenAchievement } from './src/coach';
import { experimentState } from './src/experiment';
import CoachScreen from './src/CoachScreen';
import UnlockSheet from './src/UnlockSheet';
import { REPORT_DEFAULT_WINDOW_DAYS } from './src/thresholds';
import { PREF_LOCK_NUMBER, refreshWidget } from './src/widgetPush';
import { PREF_SQUARE_PICKER } from './src/SquarePicker';
import {
  analyticsEnabled, setAnalyticsEnabled, track, trackLaunch,
} from './src/analytics';
import { getPainTheme, setPainTheme } from './src/painScale';
import {
  DEFAULT_PAIN_THEME, PAIN_THEMES, PainThemeId, color, font, size,
} from './src/theme';

configureHandler(); // set once, before anything can be delivered
registerCategory().catch(() => {}); // the Check in button on every prompt
/* the chosen hue is part of the app's identity — restore it before the
   first frame ever renders */
setPainTheme(db.getPref<PainThemeId>('theme.pain', DEFAULT_PAIN_THEME));

type Sheet = null | 'checkin' | 'event' | 'info';

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

/* The header's round buttons are the mockup's 36; the slop brings each
   to the 44 a finger needs, and the row's gap keeps two slops apart. */
const HEAD_BTN = 36;
const BTN_SLOP = (44 - HEAD_BTN) / 2;

/** The floating return pill — the tab bar's glass, one word of it.
 *  In the header row beside the share button, where the eye goes for "take me back";
 *  the availability check is guarded for the same reason the tab bar's
 *  is: it throws on binaries that predate the native module. */
const PILL_LIQUID = (() => {
  try { return isLiquidGlassAvailable(); } catch { return false; }
})();

function GlassPill({ onPress, label, accessibilityLabel }: {
  onPress: () => void; label: string; accessibilityLabel: string;
}) {
  const inner = (
    <Pressable onPress={onPress} style={styles.pillHit} hitSlop={4}
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

/**
 * TWO tabs under a floating glass bar, and a profile built like the iOS
 * Settings app. Today is where you act; Record is everything that has
 * been recorded — led by the record itself, and what stands out in it
 * as a card per thing. (The months as a calendar were a view of the
 * record until 17 Sep 2026; the calendar is a view of the day screen
 * now, reached from Today's card.)
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
  const [activity, setActivity] = useState(() => db.getGoal());
  /* THE GOAL, SAVED IN ONE PLACE for onboarding, Today and Profile. The
     structured goal is stored whole; its label goes to the old free-text
     intention too, because that is what the clinician report prints and
     what a backup carries (recovery.ts, currentGoal). A removal is a
     stored skip and clears the text, so the report stops naming it. */
  const [recoveryGoal, setRecoveryGoal] = useState(() => db.getRecoveryGoal());
  /* the coach: the roadmap sheet, and which medal (if any) is having
     its moment. coachTick re-reads the prefs coach.ts depends on. */
  const [coachOpen, setCoachOpen] = useState<null | 'roadmap' | 'achievements'>(null);
  const [coachTick, setCoachTick] = useState(0);
  const [unlockDismissed, setUnlockDismissed] = useState(0);
  const saveGoal = useCallback((g: RecoveryGoal) => {
    db.setRecoveryGoal(g);
    db.setGoal(g.activity ? g.label : '');
    setRecoveryGoal(g);
    setActivity(db.getGoal());
  }, []);
  /* Anyone with a record has already been onboarded, whatever the pref
     says — the flag arrived after the app did, and showing a returning
     user an introduction to something they have been using for a week is
     worse than never having had one. */
  const [onboarded, setOnboarded] = useState(
    () => db.getPref<boolean>('onboarded', db.countDays() > 0)
  );
  const [events, setEvents] = useState(() => db.getEvents());
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
  /* the day a retro check-in is for; null = today, the normal case */
  const [checkinDate, setCheckinDate] = useState<string | null>(null);
  /* an existing check-in being EDITED — the flow opens on it and writes
     it in place. null = a new one. Before this, "tap to edit" opened a
     fresh check-in for today, whichever day the row was on. */
  const [editMoment, setEditMoment] = useState<Moment | null>(null);
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
  /* the Add information sheet, over wherever you are — Today's card
     and the day page both open it, on a day and, from a tapped dot, on
     one of its check-ins. It holds everything the check-in stopped
     asking on 17 Sep 2026: where, the words, the symptoms, the
     evening's questions and the note. */
  const [infoTarget, setInfoTarget] = useState<{ date: string; h?: number } | null>(null);
  const openInfo = useCallback((d: string, h?: number) => {
    setInfoTarget({ date: d, h });
    setSheet('info');
  }, []);
  /* The record is a long page — the charts, then a card for each thing
     that stands out, then the appendix — so the way back to the top is a
     pill rather than a lot of scrolling. It appears only once you have
     actually gone somewhere. */
  const recordScroll = useRef<ScrollView>(null);
  const [recordAway, setRecordAway] = useState(false);
  const [profile, setProfile] = useState(false);
  const [appearance, setAppearance] = useState(false);
  const [background, setBackgroundOpen] = useState(false);
  /* the diagnosis sheet, nested in Profile like the background */
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [about, setAbout] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [analyticsOn, setAnalyticsOn] = useState(() => analyticsEnabled());
  /* may the lock screen carry the number — off until asked, see widget.ts */
  const [lockNumber, setLockNumber] = useState(() => db.getPref<boolean>(PREF_LOCK_NUMBER, false));
  const [squarePicker, setSquarePicker] = useState(() => db.getPref<boolean>(PREF_SQUARE_PICKER, false));
  /* the next appointment, as state so Today's card follows the Profile
     row without a remount; the picker opens on mount when Today asked */
  const [appointment, setAppointment] = useState(() => db.getPref<string>(PREF_APPOINTMENT, ''));
  /* "Use my calendar": the switch state, saved by calendar.ts */
  const [calendarUse, setCalendarUse] = useState<boolean>(() => calendarOn());
  const [apptPickerOnOpen, setApptPickerOnOpen] = useState(false);
  /* a date that has passed clears itself the day after — nobody wants
     to be told the appointment was yesterday — and sets the next ask a
     month out. On launch and on every foreground, so a phone left
     open across midnight still catches up. */
  useEffect(() => {
    const sweep = () => {
      const d = db.getPref<string>(PREF_APPOINTMENT, '');
      if (d && d < todayISO()) {
        db.setPref(PREF_APPOINTMENT, '');
        db.setPref('appointment.askAfter', iso(new Date(new Date(d.replace(/-/g, '/')).getTime() + 30 * 86400000)));
        setAppointment('');
      }
    };
    sweep();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') sweep(); });
    return () => sub.remove();
  }, []);
  /* bumping this repaints every pain colour in the app after a theme pick */
  const [, setThemeTick] = useState(0);

  /* ── Apple Health ─────────────────────────────────────────
     One service for the whole app. On binaries without the native
     module it reports unavailable and every path below is a no-op —
     the same guard discipline as the glass. */
  const health = useMemo(() => new HealthKitService(), []);
  const [healthSheet, setHealthSheet] = useState(false);
  /* the Health sheet has two faces: the setup, and the connected-data
     status that says what arrived, when, and what did not */
  const [healthPanel, setHealthPanel] = useState<'setup' | 'status'>('setup');
  const [healthRefreshing, setHealthRefreshing] = useState(false);
  const healthRefreshCalls = useRef(0);
  const [healthSyncStatus, setHealthSyncStatus] = useState(() => db.getHealthSyncStatus());
  const [healthDays, setHealthDays] = useState(() => storedHealthDays());

  /* Foreground sync: on launch and on every return from background,
     because Health data arrives late — a watch syncs when it syncs.
     Deliberately NOT background delivery; the decision and its reasons
     live in health/sync.ts. */
  const resyncHealth = useCallback(async () => {
    healthRefreshCalls.current++;
    setHealthRefreshing(true);
    try {
      await syncHealth(health, deviceClock);
      /* fresh nights and doses re-plan the reminder week — the learned
         times come from these days (health/prompts.ts) */
      syncReminders().catch(() => {});
    } catch { /* existing readings remain available */ }
    finally {
      setHealthDays(storedHealthDays());
      setHealthSyncStatus(db.getHealthSyncStatus());
      healthRefreshCalls.current--;
      setHealthRefreshing(healthRefreshCalls.current > 0);
    }
  }, [health]);
  const openConnectedData = () => {
    setHealthDays(storedHealthDays());
    setHealthSyncStatus(db.getHealthSyncStatus());
    setHealthPanel('status'); setProfile(true); setHealthSheet(true);
  };
  /* the moment-of prompts: iOS wakes the app when a workout or a night
     lands, on binaries with the entitlement — nothing on the others */
  useEffect(() => startBackgroundPrompts(health), [health]);
  useEffect(() => {
    resyncHealth();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') resyncHealth();
    });
    return () => sub.remove();
  }, [resyncHealth]);

  /* THE CALENDAR, TWO DAYS OUT — today and tomorrow, for the card that
     reads a booked session against the line (health/ahead.ts). Read
     on launch and on every foreground, like Health, because a booking
     made in another app an hour ago is exactly what it is for. An
     empty map whenever the calendar is off, and the card is absent. */
  const [calendarAhead, setCalendarAhead] = useState<Record<string, CalendarEvent[]>>({});
  const refreshCalendar = useCallback(() => {
    if (!calendarUse) { setCalendarAhead({}); return; }
    calendarEvents(todayISO(), 2).then(setCalendarAhead).catch(() => setCalendarAhead({}));
  }, [calendarUse]);
  useEffect(() => {
    refreshCalendar();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshCalendar();
    });
    return () => sub.remove();
  }, [refreshCalendar]);
  /* "fine as it is": the booking as booked, remembered by its key so a
     moved or shortened event asks again. The last twenty keys — a
     bounded pref, never a growing one. */
  const [aheadDismissed, setAheadDismissed] = useState<string[]>(
    () => db.getPref<string[]>('ahead.dismissed', [])
  );

  /* What Pattern noticed — licensed by the Health categories the user
     connected (consent lives in the Health setup, not in a second
     switch), remembered so a shown finding that stops holding fades
     out loud instead of vanishing. */
  const healthNoticed = useMemo(() => {
    const shown = db.getPref<PairKind[]>('health.shownKinds', []);
    const all = noticedAssociations(
      entries, healthDays, healthCategories(), shown);
    const best = strongestPossible(all);
    const fading = all.filter((a) => a.verdict === 'fading');
    /* every association whose groups actually formed — Trends draws the
       comparison itself, claim or no claim; the claim stays gated */
    const groups = all.filter((a) =>
      (a.verdict === 'possible' || a.verdict === 'observation') && a.low && a.high);
    /* and what each connected comparison is still waiting for — the
       instruction a person can act on while nothing has cleared */
    const progress = healthProgress(entries, healthDays, healthCategories());
    /* doses, the same way: licensed by the medications category,
       remembered by medication so a shown change fades out loud. The
       identifiers remembered are HealthKit's opaque concept ids — a
       key, never a name, and local like everything else. */
    const meds = healthCategories().indexOf('medications') >= 0;
    const shownDoses = db.getPref<string[]>('health.shownDoses', []);
    const doseAll = meds ? doseAssociations(entries, healthDays, shownDoses) : [];
    const doseBest = strongestDose(doseAll);
    const doses = {
      best: doseBest,
      fading: doseAll.filter((a) => a.verdict === 'fading'),
      groups: doseAll.filter((a) => a.verdict === 'possible' || a.verdict === 'observation'),
      progress: meds ? doseProgress(entries, healthDays) : [],
      early: meds ? earlyDoses(entries, healthDays) : [],
      first: meds ? firstDoses(entries, healthDays) : [],
    };
    /* and around a workout, the same construction again: licensed by
       the workouts category, remembered by activity name — a plain
       word like 'swimming', local like everything else */
    const wk = healthCategories().indexOf('workouts') >= 0;
    const shownWorkouts = db.getPref<string[]>('health.shownWorkouts', []);
    const workoutAll = wk ? workoutAssociations(entries, healthDays, shownWorkouts) : [];
    const workouts = {
      best: strongestWorkout(workoutAll),
      fading: workoutAll.filter((a) => a.verdict === 'fading'),
      groups: workoutAll.filter((a) => a.verdict === 'possible' || a.verdict === 'observation'),
      progress: wk ? workoutProgress(entries, healthDays) : [],
      early: wk ? earlyWorkouts(entries, healthDays) : [],
      first: wk ? firstWorkouts(entries, healthDays) : [],
    };
    /* and the pictures before the gates — see thresholds.ts, early looks */
    const early = earlyLooks(entries, healthDays, healthCategories());
    const first = firstDays(entries, healthDays, healthCategories());
    /* the one forward-facing sentence: where the person's own
       harder-workout days begin, from the association already
       evaluated above — null until that association clears */
    const budget = loadBudgetFor(entries, healthDays, all);
    /* each workout beside the next morning's number — facts, no gate,
       from the first workout on. Licensed by the same category as the
       workout comparisons, and by nothing else. */
    const after = healthCategories().indexOf('workouts') >= 0
      ? afterWorkouts(entries, healthDays, todayISO()) : [];
    return { best, fading, groups, progress, early, first, doses, workouts, budget, after };
  }, [entries, healthDays]);
  /* "Shown" is written AFTER the render, as an effect — a memo is not a
     commit, and React may run or throw away a render without committing
     it, which had a finding marked as seen before any screen had drawn
     it, and later "fading out loud" about something nobody was shown.
     The mark itself is honest: both tabs stay mounted in the pager, so
     the moment a finding is the best one, Patterns is rendering it. */
  useEffect(() => {
    const best = healthNoticed.best;
    if (best) {
      const shown = db.getPref<PairKind[]>('health.shownKinds', []);
      if (shown.indexOf(best.kind) < 0) db.setPref('health.shownKinds', shown.concat(best.kind));
    }
    const doseBest = healthNoticed.doses.best;
    if (doseBest) {
      const shownDoses = db.getPref<string[]>('health.shownDoses', []);
      if (shownDoses.indexOf(doseBest.medId) < 0) db.setPref('health.shownDoses', shownDoses.concat(doseBest.medId));
    }
    const workoutBest = healthNoticed.workouts.best;
    if (workoutBest) {
      const shownWorkouts = db.getPref<string[]>('health.shownWorkouts', []);
      if (shownWorkouts.indexOf(workoutBest.activity) < 0) {
        db.setPref('health.shownWorkouts', shownWorkouts.concat(workoutBest.activity));
      }
    }
  }, [healthNoticed]);

  /* the booked session past the line, if any — derived, never stored,
     from the calendar just read and the budget just computed */
  const ahead = useMemo(() => {
    const t = todayISO();
    return bookedPastLine(calendarAhead, healthNoticed.budget, t, addDays(t, 1), minutesNow(), aheadDismissed);
  }, [calendarAhead, healthNoticed, aheadDismissed]);
  const dismissAhead = useCallback(() => {
    if (!ahead) return;
    track('ahead_dismissed');
    const next = aheadDismissed.concat(aheadKey(ahead.date, ahead.event)).slice(-20);
    db.setPref('ahead.dismissed', next);
    setAheadDismissed(next);
  }, [ahead, aheadDismissed]);
  /* Apple's editor on the event, then the calendar re-read: a saved
     change is a different booking, and the card follows it */
  const openAhead = useCallback(() => {
    if (!ahead) return;
    editEventInCalendar(ahead.event)
      .then((r) => { track('ahead_opened', { action: r }); refreshCalendar(); })
      .catch(() => {});
  }, [ahead, refreshCalendar]);
  /* an event being edited. Nothing has to be closed to reach it any more:
     the day is a LAYER, not a modal, so the event sheet presents on top
     of it and the day is still there underneath when it dismisses. The
     whole reopen-after-dismiss dance the day sheet needed went with it. */
  const [editEvent, setEditEvent] = useState<PainEvent | null>(null);
  /* the day a new event is for — set by the day screen, cleared by
     every other door, so an event opened from Today is today's */
  const [eventDate, setEventDate] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const next = db.getAll();
    setEntries(next);
    setActivity(db.getGoal());
    setRecoveryGoal(db.getRecoveryGoal());
    setEvents(db.getEvents());
    setHealthDays(storedHealthDays());
    setHealthSyncStatus(db.getHealthSyncStatus());
    /* one place to feed the widget, so no screen has to remember to */
    refreshWidget(next);
    /* and the watch's week strip, which is drawn from the same days */
    pushWatchContext(next);
    /* and to rebuild the reminder queue — a check-in just made silences
       today's slot in its part of the day. Never prompts. */
    syncReminders().catch(() => {});
  }, []);

  /* Check-ins made on the watch, waiting in the bridge's mailbox — the
     same launch-and-foreground rhythm Health follows, because both are
     data that arrived while nobody was looking at this screen. On
     binaries without the watch build this is a no-op. */
  useEffect(() => {
    const pull = () => {
      if (drainWatchCheckins() > 0) refresh();
      /* and tell the watch what the scale looks like — the same
         rhythm, because a watch paired while the app was in the
         background has never been told */
      pushWatchContext();
      /* the reminder queue reaches a week ahead; every foreground
         tops it up, so a phone unopened for days never runs dry */
      syncReminders().catch(() => {});
    };
    pull();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') pull();
    });
    /* and while the app is up, a watch check-in lands the moment it
       arrives rather than on the next foreground — the widget and the
       reminder queue follow through refresh() */
    const off = onWatchCheckin(() => { if (drainWatchCheckins() > 0) refresh(); });
    return () => { sub.remove(); off(); };
  }, [refresh]);

  /* A TAPPED REMINDER OPENS THE QUESTION IT ASKED. The notification
     says "How intense is your pain right now?"; landing on Today with
     a Log button top-right was making the person find the question a
     second time. Cold start and warm resume both come through here.
     The last response is remembered by its date so a JS reload cannot
     replay the launch that already opened one. */
  useEffect(() => {
    const open = (r: Notifications.NotificationResponse | null) => {
      if (!r || !isReminderId(r.notification.request.identifier)) return;
      const stamp = String(r.notification.date);
      if (db.getPref<string>('reminders.lastOpened', '') === stamp) return;
      db.setPref('reminders.lastOpened', stamp);
      setSheet('checkin');
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, []);

  const closeSheet = useCallback(() => {
    setSheet(null);
    setEditEvent(null);
    setEditMoment(null);
    setCheckinDate(null);
    refresh();
  }, [refresh]);

  /* ── one modal at a time, SEQUENCED ───────────────────────
     Everywhere the app closes one sheet and opens another — day detail
     to event, day detail to check-in, profile to focus — the second
     presentation must wait for the first dismissal to complete. The
     next action is parked here and fired from the closing modal's
     onDismiss (iOS-only callback, and this is an iOS-only app). */
  const afterDismiss = useRef<null | (() => void)>(null);
  /* the event sheet's own Cancel guard, so a swipe down asks before it
     drops a typed flare (EventSheet requestCloseRef). Null while the
     sheet is not mounted — then there is nothing to lose. */
  const eventClose = useRef<null | (() => void)>(null);
  /* the check-in's Cancel, for the same swipe — so a flick away is
     counted as an abandoned check-in exactly as Cancel is */
  const checkinClose = useRef<null | (() => void)>(null);
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
  const startEditEvent = useCallback((ev: PainEvent) => {
    setEditEvent(ev);
    setEventDate(null);
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

  const coach = useMemo(() => {
    const today = todayISO();
    /* "first answer": the earliest experiment that ended with something
       to say, whichever way it went — not one that ran out of days */
    const answered = db.getExperiments()
      .filter((x) => x.status === 'done' && x.endedOn)
      .filter((x) => {
        const v = experimentState(x, entries, today).verdict;
        return v === 'possible' || v === 'observation';
      })
      .map((x) => x.endedOn as string).sort()[0] || null;
    return coachView(entries, healthDays, currentGoal(recoveryGoal, activity), today, {
      reportOn: db.getCoachReportOn(), answerOn: answered,
    });
  }, [entries, healthDays, recoveryGoal, activity, coachTick]);
  /* Profile's roadmap row says how many — what was done, never a pain */
  const earnedCount = coach.achievements.filter((a) => a.earnedOn).length;

  /* the first run after the coach shipped remembers everything already
     earned, silently — those medals are in the list, dated, and only
     what is earned from here on arrives as a moment */
  useEffect(() => {
    if (onboarded && db.getCoachSeen() === null) db.setCoachSeen(earnedIds(coach));
  }, [coach, onboarded]);

  const unlock = useMemo(
    () => unseenAchievement(coach, db.getCoachSeen()),
    [coach, unlockDismissed]
  );
  const closeUnlock = useCallback((then?: () => void) => {
    db.setCoachSeen(earnedIds(coach));
    setUnlockDismissed((n) => n + 1);
    if (then) setTimeout(then, 350);
  }, [coach]);

  const makePdf = useCallback(async (includeNotes: boolean, windowDays: number) => {
    setSharing(true);
    try {
      const data = buildReportData({
        entries, events, func: [], goalText: db.getGoal(),
        todayIso: todayISO(), windowDays,
        includeNotes,
        /* written FOR the report, so it rides every share — the sheet that
           collects it says so in its first sentence */
        background: db.getBackground(),
        /* the first row of that background: with a name, the room knows
           it is a review; without one, that the record is here to help
           make one */
        diagnosis: db.getDiagnosis(),
        /* The report uses the same gates as Trends, recalculated from
           the raw days inside the range the person chose to share. */
        healthDays: storedHealthDays(),
        healthCategories: healthCategories(),
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
        db.markCoachReport(todayISO());
        setCoachTick((n) => n + 1);
      } else {
        Alert.alert('Sharing isn’t available on this device.');
      }
    } catch {
      Alert.alert('Couldn’t create the PDF', 'Please try again.');
    } finally {
      setSharing(false);
    }
  }, [entries, events, healthNoticed]);

  /* THE WINDOW IS THE CALLER'S. Patterns shares the range it is showing;
     the appointment card shares the last three months. It used to be
     whatever Patterns last showed, which made the appointment PDF a
     week long if Week had been tapped, and the whole record if Patterns
     had never been opened — with nothing saying which. */
  const shareRecord = useCallback((windowDays: number) => {
    if (sharing) return;
    /* Day notes ride along only on an explicit yes, asked at every share
       rather than remembered from the last one. They are written with no
       audience in mind, and which audience gets them is a decision about
       THIS copy — a doctor's PDF and one for a work absence claim are not
       the same share. No notes in the window, no question. */
    const start = new Date();
    start.setDate(start.getDate() - (windowDays - 1));
    const startIso = iso(start);
    const hasNotes = Object.keys(entries)
      .some((k) => k >= startIso && !!(entries[k].note || '').trim());
    if (!hasNotes) { makePdf(false, windowDays); return; }
    Alert.alert(
      'Include your day notes?',
      'Notes you wrote on your days can go into the PDF, word for word, ' +
      'in their own section. The numbers and charts are included either way.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Without notes', onPress: () => makePdf(false, windowDays) },
        { text: 'Include notes', onPress: () => makePdf(true, windowDays) },
      ]
    );
  }, [entries, sharing, makePdf]);
  /* the two doors, each naming its window */
  const shareTrends = useCallback(
    () => shareRecord(trendsSpan || REPORT_DEFAULT_WINDOW_DAYS), [shareRecord, trendsSpan]);
  const shareForAppointment = useCallback(
    () => shareRecord(REPORT_DEFAULT_WINDOW_DAYS), [shareRecord]);

  const pickTheme = useCallback((id: PainThemeId) => {
    setPainTheme(id);
    db.setPref('theme.pain', id);
    setThemeTick((v) => v + 1);
    /* the widget's colours are computed HERE, by painScale, and pushed as
       hex — a theme change has to push a fresh snapshot or the home
       screen keeps wearing the old palette until the next check-in */
    refreshWidget(db.getAll());
    /* the watch's colours are computed here too, and pushed the
       same way — see watchContext.ts */
    pushWatchContext();
  }, []);

  /* Restore: the file is fully validated BEFORE anything is touched, then
     the user chooses what the restore means — replace or merge. */
  const applyRestore = useCallback((backup: ValidBackup, mode: db.RestoreMode) => {
    try {
      const r = db.applyBackup(backup, mode);
      track('backup_restored', { mode });
      refresh();
      /* restored from the first onboarding screen: a record exists now,
         and the person who made it has seen the introduction already —
         sending them through it, and then through a first check-in that
         would duplicate a restored day, is the wrong end of the app */
      if (r.days > 0 && !onboarded) {
        db.setPref('onboarded', true);
        setOnboarded(true);
      }
      Alert.alert(
        mode === 'replace' ? 'Copy restored' : 'Copy merged',
        r.days + (r.days === 1 ? ' day' : ' days') +
        (r.events ? ', ' + r.events + (r.events === 1 ? ' event' : ' events') : '') +
        (r.func ? ', ' + r.func + ' weekly ' + (r.func === 1 ? 'rating' : 'ratings') : '') +
        (mode === 'replace' ? ' now replace what was here.' : ' were brought in. Nothing was duplicated or deleted.')
      );
    } catch {
      Alert.alert('Restore failed', 'Nothing was changed. Your current data is intact.');
    }
  }, [refresh, onboarded]);

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
      Alert.alert('Couldn’t read that file', 'It doesn’t look like a copy saved from Pattern. Nothing was changed.');
      return;
    }
    const b = backup;
    const summary = Object.keys(b.entries).length + ' days, ' +
      b.events.length + ' events, ' + b.func.length + ' weekly ratings';
    Alert.alert(
      'Restore a saved copy',
      'This file holds ' + summary + '.\n\n' +
      'Replace: everything currently in Pattern is removed and the copy takes its place.\n' +
      'Merge: the copy’s days replace those same days, other days are kept, and nothing is duplicated.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge without duplicates', onPress: () => applyRestore(b, 'merge') },
        {
          text: 'Replace current data',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Replace everything?',
              'Your current check-ins, events and weekly ratings will be removed and replaced by the copy. Save a copy of what is here first if you are unsure.',
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

  /* THE ONE COPY THAT SURVIVES DELETION. The file is written to the
     cache and handed to the share sheet; where it lands is the user's
     choice and the app never learns where. What iOS does report is
     whether it landed at all — 'sharedAction' when it went somewhere,
     'dismissedAction' when the sheet was closed — and only the first
     counts as a copy existing. A cancelled sheet leaves the Today card
     exactly where it was, because it must: a card that cleared itself
     on a tap would be claiming a copy that isn't there. */
  const [lastCopy, setLastCopy] = useState(() => db.getLastCopy());
  const exportBackup = useCallback(async () => {
    track('backup_exported');
    const json = db.exportBackup(todayISO());
    const path = FileSystem.cacheDirectory + 'pattern-backup-' + todayISO() + '.json';
    try {
      await FileSystem.writeAsStringAsync(path, json);
      const r = await Share.share({ url: path, message: 'Pattern — saved copy ' + todayISO() });
      if (r.action === Share.sharedAction) setLastCopy(db.markCopied(todayISO()));
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
              'There is no copy anywhere else. Deleted data cannot be recovered unless you saved a copy.',
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

  const themeName = (PAIN_THEMES.find((t) => t.id === getPainTheme()) || PAIN_THEMES[0]).name;

  if (!onboarded) {
    return (
      <GestureHandlerRootView style={styles.root}>
        <SafeAreaProvider>
          <OnboardingScreen
            onRestore={restoreBackup}
            health={{ available: health.available(), request: (c) => health.requestAuthorization(c) }}
            onDone={(r) => {
              /* Health was asked on its own screen: the sheet completed,
                 which is all Pattern records (HealthSheet does the same),
                 and the first sync starts now */
              if (r.health) {
                markHealthRequested(r.health);
                track('health_connected', { categories: r.health.length });
                resyncHealth();
              }
              /* counts only, never content — the closed-list rule. That
                 the diagnosis question was answered or passed over is a
                 count; which answer is about their body and stays here. */
              track('onboarding_completed', {
                where: r.where.length, diagnosisAnswered: !!r.diagnosis.status,
              });
              db.setPref('onboarded', true);
              setOnboarded(true);
              /* usual places, for the first check-in's offer — a record
                 with no history yet has no last time to be the same as */
              if (r.where.length) db.setPref('onboard.loc.v1', r.where);
              /* THE DIAGNOSIS IS ITS OWN RECORD, skip included — the
                 report prints it and Today orders its offers by it, so
                 it is never folded into free text it would then have to
                 be parsed back out of. The screen was put, so a '' here
                 means passed over, and Today will not ask again. */
              db.setDiagnosis(cleanDiagnosis(r.diagnosis));
              /* the goal, skip included — a skip stored here is why Today
                 never offers it to someone who passed it over */
              saveGoal(r.goal);
              /* the duration seeds the report background's onset line,
                 and only into an empty field — words already written win */
              if (r.duration) {
                const bg = db.getBackground() || { v: 1 as const };
                if (!bg.onset) {
                  bg.onset = r.duration === 'weeks' ? 'Started a few weeks ago'
                    : r.duration === 'months' ? 'Going on for months'
                      : 'Going on for a year or more';
                  db.setBackground(bg);
                }
              }
              /* the morning reminder, if it was turned on there. Leaving
                 it off was an answer to a question that was put, so
                 Today's one-time reminder offer does not put it again. */
              if (r.reminder != null) {
                enableMorningReminderAt(r.reminder).then((res) => {
                  if (res === 'on') track('reminder_enabled', { slot: 'm' });
                }).catch(() => {});
              }
              db.setPref('reminders.offer.dismissed', true);
              /* the last screen's two doors: the first check-in, or Today */
              if (r.then === 'checkin') setSheet('checkin');
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
              {tab === 'today' ? <Num>{fmtDay(todayISO())}</Num> : 'Patterns'}
            </Text>
            <View style={styles.topActions}>
              {/* the Log pill that lived here is gone: the floating bar
                  carries the same door in thumb reach, and two buttons
                  for one action on one screen was one too many */}
              {/* THE WAY BACK UP, IN THE ROW. It used to float at a fixed
                  78pt from the top, which is where the header's own
                  buttons sit once the large title wraps or Dynamic Type
                  grows — the pill landed on the share and profile
                  buttons. In the row it takes its place beside them and
                  the row does the laying out, at every text size. */}
              {tab === 'trends' && recordAway && (
                <GlassPill
                  onPress={() => recordScroll.current?.scrollTo({ y: 0, animated: true })}
                  label="Top ↑"
                  accessibilityLabel="Back to the top of the record"
                />
              )}
              {/* ONE DOOR TO THE PDF (21 Oct 2026, the Apple design pass). A
                  share icon sat here on Patterns beside the white Create the
                  PDF button on the same screen — two doors to one action,
                  and the icon the less clear of them. The button names what
                  it makes and stays; the icon went. */}
              {/* the mockup puts an initial here; Pattern holds no name,
                  and asking for one to fill a circle would be the first
                  thing it collected about a person for no reason */}
              <Pressable
                onPress={() => setProfile(true)}
                style={styles.profileBtn}
                hitSlop={BTN_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Profile and settings"
              >
                <Icon name="person.fill" size={17} color={color.textPrimary} />
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
                goal={currentGoal(recoveryGoal, activity)}
                onGoalChange={saveGoal}
                roadmapLine={coach.roadmap ? coach.roadmap.nowLine : null}
                onOpenRoadmap={() => setCoachOpen(coach.roadmap ? 'roadmap' : 'achievements')}
                entries={entries}
                onLog={() => setSheet('checkin')}
                onOpenDay={openDay}
                onAddInfo={() => openInfo(todayISO())}
                onOpenReminders={() => setProfile(true)}
                onOpenAppointment={() => { setApptPickerOnOpen(true); setProfile(true); }}
                onShare={shareForAppointment}
                appointment={appointment}
                healthDays={healthDays}
                /* the event's own date, so a flare logged late for this
                   morning still counts; past days never do */
                flareToday={events.some((e) => e.kind === 'flare' && e.date === todayISO())}
                ahead={ahead}
                aheadEditable={calendarEditable()}
                onOpenAhead={openAhead}
                onDismissAhead={dismissAhead}
                onSaveCopy={exportBackup}
                lastCopy={lastCopy}
                healthOfferable={health.available() && !healthRequestedOn()}
                /* the Health sheet is nested in the Profile sheet, so the
                   two open together — the same route the Background
                   offer takes */
                onOpenHealth={() => {
                  track('health_setup_opened');
                  setProfile(true);
                  setHealthPanel('setup'); setHealthSheet(true);
                }}
              />
            </ScrollView>

            {/* The intention is context in Today and the shared summary.
                Weekly ability ratings remain off; existing ratings still
                survive backup and restore. */}
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
              onAddLog={(d) => {
                setCheckinDate(d === todayISO() ? null : d);
                setSheet('checkin');
              }}
              onEditLog={(d, m) => {
                setCheckinDate(d === todayISO() ? null : d);
                setEditMoment(m);
                setSheet('checkin');
              }}
              onEditEvent={startEditEvent}
              onAddEvent={(d) => { setEditEvent(null); setEventDate(d); setSheet('event'); }}
              onClose={() => setDayScreen(null)}
              onAddInfo={openInfo}
            />
          )}

          <TabBar tab={tab} onChange={goToTab} onLog={() => setSheet('checkin')} />
        </SafeAreaView>

        {/* a sheet since the October redesign: it rises over Today, and
            Cancel, a swipe down and the escape gesture all leave */}
        <Modal
          visible={sheet === 'checkin'}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => (checkinClose.current ? checkinClose.current() : closeSheet())}
          onDismiss={runAfterDismiss}
        >
          <CheckinScreen
            dateIso={checkinDate || undefined}
            edit={editMoment || undefined}
            onDone={closeSheet}
            onClose={closeSheet}
            requestCloseRef={checkinClose}
          />
        </Modal>

        <Modal visible={coachOpen != null} animationType="slide" presentationStyle="pageSheet"
          onRequestClose={() => setCoachOpen(null)} onDismiss={runAfterDismiss}>
          <CoachScreen
            view={coach}
            start={coachOpen || undefined}
            activity={(currentGoal(recoveryGoal, activity) || { activity: null }).activity}
            onClose={() => setCoachOpen(null)}
            onSetGoal={() => { afterDismiss.current = () => setProfile(true); setCoachOpen(null); }}
          />
        </Modal>

        {/* a medal's moment — only over Today, never over another sheet */}
        <UnlockSheet
          a={onboarded && tab === 'today' && !dayScreen && sheet == null && !profile && coachOpen == null ? unlock : null}
          activity={(currentGoal(recoveryGoal, activity) || { activity: null }).activity}
          roadmap={coach.roadmap}
          onClose={() => closeUnlock()}
          onOpenRoadmap={() => closeUnlock(() => setCoachOpen('roadmap'))}
        />

        <Modal
          visible={sheet === 'event'}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => (eventClose.current ? eventClose.current() : closeSheet())}
          onDismiss={runAfterDismiss}
        >
          <EventSheet
            event={editEvent} date={eventDate} onDone={closeSheet} onClose={closeSheet}
            requestCloseRef={eventClose}
          />
        </Modal>

        <Modal
          visible={sheet === 'info'}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={closeSheet}
          onDismiss={runAfterDismiss}
        >
          <AddInfoSheet
            dateIso={infoTarget ? infoTarget.date : todayISO()}
            h={infoTarget ? infoTarget.h : undefined}
            onDone={closeSheet}
            onClose={closeSheet}
            /* the event sheet presents after this one has gone, the same
               sequencing every sheet swap in this app uses. The event
               door used to be on the check-in's last step; it moved here
               with the rest of what a check-in stopped asking. */
            onEvent={() => {
              const d = infoTarget ? infoTarget.date : todayISO();
              afterDismiss.current = () => {
                setEditEvent(null); setEventDate(d === todayISO() ? null : d); setSheet('event');
              };
              closeSheet();
            }}
          />
        </Modal>

        {/* the profile — iOS Settings on the redesign's black: a large
            title, inset grouped cards, a white glyph on no tile leading
            each row. The grammar lives in src/SettingsList.tsx. */}
        <Modal visible={profile} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { setProfile(false); setApptPickerOnOpen(false); }} onDismiss={runAfterDismiss}>
          <View style={settings.sheet}>
            <View style={settings.navBar}>
              <View style={settings.navSpacer} />
              <Pressable
                /* leaving Profile also forgets that Today asked for the
                   date picker, so the next visit opens on the rows */
                onPress={() => { setProfile(false); setApptPickerOnOpen(false); }}
                style={settings.navBtn}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Done"
              >
                <Text style={settings.navBtnText}>Done</Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={settings.body} showsVerticalScrollIndicator={false}>
              {/* the large title in the page, not in the bar — the way
                  Settings' own first screen and the Coach sheet carry it */}
              <Text style={settings.largeTitle} accessibilityRole="header"
                allowFontScaling maxFontSizeMultiplier={1.3}>Profile</Text>
              {/* THE GOAL AND ITS ROADMAP, ONE GROUP (the calm pass,
                  21 Oct 2026). They were a bordered card and a separate
                  group under it: two shapes for one subject. The goal is
                  the group's first cell now, and the roadmap the row
                  under it. */}
              <View style={settings.group}>
                <GoalRow goal={currentGoal(recoveryGoal, activity)} today={todayISO()} onChange={saveGoal} />
                {/* THE WAY IN FOR EVERYONE (21 Oct 2026). Today reaches the
                    roadmap through the goal header, which only exists once
                    there is a goal — so without one, achievements already
                    earned by sessions and reports had no door at all. This
                    is that door, under the goal it belongs to. Profile
                    closes first and the coach opens from its onDismiss:
                    iOS will not present a second sheet while this one is
                    up, the same sequencing as every other sheet swap. */}
                <Pressable
                  onPress={() => {
                    afterDismiss.current = () => setCoachOpen(coach.roadmap ? 'roadmap' : 'achievements');
                    setProfile(false);
                    setApptPickerOnOpen(false);
                  }}
                  style={settings.row}
                  accessibilityRole="button"
                  accessibilityLabel={'Roadmap and achievements' + (earnedCount ? ', ' + earnedCount + ' earned' : '')}
                >
                  <RowIcon name="medal.fill" />
                  <View style={[settings.rowMain, settings.rowRuleTop]}>
                    <Text style={settings.rowLabel}>Roadmap & achievements</Text>
                    {/* a count of things done, never of pain — and
                        nothing at all before the first, so an empty
                        shelf is not a zero to look at */}
                    {earnedCount > 0 && (
                      <Text style={settings.rowValue}><Num>{earnedCount + ' earned'}</Num></Text>
                    )}
                    <RowChevron />
                  </View>
                </Pressable>
              </View>
              {/* FIVE GROUPS, NOT ELEVEN (30 Sep 2026). Profile had a group
                  per setting and a paragraph under most of them, and read
                  as a terms page. The settings are all still here; they
                  are grouped by what they are for, and each group carries
                  one sentence — the one that says what it does not do. */}

              <Text style={settings.groupTitle}>Check-ins</Text>
              <View style={settings.group}>
                <RemindersSection />
              </View>
              <View style={settings.group}>
                {/* the calendar: only on a binary that carries the module.
                    The permission is asked when it goes on, where the
                    question explains itself. */}
                {calendarAvailable() && (
                  <View style={settings.row} accessible accessibilityRole="switch"
                    accessibilityState={{ checked: calendarUse }}
                    accessibilityLabel="Use my calendar for reminder times">
                    <RowIcon name="calendar" />
                    <View style={[settings.rowMain, settings.rowLine]}>
                      <Text style={settings.rowLabel}>Use my calendar</Text>
                      <Switch
                        value={calendarUse}
                        onValueChange={async (on) => {
                          if (on && !(await requestCalendar())) {
                            Alert.alert('Calendar access is off',
                              'Turn it on for Pattern in iPhone Settings and the prompts will follow your calendar.');
                            return;
                          }
                          setCalendarOn(on);
                          setCalendarUse(on);
                          syncReminders().catch(() => {});
                        }}
                        trackColor={{ true: color.textSecondary, false: color.bgSegmentActive }}
                      />
                    </View>
                  </View>
                )}
                <View style={settings.row} accessible accessibilityRole="switch"
                  accessibilityState={{ checked: lockNumber }}
                  accessibilityLabel="Show the number on the lock screen">
                  <RowIcon name="iphone" />
                  <View style={[settings.rowMain, settings.rowLine]}>
                    <Text style={settings.rowLabel}>Number on lock screen</Text>
                    <Switch
                      value={lockNumber}
                      onValueChange={(on) => {
                        db.setPref(PREF_LOCK_NUMBER, on);
                        setLockNumber(on);
                        /* the lock screen wears the change at once */
                        refreshWidget(db.getAll());
                      }}
                      trackColor={{ true: color.textSecondary, false: color.bgSegmentActive }}
                    />
                  </View>
                </View>
                {/* the picker under comparison: eleven day squares in place
                    of the slider. A switch and not a rollout, so it can be
                    flipped mid-week and flipped back. Its glyph is the
                    slider's, not a grid: a white square is a pain value
                    with the colour taken out. */}
                <View style={settings.row} accessible accessibilityRole="switch"
                  accessibilityState={{ checked: squarePicker }}
                  accessibilityLabel="Choose pain with squares instead of a slider">
                  <RowIcon name="slider.horizontal.3" />
                  <View style={[settings.rowMain, settings.rowLine]}>
                    <Text style={settings.rowLabel}>Pick pain with squares</Text>
                    <Switch
                      value={squarePicker}
                      onValueChange={(on) => {
                        db.setPref(PREF_SQUARE_PICKER, on);
                        setSquarePicker(on);
                      }}
                      trackColor={{ true: color.textSecondary, false: color.bgSegmentActive }}
                    />
                  </View>
                </View>
                {/* THE THEME IS HOW CHECK-INS LOOK (the calm pass, 21 Oct
                    2026), so it sits with the lock-screen number and the
                    picker, not under About, where it was filed beside
                    the version string. */}
                <Pressable
                  onPress={() => setAppearance(true)}
                  style={settings.row}
                  accessibilityRole="button"
                  accessibilityLabel={'Colour theme, ' + themeName}
                >
                  {/* white like every other glyph. It used to wear the
                      chosen palette, but a hue on a settings row is
                      colour as decoration; the palette itself is one tap
                      in, drawn as its real ramp. */}
                  <RowIcon name="paintpalette.fill" />
                  <View style={[settings.rowMain, settings.rowLine, settings.rowLineLast]}>
                    <Text style={settings.rowLabel}>Colour theme</Text>
                    <Text style={settings.rowValue}>{themeName}</Text>
                    <RowChevron />
                  </View>
                </Pressable>
              </View>
              {/* one sentence, and the calendar's half only where the
                  calendar row is drawn — a footer about a row that is not
                  there is a promise about nothing */}
              <Text style={settings.groupFooter}>
                {calendarAvailable()
                  ? 'Calendar titles stay on this iPhone, and with the number off the lock screen shows only that you checked in.'
                  : 'With the number off, the lock screen shows only that you checked in.'}
              </Text>

              {/* Only offered where the binary can actually do it — a row
                  promising a connection an old build cannot make is a
                  broken promise on a settings screen. Connected data is
                  one tap further, inside the Health sheet. */}
              {health.available() && (
                <>
                  <Text style={settings.groupTitle}>Apple Health</Text>
                  <View style={settings.group}>
                    <Pressable
                      onPress={() => { track('health_setup_opened'); setHealthPanel('setup'); setHealthSheet(true); }}
                      style={settings.row}
                      accessibilityRole="button"
                      accessibilityLabel="Apple Health. Use sleep and activity to add context automatically."
                    >
                      <RowIcon name="heart.fill" />
                      <View style={[settings.rowMain, settings.rowLine, settings.rowLineLast]}>
                        <Text style={settings.rowLabel}>Apple Health</Text>
                        <Text style={settings.rowValue}>
                          {healthRequestedOn() ? 'Set up' : 'Not set up'}
                        </Text>
                        <RowChevron />
                      </View>
                    </Pressable>
                  </View>
                  <Text style={settings.groupFooter}>
                    Read-only, and everything imported stays on this iPhone.
                  </Text>
                </>
              )}

              <Text style={settings.groupTitle}>The PDF</Text>
              <View style={settings.group}>
                {/* the diagnosis, above the background it leads: a
                    diagnosis arrives, and "still looking" is the answer
                    most likely to be out of date in three months */}
                <Pressable
                  onPress={() => setDiagnosisOpen(true)}
                  style={settings.row}
                  accessibilityRole="button"
                  accessibilityLabel="Diagnosis"
                  accessibilityHint="Whether you have one, and what it is — the first line of the PDF"
                >
                  <RowIcon name="stethoscope" />
                  <View style={[settings.rowMain, settings.rowLine]}>
                    <Text style={settings.rowLabel}>Diagnosis</Text>
                    <Text style={settings.rowValue}>{diagnosisShort(db.getDiagnosis())}</Text>
                    <RowChevron />
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => setBackgroundOpen(true)}
                  style={settings.row}
                  accessibilityRole="button"
                  accessibilityLabel="Background for the PDF"
                  accessibilityHint="Diagnoses, medications, history — printed on the first page of the PDF, in your words"
                >
                  <RowIcon name="doc.text.fill" />
                  <View style={[settings.rowMain, settings.rowLine]}>
                    <Text style={settings.rowLabel}>Background</Text>
                    {/* "Not set", as Diagnosis and the appointment say it —
                        an empty value read as a row still loading */}
                    <Text style={settings.rowValue}>{db.getBackground() ? 'Written' : 'Not set'}</Text>
                    <RowChevron />
                  </View>
                </Pressable>
                <AppointmentRow
                  value={appointment}
                  openOnMount={apptPickerOnOpen}
                  onChange={(d) => {
                    db.setPref(PREF_APPOINTMENT, d);
                    setAppointment(d);
                    setApptPickerOnOpen(false);
                    if (d) track('appointment_set');
                  }}
                />
              </View>
              <Text style={settings.groupFooter}>
                Two days before the appointment, Today offers the PDF.
              </Text>

              <Text style={settings.groupTitle}>Your data</Text>
              <View style={settings.group}>
                <Pressable
                  onPress={exportBackup}
                  style={settings.row}
                  accessibilityRole="button"
                  accessibilityLabel="Save a copy"
                >
                  <RowIcon name="square.and.arrow.up" />
                  <View style={[settings.rowMain, settings.rowLine]}>
                    <Text style={settings.rowLabel}>Save a copy</Text>
                    <RowChevron />
                  </View>
                </Pressable>
                <Pressable
                  onPress={restoreBackup}
                  style={settings.row}
                  accessibilityRole="button"
                  accessibilityLabel="Restore a saved copy"
                >
                  <RowIcon name="square.and.arrow.down" />
                  <View style={[settings.rowMain, settings.rowLine]}>
                    <Text style={settings.rowLabel}>Restore a saved copy</Text>
                    <RowChevron />
                  </View>
                </Pressable>
                {/* a switch, because it is one — the row with On/Off text
                    and a chevron said "opens something" */}
                <View style={settings.row} accessible accessibilityRole="switch"
                  accessibilityState={{ checked: analyticsOn }}
                  accessibilityLabel="Share anonymous usage counts"
                  accessibilityHint="Counts that something happened, never what you recorded">
                  <RowIcon name="chart.bar.fill" />
                  <View style={[settings.rowMain, settings.rowLine]}>
                    {/* what the counts are not, under the switch it
                        qualifies rather than in the copy's footer */}
                    <View style={styles.rowStack}>
                      <Text style={settings.rowLabel}>Anonymous usage counts</Text>
                      <Text style={styles.rowSub}>That something happened, never what you recorded</Text>
                    </View>
                    <Switch
                      value={analyticsOn}
                      onValueChange={(on) => { setAnalyticsEnabled(on); setAnalyticsOn(on); }}
                      trackColor={{ true: color.textSecondary, false: color.bgSegmentActive }}
                    />
                  </View>
                </View>
                <Pressable
                  onPress={() => setPrivacy(true)}
                  style={settings.row}
                  accessibilityRole="button"
                  accessibilityLabel="Privacy policy"
                >
                  <RowIcon name="hand.raised.fill" />
                  <View style={[settings.rowMain, settings.rowLine, settings.rowLineLast]}>
                    <Text style={settings.rowLabel}>Privacy policy</Text>
                    <RowChevron />
                  </View>
                </Pressable>
              </View>
              {/* It opens with when the record last had a home other than
                  this phone, because that is the sentence that decides
                  whether the rest matters today. The reinstall sentence
                  stays: a tester lost a record to exactly that. The
                  usage counts' sentence moved under the switch's own
                  label (the calm pass, 21 Oct 2026), so the footer is
                  about the copy and nothing else. */}
              <Text style={settings.groupFooter}>
                <Num>{(lastCopy
                  ? 'Last copy saved ' + fmtDay(lastCopy.on) + ', holding '
                    + lastCopy.days + (lastCopy.days === 1 ? ' day. ' : ' days. ')
                  : 'No copy saved yet. ')
                  + 'A reinstall starts empty, and a saved copy is the way back.'}</Num>
              </Text>

              <Text style={settings.groupTitle}>About</Text>
              <View style={settings.group}>
                <Pressable
                  onPress={() => setAbout(true)}
                  style={settings.row}
                  accessibilityRole="button"
                  accessibilityLabel="What Pattern is, and when not to log"
                >
                  <RowIcon name="info.circle.fill" />
                  <View style={[settings.rowMain, settings.rowLine]}>
                    <Text style={settings.rowLabel}>What Pattern is — and isn’t</Text>
                    <RowChevron />
                  </View>
                </Pressable>
                <Pressable
                  onPress={openFeedback}
                  style={settings.row}
                  accessibilityRole="button"
                  accessibilityLabel="Send feedback by email"
                >
                  <RowIcon name="envelope.fill" />
                  <View style={[settings.rowMain, settings.rowLine, settings.rowLineLast]}>
                    <Text style={settings.rowLabel}>Send feedback</Text>
                    <RowChevron />
                  </View>
                </Pressable>
              </View>
              {/* which code is actually running — the end of guessing
                  whether an update has landed. updateId is null when the
                  app runs its embedded bundle. The version is a number
                  and takes the rounded face; the update id is a hash,
                  and a hash set half rounded reads as two fonts. */}
              <Text style={settings.groupFooter} allowFontScaling maxFontSizeMultiplier={1.4}>
                {'Pattern v'}<Num>{Constants.expoConfig?.version || '?'}</Num>
                {' · ' + (Updates.updateId ? 'update ' + Updates.updateId.slice(0, 8) : 'embedded bundle')}
              </Text>

              <View style={settings.group}>
                <Pressable
                  onPress={wipe}
                  style={[settings.row, settings.rowCentre]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete all my data"
                >
                  <Text style={styles.danger}>Delete all my data</Text>
                </Pressable>
              </View>
              <Text style={settings.groupFooter}>
                Removes everything from this iPhone. There is no copy anywhere else.
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

            <Modal visible={privacy} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setPrivacy(false)}>
              <PrivacySheet onDone={() => setPrivacy(false)} contactEmail={FEEDBACK_EMAIL} />
            </Modal>

            <Modal visible={background} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setBackgroundOpen(false)}>
              <BackgroundSheet onClose={() => setBackgroundOpen(false)} />
            </Modal>

            <Modal visible={diagnosisOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDiagnosisOpen(false)}>
              <DiagnosisSheet onClose={() => setDiagnosisOpen(false)} />
            </Modal>

            <Modal visible={appearance} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAppearance(false)}>
              <AppearanceSheet onPick={pickTheme} onDone={() => setAppearance(false)} />
            </Modal>

            <Modal visible={healthSheet} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHealthSheet(false)}>
              {healthPanel === 'status' ? <ConnectedDataSheet
                days={healthDays} categories={healthCategories()} status={healthSyncStatus}
                today={todayISO()} available={health.available()} refreshing={healthRefreshing}
                onRefresh={resyncHealth} onManage={() => setHealthPanel('setup')}
                onDone={() => setHealthSheet(false)}
              /> : <HealthSheet
                service={health}
                onChanged={resyncHealth}
                onOpenData={openConnectedData}
                onDone={() => setHealthSheet(false)}
              />}
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
    paddingHorizontal: size.pageX, paddingTop: 10, paddingBottom: 12,
  },
  /* in the header row, only on Patterns and only once you have scrolled
     away — glass like the tab bar, one word of it, as tall as the round
     buttons beside it so the row has one height */
  backToToday: {
    borderRadius: 18, borderCurve: 'continuous', overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  pillHit: { minHeight: HEAD_BTN, paddingHorizontal: 14, justifyContent: 'center' },
  backToTodayText: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  /* the gap is wider than two slops, so the 44pt targets never overlap */
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  /* the mockup's round button: 36 across, #3A3A3C, no rim — the grey a
     filled control takes on black, a step lighter than the cards so it
     reads as something to press rather than something to read */
  profileBtn: {
    width: HEAD_BTN, height: HEAD_BTN, borderRadius: HEAD_BTN / 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3A3A3C',
  },
  /* iOS's large title, at the mockup's 34 and −2.2% tracking; the
     date shrinks to fit on a narrow phone rather than wrapping */
  wordmark: {
    color: color.textPrimary, fontSize: font.largeTitle, fontWeight: '700',
    letterSpacing: -0.75, flex: 1,
  },
  /* room at the bottom so the last content clears the floating bar, and
     a little at the top so a page never begins hard against its heading */
  page: { paddingTop: 4, paddingBottom: 140 },
  /* a Profile row with a second grey line under its label — the one
     place a row says what it is not, beside the switch it qualifies */
  rowStack: { flex: 1, paddingVertical: 10, gap: 2 },
  rowSub: { color: list.tertiary, fontSize: font.footnote, lineHeight: 18 },
  /* the one coloured word in Profile: the app's soft destructive text,
     not the pain ramp and not iOS's alarm red (theme.ts) */
  danger: { color: color.danger, fontSize: font.body },
});
