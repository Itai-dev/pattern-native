/**
 * A day's detail: what the day averaged, from how many check-ins, and each
 * check-in with its own time, number, label and places.
 *
 * The ambiguous ✕ beside every row is gone. A row is tapped to edit; it is
 * deleted by swiping it away, which asks for confirmation first and then
 * recalculates the day's average immediately.
 */
import React, { useCallback, useState } from 'react';
import {
  LayoutAnimation, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import DaySquare from './DaySquare';
import * as db from './db';
import { Press, useReduceMotion } from './motion';
import { getMetric, levelLabel } from './metrics';
import {
  Answer, Entry, EVENT_LABELS, LOC_NAMES, PainEvent, QUALITY_NAMES, checkinCount,
  dailyAverage, dateFromISO, daySummary, fmtTime, logsOf, todayISO,
} from './model';
import {
  formatCheckins, formatOutOf, formatScoreAndLabel, painColor, speakScore,
} from './painScale';
import { healthDayLines } from './health/context';
import { color, font, radius, size } from './theme';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function names(ids: string[] | undefined, map: Record<string, string>): string {
  return (ids || []).map((id) => map[id] || id).join(', ');
}

export interface DaySheetProps {
  dateIso: string;
  entry: Entry | null;
  onChanged: () => void;
  onAddLog: () => void;
  onEditLog: (h: number) => void;
  onEditEvent: (ev: PainEvent) => void;
  onAddEvent: () => void;
  onClose: () => void;
}

export default function DaySheet({
  dateIso, entry, onChanged, onAddLog, onEditLog, onEditEvent, onAddEvent, onClose,
}: DaySheetProps) {
  const [, force] = useState(0);
  const rm = useReduceMotion();
  const d = dateFromISO(dateIso);
  const isToday = dateIso === todayISO();
  const live = db.getDay(dateIso) || entry;   // always the current truth
  const logs = logsOf(live);
  const avg = dailyAverage(live);
  const count = live ? checkinCount(live) : 0;

  /* the note is drafted apart from the stored value, so Cancel is a real
     cancel — nothing touches the record until Save */
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const startNote = useCallback(() => {
    setNoteDraft((db.getDay(dateIso)?.note) || '');
    setNoteEditing(true);
  }, [dateIso]);
  const saveNote = useCallback(() => {
    db.setNote(dateIso, noteDraft.trim());
    setNoteEditing(false);
    force((n) => n + 1);
    onChanged();
  }, [dateIso, noteDraft, onChanged]);

  const places: string[] = [];
  const seen: Record<string, true> = {};
  logs.forEach((l) => (l.loc || []).forEach((id) => {
    if (!seen[id]) { seen[id] = true; places.push(id); }
  }));

  /* deleting an event asks first and says what it removes */
  /* Swipe, then Delete — the iOS list gesture, and the whole confirmation.
     The dialog that used to follow it made the deliberate act of swiping a
     row open and tapping a red button feel like a slip the app had caught.
     Nothing here is reachable by accident, and the record is exported and
     restorable, so the gesture stands on its own. */
  const deleteEvent = useCallback((ev: PainEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!rm) {
      LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    }
    if (ev.id != null) db.dropEvent(ev.id);
    force((n) => n + 1);
    onChanged();
  }, [onChanged, rm]);

  const deleteMoment = useCallback((h: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!rm) {
      LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    }
    db.dropMoment(dateIso, h);
    force((n) => n + 1);   // the header's average updates in place
    onChanged();
  }, [dateIso, onChanged, rm]);

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <View style={styles.navSpacer} />
        <Text style={styles.navTitle} numberOfLines={1}>
          {d.getDate()} {MONTHS[d.getMonth()].slice(0, 3)}
        </Text>
        <Press
          onPress={onClose}
          style={styles.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.navBtnText}>Done</Text>
        </Press>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <DaySquare entry={live} value={avg} size={44} radius={11} />
          <View style={styles.headerText}>
            <Text style={styles.date} allowFontScaling maxFontSizeMultiplier={1.4}>
              {DAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}
            </Text>
            {avg == null ? (
              <Text style={styles.sub}>No check-ins on this day</Text>
            ) : (
              <>
                <Text
                  style={styles.avg}
                  allowFontScaling
                  maxFontSizeMultiplier={1.4}
                  accessibilityLabel={'Daily average ' + speakScore(avg)}
                >
                  Daily average {formatScoreAndLabel(avg)}
                </Text>
                <Text style={styles.sub}>{formatCheckins(count)}</Text>
              </>
            )}
            {places.length > 0 && (
              <Text style={styles.sub}>Where: {names(places, LOC_NAMES)}</Text>
            )}
          </View>
        </View>

        {/* The day, read back in one computed sentence — every clause
            derived from the numbers below it, the same sentence for the
            same data on every open. See daySummary for what each clause
            is and is not allowed to claim. */}
        {(() => {
          const s = daySummary(logs);
          return s ? (
            <Text style={styles.summary} allowFontScaling maxFontSizeMultiplier={1.4}>
              {s}
            </Text>
          ) : null;
        })()}

        {/* ── the day's health context ──────────────────────
            Apple Health, organized the one way it is not in Apple's own
            app: by the day it belongs to, beside the pain it is context
            for. Descriptive only — the day's own facts in white, no
            claims, and the sentence saying so inside the block it
            qualifies. Missing categories are missing lines, never
            zeros. */}
        {(() => {
          const lines = healthDayLines(db.getHealthDay(dateIso));
          if (!lines.length) return null;
          return (
            <View style={styles.list}>
              <Text style={styles.listTitle}>From Apple Health</Text>
              {lines.map((l) => (
                <Text
                  key={l.key}
                  style={styles.healthLine}
                  allowFontScaling maxFontSizeMultiplier={1.4}
                >
                  {l.text}
                </Text>
              ))}
              <Text style={styles.swipeHint}>
                Read from Health for context beside what you recorded. Sitting
                next to each other is not a claim that one caused the other.
              </Text>
            </View>
          );
        })()}

        {logs.length > 0 && (
          <View style={styles.list}>
            <Text style={styles.listTitle}>Check-ins</Text>
            {logs.map((l) => (
              <Swipeable
                key={l.h}
                overshootRight={false}
                renderRightActions={() => (
                  <Press
                    onPress={() => deleteMoment(l.h)}
                    style={styles.deleteAction}
                    accessibilityRole="button"
                    accessibilityLabel={'Delete the ' + fmtTime(l.h) + ' check-in'}
                  >
                    <Text style={styles.deleteText}>Delete</Text>
                  </Press>
                )}
              >
                <Press
                  onPress={() => onEditLog(l.h)}
                  pressOpacity={0.7}
                  style={styles.row}
                  accessibilityRole="button"
                  accessibilityLabel={fmtTime(l.h) + ', ' + speakScore(l.pain) +
                    (l.loc && l.loc.length ? ', ' + names(l.loc, LOC_NAMES) : '')}
                  accessibilityHint="Opens this check-in to edit. Swipe left to delete."
                >
                  <View style={[styles.swatch, { backgroundColor: painColor(l.pain) }]} />
                  <Text style={styles.time} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {fmtTime(l.h)}
                  </Text>
                  <View style={styles.rowMid}>
                    <Text style={styles.rowScore} allowFontScaling maxFontSizeMultiplier={1.3}>
                      {formatOutOf(l.pain)} · {formatScoreAndLabel(l.pain).split(' · ')[1]}
                    </Text>
                    {l.loc && l.loc.length > 0 && (
                      <Text style={styles.rowSub}>{names(l.loc, LOC_NAMES)}</Text>
                    )}
                    {l.q && l.q.length > 0 && (
                      <Text style={styles.rowSub}>{names(l.q, QUALITY_NAMES)}</Text>
                    )}
                  </View>
                  <Text style={styles.chev}>›</Text>
                </Press>
              </Swipeable>
            ))}
            <Text style={styles.swipeHint}>Tap to edit · swipe left to delete</Text>
          </View>
        )}

        {/* A flare, a treatment, anything that happened. This used to be
            a button on Today; it lives here now, next to the day it would
            be about, which is also where it is read back. Without it
            nothing could create an event at all. */}
        <Press
          onPress={onAddEvent}
          pressOpacity={0.85}
          style={styles.addEvent}
          accessibilityRole="button"
          accessibilityLabel="Note something that happened"
          accessibilityHint="Opens a short set of questions about a flare or a treatment"
        >
          <Text style={styles.addEventText}>Note something that happened</Text>
        </Press>

        {/* what was asked that day, and what came back. A question that
            was PUT and declined says so; a question never put is simply
            absent from the list. The two are not the same fact and the
            screen does not pretend otherwise. */}
        {(() => {
          const ctx = live && live.ctx ? live.ctx.a : null;
          const ids = ctx ? Object.keys(ctx) : [];
          if (!ids.length) return null;
          const shown = ids
            .map((id) => ({ id, m: getMetric(id), a: ctx![id] as Answer }))
            .filter((r) => r.m != null);
          if (!shown.length) return null;
          return (
            <View style={styles.list}>
              <Text style={styles.listTitle}>Today’s questions</Text>
              {shown.map(({ id, m, a }) => {
                const skipped = a.skipped === 1;
                const value = skipped
                  ? 'Skipped'
                  : m!.type === 'numeric'
                    ? a.value + '/10'
                    : levelLabel(id, String(a.value));
                return (
                  <Swipeable
                    key={id}
                    overshootRight={false}
                    renderRightActions={() => (
                      <Press
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          db.clearAnswer(dateIso, id);
                          force((n) => n + 1);
                          onChanged();
                        }}
                        style={styles.deleteAction}
                        accessibilityRole="button"
                        accessibilityLabel={'Remove the answer to: ' + m!.name}
                      >
                        <Text style={styles.deleteText}>Remove</Text>
                      </Press>
                    )}
                  >
                    <View
                      style={styles.qRow}
                      accessible
                      accessibilityLabel={m!.name + ', ' + value + (a.note ? '. Note: ' + a.note : '')}
                    >
                      <View style={styles.rowMid}>
                        <Text style={styles.rowScore} allowFontScaling maxFontSizeMultiplier={1.3}>
                          {m!.name}
                        </Text>
                        <Text style={styles.rowSub}>{m!.question}</Text>
                        {/* the user's own words, if they left any — shown
                            under the question they qualify, and shown on a
                            skipped answer too, because "I'd rather not
                            grade it, but here is what happened" is a
                            perfectly good thing to have said */}
                        {!!a.note && (
                          <Text style={styles.rowNote} allowFontScaling maxFontSizeMultiplier={1.4}>
                            {a.note}
                          </Text>
                        )}
                      </View>
                      <Text
                        style={[styles.qValue, skipped && styles.qSkipped]}
                        allowFontScaling maxFontSizeMultiplier={1.3}
                      >
                        {value}
                      </Text>
                    </View>
                  </Swipeable>
                );
              })}
              <Text style={styles.swipeHint}>
                Swipe left to remove an answer · a removed answer goes back to
                never having been asked
              </Text>
            </View>
          );
        })()}

        {/* events recorded that day — each one opens to edit, swipes to
            delete, and none of them claims to explain the pain */}
        {(() => {
          const evs = db.getEventsFor(dateIso);
          if (!evs.length) return null;
          return (
            <View style={styles.list}>
              <Text style={styles.listTitle}>Events</Text>
              {evs.map((ev) => (
                <Swipeable
                  key={ev.id}
                  overshootRight={false}
                  renderRightActions={() => (
                    <Press
                      onPress={() => deleteEvent(ev)}
                      style={styles.deleteAction}
                      accessibilityRole="button"
                      accessibilityLabel={'Delete the ' + fmtTime(ev.h) + ' event'}
                    >
                      <Text style={styles.deleteText}>Delete</Text>
                    </Press>
                  )}
                >
                  <Press
                    onPress={() => onEditEvent(ev)}
                    pressOpacity={0.7}
                    style={styles.row}
                    accessibilityRole="button"
                    accessibilityLabel={fmtTime(ev.h) + ', ' + EVENT_LABELS[ev.kind] +
                      (ev.text ? ', ' + ev.text : '')}
                    accessibilityHint="Opens this event to edit. Swipe left to delete."
                  >
                    <Text style={styles.time}>{fmtTime(ev.h)}</Text>
                    <View style={styles.rowMid}>
                      <Text style={styles.rowScore}>{EVENT_LABELS[ev.kind]}</Text>
                      {!!ev.text && <Text style={styles.rowSub}>{ev.text}</Text>}
                      {ev.helped != null && (
                        <Text style={styles.rowSub}>Reported effect {ev.helped}/10</Text>
                      )}
                    </View>
                    <Text style={styles.chev}>›</Text>
                  </Press>
                </Swipeable>
              ))}
              <Text style={styles.swipeHint}>
                Events are shown alongside your check-ins without assuming they caused a change.
              </Text>
            </View>
          );
        })()}

        {/* ── the day, in their words ───────────────────────
            One note per day, editable after the fact — unlike a check-in's
            timestamp, a note about Monday written on Tuesday is the normal
            case, not the dishonest one. The field has existed in storage,
            backup and the PWA all along; this is the first place the
            native app lets it be written.

            Read by nothing. It has no levels and nothing to compare
            against, so the engine never sees it; it reaches the PDF only
            when the share asks, and the share asks every time. */}
        {/* only on a day that exists in the record. db.setNote refuses a
            day with no entry, and manufacturing one would mean writing a
            pain value nobody entered just to hang a sentence on. */}
        {!!live && (
        <View style={styles.list}>
          <Text style={styles.listTitle}>In your own words</Text>
          {noteEditing ? (
            <>
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                multiline
                autoFocus
                placeholder="Anything about this day worth remembering"
                placeholderTextColor={color.textTertiary}
                style={styles.noteInput}
                accessibilityLabel="Note about this day"
              />
              <View style={styles.noteActions}>
                <Press
                  onPress={() => setNoteEditing(false)}
                  pressOpacity={0.7}
                  style={styles.noteBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Cancel editing the note"
                >
                  <Text style={styles.noteCancel}>Cancel</Text>
                </Press>
                <Press
                  onPress={saveNote}
                  pressOpacity={0.7}
                  style={styles.noteBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Save the note"
                >
                  <Text style={styles.noteSave}>Save</Text>
                </Press>
              </View>
            </>
          ) : live?.note ? (
            <Press
              onPress={startNote}
              pressOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={'Your note: ' + live.note}
              accessibilityHint="Opens the note to edit"
            >
              <Text style={styles.note}>“{live.note}”</Text>
              <Text style={styles.noteEditHint}>Edit</Text>
            </Press>
          ) : (
            <Press
              onPress={startNote}
              pressOpacity={0.85}
              style={styles.addEvent}
              accessibilityRole="button"
              accessibilityLabel="Add a note about this day"
            >
              <Text style={styles.addEventText}>Add a note about this day</Text>
            </Press>
          )}
          <Text style={styles.swipeHint}>
            Kept on this iPhone with the rest of your record. Never analysed —
            it goes into the PDF only if you say so when you share.
          </Text>
        </View>
        )}

        {isToday && (
          <Press
            onPress={onAddLog}
            pressScale={0.985}
            style={styles.primary}
            accessibilityRole="button"
            accessibilityLabel="Add another check-in"
          >
            <Text style={styles.primaryText}>Add a check-in</Text>
          </Press>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 64 },
  navTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  body: { padding: size.sheetX, paddingTop: 20, paddingBottom: 30 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  headerText: { flex: 1, gap: 3 },
  date: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', letterSpacing: -0.2 },
  avg: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '500' },
  sub: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },
  list: {
    marginTop: 22, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  listTitle: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 56, backgroundColor: color.bgSheet, paddingRight: 4,
  },
  swatch: {
    width: 16, height: 16, borderRadius: 5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  time: {
    color: color.textPrimary, fontSize: font.subheadline, minWidth: 52,
    fontVariant: ['tabular-nums'],
  },
  rowMid: { flex: 1 },
  rowScore: { color: color.textPrimary, fontSize: font.subheadline },
  rowSub: { color: color.textSecondary, fontSize: font.footnote, marginTop: 1 },
  rowNote: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 20,
    marginTop: 4,
  },
  chev: { color: color.textTertiary, fontSize: 20 },
  deleteAction: {
    width: 88, minHeight: 56, backgroundColor: color.destructive,
    alignItems: 'center', justifyContent: 'center',
  },
  deleteText: { color: '#FFFFFF', fontSize: font.subheadline, fontWeight: '600' },
  addEvent: {
    marginTop: 20, minHeight: 48, borderRadius: radius.button, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  addEventText: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  qRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14,
    backgroundColor: color.bgSurface,
  },
  qValue: {
    color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  qSkipped: { color: color.textTertiary, fontWeight: '500' },
  swipeHint: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: 10 },
  /* the computed reading of the day — under the header, over the lists it
     is a reading OF */
  summary: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21,
    marginTop: 14,
  },
  /* white, not the ramp: these are counts and durations, and colour
     means pain or it is not a colour */
  healthLine: {
    color: color.textPrimary, fontSize: font.subheadline, lineHeight: 24,
    fontVariant: ['tabular-nums'],
  },
  noteInput: {
    color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21,
    minHeight: 88, textAlignVertical: 'top',
    borderRadius: radius.button, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
    backgroundColor: color.bgSurface,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 6,
  },
  noteActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 22, marginTop: 4 },
  noteBtn: { minHeight: 44, justifyContent: 'center' },
  noteCancel: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '500' },
  noteSave: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  noteEditHint: { color: color.tint, fontSize: font.footnote, fontWeight: '500', marginTop: 6 },
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, minHeight: 44, paddingVertical: 6 },
  note: {
    marginTop: 18, paddingTop: 14, color: color.textSecondary, fontSize: 15,
    lineHeight: 23, fontStyle: 'italic',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  /* the same primary-button spec as everywhere else — one button, one size */
  primary: {
    minHeight: size.buttonH, borderRadius: radius.button, borderCurve: 'continuous', backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 24, paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
});
