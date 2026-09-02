/**
 * Everything about one day that is not the chart: where it hurt, what
 * Health recorded around it, each check-in, the questions that were put,
 * the events, and the day's own note.
 *
 * This used to be a sheet that opened ON TOP of the day screen, which
 * meant one day had two surfaces — the same list rendered twice, one of
 * them able to edit and one not, and which one you got depended on
 * whether you arrived from Today or from History. It is a section now,
 * rendered under the chart on the one day screen there is. Nothing here
 * changed except where it lives; the sheet's rules come with it.
 *
 * A row is TAPPED to edit and SWIPED to delete. There is no ✕ per row:
 * the ambiguous button is what the swipe replaced.
 */
import React, { useCallback, useState } from 'react';
import { LayoutAnimation, StyleSheet, Text, TextInput, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import * as db from './db';
import { Press, useReduceMotion } from './motion';
import { getMetric, levelLabel } from './metrics';
import {
  Answer, EVENT_LABELS, LOC_NAMES, PainEvent, QUALITY_NAMES,
  dateFromISO, daySummary, fmtTime, logsOf, momentAddedLater,
  readLocParts, todayISO,
} from './model';
import { formatOutOf, formatScoreAndLabel, painColor, speakScore } from './painScale';
import { healthDayTiles } from './health/context';
import { RETRO_CHECKIN_MAX_DAYS } from './thresholds';
import { color, font, radius, size } from './theme';

function names(ids: string[] | undefined, map: Record<string, string>): string {
  return (ids || []).map((id) => map[id] || id).join(', ');
}

/** places named in the day's summary line before it defers to a tap. A
 *  day with eighteen check-ins can touch thirty places, and the union of
 *  them printed in full was a paragraph where a line belongs. */
const PLACES_SHOWN = 4;

export interface DayDetailProps {
  dateIso: string;
  onChanged: () => void;
  onAddLog: () => void;
  onEditLog: (h: number) => void;
  onEditEvent: (ev: PainEvent) => void;
  onAddEvent: () => void;
  /** open with the note already being edited — Today's "add a note"
   *  lands here, and landing on a closed note would make the shortcut
   *  a longer route than the one it replaces */
  editNoteOnOpen?: boolean;
}

export default function DayDetail({
  dateIso, onChanged, onAddLog, onEditLog, onEditEvent, onAddEvent, editNoteOnOpen,
}: DayDetailProps) {
  const [, force] = useState(0);
  const rm = useReduceMotion();
  const isToday = dateIso === todayISO();
  /* a past day inside the retro window can still receive a check-in —
     see RETRO_CHECKIN_MAX_DAYS for where the line is and why */
  const daysBack = Math.round(
    (dateFromISO(todayISO()).getTime() - dateFromISO(dateIso).getTime()) / 86400000
  );
  const canAddCheckin = isToday || (daysBack > 0 && daysBack <= RETRO_CHECKIN_MAX_DAYS);
  const live = db.getDay(dateIso);            // always the current truth
  const logs = logsOf(live);

  /* the note is drafted apart from the stored value, so Cancel is a real
     cancel — nothing touches the record until Save */
  const [noteEditing, setNoteEditing] = useState(!!editNoteOnOpen);
  const [noteDraft, setNoteDraft] = useState(
    () => (editNoteOnOpen ? (db.getDay(dateIso)?.note || '') : '')
  );
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

  /* the day's places, in the words a person says them in — pairs
     collapsed, the rest named. Shown as a line with the count of what it
     is holding back, never as a wall of thirty. */
  const [placesOpen, setPlacesOpen] = useState(false);
  const placeIds: string[] = [];
  const seen: Record<string, true> = {};
  logs.forEach((l) => (l.loc || []).forEach((id) => {
    if (!seen[id]) { seen[id] = true; placeIds.push(id); }
  }));
  const placeLabels = readLocParts(placeIds).map((p) => p.label);
  const placesHidden = Math.max(0, placeLabels.length - PLACES_SHOWN);
  const placesLine = (placesOpen || !placesHidden
    ? placeLabels
    : placeLabels.slice(0, PLACES_SHOWN)).join(', ');

  /* Swipe, then Delete — the iOS list gesture, and the whole
     confirmation. The dialog that used to follow it made the deliberate
     act of swiping a row open and tapping a red button feel like a slip
     the app had caught. Nothing here is reachable by accident, and the
     record is exported and restorable, so the gesture stands on its own. */
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
    force((n) => n + 1);
    onChanged();
  }, [dateIso, onChanged, rm]);

  const summary = daySummary(logs);

  return (
    <View style={styles.wrap}>
      {/* The day, read back in one computed sentence — every clause
          derived from the numbers above it, the same sentence for the
          same data on every open. See daySummary for what each clause is
          and is not allowed to claim. */}
      {!!summary && (
        <Text style={styles.summary} allowFontScaling maxFontSizeMultiplier={1.4}>
          {summary}
        </Text>
      )}

      {placeLabels.length > 0 && (
        <Press
          onPress={() => placesHidden && setPlacesOpen((o) => !o)}
          pressOpacity={placesHidden ? 0.7 : 1}
          accessibilityRole={placesHidden ? 'button' : 'text'}
          accessibilityLabel={'Where: ' + placeLabels.join(', ')}
          accessibilityHint={placesHidden && !placesOpen
            ? 'Shows every place recorded today' : undefined}
        >
          <Text style={styles.places} allowFontScaling maxFontSizeMultiplier={1.4}>
            Where: {placesLine}
            {placesHidden > 0 && !placesOpen && (
              <Text style={styles.placesMore}> +{placesHidden} more</Text>
            )}
          </Text>
        </Press>
      )}

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
                <View>
                  <Text style={styles.time} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {fmtTime(l.h)}
                  </Text>
                  {/* recalled, and permanently visible as such — read
                      from the capture stamps, never from a flag that
                      could be forgotten */}
                  {momentAddedLater(dateIso, l) && (
                    <Text style={styles.addedLater} allowFontScaling maxFontSizeMultiplier={1.2}>
                      added later
                    </Text>
                  )}
                </View>
                <View style={styles.rowMid}>
                  <Text style={styles.rowScore} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {formatOutOf(l.pain)} · {formatScoreAndLabel(l.pain).split(' · ')[1]}
                  </Text>
                  {l.loc && l.loc.length > 0 && (
                    <Text style={styles.rowSub}>{names(l.loc, LOC_NAMES)}</Text>
                  )}
                  {/* the user's own words about where — quoted, so the
                      record's voice and theirs stay distinct */}
                  {!!l.locNote && <Text style={styles.rowSub}>“{l.locNote}”</Text>}
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

      {/* A flare, a treatment, anything that happened. It lives next to
          the day it would be about, which is also where it is read back.
          Without it nothing could create an event at all. */}
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

      {/* what was asked that day, and what came back. A question that was
          PUT and declined says so; a question never put is simply absent
          from the list. The two are not the same fact and the screen does
          not pretend otherwise. */}
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
            <Text style={styles.listTitle}>That day’s questions</Text>
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
                          skipped answer too, because "I'd rather not grade
                          it, but here is what happened" is a perfectly
                          good thing to have said */}
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
              Events are shown alongside your check-ins without assuming they
              caused a change.
            </Text>
          </View>
        );
      })()}

      {/* ── the day, in their words ───────────────────────
          One note per day, editable after the fact — unlike a check-in's
          timestamp, a note about Monday written on Tuesday is the normal
          case, not the dishonest one.

          Read by nothing. It has no levels and nothing to compare
          against, so the engine never sees it; it reaches the PDF only
          when the share asks, and the share asks every time. */}
      {/* only on a day that exists in the record. db.setNote refuses a day
          with no entry, and manufacturing one would mean writing a pain
          value nobody entered just to hang a sentence on. */}
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

      {/* ── the day's health context, LAST on purpose ─────
          Apple Health, organized the one way it is not in Apple's own
          app: by the day it belongs to, beside the pain it is context
          for. It reads after everything the user entered, because
          imported context is the appendix to a record, not its opening
          — the answers given, the events noted and the words written
          outrank what a watch happened to measure.
          Tiles in Pattern's own grammar — outline glyphs in line
          weight, neutral ink, and no borrowed Apple branding: colour
          here means pain or it is not a colour, and these are not pain
          values. Missing categories are missing tiles, never zeros; the
          caveat lives inside the block it qualifies. */}
      {(() => {
        const tiles = healthDayTiles(db.getHealthDay(dateIso), db.getHealthDays());
        if (!tiles.length) return null;
        return (
          <View style={styles.list}>
            <Text style={styles.listTitle}>From Apple Health</Text>
            <View style={styles.tileGrid}>
              {tiles.map((t) => (
                <View
                  key={t.key}
                  style={styles.tile}
                  accessible
                  accessibilityLabel={t.label + ', ' + t.value + (t.sub ? ', ' + t.sub : '')}
                >
                  <View style={styles.tileHead}>
                    <Ionicons
                      name={t.icon as keyof typeof Ionicons.glyphMap}
                      size={16}
                      color={color.textSecondary}
                    />
                    <Text
                      style={styles.tileLabel} numberOfLines={1}
                      allowFontScaling maxFontSizeMultiplier={1.2}
                    >
                      {t.label}
                    </Text>
                  </View>
                  <Text
                    style={styles.tileValue} numberOfLines={1} adjustsFontSizeToFit
                    allowFontScaling maxFontSizeMultiplier={1.3}
                  >
                    {t.value}
                  </Text>
                  {!!t.sub && (
                    <Text
                      style={styles.tileSub} numberOfLines={2}
                      allowFontScaling maxFontSizeMultiplier={1.3}
                    >
                      {t.sub}
                    </Text>
                  )}
                </View>
              ))}
            </View>
            <Text style={styles.swipeHint}>
              Read from Health for context beside what you recorded. Sitting
              next to each other is not a claim that one caused the other.
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
          accessibilityLabel={isToday
            ? 'Add another check-in'
            : 'Add a check-in for this day, from memory'}
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
  /* the card above sets the margin: its title is the first words on the
     screen, and everything here lines up under them */
  wrap: { paddingHorizontal: size.contentX, paddingTop: 4 },
  summary: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21,
    marginTop: 14,
  },
  places: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 19,
    marginTop: 8,
  },
  placesMore: { color: color.tint, fontWeight: '600' },
  list: {
    marginTop: 22, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  listTitle: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    marginBottom: 4,
  },
  /* the row's own background is opaque and matches the page: it is the
     lid the delete action slides out from under, and a transparent row
     would show the red the whole time */
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 56, backgroundColor: color.bgRoot, paddingRight: 4,
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
  addedLater: { color: color.textTertiary, fontSize: 10, marginTop: 1 },
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
  swipeHint: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: 10,
  },
  tileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tile: {
    flexGrow: 1, flexBasis: '30%', borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: color.bgSurface, padding: 10, gap: 3,
  },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tileLabel: { flex: 1, color: color.textSecondary, fontSize: font.footnote },
  tileValue: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  tileSub: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 16 },
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
  note: {
    marginTop: 18, paddingTop: 14, color: color.textSecondary, fontSize: 15,
    lineHeight: 23, fontStyle: 'italic',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  primary: {
    minHeight: size.buttonH, borderRadius: radius.button, borderCurve: 'continuous',
    backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 24, paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
});
