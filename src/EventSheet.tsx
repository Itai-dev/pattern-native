/**
 * "Log something that changed" — the event log.
 *
 * These are EVENTS, not triggers. The app records that something happened
 * and when; it never asserts that one thing caused another, and it never
 * recommends a medication or a dose. A treatment row may carry the user's
 * own sense of whether it helped — that is their report, labelled as such.
 */
import React, { useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import * as db from './db';
import { Press } from './motion';
import {
  EVENT_KINDS, EVENT_LABELS, EventKind, checkinCount, fmtTime, minutesNow, todayISO,
} from './model';
import { color, radius, size } from './theme';

export interface EventSheetProps {
  onDone: () => void;
  onClose: () => void;
}

export default function EventSheet({ onDone, onClose }: EventSheetProps) {
  const [kind, setKind] = useState<EventKind>('flare');
  const [minutes, setMinutes] = useState(minutesNow());
  const [showPicker, setShowPicker] = useState(false);
  const [helped, setHelped] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [link, setLink] = useState(true);

  const todayCheckins = checkinCount(db.getDay(todayISO()));

  const save = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    db.addEvent({
      date: todayISO(),
      h: minutes,
      kind,
      text: text.trim(),
      helped: kind === 'treatment' ? helped : null,
      linked: link && todayCheckins > 0 ? 1 : 0,
    });
    onDone();
  };

  const pickerDate = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);

  return (
    <View style={styles.root}>
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
        <Text style={styles.navTitle} numberOfLines={1}>Something changed</Text>
        <Press
          onPress={save}
          style={styles.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Save event"
        >
          <Text style={[styles.navBtnText, styles.navBtnStrong]}>Save</Text>
        </Press>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
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
            onChange={(_, date) => {
              if (date) setMinutes(date.getHours() * 60 + date.getMinutes());
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
              {helped == null ? 'Too early to say' : helped + ' / 10'}
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

        {todayCheckins > 0 && (
          <Press
            onPress={() => setLink(!link)}
            pressOpacity={0.8}
            style={styles.linkRow}
            accessibilityRole="switch"
            accessibilityState={{ checked: link }}
            accessibilityLabel="Link to today’s check-ins"
          >
            <View style={[styles.box, link && styles.boxOn]}>
              {link && <Text style={styles.tick}>✓</Text>}
            </View>
            <View style={styles.linkText}>
              <Text style={styles.linkTitle}>Link to today’s check-ins</Text>
              <Text style={styles.sub}>
                Kept alongside today’s entries. No cause is implied.
              </Text>
            </View>
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
  navTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  navBtn: { minWidth: 72, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navLeft: { alignItems: 'flex-start' },
  navBtnText: { color: '#5BA8FF', fontSize: 17 },
  navBtnStrong: { fontWeight: '600' },
  body: { padding: size.sheetX, paddingTop: 20, paddingBottom: 40 },
  q: { color: color.textPrimary, fontSize: 15, fontWeight: '600' },
  qLater: { marginTop: 28 },
  sub: { color: color.textSecondary, fontSize: 13, lineHeight: 18, marginTop: 4 },
  kinds: { marginTop: 12, gap: 8 },
  kind: {
    minHeight: 48, borderRadius: 12, borderWidth: 1,
    justifyContent: 'center', paddingHorizontal: 14,
  },
  kindOn: { backgroundColor: color.bgSegmentActive, borderColor: color.textSecondary },
  kindOff: { backgroundColor: color.bgSurface, borderColor: color.borderDivider },
  kindText: { color: color.textPrimary, fontSize: 15 },
  kindTextOn: { fontWeight: '600' },
  timeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 48, marginTop: 10, paddingHorizontal: 14,
    borderRadius: 12, backgroundColor: color.bgSurface,
  },
  timeText: { color: color.textPrimary, fontSize: 17, fontVariant: ['tabular-nums'] },
  timeHint: { color: '#5BA8FF', fontSize: 15 },
  value: {
    color: color.textPrimary, fontSize: 22, fontWeight: '700',
    marginTop: 16, marginBottom: 4, fontVariant: ['tabular-nums'],
  },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2, marginTop: 8 },
  endText: { color: color.textSecondary, fontSize: 12 },
  input: {
    marginTop: 10, minHeight: 60, borderRadius: 12, padding: 12,
    backgroundColor: color.bgSurface, color: color.textPrimary, fontSize: 15,
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
  linkTitle: { color: color.textPrimary, fontSize: 15 },
});
