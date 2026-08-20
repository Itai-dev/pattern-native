/**
 * The shape you're actually manipulating — Pattern's answer to State of
 * Mind's morphing blob, in this app's own square language.
 *
 * It reads the slider's shared value directly, so it moves with the finger
 * on the UI thread: colour, depth and size are continuous while the *word*
 * beneath snaps to whole steps. That split is the whole trick in Apple's
 * version — the shape is analogue, the label is discrete — and it's why
 * dragging feels like handling a material rather than setting a number.
 *
 * Construction is the app icon's: three concentric rounded squares, the
 * rim saturated and the core pale. As pain rises the whole thing grows
 * slightly and the core tightens, so intensity is felt as mass, not just
 * hue. It breathes when untouched, and stops when Reduce Motion is on.
 */
import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  SharedValue, interpolate, interpolateColor, useAnimatedStyle,
  useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { theme } from './theme';
import { reduceMotion } from './motion';

const STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface PainShapeProps {
  /** continuous 0–10, driven by the slider gesture */
  progress: SharedValue<number>;
  size: number;
}

export default function PainShape({ progress, size }: PainShapeProps) {
  const ramp = theme.ramp as unknown as string[];
  const breath = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    // a slow, shallow breath — presence, not decoration
    breath.value = withRepeat(withTiming(1, { duration: 2600 }), -1, true);
  }, []);

  const radius = size * 0.24;

  /* outer: the saturated rim. Grows a little with intensity so a bad day
     has more weight on screen than a good one. */
  const outer = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 10], [0.94, 1.04]) +
      (reduceMotion ? 0 : breath.value * 0.008);
    return {
      backgroundColor: interpolateColor(progress.value, STEPS, ramp),
      transform: [{ scale }],
    };
  });

  /* middle and core: the icon's inner squares. The core tightens as pain
     rises — the light at the centre shrinking under pressure. */
  const middle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      Math.max(0, progress.value - 2.2), STEPS, ramp
    ),
    transform: [{ scale: interpolate(progress.value, [0, 10], [0.78, 0.68]) }],
  }));

  const core = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      Math.max(0, progress.value - 4.4), STEPS, ramp
    ),
    opacity: interpolate(progress.value, [0, 10], [0.95, 0.75]),
    transform: [{ scale: interpolate(progress.value, [0, 10], [0.5, 0.36]) }],
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={[styles.layer, { borderRadius: radius }, outer]} />
      <Animated.View style={[styles.layer, { borderRadius: radius * 0.8 }, middle]} />
      <Animated.View style={[styles.layer, { borderRadius: radius * 0.6 }, core]} />
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
});
