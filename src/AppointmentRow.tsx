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
 *
 * THE OCTOBER REDESIGN (21 Oct 2026). The picker is a sheet of the
 * check-in's family: the #0E0E10 ground, 28pt corners and a grabber, the
 * white 54pt capsule for Save with the date in the rounded face, and
 * Clear as a quiet grey word — it was the danger orange, and a hue in
 * this app is a pain value; clearing a date is not one, and it is undone
 * by setting it again. The row keeps Profile's geometry so it lines up
 * with its neighbours, with the calendar as a white SF Symbol.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { RowChevron, RowIcon, settings } from './SettingsList';
import { Num, summary } from './SummaryCard';
import { EASE_OUT, reduceMotion } from './motion';
import { dateFromISO, iso, todayISO } from './model';
import { fmtDay } from './DayScreen';
import { color, font } from './theme';

/** the check-in sheet's ground — see CheckinScreen's SHEET_BG */
const SHEET_BG = '#0E0E10';
/** the redesign's capsule height */
const BUTTON_H = 54;

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
            <View style={styles.grabber} accessibilityElementsHidden importantForAccessibility="no" />
            <Text style={styles.title} accessibilityRole="header">Next appointment</Text>
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
            <Pressable onPress={done} style={({ pressed }) => [styles.doneBtn, pressed && styles.pressed]}
              accessibilityRole="button" accessibilityLabel={'Save ' + fmtDay(draft)}>
              <Text style={styles.doneText} maxFontSizeMultiplier={1.4}>
                <Num>{'Save ' + fmtDay(draft)}</Num>
              </Text>
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
  /* a sheet: the redesign's 28pt corners and the check-in's ground */
  card: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, borderCurve: 'continuous',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 34,
  },
  grabber: {
    width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12,
    backgroundColor: color.borderControl,
  },
  title: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', textAlign: 'center' },
  sub: {
    color: summary.tertiary, fontSize: font.footnote, lineHeight: 18,
    textAlign: 'center', marginTop: 4, marginBottom: 4,
  },
  /* the one filled action: white, black words, a capsule */
  doneBtn: {
    minHeight: BUTTON_H, borderRadius: BUTTON_H / 2, borderCurve: 'continuous',
    backgroundColor: color.textPrimary, paddingHorizontal: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  doneText: { color: '#000000', fontSize: font.body, fontWeight: '600' },
  clearBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  clearText: { color: summary.secondary, fontSize: font.subheadline, fontWeight: '600' },
});
