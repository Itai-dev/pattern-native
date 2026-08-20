/**
 * "Something changed" — the event log. Three kinds:
 *   flare      → what it felt like (the SOCRATES Character answer)
 *   treatment  → what you tried and whether it seemed to help (the "Tried"
 *                answer every clinician asks for)
 *   activity   → something unusual worth remembering
 *
 * Everything optional beyond the kind; a bare flare with no words is a
 * complete answer.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import * as db from './db';
import { Press } from './motion';
import { EventKind, QUALITYIDS, QUALITY_NAMES, minutesNow, todayISO } from './model';
import { color, radius, size, theme } from './theme';

const KINDS: { k: EventKind; label: string }[] = [
  { k: 'flare', label: 'Flare' },
  { k: 'treatment', label: 'Tried something' },
  { k: 'activity', label: 'Unusual activity' },
];

export default function EventSheet({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<EventKind>('flare');
  const [quality, setQuality] = useState<string[]>([]);
  const [helped, setHelped] = useState<number | null>(null);
  const [text, setText] = useState('');

  const save = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    db.addEvent({
      date: todayISO(), h: minutesNow(), kind,
      text: text.trim(),
      quality: kind === 'flare' && quality.length ? quality : undefined,
      helped: kind === 'treatment' ? helped : null,
    });
    onDone();
  };

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Something changed</Text>

        <View style={styles.seg}>
          {KINDS.map(({ k, label }) => (
            <Press
              key={k}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setKind(k); }}
              pressOpacity={0.8}
              style={[styles.segItem, kind === k && styles.segOn]}
            >
              <Text style={[styles.segText, kind === k && styles.segTextOn]}>{label}</Text>
            </Press>
          ))}
        </View>

        {kind === 'flare' && (
          <>
            <Text style={styles.q}>What did it feel like?</Text>
            <View style={styles.chipWrap}>
              {QUALITYIDS.map((id) => {
                const on = quality.indexOf(id) >= 0;
                return (
                  <Press
                    key={id}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setQuality(on ? quality.filter((x) => x !== id) : quality.concat(id));
                    }}
                    pressOpacity={0.8}
                    style={[styles.chip, on
                      ? { backgroundColor: theme.ramp[7], borderColor: 'transparent' }
                      : { backgroundColor: color.bgSurface, borderColor: color.borderDivider }]}
                  >
                    <Text style={[styles.chipText, on && { color: '#FFFFFF' }]}>{QUALITY_NAMES[id]}</Text>
                  </Press>
                );
              })}
            </View>
          </>
        )}

        {kind === 'treatment' && (
          <>
            <Text style={styles.q}>Did it seem to help?</Text>
            <Text style={styles.val}>{helped == null ? 'Too early to say' : helped + ' / 10'}</Text>
            <Slider value={helped == null ? 5 : helped} onChange={setHelped} />
            <View style={styles.ends}>
              <Text style={styles.endText}>Not at all</Text>
              <Text style={styles.endText}>Completely</Text>
            </View>
          </>
        )}

        <Text style={[styles.q, { marginTop: 22 }]}>
          {kind === 'treatment' ? 'What did you try?' : 'A few words, if you want them kept'}
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={kind === 'treatment' ? 'e.g. heat pack, physio session, new stretch' : 'Optional'}
          placeholderTextColor={color.textTertiary}
          style={styles.input}
          multiline
        />

        <Press onPress={save} pressScale={0.985} style={styles.primary}>
          <Text style={styles.primaryText}>Save</Text>
        </Press>
      </ScrollView>

      <Press onPress={onDone} style={styles.done}>
        <Text style={styles.doneText}>Cancel</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  body: { padding: size.sheetX, paddingTop: 22, paddingBottom: 8 },
  title: { color: color.textPrimary, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  seg: {
    flexDirection: 'row', gap: 2, backgroundColor: color.bgSegmentTrack,
    borderRadius: 11, padding: 2, marginTop: 16,
  },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 9 },
  segOn: { backgroundColor: color.bgSegmentActive },
  segText: { color: color.textSecondary, fontSize: 13 },
  segTextOn: { color: color.textPrimary, fontWeight: '600' },
  q: { color: color.textPrimary, fontSize: 15, marginTop: 22 },
  val: { color: color.textSecondary, fontSize: 13, marginTop: 2 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  chipText: { color: '#D0D0D6', fontSize: 14, fontWeight: '500' },
  ends: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  endText: { color: color.textTertiary, fontSize: 11 },
  input: {
    marginTop: 10, minHeight: 56, borderRadius: 12, padding: 12,
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
