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
  runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { color, size } from './theme';

const THUMB = size.sliderThumb;

export interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}

export default function Slider({ value, onChange, max = 10 }: SliderProps) {
  const width = useSharedValue(0);
  const x = useSharedValue(0);
  const dragging = useSharedValue(false);
  const lastStep = useSharedValue(value);

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
      x.value = withSpring((usable * value) / max, { damping: 40, stiffness: 400, mass: 1 });
    }
  }, [value, max]);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      dragging.value = true;
      const usable = Math.max(1, width.value - THUMB);
      x.value = Math.max(0, Math.min(usable, e.x - THUMB / 2));
      const step = Math.round((x.value / usable) * max);
      if (step !== lastStep.value) { lastStep.value = step; runOnJS(emit)(step); }
    })
    .onUpdate((e) => {
      'worklet';
      const usable = Math.max(1, width.value - THUMB);
      x.value = Math.max(0, Math.min(usable, e.x - THUMB / 2));
      const step = Math.round((x.value / usable) * max);
      if (step !== lastStep.value) { lastStep.value = step; runOnJS(emit)(step); }
    })
    .onFinalize(() => {
      'worklet';
      dragging.value = false;
      // settle onto the chosen stop, carrying the gesture's own momentum
      const usable = Math.max(1, width.value - THUMB);
      x.value = withSpring((usable * lastStep.value) / max, { damping: 40, stiffness: 400, mass: 1 });
    });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}
        style={styles.hit}
      >
        <View style={styles.track} />
        <Animated.View style={[styles.thumb, thumbStyle]} />
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
});
