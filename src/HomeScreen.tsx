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
import DaySquare from './DaySquare';
import FocusCard from './FocusCard';
import { Press, useReduceMotion } from './motion';
import { track } from './analytics';
import {
  Entries, LOC_NAMES, Moment, Protocol, QUALITY_NAMES, addDays, checkinCount, logsOf,
  todayISO,
} from './model';
import { fmtDay } from './DayScreen';
import { fmtClock } from './clock';
import * as db from './db';
import { anyReminderOn, enableEveningReminder, savedSlots } from './reminderSchedule';
import { lastNightLine } from './health/context';
import { HealthDay } from './health/types';
import { HYPOTHESIS_OFFER_AFTER_DAYS } from './thresholds';

/* ── when Today may ask for something ────────────────────────
   Three offers live on this screen, and at most ONE shows at a time:
   a screen that asks for three things is a form. They are ordered by
   how much they pay back a new user, and each is shown once, on either
   answer, forever.

   The reminder comes first and right after the first check-in — the
   moment it explains itself, and the strongest habit lever the app
   has. The background waits: five minutes of history right after six
   onboarding screens was the first thing every tester dismissed. The
   widget waits longest, because a lock screen is worth explaining only
   to someone who has come back. */
const HEALTH_OFFER_AFTER_DAYS = 2;
const BACKGROUND_OFFER_AFTER_DAYS = 3;
const APPOINTMENT_OFFER_AFTER_DAYS = 4;
const WIDGET_OFFER_AFTER_DAYS = 5;
/** how many days before an appointment the summary is offered — two:
 *  enough to read it, not enough to forget it */
const APPOINTMENT_LEAD_DAYS = 2;
/** how long after a date passes, or after "not now", before asking
 *  again — appointments recur, and a month is not nagging */
const APPOINTMENT_REASK_DAYS = 30;
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
  protocol: Protocol | null;
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
  onFocus: () => void;
  onKeepFocus: () => void;
  onTestFactor: (metricId: string) => void;
  /** the Background sheet, offered from here once a record exists */
  onOpenBackground: () => void;
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
}

export default function HomeScreen({
  entries, protocol, onLog, onOpenDay, onAddNote, onOpenToday, onFocus, onKeepFocus,
  onTestFactor, onOpenBackground, onOpenReminders, healthOfferable, onOpenHealth,
  onOpenAppointment, onShare, appointment, healthDays,
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
  const dayOnly = !latest && entry && typeof entry.pain === 'number' ? entry.pain : null;
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

  /* the focus question is worth asking only once there is a record to
     form a hypothesis about — a first-day user has nothing to suspect */
  const offerSetup = Object.keys(entries).length >= HYPOTHESIS_OFFER_AFTER_DAYS;

  /* The background offer: once, after the record exists, gone forever
     on either answer. Onboarding is the wrong home for a five-minute
     survey — this is the right moment, when the first check-in has
     shown what the app is and the survey has a reason. Dismissing is a
     real no: the sheet stays reachable in Profile, and this card never
     returns to ask again. */
  const [bgDismissed, setBgDismissed] = useState(
    () => db.getPref<boolean>('background.offer.dismissed', false)
  );
  const loggedDays = Object.keys(entries).length;
  const offerBackground = !bgDismissed
    && loggedDays >= BACKGROUND_OFFER_AFTER_DAYS
    && db.getBackground() == null;

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

  /* one at a time, in the order they pay back */
  const offer: null | 'reminder' | 'health' | 'background' | 'appointment' | 'widget' = offerReminder
    ? 'reminder' : offerHealth ? 'health' : offerBackground ? 'background'
      : offerAppointment ? 'appointment' : offerWidget ? 'widget' : null;

  /* the day's shape, from the two numbers on screen: the first check-in
     of today against the latest. Nothing is stored, nothing is derived
     into a fourth number, and with one check-in there is no comparison to
     make and none is offered. */
  const oldest = logs.length ? logs[logs.length - 1] : null;
  const shape = latest && oldest && logs.length > 1
    ? dayShape(oldest.pain, latest.pain)
    : null;

  return (
    <View>
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

          {/* what the drawing is NOT, inside the card it qualifies */}
          <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
            Each dot is a check-in, at the hour you made it; the ringed one is
            the latest. One day is not a trend, and nothing here is being
            compared to another day.
          </Text>

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

      {/* ── last night, from Health ────────────────────────── */}
      {!!lastNight && (
        <Text style={styles.lastNight} allowFontScaling maxFontSizeMultiplier={1.4}
          accessibilityLabel={'From Apple Health: ' + lastNight}>
          {lastNight}
        </Text>
      )}

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
            Your summary is ready whenever you want it — the numbers, your
            background, your own question, and what they do and don’t mean.
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

      {/* ── the background offer ──────────────────────────── */}
      {offer === 'background' && (
        <View style={[styles.card, styles.cardGap]}>
          <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
            Give Pattern some background
          </Text>
          <Text style={styles.bgOfferBody} allowFontScaling maxFontSizeMultiplier={1.4}>
            Optional, about five minutes, in your own words. It becomes the
            first page of the summary you share with a clinician — nothing in
            it is analysed or compared.
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

      {/* ── the period, or the invitation to start one ──────
          About the record rather than about a day, which is why it sits
          outside both cards and under them. */}
      <FocusCard
        protocol={protocol}
        entries={entries}
        todayIso={t}
        offerSetup={offerSetup}
        onStart={onFocus}
        onKeepGoing={onKeepFocus}
        onTest={onTestFactor}
      />
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
