/** Today offers a check-in, the latest recorded moment and one useful
 *  observation. Details and charts stay one tap away in the record. */
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import ActivityIntention from './ActivityIntention';
import { TodayInsight } from './todayInsight';
import InfoTip from './InfoTip';
import { Press } from './motion';
import { track } from './analytics';
import {
  Entries, LastCopy, addDays, checkinCount,
  copyOfferDue, diagnosisPath, legacyDayValue, logsOf, todayISO, unsavedDays,
} from './model';
import { fmtDay } from './DayScreen';
import { fmtClock } from './clock';
import * as db from './db';
import { anyReminderOn, enableEveningReminder, savedSlots } from './reminderSchedule';
import { lastNightLine } from './health/context';
import { sleepBasis } from './health/windows';
import { IN_BED_NOTE } from './health/engine';
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
  formatScore, speakScore,
} from './painScale';
import { color, font, radius, size } from './theme';

export interface HomeScreenProps {
  entries: Entries;
  activity: string | null;
  onActivityChange: (value: string) => void;
  insight: TodayInsight | null;
  onOpenRecord: () => void;
  onLog: () => void;
  /** the day detail — where editing, deleting and events live */
  onOpenDay: (dateIso: string) => void;
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
  entries, activity, onActivityChange, insight, onOpenRecord, onLog, onOpenDay,
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
  const lastDate = Object.keys(entries).filter(d => d <= t && checkinCount(entries[d]) > 0).sort().pop();
  const lastEntry = lastDate ? entries[lastDate] : null;
  const latest = logsOf(lastEntry).slice().sort((a, b) => b.h - a.h)[0];
  const value = latest ? latest.pain : legacyDayValue(lastEntry);
  const when = lastDate ? (lastDate === t ? 'Today' : fmtDay(lastDate))
    + (latest ? ' · ' + fmtClock(latest.h) : ' · day record') : '';

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

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.xTitle}>How is your pain right now?</Text>
        <Text style={styles.bgOfferBody}>Pain is the only required answer. Everything else is optional.</Text>
        <Press onPress={onLog} accessibilityRole="button" accessibilityLabel="Check in"
          style={styles.checkIn}>
          <Text style={styles.checkInText}>Check in</Text>
        </Press>
      </View>
      {value != null && lastDate && <Press onPress={() => onOpenDay(lastDate)}
        style={[styles.card, styles.latestRow]} accessibilityRole="button"
        accessibilityLabel={'Last check-in. ' + when + '. ' + speakScore(value)}
        accessibilityHint="Opens the recorded day and its details">
        <View style={styles.latestText}>
          <Text style={styles.eyebrow}>Last check-in</Text>
          <Text style={styles.bgOfferBody}>{when}</Text>
        </View>
        <Text style={styles.latestValue}>{formatScore(value)}/10</Text>
        <Text style={styles.chev}>›</Text>
      </Press>}
      {insight && <View style={styles.card}>
        <Text style={styles.eyebrow}>From your record</Text>
        <Text style={styles.insightTitle}>{insight.body}</Text>
        <Text style={styles.insightCaveat}>{insight.caveat}
          {insight.id === 'sleepVsMorning' && sleepBasis(healthDays) === 'inBed' ? ' ' + IN_BED_NOTE : ''}
        </Text>
        <Press onPress={onOpenRecord} accessibilityRole="button" accessibilityLabel="See why"
          style={styles.insightAction}>
          <Text style={styles.insightLink}>See why ›</Text>
        </Press>
      </View>}
      {!!activity && <View style={styles.activityWrap}>
        <ActivityIntention value={activity} onChange={onActivityChange} compact />
      </View>}

      {offer === 'activity' && <View style={styles.activityWrap}>
        <ActivityIntention value={activity} onChange={onActivityChange} initiallyEditing />
      </View>}

      {/* ── last night, from Health ────────────────────────── */}
      {!!lastNight && !insight && (
        <Text style={styles.lastNight} allowFontScaling maxFontSizeMultiplier={1.4}
          accessibilityLabel={'From Apple Health: ' + lastNight}>
          {lastNight}
        </Text>
      )}

      {/* the event capture used to be a button here. It lives in the
          check-in now — a flare happens on the same occasion as the
          number — and on the day screen, where events are read back.
          Today keeps one offer at a time. */}

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

const styles = StyleSheet.create({
  checkIn: { backgroundColor: '#ffffff', borderRadius: radius.button, minHeight: 48,
    alignItems: 'center', justifyContent: 'center', marginTop: 16, padding: 12 },
  checkInText: { color: '#111111', fontSize: font.body, fontWeight: '600' },
  latestRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  latestText: { flex: 1 },
  latestValue: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  activityWrap: { marginHorizontal: size.pageX, marginTop: 14 },
  insightTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 24, marginTop: 8 },
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
  chev: { color: color.textTertiary, fontSize: 18, marginTop: -2 },
  eyebrow: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '600' },
  /* the experiment's sentence: the card's point, above its evidence */
  xTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 22 },
  xCaveat: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18 },

});
