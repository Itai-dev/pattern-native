/**
 * The check-in, in State of Mind's cadence: one question per screen, a
 * living shape under the finger, and chips you tap through rather than
 * forms you fill.
 *
 *   1. How intense?      — slider; the shape moves with the finger, the
 *                          word snaps. The moment is WRITTEN when this
 *                          step ends, so nothing later can lose it.
 *   2. How does it feel? — quality words (SOCRATES "Character", the answer
 *                          every clinician asks for). Optional; Continue
 *                          with nothing selected is a complete answer.
 *   3. Where?            — body places, the most recent ones pre-selected
 *                          so the common case is one confirming tap.
 *   4. Logged.           — the day you just made, then out on one tap.
 *
 * Apple's insight, kept: the shape is analogue while the label is discrete,
 * and every step edits the same already-durable moment in place.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import PainShape from './PainShape';
import DaySquare from './DaySquare';
import * as db from './db';
import { Press } from './motion';
import { PAINWORDS, color, radius, size, theme } from './theme';
import {
  LOCIDS, LOC_NAMES, QUALITYIDS, QUALITY_NAMES,
  defaultLocs, fmtTime, minutesNow, todayISO,
} from './model';

const SQUARE = 150, SQ_RADIUS = 36;

type Step = 'pain' | 'feel' | 'where' | 'done';

export interface CheckinScreenProps {
  /** minutes since midnight; injectable so previews can fix the clock */
  now?: number;
  onDone: () => void;
  onClose: () => void;
}

export default function CheckinScreen({ now, onDone, onClose }: CheckinScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('pain');
  const [pain, setPain] = useState(5);
  const [quality, setQuality] = useState<string[]>([]);
  const [loc, setLoc] = useState<string[]>([]);
  const [writtenAt, setWrittenAt] = useState<number | null>(null);
  const progress = useSharedValue(5);

  const minutes = now != null ? now : minutesNow();
  const ramp = theme.ramp;

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step === 'pain') {
      db.writeMoment(todayISO(), minutes, pain);        // durable before the chips
      setWrittenAt(minutes);
      setStep('feel');
    } else if (step === 'feel') {
      if (writtenAt != null) db.writeMoment(todayISO(), writtenAt, pain, null, quality);
      setLoc(defaultLocs(db.getAll(), todayISO()));
      setStep('where');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (writtenAt != null) db.writeMoment(todayISO(), writtenAt, pain, loc, quality);
      setStep('done');
    }
  };

  const chipRow = (ids: string[], names: Record<string, string>, chosen: string[], setChosen: (v: string[]) => void) =>
    ids.map((id) => {
      const on = chosen.indexOf(id) >= 0;
      return (
        <Press
          key={id}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setChosen(on ? chosen.filter((x) => x !== id) : chosen.concat(id));
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
            {names[id] || id}
          </Text>
        </Press>
      );
    });

  if (step === 'done') {
    const e = db.getDay(todayISO());
    const count = e && e.logs ? e.logs.length : 1;
    return (
      <View style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 }]}>
        <View style={styles.middle}>
          <DaySquare entry={e} size={SQUARE} radius={SQ_RADIUS} />
          <Text style={styles.doneTitle}>Logged</Text>
          <Text style={styles.doneSub}>
            {count > 1
              ? count + ' moments today · ' + (e!.logs || []).map((l) => fmtTime(l.h)).join(' · ')
              : 'Today is on the map. You don’t need to solve it right now.'}
          </Text>
        </View>
        <View style={styles.bottom}>
          <Press onPress={onDone} pressScale={0.985} style={styles.primary}>
            <Text style={styles.primaryText}>Done</Text>
          </Press>
        </View>
      </View>
    );
  }

  const title = step === 'pain' ? 'How intense has your pain\nfelt today?'
    : step === 'feel' ? 'How does it feel?'
    : 'Where in your body?';

  const hint = step === 'feel' ? 'Optional — tap any that fit'
    : step === 'where' ? 'Your usual places are already selected'
    : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }]}>
      <View style={styles.topBar}>
        <Press onPress={onClose} style={styles.close} hitSlop={12}>
          <Text style={styles.closeGlyph}>✕</Text>
        </Press>
      </View>

      <Text style={styles.title}>{title}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}

      {step === 'pain' ? (
        <View style={styles.middle}>
          <PainShape progress={progress} size={SQUARE} />
          <Text style={styles.word}>{PAINWORDS[pain]}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.chipWrap} showsVerticalScrollIndicator={false}>
          {step === 'feel'
            ? chipRow(QUALITYIDS, QUALITY_NAMES, quality, setQuality)
            : chipRow(LOCIDS, LOC_NAMES, loc, setLoc)}
        </ScrollView>
      )}

      <View style={styles.bottom}>
        {step === 'pain' && (
          <>
            <Slider value={pain} onChange={setPain} progress={progress} />
            <View style={styles.ends}>
              <Text style={styles.endText}>{PAINWORDS[0]}</Text>
              <Text style={styles.endText}>{PAINWORDS[10]}</Text>
            </View>
          </>
        )}
        <Press onPress={advance} pressScale={0.985} style={styles.primary}>
          <Text style={styles.primaryText}>{step === 'where' ? 'Save today' : 'Continue'}</Text>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgRoot, paddingHorizontal: 28 },
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
  hint: { color: color.textTertiary, fontSize: 13, textAlign: 'center', marginTop: 8 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  word: {
    color: color.textPrimary, fontSize: 22, fontWeight: '600',
    letterSpacing: -0.3, marginTop: 30, textAlign: 'center',
  },
  doneTitle: {
    color: color.textPrimary, fontSize: 26, fontWeight: '600',
    letterSpacing: -0.4, marginTop: 30,
  },
  doneSub: {
    color: color.textSecondary, fontSize: 15, lineHeight: 22,
    marginTop: 8, textAlign: 'center', maxWidth: 300,
  },
  chipWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9,
    justifyContent: 'center', paddingVertical: 24,
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
});
