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
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import PainShape from './PainShape';
import DaySquare from './DaySquare';
import * as db from './db';
import { Press } from './motion';
import { color, radius, size } from './theme';
import {
  PAIN_END_HIGH, PAIN_END_LOW, formatOutOf, inkOn, painColor, painLabel, speakScore,
} from './painScale';
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
  /* the selected value is optional and starts unset: nothing is recorded
     until the user actually moves or taps the slider. The shape needs a
     position to draw, so its internal 0-10 progress is kept separate. */
  const [pain, setPain] = useState<number | null>(null);
  const [quality, setQuality] = useState<string[]>([]);
  const [loc, setLoc] = useState<string[]>([]);
  const [writtenAt, setWrittenAt] = useState<number | null>(null);
  const progress = useSharedValue(0);

  const minutes = now != null ? now : minutesNow();
  const [showAllChips, setShowAllChips] = useState(false);

  /* chips in personal order: what you actually pick floats to the front,
     and the rest waits behind "Show more" — a wall of fourteen options is
     a form, five of your usual ones is a question */
  const ranked = useMemo(() => {
    const locCount: Record<string, number> = {};
    const qCount: Record<string, number> = {};
    const all = db.getAll();
    Object.keys(all).forEach((k) => (all[k].logs || []).forEach((l) => {
      (l.loc || []).forEach((id) => { locCount[id] = (locCount[id] || 0) + 1; });
      (l.q || []).forEach((id) => { qCount[id] = (qCount[id] || 0) + 1; });
    }));
    const rank = (ids: string[], counts: Record<string, number>) =>
      ids.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    return { loc: rank(LOCIDS, locCount), q: rank(QUALITYIDS, qCount) };
  }, []);

  /* the logged screen acknowledges and leaves — no button tax on every log */
  useEffect(() => {
    if (step !== 'done') return;
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [step, onDone]);

  const back = () => {
    Haptics.selectionAsync().catch(() => {});
    setStep(step === 'where' ? 'feel' : 'pain');
  };

  /* nothing may be written until a value has actually been chosen — closing
     the flow before that records no check-in at all */
  const canAdvance = pain != null;

  const advance = () => {
    if (pain == null) return;
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
          accessibilityRole="checkbox"
          accessibilityState={{ checked: on }}
          accessibilityLabel={names[id] || id}
          style={[
            styles.chip,
            on
              ? { backgroundColor: painColor(pain ?? 5), borderColor: 'transparent' }
              : { backgroundColor: color.bgSurface, borderColor: color.borderDivider },
          ]}
        >
          <Text
            allowFontScaling maxFontSizeMultiplier={1.4}
            style={[styles.chipText, on && { color: inkOn(pain ?? 5) }]}
          >
            {names[id] || id}
          </Text>
        </Press>
      );
    });

  if (step === 'done') {
    const e = db.getDay(todayISO());
    const count = e && e.logs ? e.logs.length : 1;
    return (
      <Pressable
        onPress={onDone}
        style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 }]}
      >
        <View style={styles.middle}>
          <DaySquare entry={e} size={SQUARE} radius={SQ_RADIUS} />
          <Text style={styles.doneTitle}>Logged</Text>
          <Text style={styles.doneSub}>
            {count > 1
              ? count + ' moments today · ' + (e!.logs || []).map((l) => fmtTime(l.h)).join(' · ')
              : 'Today is on the map. You don’t need to solve it right now.'}
          </Text>
        </View>
      </Pressable>
    );
  }

  /* "right now", not "today": reminders arrive several times a day, so each
     check-in is a moment, and the day is their average */
  const title = step === 'pain' ? 'How intense is your pain\nright now?'
    : step === 'feel' ? 'How does it feel?'
    : 'Where in your body?';

  const hint = step === 'feel' ? 'Optional — tap any that fit'
    : step === 'where' ? 'Your usual places are already selected'
    : null;

  /* collapsed chips: the six you use most, plus anything already selected;
     "Show more" reveals the rest */
  const visibleIds = (ids: string[], chosen: string[]) => {
    if (showAllChips) return ids;
    const head = ids.slice(0, 6);
    chosen.forEach((id) => { if (head.indexOf(id) < 0) head.push(id); });
    return head;
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }]}>
      <View style={styles.topBar}>
        {step !== 'pain' ? (
          <Press onPress={back} style={styles.close} hitSlop={12}>
            <Text style={styles.closeGlyph}>‹</Text>
          </Press>
        ) : <View style={styles.close2} />}
        <Press onPress={onClose} style={styles.close} hitSlop={12}>
          <Text style={styles.closeGlyph}>✕</Text>
        </Press>
      </View>

      <Text style={styles.title}>{title}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}

      {step === 'pain' ? (
        <View style={styles.middle}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={pain == null
              ? 'No pain level selected yet'
              : 'Pain ' + speakScore(pain)}
            style={pain == null && styles.shapeUnset}
          >
            <PainShape progress={progress} size={SQUARE} />
          </View>
          {/* the number and the word carry the value; colour never carries
              it alone, and an unset scale says so in words */}
          {pain == null ? (
            <Text style={styles.unsetWord}>Move the slider to choose</Text>
          ) : (
            <>
              <Text style={styles.score} allowFontScaling maxFontSizeMultiplier={1.6}>
                {formatOutOf(pain)}
              </Text>
              <Text style={styles.word} allowFontScaling maxFontSizeMultiplier={1.6}>
                {painLabel(pain)}
              </Text>
            </>
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.chipWrap} showsVerticalScrollIndicator={false}>
          {step === 'feel'
            ? chipRow(visibleIds(ranked.q, quality), QUALITY_NAMES, quality, setQuality)
            : chipRow(visibleIds(ranked.loc, loc), LOC_NAMES, loc, setLoc)}
          {!showAllChips && (
            <Press onPress={() => setShowAllChips(true)} style={styles.more} pressOpacity={0.7}>
              <Text style={styles.moreText}>Show more ›</Text>
            </Press>
          )}
        </ScrollView>
      )}

      <View style={styles.bottom}>
        {step === 'pain' && (
          <>
            <Slider
              value={pain}
              onChange={setPain}
              progress={progress}
              accessibilityLabel="Pain right now, 0 to 10"
              accessibilityValue={pain == null
                ? { text: 'Not set' }
                : { min: 0, max: 10, now: pain, text: speakScore(pain) }}
            />
            <View style={styles.ends}>
              <Text style={styles.endText}>{PAIN_END_LOW}</Text>
              <Text style={styles.endText}>{PAIN_END_HIGH}</Text>
            </View>
          </>
        )}
        <Press
          onPress={advance}
          disabled={!canAdvance}
          pressScale={canAdvance ? 0.985 : 1}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAdvance }}
          accessibilityHint={canAdvance ? undefined : 'Choose a pain level first'}
          style={[styles.primary, !canAdvance && styles.primaryOff]}
        >
          <Text style={[styles.primaryText, !canAdvance && styles.primaryTextOff]}>
            {step === 'where' ? 'Save today' : 'Continue'}
          </Text>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgRoot, paddingHorizontal: 28 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between' },
  close: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.borderDivider,
    alignItems: 'center', justifyContent: 'center',
  },
  close2: { width: 40, height: 40 },
  more: { paddingVertical: 12, paddingHorizontal: 8, alignSelf: 'center' },
  moreText: { color: color.textTertiary, fontSize: 14 },
  closeGlyph: { color: color.textSecondary, fontSize: 15, lineHeight: 18 },
  title: {
    color: color.textPrimary, fontSize: 20, fontWeight: '600', letterSpacing: -0.25,
    lineHeight: 27, textAlign: 'center', marginTop: 14,
  },
  hint: { color: color.textTertiary, fontSize: 13, textAlign: 'center', marginTop: 8 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /* unset reads as waiting, not as a value: the shape is dimmed rather than
     showing a colour the user has not chosen */
  shapeUnset: { opacity: 0.28 },
  unsetWord: {
    color: color.textSecondary, fontSize: 16, marginTop: 30, textAlign: 'center',
  },
  score: {
    color: color.textPrimary, fontSize: 34, fontWeight: '700',
    letterSpacing: -0.6, marginTop: 26, fontVariant: ['tabular-nums'],
  },
  primaryOff: { backgroundColor: color.bgSegmentActive },
  primaryTextOff: { color: color.textTertiary },
  word: {
    color: color.textPrimary, fontSize: 22, fontWeight: '600',
    letterSpacing: -0.3, marginTop: 4, textAlign: 'center',
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
