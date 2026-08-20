/**
 * The daily check-in: pain → where. Under ten seconds.
 *
 * The moment is written the instant the pain step ends, so closing on the
 * where step costs taps, never data. The where step opens with the most
 * recent places already selected — chronic pain usually lives in the same
 * places, so the common case is one confirming tap, not a nightly re-survey.
 *
 * The old capacity and impact steps are gone on purpose (2026-08-20): PEG
 * asks the capacity question better — weekly, validated — and impact context
 * moved into the flare log, where "what was going on" means something.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import * as db from './db';
import { Press } from './motion';
import { PAINWORDS, color, radius, size, theme } from './theme';
import { LOCIDS, LOC_NAMES, defaultLocs, minutesNow, todayISO } from './model';

const SQUARE = 150, SQ_RADIUS = 36;

export interface CheckinScreenProps {
  /** minutes since midnight; injectable so previews can fix the clock */
  now?: number;
  onDone: () => void;
  onClose: () => void;
}

export default function CheckinScreen({ now, onDone, onClose }: CheckinScreenProps) {
  const [step, setStep] = useState<'pain' | 'where'>('pain');
  const [pain, setPain] = useState(5);
  const [loc, setLoc] = useState<string[]>([]);
  const [writtenAt, setWrittenAt] = useState<number | null>(null);

  const minutes = now != null ? now : minutesNow();
  const ramp = theme.ramp;

  const onPainNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // durable now; the where step edits this same moment in place
    db.writeMoment(todayISO(), minutes, pain);
    setWrittenAt(minutes);
    setLoc(defaultLocs(db.getAll(), todayISO()));
    setStep('where');
  };

  const onWhereSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (writtenAt != null) db.writeMoment(todayISO(), writtenAt, pain, loc);
    onDone();
  };

  const chips = useMemo(() => LOCIDS.map((id) => {
    const on = loc.indexOf(id) >= 0;
    return (
      <Press
        key={id}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setLoc(on ? loc.filter((x) => x !== id) : loc.concat(id));
        }}
        pressOpacity={0.8}
        style={[
          styles.chip,
          on
            ? { backgroundColor: ramp[pain], borderColor: 'transparent' }
            : { backgroundColor: color.bgSurface, borderColor: color.borderDivider },
        ]}
      >
        <Text style={[styles.chipText, on && { color: pain <= theme.inkAbove ? '#000000' : '#FFFFFF' }]}>
          {LOC_NAMES[id] || id}
        </Text>
      </Press>
    );
  }), [loc, pain, ramp]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Press onPress={onClose} style={styles.close} hitSlop={10}>
          <Text style={styles.closeGlyph}>✕</Text>
        </Press>
      </View>

      <Text style={styles.title}>
        {step === 'pain' ? 'How intense has your pain\nfelt today?' : 'Where in your body\nwas it?'}
      </Text>

      {step === 'pain' ? (
        <View style={styles.middle}>
          <View style={[styles.square, { backgroundColor: ramp[pain] }]} />
          <Text style={styles.word}>{PAINWORDS[pain]}</Text>
        </View>
      ) : (
        <>
          <Text style={styles.hint}>Your usual places are pre-selected — adjust if today differs</Text>
          <ScrollView contentContainerStyle={styles.chipWrap} showsVerticalScrollIndicator={false}>
            {chips}
          </ScrollView>
        </>
      )}

      <View style={styles.bottom}>
        {step === 'pain' && (
          <>
            <Slider value={pain} onChange={setPain} />
            <View style={styles.ends}>
              <Text style={styles.endText}>{PAINWORDS[0]}</Text>
              <Text style={styles.endText}>{PAINWORDS[10]}</Text>
            </View>
          </>
        )}
        <Press
          onPress={step === 'pain' ? onPainNext : onWhereSave}
          pressScale={0.985}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>{step === 'pain' ? 'Continue' : 'Save today'}</Text>
        </Press>
        {step === 'pain' && pain >= 7 && (
          <Press
            onPress={() => { db.writeMoment(todayISO(), minutes, pain); onDone(); }}
            style={styles.quiet}
          >
            <Text style={styles.quietText}>A hard day? Save and close — this is enough.</Text>
          </Press>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgRoot, paddingHorizontal: 28, paddingTop: 20, paddingBottom: 30 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end' },
  close: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.borderDivider,
    alignItems: 'center', justifyContent: 'center',
  },
  closeGlyph: { color: color.textSecondary, fontSize: 15, lineHeight: 18 },
  title: {
    color: color.textPrimary, fontSize: 20, fontWeight: '600', letterSpacing: -0.25,
    lineHeight: 27, textAlign: 'center', marginTop: 14,
  },
  hint: { color: color.textTertiary, fontSize: 13, textAlign: 'center', marginTop: 10 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  square: { width: SQUARE, height: SQUARE, borderRadius: SQ_RADIUS },
  word: {
    color: color.textPrimary, fontSize: 22, fontWeight: '600',
    letterSpacing: -0.3, marginTop: 30, textAlign: 'center',
  },
  chipWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9,
    justifyContent: 'center', paddingVertical: 20,
  },
  chip: { paddingVertical: 11, paddingHorizontal: 17, borderRadius: 22, borderWidth: 1 },
  chipText: { color: '#D0D0D6', fontSize: 15, fontWeight: '500' },
  bottom: { flexShrink: 0 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 2 },
  endText: { color: color.textTertiary, fontSize: 12 },
  primary: {
    height: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 26,
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
  quiet: { paddingVertical: 14, alignItems: 'center' },
  quietText: { color: color.textTertiary, fontSize: 13, textAlign: 'center' },
});
