/**
 * The next appointment — the one date this app asks for.
 *
 * An appointment is the highest-intent moment Pattern will ever have:
 * the one recurring reason with external stakes to open the app, and
 * the moment the whole record exists for. The date is kept so Today can
 * surface the summary two days before it, when there is still time to
 * read it and nothing else to do with it. Nothing analyses the date; it
 * is a reminder to the app about when to offer the door, not a fact
 * about anyone's body.
 *
 * A row in Profile under "Your report", and the picker behind it — the
 * iPhone's own date wheel in a bottom card, Done and Clear the only
 * buttons, because every spin already applied. The Today card that asks
 * opens this same picker, so there is one place a date is chosen.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { RowChevron, RowIcon, list, settings } from './SettingsList';
import { Num } from './SummaryCard';
import { EASE_OUT, reduceMotion } from './motion';
import { dateFromISO, iso, todayISO } from './model';
import { fmtDay } from './DayScreen';
import { color, font } from './theme';

export const PREF_APPOINTMENT = 'appointment.date';

export interface AppointmentRowProps {
  /** ISO date, or '' for none */
  value: string;
  onChange: (dateIso: string) => void;
  /** open the picker as soon as the row mounts — Today's card lands here */
  openOnMount?: boolean;
}

export default function AppointmentRow({ value, onChange, openOnMount }: AppointmentRowProps) {
  const [open, setOpen] = useState(!!openOnMount);
  /* the wheel's own draft: it starts at the saved date or tomorrow, and
     nothing is stored until Done — Clear is a real clear */
  const [draft, setDraft] = useState<string>(() => value || iso(new Date(Date.now() + 86400000)));

  const cardIn = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) {
      setDraft(value || iso(new Date(Date.now() + 86400000)));
      Animated.timing(cardIn, {
        toValue: 1, duration: reduceMotion ? 150 : 260, easing: EASE_OUT, useNativeDriver: true,
      }).start();
    }
  }, [open]);
  const close = () => {
    Animated.timing(cardIn, {
      toValue: 0, duration: reduceMotion ? 120 : 170, easing: EASE_OUT, useNativeDriver: true,
    }).start(() => setOpen(false));
  };
  const done = () => {
    Haptics.selectionAsync().catch(() => {});
    onChange(draft);
    close();
  };
  const clear = () => {
    Haptics.selectionAsync().catch(() => {});
    onChange('');
    close();
  };

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={settings.row}
        accessibilityRole="button"
        accessibilityLabel={'Next appointment, ' + (value ? fmtDay(value) : 'not set')}
        accessibilityHint="Opens a date picker. Two days before, Today offers the PDF."
      >
        <RowIcon name="calendar.badge.clock" />
        <View style={settings.rowMain}>
          <Text style={settings.rowLabel}>Next appointment</Text>
          <Text style={settings.rowValue} numberOfLines={1}>
            {value ? <Num>{fmtDay(value)}</Num> : 'Not set'}
          </Text>
          <RowChevron />
        </View>
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <Animated.View style={[styles.scrim, { opacity: cardIn }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} />
          <Animated.View
            style={[
              styles.card,
              {
                transform: reduceMotion ? [] : [{
                  translateY: cardIn.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }),
                }],
              },
            ]}
          >
            <Text style={styles.title}>Next appointment</Text>
            <Text style={styles.sub} allowFontScaling maxFontSizeMultiplier={1.4}>
              Two days before, Today will offer the PDF. Nothing else is
              done with the date.
            </Text>
            <DateTimePicker
              value={dateFromISO(draft)}
              mode="date"
              display="spinner"
              themeVariant="dark"
              minimumDate={dateFromISO(todayISO())}
              onChange={(_, d) => { if (d) setDraft(iso(d)); }}
            />
            <Pressable onPress={done} style={({ pressed }) => [styles.doneBtn, pressed && { opacity: 0.85 }]}
              accessibilityRole="button" accessibilityLabel={'Save ' + fmtDay(draft)}>
              <Text style={styles.doneText}><Num>{'Save ' + fmtDay(draft)}</Num></Text>
            </Pressable>
            {!!value && (
              <Pressable onPress={clear} style={styles.clearBtn}
                accessibilityRole="button" accessibilityLabel="Clear the appointment">
                <Text style={styles.clearText}>Clear</Text>
              </Pressable>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  );
}

/* the row is Profile's (SettingsList); the picker card is the
   reminders' wheel card, so the two date and time pickers in one sheet
   are the same object */
const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  card: {
    backgroundColor: list.surface,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, borderCurve: 'continuous',
    padding: 20, paddingBottom: 34,
  },
  title: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', textAlign: 'center' },
  sub: {
    color: list.tertiary, fontSize: font.footnote, lineHeight: 18,
    textAlign: 'center', marginTop: 4, marginBottom: 4,
  },
  /* the redesign's primary: a white capsule, black words */
  doneBtn: {
    height: 54, borderRadius: 27, borderCurve: 'continuous', backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  doneText: { color: '#000000', fontSize: font.body, fontWeight: '600' },
  clearBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  clearText: { color: color.danger, fontSize: font.subheadline, fontWeight: '500' },
});
