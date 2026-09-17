/**
 * The Today tab: what you last recorded, what the day looks like so far,
 * and the one action that matters. The record lives in Trends, the month
 * on the Map, the day itself one tap away — act here, look there.
 *
 * TWO CARDS, AND EACH ANSWERS ONE QUESTION. "Last check-in" answers "what
 * did I say, and when" — the thing a person opening this app at four in
 * the afternoon actually wants and previously had to work out from a
 * daily average and a list. It says all of it: every area, every
 * quality word, the where in their own words, and a skip shown as the
 * answer it is. "Today so far" answers "what has the day done", in the
 * only comparison the record can make honestly before the day is over:
 * this against the first check-in of the same day — and only once there
 * is a second check-in to compare, because a chart of one dot is the
 * card above it again.
 *
 * THE DAY PAGER IS GONE FROM HERE. Sideways used to walk this screen back
 * through the record, and it was in the wrong place: Today is where you
 * act, and a surface you act on should not be able to become Tuesday
 * underneath the Log button — which always meant now, on every page, and
 * had to keep saying so. The gesture moved intact to Pain through the
 * day, where the day IS the subject and sideways can only mean one thing.
 *
 * NEITHER CARD REWARDS OPENING IT. There is no streak, no ring, no
 * comparison to yesterday and no count of anything completed. Both cards
 * are the same on the fifth open of an afternoon as on the first; the
 * only thing that changes either of them is a check-in the user added.
 */
import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import DayLine from './DayLine';
import ActivityIntention from './ActivityIntention';
import { TodayInsight } from './todayInsight';
import { ContextTile, PREF_TODAY_LAYERED, contextTiles } from './todayTiles';
import InfoTip from './InfoTip';
import DaySquare from './DaySquare';
import { Press, useReduceMotion } from './motion';
import { track } from './analytics';
import {
  Entries, LastCopy, LOC_NAMES, Moment, QUALITY_NAMES, SYMPTOM_NAMES, addDays, checkinCount,
  copyOfferDue, diagnosisPath, legacyDayValue, logsOf, todayISO, unsavedDays,
} from './model';
import { fmtDay } from './DayScreen';
import { fmtClock } from './clock';
import * as db from './db';
import { anyReminderOn, enableEveningReminder, savedSlots } from './reminderSchedule';
import { lastNightLine } from './health/context';
import { HealthDay } from './health/types';
import { BookedAhead, aheadBody } from './health/ahead';
import { ExperimentState, experimentCopy } from './experiment';
import {
  APPOINTMENT_LEAD_DAYS, APPOINTMENT_OFFER_AFTER_DAYS, APPOINTMENT_REASK_DAYS,
  BACKGROUND_OFFER_AFTER_DAYS, COPY_NUDGE_DAYS, DIAGNOSIS_OFFER_AFTER_DAYS, EXPERIMENT_OFFER_AFTER_DAYS,
  TODAY_OFFER_ORDER, TodayOffer,
  ACTIVITY_OFFER_AFTER_DAYS,
  EXPERIMENT_REOFFER_DAYS, HEALTH_OFFER_AFTER_DAYS, WIDGET_OFFER_AFTER_DAYS,
} from './thresholds';

/* ── when Today may ask for something ────────────────────────
   Several offers live on this screen, and at most ONE shows at a
   time: a screen that asks for three things is a form. They are
   ordered by how much they pay back a new user, and each is shown
   once, on either answer, forever — except the copy, which is the
   one thing here that protects the record rather than adding to it,
   and so returns after another week of days it does not cover.

   The reminder comes first and right after the first check-in — the
   moment it explains itself, and the strongest habit lever the app
   has. The copy comes next, ahead of everything optional: a record
   worth adding to is a record worth not losing. The background waits:
   five minutes of history right after six onboarding screens was the
   first thing every tester dismissed. The widget waits longest,
   because a lock screen is worth explaining only to someone who has
   come back. */
import {
  dayShape, formatCheckins, formatScore, painColor, painLabel, speakScore,
} from './painScale';
import { color, font, radius, size } from './theme';

/** the square on the last-check-in card. Big enough to be the first thing
 *  the eye lands on, small enough that the number beside it still wins —
 *  and sized against the type around it, which is Trends' type. */
const SQUARE = 58, SQ_RADIUS = 15;

/** the chart's drawing height on Today. Shorter than the day screen's,
 *  because this one is a look rather than a read — but the same chart,
 *  with the same scale beside it, because a shape with no scale is what
 *  made the first version unreadable. */
const SPARK_H = 96;

/* ── the moment's own words ─────────────────────────────────
   Quality and place, because both are recorded PER CHECK-IN and this card
   is about one check-in. The day's flagged factors are not here on
   purpose: they are the user's read of the whole day, and hanging them
   off a single moment would quietly turn an attribution into a property
   of a number.

   ALL OF IT, NOT THREE. The card used to stop at three chips and send
   the rest to the day detail; it is the one card about this check-in,
   and a card that shows some of an answer teaches the user that the
   rest was not kept.

   THREE STATES, TOLD APART. "Skipped" and "no areas" are different
   answers to the same question — one is "I'd rather not", the other is
   "nowhere in particular" — and the storage keeps them distinct on
   purpose, so this card must not fold both back into a blank. Never
   asked (older moments, a day-only record) is the third and shows
   nothing, because nothing is what is known. */
interface DetailRow {
  label: string;
  chips: string[];
  /** the user's own words, shown quoted so their voice stays theirs */
  quote?: string;
  /** the answer when there are no chips: skipped, or nothing fit */
  state?: string;
}

function detailsOf(l: Moment): DetailRow[] {
  const rows: DetailRow[] = [];
  const loc = (l.loc || []).map((id) => LOC_NAMES[id] || id);
  if (loc.length || l.locNote) {
    rows.push({ label: 'Where', chips: loc, quote: l.locNote || undefined });
  } else if (l.locSkipped) {
    rows.push({ label: 'Where', chips: [], state: 'Skipped' });
  } else if (l.locAsked) {
    rows.push({ label: 'Where', chips: [], state: 'No areas picked' });
  }
  const q = (l.q || []).map((id) => QUALITY_NAMES[id] || id);
  if (q.length) {
    rows.push({ label: 'Feels like', chips: q });
  } else if (l.qAsked) {
    rows.push({ label: 'Feels like', chips: [], state: 'Nothing fit' });
  }
  /* the chips under the number. Shown only when something was marked:
     they are on every check-in, so "nothing marked" is the common case,
     and a row saying so under each pain-only check-in would read as a
     reproach rather than a fact. The stored flag keeps the distinction
     (symAsked); this card just does not nag with it. */
  const sym = (l.sym || []).map((id) => SYMPTOM_NAMES[id] || id);
  if (sym.length) rows.push({ label: 'Also', chips: sym });
  return rows;
}

/** the same rows, as one spoken sentence for the card's label */
function speakDetails(rows: DetailRow[]): string {
  return rows.map((r) =>
    r.label + ': ' + [...r.chips, ...(r.quote ? ['“' + r.quote + '”'] : []), ...(r.state ? [r.state] : [])].join(', ')
  ).join('. ');
}

export interface HomeScreenProps {
  entries: Entries;
  activity: string | null;
  onActivityChange: (value: string) => void;
  insight: TodayInsight | null;
  onOpenRecord: () => void;
  onLog: () => void;
  /** the day detail — where editing, deleting and events live */
  onOpenDay: (dateIso: string) => void;
  /** the same day detail, opened onto today's note. One note per day,
   *  not per check-in: a third kind of note would be one more thing to
   *  store, back up and print, and "add a note" from here is the day's
   *  note offered where the user already is. */
  onAddNote: () => void;
  /** Pain through the day, opened on today */
  onOpenToday: () => void;
  /** the Background sheet, offered from here once a record exists */
  onOpenBackground: () => void;
  /** the Diagnosis sheet — the question put once to an install that
   *  predates it */
  onOpenDiagnosis: () => void;
  /** the appointment date picker, in Profile */
  onOpenAppointment: () => void;
  /** the PDF, from the appointment card */
  onShare: () => void;
  /** the next appointment as an ISO date, or '' — owned by App */
  appointment: string;
  /** the stored Health days, for the one line Today may carry: last night */
  healthDays: Record<string, HealthDay>;
  /** Profile, where the reminder times live — for "choose another time" */
  onOpenReminders: () => void;
  /** the binary can read Health and it has not been set up — the only
   *  state in which offering it is not a broken promise */
  healthOfferable: boolean;
  /** the Health setup sheet */
  onOpenHealth: () => void;
  /** a booked session, later today or tomorrow, longer than the
   *  person's own line — null when there is none, or no line yet */
  ahead: BookedAhead | null;
  /** Apple's editor on that event; false when the binary cannot */
  aheadEditable: boolean;
  onOpenAhead: () => void;
  /** "fine as it is": this booking, as booked, asks no more */
  onDismissAhead: () => void;
  /** the running or just-ended experiment, read against the record —
   *  null when none */
  experiment: ExperimentState | null;
  /** the sheet that starts one */
  onStartExperiment: () => void;
  /** file an ended one ("Done"), or end a running one early ("Stop") */
  onEndExperiment: (how: 'done' | 'stopped') => void;
  /** the backup export — the share sheet, and the record marked copied
   *  only if the sheet closed with the file handed somewhere */
  onSaveCopy: () => void;
  /** the last saved copy, owned by App so the card clears the moment one
   *  is made — null when there has never been one */
  lastCopy: LastCopy | null;
}

export default function HomeScreen({
  entries, activity, onActivityChange, insight, onOpenRecord, onLog, onOpenDay, onAddNote, onOpenToday,
  onOpenBackground, onOpenDiagnosis, onOpenReminders, healthOfferable, onOpenHealth,
  onOpenAppointment, onShare, appointment, healthDays,
  ahead, aheadEditable, onOpenAhead, onDismissAhead,
  experiment, onStartExperiment, onEndExperiment,
  onSaveCopy, lastCopy,
}: HomeScreenProps) {
  const t = todayISO();
  /* LAST NIGHT, ON TODAY. The calm rule keeps Health off this screen
     because steps climb between two opens; sleep does not — by the
     time anyone reads this card the night is over and the number is
     fixed. It is the first morning's whole reason to have connected
     Health, and it was two taps away on the day screen. */
  const lastNight = lastNightLine(healthDays[t], healthDays);
  const entry = entries[t] || null;
  /* newest first: this screen leads with the latest thing said */
  const logs = logsOf(entry).slice().sort((a, b) => b.h - a.h);
  const latest = logs[0] || null;
  const count = entry ? checkinCount(entry) : 0;
  /* A day carrying a value with no timestamped moments behind it — a
     legacy record, or one restored from an old backup. It is still an
     answer this person gave, so the card shows it; what it cannot show is
     a time, because there never was one. Without this branch a restored
     day reads as "no check-ins yet today" over a day that has one. */
  const dayOnly = !latest ? legacyDayValue(entry) : null;
  const value = latest ? latest.pain : dayOnly;
  const details = latest ? detailsOf(latest) : [];
  /* the day's note, read from the entry — shown as a line so the user
     knows one exists before tapping to add another */
  const note = entry && entry.note ? entry.note : '';

  /* the same slow, shallow breath the pain shape and the Logged square
     carry — presence, not decoration. ±2.5% over 2.6s; still under
     Reduce Motion. */
  const breath = useSharedValue(0);
  const rm = useReduceMotion();
  useEffect(() => {
    if (rm) { cancelAnimation(breath); breath.value = 0; return; }
    breath.value = withRepeat(withTiming(1, { duration: 2600 }), -1, true);
  }, [rm]);
  const breathStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + breath.value * 0.025 }],
  }));

  /* The background offer: once, after the record exists, gone forever
     on either answer. Onboarding is the wrong home for a five-minute
     survey — this is the right moment, when the first check-in has
     shown what the app is and the survey has a reason. Dismissing is a
     real no: the sheet stays reachable in Profile, and this card never
     returns to ask again. */
  const [bgDismissed, setBgDismissed] = useState(
    () => db.getPref<boolean>('background.offer.dismissed', false)
  );
  const loggedDays = Object.values(entries).filter(e => checkinCount(e) > 0).length;
  const offerBackground = !bgDismissed
    && loggedDays >= BACKGROUND_OFFER_AFTER_DAYS
    && db.getBackground() == null;

  /* THE DIAGNOSIS, to an install that was never asked. Onboarding puts
     the question on day zero; every phone from before it exists has a
     null here, and null is a state the app acts on — once. "Not now"
     stores the skip, so the card never returns; the sheet stays in
     Profile for the day a name arrives. Read at render, like the
     background: the sheet writes it, and Today re-renders when the
     sheet closes. */
  const diagnosis = db.getDiagnosis();
  const offerDiagnosis = diagnosis === null && loggedDays >= DIAGNOSIS_OFFER_AFTER_DAYS;
  const [, bumpDiagnosis] = useState(0);
  const dismissDiagnosis = () => {
    db.setDiagnosis({ v: 1, status: '', setOn: t });
    bumpDiagnosis((n) => n + 1);
  };
  const path = diagnosisPath(diagnosis);

  /* The reminder offer: once, after the first check-in — the spec's
     card, built. Taking it turns on the evening slot at its saved time
     and asks iOS for permission right there, where the question
     explains itself; "another time" opens Profile; "not now" is final.
     Never shown to someone who already has one on. */
  const [remDismissed, setRemDismissed] = useState(
    () => db.getPref<boolean>('reminders.offer.dismissed', false)
  );
  const offerReminder = !remDismissed && loggedDays >= 1 && !anyReminderOn();
  const dismissReminder = () => {
    db.setPref('reminders.offer.dismissed', true);
    setRemDismissed(true);
  };
  const takeReminder = () => {
    dismissReminder();
    enableEveningReminder().then((r) => {
      if (r === 'on') track('reminder_enabled');
      if (r === 'denied') {
        Alert.alert(
          'Notifications are off for Pattern',
          'Turn them on in iPhone Settings and the reminder will start. Your choice is saved.'
        );
      }
    }).catch(() => {});
  };
  const eveningSlot = savedSlots().filter((s) => s.key === 'e')[0] || { hour: 20, minute: 0 };
  const eveningAt = fmtClock(eveningSlot.hour * 60 + eveningSlot.minute);

  /* The widget, told about once. It is the only surface that reaches
     someone who was not already thinking about the app, and the only
     way to find it otherwise is the iOS widget gallery. */
  const [widgetDismissed, setWidgetDismissed] = useState(
    () => db.getPref<boolean>('widget.offer.dismissed', false)
  );
  const offerWidget = !widgetDismissed && loggedDays >= WIDGET_OFFER_AFTER_DAYS;

  /* THE COPY. The record is one SQLite file inside the app's own
     container, and deleting the app deletes it — there is no server
     copy by design, and nothing the app writes on its own outlives the
     app. A tester lost a whole record this way (13 Sep 2026): the app
     went, the reinstall came back empty, and the only thing that would
     have survived was a file they had chosen a home for.

     So Today says so — once a week of record exists that no copy holds,
     and again only after another week has been ADDED since "not now".
     It counts days added, never days elapsed: the card moves when the
     record does and never on its own, and a missed week neither
     advances it nor scolds. It is not a streak and not a verdict on
     today — it names how many days are at risk, which is a fact about
     storage, not about the pain in them, and it goes quiet the moment
     a copy exists. */
  const unsaved = unsavedDays(entries, lastCopy);
  const [copySeen, setCopySeenState] = useState(() => db.getCopySeen());
  const offerCopy = copyOfferDue(unsaved, copySeen, COPY_NUDGE_DAYS);
  const dismissCopy = () => {
    track('copy_offer_dismissed');
    db.setCopySeen(unsaved);
    setCopySeenState(unsaved);
  };

  /* Apple Health, offered once a record exists to sit beside. It left
     onboarding with the other day-zero asks: a permission request
     before the first check-in was friction wearing a privacy costume,
     and a card on day two arrives when there is a night's sleep to
     show next to a morning's number. */
  const [healthDismissed, setHealthDismissed] = useState(
    () => db.getPref<boolean>('health.offer.dismissed', false)
  );
  const offerHealth = healthOfferable && !healthDismissed && loggedDays >= HEALTH_OFFER_AFTER_DAYS;
  const dismissHealth = () => {
    db.setPref('health.offer.dismissed', true);
    setHealthDismissed(true);
  };

  /* The appointment. Asked once a record exists to bring, and asked
     again a month after a date has passed — appointments recur.
     "Not now" rests it for a month. The date arrives as a prop: App
     owns it, clears it the day after it passes, and the Profile row
     edits it, so this screen never writes a preference mid-render. */
  const askAfter = db.getPref<string>('appointment.askAfter', '');
  const offerAppointment = !appointment && loggedDays >= APPOINTMENT_OFFER_AFTER_DAYS
    && (!askAfter || t >= askAfter);
  const [, bump] = useState(0);
  const dismissAppointment = () => {
    db.setPref('appointment.askAfter', addDays(t, APPOINTMENT_REASK_DAYS));
    bump((n) => n + 1);
  };
  /* within the lead: the summary card */
  const apptSoon = !!appointment && appointment >= t
    && appointment <= addDays(t, APPOINTMENT_LEAD_DAYS);

  /* The experiment, offered once a week of record exists to compare a
     fortnight against, and never while one is running or waiting to
     be read. "Not now" rests it for the length of the thing declined.
     It sits after the background in the order: history first, then a
     question to carry forward. */
  const xAskAfter = db.getPref<string>('experiment.askAfter', '');
  const offerExperiment = !experiment && loggedDays >= EXPERIMENT_OFFER_AFTER_DAYS
    && (!xAskAfter || t >= xAskAfter);
  const dismissExperiment = () => {
    db.setPref('experiment.askAfter', addDays(t, EXPERIMENT_REOFFER_DAYS));
    bump((n) => n + 1);
  };
  const xCopy = experiment ? experimentCopy(experiment) : null;

  /* one at a time, in the order they pay back — and the order depends
     on what the person is here for (TODAY_OFFER_ORDER, thresholds.ts):
     someone seeking a diagnosis is shown the history and the
     appointment before an experiment; someone managing one, the other
     way round. The copy goes near the front in every order: every
     other offer adds something to a record that the copy is what
     keeps. */
  const due: Record<TodayOffer, boolean> = {
    activity: activity === null && loggedDays >= ACTIVITY_OFFER_AFTER_DAYS,
    reminder: offerReminder, copy: offerCopy, diagnosis: offerDiagnosis,
    health: offerHealth, background: offerBackground, experiment: offerExperiment,
    appointment: offerAppointment, widget: offerWidget,
  };
  const offer: TodayOffer | null = TODAY_OFFER_ORDER[path].filter((o) => due[o])[0] || null;

  /* the day's shape, from the two numbers on screen: the first check-in
     of today against the latest. Nothing is stored, nothing is derived
     into a fourth number, and with one check-in there is no comparison to
     make and none is offered. */
  const oldest = logs.length ? logs[logs.length - 1] : null;
  const shape = latest && oldest && logs.length > 1
    ? dayShape(oldest.pain, latest.pain)
    : null;

  /* ── THE BLOCKS, NAMED ONCE AND ORDERED TWICE. The layered Today
     (Profile ▸ Appearance) reads top to bottom from the fact to the
     future: the last check-in, then what went with it from Health, then
     the sentence before tomorrow's decision, then the things that only
     ever count up. The day-so-far chart is a look back at the pain and
     lives on the day screen there; the last-night line is replaced by
     the tiles. Nothing in either order rates today. */
  const blocks = {
    activity: (
      <>
      {!!activity && <View style={styles.activityWrap}>
        <ActivityIntention value={activity} onChange={onActivityChange} />
      </View>}
      </>
    ),
    hero: (
      <>
      {/* ── what you last said ────────────────────────────── */}
      {value != null ? (
        <Press
          onPress={() => onOpenDay(t)}
          pressScale={0.985}
          pressOpacity={0.92}
          style={styles.card}
          accessibilityRole="button"
          accessibilityLabel={(latest ? 'Last check-in, ' + fmtClock(latest.h) + ', ' : 'Today, ')
            + speakScore(value)
            + (details.length ? '. ' + speakDetails(details) : '')}
          accessibilityHint="Opens the day’s detail, where you can edit or remove it"
        >
          <View style={styles.head}>
            <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
              {latest ? 'Last check-in' : 'Today'}
            </Text>
            <View style={styles.headRight}>
              {!!latest && (
                <Text style={styles.headTime} allowFontScaling maxFontSizeMultiplier={1.3}>
                  {fmtClock(latest.h)}
                </Text>
              )}
              <Text style={styles.chev} allowFontScaling={false}>›</Text>
            </View>
          </View>

          <View style={styles.hero}>
            {/* the glow is the value's own colour, so it says nothing the
                square does not already say. A 0 glows black, which is to
                say not at all — correct, and the reason this is safe.

                The wrapper is painted the same colour and cut to the same
                shape as the square it holds: an iOS shadow is cast by a
                layer's own fill, and a transparent box casts nothing
                however loudly its shadowColor is set. */}
            <Animated.View
              style={[
                breathStyle,
                styles.glow,
                {
                  backgroundColor: painColor(value),
                  borderRadius: SQ_RADIUS,
                  shadowColor: painColor(value),
                },
              ]}
            >
              <DaySquare entry={null} value={value} size={SQUARE} radius={SQ_RADIUS} />
            </Animated.View>

            <View style={styles.heroText}>
              <View style={styles.scoreRow}>
                <Text style={styles.score} allowFontScaling maxFontSizeMultiplier={1.3}>
                  {formatScore(value)}
                </Text>
                <View style={[styles.scoreDot, { backgroundColor: painColor(value) }]} />
                <Text
                  style={styles.scoreWord}
                  numberOfLines={2}
                  allowFontScaling maxFontSizeMultiplier={1.3}
                >
                  {painLabel(value)}
                </Text>
              </View>
            </View>
          </View>

          {/* everything else this check-in recorded, under the hero at
              the card's full width rather than squeezed beside the
              square — a list of five areas needs the room, and the
              number above still wins by size */}
          {details.length > 0 && (
            <View style={styles.details}>
              {details.map((row) => (
                <View key={row.label} style={styles.detailRow}>
                  <Text style={styles.detailLabel} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {row.label}
                  </Text>
                  <View style={styles.detailBody}>
                    {row.chips.length > 0 && (
                      <View style={styles.tags}>
                        {row.chips.map((tag) => (
                          <View key={tag} style={styles.tag}>
                            <Text
                              style={styles.tagText} numberOfLines={1}
                              allowFontScaling maxFontSizeMultiplier={1.2}
                            >
                              {tag}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                    {!!row.quote && (
                      <Text style={styles.detailQuote} allowFontScaling maxFontSizeMultiplier={1.3}>
                        “{row.quote}”
                      </Text>
                    )}
                    {/* a skip or a "nothing fit" is an answer, written as
                        one — in the quiet colour, because it is a fact
                        about the question and not a value */}
                    {!!row.state && (
                      <Text style={styles.detailState} allowFontScaling maxFontSizeMultiplier={1.3}>
                        {row.state}
                      </Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* the day's note, or the way to start one. Its own press
              inside the card's: the inner responder wins, so this row
              opens the day ON the note and the rest of the card opens
              the day as before. */}
          <View style={styles.rule} />
          <Press
            onPress={onAddNote}
            pressOpacity={0.7}
            style={styles.foot}
            accessibilityRole="button"
            accessibilityLabel={note ? 'Your note: ' + note : 'Add a note about today'}
            accessibilityHint={note ? 'Opens the note to edit' : 'Opens today with the note ready to write'}
          >
            {note ? (
              <>
                <Text
                  style={styles.noteLine} numberOfLines={1}
                  allowFontScaling maxFontSizeMultiplier={1.3}
                >
                  “{note}”
                </Text>
                <Text style={styles.footLink} allowFontScaling maxFontSizeMultiplier={1.3}>
                  Edit
                </Text>
              </>
            ) : (
              <Text style={styles.footLink} allowFontScaling maxFontSizeMultiplier={1.3}>
                Add a note about today
              </Text>
            )}
          </Press>
        </Press>
      ) : (
        /* Nothing yet today. One card, one thing to do — and it says what
           it is waiting for rather than reporting a zero, because a zero
           on this scale is a real answer and today has not given one. */
        <Press
          onPress={onLog}
          pressScale={0.985}
          pressOpacity={0.92}
          style={styles.card}
          accessibilityRole="button"
          accessibilityLabel="No check-ins yet today. Check in."
          accessibilityHint="Records how your pain is right now"
        >
          <View style={styles.head}>
            <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
              Today
            </Text>
          </View>
          <View style={styles.hero}>
            <Animated.View style={breathStyle}>
              <DaySquare entry={null} value={null} size={SQUARE} radius={SQ_RADIUS} plus today />
            </Animated.View>
            <View style={styles.heroText}>
              <Text style={styles.emptyTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
                No check-ins yet today
              </Text>
              <Text style={styles.emptySub} allowFontScaling maxFontSizeMultiplier={1.4}>
                A check-in takes about ten seconds, and the record is only ever
                what you put in it.
              </Text>
            </View>
          </View>
        </Press>
      )}
      </>
    ),
    chart: (
      <>
      {/* ── the day so far ──────────────────────────────────
          From the SECOND check-in. With one, this card was the card
          above it drawn again as a single dot, and a chart of one point
          has no shape to show. It appears when there is a day to look
          at, which is also when the sentence over it has something to
          say. */}
      {logs.length > 1 && (
        <Press
          onPress={onOpenToday}
          pressScale={0.985}
          pressOpacity={0.92}
          style={[styles.card, styles.cardGap]}
          accessibilityRole="button"
          accessibilityLabel={'Today so far, ' + formatCheckins(count, true)
            + (shape ? '. ' + shape : '')}
          accessibilityHint="Opens pain through the day"
        >
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            Today so far
          </Text>

          {/* The reading sits ABOVE the drawing on its own line rather than
              beside it. Sharing the row cost the chart nearly half the card
              — three check-ins in an afternoon became four dots in a thumb's
              width, which is a decoration, not a drawing. It is the same
              spec as the sentence Trends puts over its own chart. */}
          {!!shape && (
            <Text
              style={styles.reading} numberOfLines={2}
              allowFontScaling maxFontSizeMultiplier={1.3}
            >
              {shape}
            </Text>
          )}

          {/* the scale and the times, on the small chart too. Without them
              a cluster of dots in the middle of the card cannot be read at
              all — which is the whole complaint a bare sparkline earns. */}
          <View style={styles.spark}>
            <DayLine logs={logs} height={SPARK_H} grid axis highlightH={latest ? latest.h : undefined} />
          </View>

          {/* what the drawing is NOT, inside the card it qualifies —
              folded behind the (i), still in the card */}
          <InfoTip
            label="About this chart"
            text="Each dot is a check-in, at the hour you made it; the ringed one is the latest. One day is not a trend, and nothing here is being compared to another day."
          />

          <View style={styles.rule} />
          <View style={styles.foot}>
            <Text style={styles.footCount} allowFontScaling maxFontSizeMultiplier={1.3}>
              {formatCheckins(count, true)}
            </Text>
            <Text style={styles.footLink} allowFontScaling maxFontSizeMultiplier={1.3}>
              View details
            </Text>
          </View>
        </Press>
      )}
      </>
    ),
    insight: (
      <>
      {insight && <View style={styles.card}>
        <Text style={styles.eyebrow}>From your record</Text>
        <Text style={styles.insightTitle}>{insight.title}</Text>
        <Text style={styles.bgOfferBody}>{insight.body}</Text>
        <Text style={styles.bgOfferBody}>{insight.context}</Text>
        <Text style={styles.insightCaveat}>{insight.caveat}</Text>
        <Press onPress={onOpenRecord} accessibilityRole="button" accessibilityLabel={insight.action}
          style={styles.insightAction}>
          <Text style={styles.insightLink}>{insight.action} ›</Text>
        </Press>
      </View>}
      </>
    ),
    activityOffer: (
      <>
      {offer === 'activity' && <View style={styles.activityWrap}>
        <ActivityIntention value={activity} onChange={onActivityChange} initiallyEditing />
      </View>}
      </>
    ),
    lastNight: (
      <>
      {/* ── last night, from Health ────────────────────────── */}
      {!!lastNight && (
        <Text style={styles.lastNight} allowFontScaling maxFontSizeMultiplier={1.4}
          accessibilityLabel={'From Apple Health: ' + lastNight}>
          {lastNight}
        </Text>
      )}
      </>
    ),
    appt: (
      <>
      {/* the event capture used to be a button here. It lives in the
          check-in now — a flare happens on the same occasion as the
          number — and on the day screen, where events are read back.
          Today keeps to the two cards and one offer. */}

      {/* ── the appointment, when one is near ──────────────
          THE ONE MOMENT WITH EXTERNAL STAKES. Two days before the date
          the person gave, the summary is offered here — the record is
          ready when it matters and there is time to read it. A fact
          card, not an offer: it shows regardless of the offers below,
          and clears itself the day after. */}
      {apptSoon && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            {appointment === t ? 'Your appointment is today' : 'Your appointment is on ' + fmtDay(appointment)}
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            Your summary of the last three months is ready whenever you want
            it — the numbers, your background, and what they do and don’t mean.
          </Text>
          <View style={styles.bgOfferActions}>
            <Press
              onPress={() => { track('appointment_pdf'); onShare(); }}
              pressOpacity={0.8}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Create the PDF for your appointment"
            >
              <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                Create the PDF
              </Text>
            </Press>
            <Press
              onPress={onOpenAppointment}
              pressOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Change the appointment date"
            >
              <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                Change date
              </Text>
            </Press>
          </View>
        </View>
      )}
      </>
    ),
    ahead: (
      <>
      {/* ── what is booked, against the line ──────────────
          THE EVENING BEFORE. A session in the calendar, later today
          or tomorrow, longer than the person's own line — the one
          decision the record can actually reach in time. A fact
          card like the appointment: it shows regardless of the
          offers below, and it changes only when the calendar or the
          record does. The single action opens Apple's editor on the
          event; Pattern itself never writes (calendar.ts). The title
          is the person's own calendar read back to them, in the app,
          and goes nowhere else. */}
      {ahead && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            {(ahead.when === 'today' ? 'Today at ' : 'Tomorrow at ') + fmtClock(ahead.event.h)
              + ': ' + ahead.event.title + ', ' + ahead.event.minutes + ' min'}
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            {aheadBody(ahead)}
          </Text>
          <View style={styles.bgOfferActions}>
            {aheadEditable && !!ahead.event.id && (
              <Press
                onPress={onOpenAhead}
                pressOpacity={0.8}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Open this event in Calendar"
                accessibilityHint="Opens Apple's event editor. Nothing changes unless you save."
              >
                <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                  Open in Calendar
                </Text>
              </Press>
            )}
            <Press
              onPress={onDismissAhead}
              pressOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Leave this session as it is"
            >
              <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                Fine as it is
              </Text>
            </Press>
          </View>
        </View>
      )}
      </>
    ),
    experiment: (
      <>
      {/* ── the experiment: the countdown, or the answer ────
          THE ONE THING ON TODAY THAT COUNTS TOWARD SOMETHING, and
          what it counts toward is an answer: day N of fourteen, the
          days each way so far, and at the end the sentence. It moves
          only when a day is added — no streak, no reset, a missed
          evening is a missing pair and nothing else. A fact card,
          above the offers, because a person who started one wants to
          see where it stands before anything is asked of them. */}
      {experiment && xCopy && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            {experiment.ended ? 'Your experiment, answered' : 'Your experiment'}
          </Text>
          <Text style={styles.xTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
            {xCopy.title}
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            {xCopy.evidence}
          </Text>
          {!!xCopy.caveat && (
            <Text style={styles.xCaveat} allowFontScaling maxFontSizeMultiplier={1.4}>
              {xCopy.caveat}
            </Text>
          )}
          <View style={styles.bgOfferActions}>
            {experiment.ended ? (
              <>
                <Press
                  onPress={() => { onEndExperiment('done'); onStartExperiment(); }}
                  pressOpacity={0.8}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="File this result and try something else"
                >
                  <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                    Try something else
                  </Text>
                </Press>
                <Press
                  onPress={() => onEndExperiment('done')}
                  pressOpacity={0.7}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="File this result"
                >
                  <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                    Done
                  </Text>
                </Press>
              </>
            ) : (
              <Press
                onPress={() => {
                  Alert.alert(
                    'Stop this experiment?',
                    'The evenings you answered stay on their days. It will be read with what it has.',
                    [
                      { text: 'Keep going', style: 'cancel' },
                      { text: 'Stop', style: 'destructive', onPress: () => onEndExperiment('stopped') },
                    ]
                  );
                }}
                pressOpacity={0.7}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Stop this experiment early"
              >
                <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                  Stop early
                </Text>
              </Press>
            )}
          </View>
        </View>
      )}
      </>
    ),
  };
  /* read at render, like the diagnosis: the switch in Profile writes it
     and Today re-renders when Profile closes */
  const layered = db.getPref<boolean>(PREF_TODAY_LAYERED, false);
  const tiles = layered ? contextTiles(healthDays[t], healthDays) : [];

  return (
    <View>
      {layered ? (
        <>
          {blocks.hero}
          <ContextTiles tiles={tiles} />
          {blocks.ahead}
          {blocks.appt}
          {blocks.experiment}
          {blocks.activity}
          {blocks.activityOffer}
          {blocks.insight}
        </>
      ) : (
        <>
          {blocks.activity}
          {blocks.hero}
          {blocks.chart}
          {blocks.insight}
          {blocks.activityOffer}
          {blocks.lastNight}
          {blocks.appt}
          {blocks.ahead}
          {blocks.experiment}
        </>
      )}

      {/* ── the experiment offer ──────────────────────────── */}
      {offer === 'experiment' && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            Try something for two weeks
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            An early night, a walk on the days you would skip — one thing,
            in your words. Each evening Pattern asks whether it happened,
            and at the end it tells you what the mornings after said.
          </Text>
          <View style={styles.bgOfferActions}>
            <Press
              onPress={onStartExperiment}
              pressOpacity={0.8}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Choose something to try"
            >
              <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                Choose
              </Text>
            </Press>
            <Press
              onPress={dismissExperiment}
              pressOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Not now — offered again in two weeks"
            >
              <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                Not now
              </Text>
            </Press>
          </View>
        </View>
      )}

      {/* ── the reminder offer ────────────────────────────── */}
      {offer === 'reminder' && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            Want a daily reminder?
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            Checking in around the same time makes your record more useful.
            It stays quiet on a day you have already checked in around then,
            and it never mentions a missed day.
          </Text>
          <View style={styles.bgOfferActions}>
            <Press
              onPress={takeReminder}
              pressOpacity={0.8}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={'Remind me at ' + eveningAt}
            >
              <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                Remind me at {eveningAt}
              </Text>
            </Press>
            <Press
              onPress={() => { dismissReminder(); onOpenReminders(); }}
              pressOpacity={0.8}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Choose another time"
            >
              <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                Another time
              </Text>
            </Press>
            <Press
              onPress={dismissReminder}
              pressOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Not now — reminders stay in Profile"
            >
              <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                Not now
              </Text>
            </Press>
          </View>
        </View>
      )}

      {/* ── Apple Health, offered once ────────────────────── */}
      {offer === 'health' && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            Some of this can arrive on its own
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            Connect Apple Health, and last night’s sleep and today’s activity
            sit beside your check-ins without being asked for. You choose what
            Pattern can read, nothing is written back, and it stays on this
            iPhone.
          </Text>
          <View style={styles.bgOfferActions}>
            <Press
              onPress={() => { dismissHealth(); onOpenHealth(); }}
              pressOpacity={0.8}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Connect Apple Health"
            >
              <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                Connect Apple Health
              </Text>
            </Press>
            <Press
              onPress={dismissHealth}
              pressOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Not now — Apple Health stays in Profile"
            >
              <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                Not now
              </Text>
            </Press>
          </View>
        </View>
      )}

      {/* ── the appointment ask ───────────────────────────── */}
      {offer === 'appointment' && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            Got an appointment coming up?
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            Tell Pattern the date and it will offer your summary two days
            before, so the record is ready when it matters. Nothing else is
            done with the date.
          </Text>
          <View style={styles.bgOfferActions}>
            <Press
              onPress={onOpenAppointment}
              pressOpacity={0.8}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Pick the appointment date"
            >
              <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                Pick a date
              </Text>
            </Press>
            <Press
              onPress={dismissAppointment}
              pressOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Not now — the date can be set in Profile"
            >
              <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                Not now
              </Text>
            </Press>
          </View>
        </View>
      )}

      {/* ── the widget, mentioned once ────────────────────── */}
      {offer === 'widget' && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            Check in from your lock screen
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            Pattern has a lock-screen widget that opens straight to the pain
            question, and a home-screen one that shows your week. Hold the
            lock screen, tap Customise, then add Pattern.
          </Text>
          <View style={styles.bgOfferActions}>
            <View />
            <Press
              onPress={() => { db.setPref('widget.offer.dismissed', true); setWidgetDismissed(true); }}
              pressOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                Got it
              </Text>
            </Press>
          </View>
        </View>
      )}

      {/* ── the copy: this phone is the only place it lives ──
          Plain about the failure it prevents, because the failure is
          silent: nothing warns you, and you find out on the reinstall.
          No number about the pain, only a count of days at risk. */}
      {offer === 'copy' && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            A reinstall would start this record over
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            {(lastCopy
              ? unsaved + (unsaved === 1 ? ' day was added' : ' days were added') + ' after your last saved copy.'
              : unsaved + (unsaved === 1 ? ' day has' : ' days have') + ' never been saved anywhere else.')
              + ' Your iPhone’s backup brings your record to a new phone, but not back into a'
              + ' reinstall on this one — delete Pattern and these go with it. A copy you keep'
              + ' in Files does not.'}
          </Text>
          <View style={styles.bgOfferActions}>
            <Press
              onPress={() => { track('copy_offer_taken'); onSaveCopy(); }}
              pressOpacity={0.8}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Save a copy of your record"
              accessibilityHint="Opens the share sheet with a backup file. Choose Save to Files to keep it outside the app."
            >
              <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                Save a copy
              </Text>
            </Press>
            <Press
              onPress={dismissCopy}
              pressOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                Not now
              </Text>
            </Press>
          </View>
        </View>
      )}

      {/* ── the diagnosis, asked once of a phone that predates it ── */}
      {offer === 'diagnosis' && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            Do you have a diagnosis?
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            One tap. It leads the first page of your clinician summary and
            decides what Pattern offers you first — a clearer picture for
            your doctor, or what helps you stay active. Nothing here is
            analysed or sent.
          </Text>
          <View style={styles.bgOfferActions}>
            <Press
              onPress={onOpenDiagnosis}
              pressOpacity={0.8}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Answer the diagnosis question"
            >
              <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                Answer
              </Text>
            </Press>
            <Press
              onPress={dismissDiagnosis}
              pressOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Not now — the question stays in Profile"
            >
              <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                Not now
              </Text>
            </Press>
          </View>
        </View>
      )}

      {/* ── the background offer ──────────────────────────── */}
      {offer === 'background' && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            {path === 'seek' ? 'A clearer picture for your doctor' : 'Give Pattern some background'}
          </Text>
          {/* the same sheet, introduced by what it is for THIS person:
              to someone still seeking a name, the onset, what has been
              tried and the family history are the appointment; to
              everyone else they are page one of a summary */}
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            {path === 'seek'
              ? 'How it began, what has been tried, what runs in the family — what a '
                + 'doctor asks first. Optional, about five minutes, in your own words; it '
                + 'becomes the first page of the summary you bring to the appointment.'
              : 'Optional, about five minutes, in your own words. It becomes the '
                + 'first page of the summary you share with a clinician — nothing in '
                + 'it is analysed or compared.'}
          </Text>
          <View style={styles.bgOfferActions}>
            <Press
              onPress={onOpenBackground}
              pressOpacity={0.8}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Add my background"
            >
              <Text style={styles.bgOfferGo} allowFontScaling maxFontSizeMultiplier={1.3}>
                Add my background
              </Text>
            </Press>
            <Press
              onPress={() => { db.setPref('background.offer.dismissed', true); setBgDismissed(true); }}
              pressOpacity={0.7}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Maybe later — the sheet stays in Profile"
            >
              <Text style={styles.bgOfferLater} allowFontScaling maxFontSizeMultiplier={1.3}>
                Maybe later
              </Text>
            </Press>
          </View>
        </View>
      )}

    </View>
  );
}

/**
 * The card grammar is Trends', to the pixel: the same surface, the same
 * 16pt padding, the same type sizes doing the same jobs. A figure is
 * title3, a label is footnote, a sentence is subheadline, fine print is
 * footnote — and nothing on this screen is allowed a size that no other
 * card in the app uses. The first draft of this screen was drawn from a
 * mockup rather than from the app, and it arrived a step and a half
 * larger than everything it sits next to; a design system that only one
 * screen obeys is not one.
 *
 * The single exception is the hero number, at title2. It is one step
 * above a Trends figure and one step below the screen's own title, which
 * is exactly the room a focal value needs and no more.
 */
/** what went with the number: up to three neutral tiles from Health.
 *  Nothing when Health has nothing — never a zero, never an empty ring.
 *  The remark under a value compares the factor to the person's own
 *  usual and never touches the pain above it. */
function ContextTiles({ tiles }: { tiles: ContextTile[] }) {
  if (!tiles.length) return null;
  return (
    <View style={styles.tiles} accessible accessibilityRole="summary"
      accessibilityLabel={'From Apple Health: ' + tiles.map((x) => x.label + ' ' + x.value + (x.sub ? ', ' + x.sub : '')).join('. ')}>
      {tiles.map((x) => (
        <View key={x.key} style={styles.tile}>
          <Text style={styles.tileK} allowFontScaling maxFontSizeMultiplier={1.3}>{x.label}</Text>
          <Text style={styles.tileV} allowFontScaling maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{x.value}</Text>
          {!!x.sub && (
            <Text style={styles.tileS} allowFontScaling maxFontSizeMultiplier={1.3} numberOfLines={2}>{x.sub}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  activityWrap: { marginHorizontal: size.pageX, marginTop: 14 },
  insightTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', marginTop: 8 },
  insightCaveat: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 19, marginTop: 10 },
  insightAction: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  insightLink: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  card: {
    marginHorizontal: size.pageX, marginTop: 14,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    padding: 16,
  },
  cardGap: { marginTop: 14 },
  /* the context tiles: neutral surfaces, white numbers, no fills */
  tiles: { flexDirection: 'row', gap: 8, marginTop: 10, marginHorizontal: size.pageX },
  tile: {
    flex: 1, borderRadius: 14, borderCurve: 'continuous', padding: 10,
    backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
  },
  tileK: { color: color.textSecondary, fontSize: font.footnote },
  tileV: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.3, marginTop: 2, fontVariant: ['tabular-nums'],
  },
  tileS: { color: color.textTertiary, fontSize: 11, lineHeight: 14, marginTop: 1 },
  /* a line, not a card: it is context beside the record, at the page's
     reading edge, in the quiet colour — and it never wears the ramp */
  lastNight: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 18,
    marginTop: 10, marginHorizontal: size.contentX,
  },
  bgOfferBody: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 8,
  },
  bgOfferActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: 12, marginTop: 14,
  },
  bgOfferGo: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  bgOfferLater: { color: color.textTertiary, fontSize: font.subheadline, fontWeight: '500' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headTime: {
    color: color.textSecondary, fontSize: font.subheadline,
    fontVariant: ['tabular-nums'],
  },
  chev: { color: color.textTertiary, fontSize: 18, marginTop: -2 },
  eyebrow: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '600' },
  /* the experiment's sentence: the card's point, above its evidence */
  xTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 22 },
  xCaveat: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18 },

  hero: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 14 },
  /* iOS shadow: no offset, so the colour sits evenly around the shape
     rather than pooling under it. Android is not a target yet. */
  glow: {
    borderCurve: 'continuous',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 14,
  },
  heroText: { flex: 1 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  score: {
    color: color.textPrimary, fontSize: font.title2, fontWeight: '700',
    letterSpacing: -0.4, fontVariant: ['tabular-nums'],
  },
  scoreDot: { width: 7, height: 7, borderRadius: 3.5 },
  scoreWord: {
    flex: 1, color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.2,
  },
  details: { marginTop: 14, gap: 10 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  /* a fixed label column, so the two rows' answers start on one line */
  detailLabel: {
    width: 72, paddingTop: 4,
    color: color.textTertiary, fontSize: font.footnote, fontWeight: '600',
  },
  detailBody: { flex: 1, gap: 6 },
  detailQuote: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 20 },
  detailState: { color: color.textTertiary, fontSize: font.subheadline, paddingTop: 4 },
  noteLine: { flex: 1, color: color.textSecondary, fontSize: font.subheadline, marginRight: 12 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    borderRadius: 8, borderCurve: 'continuous', backgroundColor: color.bgSegmentTrack,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  tagText: { color: color.textSecondary, fontSize: font.footnote },

  emptyTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  emptySub: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21 },

  spark: { marginTop: 14 },
  /* the reading, in the app's own words rather than an arrow or a
     percentage — white, because it is a sentence about pain and not a
     pain value, and at the size Trends gives the same job */
  reading: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.2, marginTop: 8,
  },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 16 },
  rule: {
    height: StyleSheet.hairlineWidth, backgroundColor: color.borderDivider, marginTop: 14,
  },
  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 38,
  },
  footCount: { color: color.textSecondary, fontSize: font.subheadline },
  footLink: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
});
