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
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import DayLine from './DayLine';
import DaySquare from './DaySquare';
import FocusCard from './FocusCard';
import { Press, useReduceMotion } from './motion';
import {
  Entries, LOC_NAMES, Moment, Protocol, QUALITY_NAMES, checkinCount, fmtTime,
  logsOf, todayISO,
} from './model';
import * as db from './db';
import { HYPOTHESIS_OFFER_AFTER_DAYS } from './thresholds';
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
  /** a flare, a treatment, anything that happened — captured from HERE,
   *  because an event happens now and its button must not live at the
   *  bottom of a screen you have to walk into. It was moved off Today
   *  once for clutter; burying the capture turned out to be the worse
   *  trade, and one quiet row is not clutter. */
  onAddEvent: () => void;
  /** the Background sheet, offered from here once a record exists */
  onOpenBackground: () => void;
}

export default function HomeScreen({
  entries, protocol, onLog, onOpenDay, onAddNote, onOpenToday, onFocus, onKeepFocus,
  onTestFactor, onAddEvent, onOpenBackground,
}: HomeScreenProps) {
  const t = todayISO();
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
  const offerBackground = !bgDismissed
    && Object.keys(entries).length > 0
    && db.getBackground() == null;

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
          accessibilityLabel={(latest ? 'Last check-in, ' + fmtTime(latest.h) + ', ' : 'Today, ')
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
                  {fmtTime(latest.h)}
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

      {/* ── something happened ──────────────────────────────
          The event capture, one tap from where you land. Reading events
          back stays on the day screen; this is only the way IN, which is
          the part that must be near the thumb when something is
          happening. */}
      <Press
        onPress={onAddEvent}
        pressOpacity={0.85}
        style={styles.eventEntry}
        accessibilityRole="button"
        accessibilityLabel="Note something that happened"
        accessibilityHint="Opens a short set of questions about a flare or a treatment"
      >
        <Text style={styles.eventEntryText} allowFontScaling maxFontSizeMultiplier={1.3}>
          Note something that happened
        </Text>
      </Press>

      {/* ── the background offer ──────────────────────────── */}
      {offerBackground && (
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
  bgOfferBody: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 8,
  },
  bgOfferActions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14,
  },
  bgOfferGo: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  bgOfferLater: { color: color.textTertiary, fontSize: font.subheadline, fontWeight: '500' },
  /* the day-detail event button's spec, at the page's own gutter: an
     outlined action, deliberately quieter than the two cards above it */
  eventEntry: {
    marginHorizontal: size.pageX, marginTop: 14, minHeight: 48,
    borderRadius: radius.button, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  eventEntryText: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
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
