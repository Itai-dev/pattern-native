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
 * Under it, in the order a person would ask: what else happened
 * (events), what they wrote (the note, as a row that opens the sheet),
 * what they were asked (the day's answers, compact), and only then what
 * a watch measured (Health, as the same tiles Today wears). Imported
 * context is the appendix to a record, not its opening.
 *
 * Same rules as everywhere: the number is what the user entered and
 * the ramp is worn only by the pain; a count is white; a skip is
 * shown as a skip; and every block that shows something carries the
 * sentence about what it is not, inside the block.
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
import { PAIN_MAX } from './painScale';
import { RETRO_CHECKIN_MAX_DAYS } from './thresholds';
import { color, font, radius, size } from './theme';

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
                {fmtClock(m.h)}
                {/* recalled, and permanently visible as such — read from
                    the capture stamps, never from a flag */}
                {momentAddedLater(dateIso, m) ? ' · added later' : ''}
                {before ? ' · ' + before : ''}
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
              accessibilityRole="button"
              accessibilityLabel={'Edit the ' + fmtClock(m.h) + ' check-in'}
            >
              <Text style={styles.actText}>Edit</Text>
            </Press>
            <Press
              onPress={() => onAddInfo(m.h)}
              pressOpacity={0.7}
              style={styles.act}
              accessibilityRole="button"
              accessibilityLabel={'Add information to the ' + fmtClock(m.h) + ' check-in'}
            >
              <Text style={styles.actText}>Add information</Text>
            </Press>
            <Press
              onPress={() => deleteMoment(m)}
              pressOpacity={0.7}
              style={styles.act}
              accessibilityRole="button"
              accessibilityLabel={'Delete the ' + fmtClock(m.h) + ' check-in'}
            >
              <Text style={[styles.actText, styles.actQuiet]}>Delete</Text>
            </Press>
            {logs.length > 1 && (
              <Text style={styles.actHint} allowFontScaling maxFontSizeMultiplier={1.3}>
                Tap another dot for another check-in
              </Text>
            )}
          </View>
        </View>
      )}

      {/* ── events: what happened, beside when ────────
          Each row opens the event to edit (the sheet carries its own
          Delete). The marks on the chart above are these, at their
          minute. */}
      {events.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.blockTitle}>Events</Text>
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
              <Text style={styles.chev}>›</Text>
            </Press>
          ))}
          <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
            Shown alongside your check-ins without assuming they caused a change.
          </Text>
        </View>
      )}

      <Press
        onPress={onAddEvent}
        pressOpacity={0.85}
        style={styles.outline}
        accessibilityRole="button"
        accessibilityLabel="Log a flare or treatment"
        accessibilityHint="Opens a short set of questions about a flare or a treatment"
      >
        <Text style={styles.outlineText}>Log a flare or treatment</Text>
      </Press>

      {/* ── the day, in their words — one row, one tap, the sheet ── */}
      {!!live && (
        <Press
          onPress={() => onAddInfo(m ? m.h : undefined)}
          pressOpacity={0.7}
          style={[styles.card, styles.noteRow]}
          accessibilityRole="button"
          accessibilityLabel={live.note ? 'Your note: ' + live.note : 'Add a note about this day'}
          accessibilityHint="Opens the note"
        >
          {live.note ? (
            <>
              <Text style={styles.note} allowFontScaling maxFontSizeMultiplier={1.4}>“{live.note}”</Text>
              <Text style={styles.link} allowFontScaling maxFontSizeMultiplier={1.3}>Edit</Text>
            </>
          ) : (
            <Text style={styles.link} allowFontScaling maxFontSizeMultiplier={1.3}>
              Add a note about this day
            </Text>
          )}
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
            <Text style={styles.blockTitle}>That day’s questions</Text>
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
                  accessibilityLabel={met!.name + ', ' + value + (a.note ? '. Note: ' + a.note : '')}
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
                    {value}
                  </Text>
                </View>
              );
            })}
          </View>
        );
      })()}

      {/* ── from Health, LAST on purpose ──────────────
          The same tiles Today wears, by the day they belong to; doses as
          lines, since a dose is a time and a name. Missing categories are
          missing tiles, never zeros. */}
      {(() => {
        const healthDay = db.getHealthDay<HealthDay>(dateIso);
        const tiles = contextTiles(healthDay, db.getHealthDays<HealthDay>());
        const doses = doseLines(healthDay);
        if (!tiles.length && !doses.length) return null;
        return (
          <View style={styles.block}>
            <Text style={[styles.blockTitle, styles.blockTitleLoose]}>From Apple Health</Text>
            <ContextTiles tiles={tiles} />
            {doses.map((d) => (
              <View
                key={d.key}
                style={styles.dose}
                accessible
                accessibilityLabel={fmtClock(d.h) + ', ' + d.text + ', logged in Health'}
              >
                <Text style={styles.time} allowFontScaling maxFontSizeMultiplier={1.4}>{fmtClock(d.h)}</Text>
                <Text style={styles.rowText} allowFontScaling maxFontSizeMultiplier={1.4}>{d.text}</Text>
              </View>
            ))}
            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              Read from Health for context beside what you recorded. Sitting next to
              each other is not a claim that one caused the other
              {doses.length ? ', and a dose beside a number is not a claim about the dose' : ''}.
            </Text>
          </View>
        );
      })()}

      {canAddCheckin && (
        <Press
          onPress={onAddLog}
          pressScale={0.985}
          style={styles.primary}
          accessibilityRole="button"
          accessibilityLabel={isToday ? 'Add another check-in' : 'Add a check-in for this day, from memory'}
        >
          <Text style={styles.primaryText}>
            {isToday ? 'Add a check-in' : 'Add a check-in for this day'}
          </Text>
        </Press>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /* the cards here sit in the pager card's own gutter, so walking down
     the page nothing steps sideways */
  wrap: { paddingHorizontal: size.pageX, paddingTop: 12, gap: 12 },
  card: {
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    padding: size.cardPad,
  },
  block: { paddingTop: 4 },
  blockTitle: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    marginBottom: 6,
  },
  blockTitleLoose: { paddingHorizontal: 4, marginBottom: 8 },

  moment: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  square: {
    width: 56, height: 56, borderRadius: 14, borderCurve: 'continuous',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  momentMain: { flex: 1 },
  num: {
    color: color.textPrimary, fontSize: font.title2, fontWeight: '800',
    letterSpacing: -0.5, fontVariant: ['tabular-nums'], lineHeight: 28,
  },
  numUnit: { fontSize: font.footnote, fontWeight: '600', color: color.textSecondary },
  word: { fontSize: font.subheadline, fontWeight: '600', color: color.textSecondary, letterSpacing: 0 },
  when: { color: color.textTertiary, fontSize: font.footnote, marginTop: 3 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: {
    borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 9, paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  chipText: { color: color.textSecondary, fontSize: font.footnote, fontWeight: '500' },
  acts: {
    flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  act: { minHeight: 36, justifyContent: 'center' },
  actText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  /* the destructive word in the quiet colour, not red: it asks before it
     acts, and a red word on a card about pain shouts */
  actQuiet: { color: color.textTertiary, fontWeight: '500' },
  actHint: { flex: 1, textAlign: 'right', color: color.textTertiary, fontSize: 11 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  rowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider },
  time: {
    color: color.textPrimary, fontSize: font.subheadline, minWidth: 52,
    fontVariant: ['tabular-nums'],
  },
  rowMid: { flex: 1 },
  rowText: { color: color.textPrimary, fontSize: font.subheadline },
  rowSub: { color: color.textSecondary, fontSize: font.footnote, marginTop: 1 },
  chev: { color: color.textTertiary, fontSize: 20 },
  qValue: {
    color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  qSkipped: { color: color.textTertiary, fontWeight: '500' },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 10 },

  outline: {
    minHeight: 48, borderRadius: radius.button, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  outlineText: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },

  noteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  note: { flex: 1, color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, fontStyle: 'italic' },
  link: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },

  dose: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40, paddingHorizontal: 4 },

  primary: {
    minHeight: size.buttonH, borderRadius: radius.button, borderCurve: 'continuous',
    backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 8, paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
});
