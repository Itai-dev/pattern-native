/**
 * The Today tab: what you last recorded, what the day looks like so far,
 * and the one action that matters. The record lives in Trends, the month
 * on the Map, the day itself one tap away — act here, look there.
 *
 * TWO CARDS, AND EACH ANSWERS ONE QUESTION. "Today" answers "what did I
 * last say, and when" — the thing a person opening this app at four in
 * the afternoon actually wants and previously had to work out from a
 * daily average and a list. It says all of it: every area, every
 * quality word, the where in their own words, and a skip shown as the
 * answer it is. It was titled "Last check-in" until 17 Sep 2026, and
 * the title lied about the tap: the card opens the WHOLE day, so it is
 * named for the day and the time of the latest check-in sits beside the
 * name as a fact. "Today so far" answers "what has the day done", in the
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
 * ONE TODAY (28 Sep 2026). There were two orders of this screen behind a
 * Profile switch, and three cards at the top reading the same workouts
 * against the same next mornings. It is one order now — the goal and
 * today's suggestion as one card (RecoveryCards.tsx), then the check-in,
 * then what went with it from Health, then what is ahead — and the
 * day-so-far chart lives on the day page, where the day is the subject.
 * Setting the goal is onboarding's job, or one offer here for a phone
 * that predates it; this screen never opens on a form.
 *
 * WHAT HELPS LEADS (1 Oct 2026). The activity card at the top became
 * one row of a wider card: what helps, what makes it worse (helps.ts,
 * HelpsCard.tsx) — the experiment running now with tonight's question
 * inline, then what the record found about Health, doses, tiredness
 * and activity, by which way the days went. The goal is still asked in
 * onboarding and kept in Profile; its conclusion is the activity row.
 * Below it, a medicine card only while a dose is due. Then the
 * check-in card, as before.
 *
 * TWO CARDS, AND LITTLE ELSE (30 Sep 2026). The screen had grown to
 * nine things at once: the two cards, Health tiles, every detail of the
 * check-in, a "from your record" finding, an experiment, and one of nine
 * rotating offers. It is the activity card and the check-in card now.
 * The check-in card says the number and the time; what else was said
 * is on the day page it opens. The Health tiles live on that page too,
 * and findings live on Patterns. Only two things may join them, and
 * only when a date makes them urgent: a booked session past the line,
 * and the appointment summary in the two days before. Plus at most one
 * of four offers (TODAY_OFFER_ORDER).
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
import DaySquare from './DaySquare';
import { Press, useReduceMotion } from './motion';
import { track } from './analytics';
import {
  Entries, LastCopy, addDays, checkinCount,
  copyOfferDue, legacyDayValue, logsOf, todayISO, unsavedDays,
} from './model';
import { fmtDay } from './DayScreen';
import { fmtClock } from './clock';
import * as db from './db';
import { anyReminderOn, enableEveningReminder, savedSlots } from './reminderSchedule';
import { HealthDay } from './health/types';
import { BookedAhead, aheadBody } from './health/ahead';
import { RecoveryGoal } from './recovery';
import { GoalSetup, makeGoal, skippedGoal } from './RecoveryCards';
import { DoseCard, ExperimentAsk, HelpsCard } from './HelpsCard';
import { HelpsView } from './helps';
import { DueDose, Medication } from './meds';
import {
  APPOINTMENT_LEAD_DAYS, COPY_NUDGE_DAYS, GOAL_OFFER_AFTER_DAYS, HEALTH_OFFER_AFTER_DAYS,
  TODAY_OFFER_ORDER, TodayOffer,
} from './thresholds';

/* ── when Today may ask for something ────────────────────────
   Four offers live on this screen, and at most ONE shows at a time:
   a screen that asks for three things is a form. Each is shown once,
   on either answer, forever — except the copy, which is the one thing
   here that protects the record rather than adding to it, and so
   returns after another week of days it does not cover.

   The reminder comes first and right after the first check-in — the
   moment it explains itself, and the strongest habit lever the app
   has. The copy comes next, ahead of everything optional: a record
   worth adding to is a record worth not losing. */
import {
  formatScore, painColor, painLabel, speakScore,
} from './painScale';
import { color, font, radius, size } from './theme';

/** the square on the last-check-in card. Big enough to be the first thing
 *  the eye lands on, small enough that the number beside it still wins —
 *  and sized against the type around it, which is Trends' type. */
const SQUARE = 58, SQ_RADIUS = 15;

export interface HomeScreenProps {
  entries: Entries;
  /** the goal Today reads — recovery.ts currentGoal, so an old free-text
   *  intention counts; null = never asked */
  goal: RecoveryGoal | null;
  /** saved through App, which keeps the report's text in step */
  onGoalChange: (g: RecoveryGoal) => void;
  onLog: () => void;
  /** the day detail — where editing, deleting and events live */
  onOpenDay: (dateIso: string) => void;
  /** the Add information sheet, for today: where it hurts, how it
   *  feels, what else is going on, the evening's questions and the
   *  note — everything the check-in no longer asks, offered where the
   *  number already is */
  onAddInfo: () => void;
  /** the appointment date picker, in Profile */
  onOpenAppointment: () => void;
  /** the PDF, from the appointment card */
  onShare: () => void;
  /** the next appointment as an ISO date, or '' — owned by App */
  appointment: string;
  /** the stored Health days, which the activity card reads */
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
  /** the backup export — the share sheet, and the record marked copied
   *  only if the sheet closed with the file handed somewhere */
  onSaveCopy: () => void;
  /** the last saved copy, owned by App so the card clears the moment one
   *  is made — null when there has never been one */
  lastCopy: LastCopy | null;
  /** the lead card's contents, read in App from every source (helps.ts) */
  helps: HelpsView;
  /** tonight's experiment question, when due and unanswered */
  experimentAsk: ExperimentAsk | null;
  onAnswerExperiment: (id: string) => void;
  onStartExperiment: () => void;
  onEndExperiment: (how: 'done' | 'stopped') => void;
  /** medicine times due now and unanswered, and the as-needed ones */
  dueDoses: DueDose[];
  asNeeded: Medication[];
  onMarkDose: (med: Medication, slot: number, status: 'taken' | 'skipped') => void;
}

export default function HomeScreen({
  entries, goal, onGoalChange, onLog, onOpenDay, onAddInfo,
  onOpenReminders, healthOfferable, onOpenHealth,
  onOpenAppointment, onShare, appointment, healthDays,
  ahead, aheadEditable, onOpenAhead, onDismissAhead,
  onSaveCopy, lastCopy,
  helps, experimentAsk, onAnswerExperiment, onStartExperiment, onEndExperiment,
  dueDoses, asNeeded, onMarkDose,
}: HomeScreenProps) {
  const t = todayISO();
  const entry = entries[t] || null;
  /* newest first: this screen leads with the latest thing said */
  const logs = logsOf(entry).slice().sort((a, b) => b.h - a.h);
  const latest = logs[0] || null;
  /* A day carrying a value with no timestamped moments behind it — a
     legacy record, or one restored from an old backup. It is still an
     answer this person gave, so the card shows it; what it cannot show is
     a time, because there never was one. Without this branch a restored
     day reads as "no check-ins yet today" over a day that has one. */
  const dayOnly = !latest ? legacyDayValue(entry) : null;
  const value = latest ? latest.pain : dayOnly;

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

  const loggedDays = Object.values(entries).filter(e => checkinCount(e) > 0).length;

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

  /* The appointment summary, in the two days before a date the person
     gave in Profile. The date arrives as a prop: App owns it and clears
     it the day after it passes. */
  const apptSoon = !!appointment && appointment >= t
    && appointment <= addDays(t, APPOINTMENT_LEAD_DAYS);

  /* THE GOAL, FIRST (recovery.ts). Today answers "what am I getting
     back to, how is my body responding, what next" before it shows the
     last pain number — pain is one signal inside the response, not the
     subject. The goal arrives as a prop and is saved through App. */
  const [editingGoal, setEditingGoal] = useState(false);
  const saveGoal = (g: RecoveryGoal) => { onGoalChange(g); setEditingGoal(false); };
  const goalSet = !!goal && !!goal.activity;

  const due: Record<TodayOffer, boolean> = {
    /* only a phone that was never asked: onboarding asks now, and a
       skip there or here is stored */
    goal: goal === null && loggedDays >= GOAL_OFFER_AFTER_DAYS,
    reminder: offerReminder, copy: offerCopy, health: offerHealth,
  };
  const offer: TodayOffer | null = TODAY_OFFER_ORDER.filter((o) => due[o])[0] || null;

  /* ── ONE ORDER, TOP TO BOTTOM: the goal and today's suggestion, then
     the last check-in, then a card only when a date makes it urgent (a
     booked session, the appointment). Nothing in it rates today. */
  const blocks = {
    activity: editingGoal ? (
      <GoalSetup
        initial={goal}
        onSave={(a, other, weekly) => saveGoal(makeGoal(a, other, weekly, t))}
        onCancel={() => setEditingGoal(false)}
        onRemove={goalSet ? () => saveGoal(skippedGoal(t)) : undefined}
      />
    ) : (
      <>
        <HelpsCard view={helps} ask={experimentAsk} onAnswer={onAnswerExperiment}
          onStart={onStartExperiment} onEnd={onEndExperiment} />
        <DoseCard due={dueDoses} asNeeded={asNeeded} onMark={onMarkDose} />
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
          accessibilityLabel={'Today, ' + speakScore(value)
            + (latest ? ', last check-in ' + fmtClock(latest.h) : '')}
          accessibilityHint="Opens the day’s detail, where you can edit or remove it"
        >
          <View style={styles.head}>
            <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
              Today
            </Text>
            <View style={styles.headRight}>
              {/* the latest check-in's time, as a fact beside the name
                  rather than as the name — the tap opens the day */}
              {!!latest && (
                <Text style={styles.headTime} allowFontScaling maxFontSizeMultiplier={1.3}>
                  Last check-in {fmtClock(latest.h)}
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

          {/* the door to everything the check-in no longer asks — where,
              how it feels, what else, the evening's questions, the note.
              Its own press inside the card's: the inner responder wins,
              so this row opens the sheet and the rest of the card opens
              the day as before. It used to say "Add a note about today"
              and open the note alone. */}
          <View style={styles.rule} />
          <Press
            onPress={onAddInfo}
            pressOpacity={0.7}
            style={styles.foot}
            accessibilityRole="button"
            accessibilityLabel="Add information"
            accessibilityHint="Opens a sheet: where it hurts, how it feels, and a note"
          >
            <Text style={styles.footLink} allowFontScaling maxFontSizeMultiplier={1.3}>
              Add information ›
            </Text>
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
  };

  return (
    <View>
      {blocks.activity}
      {blocks.hero}
      {blocks.ahead}
      {blocks.appt}

      {/* ── the goal, offered once to a phone that predates it ── */}
      {offer === 'goal' && !editingGoal && (
        <GoalSetup
          initial={null}
          onSave={(a, other, weekly) => saveGoal(makeGoal(a, other, weekly, t))}
          onSkip={() => saveGoal(skippedGoal(t))}
        />
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
const styles = StyleSheet.create({
  card: {
    marginHorizontal: size.pageX, marginTop: 14,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    padding: 16,
  },
  cardGap: { marginTop: 14 },
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

  emptyTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  emptySub: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21 },

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
