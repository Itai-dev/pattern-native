/**
 * A day's hub: every logged moment on a timeline with its real time,
 * removable in place, plus the day's places, impact and words. Nothing here
 * overwrites silently — you always see what exists before you touch it.
 *
 * Removing a day's last moment removes the day, unless words anchor it: a
 * number with no moment behind it would keep haunting the map and the doctor
 * summary with no way to correct it.
 */
import React from 'react';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { reduceMotion } from './motion';
import DaySquare from './DaySquare';
import * as db from './db';
import {
  Entry, FACTOR_NAMES, LOC_NAMES, dateFromISO, fmtTime, logsOf, todayISO,
} from './model';
import { CAPWORDS, PAINWORDS, color, radius, size, theme } from './theme';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

function names(ids: string[] | undefined, map: Record<string, string>): string {
  return (ids || []).map((id) => map[id] || id).join(', ');
}

export interface DaySheetProps {
  dateIso: string;
  entry: Entry | null;
  onChanged: () => void;
  onAddLog: () => void;
  onAddCapacity: () => void;
  onClose: () => void;
}

export default function DaySheet({ dateIso, entry, onChanged, onAddLog, onAddCapacity, onClose }: DaySheetProps) {
  const d = dateFromISO(dateIso);
  const isToday = dateIso === todayISO();
  const logs = logsOf(entry);
  /* the places of the day, first-mentioned first, each counted once */
  const seen: Record<string, true> = {};
  const places: string[] = [];
  logs.forEach((l) => (l.loc || []).forEach((id) => { if (!seen[id]) { seen[id] = true; places.push(id); } }));

  const remove = (h: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // the list closes over the gap instead of jumping — a bridge, not a glitch
    if (!reduceMotion) {
      LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    }
    db.dropMoment(dateIso, h);
    onChanged();
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <DaySquare entry={entry} size={40} radius={10} />
          <View style={styles.headerText}>
            <Text style={styles.title}>{DAYS[d.getDay()]} {d.getDate()} {MONTHS[d.getMonth()]}</Text>
            <Text style={styles.word}>{entry ? PAINWORDS[entry.pain] : 'No entry — a missed day is just a missed day.'}</Text>
            {entry?.cap != null && (
              <Text style={styles.meta}>Could do {CAPWORDS[entry.cap].toLowerCase()}</Text>
            )}
            {places.length > 0 && <Text style={styles.meta}>Where: {names(places, LOC_NAMES)}</Text>}
            {entry?.factors && entry.factors.length > 0 && (
              <Text style={styles.meta}>Impact: {names(entry.factors, FACTOR_NAMES)}</Text>
            )}
          </View>
        </View>

        {logs.length > 0 && (
          <View style={styles.timeline}>
            {logs.map((l) => (
              <View key={l.h} style={styles.logRow}>
                <View style={[styles.dot, { backgroundColor: theme.ramp[l.pain] }]} />
                <Text style={styles.logTime}>{fmtTime(l.h)}</Text>
                <View style={styles.logMid}>
                  <Text style={styles.logWord}>{PAINWORDS[l.pain]}</Text>
                  {l.loc && l.loc.length > 0 && (
                    <Text style={styles.logLoc}>{names(l.loc, LOC_NAMES)}</Text>
                  )}
                </View>
                <Pressable onPress={() => remove(l.h)} hitSlop={10} style={styles.remove}>
                  <Text style={styles.removeGlyph}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {entry?.note ? <Text style={styles.note}>“{entry.note}”</Text> : null}

        {isToday && (
          <>
            <Pressable onPress={onAddLog} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
              <Text style={styles.primaryText}>Add a log</Text>
            </Pressable>
            {entry && entry.cap == null && (
              <Pressable onPress={onAddCapacity} style={styles.quiet}>
                <Text style={styles.quietText}>How much could you do today?</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      <Pressable onPress={onClose} style={({ pressed }) => [styles.done, pressed && { opacity: 0.7 }]}>
        <Text style={styles.doneText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  body: { padding: size.sheetX, paddingTop: 22, paddingBottom: 8 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  headerText: { flex: 1, gap: 2 },
  title: { color: color.textPrimary, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  word: { color: color.textSecondary, fontSize: 15 },
  meta: { color: color.textTertiary, fontSize: 13 },
  timeline: {
    marginTop: 14, paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  dot: { width: 14, height: 14, borderRadius: 4 },
  logTime: { color: '#D0D0D6', fontSize: 14, minWidth: 46 },
  logMid: { flex: 1 },
  logWord: { color: color.textSecondary, fontSize: 14 },
  logLoc: { color: color.textTertiary, fontSize: 12 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  removeGlyph: { color: '#636366', fontSize: 13 },
  note: {
    marginTop: 14, paddingTop: 14, color: color.textSecondary, fontSize: 15,
    lineHeight: 23, fontStyle: 'italic',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  primary: {
    height: 48, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 18,
  },
  primaryText: { color: '#000000', fontSize: 15, fontWeight: '600' },
  quiet: { paddingVertical: 14, alignItems: 'center' },
  quietText: { color: color.textTertiary, fontSize: 13 },
  done: { paddingVertical: 16, alignItems: 'center' },
  doneText: { color: color.textSecondary, fontSize: 16 },
});
