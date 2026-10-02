/**
 * Flare mode, and somatic tracking on its own.
 *
 * ONE SHEET, TWO DOORS. "I'm having a flare" walks the whole routine:
 * a safety check, a minute to settle, ninety seconds of noticing, the
 * fear said out loud, and one small thing to go and do. "Notice a
 * sensation" is the noticing alone, as practice on an ordinary day —
 * the same screen, so the exercise a person has practised is the one
 * they meet mid-flare, not a second version of it.
 *
 * NO SCORE, ANYWHERE. Flare mode is the moment a person is most likely
 * to open the app, and the old answer to that moment was a check-in:
 * "how much does it hurt?" at the peak. This asks what the pain is LIKE
 * and what the person is afraid it means, and it ends by pointing them
 * away from the app for twenty minutes. Logging the flare is offered,
 * through the existing event sheet, and never required.
 *
 * NOTHING IS STORED. The answers shape the next screen and go when the
 * sheet closes. Analytics counts that the routine opened and how far it
 * got, by step name only — never an answer.
 *
 * The words live in flare.ts, where tools/test-flare.js holds them to the
 * line between education and a medical claim.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Press } from './motion';
import { track } from './analytics';
import {
  ACT_BODY, ACT_TITLE, ACTIONS, CARE_BODY, CARE_TITLE, CHECK_OPTIONS, FEARS,
  FlareCheck, FlareFear, FlareStep, NOT_ADVICE, SETTLE_LINES, SETTLE_SECONDS,
  TRACK_DONE, TRACK_FEELS, TRACK_LINES, TRACK_SECONDS, TRACK_WHERE, WARNING_SIGNS,
  afterCheck, nextStep,
} from './flare';
import { color, font, size } from './theme';

export type FlareMode = 'flare' | 'track';

export interface FlareSheetProps {
  mode: FlareMode;
  onClose: () => void;
  /** the event sheet, opened on a flare — offered at the end, never asked */
  onLogFlare: () => void;
}

/** m:ss for a countdown. A timer, not a measure: nothing here is scored. */
function clock(s: number): string {
  const m = Math.floor(s / 60), r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

/** a countdown that can be left early. Starting it is the person's tap,
 *  so nobody opens the sheet to a clock already running at them. */
function useCountdown(total: number) {
  const [left, setLeft] = useState(total);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((l) => (l <= 1 ? 0 : l - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => { if (left === 0) setRunning(false); }, [left]);
  return { left, running, start: () => { setLeft(total); setRunning(true); } };
}

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      pressOpacity={0.8}
      style={[styles.pick, on && styles.pickOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
    >
      <Text style={[styles.pickText, on && styles.pickTextOn]} allowFontScaling maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </Press>
  );
}

function Primary({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press onPress={onPress} pressOpacity={0.85} style={styles.primary}
      accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.primaryText} allowFontScaling maxFontSizeMultiplier={1.3}>{label}</Text>
    </Press>
  );
}

/** the noticing itself — shared by both doors */
function Tracking({ onDone, doneLabel }: { onDone: () => void; doneLabel: string }) {
  const [where, setWhere] = useState<string | null>(null);
  const [feels, setFeels] = useState<string[]>([]);
  const [finished, setFinished] = useState(false);
  const timer = useCountdown(TRACK_SECONDS);
  const started = timer.running || timer.left < TRACK_SECONDS;

  if (finished) {
    return (
      <>
        <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>Done</Text>
        <Text style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>{TRACK_DONE}</Text>
        <Primary label={doneLabel} onPress={onDone} />
      </>
    );
  }

  if (!started) {
    return (
      <>
        <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
          Where do you notice it?
        </Text>
        <View style={styles.pickRow}>
          {TRACK_WHERE.map((w) => (
            <Pill key={w} label={w} on={where === w} onPress={() => setWhere(where === w ? null : w)} />
          ))}
        </View>
        <Text style={[styles.q, styles.qLater]} allowFontScaling maxFontSizeMultiplier={1.3}>
          What does it actually feel like?
        </Text>
        <Text style={styles.sub} allowFontScaling maxFontSizeMultiplier={1.4}>
          Sensations, not verdicts. Pick any that fit, or none.
        </Text>
        <View style={styles.pickRow}>
          {TRACK_FEELS.map((f) => {
            const on = feels.indexOf(f) >= 0;
            return (
              <Pill key={f} label={f} on={on}
                onPress={() => setFeels(on ? feels.filter((x) => x !== f) : feels.concat(f))} />
            );
          })}
        </View>
        <Primary label="Start 90 seconds" onPress={timer.start} />
      </>
    );
  }

  /* the words the person chose come back to them as the thing to watch —
     their description, never the app's */
  const subject = feels.length
    ? feels.join(', ').toLowerCase() + (where && where !== 'Somewhere else' ? ' in your ' + where.toLowerCase() : '')
    : where && where !== 'Somewhere else' ? 'the sensation in your ' + where.toLowerCase() : 'the sensation';

  return (
    <>
      <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
        Watch the {subject}
      </Text>
      {TRACK_LINES.map((l) => (
        <Text key={l} style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>{l}</Text>
      ))}
      <Text style={styles.timer} accessibilityLabel={timer.left + ' seconds left'}>
        {clock(timer.left)}
      </Text>
      <Primary label={timer.left === 0 ? 'Finish' : 'Finish early'} onPress={() => {
        track('tracking_completed', { mode: timer.left === 0 ? 'full' : 'early' });
        setFinished(true);
      }} />
    </>
  );
}

export default function FlareSheet({ mode, onClose, onLogFlare }: FlareSheetProps) {
  const [step, setStep] = useState<FlareStep>(mode === 'flare' ? 'check' : 'track');
  const [check, setCheck] = useState<FlareCheck | null>(null);
  const [fear, setFear] = useState<FlareFear | null>(null);
  const settle = useCountdown(SETTLE_SECONDS);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => { track(mode === 'flare' ? 'flare_opened' : 'tracking_opened'); }, [mode]);

  const go = (s: FlareStep | null) => {
    if (!s) { onClose(); return; }
    track('flare_step', { step: s });
    setStep(s);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  const next = () => go(nextStep(step));

  const title = mode === 'track' ? 'Notice a sensation' : 'Flare';

  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        <View style={styles.navBtn} />
        <Text style={styles.navTitle} numberOfLines={1}>{title}</Text>
        <Press onPress={onClose} style={styles.navBtn} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Close">
          <Text style={[styles.navBtnText, styles.navBtnStrong]}>Close</Text>
        </Press>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={styles.bodyPad} showsVerticalScrollIndicator={false}>
        {step === 'check' && (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              First: is this your familiar pain?
            </Text>
            <Text style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>
              If you have any of these, stop here and get help:
            </Text>
            {WARNING_SIGNS.map((w) => (
              <Text key={w} style={styles.bullet} allowFontScaling maxFontSizeMultiplier={1.4}>
                {'•  ' + w}
              </Text>
            ))}
            <View style={styles.pickCol}>
              {CHECK_OPTIONS.map((o) => (
                <Pill key={o.id} label={o.label} on={check === o.id} onPress={() => setCheck(o.id)} />
              ))}
              <Pill label="I have one of these signs" on={false} onPress={() => go(afterCheck('different', true))} />
            </View>
            {check && <Primary label="Continue" onPress={() => go(afterCheck(check, false))} />}
          </>
        )}

        {step === 'care' && (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>{CARE_TITLE}</Text>
            {CARE_BODY.map((b) => (
              <Text key={b} style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>{b}</Text>
            ))}
            <Primary label="Close" onPress={onClose} />
          </>
        )}

        {step === 'settle' && (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              A minute to settle
            </Text>
            <Text style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>
              A flare can put your whole body on alert. Before anything else, give it a minute.
            </Text>
            {SETTLE_LINES.map((l) => (
              <Text key={l} style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>{l}</Text>
            ))}
            {settle.running || settle.left < SETTLE_SECONDS ? (
              <>
                <Text style={styles.timer} accessibilityLabel={settle.left + ' seconds left'}>
                  {clock(settle.left)}
                </Text>
                <Primary label={settle.left === 0 ? 'Next' : 'Skip ahead'} onPress={next} />
              </>
            ) : (
              <>
                <Primary label="Start one minute" onPress={settle.start} />
                <Press onPress={next} style={styles.later} accessibilityRole="button" accessibilityLabel="Skip">
                  <Text style={styles.laterText}>Skip</Text>
                </Press>
              </>
            )}
          </>
        )}

        {step === 'track' && (
          <Tracking onDone={mode === 'track' ? onClose : next} doneLabel={mode === 'track' ? 'Close' : 'Next'} />
        )}

        {step === 'fear' && (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
              What are you afraid this means?
            </Text>
            <View style={styles.pickCol}>
              {FEARS.map((f) => (
                <Pill key={f.id} label={f.label} on={fear === f.id} onPress={() => setFear(f.id)} />
              ))}
            </View>
            {fear && (
              <>
                <Text style={[styles.body, styles.reply]} allowFontScaling maxFontSizeMultiplier={1.4}>
                  {FEARS.find((f) => f.id === fear)!.reply}
                </Text>
                <Primary label="Next" onPress={next} />
              </>
            )}
          </>
        )}

        {step === 'act' && (
          <>
            <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>{ACT_TITLE}</Text>
            {ACTIONS.map((a) => (
              <Text key={a} style={styles.bullet} allowFontScaling maxFontSizeMultiplier={1.4}>{'•  ' + a}</Text>
            ))}
            <Text style={styles.body} allowFontScaling maxFontSizeMultiplier={1.4}>{ACT_BODY}</Text>
            <Primary label="Done" onPress={onClose} />
            <Press onPress={onLogFlare} style={styles.later} accessibilityRole="button"
              accessibilityLabel="Add this flare to your record">
              <Text style={styles.laterText}>Add this flare to your record</Text>
            </Press>
          </>
        )}

        {/* inside the screen it qualifies, on every step */}
        <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>{NOT_ADVICE}</Text>
      </ScrollView>
    </View>
  );
}

/* the event sheet's grammar — nav bar, pills, type sizes — so this reads
   as part of the same app, and its one button is white like every other */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 72, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: color.tint, fontSize: font.body },
  navBtnStrong: { fontWeight: '600' },
  bodyPad: { padding: size.sheetX, paddingTop: 20, paddingBottom: 48 },
  title: { color: color.textPrimary, fontSize: font.title3, fontWeight: '700', letterSpacing: -0.2 },
  q: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  qLater: { marginTop: 28 },
  sub: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 4 },
  body: { color: color.textSecondary, fontSize: font.body, lineHeight: 24, marginTop: 12 },
  bullet: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 8 },
  reply: { color: color.textPrimary, marginTop: 18 },
  timer: {
    color: color.textPrimary, fontSize: font.largeTitle, fontWeight: '600',
    fontVariant: ['tabular-nums'], textAlign: 'center', marginTop: 28,
  },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pickCol: { gap: 8, marginTop: 18 },
  pick: {
    minHeight: 44, borderRadius: 12, borderCurve: 'continuous', paddingHorizontal: 14,
    paddingVertical: 10, justifyContent: 'center',
    backgroundColor: color.bgSurface, borderWidth: 1, borderColor: color.borderDivider,
  },
  pickOn: { borderColor: color.textPrimary, backgroundColor: color.bgSegmentActive },
  pickText: { color: '#D0D0D6', fontSize: font.subheadline, fontWeight: '500' },
  pickTextOn: { color: color.textPrimary, fontWeight: '600' },
  primary: {
    minHeight: size.buttonH, borderRadius: size.buttonH / 2, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, marginTop: 28,
    backgroundColor: color.textPrimary,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
  later: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  laterText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 32 },
});
