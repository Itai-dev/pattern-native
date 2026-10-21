/**
 * "Log something that changed" — the event log.
 *
 * These are EVENTS, not triggers. The app records that something happened
 * and when; it never asserts that one thing caused another, and it never
 * recommends a medication or a dose. A treatment row may carry the user's
 * own sense of whether it helped — that is their report, labelled as such.
 *
 * The same sheet edits an existing event: fields arrive filled, Save
 * updates the row in place, and Delete asks before removing it. Save is
 * guarded against repeated taps so one tap is always one event.
 *
 * THE CHECK-IN'S SHEET, SINCE THE OCTOBER REDESIGN (21 Oct 2026): the
 * #0E0E10 ground, the grabber, Cancel | title | Save, every question at
 * the question weight, and the answers as the onboarding chips — #1C1C1E,
 * white with black ink once chosen. They were grey pills that turned a
 * lighter grey, which on this ground was hard to tell from not chosen.
 * Delete is a #1C1C1E capsule in white, not a red word: it asks first,
 * the alert carries the system's destructive red, and a hue on a screen
 * about a flare reads as part of the flare.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import * as db from './db';
import { Press } from './motion';
import { track } from './analytics';
import {
  DURATIONS, DURATION_LABELS, Duration, EVENT_KINDS_OFFERED, EVENT_LABELS,
  EventKind, INTERVENTIONIDS, INTERVENTIONS, ONSETS, ONSET_LABELS, Onset,
  PainEvent, RESPONSES, RESPONSE_LABELS, Response, checkinCount, minutesNow, todayISO,
} from './model';
import { fmtClock } from './clock';
import Icon from './Icon';
import { Num, ROUNDED, summary } from './SummaryCard';
import { color, font, size } from './theme';

/** the check-in sheet's ground — see CheckinScreen's SHEET_BG */
const SHEET_BG = '#0E0E10';
/** the redesign's capsule height */
const BUTTON_H = 54;

/** An answer here can be taken back: a second tap on the chosen pill
 *  clears it, which is how an answer goes back to unanswered — and
 *  unanswered stays out of the row entirely (see save). A sighted
 *  person sees the pill let go; VoiceOver only hears "selected", so it
 *  is told. Not on "What happened?", which always has an answer. */
const CLEAR_HINT = 'Double-tap again to clear this answer';

export interface EventSheetProps {
  /** present = edit this event instead of creating a new one */
  event?: PainEvent | null;
  /** the day a NEW event belongs to, when the sheet was opened from a
   *  day other than today. Absent = today. Without it every event
   *  added from a past day's screen was filed under today — and the
   *  PDF put last Tuesday's flare on the day the person wrote it up. */
  date?: string | null;
  onDone: () => void;
  onClose: () => void;
  /** the host's swipe-down lands here. A pageSheet in this React Native
   *  is modalInPresentation unless allowSwipeDismissal is set, so a
   *  swipe is only an ATTEMPT: UIKit holds the sheet in place and fires
   *  onRequestClose, and the host hands that attempt to the same guard
   *  Cancel uses instead of closing on it. Do not set
   *  allowSwipeDismissal on this sheet — then the swipe dismisses first
   *  and reports after, and there is nothing left to ask about. */
  requestCloseRef?: { current: (() => void) | null };
}

export default function EventSheet({
  event, date: forDate, onDone, onClose, requestCloseRef,
}: EventSheetProps) {
  const editing = !!(event && event.id != null);
  const [kind, setKind] = useState<EventKind>(event ? event.kind : 'flare');
  const [minutes, setMinutes] = useState(event ? event.h : minutesNow());
  const [showPicker, setShowPicker] = useState(false);
  /* the guided answers. All optional — a flare logged with nothing but a
     time is still a flare, and someone in the middle of one should not
     have to fill in a form to say so. */
  const [onset, setOnset] = useState<Onset | null>(event?.onset || null);
  const [duration, setDuration] = useState<Duration | null>(event?.duration || null);
  const [spread, setSpread] = useState(event?.spread || '');
  const [doing, setDoing] = useState(event?.doing || '');
  /* HOW IT WENT, in four words. The 0–10 "did it help" slider was the
     first format; the spec retired it for Better / About the same /
     Worse / Not sure, which is what a person can actually say an hour
     after a heat pad. An old row's slider value is KEPT and never
     rewritten — it rides along untouched, and the report says which
     format it is showing. */
  const [resp, setResp] = useState<Response | null>(event?.resp || null);
  /* what was tried, from the fixed list — an action, carrying no theory */
  const [intervention, setIntervention] = useState<string | null>(event?.intervention || null);
  const [text, setText] = useState(event ? event.text : '');
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(false);
  /* WHAT THE SHEET OPENED WITH — the yardstick for "would Cancel lose
     anything". useRef keeps the first render's values, which are the
     initial state above: the defaults for a new event, the row's own
     answers for an edit. Measured against that rather than against
     empty, because an edit opens full — against empty, every Cancel of
     an untouched edit would ask, and a question asked every time is a
     question the thumb learns to tap through. */
  const opened = useRef({ kind, minutes, onset, duration, spread, doing, resp, intervention, text }).current;

  const date = event ? event.date : forDate || todayISO();
  const dayCheckins = checkinCount(db.getDay(date));

  /* one tap, one event: the ref blocks the double-fire a fast second tap
     can land before React re-renders with the disabled state */
  const save = () => {
    if (savedRef.current) return;
    savedRef.current = true;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const row: Omit<PainEvent, 'id'> = {
      date,
      h: minutes,
      kind,
      text: text.trim(),
      /* the legacy impression survives an edit exactly as recorded */
      helped: event && event.helped != null ? event.helped : null,
      /* filed beside the day's check-ins when there are any. Nothing
         reads this yet; it is kept for backup fidelity and never asked
         about — a checkbox with no visible consequence taught people to
         ignore checkboxes. */
      linked: dayCheckins > 0 ? 1 : 0,
    };
    /* only what was actually answered. An unanswered question stays out
       of the row entirely rather than going in as an empty string, so a
       flare nobody described is distinguishable from one described as
       nothing. */
    if (kind === 'treatment' && intervention) row.intervention = intervention;
    if (kind === 'treatment' && resp) row.resp = resp;
    /* the four flare questions are only on screen for a flare or an
       illness. Answered and then hidden by switching kind, they were
       still written — a treatment row carrying an onset nobody gave it.
       What was not on screen when Save was tapped is not an answer. */
    const described = kind === 'flare' || kind === 'illness';
    if (described && onset) row.onset = onset;
    if (described && duration) row.duration = duration;
    if (described && spread.trim()) row.spread = spread.trim();
    if (described && doing.trim()) row.doing = doing.trim();
    /* A failed write must be a message, not a crash — and it must
       re-arm Save, or the sheet is stuck holding words it cannot keep.

       The alert CARRIES THE ENGINE'S OWN ERROR. The first version
       swallowed it, which turned a diagnosable fault into "please try
       again" — on a write that was failing every time. The string is
       SQLite's, not the user's: a table or column name, never health
       data, and it is the difference between guessing and knowing. */
    try {
      if (editing) db.updateEvent(event!.id!, row);
      else {
        db.addEvent(row);
        /* that an event was logged, and its KIND — a closed enum, never
           the words in it */
        track('event_logged', { kind });
      }
    } catch (e) {
      savedRef.current = false;
      setSaving(false);
      const detail = e instanceof Error ? e.message : String(e);
      Alert.alert(
        'Couldn’t save this event',
        'Nothing was saved yet, and what you wrote is still here. The error, if you want to pass it on:\n\n' + detail.slice(0, 300)
      );
      return;
    }
    onDone();
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete this event?',
      'The ' + fmtClock(event!.h) + ' ' + EVENT_LABELS[event!.kind].toLowerCase() +
        ' event will be removed. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (savedRef.current) return;
            savedRef.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            db.dropEvent(event!.id!);
            onDone();
          },
        },
      ]
    );
  };

  /* Cancel, and the swipe and the escape gesture that mean Cancel. A
     shaky tap on Cancel used to throw away a flare described in the
     middle of one, with no way back — and the words are the part nobody
     can write again later. So it asks, but ONLY when something would be
     lost: an untouched sheet closes at once, as it always did.

     "Something" is anything that differs from what the sheet opened
     with: words (stray spaces aside — save trims them anyway), any
     pill, the kind, the time. The time counts because on an edit,
     moving the time IS the change.

     The copy says what goes and nothing louder. An edit says CHANGES,
     not event: "Discard this event?" one screen from "Delete this
     event?" reads as the same question, and the answer to one is not
     the answer to the other. Keep editing is the cancel-style button,
     so the escape route out of the alert is the one that keeps the
     words. */
  const requestClose = () => {
    if (savedRef.current) return;
    const same = (a?: string | null, b?: string | null) => (a || '').trim() === (b || '').trim();
    const dirty = kind !== opened.kind || minutes !== opened.minutes
      || onset !== opened.onset || duration !== opened.duration
      || resp !== opened.resp || intervention !== opened.intervention
      || !same(spread, opened.spread) || !same(doing, opened.doing) || !same(text, opened.text);
    if (!dirty) { onClose(); return; }
    Alert.alert(
      editing ? 'Discard your changes?' : 'Discard this event?',
      editing ? 'The event stays as it was before you opened it.' : 'Nothing here has been saved.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onClose },
      ]
    );
  };
  /* re-pointed after every render, so a swipe reads the answers on
     screen now — not the ones from the render that first set it */
  useEffect(() => {
    if (!requestCloseRef) return;
    requestCloseRef.current = requestClose;
    return () => { requestCloseRef.current = null; };
  });

  const pickerDate = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      /* the VoiceOver scrub is Cancel, so it asks the same question */
      onAccessibilityEscape={requestClose}
    >
      {/* drawn here: a React Native pageSheet does not ask UIKit for one */}
      <View style={styles.grabber} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={styles.navBar}>
        <Press
          onPress={requestClose}
          style={[styles.navBtn, styles.navLeft]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.navBtnText} maxFontSizeMultiplier={1.4}>Cancel</Text>
        </Press>
        {/* the same words as the button that opens it — one thing, one
            name, from Today to here to the list it is read back in */}
        <Text style={styles.navTitle} numberOfLines={1} accessibilityRole="header"
          maxFontSizeMultiplier={1.4}>
          {editing ? 'Edit event' : 'Flare or treatment'}
        </Text>
        <Press
          onPress={save}
          disabled={saving}
          style={[styles.navBtn, styles.navRight]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          accessibilityLabel="Save event"
        >
          <Text style={[styles.navBtnText, styles.navBtnStrong, saving && styles.navBtnOff]}
            maxFontSizeMultiplier={1.4}>
            Save
          </Text>
        </Press>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* every question is a heading, so the VoiceOver rotor steps
            question to question instead of through every pill — a long
            form is a lot of swipes to someone in the middle of a flare */}
        <Text style={styles.q} accessibilityRole="header">What happened?</Text>
        {/* pills in two rows rather than six stacked rows: Flare is the
            common case and already chosen, and "When" was landing below
            the fold behind five options most people scroll past */}
        <View style={styles.pickRow}>
          {EVENT_KINDS_OFFERED.map((k) => {
            const on = kind === k;
            return (
              <Press
                key={k}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setKind(k); }}
                pressOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={EVENT_LABELS[k]}
                style={[styles.pick, on && styles.pickOn]}
              >
                <Text
                  allowFontScaling maxFontSizeMultiplier={1.4}
                  style={[styles.pickText, on && styles.pickTextOn]}
                >
                  {EVENT_LABELS[k]}
                </Text>
              </Press>
            );
          })}
        </View>

        <Text style={[styles.q, styles.qLater]} accessibilityRole="header">When?</Text>
        <Press
          onPress={() => setShowPicker(!showPicker)}
          pressOpacity={0.8}
          style={styles.timeRow}
          accessibilityRole="button"
          accessibilityLabel={'Time, ' + fmtClock(minutes)}
          /* it toggles — the same row closes the picker it opened */
          accessibilityState={{ expanded: showPicker }}
          accessibilityHint={showPicker ? 'Closes the time picker' : 'Opens a time picker'}
        >
          <Icon name="clock.fill" size={18} color={summary.text} />
          <Text style={styles.timeText} maxFontSizeMultiplier={1.4}>{fmtClock(minutes)}</Text>
          <Text style={styles.timeHint} maxFontSizeMultiplier={1.4}>{showPicker ? 'Done' : 'Change'}</Text>
        </Press>
        {showPicker && (
          <DateTimePicker
            value={pickerDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            themeVariant="dark"
            onChange={(_, d) => {
              if (d) setMinutes(d.getHours() * 60 + d.getMinutes());
            }}
          />
        )}

        {kind === 'treatment' && (
          <>
            <Text style={[styles.q, styles.qLater]} accessibilityRole="header">What did you try?</Text>
            <View style={styles.pickRow}>
              {INTERVENTIONIDS.map((id) => {
                const on = intervention === id;
                return (
                  <Press
                    key={id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setIntervention(on ? null : id);
                    }}
                    pressOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={INTERVENTIONS[id]}
                    accessibilityHint={on ? CLEAR_HINT : undefined}
                    style={[styles.pick, on && styles.pickOn]}
                  >
                    <Text style={[styles.pickText, on && styles.pickTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>
                      {INTERVENTIONS[id]}
                    </Text>
                  </Press>
                );
              })}
            </View>

            <Text style={[styles.q, styles.qLater]} accessibilityRole="header">How did it go?</Text>
            <Text style={styles.sub}>
              Your own impression, afterwards. Pattern records it; it does not
              advise on treatment.
            </Text>
            <View style={styles.pickRow}>
              {RESPONSES.map((r) => {
                const on = resp === r;
                return (
                  <Press
                    key={r}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setResp(on ? null : r);
                    }}
                    pressOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={RESPONSE_LABELS[r]}
                    accessibilityHint={on ? CLEAR_HINT : undefined}
                    style={[styles.pick, on && styles.pickOn]}
                  >
                    <Text style={[styles.pickText, on && styles.pickTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>
                      {RESPONSE_LABELS[r]}
                    </Text>
                  </Press>
                );
              })}
            </View>
            {/* a row written under the old format keeps its number, and
                the sheet says so rather than silently hiding it */}
            {editing && event!.helped != null && (
              <Text style={styles.sub}>
                <Num>{'Recorded earlier as ' + event!.helped + '/10 on the old scale — kept as it was.'}</Num>
              </Text>
            )}
          </>
        )}

        {/* ── the guided part ─────────────────────────────────
            Fixed questions, asked in order, all skippable. Onset and
            radiation are the two SOCRATES answers this record could not
            hold, and they are the two nobody can reconstruct later. */}
        {(kind === 'flare' || kind === 'illness') && (
          <>
            <Text style={[styles.q, styles.qLater]} accessibilityRole="header">How did it come on?</Text>
            <View style={styles.pickRow}>
              {ONSETS.map((o) => {
                const on = onset === o;
                return (
                  <Press
                    key={o}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setOnset(on ? null : o);
                    }}
                    pressOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={ONSET_LABELS[o]}
                    accessibilityHint={on ? CLEAR_HINT : undefined}
                    style={[styles.pick, on && styles.pickOn]}
                  >
                    <Text style={[styles.pickText, on && styles.pickTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>
                      {ONSET_LABELS[o]}
                    </Text>
                  </Press>
                );
              })}
            </View>

            <Text style={[styles.q, styles.qLater]} accessibilityRole="header">What were you doing?</Text>
            <TextInput
              value={doing}
              onChangeText={setDoing}
              placeholder="e.g. carrying shopping up the stairs"
              placeholderTextColor={color.textTertiary}
              style={styles.input}
              multiline
              accessibilityLabel="What you were doing when it started"
            />

            <Text style={[styles.q, styles.qLater]} accessibilityRole="header">Does it spread anywhere?</Text>
            <TextInput
              value={spread}
              onChangeText={setSpread}
              placeholder="e.g. down the back of my left leg"
              placeholderTextColor={color.textTertiary}
              style={styles.input}
              multiline
              accessibilityLabel="Where the pain spreads to"
            />

            <Text style={[styles.q, styles.qLater]} accessibilityRole="header">How long has it lasted?</Text>
            <View style={styles.pickRow}>
              {DURATIONS.map((d) => {
                const on = duration === d;
                return (
                  <Press
                    key={d}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setDuration(on ? null : d);
                    }}
                    pressOpacity={0.85}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={DURATION_LABELS[d]}
                    accessibilityHint={on ? CLEAR_HINT : undefined}
                    style={[styles.pick, on && styles.pickOn]}
                  >
                    <Text style={[styles.pickText, on && styles.pickTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>
                      {DURATION_LABELS[d]}
                    </Text>
                  </Press>
                );
              })}
            </View>
          </>
        )}

        <Text style={[styles.q, styles.qLater]} accessibilityRole="header">Anything else?</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={kind === 'treatment' ? 'e.g. 20 minutes, on the lower back' : 'Optional'}
          placeholderTextColor={color.textTertiary}
          style={styles.input}
          multiline
          accessibilityLabel="Optional note"
        />
        <Text style={styles.sub}>
          Events are shown alongside your check-ins without assuming they caused a change.
        </Text>

        {editing && (
          <Press
            onPress={confirmDelete}
            pressScale={0.97}
            style={styles.deleteRow}
            accessibilityRole="button"
            accessibilityLabel="Delete this event"
          >
            <Icon name="trash" size={17} color={summary.text} />
            <Text style={styles.deleteText} maxFontSizeMultiplier={1.4}>Delete this event</Text>
          </Press>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHEET_BG },
  grabber: {
    width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 8,
    backgroundColor: color.borderControl,
  },
  /* the check-in's bar: two equal-width ends so the title is centred on
     the sheet, and no rule under it */
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: size.pageX, marginTop: 4,
  },
  navTitle: {
    flex: 1, flexShrink: 1, textAlign: 'center',
    color: color.textPrimary, fontSize: font.body, fontWeight: '600',
  },
  navBtn: { minWidth: 72, minHeight: 44, justifyContent: 'center' },
  navLeft: { alignItems: 'flex-start' },
  navRight: { alignItems: 'flex-end' },
  navBtnText: { color: color.tint, fontSize: font.body },
  navBtnStrong: { fontWeight: '600' },
  navBtnOff: { color: summary.tertiary },
  body: { paddingHorizontal: size.pageX, paddingTop: 16, paddingBottom: 40 },
  /* a question, at the check-in's question weight a size down — this
     sheet asks several, and each is a heading for the rotor */
  q: { color: color.textPrimary, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, lineHeight: 25 },
  qLater: { marginTop: 28 },
  sub: { color: summary.secondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 6 },
  /* a grouped row: the clock, the time in the rounded face, the word
     that says what a tap does */
  timeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    minHeight: 54, marginTop: 12, paddingHorizontal: 16,
    borderRadius: summary.radius, borderCurve: 'continuous', backgroundColor: summary.surface,
  },
  timeText: {
    flex: 1, fontFamily: ROUNDED, color: color.textPrimary, fontSize: font.body, fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timeHint: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  /* the fixed answers, as a wrapping row of chips. Not a chat, not a
     scale — a short list of the things people actually say. The
     onboarding chips, to the pixel. */
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pick: {
    minHeight: 44, borderRadius: 22, borderCurve: 'continuous', paddingHorizontal: 16,
    justifyContent: 'center', backgroundColor: summary.surface,
  },
  pickOn: { backgroundColor: color.textPrimary },
  pickText: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  pickTextOn: { color: '#000000' },
  input: {
    marginTop: 12, minHeight: 60, borderRadius: summary.radius, borderCurve: 'continuous',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: summary.surface, color: color.textPrimary, fontSize: font.body,
    textAlignVertical: 'top',
  },
  deleteRow: {
    marginTop: 32, minHeight: BUTTON_H, borderRadius: BUTTON_H / 2, borderCurve: 'continuous',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: 16, backgroundColor: summary.surface,
  },
  deleteText: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
});
