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
import Slider from './Slider';
import * as db from './db';
import { Press } from './motion';
import {
  DURATIONS, DURATION_LABELS, Duration, EVENT_KINDS_OFFERED, EVENT_LABELS,
  EventKind, ONSETS, ONSET_LABELS, Onset, PainEvent, checkinCount, fmtTime,
  minutesNow, todayISO,
} from './model';
import { color, font, size } from './theme';

const LINK_NOTE = 'Events are shown alongside your check-ins without assuming they caused a change.';

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
  const [helped, setHelped] = useState<number | null>(event && event.helped != null ? event.helped : null);
  const [text, setText] = useState(event ? event.text : '');
  const [link, setLink] = useState(event ? event.linked === 1 : true);
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
      helped: kind === 'treatment' ? helped : null,
      linked: link && dayCheckins > 0 ? 1 : 0,
    };
    /* only what was actually answered. An unanswered question stays out
       of the row entirely rather than going in as an empty string, so a
       flare nobody described is distinguishable from one described as
       nothing. */
    if (onset) row.onset = onset;
    if (duration) row.duration = duration;
    if (spread.trim()) row.spread = spread.trim();
    if (doing.trim()) row.doing = doing.trim();
    if (editing) db.updateEvent(event!.id!, row);
    else db.addEvent(row);
    onDone();
  };

  const confirmDelete = () => {
    Alert.alert(
      'Delete this event?',
      'The ' + fmtTime(event!.h) + ' ' + EVENT_LABELS[event!.kind].toLowerCase() +
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
        <Text style={styles.navTitle} numberOfLines={1}>
          {editing ? 'Edit event' : 'Something changed'}
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
        <View style={styles.kinds}>
          {EVENT_KINDS_OFFERED.map((k) => {
            const on = kind === k;
            return (
              <Press
                key={k}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setKind(k); }}
                pressOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={EVENT_LABELS[k]}
                style={[styles.kind, on ? styles.kindOn : styles.kindOff]}
              >
                <Text
                  allowFontScaling maxFontSizeMultiplier={1.4}
                  style={[styles.kindText, on && styles.kindTextOn]}
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
          accessibilityLabel={'Time, ' + fmtTime(minutes)}
          accessibilityHint="Opens a time picker"
        >
          <Text style={styles.timeText}>{fmtTime(minutes)}</Text>
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
            <Text style={[styles.q, styles.qLater]}>Did it seem to help?</Text>
            <Text style={styles.sub}>
              Your own impression. Pattern records it; it does not advise on treatment.
            </Text>
            <Text style={styles.value}>
              {helped == null ? 'Too early to say' : helped + '/10'}
            </Text>
            <Slider
              value={helped}
              onChange={setHelped}
              accessibilityLabel="Reported effect, 0 to 10"
              accessibilityValue={helped == null
                ? { text: 'Not set' }
                : { min: 0, max: 10, now: helped }}
            />
            <View style={styles.ends}>
              <Text style={styles.endText}>Not at all</Text>
              <Text style={styles.endText}>Completely</Text>
            </View>
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

        <Text style={[styles.q, styles.qLater]}>
          {kind === 'treatment' ? 'What did you try?' : 'Anything else?'}
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={kind === 'treatment' ? 'e.g. heat pack, physio session' : 'Optional'}
          placeholderTextColor={color.textTertiary}
          style={styles.input}
          multiline
          accessibilityLabel="Optional note"
        />

        {dayCheckins > 0 && (
          <Press
            onPress={() => setLink(!link)}
            pressOpacity={0.8}
            style={styles.linkRow}
            accessibilityRole="switch"
            accessibilityState={{ checked: link }}
            accessibilityLabel="Show alongside that day’s check-ins"
          >
            <View style={[styles.box, link && styles.boxOn]}>
              {link && <Text style={styles.tick}>✓</Text>}
            </View>
            <View style={styles.linkText}>
              <Text style={styles.linkTitle}>Show alongside that day’s check-ins</Text>
              <Text style={styles.sub}>{LINK_NOTE}</Text>
            </View>
          </Press>
        )}

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
  kinds: { marginTop: 12, gap: 8 },
  kind: {
    minHeight: 48, borderRadius: 12, borderCurve: 'continuous', borderWidth: 1,
    justifyContent: 'center', paddingHorizontal: 14,
  },
  kindOn: { backgroundColor: color.bgSegmentActive, borderColor: color.textSecondary },
  kindOff: { backgroundColor: color.bgSurface, borderColor: color.borderDivider },
  kindText: { color: color.textPrimary, fontSize: font.subheadline },
  kindTextOn: { fontWeight: '600' },
  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 48, marginTop: 10, paddingHorizontal: 14,
    borderRadius: 12, borderCurve: 'continuous', backgroundColor: color.bgSurface,
  },
  timeText: { color: color.textPrimary, fontSize: font.body, fontVariant: ['tabular-nums'] },
  timeHint: { color: color.tint, fontSize: font.subheadline },
  value: {
    color: color.textPrimary, fontSize: 22, fontWeight: '700',
    marginTop: 16, marginBottom: 4, fontVariant: ['tabular-nums'],
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 8 },
  endText: { color: color.textTertiary, fontSize: font.footnote },
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
  linkRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    marginTop: 26, minHeight: 44,
  },
  box: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 1,
    borderColor: color.borderControl, alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: { backgroundColor: color.textPrimary, borderColor: color.textPrimary },
  tick: { color: '#000000', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  linkText: { flex: 1 },
  linkTitle: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '500' },
  deleteRow: { marginTop: 32, minHeight: 44, justifyContent: 'center' },
  deleteText: { color: color.danger, fontSize: font.body },
});
