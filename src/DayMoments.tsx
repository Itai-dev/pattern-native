/**
 * The day under its chart, when Today is in layers (Profile ▸ Appearance).
 *
 * THE CHART IS THE LIST. The classic day page printed every check-in as
 * a row beneath the drawing — the same facts twice, once as dots and
 * once as text, and a day with nine check-ins was a page of rows before
 * anything else could be read. Here a dot is tapped and ONE moment
 * reads back: the square in its own colour, the number and its word,
 * the time, the event it came after if the day had one, and the chips
 * it was entered with. Edit opens the check-in on that moment; Delete
 * asks first, because a word on a card is reachable by accident in a
 * way a swiped-open row was not.
 *
 * Under it, the one thing this page can do next — add a check-in —
 * and then, in the order a person would ask: what else happened
 * (events), what they wrote (the note, when there is one), what they
 * were asked (the day's answers, compact), and only then what a watch
 * measured (Health, as the same tiles Today wears). Imported context is
 * the appendix to a record, not its opening.
 *
 * Same rules as everywhere: the number is what the user entered and
 * the ramp is worn only by the pain; a count is white; a skip is
 * shown as a skip; and every block that shows something carries the
 * sentence about what it is not, inside the block.
 *
 * THE OCTOBER REDESIGN'S GRAMMAR (21 Oct 2026), and nothing else moved.
 * Each block is a SummaryCard card — #1C1C1E, 16pt corners, an
 * icon-and-label header — every number is in the rounded face, the
 * rows end in the system chevron, and the moment's square is still the
 * one hue on the page.
 *
 * THE CALM PASS (21 Oct 2026). The page read as crowded: the white
 * capsule sat at the very bottom, under Apple Health, so the action came
 * after the appendix; a #1C1C1E capsule for a flare stood mid-page with
 * the weight of a card; an empty "Add a note about this day" row was a
 * second door to the sheet Add information already opens; and the
 * action row carried a gesture hint the chart's (i) already gives. Now:
 * one capsule, directly under the moment it adds to; the flare is a
 * quiet row at the foot of Events (or alone where there are none); the
 * note row shows only a note that exists. Nothing a person can do was
 * removed — every door is still here, one of each.
 */
import React, { useCallback } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as db from './db';
import { Press } from './motion';
import { getMetric, levelLabel } from './metrics';
import {
  Answer, EVENT_LABELS, INTERVENTIONS, Moment, PainEvent, dateFromISO, logsOf,
  momentAddedLater, todayISO,
} from './model';
import { fmtClock } from './clock';
import { formatScore, painColor, painLabel, speakScore } from './painScale';
import { afterLine, chipsFor, eventBefore, shownH } from './dayGlance';
import { doseLines } from './health/context';
import { HealthDay } from './health/types';
import { contextTiles } from './todayTiles';
import ContextTiles from './ContextTiles';
import Icon from './Icon';
import { CardHeader, Num, ROUNDED, summary } from './SummaryCard';
import { PAIN_MAX } from './painScale';
import { RETRO_CHECKIN_MAX_DAYS } from './thresholds';
import { color, font, size } from './theme';

/** Edit, Add information and Delete are words in a row, 36pt tall and
 *  only as wide as the word — "Edit" is about 30pt, under Apple's 44
 *  both ways, in a row that ends in Delete. The slop brings each to 44
 *  without moving a pixel: 36 + 4 + 4 tall, and 9 a side is half the
 *  row's 18pt gap, so two targets meet mid-gap and never overlap. */
const ACT_SLOP = { top: 4, bottom: 4, left: 9, right: 9 };

/** the redesign's capsule: 54 tall, fully rounded */
const BUTTON_H = 54;

/** both flare doors say the same thing to VoiceOver */
const FLARE_HINT = 'Opens a short set of questions about a flare or a treatment';

export interface DayMomentsProps {
  dateIso: string;
  /** the dot tapped on the chart above, by its minute. Undefined or
   *  stale falls back to the newest moment — see shownH. */
  selectedH?: number;
  onChanged: () => void;
  onAddLog: () => void;
  onEditLog: (moment: Moment) => void;
  /** the Add information sheet, on the moment showing — where, the
   *  words, the symptoms and the day's note. Edit (the check-in) is
   *  the number and the time; this is everything else. */
  onAddInfo: (h?: number) => void;
  onEditEvent: (ev: PainEvent) => void;
  onAddEvent: () => void;
}

/** the row's end: a chevron where the row opens something — a promise,
 *  so never on a row that does not */
function Chev() {
  return <Icon name="chevron.right" size={14} color={summary.chevron} weight="semibold" />;
}

export default function DayMoments({
  dateIso, selectedH, onChanged, onAddLog, onEditLog, onAddInfo, onEditEvent, onAddEvent,
}: DayMomentsProps) {
  const isToday = dateIso === todayISO();
  /* a past day inside the retro window can still receive a check-in —
     see RETRO_CHECKIN_MAX_DAYS for where the line is and why */
  const daysBack = Math.round(
    (dateFromISO(todayISO()).getTime() - dateFromISO(dateIso).getTime()) / 86400000
  );
  const canAddCheckin = isToday || (daysBack > 0 && daysBack <= RETRO_CHECKIN_MAX_DAYS);

  const live = db.getDay(dateIso);            // always the current truth
  const logs = logsOf(live);
  const events = db.getEventsFor(dateIso);
  const h = shownH(logs, selectedH);
  const m = h == null ? null : logs.find((l) => l.h === h) || null;

  const deleteMoment = useCallback((mm: Moment) => {
    Alert.alert(
      'Delete this check-in?',
      'The ' + fmtClock(mm.h) + ' check-in, ' + speakScore(mm.pain) + ', comes off this day.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            db.dropMoment(dateIso, mm.h);
            onChanged();
          },
        },
      ]
    );
  }, [dateIso, onChanged]);

  const before = m ? afterLine(eventBefore(events, m.h), fmtClock) : '';
  const chips = m ? chipsFor(m) : [];

  return (
    <View style={styles.wrap}>
      {/* ── the tapped moment ─────────────────────────── */}
      {m && (
        <View style={styles.card}>
          <View
            style={styles.moment}
            accessible
            accessibilityLabel={fmtClock(m.h) + ', ' + speakScore(m.pain)
              + (momentAddedLater(dateIso, m) ? ', added later' : '')
              + (before ? ', ' + before : '')
              + (chips.length ? '. ' + chips.join(', ') : '')}
          >
            {/* the one square on this page that wears the ramp — it is
                the pain value, and the number sits beside it as always */}
            <View style={[styles.square, { backgroundColor: painColor(m.pain) }]} />
            <View style={styles.momentMain}>
              <Text style={styles.num} allowFontScaling maxFontSizeMultiplier={1.3}>
                {formatScore(m.pain)}
                <Text style={styles.numUnit}>/{PAIN_MAX}</Text>
                <Text style={styles.word}>  {painLabel(m.pain)}</Text>
              </Text>
              <Text style={styles.when} allowFontScaling maxFontSizeMultiplier={1.3}>
                <Num>{fmtClock(m.h)}</Num>
                {/* recalled, and permanently visible as such — read from
                    the capture stamps, never from a flag */}
                {momentAddedLater(dateIso, m) ? ' · added later' : ''}
                {before ? <Num>{' · ' + before}</Num> : ''}
              </Text>
              {chips.length > 0 && (
                <View style={styles.chips}>
                  {chips.map((c, i) => (
                    <View key={i} style={styles.chip}>
                      <Text style={styles.chipText} allowFontScaling maxFontSizeMultiplier={1.3}>{c}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
          <View style={styles.acts}>
            <Press
              onPress={() => onEditLog(m)}
              pressOpacity={0.7}
              style={styles.act}
              hitSlop={ACT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={'Edit the ' + fmtClock(m.h) + ' check-in'}
            >
              <Text style={styles.actText}>Edit</Text>
            </Press>
            <Press
              onPress={() => onAddInfo(m.h)}
              pressOpacity={0.7}
              style={styles.act}
              hitSlop={ACT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={'Add information to the ' + fmtClock(m.h) + ' check-in'}
            >
              <Text style={styles.actText}>Add information</Text>
            </Press>
            <Press
              onPress={() => deleteMoment(m)}
              pressOpacity={0.7}
              style={styles.act}
              hitSlop={ACT_SLOP}
              accessibilityRole="button"
              accessibilityLabel={'Delete the ' + fmtClock(m.h) + ' check-in'}
            >
              <Text style={[styles.actText, styles.actDanger]}>Delete</Text>
            </Press>
          </View>
        </View>
      )}

      {/* ── the next thing this page can do ─────────────
          Directly under the moment it adds to (or under the chart on a
          day with none), never below the appendix. VoiceOver says
          "another" only when there is one to be another of. */}
      {canAddCheckin && (
        <Press
          onPress={onAddLog}
          pressScale={0.97}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel={isToday ? (logs.length ? 'Add another check-in' : 'Add a check-in') : 'Add a check-in for this day, from memory'}
        >
          <Text style={styles.primaryText} maxFontSizeMultiplier={1.4}>
            {isToday ? 'Add a check-in' : 'Add a check-in for this day'}
          </Text>
        </Press>
      )}

      {/* ── events: what happened, beside when ────────
          Each row opens the event to edit (the sheet carries its own
          Delete). The marks on the chart above are these, at their
          minute. */}
      {events.length > 0 && (
        <View style={styles.card}>
          <CardHeader icon="flame.fill" label="Events" />
          <View style={styles.rows}>
            {events.map((ev, i) => (
              <Press
                key={ev.id ?? i}
                onPress={() => onEditEvent(ev)}
                pressOpacity={0.7}
                style={[styles.row, i > 0 && styles.rowLine]}
                accessibilityRole="button"
                accessibilityLabel={fmtClock(ev.h) + ', ' + EVENT_LABELS[ev.kind]
                  + (ev.intervention ? ', ' + (INTERVENTIONS[ev.intervention] || ev.intervention) : '')
                  + (ev.text ? ', ' + ev.text : '')}
                accessibilityHint="Opens this event to edit."
              >
                <Text style={styles.time} allowFontScaling maxFontSizeMultiplier={1.3}>{fmtClock(ev.h)}</Text>
                <View style={styles.rowMid}>
                  <Text style={styles.rowText} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {EVENT_LABELS[ev.kind]}
                    {ev.intervention ? ' · ' + (INTERVENTIONS[ev.intervention] || ev.intervention) : ''}
                  </Text>
                  {!!ev.text && (
                    <Text style={styles.rowSub} allowFontScaling maxFontSizeMultiplier={1.3} numberOfLines={2}>
                      {ev.text}
                    </Text>
                  )}
                </View>
                <Chev />
              </Press>
            ))}
          </View>
          {/* adding another sits with the ones already logged, as the
              list's last row rather than a capsule of its own */}
          <Press
            onPress={onAddEvent}
            pressOpacity={0.7}
            style={[styles.row, styles.rowLine]}
            accessibilityRole="button"
            accessibilityLabel="Log a flare or treatment"
            accessibilityHint={FLARE_HINT}
          >
            <Text style={[styles.link, styles.linkFill]} allowFontScaling maxFontSizeMultiplier={1.3}>
              Log a flare or treatment
            </Text>
            <Chev />
          </Press>
          <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
            Shown alongside your check-ins without assuming they caused a change.
          </Text>
        </View>
      )}

      {/* no events yet: the same door, alone, as a quiet row — a card's
          weight, not a button's */}
      {events.length === 0 && (
        <Press
          onPress={onAddEvent}
          pressOpacity={0.7}
          style={[styles.card, styles.flareAlone]}
          accessibilityRole="button"
          accessibilityLabel="Log a flare or treatment"
          accessibilityHint={FLARE_HINT}
        >
          <Icon name="flame.fill" size={18} color={summary.text} />
          <Text style={[styles.link, styles.linkFill]} allowFontScaling maxFontSizeMultiplier={1.3}>
            Log a flare or treatment
          </Text>
          <Chev />
        </Press>
      )}

      {/* ── the day, in their words — shown when there are some ──
          An empty "add a note" row was a second door to the sheet that
          Add information on the moment already opens; a note that exists
          is read back here, and Edit opens it. */}
      {!!live && !!live.note && (
        <Press
          onPress={() => onAddInfo(m ? m.h : undefined)}
          pressOpacity={0.7}
          style={[styles.card, styles.noteRow]}
          accessibilityRole="button"
          accessibilityLabel={'Your note: ' + live.note}
          accessibilityHint="Opens the note"
        >
          <Icon name="note.text" size={18} color={summary.text} />
          <Text style={styles.note} allowFontScaling maxFontSizeMultiplier={1.4}>“{live.note}”</Text>
          <Text style={styles.link} allowFontScaling maxFontSizeMultiplier={1.3}>Edit</Text>
        </Press>
      )}

      {/* ── what was asked that day, and what came back ──
          A question that was put and declined says so; a question never
          put is simply absent. The two are not the same fact. Removing an
          answer is the classic page's job; here they are read. */}
      {(() => {
        const ctx = live && live.ctx ? live.ctx.a : null;
        const ids = ctx ? Object.keys(ctx) : [];
        const shown = ids
          .map((id) => ({ id, m: getMetric(id), a: ctx![id] as Answer }))
          .filter((r) => r.m != null);
        if (!shown.length) return null;
        return (
          <View style={styles.card}>
            <CardHeader icon="list.bullet" label="That day’s questions" />
            <View style={styles.rows}>
              {shown.map(({ id, m: met, a }, i) => {
                const skipped = a.skipped === 1;
                const value = skipped
                  ? 'Skipped'
                  : met!.type === 'numeric'
                    ? a.value + '/10'
                    : levelLabel(id, String(a.value));
                return (
                  <View
                    key={id}
                    style={[styles.row, i > 0 && styles.rowLine]}
                    accessible
                    /* "6 out of 10" — read raw, "6/10" is "six slash ten" */
                    accessibilityLabel={met!.name + ', ' + value.replace(/\/10$/, ' out of 10')
                      + (a.note ? '. Note: ' + a.note : '')}
                  >
                    <View style={styles.rowMid}>
                      <Text style={styles.rowText} allowFontScaling maxFontSizeMultiplier={1.3}>{met!.name}</Text>
                      {!!a.note && (
                        <Text style={styles.rowSub} allowFontScaling maxFontSizeMultiplier={1.4}>{a.note}</Text>
                      )}
                    </View>
                    <Text
                      style={[styles.qValue, skipped && styles.qSkipped]}
                      allowFontScaling maxFontSizeMultiplier={1.3}
                    >
                      <Num>{value}</Num>
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })()}

      {/* ── from Health, LAST on purpose ──────────────
          The same tiles Today wears, by the day they belong to; doses as
          lines, since a dose is a time and a name. Missing categories are
          missing tiles, never zeros. On the ground rather than in a card:
          the tiles are cards already, and a card of cards is a frame. */}
      {(() => {
        const healthDay = db.getHealthDay<HealthDay>(dateIso);
        const tiles = contextTiles(healthDay, db.getHealthDays<HealthDay>());
        const doses = doseLines(healthDay);
        if (!tiles.length && !doses.length) return null;
        return (
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <CardHeader icon="heart.fill" label="From Apple Health" />
            </View>
            <ContextTiles tiles={tiles} />
            {doses.map((d) => (
              <View
                key={d.key}
                style={styles.dose}
                accessible
                accessibilityLabel={fmtClock(d.h) + ', ' + d.text + ', logged in Health'}
              >
                <Text style={styles.time} allowFontScaling maxFontSizeMultiplier={1.4}>{fmtClock(d.h)}</Text>
                <Text style={styles.rowText} allowFontScaling maxFontSizeMultiplier={1.4}>
                  <Num>{d.text}</Num>
                </Text>
              </View>
            ))}
            <Text style={[styles.fine, styles.fineLoose]} allowFontScaling maxFontSizeMultiplier={1.4}>
              Read from Health for context beside what you recorded. Sitting next to
              each other is not a claim that one caused the other
              {doses.length ? ', and a dose beside a number is not a claim about the dose' : ''}.
            </Text>
          </View>
        );
      })()}

    </View>
  );
}

const styles = StyleSheet.create({
  /* the cards here sit in the pager card's own gutter, so walking down
     the page nothing steps sideways — and they stack at SummaryCard's
     gap, the one every card in the redesign keeps from the next */
  wrap: { paddingHorizontal: size.pageX, paddingTop: 12, gap: summary.gap },
  /* SummaryCard's card: no hairline, because on black the surface is
     its own edge */
  card: {
    borderRadius: summary.radius, borderCurve: 'continuous', backgroundColor: summary.surface,
    paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16,
  },
  block: { paddingTop: 10 },
  /* the header on the ground, inset to where it would sit inside a card */
  blockHead: { paddingHorizontal: 4, marginBottom: 10 },
  rows: { marginTop: 6 },

  moment: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  /* the pain square: the ramp, corners in the redesign's 10–12 for a
     pain square, and the hairline that keeps a 10 visible on #1C1C1E */
  square: {
    width: 56, height: 56, borderRadius: 12, borderCurve: 'continuous',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  momentMain: { flex: 1 },
  num: {
    fontFamily: ROUNDED, color: color.textPrimary, fontSize: 34, fontWeight: '700',
    letterSpacing: -0.7, fontVariant: ['tabular-nums'], lineHeight: 38,
  },
  numUnit: { fontFamily: ROUNDED, fontSize: 17, fontWeight: '600', color: summary.secondary, letterSpacing: 0 },
  /* the word is a word, so the text face: nested Text inherits the
     rounded family from the figure, and 'System' is the name iOS reads
     as the plain system font */
  word: {
    fontFamily: 'System', fontSize: font.subheadline, fontWeight: '600',
    color: summary.secondary, letterSpacing: 0,
  },
  when: { color: summary.secondary, fontSize: font.footnote, marginTop: 3 },
  /* what the moment was entered with, read back — not a control, so no
     selected state: a quiet pill one step up from the card */
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: {
    borderRadius: 13, borderCurve: 'continuous', paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: color.bgSegmentTrack,
  },
  chipText: { color: color.textPrimary, fontSize: font.footnote, fontWeight: '500' },
  acts: {
    flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 14, paddingTop: 10,
    /* room for ACT_SLOP's bottom inside the row, given back below */
    paddingBottom: 4, marginBottom: -4,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: summary.separator,
  },
  act: { minHeight: 36, justifyContent: 'center' },
  actText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  /* the destructive word in the app's soft terracotta (theme.ts danger),
     not grey: told apart from Edit by colour as well as weight, so it is
     read before a shaking hand lands on it — and still not iOS red,
     which on a card about pain shouts. It asks before it acts. */
  actDanger: { color: color.danger, fontWeight: '500' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: summary.separator },
  time: {
    fontFamily: ROUNDED, color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600',
    minWidth: 52, fontVariant: ['tabular-nums'],
  },
  rowMid: { flex: 1, paddingVertical: 6 },
  rowText: { color: color.textPrimary, fontSize: font.subheadline },
  rowSub: { color: summary.secondary, fontSize: font.footnote, marginTop: 1 },
  qValue: {
    color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  qSkipped: { color: summary.tertiary, fontWeight: '500' },
  fine: { color: summary.tertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 10 },
  fineLoose: { paddingHorizontal: 4 },

  /* the flare door on a day with no events: a row the height of the
     note row, so the two read as one family */
  flareAlone: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingVertical: 14 },

  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingVertical: 14 },
  note: { flex: 1, color: summary.secondary, fontSize: font.subheadline, lineHeight: 21, fontStyle: 'italic' },
  link: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  linkFill: { flex: 1 },

  dose: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingHorizontal: 4 },

  /* the one filled action on the page: white, black words, a capsule */
  primary: {
    minHeight: BUTTON_H, borderRadius: BUTTON_H / 2, borderCurve: 'continuous',
    backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.body, fontWeight: '600' },
});
