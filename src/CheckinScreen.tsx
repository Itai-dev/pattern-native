/**
 * The check-in, ported from the PWA with its rules intact:
 *   pain → where → (after 17:00, once a day) capacity → impact
 *
 * The moment is written the instant the pain step ends, so closing anywhere
 * in the chip steps costs taps and never data. Both chip steps are optional —
 * tapping straight through is a complete answer, and an empty impact answer
 * still counts, which is what stops the evening re-ask.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import * as db from './db';
import { CAPWORDS, PAINWORDS, color, radius, size, themes } from './theme';
import {
  FACTORIDS, FACTOR_NAMES, LOCIDS, LOC_NAMES,
  minutesNow, nextEveningStep, todayISO,
} from './model';

type Step = 'pain' | 'where' | 'capacity' | 'impact';

const SQUARE = 150, SQ_RADIUS = 36;

export interface CheckinScreenProps {
  /** minutes since midnight; injected so tests and previews can fix the clock */
  now?: number;
  onDone: () => void;
  onClose: () => void;
}

export default function CheckinScreen({ now, onDone, onClose }: CheckinScreenProps) {
  const [step, setStep] = useState<Step>('pain');
  const [pain, setPain] = useState(5);
  const [cap, setCap] = useState(5);
  const [loc, setLoc] = useState<string[]>([]);
  const [factors, setFactors] = useState<string[]>([]);
  const [writtenAt, setWrittenAt] = useState<number | null>(null);

  const minutes = now != null ? now : minutesNow();
  const ramp = themes.bloom.ramp;
  const isChips = step === 'where' || step === 'impact';

  const title = step === 'pain' ? 'How intense has your pain\nfelt today?'
    : step === 'where' ? 'Where in your body\nwas it?'
    : step === 'capacity' ? 'And how much\ncould you do today?'
    : 'What had an impact\non today?';

  /* the evening questions are asked once a day, in order, and only when they
     are still unanswered — the model decides, not this screen */
  const advanceEvening = () => {
    const next = nextEveningStep(db.getDay(todayISO()), minutes);
    if (next) { setStep(next); return true; }
    return false;
  };

  const onPainNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // durable now; the where step edits this same moment in place
    const h = minutes;
    db.writeMoment(todayISO(), h, pain);
    setWrittenAt(h);
    setStep('where');
  };

  const onWhereSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (writtenAt != null) db.writeMoment(todayISO(), writtenAt, pain, loc);
    if (!advanceEvening()) { onDone(); }
  };

  const onCapNext = (done: boolean) => {
    db.setCap(todayISO(), cap);
    if (done) {
      // "done for today" answers what is left with silence — nothing re-prompts
      const e = db.getDay(todayISO());
      if (e && e.factors == null) db.setFactors(todayISO(), []);
      onDone();
      return;
    }
    if (!advanceEvening()) onDone();
  };

  const onImpactSave = () => {
    db.setFactors(todayISO(), factors);
    onDone();
  };

  const chipIds = step === 'where' ? LOCIDS : FACTORIDS;
  const chipNames = step === 'where' ? LOC_NAMES : FACTOR_NAMES;
  const chosen = step === 'where' ? loc : factors;
  const setChosen = step === 'where' ? setLoc : setFactors;

  const swatchColor = ramp[step === 'capacity' ? (db.getDay(todayISO())?.pain ?? pain) : pain];
  const word = step === 'capacity' ? CAPWORDS[cap] : PAINWORDS[pain];

  const primaryLabel = step === 'pain' ? 'Continue'
    : step === 'where' ? 'Save today'
    : step === 'capacity' ? 'Continue'
    : 'Continue';

  const onPrimary = step === 'pain' ? onPainNext
    : step === 'where' ? onWhereSave
    : step === 'capacity' ? () => onCapNext(false)
    : onImpactSave;

  const chips = useMemo(() => chipIds.map((id) => {
    const on = chosen.indexOf(id) >= 0;
    return (
      <Pressable
        key={id}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setChosen(on ? chosen.filter((x) => x !== id) : chosen.concat(id));
        }}
        style={[
          styles.chip,
          on
            ? { backgroundColor: ramp[pain], borderColor: 'transparent' }
            : { backgroundColor: color.bgSurface, borderColor: color.borderDivider },
        ]}
      >
        <Text style={[styles.chipText, on && { color: pain <= themes.bloom.inkAbove ? '#000000' : '#FFFFFF' }]}>
          {chipNames[id] || id}
        </Text>
      </Pressable>
    );
  }), [chipIds, chipNames, chosen, pain, ramp, setChosen]);

  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onClose} style={styles.close} hitSlop={10}>
          <Text style={styles.closeGlyph}>✕</Text>
        </Pressable>
      </View>

      <Text style={styles.title}>{title}</Text>

      {isChips ? (
        <>
          <Text style={styles.hint}>Optional — tap all that apply</Text>
          <ScrollView contentContainerStyle={styles.chipWrap} showsVerticalScrollIndicator={false}>
            {chips}
          </ScrollView>
        </>
      ) : (
        <View style={styles.middle}>
          <View style={[styles.square, { backgroundColor: swatchColor }]} />
          <Text style={styles.word}>{word}</Text>
        </View>
      )}

      <View style={styles.bottom}>
        {!isChips && (
          <>
            <Slider
              value={step === 'capacity' ? cap : pain}
              onChange={step === 'capacity' ? setCap : setPain}
            />
            <View style={styles.ends}>
              <Text style={styles.endText}>{step === 'capacity' ? CAPWORDS[0] : PAINWORDS[0]}</Text>
              <Text style={styles.endText}>{step === 'capacity' ? CAPWORDS[10] : PAINWORDS[10]}</Text>
            </View>
          </>
        )}
        <Pressable onPress={onPrimary} style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}>
          <Text style={styles.primaryText}>{primaryLabel}</Text>
        </Pressable>
        {step === 'capacity' && (
          <Pressable onPress={() => onCapNext(true)} style={styles.quiet}>
            <Text style={styles.quietText}>Done for today</Text>
          </Pressable>
        )}
        {step === 'pain' && pain >= 7 && (
          <Pressable
            onPress={() => {
              db.writeMoment(todayISO(), minutes, pain);
              onDone();
            }}
            style={styles.quiet}
          >
            <Text style={styles.quietText}>A hard day? Save and close — this is enough.</Text>
          </Pressable>
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
