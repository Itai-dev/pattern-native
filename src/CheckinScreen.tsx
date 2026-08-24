/**
 * The check-in, in State of Mind's cadence: one question per screen, a
 * living shape under the finger, and chips you tap through rather than
 * forms you fill.
 *
 *   1. How intense?      — slider; the shape moves with the finger, the
 *                          word snaps. The moment is WRITTEN when this
 *                          step ends, so nothing later can lose it, and
 *                          the screen then offers Done as plainly as it
 *                          offers Add context.
 *   2. Today's questions — the active protocol's two factors, and how
 *                          much pain is getting in the way. Only the
 *                          ones this moment can honestly answer, only
 *                          once a day, each one skippable.
 *   3. What moved it?    — the chips: what made today harder, and what
 *                          helped. One grid, a segmented control to say
 *                          which side you mean.
 *   4. How does it feel? — quality words (SOCRATES "Character", the answer
 *                          every clinician asks for).
 *   5. Where?            — the places you had last time, already ticked,
 *                          so the common case is one confirming tap.
 *   6. Logged.           — the day you just made, arriving rather than
 *                          appearing, and then breathing while you look
 *                          at it. Out on one tap.
 *
 * PAIN IS THE ONLY MANDATORY ANSWER, and after step 1 the flow says so
 * out loud. Steps 2–4 are offered, never demanded, and a pain-only entry
 * is never called incomplete anywhere in the app.
 *
 * WHAT THE CHIPS ARE, AND ARE NOT. "Sleep made it worse today" is your
 * reading of your own day. It is worth recording and it belongs in the
 * doctor summary, but it can never be checked, because you only tick it
 * when the answer is already yes — there are no good-sleep days in a list
 * of days you blamed sleep. So the chips are stored as attributions,
 * shown as attributions, and never fed to the engine. What they DO is
 * point at what is worth measuring properly: flag one enough times and
 * Pattern offers to start asking the graded question, which is the
 * version with something to compare against.
 *
 * A question outside its window is not asked and not recorded. "How was
 * your sleep last night", answered at nine in the evening, is a recall
 * made after a whole day of pain — it is shaped by the outcome it is
 * meant to help explain. A gap is worth more than that.
 *
 * Apple's insight, kept: the shape is analogue while the label is discrete,
 * and every step edits the same already-durable moment in place.
 *
 * The confirmation is the one place in this app that gets a real
 * animation, and it earns it: it is the end of the interaction, it
 * happens once, and the thing it is confirming — that today is recorded —
 * is the only thing the app promises. The square springs in under the
 * words, then settles into the same slow breath the pain shape uses, so
 * the day reads as something alive rather than a receipt. Reduce Motion
 * turns all of it off and the square is simply there.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import PainShape from './PainShape';
import DaySquare from './DaySquare';
import * as db from './db';
import { Press, reduceMotion } from './motion';
import {
  IMPACT_BETTER, IMPACT_CHIPS, IMPACT_IDS, IMPACT_WORSE, MetricDef,
  eligibleNow, getMetric,
} from './metrics';
import { questionsNow } from './protocol';
import { track, trackCheckin } from './analytics';
import { color, font, size } from './theme';
import {
  PAIN_END_HIGH, PAIN_END_LOW, formatScore, inkForBg, inkOn, painColor,
  painLabel, speakScore, themeBrand, SCALE_VERSION,
} from './painScale';
import {
  LOCIDS, LOC_NAMES, QUALITYIDS, QUALITY_NAMES,
  answerOf, dailyAverage, defaultLocs, fmtTime, logsOf, minutesNow, nowMeta, todayISO,
} from './model';

const IMPACT_LABELS: Record<string, string> = {};
IMPACT_CHIPS.forEach((c) => { IMPACT_LABELS[c.id] = c.name; });

const SQUARE = 150, SQ_RADIUS = 36;
const INTERFERENCE_ID = 'pain.interference.v1';

type Step = 'pain' | 'questions' | 'impact' | 'feel' | 'where' | 'done';

/** which side of the chip grid is showing */
type Side = 'worse' | 'better';

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
  /* the shape starts at the middle of the ramp, where the thumb parks,
     so an untouched control and an untouched square agree with each other.
     Both are dimmed until a value is actually chosen. */
  const progress = useSharedValue(5);
  /* the confirmation: arrival, then a slow breath under it */
  const landed = useSharedValue(0);
  const breath = useSharedValue(0);

  const minutes = now != null ? now : minutesNow();
  const [showAllChips, setShowAllChips] = useState(false);

  /* ── today's questions ─────────────────────────────────────
     Resolved once, when the flow opens, from the active period and the
     clock. An empty list is the normal state before a protocol exists,
     and the step is skipped entirely rather than shown empty. */
  const today = todayISO();
  const [askIds] = useState<string[]>(() => {
    const entry = db.getDay(today);
    const isFirstOfDay = logsOf(entry).length === 0;
    /* interference is fixed core rather than part of a protocol, so it
       rides along as an extra and is asked once a day whether or not an
       observation period exists yet */
    return questionsNow(
      db.activeProtocol(),
      { h: minutes, isFirstOfDay, entry },
      [INTERFERENCE_ID]
    );
  });
  const [pid] = useState<number | null>(() => {
    const p = db.activeProtocol();
    return p && p.id != null ? p.id : null;
  });
  /* answers held in memory until the step is left, so backing out of a
     half-finished screen records nothing */
  const [answers, setAnswers] = useState<Record<string, string | number>>({});

  /* the chips. Asked once a day, like the other day-scoped questions. */
  const [askImpact] = useState<boolean>(() => {
    const entry = db.getDay(today);
    const first = logsOf(entry).length === 0;
    return eligibleNow('firstOfDay', minutes, first, answerOf(entry, IMPACT_WORSE) != null);
  });
  const [side, setSide] = useState<Side>('worse');
  const [worse, setWorse] = useState<string[]>([]);
  const [better, setBetter] = useState<string[]>([]);

  /* Chronic pain usually lives in the same places, so the where step opens
     with the last ones already ticked and the common case is one tap on
     Save. The list is on screen and Save is pressed deliberately, so what
     gets filed is still something the user looked at and agreed to — the
     thing to avoid was recording places nobody was ever shown. */
  const [previous] = useState<string[]>(() => defaultLocs(db.getAll(), today));

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
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [step, onDone]);

  useEffect(() => {
    if (step !== 'done') return;
    if (reduceMotion) { landed.value = 1; return; }
    // arrive: overshoot a little, the way a thing with mass would
    landed.value = withSpring(1, { damping: 11, stiffness: 150, mass: 0.9 });
    // then breathe, once the arrival has settled
    breath.value = withDelay(
      520,
      withRepeat(withTiming(1, { duration: 2600 }), -1, true)
    );
  }, [step]);

  const squareStyle = useAnimatedStyle(() => ({
    opacity: landed.value,
    transform: [{ scale: (0.86 + landed.value * 0.14) * (1 + breath.value * 0.035) }],
  }));

  /* the words follow the square rather than arriving with it — a beat of
     difference is what makes it read as a sequence instead of a jump */
  const wordsStyle = useAnimatedStyle(() => ({
    opacity: landed.value,
    transform: [{ translateY: (1 - landed.value) * 10 }],
  }));

  const order: Step[] = ['pain', 'questions', 'impact', 'feel', 'where'];
  const stepsShown = order.filter((s) => (
    s === 'questions' ? askIds.length > 0
      : s === 'impact' ? askImpact
        : true
  ));

  const back = () => {
    Haptics.selectionAsync().catch(() => {});
    const i = stepsShown.indexOf(step);
    setStep(stepsShown[Math.max(0, i - 1)]);
  };

  /* nothing may be written until a value has actually been chosen — closing
     the flow before that records no check-in at all */
  const canAdvance = pain != null;

  /** write the moment as it currently stands. Called at every step end, so
   *  the record is durable from the first one and each later step edits
   *  the same moment rather than adding another. */
  const persist = (opts?: { locAsked?: boolean; locSkipped?: boolean }) => {
    if (writtenAt == null || pain == null) return;
    db.writeMoment(today, writtenAt, pain, loc, quality, {
      ...nowMeta(SCALE_VERSION),
      ...(opts || {}),
    });
  };

  /** save the day-scoped answers, one per question that was actually put.
   *  A question shown and left alone is recorded as SKIPPED — asked and
   *  declined is a different fact from never asked, and neither of them
   *  is a value. */
  const persistAnswers = () => {
    askIds.forEach((id) => {
      const v = answers[id];
      if (v === undefined) db.skipAnswer(today, id, minutes, pid);
      else db.setAnswer(today, id, v, minutes, pid);
    });
  };

  const finish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setStep('done');
  };

  const nextAfter = (s: Step): Step => {
    const i = stepsShown.indexOf(s);
    return i >= 0 && i + 1 < stepsShown.length ? stepsShown[i + 1] : 'done';
  };

  /** log the pain and stop there — a complete check-in */
  const logOnly = () => {
    if (pain == null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    db.writeMoment(today, minutes, pain, null, null, nowMeta(SCALE_VERSION));
    setWrittenAt(minutes);
    setStep('done');
  };

  const advance = () => {
    if (pain == null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step === 'pain') {
      db.writeMoment(today, minutes, pain, null, null, nowMeta(SCALE_VERSION));
      setWrittenAt(minutes);
      setStep(nextAfter('pain'));
    } else if (step === 'questions') {
      persistAnswers();
      setStep(nextAfter('questions'));
    } else if (step === 'impact') {
      /* both lists are written even when empty — "I looked and nothing
         applied" is an answer, and an ordinary day is exactly the kind
         this record is worst at keeping */
      db.setAnswerList(today, IMPACT_WORSE, worse, minutes, pid);
      db.setAnswerList(today, IMPACT_BETTER, better, minutes, pid);
      setStep(nextAfter('impact'));
    } else if (step === 'feel') {
      persist();
      if (nextAfter('feel') === 'where' && !loc.length) setLoc(previous);
      setStep(nextAfter('feel'));
    } else {
      persist({ locAsked: true });
      finish();
    }
  };

  const chipRow = (
    ids: string[], names: Record<string, string>,
    chosen: string[], setChosen: (v: string[]) => void
  ) =>
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
              /* the border keeps a selected chip visible when a low pain
                 value paints it nearly black */
              ? { backgroundColor: painColor(pain ?? 5), borderColor: 'rgba(255,255,255,0.3)' }
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

  /* ── one of today's questions ────────────────────────────── */

  const ordinalRow = (m: MetricDef) => (
    <View key={m.id} style={styles.qBlock}>
      <Text style={styles.qLabel} allowFontScaling maxFontSizeMultiplier={1.4}>
        {m.question}
      </Text>
      <View style={styles.segment}>
        {(m.levels || []).map((l) => {
          const on = answers[m.id] === l.id;
          return (
            <Pressable
              key={l.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setAnswers((a) => {
                  const next = { ...a };
                  if (on) delete next[m.id]; else next[m.id] = l.id;
                  return next;
                });
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={l.label}
              style={({ pressed }) => [
                styles.segItem, on && { backgroundColor: themeBrand() },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text
                allowFontScaling maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[styles.segText, on && { color: inkForBg(themeBrand()) }]}
              >
                {l.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const numericRow = (m: MetricDef) => {
    const v = typeof answers[m.id] === 'number' ? (answers[m.id] as number) : null;
    return (
      <View key={m.id} style={styles.qBlock}>
        <Text style={styles.qLabel} allowFontScaling maxFontSizeMultiplier={1.4}>
          {m.question}
        </Text>
        <Text style={styles.qValue} allowFontScaling maxFontSizeMultiplier={1.4}>
          {v == null ? 'Not answered' : v + '/10'}
        </Text>
        <Slider
          value={v}
          onChange={(n) => setAnswers((a) => ({ ...a, [m.id]: n }))}
          accessibilityLabel={m.question}
          accessibilityValue={v == null
            ? { text: 'Not answered' }
            : { min: 0, max: 10, now: v, text: v + ' out of 10' }}
        />
        <View style={styles.ends}>
          <Text style={styles.endText}>{(m.ends ? m.ends[0] : '0').toUpperCase()}</Text>
          <Text style={styles.endText}>{(m.ends ? m.ends[1] : '10').toUpperCase()}</Text>
        </View>
      </View>
    );
  };

  if (step === 'done') {
    const e = db.getDay(today);
    const count = e && e.logs ? e.logs.length : 1;
    return (
      <Pressable
        onPress={onDone}
        style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 }]}
      >
        <View style={styles.middle}>
          <Animated.View style={squareStyle}>
            <DaySquare entry={e} size={SQUARE} radius={SQ_RADIUS}>
              {(() => {
                const avg = e ? dailyAverage(e) : null;
                return avg != null ? (
                  <Text allowFontScaling={false}
                    style={[styles.doneScore, { color: inkOn(avg) }]}>
                    {formatScore(avg)}
                  </Text>
                ) : null;
              })()}
            </DaySquare>
          </Animated.View>
          <Animated.View style={[styles.doneWords, wordsStyle]}>
            <Text style={styles.doneTitle}>Logged</Text>
            <Text style={styles.doneSub}>
              {count > 1
                ? count + ' moments today · ' + (e!.logs || []).map((l) => fmtTime(l.h)).join(' · ')
                : 'Today is on the map. You don’t need to solve it right now.'}
            </Text>
          </Animated.View>
        </View>
      </Pressable>
    );
  }

  /* "right now", not "today": reminders arrive several times a day, so each
     check-in is a moment, and the day is their average */
  const title = step === 'pain' ? 'How intense is your pain\nright now?'
    : step === 'questions' ? 'A couple of questions\nabout today'
      : step === 'impact' ? 'What moved it today?'
        : step === 'feel' ? 'How does it feel?'
          : 'Where in your body?';

  const hint = step === 'impact'
    ? 'Your read on the day — Pattern records it, it doesn’t test it'
    : step === 'questions' ? 'All optional — skip any that don’t fit'
    : step === 'feel' ? 'Optional — tap any that fit'
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
          <Press onPress={back} style={styles.close} hitSlop={12}
            accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.closeGlyph}>‹</Text>
          </Press>
        ) : <View style={styles.close2} />}
        {/* the flow's name sits between the controls, the reference's way */}
        <Text style={styles.navTitle} allowFontScaling={false}>Check-In</Text>
        <Press
          onPress={() => {
            /* opened, chose nothing, left — the funnel's quietest number
               and the one that says whether the first screen is working */
            if (writtenAt == null) track('checkin_abandoned');
            onClose();
          }}
          style={styles.close} hitSlop={12}
          accessibilityRole="button" accessibilityLabel="Close">
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
            <Text style={styles.unsetWord} allowFontScaling maxFontSizeMultiplier={1.6}>
              Move the slider to choose.
            </Text>
          ) : (
            <>
              <Text style={styles.score} allowFontScaling maxFontSizeMultiplier={1.6}>
                {formatScore(pain)}
              </Text>
              <Text style={styles.word} allowFontScaling maxFontSizeMultiplier={1.6}>
                {painLabel(pain)}
              </Text>
            </>
          )}
        </View>
      ) : step === 'questions' ? (
        <ScrollView contentContainerStyle={styles.qWrap} showsVerticalScrollIndicator={false}>
          {askIds.map((id) => {
            const m = getMetric(id);
            if (!m) return null;
            return m.type === 'numeric' ? numericRow(m) : ordinalRow(m);
          })}
        </ScrollView>
      ) : step === 'impact' ? (
        <ScrollView contentContainerStyle={styles.impactWrap} showsVerticalScrollIndicator={false}>
          <View style={styles.sideSwitch}>
            {(['worse', 'better'] as Side[]).map((sd) => {
              const on = side === sd;
              const n = (sd === 'worse' ? worse : better).length;
              return (
                <Pressable
                  key={sd}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setSide(sd); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={sd === 'worse' ? 'Made it harder' : 'Helped'}
                  style={({ pressed }) => [
                    styles.sideItem, on && styles.sideItemOn, pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.sideText, on && styles.sideTextOn]}
                    allowFontScaling maxFontSizeMultiplier={1.3}>
                    {sd === 'worse' ? 'Made it harder' : 'Helped'}{n ? ' · ' + n : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.chipGrid}>
            {chipRow(
              IMPACT_IDS,
              IMPACT_LABELS,
              side === 'worse' ? worse : better,
              side === 'worse' ? setWorse : setBetter
            )}
          </View>
        </ScrollView>
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
              <Text style={styles.endText}>{PAIN_END_LOW.toUpperCase()}</Text>
              <Text style={styles.endText}>{PAIN_END_HIGH.toUpperCase()}</Text>
            </View>
          </>
        )}

        <>
            <Press
              onPress={advance}
              disabled={!canAdvance}
              pressScale={canAdvance ? 0.985 : 1}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAdvance }}
              accessibilityHint={canAdvance ? undefined : 'Choose a pain level first'}
              style={[
                styles.primary,
                /* the reference fills its Next button with its accent; ours is
                   the theme's own hue, ink chosen by real luminance */
                canAdvance ? { backgroundColor: themeBrand() } : styles.primaryOff,
              ]}
            >
              <Text style={[
                styles.primaryText,
                canAdvance ? { color: inkForBg(themeBrand()) } : styles.primaryTextOff,
              ]}>
                {step === 'where' ? 'Save today' : 'Continue'}
              </Text>
            </Press>

            {/* pain on its own is a finished check-in, and the flow says so
                as plainly as it offers the rest */}
            {step === 'pain' && (
              <Press
                onPress={logOnly}
                disabled={!canAdvance}
                pressOpacity={0.75}
                style={styles.secondary}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAdvance }}
                accessibilityLabel="Log the pain and finish"
              >
                <Text style={[styles.secondaryText, !canAdvance && styles.primaryTextOff]}>
                  That’s it for now
                </Text>
              </Press>
            )}
        </>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgRoot, paddingHorizontal: 28 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  close: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.borderDivider,
    alignItems: 'center', justifyContent: 'center',
  },
  close2: { width: 40, height: 40 },
  more: { paddingVertical: 12, paddingHorizontal: 8, alignSelf: 'center' },
  moreText: { color: color.textTertiary, fontSize: font.subheadline },
  closeGlyph: { color: color.textSecondary, fontSize: 15, lineHeight: 18 },
  title: {
    color: color.textPrimary, fontSize: font.title2, fontWeight: '700', letterSpacing: -0.3,
    lineHeight: 29, textAlign: 'center', marginTop: 14,
  },
  hint: { color: color.textTertiary, fontSize: font.subheadline, textAlign: 'center', marginTop: 8 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /* unset reads as waiting, not as a value: the shape is dimmed rather than
     showing a colour the user has not chosen */
  shapeUnset: { opacity: 0.28 },
  unsetWord: {
    color: color.textSecondary, fontSize: font.body, marginTop: 30, textAlign: 'center',
  },
  /* the main pain value: a large display size that still scales with
     Dynamic Type — the number is the precise information */
  score: {
    color: color.textPrimary, fontSize: 44, fontWeight: '700',
    letterSpacing: -0.8, marginTop: 26, fontVariant: ['tabular-nums'],
  },
  primaryOff: { backgroundColor: color.bgSegmentActive },
  primaryTextOff: { color: color.textTertiary },
  /* the category beneath the score — the same five words everywhere */
  word: {
    color: color.textSecondary, fontSize: font.title3, fontWeight: '600',
    letterSpacing: -0.3, marginTop: 2, textAlign: 'center',
  },
  doneScore: {
    fontSize: 50, fontWeight: '700', letterSpacing: -1.1,
    fontVariant: ['tabular-nums'],
  },
  doneWords: { alignItems: 'center' },
  doneTitle: {
    color: color.textPrimary, fontSize: 26, fontWeight: '700',
    letterSpacing: -0.4, marginTop: 30,
  },
  doneSub: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 22,
    marginTop: 8, textAlign: 'center', maxWidth: 300,
  },

  /* ── today's questions ─────────────────────────────────── */
  qWrap: { paddingVertical: 22, gap: 26 },
  qBlock: { gap: 10 },
  qLabel: {
    color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 22,
  },
  qValue: {
    color: color.textSecondary, fontSize: font.subheadline,
    fontVariant: ['tabular-nums'], marginTop: -4,
  },
  segment: {
    flexDirection: 'row', gap: 8,
  },
  segItem: {
    flex: 1, minHeight: 46, borderRadius: 14, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.bgSurface,
    borderWidth: 1, borderColor: color.borderDivider,
  },
  segText: { color: '#D0D0D6', fontSize: font.subheadline, fontWeight: '600' },

  chipWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9,
    justifyContent: 'center', paddingVertical: 24,
  },
  impactWrap: { paddingVertical: 20 },
  chipGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9,
    justifyContent: 'center', marginTop: 20,
  },
  /* one grid, two meanings — a segmented control says which, rather than
     two grids of sixteen chips or a tap-cycle nobody would guess */
  sideSwitch: {
    flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14,
    backgroundColor: color.bgSurface,
  },
  sideItem: {
    flex: 1, minHeight: 40, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  sideItemOn: { backgroundColor: color.bgSegmentActive },
  sideText: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '600' },
  sideTextOn: { color: color.textPrimary },
  chip: { paddingVertical: 11, paddingHorizontal: 17, borderRadius: 22, borderWidth: 1 },
  chipText: { color: '#D0D0D6', fontSize: font.subheadline, fontWeight: '500' },
  bottom: { flexShrink: 0 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 2 },
  /* CAPS at the ends of the slider, exactly as the reference sets them */
  endText: {
    color: color.textTertiary, fontSize: 11, fontWeight: '600', letterSpacing: 0.6,
  },
  /* a full pill, the reference's button shape */
  primary: {
    minHeight: size.buttonH, borderRadius: size.buttonH / 2,
    alignItems: 'center', justifyContent: 'center', marginTop: 26, paddingHorizontal: 16,
  },
  primaryText: { fontSize: font.title3, fontWeight: '600' },
  secondary: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  secondaryText: { color: color.textSecondary, fontSize: font.body, fontWeight: '600' },
});
