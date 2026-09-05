/**
 * The check-in, in State of Mind's cadence: one question per screen, a
 * living shape under the finger, and chips you tap through rather than
 * forms you fill.
 *
 *   1. How intense?      — slider; the shape moves with the finger, the
 *                          word snaps. The moment is WRITTEN when this
 *                          step ends, so nothing later can lose it, and
 *                          the screen then offers Log it as plainly as
 *                          it offers Add details.
 *   2. Where?            — your usual places as chips, one tap each, and
 *                          the body map behind "Show more" for anything
 *                          sided or specific.
 *   3. About today       — one scrollable screen, only when something is
 *                          due: the focus's questions (only the ones
 *                          this moment can honestly answer), how it
 *                          feels (SOCRATES "Character", once a day), and
 *                          what moved it (the chips, evenings only).
 *   4. Logged.           — a check mark, and out.
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
  TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withDelay,
  withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { fmtDay } from './DayScreen';
import BodyMap from './BodyMap';
import Slider from './Slider';
import PainShape from './PainShape';
import * as db from './db';
import { Press, useReduceMotion } from './motion';
import {
  IMPACT_BETTER, IMPACT_CHIPS, IMPACT_IDS, IMPACT_WORSE, MetricDef,
  eligibleNow, getMetric,
} from './metrics';
import { questionsNow } from './protocol';
import { healthHintFor } from './health/context';
import { HealthDay } from './health/types';
import { track, trackCheckin } from './analytics';
import { color, font, size } from './theme';
import {
  PAIN_END_HIGH, PAIN_END_LOW, formatScore, inkOn, painColor,
  painLabel, speakScore, SCALE_VERSION,
} from './painScale';
import {
  LOC_CHIP_IDS, LOC_NAMES, Moment, MomentMeta, QUALITYIDS,
  QUALITY_NAMES, answerOf, collapseSidedLocs, defaultLocs, logsOf,
  minutesNow, nowMeta, todayISO,
} from './model';
import { fmtClock } from './clock';

const IMPACT_LABELS: Record<string, string> = {};
IMPACT_CHIPS.forEach((c) => { IMPACT_LABELS[c.id] = c.name; });

const SQUARE = 150;

/** the body map's height inside the where step — the onboarding figure's
 *  size, which was drawn for a take-your-time screen and reads at it */
const MAP_H = 400;

/* THREE SCREENS, NEVER MORE. Pain, where, and "About today" — one
   scrollable screen holding whatever the day still asks: the period's
   questions, how it feels, what moved it. Each of those used to be its
   own screen, so a first check-in with a focus running was five screens
   deep; the count was the burden, not the questions. Everything on the
   third screen is optional, asked at most once a day, and each item
   keeps its own time window — sleep still only in the morning, the
   chips still only in the evening — so the screen is short when little
   is due and absent when nothing is. */
type Step = 'pain' | 'where' | 'today' | 'done';

/** which side of the chip grid is showing */
type Side = 'worse' | 'better';

export interface CheckinScreenProps {
  /** the day being written. Absent = today, the normal case. A PAST day
   *  makes this a RETROSPECTIVE check-in: the flow shrinks to pain and
   *  where, and the user picks the time it describes. The day-scoped
   *  questions stay in the present — a remembered attribution is recall
   *  bias invited into the one place it hurts most. */
  dateIso?: string;
  /** An EXISTING moment of that day, to edit. The flow opens on the pain
   *  step with its value set, its time shown and changeable, and the
   *  where and feel steps prefilled from it; every write edits the same
   *  moment in place, keeping its capture stamps. The day-scoped
   *  questions are not re-asked — they belong to the day, not to this
   *  moment, and the day screen already lets each be removed. Before
   *  this existed "tap to edit" opened a fresh check-in for today. */
  edit?: Moment;
  /** minutes since midnight; injectable so previews can fix the clock */
  now?: number;
  onDone: () => void;
  onClose: () => void;
  /** "something happened": finish the check-in as it stands and open
   *  the flare-or-treatment sheet. The event's door lives inside the
   *  check-in now — it happens on the same occasion, and a second
   *  button for it on Today was one button too many there. */
  onEvent?: () => void;
}

export default function CheckinScreen({
  now, dateIso, edit, onDone, onClose, onEvent,
}: CheckinScreenProps) {
  const insets = useSafeAreaInsets();
  const editing = !!edit;
  const [step, setStep] = useState<Step>('pain');
  /* the selected value is optional and starts unset: nothing is recorded
     until the user actually moves or taps the slider. The shape needs a
     position to draw, so its internal 0-10 progress is kept separate. */
  const [pain, setPain] = useState<number | null>(edit ? edit.pain : null);
  const [quality, setQuality] = useState<string[]>(edit && edit.q ? edit.q.slice() : []);
  const [loc, setLoc] = useState<string[]>(edit && edit.loc ? edit.loc.slice() : []);
  const [writtenAt, setWrittenAt] = useState<number | null>(edit ? edit.h : null);
  /* the shape starts at the middle of the ramp, where the thumb parks,
     so an untouched control and an untouched square agree with each other.
     Both are dimmed until a value is actually chosen. */
  const progress = useSharedValue(edit ? edit.pain : 5);
  /* when the flow opened, for the one number the funnel needs: seconds
     to a finished check-in. The clock, never the content. */
  const [openedAt] = useState(() => Date.now());
  /* the confirmation: arrival, then a slow breath under it */
  const landed = useSharedValue(0);
  const breath = useSharedValue(0);

  /* "today" is the day being WRITTEN — usually the calendar's today,
     sometimes a remembered day inside the retro window */
  const today = dateIso || todayISO();
  const retro = today !== todayISO();

  /* a retro entry describes a time the user names; midday is only the
     picker's starting point, and the control is on screen the whole
     step — the time is part of what they enter. An edit starts from the
     moment's own time, and may move it. */
  const [retroMinutes, setRetroMinutes] = useState(edit ? edit.h : 12 * 60);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const timed = retro || editing;
  const minutes = timed ? retroMinutes : (now != null ? now : minutesNow());
  const [showAllChips, setShowAllChips] = useState(false);

  /* THE STAMPS ON A WRITE. A new moment is stamped now; an edit keeps
     the stamps the moment already carries, so a check-in made on Tuesday
     and corrected on Thursday still says Tuesday — and still says
     "added later" if that is what it was. */
  const meta = (extra?: Partial<MomentMeta>): MomentMeta => ({
    ...(editing
      ? { sv: SCALE_VERSION, ...(edit!.ts !== undefined ? { ts: edit!.ts } : {}),
          ...(edit!.tz !== undefined ? { tz: edit!.tz } : {}) }
      : nowMeta(SCALE_VERSION)),
    ...(extra || {}),
  });

  /* ── today's questions ─────────────────────────────────────
     Resolved once, when the flow opens, from the active period and the
     clock. An empty list is the normal state before a protocol exists,
     and the step is skipped entirely rather than shown empty. Editing a
     moment asks none of them: they are the day's, already answered. */
  const [askIds] = useState<string[]>(() => {
    if (editing) return [];
    const entry = db.getDay(today);
    const isFirstOfDay = logsOf(entry).length === 0;
    /* interference is fixed core rather than part of a protocol, so it
       rides along as an extra and is asked once a day whether or not an
       observation period exists yet */
    return questionsNow(
      db.activeProtocol(),
      { h: minutes, isFirstOfDay, entry },
      /* interference is out of the daily loop — see metrics.ts; the
         registry keeps the id for the answers already recorded */
      []
    );
  });
  const { width: winW } = useWindowDimensions();
  /* what Health already has for today, read once — a hint above a
     question, never an answer to it */
  const [healthToday] = useState<HealthDay | null>(() => db.getHealthDay<HealthDay>(today));
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

  /* the chips. Asked once a day, in the window the registry declares
     for them — the evening, since "what made today harder" cannot be
     answered before the day has happened. The rule is read from the
     metric rather than repeated here, so it cannot drift. */
  const [askImpact] = useState<boolean>(() => {
    if (editing) return false;
    const entry = db.getDay(today);
    const first = logsOf(entry).length === 0;
    const rule = (getMetric(IMPACT_WORSE) || { eligibility: undefined }).eligibility;
    return eligibleNow(rule, minutes, first, answerOf(entry, IMPACT_WORSE) != null);
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
    /* an edit re-offers the words whenever the moment was the one that
       carried them, or was asked — its answer is the one being changed */
    if (editing) return !!(edit!.qAsked || (edit!.q && edit!.q.length));
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
  /* the third screen exists only when something is due on it. A retro
     check-in never has one: the day-scoped questions stay in the
     present. An edit has one only for the moment's own words. */
  const askToday = askIds.length > 0 || askImpact || askFeel;
  const order: Step[] = retro && !editing ? ['pain', 'where'] : ['pain', 'where', 'today'];
  const stepsShown = order.filter((s) => s !== 'today' || askToday);
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
  const anyAnswered = askIds.some((id) => answers[id] !== undefined)
    || quality.length > 0 || worse.length > 0 || better.length > 0;

  /** write the moment as it currently stands. Called at every step end, so
   *  the record is durable from the first one and each later step edits
   *  the same moment rather than adding another. */
  const persist = (opts?: { locAsked?: boolean; locSkipped?: boolean; qAsked?: boolean }) => {
    if (writtenAt == null || pain == null) return;
    db.writeMoment(today, writtenAt, pain, loc, quality, meta(opts));
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

  /** the count the funnel is built on: seconds from opening to a finished
   *  check-in, and whether any optional step was walked. An edit is not
   *  a check-in and is not counted. */
  const counted = (contextAdded: boolean) => {
    if (editing) return;
    trackCheckin(Math.round((Date.now() - openedAt) / 1000), contextAdded);
  };

  const finish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    /* "context added" means something beyond the number was actually
       chosen, not that a screen was walked through */
    counted(loc.length > 0 || anyAnswered);
    setStep('done');
  };

  const nextAfter = (s: Step): Step => {
    const i = stepsShown.indexOf(s);
    return i >= 0 && i + 1 < stepsShown.length ? stepsShown[i + 1] : 'done';
  };

  /** log the pain and stop there — a complete check-in. In an edit it
   *  saves the moment as it stands, places and words included: leaving
   *  early must never strip what was already recorded. */
  const logOnly = () => {
    if (pain == null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (writtenAt != null && writtenAt !== minutes) db.dropMoment(today, writtenAt);
    db.writeMoment(
      today, minutes, pain,
      editing ? loc : null, editing ? quality : null, meta()
    );
    setWrittenAt(minutes);
    counted(false);
    setStep('done');
  };

  /* Each step writes what it owns and then either moves on or finishes.
     WHICH step finishes is decided by position, not by name: the last
     two are optional and either can be last depending on what today
     asked, and a hardcoded 'where' meant reordering them silently
     dropped the final write. */
  /** write what the current step owns, without moving — the part of
   *  advance() that is about the record rather than the screen */
  const writeStep = () => {
    if (step === 'where') persist({ locAsked: true });
    else if (step === 'today') {
      if (askIds.length) persistAnswers();
      if (askImpact) {
        db.setAnswerList(today, IMPACT_WORSE, worse, minutes, pid);
        db.setAnswerList(today, IMPACT_BETTER, better, minutes, pid);
      }
      if (askFeel) persist({ qAsked: true });
    }
  };

  /** the event door: this check-in ends as it stands, counted like any
   *  other, and the flare-or-treatment sheet opens in its place */
  const toEvent = () => {
    if (pain == null || !onEvent) return;
    Haptics.selectionAsync().catch(() => {});
    writeStep();
    counted(loc.length > 0 || anyAnswered);
    onEvent();
  };

  const advance = () => {
    if (pain == null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step === 'pain') {
      /* the moment is keyed by its minute, so a changed time (the retro
         picker, or the clock ticking past a minute between two visits to
         this step) must MOVE the moment, not leave a duplicate behind.
         An edit writes its places and words along with the number, so
         closing on the next step leaves the moment whole. */
      if (writtenAt != null && writtenAt !== minutes) db.dropMoment(today, writtenAt);
      db.writeMoment(
        today, minutes, pain,
        editing ? loc : null, editing ? quality : null, meta()
      );
      setWrittenAt(minutes);
      setStep(nextAfter('pain'));
      return;
    }
    /* which optional steps get walked and which get skipped past — the
       step's NAME, never what was chosen on it */
    track('checkin_step_left', { step });
    /* each part of the third screen writes what it owns, and only the
       parts that were actually put — a question not on screen today is
       not a question the user declined. The chips' both lists are
       written even when empty: "I looked and nothing applied" is an
       answer, and an ordinary day is exactly the kind this record is
       worst at keeping. */
    writeStep();
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
    && !(step === 'today'
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
      {/* Health's answer to the same question, above yours — so the
          word chosen at nine is the night that happened, not the night
          remembered. The levels stay: the comparison needs the word. */}
      {!!healthHintFor(m.id, healthToday) && (
        <Text style={styles.qHealth} allowFontScaling maxFontSizeMultiplier={1.4}>
          {healthHintFor(m.id, healthToday)}
        </Text>
      )}
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
  const title = step === 'pain'
    ? (editing ? 'How intense was\nyour pain?' : 'How intense is your pain\nright now?')
    : step === 'today'
      /* an edit's third screen holds only the moment's own words */
      ? (editing ? 'How does it feel?' : 'About today')
      : 'Where in your body?';

  /* writing the past must never look like writing the present — and
     editing must never look like a new entry */
  const retroLine = editing
    ? 'Editing the ' + fmtClock(edit!.h) + ' check-in' + (retro ? ' on ' + fmtDay(today) : '')
    : retro ? 'For ' + fmtDay(today) + ', from memory' : null;

  const hint = step === 'today'
    ? (editing ? 'Optional — tap any that fit' : 'Optional — answer what fits, skip the rest')
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
        <Text style={styles.navTitle} allowFontScaling={false}>
          {editing ? 'Edit check-in' : 'Check-in'}
        </Text>
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
      {!!retroLine && (
        <Text style={styles.retroLine} allowFontScaling maxFontSizeMultiplier={1.3}>
          {retroLine}
        </Text>
      )}
      {hint && <Text style={styles.hint}>{hint}</Text>}

      <GestureDetector gesture={stepSwipe}>
      {step === 'pain' ? (
        <View style={styles.middle}>
          {timed && (
            <>
              <Press
                onPress={() => setShowTimePicker((v) => !v)}
                pressOpacity={0.7}
                style={styles.retroWhen}
                accessibilityRole="button"
                accessibilityLabel={'This check-in is for ' + fmtClock(minutes)
                  + '. Changes the time'}
              >
                <Text style={styles.retroWhenText} allowFontScaling maxFontSizeMultiplier={1.3}>
                  At {fmtClock(minutes)} · change
                </Text>
              </Press>
              {showTimePicker && (
                <DateTimePicker
                  value={new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60)}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  themeVariant="dark"
                  onChange={(_, d) => {
                    if (d) setRetroMinutes(d.getHours() * 60 + d.getMinutes());
                  }}
                />
              )}
            </>
          )}
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
      ) : step === 'today' ? (
        /* the one scrollable screen: the period's questions first (they
           are the ones with something to compare against), then the
           words for the pain, then the day's attributions. Each block
           appears only when it is due today. */
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

          {askFeel && (
            <View style={styles.todayBlock}>
              {!editing && (
                <Text style={styles.todayTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                  How does it feel?
                </Text>
              )}
              <View style={styles.chipCloud}>
                {chipRow(visibleIds(ranked.q, quality), QUALITY_NAMES, quality, setQuality)}
              </View>
              {!showAllChips && (
                <Press onPress={() => setShowAllChips(true)} style={styles.more} pressOpacity={0.7}
                  accessibilityRole="button" accessibilityLabel="Show every word">
                  <Text style={styles.moreText}>Show more ›</Text>
                </Press>
              )}
            </View>
          )}

          {askImpact && (
            <View style={styles.todayBlock}>
              <Text style={styles.todayTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                What moved it today?
              </Text>
              <Text style={styles.todayHint} allowFontScaling maxFontSizeMultiplier={1.4}>
                Your read on the day — Pattern records it, it doesn’t test it.
              </Text>
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
            </View>
          )}
        </ScrollView>
      ) : (
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
          {/* "Show more" opens THE BODY MAP — the same figure onboarding
              used to carry, speaking the sided vocabulary the record
              stores. It replaces five sections of twenty-four chips,
              which was the wall the map was built to spare people. The
              coarse chips above stay; both levels share one selection,
              and a mark wears the check-in's own pain colour. */}
          {!locExpanded ? (
            <Press
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setLocExpanded(true);
              }}
              style={styles.more}
              pressOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Show the body map, to mark specific places, left and right"
            >
              <Text style={styles.moreText}>Show the body map ›</Text>
            </Press>
          ) : (
            <View style={{ height: MAP_H, marginTop: 10 }}>
              <BodyMap
                selected={loc}
                onChange={setLoc}
                tint={painColor(pain ?? 5)}
                ink={inkOn(pain ?? 5)}
                containerWidth={winW - 56}
                containerHeight={MAP_H}
              />
            </View>
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

        {step === 'pain' ? (
          /* TWO BUTTONS OF EQUAL WEIGHT. The first version made
             "Continue" the filled primary and put "That's it for now"
             underneath in grey — and the product's first principle is
             that pain alone is a finished check-in. The weight said the
             opposite. Now the finishing action is the filled one and the
             longer path sits beside it at the same size: a real choice,
             not a default and an escape hatch. */
          <View style={styles.pairRow}>
            <Press
              onPress={advance}
              disabled={!canAdvance}
              pressScale={canAdvance ? 0.985 : 1}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAdvance }}
              accessibilityHint={canAdvance ? undefined : 'Choose a pain level first'}
              style={[styles.primary, styles.pairBtn, styles.outlined, !canAdvance && styles.outlinedOff]}
            >
              <Text style={[styles.primaryText, styles.outlinedText, !canAdvance && styles.primaryTextOff]}>
                {editing ? 'Change details' : 'Add details'}
              </Text>
            </Press>
            <Press
              onPress={logOnly}
              disabled={!canAdvance}
              pressScale={canAdvance ? 0.985 : 1}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAdvance }}
              accessibilityHint={canAdvance ? undefined : 'Choose a pain level first'}
              accessibilityLabel={editing
                ? 'Save the number and keep the rest as it was'
                : 'Log the pain and finish'}
              style={[styles.primary, styles.pairBtn, canAdvance ? styles.primaryOn : styles.primaryOff]}
            >
              <Text style={[styles.primaryText, canAdvance ? styles.primaryTextOn : styles.primaryTextOff]}>
                {editing ? 'Save' : 'Log it'}
              </Text>
            </Press>
          </View>
        ) : (
          <Press
            onPress={advance}
            disabled={!canAdvance}
            pressScale={canAdvance ? 0.985 : 1}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canAdvance }}
            style={[styles.primary, canAdvance ? styles.primaryOn : styles.primaryOff]}
          >
            <Text style={[
              styles.primaryText,
              canAdvance ? styles.primaryTextOn : styles.primaryTextOff,
            ]}>
              {/* DONE, not "Save": the check-in was written the moment
                  you left the pain step, and every step since has been
                  editing it. Nothing is pending here, so a Save button
                  would be describing work that already happened. */}
              {/* and a third screen left untouched says Skip, because that
                  is what the tap does — same door as Done, admitted */}
              {isLast
                ? (step === 'today' && !anyAnswered && !editing ? 'Skip' : 'Done')
                : 'Continue'}
            </Text>
          </Press>
        )}

        {/* the event door, on the last step of a check-in about today:
            a flare or a treatment happens on the same occasion as the
            number, so its door is here rather than a button of its own
            on Today. Quiet, and after the primary. */}
        {!!onEvent && !editing && !retro && step !== 'pain' && isLast && (
          <Press
            onPress={toEvent}
            pressOpacity={0.7}
            style={styles.secondary}
            accessibilityRole="button"
            accessibilityLabel="Something happened: finish this check-in and log a flare or treatment"
          >
            <Text style={styles.eventLink} allowFontScaling maxFontSizeMultiplier={1.3}>
              Something happened? Log a flare or treatment ›
            </Text>
          </Press>
        )}
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
  retroLine: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    textAlign: 'center', marginTop: 4,
  },
  retroWhen: { minHeight: 36, justifyContent: 'center', marginBottom: 10 },
  retroWhenText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
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
  /* the Health line under a question: the quiet colour, because it is
     context for an answer and not the answer */
  qHealth: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: -4,
    fontVariant: ['tabular-nums'],
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
  /* the third screen's blocks: a titled section each, ruled off from
     the questions above so three optional things read as three */
  todayBlock: {
    paddingTop: 22, borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderDivider, gap: 10,
  },
  todayTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 22 },
  todayHint: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: -4 },
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
  /* the pair: two pills, one row, the same height as the single one */
  pairRow: { flexDirection: 'row', gap: 10 },
  pairBtn: { flex: 1, marginTop: 26 },
  outlined: {
    backgroundColor: 'transparent',
    borderWidth: 1.5, borderColor: color.textPrimary,
  },
  outlinedOff: { borderColor: color.bgSegmentActive },
  outlinedText: { color: color.textPrimary },
  secondary: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  secondaryText: { color: color.textSecondary, fontSize: font.body, fontWeight: '600' },
  eventLink: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
});
