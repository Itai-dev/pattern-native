/**
 * The daily check-in: pain → where → logged. Under ten seconds.
 *
 * The moment is written the instant the pain step ends, so closing on the
 * where step costs taps, never data. The where step opens with the most
 * recent places already selected — chronic pain lives in the same places,
 * so the common case is one confirming tap, not a nightly re-survey.
 *
 * The old "a hard day? save and close" escape hatch is gone (2026-08-20).
 * It existed to let someone skip four steps; there are now two. Worse, it
 * appeared and vanished as the slider crossed 7, moving the primary button
 * under a finger already travelling toward it.
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import DaySquare from './DaySquare';
import * as db from './db';
import { Press } from './motion';
import { PAINWORDS, color, radius, size, theme } from './theme';
import { LOCIDS, LOC_NAMES, defaultLocs, fmtTime, minutesNow, todayISO } from './model';

const SQUARE = 150, SQ_RADIUS = 36;

export interface CheckinScreenProps {
  /** minutes since midnight; injectable so previews can fix the clock */
  now?: number;
  onDone: () => void;
  onClose: () => void;
}

export default function CheckinScreen({ now, onDone, onClose }: CheckinScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'pain' | 'where' | 'done'>('pain');
  const [pain, setPain] = useState(5);
  const [loc, setLoc] = useState<string[]>([]);
  const [writtenAt, setWrittenAt] = useState<number | null>(null);

  const minutes = now != null ? now : minutesNow();
  const ramp = theme.ramp;

  const onPainNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    db.writeMoment(todayISO(), minutes, pain);   // durable before the chips
    setWrittenAt(minutes);
    setLoc(defaultLocs(db.getAll(), todayISO()));
    setStep('where');
  };

  const onWhereSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (writtenAt != null) db.writeMoment(todayISO(), writtenAt, pain, loc);
    setStep('done');
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

  /* ── the logged screen: the day, as it now stands ──
     A save that just closes leaves you wondering whether it worked. This
     shows the thing you made — today's square, with this moment in it — and
     gets out of the way on one tap. */
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

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }]}>
      <View style={styles.topBar}>
        <Press onPress={onClose} style={styles.close} hitSlop={12}>
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
          <Text style={styles.hint}>Your usual places are already selected</Text>
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
  hint: { color: color.textTertiary, fontSize: 13, textAlign: 'center', marginTop: 10 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  square: { width: SQUARE, height: SQUARE, borderRadius: SQ_RADIUS },
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
});
