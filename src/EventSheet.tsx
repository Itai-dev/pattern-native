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
  EVENT_KINDS, EVENT_LABELS, EventKind, PainEvent, checkinCount, fmtTime,
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
          {EVENT_KINDS.map((k) => {
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

        <Text style={[styles.q, styles.qLater]}>
          {kind === 'treatment' ? 'What did you try?' : 'A short note'}
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
    minHeight: 48, borderRadius: 12, borderWidth: 1,
    justifyContent: 'center', paddingHorizontal: 14,
  },
  kindOn: { backgroundColor: color.bgSegmentActive, borderColor: color.textSecondary },
  kindOff: { backgroundColor: color.bgSurface, borderColor: color.borderDivider },
  kindText: { color: color.textPrimary, fontSize: font.subheadline },
  kindTextOn: { fontWeight: '600' },
  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 48, marginTop: 10, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: color.bgSurface,
  },
  timeText: { color: color.textPrimary, fontSize: font.body, fontVariant: ['tabular-nums'] },
  timeHint: { color: color.tint, fontSize: font.subheadline },
  value: {
    color: color.textPrimary, fontSize: 22, fontWeight: '700',
    marginTop: 16, marginBottom: 4, fontVariant: ['tabular-nums'],
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 8 },
  endText: { color: color.textTertiary, fontSize: font.footnote },
  input: {
    marginTop: 10, minHeight: 60, borderRadius: 12, padding: 12,
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
