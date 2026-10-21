/**
 * The check-in: one question, and out.
 *
 *   How intense is your pain right now?  — the slider; the square's
 *                               colour moves with the finger, the number
 *                               in it and the word under it snap. Save
 *                               writes the moment and shows the tick.
 *
 * ONE SCREEN, SINCE 17 SEP 2026. The flow used to run three: the number,
 * then where it hurt, then "About today" with the words for the pain,
 * the symptoms and the evening's questions — with a learned lead
 * (checkinMode.ts) deciding whether the first button said Log it or
 * Continue. Every optional screen was skippable and every one was still
 * a screen: the flow carried its own progress bar, a hint saying the
 * rest was optional, and two buttons under the slider explaining which
 * of them was the short way. The founder's call was that a check-in is
 * the number, and the rest is INFORMATION ADDED to a day that already
 * has one. So the where, the words, the symptoms and the day's questions
 * live in AddInfoSheet, opened from Today's card ("Add information"),
 * and this screen asks the one thing it is for.
 *
 * PAIN IS THE ONLY MANDATORY ANSWER, and now it is the only answer here.
 * A pain-only entry is complete, and nothing anywhere calls it otherwise.
 *
 * SAVE WAITS FOR A TOUCH. The slider parks at five and the square is
 * live from the first frame — a dimmed screen read as broken when it
 * was tried — but Save stays disabled until the slider has actually
 * been touched. A five nobody chose is not a number the record should
 * hold, and with a single button on the screen the disabled state is
 * legible: the question has not been answered yet. Tapping the slider
 * at five is choosing five. An edit opens on a number already chosen,
 * so Save is live at once.
 *
 * A SHEET, SINCE THE OCTOBER REDESIGN (21 Oct 2026, Morning.dc.html).
 * It was a full-screen page with a back arrow; it is now a sheet over
 * Today with a grabber, Cancel top left and the time top right — the
 * add-data bar Apple Health puts on its own entry sheets. Cancel, the
 * swipe down and the VoiceOver escape all mean the same thing and all
 * go through `leave`, so an abandoned check-in is counted however it
 * was abandoned. The swipe is only an attempt (see requestCloseRef);
 * nothing is lost to it, because nothing is written before Save.
 *
 * The confirmation is the one place in this app that gets a real
 * animation, and it earns it: it is the end of the interaction, it
 * happens once, and the thing it is confirming — that today is recorded
 * — is the only thing the app promises. The tick springs in, then
 * settles into a slow breath. Reduce Motion turns all of it off and the
 * mark is simply there.
 */
import React, { useEffect, useState } from 'react';
import {
  Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  cancelAnimation, useAnimatedStyle, useSharedValue, withDelay,
  withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { fmtDay } from './DayScreen';
import Slider from './Slider';
import SquarePicker, { PREF_SQUARE_PICKER } from './SquarePicker';
import PainShape from './PainShape';
import * as db from './db';
import { Press, useReduceMotion } from './motion';
import Icon, { IconName } from './Icon';
import { healthNowHint } from './health/context';
import { HealthDay } from './health/types';
import { track, trackCheckin } from './analytics';
import { color, font, size } from './theme';
import {
  PAIN_END_HIGH, PAIN_END_LOW, PAIN_MAX, PAIN_MIN, formatScore, painLabel, speakScore,
  SCALE_VERSION,
} from './painScale';
import { Moment, MomentMeta, logsOf, minutesNow, nowMeta, readLocParts, todayISO } from './model';
import { TimeBandKey, bandOf } from './metrics';
import { fmtClock } from './clock';

/** the hero at full size — the mockup's 172 */
const SQUARE = 172;
/** the square's floor when the screen is short of room — under this the
 *  hue stops reading as a field and becomes a swatch */
const SQUARE_MIN = 88;
/** air kept between the square's block and what sits above and below it */
const SQUARE_GAP = 14;
/** the redesign's primary button: 54 tall, fully rounded */
const BUTTON_H = 54;
/** the sheet's own ground — a step up from Today's black, so the sheet
 *  reads as lifted over it (Morning.dc.html) while staying far darker
 *  than the #1C1C1E of the pill and of a card */
const SHEET_BG = '#0E0E10';

/* the part of the day, said the way a person says it. "This" for today,
   "that" for a remembered day — the line under the question already
   names which day. The bands are metrics.ts's, the same ones the
   reminders and the engine use, so "this morning" here is the morning
   the activity card reads. */
const WHEN_TODAY: Record<TimeBandKey, string> = {
  morning: 'this morning', afternoon: 'this afternoon', evening: 'this evening', night: 'tonight',
};
const WHEN_PAST: Record<TimeBandKey, string> = {
  morning: 'that morning', afternoon: 'that afternoon', evening: 'that evening', night: 'that night',
};
/** white glyphs, never a hue: the time of day is not a pain value */
const WHEN_ICON: Record<TimeBandKey, IconName> = {
  morning: 'sun.haze.fill', afternoon: 'sun.max.fill', evening: 'moon.stars.fill', night: 'moon.fill',
};
/** the pill's ink — a hair under white, as the mockup sets it, so the
 *  context reads as a label and not as a control */
const PILL_INK = '#EBEBF0';

export interface CheckinScreenProps {
  /** the day being written. Absent = today, the normal case. A PAST day
   *  makes this a RETROSPECTIVE check-in: the user picks the time it
   *  describes, and the screen says it is from memory. */
  dateIso?: string;
  /** An EXISTING moment of that day, to edit. The screen opens on its
   *  value with its time shown and changeable, and the write edits the
   *  same moment in place, keeping its capture stamps and everything
   *  else it carries — places, words, symptoms — untouched. Before this
   *  existed "tap to edit" opened a fresh check-in for today. */
  edit?: Moment;
  /** minutes since midnight; injectable so previews can fix the clock */
  now?: number;
  onDone: () => void;
  onClose: () => void;
  /** the host's swipe-down lands here. A pageSheet in this React Native
   *  is modalInPresentation unless allowSwipeDismissal is set, so a
   *  swipe is an ATTEMPT: UIKit holds the sheet and fires
   *  onRequestClose, and the host hands it to `leave`, the same path as
   *  Cancel — which is what keeps "opened, chose nothing, left" counted
   *  when the leaving was a flick. */
  requestCloseRef?: { current: (() => void) | null };
}

export default function CheckinScreen({
  now, dateIso, edit, onDone, onClose, requestCloseRef,
}: CheckinScreenProps) {
  const insets = useSafeAreaInsets();
  const editing = !!edit;
  const [done, setDone] = useState(false);
  /* THE SLIDER STARTS AT FIVE, LIVE. It used to start unset — dimmed
     square, "Move the slider to choose", both buttons dead — on the
     argument that a pre-selected 5 rubber-stamped by a reflexive tap is
     a number nobody entered. The founder's call, on seeing it, was that
     a dead screen is the worse first impression: it reads as broken.
     The middle is where it starts and the square is live; what waits is
     the button — see `moved` and the header. Whether the slider was
     touched still travels with the check-in's own count, so the
     rubber-stamp rate stays a number rather than a fear. */
  const [pain, setPain] = useState<number>(edit ? edit.pain : 5);
  const [moved, setMoved] = useState<boolean>(editing);
  /* the eleven-squares picker, being compared against the slider. Read
     once at open; a control that changed shape mid-check-in would be
     the wrong kind of surprise. */
  const [squares] = useState(() => db.getPref<boolean>(PREF_SQUARE_PICKER, false));
  const choose = (v: number) => { setPain(v); setMoved(true); };
  const [writtenAt, setWrittenAt] = useState<number | null>(edit ? edit.h : null);
  /* the square's colour starts at the middle of the ramp, where the
     thumb parks, so an untouched control and an untouched square agree */
  const progress = useSharedValue(edit ? edit.pain : 5);
  /* THE SQUARE GIVES WAY FIRST. The screen is a column: the question,
     then the middle (square and word), then the slider and the button.
     The middle is flex: 1 and centres its content, so when the content
     is taller than the room — a large text size, a short phone — it
     spills equally over the question above and the slider below, and
     the square ends up covering the question. Measured, the square is
     the one thing here with no information in its size, so it is what
     shrinks: the room minus everything else in the middle, floored at
     SQUARE_MIN. */
  const [middleH, setMiddleH] = useState(0);
  const [aboveH, setAboveH] = useState(0);
  const [belowH, setBelowH] = useState(0);
  const square = middleH && belowH
    ? Math.max(SQUARE_MIN, Math.min(SQUARE, middleH - aboveH - belowH - SQUARE_GAP))
    : SQUARE;
  /* when the flow opened, for the one number the funnel needs: seconds
     to a finished check-in. The clock, never the content. */
  const [openedAt] = useState(() => Date.now());
  /* the confirmation: arrival, then a slow breath under it */
  const landed = useSharedValue(0);
  const breath = useSharedValue(0);

  /* "today" is the day being WRITTEN — usually the calendar's today,
     sometimes a remembered day inside the retro window.
     FROZEN WHEN THE SHEET OPENS. Both used to be recomputed on every
     render; a check-in begun at 23:58 and finished at 00:02 then wrote
     its moment onto the new day at the new minute, left an orphan on
     the old one, and switched the screen into its remembered-day mode
     mid-flow. The day a person started describing is the day they are
     describing. */
  const [today] = useState(() => dateIso || todayISO());
  const [retro] = useState(() => (dateIso || todayISO()) !== todayISO());

  /* a retro entry describes a time the user names; midday is only the
     picker's starting point, and the control is on screen the whole
     time — the time is part of what they enter. An edit starts from the
     moment's own time, and may move it. */
  const [retroMinutes, setRetroMinutes] = useState(edit ? edit.h : 12 * 60);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const timed = retro || editing;
  const minutes = timed ? retroMinutes
    : now != null ? now
    /* past midnight with the sheet still open, the check-in is still
       about the day it started on: 23:59 of that day, not 00:02 of a
       day that has not been lived yet */
    : todayISO() === today ? minutesNow() : 1439;

  /* THE STAMPS ON A WRITE. A new moment is stamped now; an edit keeps
     the stamps the moment already carries, so a check-in made on Tuesday
     and corrected on Thursday still says Tuesday — and still says
     "added later" if that is what it was. Nothing else is in the meta:
     applyMoment's in-place rule keeps every flag, note and chip the
     moment already had when the writer does not mention them. */
  const meta = (): MomentMeta => editing
    ? { sv: SCALE_VERSION, ...(edit!.ts !== undefined ? { ts: edit!.ts } : {}),
        ...(edit!.tz !== undefined ? { tz: edit!.tz } : {}) }
    : nowMeta(SCALE_VERSION);

  /* the last few hours as Health saw them, under the word: the dose an
     hour ago, the workout that just ended. Today's flow only — a past
     day's "now" is not now. */
  const [nowHint] = useState<string[]>(() =>
    retro || editing ? [] : healthNowHint(db.getHealthDay<HealthDay>(today), minutesNow()));

  /* the logged screen acknowledges and leaves — no button tax on every
     log, and with nothing to read the acknowledgement is brief */
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(onDone, 1400);
    return () => clearTimeout(t);
  }, [done, onDone]);

  const rm = useReduceMotion();
  useEffect(() => {
    if (!done) return;
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
  }, [done, rm]);

  const squareStyle = useAnimatedStyle(() => ({
    opacity: landed.value,
    transform: [{ scale: (0.86 + landed.value * 0.14) * (1 + breath.value * 0.035) }],
  }));

  /** write the number. The moment is keyed by its minute, so a changed
   *  time (the picker on an edit or a remembered day) must MOVE the
   *  moment, not leave a duplicate behind. An edit writes the places and
   *  words it already carried back with the number, so nothing the
   *  moment held is lost to a correction of its value. */
  const save = (): boolean => {
    if (writtenAt != null && writtenAt !== minutes
      && logsOf(db.getDay(today)).some((l) => l.h === minutes)) {
      Alert.alert('There’s already a check-in at that time', 'Choose another minute to keep both entries.');
      return false;
    }
    db.writeMoment(
      today, minutes, pain,
      editing ? (edit!.loc || []) : null, editing ? (edit!.q || []) : null,
      meta(), writtenAt ?? undefined
    );
    setWrittenAt(minutes);
    return true;
  };

  const finish = () => {
    if (!moved || !save()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    /* the count the funnel is built on: seconds from opening to a
       finished check-in. Context is never added here any more — the
       sheet that adds it counts itself. An edit is not a check-in and
       is not counted. */
    if (!editing) trackCheckin(Math.round((Date.now() - openedAt) / 1000), false, moved);
    setDone(true);
  };

  const leave = () => {
    Haptics.selectionAsync().catch(() => {});
    /* opened, chose nothing, left — the funnel's quietest number and
       the one that says whether the screen is working */
    if (writtenAt == null) track('checkin_abandoned');
    onClose();
  };
  /* re-pointed after every render, so a swipe reads `writtenAt` as it is
     now — not as it was in the render that first set it */
  useEffect(() => {
    if (!requestCloseRef) return;
    requestCloseRef.current = leave;
    return () => { requestCloseRef.current = null; };
  });

  if (done) {
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
       ramp. Same arrival spring, same breath, same tap-to-skip. */
    return (
      <Pressable
        onPress={onDone}
        style={[styles.root, { paddingTop: 20, paddingBottom: insets.bottom + 30 }]}
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

  /* writing the past must never look like writing the present — and
     editing must never look like a new entry */
  const retroLine = editing
    ? 'Editing the ' + fmtClock(edit!.h) + ' check-in' + (retro ? ' on ' + fmtDay(today) : '')
    : retro ? 'For ' + fmtDay(today) + ', from memory' : null;

  /* THE CONTEXT PILL SAYS ONLY WHAT THE APP ALREADY KNOWS. The part of
     the day always — it is the clock, not a guess. A body place only
     when this moment carries one, which today means an edit of a
     moment that had places added to it: a new check-in records no
     place (that is Add information's job, after the number), so naming
     one here — the onboarding's usual places, say — would put a place
     on a number the record will not hold it against. */
  const band = bandOf(minutes);
  const places = editing ? readLocParts(edit!.loc || []).map((p) => p.label) : [];
  const when = (retro ? WHEN_PAST : WHEN_TODAY)[band];
  const context = places.length ? places.join(', ') + ' · ' + when
    : when.charAt(0).toUpperCase() + when.slice(1);

  /* the slider's value, as VoiceOver reads it: "3, Mild". The label
     already says "0 to 10", so the range is not said twice. */
  const spoken = { min: PAIN_MIN, max: PAIN_MAX, now: pain, text: formatScore(pain) + ', ' + painLabel(pain) };
  const sliderLabel = timed ? 'Pain at that time, 0 to 10' : 'Pain right now, 0 to 10';

  return (
    <View style={styles.root} onAccessibilityEscape={leave}>
      <View style={[styles.inner, { paddingBottom: insets.bottom + 20 }]}>
      {/* the grabber says what the sheet is: something that came up over
          Today and goes back down. Drawn here, because a React Native
          pageSheet does not ask UIKit for one. */}
      <View style={styles.grabber} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={styles.topBar}>
        <Press onPress={leave} style={[styles.navBtn, styles.navLeft]} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Cancel"
          accessibilityHint={writtenAt == null ? 'Leaves without recording anything' : 'Leaves'}>
          <Text style={styles.navBtnText} maxFontSizeMultiplier={1.4}>Cancel</Text>
        </Press>
        {/* the flow's name sits between two equal-width ends, so it is
            centred on the sheet rather than on what is left */}
        <Text style={styles.navTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}
          accessibilityRole="header">
          {editing ? 'Edit check-in' : 'Check-in'}
        </Text>
        <View style={[styles.navBtn, styles.navRight]}>
          <Text style={styles.navTime} maxFontSizeMultiplier={1.4}>{fmtClock(minutes)}</Text>
        </View>
      </View>

      <View style={styles.head}>
        <View
          style={styles.pill}
          accessible
          accessibilityLabel={context.replace(' · ', ', ')}
        >
          <Icon name={WHEN_ICON[band]} size={14} color={PILL_INK} />
          <Text style={styles.pillText} numberOfLines={1} maxFontSizeMultiplier={1.4}>
            {context}
          </Text>
        </View>
        <Text style={styles.title} accessibilityRole="header">
          {timed ? 'How intense was\nyour pain?' : 'How intense is your\npain right now?'}
        </Text>
        {!!retroLine && (
          <Text style={styles.retroLine} allowFontScaling maxFontSizeMultiplier={1.3}>
            {retroLine}
          </Text>
        )}
      </View>

      {/* AND WHEN EVEN THE FLOOR IS NOT ENOUGH, IT SCROLLS. At the largest
          text sizes the square at its floor can still leave the middle
          taller than the room, and a centred View spills equally over
          the question above and the slider below. A ScrollView clips
          instead: what fits is centred exactly as before, what does not
          is one short scroll away, and the slider and the button never
          move. */}
      <ScrollView
        style={styles.middleScroll}
        contentContainerStyle={styles.middleContent}
        onLayout={(e) => setMiddleH(e.nativeEvent.layout.height)}
        showsVerticalScrollIndicator={false}
        bounces={false}
        /* a UIDatePicker wheel inside a vertical scroller competes with
           it for the drag; while the wheel is up, the scroller yields */
        scrollEnabled={!showTimePicker}
        keyboardShouldPersistTaps="handled"
      >
        {timed && (
          <View style={styles.above} onLayout={(e) => setAboveH(e.nativeEvent.layout.height)}>
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
          </View>
        )}
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={'Pain ' + speakScore(pain)}
        >
          <PainShape progress={progress} value={pain} size={square} />
        </View>
        <View
          style={styles.below}
          /* monotonic: the Health line under the word changes with the
             value, and a square that resized on every slider move was
             jitter on exactly the screens this measuring exists for */
          onLayout={(e) => {
            /* READ THE EVENT NOW, NOT IN THE UPDATER. React Native pools
               its synthetic events: once the handler returns, the
               event's fields are nulled for reuse, and a functional
               state updater runs later, at the next render. Reading
               e.nativeEvent inside it read null.layout — a TypeError
               during render, no boundary above it, and in a release
               build that is RCTFatal: the 16 Sep Log crash. The height
               is copied out first; the updater sees a number. */
            const h = e.nativeEvent.layout.height;
            setBelowH((prev) => Math.max(prev, h));
          }}
        >
          {/* the number is in the square; the word says it again in the
              scale's own five categories, so colour never carries the
              value alone */}
          <Text style={styles.word} allowFontScaling maxFontSizeMultiplier={1.6}>
            {painLabel(pain)}
          </Text>
          {nowHint.map((t) => (
            <Text key={t} style={styles.nowHint} allowFontScaling maxFontSizeMultiplier={1.4}>
              {t}
            </Text>
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottom}>
        {squares ? (
          <SquarePicker
            value={pain}
            chosen={moved}
            onChange={choose}
            progress={progress}
            accessibilityLabel={sliderLabel}
            accessibilityValue={spoken}
          />
        ) : (
          <Slider
            value={pain}
            chosen={moved}
            onChange={choose}
            progress={progress}
            accessibilityLabel={sliderLabel}
            accessibilityValue={spoken}
          />
        )}
        {/* the anchors, number and word together: both ends always say
            what they mean, so nobody places themselves on a scale whose
            ends they have to remember */}
        <View style={styles.ends}>
          <Text style={styles.endText} maxFontSizeMultiplier={1.3}>
            {PAIN_MIN + ' · ' + PAIN_END_LOW}
          </Text>
          <Text style={styles.endText} maxFontSizeMultiplier={1.3}>
            {PAIN_END_HIGH + ' · ' + PAIN_MAX}
          </Text>
        </View>

        {/* ONE BUTTON. It is the whole of what this screen asks, so it
            gets the whole width — and it is a button that waits: dimmed
            and inert until the slider has been touched, because the one
            thing worse than an empty record is a record of fives nobody
            chose. White, never the ramp: a button is not a pain value. */}
        <Press
          onPress={finish}
          disabled={!moved}
          pressScale={0.97}
          accessibilityRole="button"
          accessibilityState={{ disabled: !moved }}
          accessibilityLabel={editing ? 'Save the check-in' : 'Record the pain and finish'}
          accessibilityHint={moved ? undefined : 'Choose a value on the slider first'}
          style={[styles.primary, moved ? styles.primaryOn : styles.primaryOff]}
        >
          <Text style={[styles.primaryText, moved ? styles.primaryTextOn : styles.primaryTextOff]}
            maxFontSizeMultiplier={1.4}>
            Save
          </Text>
        </Press>
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHEET_BG },
  inner: { flex: 1, paddingHorizontal: size.pageX, paddingTop: 8 },
  grabber: {
    width: 36, height: 5, borderRadius: 3, alignSelf: 'center',
    backgroundColor: color.borderControl,
  },
  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4,
  },
  navBtn: { minWidth: 72, minHeight: 44, justifyContent: 'center' },
  navLeft: { alignItems: 'flex-start' },
  navRight: { alignItems: 'flex-end' },
  navBtnText: { color: color.tint, fontSize: font.body },
  navTitle: {
    flexShrink: 1, color: color.textPrimary, fontSize: font.body, fontWeight: '600',
    textAlign: 'center',
  },
  /* a number, so the rounded face; grey, because it is information and
     not a control */
  navTime: {
    color: color.textTertiary, fontSize: font.subheadline, fontWeight: '600',
    fontFamily: 'ui-rounded', fontVariant: ['tabular-nums'],
  },
  head: { alignItems: 'center', marginTop: 24 },
  pill: {
    minHeight: 28, paddingHorizontal: 12, borderRadius: 14, borderCurve: 'continuous',
    backgroundColor: color.bgSurface, flexDirection: 'row', alignItems: 'center', gap: 6,
    maxWidth: '100%',
  },
  pillText: { flexShrink: 1, color: PILL_INK, fontSize: font.footnote, fontWeight: '600' },
  title: {
    color: color.textPrimary, fontSize: 26, fontWeight: '700', letterSpacing: -0.5,
    lineHeight: 31, textAlign: 'center', marginTop: 10,
  },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /* the middle as a scroller: the frame takes the room, the content
     centres in it while it fits and scrolls once it does not */
  middleScroll: { flex: 1, alignSelf: 'stretch' },
  middleContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  /* the two measured halves around the square — stretched so a picker
     can centre inside, centred so the column reads as one */
  above: { alignSelf: 'stretch', alignItems: 'center' },
  below: { alignSelf: 'stretch', alignItems: 'center' },
  retroLine: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    textAlign: 'center', marginTop: 6,
  },
  retroWhen: { minHeight: 36, justifyContent: 'center', marginBottom: 10 },
  retroWhenText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  /* the category under the square — the same five words everywhere */
  word: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '600',
    letterSpacing: -0.2, marginTop: SQUARE_GAP, textAlign: 'center',
  },
  /* the Health facts under the word: quiet, centred, and clearly not
     part of the value */
  nowHint: {
    color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 6,
    textAlign: 'center', fontVariant: ['tabular-nums'],
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
  bottom: { flexShrink: 0 },
  ends: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, paddingHorizontal: 6,
  },
  /* numbers in the rounded face, the words with them — one label per
     end, in the grey that says "about the control", not "a value" */
  endText: {
    color: color.textTertiary, fontSize: font.footnote, fontWeight: '600',
    fontFamily: 'ui-rounded', fontVariant: ['tabular-nums'],
  },
  /* a full pill, the redesign's primary button */
  primary: {
    minHeight: BUTTON_H, borderRadius: BUTTON_H / 2, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', marginTop: 18, paddingHorizontal: 16,
  },
  primaryOn: { backgroundColor: color.textPrimary },
  /* waiting: the surface colour, so the pill is visibly there and
     visibly not yet a button — a neutral, never a tint of the ramp */
  primaryOff: { backgroundColor: color.bgSegmentTrack },
  primaryText: { fontSize: font.body, fontWeight: '600' },
  primaryTextOn: { color: '#000000' },
  primaryTextOff: { color: color.textTertiary },
});
