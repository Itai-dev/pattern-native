/**
 * The week, in three validated questions — PEG (pain average, enjoyment of
 * life, general activity; 0–10; score = mean) — plus ability at the one
 * activity the user wants back, and an optional "what seemed to help".
 *
 * This replaces the retired daily capacity slider: one honest weekly answer
 * beats seven rushed nightly ones, and clinicians recognise PEG on sight.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import * as db from './db';
import { Press } from './motion';
import { mondayOf, todayISO } from './model';
import { color, radius, size } from './theme';

const QUESTIONS: { key: 'pegPain' | 'pegEnjoy' | 'pegActivity'; text: string; low: string; high: string }[] = [
  { key: 'pegPain', text: 'Your average pain this week', low: 'No pain', high: 'Worst imaginable' },
  { key: 'pegEnjoy', text: 'How much pain interfered with your enjoyment of life', low: 'Not at all', high: 'Completely' },
  { key: 'pegActivity', text: 'How much pain interfered with your general activity', low: 'Not at all', high: 'Completely' },
];

export default function WeeklySheet({ onDone }: { onDone: () => void }) {
  const goalText = db.getGoal();
  const [v, setV] = useState({ pegPain: 5, pegEnjoy: 5, pegActivity: 5, goal: 5 });
  const [note, setNote] = useState('');

  const save = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    db.putWeekly({
      week: mondayOf(todayISO()),
      pegPain: v.pegPain, pegEnjoy: v.pegEnjoy, pegActivity: v.pegActivity,
      goal: goalText ? v.goal : null,
      note: note.trim(),
    });
    onDone();
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Your week, in three questions</Text>
        <Text style={styles.sub}>Thinking about the past week. There are no wrong answers.</Text>

        {QUESTIONS.map((q) => (
          <View key={q.key} style={styles.block}>
            <Text style={styles.q}>{q.text}</Text>
            <Text style={styles.val}>{v[q.key]}</Text>
            <Slider value={v[q.key]} onChange={(n) => setV({ ...v, [q.key]: n })} />
            <View style={styles.ends}>
              <Text style={styles.endText}>{q.low}</Text>
              <Text style={styles.endText}>{q.high}</Text>
            </View>
          </View>
        ))}

        {goalText && (
          <View style={styles.block}>
            <Text style={styles.q}>How able were you to {goalText}?</Text>
            <Text style={styles.val}>{v.goal}</Text>
            <Slider value={v.goal} onChange={(n) => setV({ ...v, goal: n })} />
            <View style={styles.ends}>
              <Text style={styles.endText}>Not at all</Text>
              <Text style={styles.endText}>Fully</Text>
            </View>
          </View>
        )}

        <Text style={[styles.q, { marginTop: 26 }]}>What seemed to help, if anything?</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Optional — a few words is plenty"
          placeholderTextColor={color.textTertiary}
          style={styles.input}
          multiline
        />

        <Press onPress={save} pressScale={0.985} style={styles.primary}>
          <Text style={styles.primaryText}>Save my week</Text>
        </Press>
      </ScrollView>

      <Press onPress={onDone} style={styles.done}>
        <Text style={styles.doneText}>Not now</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  body: { padding: size.sheetX, paddingTop: 22, paddingBottom: 8 },
  title: { color: color.textPrimary, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  sub: { color: color.textTertiary, fontSize: 13, lineHeight: 19, marginTop: 4 },
  block: { marginTop: 26 },
  q: { color: color.textPrimary, fontSize: 15, lineHeight: 21 },
  val: { color: color.textSecondary, fontSize: 13, marginTop: 2, marginBottom: 2 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  endText: { color: color.textTertiary, fontSize: 11 },
  input: {
    marginTop: 10, minHeight: 64, borderRadius: 12, padding: 12,
    backgroundColor: color.bgSurface, color: color.textPrimary, fontSize: 15,
    textAlignVertical: 'top',
  },
  primary: {
    height: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 28,
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  done: { paddingVertical: 14, alignItems: 'center' },
  doneText: { color: color.textTertiary, fontSize: 14 },
});
