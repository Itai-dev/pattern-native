/**
 * The shape you're actually manipulating — Pattern's answer to State of
 * Mind's morphing blob, in this app's own square language.
 *
 * ONE solid rounded square, nothing nested inside it. Its colour follows
 * the brightness ramp continuously under the finger — blue-black at 0
 * rising to icy near-white at 10 — with a single soft outer glow in the
 * same colour. The numeric score beneath carries the precise information;
 * this surface carries the feel of it. As pain rises the square gains a
 * little mass, it breathes when untouched, and it holds still when
 * Reduce Motion is on.
 */
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  SharedValue, interpolate, interpolateColor, useAnimatedStyle,
  useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import { painRamp } from './painScale';
import { reduceMotion } from './motion';

const STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export interface PainShapeProps {
  /** continuous 0–10, driven by the slider gesture */
  progress: SharedValue<number>;
  size: number;
}

export default function PainShape({ progress, size }: PainShapeProps) {
  const ramp = painRamp();
  const breath = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    // a slow, shallow breath — presence, not decoration
    breath.value = withRepeat(withTiming(1, { duration: 2600 }), -1, true);
  }, []);

  const radius = size * 0.24;

  const surface = useAnimatedStyle(() => {
    const fill = interpolateColor(progress.value, STEPS, ramp);
    const scale = interpolate(progress.value, [0, 10], [0.94, 1.04]) +
      (reduceMotion ? 0 : breath.value * 0.008);
    return {
      backgroundColor: fill,
      transform: [{ scale }],
      /* the one glow: the surface's own colour, soft and continuous —
         brighter values naturally cast more light on the black ground */
      shadowColor: fill,
      shadowOpacity: interpolate(progress.value, [0, 10], [0.25, 0.6]),
      shadowRadius: interpolate(progress.value, [0, 10], [14, 26]),
    };
  });

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          {
            position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
            borderRadius: radius,
            shadowOffset: { width: 0, height: 0 },
            /* at 0 the surface is nearly black — the hairline keeps it
               present on the black screen without adding a second layer */
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
          },
          surface,
        ]}
      />
    </View>
  );
}
