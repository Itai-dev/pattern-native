/**
 * The 0–10 slider.
 *
 * The first version tracked the finger from JavaScript, which is why it
 * lagged: every move crossed the bridge, and every whole-number change
 * re-rendered the screen around it, so the thumb was always drawing a
 * position the finger had already left. This version runs the gesture on
 * the UI thread with Gesture Handler + Reanimated — the thumb is moved by a
 * worklet and never waits for React. Only the VALUE crosses back to JS, and
 * only when the whole number actually changes.
 *
 * `runOnJS` is the one bridge crossing left, and it happens at most eleven
 * times in a drag rather than sixty times a second.
 *
 * THE FILL IS WHITE, AND SO IS EVERYTHING ELSE HERE (21 Oct 2026, the
 * October redesign). A grey track, white up to the thumb, a white thumb.
 * The pain ramp lives in the square above the control on the check-in
 * and nowhere on the control itself: a track tinted with the ramp would
 * paint ten scores at once on a screen asking for one, and the same
 * slider asks non-pain questions on the Add information sheet, where a
 * hue would borrow a meaning the answer does not have. The fill is drawn
 * only when there is a value — an unset scale shows an empty track, so
 * nothing looks answered that was not.
 */
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue,
  withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useReduceMotion } from './motion';
import { color } from './theme';

/* the redesign's control (Morning.dc.html): a 32pt thumb on an 8pt
   track. Local rather than theme tokens because this file is the only
   reader, and a token another screen could pick up would make a second
   control look like this one without behaving like it. */
const THUMB = 32;
const TRACK_H = 8;
/** how much the thumb grows under a finger — enough to feel picked up,
 *  not enough to hide where the fill ends */
const LIFT = 1.12;
/** critically damped: the thumb lands on the stop and does not wobble
 *  past it, because a wobble past 6 reads, for a frame, as a 7 */
const SNAP = { damping: 40, stiffness: 400, mass: 1 };

export interface SliderProps {
  /** null = nothing chosen yet. The thumb still needs a position, so the
   *  internal one parks in the middle while the VALUE stays unset — no
   *  score is ever recorded before the user touches the control. */
  value: number | null;
  onChange: (v: number) => void;
  max?: number;
  /** optional continuous 0–max value, driven on the UI thread — for a shape
   *  that must move with the finger while the value itself snaps */
  progress?: SharedValue<number>;
  /** whether the value on screen is one the person chose. The check-in
   *  starts LIVE at five (see CheckinScreen), so its value is never null
   *  — but until a finger lands it is not an answer either. Without this
   *  the slider only knew "null or not", seeded its last step at 5, and a
   *  tap at 5 changed nothing it could see: no change, no haptic, Done
   *  stayed dim. Someone in a flare who IS at a five tapped, watched
   *  nothing happen, and was left to drag away and back. Defaults to
   *  value != null, so sheets with an unset scale behave as before. */
  chosen?: boolean;
  accessibilityLabel?: string;
  accessibilityValue?: { min?: number; max?: number; now?: number; text?: string };
}

export default function Slider({
  value, onChange, max = 10, progress, chosen = value != null,
  accessibilityLabel, accessibilityValue,
}: SliderProps) {
  /* REDUCE MOTION: the thumb still follows the finger 1:1 — that is
     direct manipulation, not animation — but the settle onto a stop and
     the lift under the finger are cut, and a value set from elsewhere
     (VoiceOver, an edit) moves the thumb at once instead of springing */
  const reduce = useReduceMotion();
  const width = useSharedValue(0);
  const x = useSharedValue(0);
  const dragging = useSharedValue(false);
  const lift = useSharedValue(0);
  // -1 means "no step chosen yet", so the very first touch always emits
  const lastStep = useSharedValue(value == null || !chosen ? -1 : value);

  /* the haptic tick is fired from JS but never awaited — a dropped tick is
     invisible, a blocked frame is not */
  const emit = useCallback((v: number) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(v);
  }, [onChange]);

  /* while the finger is down the thumb belongs to the gesture; when it is
     up the thumb follows the value, so an external change (a new step, a
     reset) still moves it */
  useDerivedValue(() => {
    if (!dragging.value && width.value > 0) {
      const usable = Math.max(1, width.value - THUMB);
      /* An untouched thumb parks in the MIDDLE, not at zero. Parked left
         it read as a choice — the lowest one — on a scale where zero is a
         real and meaningful answer, and it made every drag start from an
         opinion the app had formed on your behalf. The middle is the one
         position that is not an answer. The VALUE is still null until a
         finger lands: nothing is recorded from where the thumb sits. */
      const at = value == null ? max / 2 : value;
      const to = (usable * at) / max;
      x.value = reduce ? to : withSpring(to, SNAP);
    }
  }, [value, max, reduce]);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      dragging.value = true;
      lift.value = reduce ? 0 : withTiming(1, { duration: 120 });
      const usable = Math.max(1, width.value - THUMB);
      x.value = Math.max(0, Math.min(usable, e.x - THUMB / 2));
      if (progress) progress.value = (x.value / usable) * max;
      const step = Math.round((x.value / usable) * max);
      if (step !== lastStep.value) { lastStep.value = step; runOnJS(emit)(step); }
    })
    .onUpdate((e) => {
      'worklet';
      const usable = Math.max(1, width.value - THUMB);
      x.value = Math.max(0, Math.min(usable, e.x - THUMB / 2));
      if (progress) progress.value = (x.value / usable) * max;
      const step = Math.round((x.value / usable) * max);
      if (step !== lastStep.value) { lastStep.value = step; runOnJS(emit)(step); }
    })
    .onFinalize((e) => {
      'worklet';
      dragging.value = false;
      /* Settle onto the chosen stop CARRYING THE FINGER'S VELOCITY.
         This line claimed to do that for a long time and did not: the
         spring started from rest, so at the instant of release the thumb
         stopped dead and then re-accelerated toward the stop. It is a few
         milliseconds and it is the difference between the thumb feeling
         attached to your finger and feeling like a thing being animated
         near it — on the one control this app is mostly made of.

         Reanimated wants velocity in the animated value's own units per
         second, and x is in points, so the gesture's px/s goes straight
         in. Both are zero on a tap, which is the correct handoff too. */
      const usable = Math.max(1, width.value - THUMB);
      const to = (usable * lastStep.value) / max;
      x.value = reduce ? to : withSpring(to, { ...SNAP, velocity: e.velocityX });
      lift.value = reduce ? 0 : withTiming(0, { duration: 180 });
      if (progress) {
        progress.value = reduce ? lastStep.value : withTiming(lastStep.value, { duration: 160 });
      }
    });

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { scale: 1 + (LIFT - 1) * lift.value }],
  }));
  /* the fill ends under the thumb's centre, so the white reads as one
     piece with the thumb rather than as a bar beside it */
  const fillStyle = useAnimatedStyle(() => ({ width: x.value + THUMB / 2 }));

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}
        style={styles.hit}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={accessibilityValue}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }, { name: 'activate' }]}
        onAccessibilityAction={(e) => {
          /* a double-tap chooses what is on screen, as a tap on the thumb
             does — otherwise VoiceOver reached the default five only by
             swiping away and back */
          if (e.nativeEvent.actionName === 'activate') {
            /* emit, not onChange: the haptic is the one sign a VoiceOver
               user gets that the choice landed and Done is live */
            if (value != null) emit(value);
            return;
          }
          // VoiceOver swipes step the value, and an unset scale starts at 0
          const at = value == null ? -1 : value;
          const next = e.nativeEvent.actionName === 'increment'
            ? Math.min(max, at + 1)
            : Math.max(0, at < 0 ? 0 : at - 1);
          if (next !== value || !chosen) {
            /* a swipe moves no finger, so the shape above is told here —
               otherwise the square kept the colour of the last drag */
            if (progress) progress.value = reduce ? next : withTiming(next, { duration: 160 });
            onChange(next);
          }
        }}
      >
        <View style={styles.track} />
        {value != null && <Animated.View style={[styles.fill, fillStyle]} />}
        <Animated.View
          style={[styles.thumb, thumbStyle, value == null && styles.thumbUnset]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // a tall invisible hit area around a thin track — the finger deserves room
  hit: { height: 48, justifyContent: 'center' },
  /* #2C2C2E — a neutral, so the white fill is the only part of the
     control that changes */
  track: {
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    backgroundColor: color.bgSegmentTrack,
  },
  fill: {
    position: 'absolute', left: 0,
    height: TRACK_H, borderRadius: TRACK_H / 2,
    backgroundColor: color.textPrimary,
  },
  thumb: {
    position: 'absolute',
    width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    backgroundColor: color.textPrimary,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  /* An untouched thumb is a solid white dot, like every other iOS slider.
     "Not yet chosen" is said by the button that waits — it does not
     also need the control to look broken. */
  thumbUnset: {
    backgroundColor: color.textPrimary,
  },
});
