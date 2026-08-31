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
  cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay,
  withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import PainShape from './PainShape';
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
  LOC_CHIP_IDS, LOC_NAMES, LOC_SECTIONS, QUALITYIDS, QUALITY_NAMES,
  answerOf, collapseSidedLocs, defaultLocs, logsOf,
  minutesNow, nowMeta, todayISO,
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
  /* HOW IT FEELS IS ASKED ONCE A DAY, on the first check-in — the same
     rule the day's attributions already follow.
     For chronic pain the character is the stable part: aching is aching
     on Tuesday and on Friday, and asking every check-in collects the
     same three words three hundred times. That is burden with almost no
     information in it, and worse, it buries the thing the question is
     actually for — the day the words CHANGE, when an ache starts
     burning or numbness arrives.
     Once a day rather than on unusual days, deliberately. Asking only
     when the pain is high would mean every day carrying words is a hard
     day, and "Described as" would fill with flare vocabulary and read as
     if that were the usual character. Data missing in step with the
     value being studied is worse than less data. */
  const [askFeel] = useState<boolean>(() => {
    const entry = db.getDay(today);
    const first = logsOf(entry).length === 0;
    const saidToday = logsOf(entry).some((l) => !!(l.q && l.q.length));
    return eligibleNow('firstOfDay', minutes, first, saidToday);
  });
  const [side, setSide] = useState<Side>('worse');
  const [worse, setWorse] = useState<string[]>([]);
  const [better, setBetter] = useState<string[]>([]);

  /* Chronic pain usually lives in the same places, so the where step opens
     with the last ones already ticked and the common case is one tap on
     Save. The list is on screen and Save is pressed deliberately, so what
     gets filed is still something the user looked at and agreed to — the
     thing to avoid was recording places nobody was ever shown. */
  /* WHERE IT HURT LAST TIME IS NOT TICKED FOR YOU. It used to be, and
     the argument was that the list is on screen and Save is pressed
     deliberately — but a default gets rubber-stamped, and once it does
     the record cannot tell "it hurt there today" from "it usually hurts
     there and I didn't untick it". That difference is the whole value of
     the data: every comparison this app makes is between days where
     something was true and days where it was not.

     The places are still here, one explicit tap away, and the chips
     still lead with the ones you actually use. Convenience that costs a
     tap, rather than convenience that answers for you. */
  /* The offer's SOURCE decides its words. History says "same as last
     time"; before any history exists, the places named at onboarding
     stand in, and the pill says "your usual places" instead — there is
     no last time to be the same as, and a pill should not claim one. */
  const [prev] = useState<{ ids: string[]; fromHistory: boolean }>(() => {
    const fromLogs = collapseSidedLocs(defaultLocs(db.getAll(), today));
    if (fromLogs.length) return { ids: fromLogs, fromHistory: true };
    return { ids: db.getPref<string[]>('onboard.loc.v1', []), fromHistory: false };
  });
  const previous = prev.ids;
  const sameAsLast = () => {
    Haptics.selectionAsync().catch(() => {});
    setLoc(previous.slice());
  };
  /* the where step's own "Show more" — separate from the feel step's,
     because opening every quality word must not silently switch the
     where question into its sided vocabulary */
  const [locExpanded, setLocExpanded] = useState(false);

  /* chips in personal order: what you actually pick floats to the front,
     and the rest waits behind "Show more" — a wall of fourteen options is
     a form, five of your usual ones is a question */
  const ranked = useMemo(() => {
    const locCount: Record<string, number> = {};
    const qCount: Record<string, number> = {};
    const all = db.getAll();
    Object.keys(all).forEach((k) => (all[k].logs || []).forEach((l) => {
      /* sided history counts toward its coarse family, so a run of
         "left knee" still floats the Knees chip forward */
      collapseSidedLocs(l.loc || []).forEach((id) => { locCount[id] = (locCount[id] || 0) + 1; });
      (l.q || []).forEach((id) => { qCount[id] = (qCount[id] || 0) + 1; });
    }));
    const rank = (ids: string[], counts: Record<string, number>) =>
      ids.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    /* only the COLLAPSED where view ranks; the expanded sections stay
       anatomical — a body does not reorder itself by frequency of
       complaint */
    return { loc: rank(LOC_CHIP_IDS, locCount), q: rank(QUALITYIDS, qCount) };
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

  /* WHERE comes before HOW IT FEELS. What this app is for is what
     changes around the pain, and where it is is part of that; the words
     for what it is like are the description, and a description is worth
     less to a comparison than a place. The last two steps are both
     optional either way, so the only thing the order decides is which
     one a person answers before they stop. */
  const order: Step[] = ['pain', 'questions', 'impact', 'where', 'feel'];
  const stepsShown = order.filter((s) => (
    s === 'questions' ? askIds.length > 0
      : s === 'impact' ? askImpact
        : s === 'feel' ? askFeel
          : true
  ));
  const isLast = stepsShown.indexOf(step) === stepsShown.length - 1;

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
  const persist = (opts?: { locAsked?: boolean; locSkipped?: boolean; qAsked?: boolean }) => {
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

  /* Each step writes what it owns and then either moves on or finishes.
     WHICH step finishes is decided by position, not by name: the last
     two are optional and either can be last depending on what today
     asked, and a hardcoded 'where' meant reordering them silently
     dropped the final write. */
  const advance = () => {
    if (pain == null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step === 'pain') {
      db.writeMoment(today, minutes, pain, null, null, nowMeta(SCALE_VERSION));
      setWrittenAt(minutes);
      setStep(nextAfter('pain'));
      return;
    }
    if (step === 'questions') persistAnswers();
    else if (step === 'impact') {
      /* both lists are written even when empty — "I looked and nothing
         applied" is an answer, and an ordinary day is exactly the kind
         this record is worst at keeping */
      db.setAnswerList(today, IMPACT_WORSE, worse, minutes, pid);
      db.setAnswerList(today, IMPACT_BETTER, better, minutes, pid);
    } else if (step === 'where') persist({ locAsked: true });
    else persist({ qAsked: true });
    if (isLast) finish(); else setStep(nextAfter(step));
  };

  /* ── swiping between steps ───────────────────────────────
     A sideways swipe is the Continue button by another hand: forward
     persists exactly what the button would have persisted, back is the
     back arrow. Two steps opt out — pain and any questions screen with
     a numeric slider — because a horizontal gesture there already
     means "move the value", and a swipe that could change an answer
     while leaving the screen is two intents in one motion. The final
     save stays on the button alone: finishing a day's record should
     never be a flick. */
  const swipeEnabled = step !== 'pain'
    && !(step === 'questions'
      && askIds.some((id) => (getMetric(id) || { type: '' }).type === 'numeric'));
  const swipeNext = () => {
    /* the last step is not swipeable: finishing a day's record should
       never be a flick, whichever step happens to be last today */
    if (isLast || pain == null) return;
    advance();
  };
  const stepSwipe = Gesture.Pan()
    .enabled(swipeEnabled)
    /* horizontal-only: the step's own vertical scroll must win a
       vertical drag, so the pan fails fast on any real y-movement */
    .activeOffsetX([-28, 28])
    .failOffsetY([-16, 16])
    .onEnd((e) => {
      'worklet';
      if (e.translationX < -60) runOnJS(swipeNext)();
      else if (e.translationX > 60) runOnJS(back)();
    });

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
      : step === 'where' ? 'Optional — only where it hurts today'
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

      {/* where you are in the flow — position, not obligation: no
          count, no percentage, and a pain-only entry that stops at the
          first segment is as finished as the record says it is */}
      <View
        style={styles.progressRow}
        accessible
        accessibilityLabel={'Step ' + (stepsShown.indexOf(step) + 1)
          + ' of ' + stepsShown.length}
      >
        {stepsShown.map((s, i) => (
          <View
            key={s}
            style={[
              styles.progressSeg,
              i <= stepsShown.indexOf(step) && styles.progressSegOn,
            ]}
          />
        ))}
      </View>

      <Text style={styles.title}>{title}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}

      <GestureDetector gesture={stepSwipe}>
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
        /* The main places, your usual ones first — the daily answer in
           a couple of taps. "Show more" ADDS the specific sided
           vocabulary below in anatomical sections; the main chips stay
           where they are, because more precision must never rearrange
           what is already on screen. The two levels coexist in one
           selection — "Knees" and "Left wrist" together is a fine
           answer — and whichever words were chosen are the words
           stored. */
        <ScrollView
          contentContainerStyle={styles.sectionWrap}
          showsVerticalScrollIndicator={false}
        >
          {/* the shortcut the prefill used to be, as a tap. It appears
              only while nothing is chosen: once you have said where it
              hurts, an offer to overwrite that with last time's answer
              is a trap, not a shortcut. */}
          {previous.length > 0 && loc.length === 0 && (
            <Press
              onPress={sameAsLast}
              pressOpacity={0.7}
              style={styles.sameAs}
              accessibilityRole="button"
              accessibilityLabel={(prev.fromHistory ? 'Same as last time: ' : 'Your usual places: ')
                + previous.map((id) => LOC_NAMES[id] || id).join(', ')}
            >
              <Text style={styles.sameAsText} allowFontScaling maxFontSizeMultiplier={1.3}>
                {prev.fromHistory ? 'Same as last time' : 'Your usual places'}
              </Text>
            </Press>
          )}
          <View style={styles.chipCloud}>
            {chipRow(ranked.loc, LOC_NAMES, loc, setLoc)}
          </View>
          {!locExpanded ? (
            <Press
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setLocExpanded(true);
              }}
              style={styles.more}
              pressOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Show specific places, left and right"
            >
              <Text style={styles.moreText}>Show more ›</Text>
            </Press>
          ) : (
            LOC_SECTIONS.map((sec) => (
              <View key={sec.title}>
                <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                  {sec.title}
                </Text>
                <View style={styles.chipCloud}>
                  {chipRow(sec.ids, LOC_NAMES, loc, setLoc)}
                </View>
              </View>
            ))
          )}
        </ScrollView>
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
      </GestureDetector>

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
                {/* DONE, not "Save": the check-in was written the moment
                    you left the pain step, and every step since has been
                    editing it. Nothing is pending here, so a Save button
                    would be describing work that already happened. */}
                {isLast ? 'Done'
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
  /* quiet position marker: neutral segments, filled up to here in
     white — never the pain palette, which would hand a hue a meaning
     this bar does not have */
  progressRow: {
    flexDirection: 'row', gap: 5, alignSelf: 'center',
    marginTop: 14, marginBottom: 2,
  },
  progressSeg: {
    width: 26, height: 3, borderRadius: 1.5,
    backgroundColor: color.bgSegmentTrack,
  },
  progressSegOn: { backgroundColor: color.textPrimary },
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
  /* the shortcut, drawn as a quiet outlined pill rather than as a chip:
     it is an action on the chips below, not one of them */
  sameAs: {
    alignSelf: 'center', minHeight: 38, justifyContent: 'center',
    paddingHorizontal: 16, marginBottom: 14,
    borderRadius: 19, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  sameAsText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  /* the sectioned where step: a column of titled chip clouds */
  sectionWrap: { paddingVertical: 18, gap: 4 },
  sectionTitle: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    textAlign: 'center', marginTop: 14, marginBottom: 10,
  },
  chipCloud: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9, justifyContent: 'center',
  },
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
