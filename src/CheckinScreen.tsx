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
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text,
  TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat,
  withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import PainShape from './PainShape';
import BodyMap from './BodyMap';
import * as db from './db';
import { Press, useReduceMotion } from './motion';
import {
  IMPACT_BETTER, IMPACT_CHIPS, IMPACT_IDS, IMPACT_WORSE, MetricDef,
  eligibleNow, getMetric,
} from './metrics';
import { questionsNow } from './protocol';
import { track, trackCheckin } from './analytics';
import { color, font, size } from './theme';
import {
  PAIN_END_HIGH, PAIN_END_LOW, formatScore, inkOn, painColor,
  painLabel, speakScore, SCALE_VERSION,
} from './painScale';
import {
  LOCIDS, LOC_NAMES, QUALITYIDS, QUALITY_NAMES,
  answerOf, defaultLocs, expandLegacyLocs, logsOf, minutesNow, nowMeta, todayISO,
} from './model';

const IMPACT_LABELS: Record<string, string> = {};
IMPACT_CHIPS.forEach((c) => { IMPACT_LABELS[c.id] = c.name; });

const SQUARE = 150;
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
  /* what the user wrote, per question. Kept separately from the choice
     because the two are independent: a note can outlive a cleared answer,
     and nothing typed is ever thrown away without being asked for. */
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});

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
  /* legacy paired ids from older entries expand to both sides for the
     prefill — an offer to edit, never a rewrite of what was recorded */
  const [previous] = useState<string[]>(
    () => expandLegacyLocs(defaultLocs(db.getAll(), today))
  );
  /* the space the body map actually has — it sizes itself to this
     rather than assuming a phone */
  const [bodyBox, setBodyBox] = useState({ w: 0, h: 0 });

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

  /* the logged screen acknowledges and leaves — no button tax on every
     log, and with nothing to read the acknowledgement is brief */
  useEffect(() => {
    if (step !== 'done') return;
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [step, onDone]);

  const rm = useReduceMotion();
  useEffect(() => {
    if (step !== 'done') return;
    if (rm) {
      cancelAnimation(breath);
      breath.value = 0;
      landed.value = 1;
      return;
    }
    // arrive: overshoot a little, the way a thing with mass would
    landed.value = withSpring(1, { damping: 11, stiffness: 150, mass: 0.9 });
    // then breathe, once the arrival has settled
    breath.value = withDelay(
      520,
      withRepeat(withTiming(1, { duration: 2600 }), -1, true)
    );
  }, [step, rm]);

  const squareStyle = useAnimatedStyle(() => ({
    opacity: landed.value,
    transform: [{ scale: (0.86 + landed.value * 0.14) * (1 + breath.value * 0.035) }],
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
  /* Whether the questions step would record a value or a decline. The
     hint said the step was skippable and nothing on screen agreed: the
     only control read "Continue", so continuing looked like submitting a
     blank form rather than declining. Same tap, same stored skip — but
     now the button admits it, which is the difference between an
     optional question and one the user could not get past. */
  const anyAnswered = askIds.some((id) => answers[id] !== undefined);

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
      const n = notes[id];
      if (v === undefined) db.skipAnswer(today, id, minutes, pid, n);
      else db.setAnswer(today, id, v, minutes, pid, n);
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

  /**
   * The levels, one full-width row each rather than three across.
   *
   * Three-across truncated: "A focused effort" and "More than usual" do
   * not fit a third of a phone at semibold body size, and the ellipsis
   * fell exactly where the meaning was — a person choosing between
   * "A focuse…" and its neighbours is guessing at the question. Stacking
   * is not a nicer layout, it is the one that stays correct as levels are
   * added and worded, and at every Dynamic Type size.
   */
  const ordinalRow = (m: MetricDef) => (
    <View key={m.id} style={styles.qBlock}>
      <Text style={styles.qLabel} allowFontScaling maxFontSizeMultiplier={1.4}>
        {m.question}
      </Text>
      <View style={styles.options}>
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
              accessibilityHint={on ? 'Tap again to unselect' : undefined}
              style={({ pressed }) => [
                styles.optRow, on && styles.optRowOn,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text
                allowFontScaling maxFontSizeMultiplier={1.4}
                style={[styles.optText, on && styles.optTextOn]}
              >
                {l.label}
              </Text>
              {on && (
                <Text style={styles.optCheck} allowFontScaling={false}>
                  ✓
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>
      {noteRow(m)}
    </View>
  );

  /**
   * A place to say it in your own words.
   *
   * Three levels are what the ANALYSIS can compare — it needs days that
   * group. "20 min walk, heat pad, early night" is what makes the answer
   * legible to you six weeks later, and to a clinician reading the day.
   * So the note is offered on every question and read by nothing: it has
   * no levels, no extremes, and no days to compare against.
   *
   * Collapsed until asked for, because a text field under every question
   * turns a ten-second check-in into a form.
   */
  const noteRow = (m: MetricDef) => {
    const open = noteOpen[m.id] || !!notes[m.id];
    if (!open) {
      return (
        <Press
          onPress={() => setNoteOpen((o) => ({ ...o, [m.id]: true }))}
          pressOpacity={0.7}
          style={styles.noteAdd}
          accessibilityRole="button"
          accessibilityLabel={'Add a note about: ' + m.name}
        >
          <Text style={styles.noteAddText}>+ Add a note</Text>
        </Press>
      );
    }
    return (
      <TextInput
        value={notes[m.id] || ''}
        onChangeText={(t) => setNotes((n) => ({ ...n, [m.id]: t }))}
        placeholder={m.notePlaceholder || 'In your own words — optional'}
        placeholderTextColor={color.textTertiary}
        style={styles.noteInput}
        multiline
        maxLength={280}
        accessibilityLabel={'Note about: ' + m.name}
      />
    );
  };

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
        {noteRow(m)}
      </View>
    );
  };

  if (step === 'done') {
    /* A check mark, and nothing else.

       This screen used to show the day's new average in its colour, the
       count, and the times — a report card, delivered after every log,
       on the one screen every user sees several times a day. That was
       this app's own rule broken in its own hallway: an acknowledgement
       is not a place to read your numbers, and anything shown here gets
       read whether or not it should be. The day is one tap away for
       whoever wants it; the check-in ends by saying only "received".

       The mark is drawn, not typed — an L of borders rotated into a
       tick, the way the tab glyphs and the person are drawn — and it is
       WHITE: a confirmation is not a pain value and never wears the
       ramp. Same arrival spring, same breath, same tap-to-skip; the
       auto-dismiss is shorter because there is nothing left to read. */
    return (
      <Pressable
        onPress={onDone}
        style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 }]}
        accessibilityRole="button"
        accessibilityLabel="Logged"
        accessibilityHint="Returns to Today"
      >
        <View style={styles.middle}>
          <Animated.View style={[styles.check, squareStyle]}>
            <View style={styles.checkMark} />
          </Animated.View>
        </View>
      </Pressable>
    );
  }

  /* "right now", not "today": reminders arrive several times a day, so each
     check-in is a moment, and the day is their average */
  const title = step === 'pain' ? 'How intense is your pain\nright now?'
    /* "A couple of questions" over a single question is a small lie that
       makes the whole screen read as broken — the user looks for the one
       that failed to load. The heading counts what is actually there. */
    : step === 'questions'
      ? (askIds.length === 1 ? 'One question\nabout today' : 'A couple of questions\nabout today')
      : step === 'impact' ? 'What moved it today?'
        : step === 'feel' ? 'How does it feel?'
          : 'Where in your body?';

  const hint = step === 'impact'
    ? 'Your read on the day — Pattern records it, it doesn’t test it'
    : step === 'questions' ? 'Optional — Skip if it doesn’t fit today'
    : step === 'feel' ? 'Optional — tap any that fit'
      : step === 'where' ? 'Touch or sweep across where it hurts — your usual places are already marked'
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View
        style={[
          styles.inner,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 },
        ]}
      >
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
        <ScrollView
          contentContainerStyle={styles.qWrap}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
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
      ) : step === 'where' ? (
        /* The body, touched, instead of a list scanned — same ids
           underneath, same skip semantics, same storage. NOT a
           ScrollView, deliberately: the native scroll gesture wins the
           vertical-drag fight against any JS responder, which is what
           silently broke the paint stroke. The step fits without
           scrolling because the words and the All-over control live in
           the figure's side gutters, and the map sizes itself to the
           space it is actually given. */
        <View
          style={styles.bodyWrap}
          onLayout={(e) => setBodyBox({
            w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height,
          })}
        >
          {bodyBox.w > 0 && (
            <BodyMap
              selected={loc}
              onChange={setLoc}
              tint={painColor(pain == null ? 5 : pain)}
              ink={inkOn(pain == null ? 5 : pain)}
              containerWidth={bodyBox.w}
              containerHeight={bodyBox.h}
            />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.chipWrap} showsVerticalScrollIndicator={false}>
          {chipRow(visibleIds(ranked.q, quality), QUALITY_NAMES, quality, setQuality)}
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
                canAdvance ? styles.primaryOn : styles.primaryOff,
              ]}
            >
              <Text style={[
                styles.primaryText,
                canAdvance ? styles.primaryTextOn : styles.primaryTextOff,
              ]}>
                {step === 'where' ? 'Save today'
                  : step === 'questions' && !anyAnswered ? 'Skip'
                    : 'Continue'}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  /* the avoider owns nothing but the flex box and the ground: anything
     it can compose over, it will */
  root: { flex: 1, backgroundColor: color.bgRoot },
  inner: { flex: 1, paddingHorizontal: 28 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  close: {
    width: 40, height: 40, borderRadius: 20, borderCurve: 'continuous', borderWidth: 1, borderColor: color.borderDivider,
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
  primaryOn: { backgroundColor: color.textPrimary },
  primaryTextOn: { color: '#000000' },
  primaryOff: { backgroundColor: color.bgSegmentActive },
  primaryTextOff: { color: color.textTertiary },
  /* the category beneath the score — the same five words everywhere */
  word: {
    color: color.textSecondary, fontSize: font.title3, fontWeight: '600',
    letterSpacing: -0.3, marginTop: 2, textAlign: 'center',
  },
  /* the tick: an L of borders rotated 45° — drawn like every other
     glyph in this app, at the stroke weight of a hero mark rather than
     a row icon. The wrapper keeps the mark's visual centre on the
     screen's centre, which the raw rotation would not. */
  check: {
    width: 96, height: 96, alignItems: 'center', justifyContent: 'center',
  },
  checkMark: {
    width: 84, height: 44,
    borderLeftWidth: 9, borderBottomWidth: 9, borderColor: color.textPrimary,
    transform: [{ rotate: '-45deg' }, { translateY: -10 }],
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
  /* stacked, so a level is never abbreviated into ambiguity */
  options: { gap: 8 },
  optRow: {
    minHeight: 52, borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 15, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: color.bgSurface,
    borderWidth: 1, borderColor: color.borderDivider,
  },
  optText: {
    flex: 1, color: '#D0D0D6', fontSize: font.body, fontWeight: '600', lineHeight: 21,
  },
  optRowOn: { backgroundColor: color.textPrimary, borderColor: color.textPrimary },
  optTextOn: { color: '#000000' },
  optCheck: { color: '#000000', fontSize: 15, fontWeight: '700' },
  noteAdd: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  noteAddText: { color: color.textTertiary, fontSize: font.subheadline, fontWeight: '500' },
  noteInput: {
    minHeight: 58, borderRadius: 12, borderCurve: 'continuous', padding: 12,
    backgroundColor: color.bgSurface, color: color.textPrimary, fontSize: font.body,
    borderWidth: 1, borderColor: color.borderDivider,
    textAlignVertical: 'top',
  },

  chipWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9,
    justifyContent: 'center', paddingVertical: 24,
  },
  bodyWrap: { flex: 1, paddingTop: 8 },
  impactWrap: { paddingVertical: 20 },
  chipGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9,
    justifyContent: 'center', marginTop: 20,
  },
  /* one grid, two meanings — a segmented control says which, rather than
     two grids of sixteen chips or a tap-cycle nobody would guess */
  sideSwitch: {
    flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, borderCurve: 'continuous',
    backgroundColor: color.bgSurface,
  },
  sideItem: {
    flex: 1, minHeight: 40, borderRadius: 11, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8,
  },
  sideItemOn: { backgroundColor: color.bgSegmentActive },
  sideText: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '600' },
  sideTextOn: { color: color.textPrimary },
  chip: { paddingVertical: 11, paddingHorizontal: 17, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1 },
  chipText: { color: '#D0D0D6', fontSize: font.subheadline, fontWeight: '500' },
  bottom: { flexShrink: 0 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 2 },
  /* CAPS at the ends of the slider, exactly as the reference sets them */
  endText: {
    color: color.textTertiary, fontSize: 11, fontWeight: '600', letterSpacing: 0.6,
  },
  /* a full pill, the reference's button shape */
  primary: {
    minHeight: size.buttonH, borderRadius: size.buttonH / 2, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', marginTop: 26, paddingHorizontal: 16,
  },
  primaryText: { fontSize: font.title3, fontWeight: '600' },
  secondary: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  secondaryText: { color: color.textSecondary, fontSize: font.body, fontWeight: '600' },
});
