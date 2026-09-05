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
 */
import React, { useRef, useState } from 'react';
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
import { color, font, size } from './theme';

export interface EventSheetProps {
  /** present = edit this event instead of creating a new one */
  event?: PainEvent | null;
  onDone: () => void;
  onClose: () => void;
}

export default function EventSheet({ event, onDone, onClose }: EventSheetProps) {
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

  const date = event ? event.date : todayISO();
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
    if (onset) row.onset = onset;
    if (duration) row.duration = duration;
    if (spread.trim()) row.spread = spread.trim();
    if (doing.trim()) row.doing = doing.trim();
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
        'Nothing was recorded. The storage engine said:\n\n' + detail.slice(0, 300)
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

  const pickerDate = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.navBar}>
        <Press
          onPress={onClose}
          style={[styles.navBtn, styles.navLeft]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.navBtnText}>Cancel</Text>
        </Press>
        {/* the same words as the button that opens it — one thing, one
            name, from Today to here to the list it is read back in */}
        <Text style={styles.navTitle} numberOfLines={1}>
          {editing ? 'Edit event' : 'Flare or treatment'}
        </Text>
        <Press
          onPress={save}
          disabled={saving}
          style={styles.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          accessibilityLabel="Save event"
        >
          <Text style={[styles.navBtnText, styles.navBtnStrong, saving && styles.navBtnOff]}>
            Save
          </Text>
        </Press>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.q}>What happened?</Text>
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

        <Text style={[styles.q, styles.qLater]}>When?</Text>
        <Press
          onPress={() => setShowPicker(!showPicker)}
          pressOpacity={0.8}
          style={styles.timeRow}
          accessibilityRole="button"
          accessibilityLabel={'Time, ' + fmtClock(minutes)}
          accessibilityHint="Opens a time picker"
        >
          <Text style={styles.timeText}>{fmtClock(minutes)}</Text>
          <Text style={styles.timeHint}>{showPicker ? 'Done' : 'Change'}</Text>
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
            <Text style={[styles.q, styles.qLater]}>What did you try?</Text>
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

            <Text style={[styles.q, styles.qLater]}>How did it go?</Text>
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
                Recorded earlier as {event!.helped}/10 on the old scale — kept as it was.
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
            <Text style={[styles.q, styles.qLater]}>How did it come on?</Text>
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

            <Text style={[styles.q, styles.qLater]}>What were you doing?</Text>
            <TextInput
              value={doing}
              onChangeText={setDoing}
              placeholder="e.g. carrying shopping up the stairs"
              placeholderTextColor={color.textTertiary}
              style={styles.input}
              multiline
              accessibilityLabel="What you were doing when it started"
            />

            <Text style={[styles.q, styles.qLater]}>Does it spread anywhere?</Text>
            <TextInput
              value={spread}
              onChangeText={setSpread}
              placeholder="e.g. down the back of my left leg"
              placeholderTextColor={color.textTertiary}
              style={styles.input}
              multiline
              accessibilityLabel="Where the pain spreads to"
            />

            <Text style={[styles.q, styles.qLater]}>How long did it last?</Text>
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

        <Text style={[styles.q, styles.qLater]}>Anything else?</Text>
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
            style={styles.deleteRow}
            accessibilityRole="button"
            accessibilityLabel="Delete this event"
          >
            <Text style={styles.deleteText}>Delete this event</Text>
          </Press>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 72, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navLeft: { alignItems: 'flex-start' },
  navBtnText: { color: color.tint, fontSize: font.body },
  navBtnStrong: { fontWeight: '600' },
  navBtnOff: { color: color.textTertiary },
  body: { padding: size.sheetX, paddingTop: 20, paddingBottom: 40 },
  q: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  qLater: { marginTop: 28 },
  sub: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 4 },
  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 48, marginTop: 10, paddingHorizontal: 14,
    borderRadius: 12, borderCurve: 'continuous', backgroundColor: color.bgSurface,
  },
  timeText: { color: color.textPrimary, fontSize: font.body, fontVariant: ['tabular-nums'] },
  timeHint: { color: color.tint, fontSize: font.subheadline },
  /* the fixed answers, as a wrapping row of pills. Not a chat, not a
     scale — a short list of the things people actually say. */
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pick: {
    minHeight: 44, borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 14, justifyContent: 'center',
    backgroundColor: color.bgSurface,
    borderWidth: 1, borderColor: color.borderDivider,
  },
  pickOn: { borderColor: color.textPrimary, backgroundColor: color.bgSegmentActive },
  pickText: { color: '#D0D0D6', fontSize: font.subheadline, fontWeight: '500' },
  pickTextOn: { color: color.textPrimary, fontWeight: '600' },
  input: {
    marginTop: 10, minHeight: 60, borderRadius: 12, borderCurve: 'continuous', padding: 12,
    backgroundColor: color.bgSurface, color: color.textPrimary, fontSize: font.body,
    textAlignVertical: 'top',
  },
  deleteRow: { marginTop: 32, minHeight: 44, justifyContent: 'center' },
  deleteText: { color: color.danger, fontSize: font.body },
});
