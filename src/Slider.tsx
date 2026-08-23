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
 */
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue,
  withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { color, size } from './theme';

const THUMB = size.sliderThumb;

export interface SliderProps {
  /** null = nothing chosen yet. The thumb still needs a position, so the
   *  internal one starts at the low end while the VALUE stays unset — no
   *  score is ever recorded before the user touches the control. */
  value: number | null;
  onChange: (v: number) => void;
  max?: number;
  /** optional continuous 0–max value, driven on the UI thread — for a shape
   *  that must move with the finger while the value itself snaps */
  progress?: SharedValue<number>;
  accessibilityLabel?: string;
  accessibilityValue?: { min?: number; max?: number; now?: number; text?: string };
}

export default function Slider({
  value, onChange, max = 10, progress, accessibilityLabel, accessibilityValue,
}: SliderProps) {
  const width = useSharedValue(0);
  const x = useSharedValue(0);
  const dragging = useSharedValue(false);
  // -1 means "no step chosen yet", so the very first touch always emits
  const lastStep = useSharedValue(value == null ? -1 : value);

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
      x.value = withSpring((usable * at) / max, { damping: 40, stiffness: 400, mass: 1 });
    }
  }, [value, max]);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      dragging.value = true;
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
    .onFinalize(() => {
      'worklet';
      dragging.value = false;
      // settle onto the chosen stop, carrying the gesture's own momentum
      const usable = Math.max(1, width.value - THUMB);
      x.value = withSpring((usable * lastStep.value) / max, { damping: 40, stiffness: 400, mass: 1 });
      if (progress) progress.value = withTiming(lastStep.value, { duration: 160 });
    });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}
        style={styles.hit}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={accessibilityValue}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          // VoiceOver swipes step the value, and an unset scale starts at 0
          const at = value == null ? -1 : value;
          const next = e.nativeEvent.actionName === 'increment'
            ? Math.min(max, at + 1)
            : Math.max(0, at < 0 ? 0 : at - 1);
          if (next !== value) onChange(next);
        }}
      >
        <View style={styles.track} />
        <Animated.View
          style={[styles.thumb, thumbStyle, value == null && styles.thumbUnset]}
        />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  // a tall invisible hit area around a thin track — the finger deserves room
  hit: { height: 44, justifyContent: 'center' },
  track: {
    height: size.sliderTrackH,
    borderRadius: size.sliderTrackH / 2,
    backgroundColor: color.borderControl,
  },
  thumb: {
    position: 'absolute',
    width: THUMB, height: THUMB, borderRadius: THUMB / 2,
    backgroundColor: color.textPrimary,
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  /* An untouched thumb is a solid white dot, like every other iOS slider.
     "Not yet chosen" is said by the words under the shape and by the
     shape's own dimming — it does not also need the control to look
     broken. */
  thumbUnset: {
    backgroundColor: color.textPrimary,
  },
});
