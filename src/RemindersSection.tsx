/**
 * Reminders — one switch, and the details behind it.
 *
 * Three checkbox-and-time rows was the full mechanism shown as the whole
 * interface. Most people want one thing from this screen: reminders on,
 * or off. So that is the first row — a single switch that enables the
 * evening slot, the default the onboarding copy has always offered — and
 * Customise times unfolds the three slots for anyone who wants their
 * mornings too.
 *
 * Every change still applies immediately: the phone's notification queue
 * is rewritten to match the saved settings, so what iOS holds and what
 * the screen shows can never drift apart. Tapping a time still opens the
 * iPhone's own spinner, because a schedule deserves the control iOS
 * users already know.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { EASE_OUT, reduceMotion } from './motion';
import * as db from './db';
import {
  DEFAULT_SLOTS, Slot, ensurePermission, fmt, hasPermission, reschedule,
} from './reminders';
import { color, font, radius } from './theme';

const PREF = 'reminders.slots';
const LABELS: Record<Slot['key'], string> = { m: 'Morning', d: 'Midday', e: 'Evening' };

export default function RemindersSection() {
  const [slots, setSlots] = useState<Slot[]>(() => db.getPref<Slot[]>(PREF, DEFAULT_SLOTS));
  const [status, setStatus] = useState('');
  const [picking, setPicking] = useState<Slot['key'] | null>(null);
  /* the slot rows start folded unless something beyond the default is
     already customised — then hiding them would hide live settings */
  const [customising, setCustomising] = useState<boolean>(() => {
    const saved = db.getPref<Slot[]>(PREF, DEFAULT_SLOTS);
    return saved.some((sl) => sl.on && sl.key !== 'e');
  });

  const anyOn = slots.some((sl) => sl.on);

  /* the master switch: on = the evening slot at its saved time, off = all
     of them. It never forgets a customised schedule — the slot config
     stays in prefs, and only the on-flags move. */
  const toggleAll = () => {
    Haptics.selectionAsync().catch(() => {});
    if (anyOn) apply(slots.map((sl) => ({ ...sl, on: false })));
    else apply(slots.map((sl) => ({ ...sl, on: sl.key === 'e' })));
  };

  /* Restore the saved schedule once, on mount — but never prompt here: a
     permission sheet on launch is an ambush. Toggling a slot is what asks,
     because there the question explains itself. */
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
    db.setPref(PREF, next); // the user's choices are stored before anything can fail
    const wanted = next.filter((s) => s.on);
    if (wanted.length && !(await ensurePermission())) {
      setStatus('Notifications are off for Pattern — turn them on in iPhone Settings.');
      return;
    }
    await reschedule(next);
    setStatus(wanted.length ? 'On ✓ ' + wanted.map(fmt).join(' · ') : 'Off');
  }, []);

  const toggle = (key: Slot['key']) => {
    Haptics.selectionAsync().catch(() => {});
    apply(slots.map((s) => (s.key === key ? { ...s, on: !s.on } : s)));
  };

  const setTime = (key: Slot['key'], date: Date) => {
    apply(slots.map((s) => (s.key === key
      ? { ...s, hour: date.getHours(), minute: date.getMinutes() }
      : s)));
  };

  const pickingSlot = slots.find((s) => s.key === picking) || null;

  /* The picker card lives at the bottom edge, so it enters and leaves
     through it — scrim fades while the card slides, both on the strong
     curve. Under reduced motion the slide becomes a plain cross-fade. */
  const cardIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (pickingSlot) {
      Animated.timing(cardIn, {
        toValue: 1, duration: reduceMotion ? 150 : 260, easing: EASE_OUT, useNativeDriver: true,
      }).start();
    }
  }, [!!pickingSlot]);
  const closePicker = useCallback(() => {
    Animated.timing(cardIn, {
      toValue: 0, duration: reduceMotion ? 120 : 170, easing: EASE_OUT, useNativeDriver: true,
    }).start(() => setPicking(null));
  }, [cardIn]);

  return (
    <View style={styles.root}>
      {/* the group's header names the section — in here only the status */}
      <Text style={styles.sub}>
        {status || 'Gentle notifications at your times. Scheduled on this phone — nothing is sent anywhere.'}
      </Text>

      {/* the one decision most people came for */}
      <View style={styles.row}>
        <Pressable onPress={toggleAll} style={styles.left} hitSlop={6}
          accessibilityRole="switch" accessibilityState={{ checked: anyOn }}
          accessibilityLabel="Daily reminder">
          <View style={[styles.box, anyOn && styles.boxOn]}>
            {anyOn && <Text style={styles.tick}>✓</Text>}
          </View>
          <Text style={styles.label}>Daily reminder</Text>
        </Pressable>
        <Pressable
          onPress={() => { Haptics.selectionAsync().catch(() => {}); setCustomising(!customising); }}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityState={{ expanded: customising }}
          accessibilityLabel="Customise times"
        >
          <Text style={styles.customise}>{customising ? 'Done' : 'Customise'}</Text>
        </Pressable>
      </View>

      {customising && slots.map((s) => (
        <View key={s.key} style={styles.row}>
          <Pressable onPress={() => toggle(s.key)} style={styles.left} hitSlop={6}>
            <View style={[styles.box, s.on && styles.boxOn]}>
              {s.on && <Text style={styles.tick}>✓</Text>}
            </View>
            <Text style={styles.label}>{LABELS[s.key]}</Text>
          </Pressable>
          <Pressable onPress={() => setPicking(s.key)} style={styles.time} hitSlop={6}>
            <Text style={styles.timeText}>{fmt(s)}</Text>
          </Pressable>
        </View>
      ))}

      {/* the iPhone's own wheel, in a bottom card — Done is the only button,
          because every spin already applied */}
      <Modal visible={!!pickingSlot} transparent animationType="none" onRequestClose={closePicker}>
        <Animated.View style={[styles.scrim, { opacity: cardIn }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closePicker} />
          <Animated.View
            style={[
              styles.pickerCard,
              {
                transform: reduceMotion ? [] : [{
                  translateY: cardIn.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }),
                }],
              },
            ]}
          >
            {pickingSlot && (
              <>
                <Text style={styles.pickerTitle}>{LABELS[pickingSlot.key]}</Text>
                <DateTimePicker
                  value={new Date(2000, 0, 1, pickingSlot.hour, pickingSlot.minute)}
                  mode="time"
                  display="spinner"
                  themeVariant="dark"
                  onChange={(_, date) => { if (date) setTime(pickingSlot.key, date); }}
                />
                <Pressable onPress={closePicker} style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}>
                  <Text style={styles.doneText}>Done</Text>
                </Pressable>
              </>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  sub: { color: color.textTertiary, fontSize: 13, lineHeight: 18, marginBottom: 4 },
  customise: { color: color.tint, fontSize: font.subheadline, fontWeight: '500' },
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
  scrim: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    backgroundColor: color.bgSheet,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 34,
  },
  pickerTitle: { color: color.textSecondary, fontSize: font.footnote, textAlign: 'center', marginBottom: 4 },
  doneBtn: {
    height: 50, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  doneText: { color: '#000000', fontSize: font.body, fontWeight: '600' },
});
