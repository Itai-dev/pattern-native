/**
 * Medicines — the list Pattern keeps, from Profile (1 Oct 2026).
 *
 * A name, the amount in the person's own words, the times, and whether
 * to be reminded. That is all: no drug database, no dose checker, no
 * interaction warnings. Each of those would be Pattern knowing
 * something about medicine, and it does not — it keeps the record of
 * what the person said they take and when, so the doses can sit beside
 * their pain (doses.ts) and the reminder can ask whether it happened.
 *
 * No times means "as needed": no reminder, and a dose is logged from
 * Today when it is taken. A deleted medicine keeps the doses already
 * logged on their days.
 */
import React, { useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import * as db from './db';
import { Press } from './motion';
import { fmtClock } from './clock';
import { track } from './analytics';
import {
  MEDS_MAX, MED_DOSE_MAX, MED_NAME_MAX, MED_TIMES_MAX, Medication, cleanTimes,
} from './meds';
import { enableMedReminders, syncMedReminders } from './medReminders';
import { color, font, radius, size } from './theme';

export interface MedicationsSheetProps {
  onDone: () => void;
}

/** the form's starting point for a new medicine: eight in the morning,
 *  reminded — the commonest schedule testers described, and every part
 *  of it one tap to change */
const blank = (): Medication => ({ id: Date.now(), name: '', dose: '', times: [8 * 60], remind: true });

export default function MedicationsSheet({ onDone }: MedicationsSheetProps) {
  const [meds, setMeds] = useState<Medication[]>(() => db.getMedications());
  const [draft, setDraft] = useState<Medication | null>(null);
  const [picking, setPicking] = useState<number | null>(null);
  const isNew = !!draft && !meds.some((m) => m.id === draft.id);

  const save = async () => {
    if (!draft || !draft.name.trim()) return;
    if (draft.remind && draft.times.length && !(await enableMedReminders())) {
      Alert.alert('Notifications are off for Pattern',
        'Turn them on in iPhone Settings and the reminder will start. The medicine is saved.');
    }
    if (!db.saveMedication(draft)) {
      Alert.alert('That is the most Pattern keeps', 'Up to ' + MEDS_MAX + ' medicines.');
      return;
    }
    /* that one was added or changed — never its name */
    track(isNew ? 'med_added' : 'med_edited');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setMeds(db.getMedications());
    setDraft(null);
    setPicking(null);
    syncMedReminders().catch(() => {});
  };

  const remove = (m: Medication) => {
    Alert.alert('Remove ' + m.name + '?',
      'Doses you already logged stay on their days.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive', onPress: () => {
            db.removeMedication(m.id);
            track('med_removed');
            setMeds(db.getMedications());
            setDraft(null);
            syncMedReminders().catch(() => {});
          },
        },
      ]);
  };

  const setTime = (i: number, minutes: number) => {
    if (!draft) return;
    const times = draft.times.slice();
    times[i] = minutes;
    setDraft({ ...draft, times: cleanTimes(times) });
  };

  if (draft) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.root}>
        <View style={styles.navBar}>
          <Press onPress={() => { setDraft(null); setPicking(null); }} hitSlop={10}
            accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.navAction}>Cancel</Text>
          </Press>
          <Text style={styles.navTitle}>{isNew ? 'Add a medicine' : draft.name}</Text>
          <Press onPress={save} disabled={!draft.name.trim()} hitSlop={10}
            accessibilityRole="button" accessibilityLabel="Save"
            accessibilityState={{ disabled: !draft.name.trim() }}>
            <Text style={[styles.navAction, styles.navStrong, !draft.name.trim() && { opacity: 0.4 }]}>Save</Text>
          </Press>
        </View>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>Name</Text>
          <TextInput value={draft.name} autoFocus={isNew}
            onChangeText={(t) => setDraft({ ...draft, name: t.slice(0, MED_NAME_MAX) })}
            placeholder="As it says on the box" placeholderTextColor={color.textTertiary}
            style={styles.input} accessibilityLabel="Name" />
          <Text style={styles.label}>Amount <Text style={styles.opt}>optional</Text></Text>
          <TextInput value={draft.dose}
            onChangeText={(t) => setDraft({ ...draft, dose: t.slice(0, MED_DOSE_MAX) })}
            placeholder="In your words — “one tablet”" placeholderTextColor={color.textTertiary}
            style={styles.input} accessibilityLabel="Amount, optional" />

          <Text style={styles.label}>When</Text>
          {draft.times.map((t, i) => (
            <View key={t + '-' + i}>
              <View style={styles.timeRow}>
                <Press onPress={() => setPicking(picking === i ? null : i)} style={styles.timeBtn}
                  accessibilityRole="button" accessibilityLabel={'Time ' + fmtClock(t) + ', change'}>
                  <Text style={styles.timeText}>{fmtClock(t)}</Text>
                </Press>
                <Press onPress={() => { setPicking(null); setDraft({ ...draft, times: draft.times.filter((_, j) => j !== i) }); }}
                  hitSlop={8} accessibilityRole="button" accessibilityLabel={'Remove ' + fmtClock(t)}>
                  <Text style={styles.removeTime}>Remove</Text>
                </Press>
              </View>
              {picking === i && (
                <DateTimePicker
                  value={new Date(2000, 0, 1, Math.floor(t / 60), t % 60)}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="dark"
                  onChange={(_, d) => { if (d) setTime(i, d.getHours() * 60 + d.getMinutes()); }}
                />
              )}
            </View>
          ))}
          {draft.times.length < MED_TIMES_MAX && (
            <Press onPress={() => {
              const last = draft.times[draft.times.length - 1];
              const next = last == null ? 8 * 60 : Math.min(last + 4 * 60, 23 * 60);
              setDraft({ ...draft, times: cleanTimes(draft.times.concat(next)) });
            }} accessibilityRole="button" accessibilityLabel="Add a time">
              <Text style={styles.link}>Add a time</Text>
            </Press>
          )}
          {!draft.times.length && (
            <Text style={styles.fine}>No times: taken as needed. Log it on Today when you take it.</Text>
          )}

          {draft.times.length > 0 && (
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>Remind me</Text>
              <Switch value={draft.remind} onValueChange={(on) => setDraft({ ...draft, remind: on })}
                trackColor={{ true: color.tint, false: color.bgSegmentActive }} />
            </View>
          )}
          <Text style={styles.fine}>
            The reminder shows the time, never the medicine’s name. Pattern keeps what you say
            you took; it does not check doses or suggest changes.
          </Text>

          {!isNew && (
            <Press onPress={() => remove(draft)} style={styles.danger}
              accessibilityRole="button" accessibilityLabel={'Remove ' + draft.name}>
              <Text style={styles.dangerText}>Remove this medicine</Text>
            </Press>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <View style={{ width: 56 }} />
        <Text style={styles.navTitle}>Medicines</Text>
        <Press onPress={onDone} hitSlop={10} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={[styles.navAction, styles.navStrong]}>Done</Text>
        </Press>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.lead}>
          What you take and when. Each dose you mark sits beside your pain, so over a few
          weeks you can see what the check-ins before and after it looked like.
        </Text>
        {meds.map((m) => (
          <Press key={m.id} onPress={() => setDraft({ ...m })} style={styles.medRow}
            accessibilityRole="button" accessibilityLabel={'Edit ' + m.name}>
            <View style={{ flex: 1 }}>
              <Text style={styles.medName}>{m.name}{m.dose ? ' · ' + m.dose : ''}</Text>
              <Text style={styles.medTimes}>
                {m.times.length ? m.times.map(fmtClock).join(', ') + (m.remind ? ' · reminded' : '') : 'As needed'}
              </Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Press>
        ))}
        {meds.length < MEDS_MAX && (
          <Press onPress={() => setDraft(blank())} style={styles.primary}
            accessibilityRole="button" accessibilityLabel="Add a medicine">
            <Text style={styles.primaryText}>Add a medicine</Text>
          </Press>
        )}
        <Text style={styles.fine}>
          Using Apple Health’s Medications too? Pattern reads those as well, and counts a
          dose once when both have it.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: size.sheetX, paddingTop: 14, paddingBottom: 6,
  },
  navAction: { color: color.tint, fontSize: font.body, minWidth: 56 },
  navStrong: { fontWeight: '600', textAlign: 'right' },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', flexShrink: 1 },
  body: { paddingHorizontal: size.sheetX, paddingTop: 14, paddingBottom: 40, gap: 10 },
  lead: { color: color.textSecondary, fontSize: font.body, lineHeight: 22, marginBottom: 6 },
  label: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600', marginTop: 8 },
  opt: { color: color.textTertiary, fontWeight: '400' },
  input: {
    color: color.textPrimary, fontSize: font.body, backgroundColor: color.bgSurface,
    borderRadius: radius.button, borderCurve: 'continuous', paddingHorizontal: 14,
    paddingVertical: 12, minHeight: 48,
  },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timeBtn: {
    backgroundColor: color.bgSurface, borderRadius: radius.button, borderCurve: 'continuous',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  timeText: { color: color.textPrimary, fontSize: font.body, fontVariant: ['tabular-nums'] },
  removeTime: { color: color.textSecondary, fontSize: font.subheadline },
  link: { color: color.tint, fontSize: font.body, paddingVertical: 6 },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8,
  },
  switchLabel: { color: color.textPrimary, fontSize: font.body },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 4 },
  medRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: color.bgSurface,
    borderRadius: radius.button, borderCurve: 'continuous', padding: 14,
  },
  medName: { color: color.textPrimary, fontSize: font.body, fontWeight: '500' },
  medTimes: { color: color.textSecondary, fontSize: font.footnote, marginTop: 2 },
  chev: { color: color.textTertiary, fontSize: 22, marginLeft: 8 },
  /* white on every theme — a button is not a pain value */
  primary: {
    minHeight: size.buttonH, borderRadius: size.buttonH / 2, borderCurve: 'continuous',
    backgroundColor: color.textPrimary, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
  danger: { marginTop: 24, alignItems: 'center', paddingVertical: 12 },
  dangerText: { color: '#FF6961', fontSize: font.body },
});
