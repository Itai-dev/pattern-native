/**
 * The reminder rows: three slots, each a checkbox and a time.
 * Every change applies immediately — the phone's queue is rewritten to match
 * the saved settings, so what iOS holds and what the screen shows can never
 * drift apart. Tapping a time steps it by 30 minutes, which is enough control
 * for a nudge and avoids dragging a whole picker into this build.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as db from './db';
import { DEFAULT_SLOTS, Slot, ensurePermission, fmt, hasPermission, reschedule } from './reminders';
import { color, radius, size } from './theme';

const PREF = 'reminders.slots';
const LABELS: Record<Slot['key'], string> = { m: 'Morning', d: 'Midday', e: 'Evening' };

export default function RemindersSection() {
  const [slots, setSlots] = useState<Slot[]>(() => db.getPref<Slot[]>(PREF, DEFAULT_SLOTS));
  const [status, setStatus] = useState('');

  /* Bring the phone's queue in line with what was saved, once, on mount —
     but never prompt here: a permission sheet on launch is an ambush, and
     scheduling without permission would fail silently. Toggling a slot is
     what asks, because there the question explains itself. */
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!slots.some((s) => s.on)) return;
      if (!(await hasPermission())) {
        if (alive) setStatus('Notifications are off for Pattern — turn them on in iPhone Settings.');
        return;
      }
      await reschedule(slots);
      if (alive) setStatus('On ✓ ' + slots.filter((s) => s.on).map(fmt).join(' · '));
    })().catch(() => {});
    return () => { alive = false; };
  }, []);

  const apply = useCallback(async (next: Slot[]) => {
    setSlots(next);
    db.setPref(PREF, next);
    const wanted = next.filter((s) => s.on);
    if (wanted.length && !(await ensurePermission())) {
      setStatus('Notifications are off for Pattern — turn them on in iPhone Settings.');
      return;
    }
    await reschedule(next);
    setStatus(wanted.length
      ? 'On ✓ ' + wanted.map(fmt).join(' · ')
      : 'Off');
  }, []);

  const toggle = (key: Slot['key']) => {
    Haptics.selectionAsync().catch(() => {});
    apply(slots.map((s) => (s.key === key ? { ...s, on: !s.on } : s)));
  };

  const bump = (key: Slot['key']) => {
    Haptics.selectionAsync().catch(() => {});
    apply(slots.map((s) => {
      if (s.key !== key) return s;
      const total = (s.hour * 60 + s.minute + 30) % (24 * 60);
      return { ...s, hour: Math.floor(total / 60), minute: total % 60 };
    }));
  };

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Daily reminders</Text>
      <Text style={styles.sub}>
        {status || 'Gentle notifications at your times. Scheduled on this phone — nothing is sent anywhere.'}
      </Text>
      {slots.map((s) => (
        <View key={s.key} style={styles.row}>
          <Pressable onPress={() => toggle(s.key)} style={styles.left} hitSlop={6}>
            <View style={[styles.box, s.on && styles.boxOn]}>
              {s.on && <Text style={styles.tick}>✓</Text>}
            </View>
            <Text style={styles.label}>{LABELS[s.key]}</Text>
          </Pressable>
          <Pressable onPress={() => bump(s.key)} style={styles.time} hitSlop={6}>
            <Text style={styles.timeText}>{fmt(s)}</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: size.pageX, marginTop: 28 },
  title: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  sub: { color: color.textTertiary, fontSize: 13, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 44, gap: 10 },
  left: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    width: 22, height: 22, borderRadius: 7, borderWidth: 1,
    borderColor: color.borderControl, alignItems: 'center', justifyContent: 'center',
  },
  boxOn: { backgroundColor: color.textPrimary, borderColor: color.textPrimary },
  tick: { color: '#000000', fontSize: 13, fontWeight: '700', lineHeight: 16 },
  label: { color: color.textPrimary, fontSize: 15 },
  time: {
    backgroundColor: '#323234', borderRadius: radius.segment,
    paddingVertical: 7, paddingHorizontal: 12,
  },
  timeText: { color: color.textPrimary, fontSize: 15 },
});
