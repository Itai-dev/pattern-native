/**
 * The house motion rules, in one place.
 *
 * Press feedback is asymmetric on purpose: the press lands instantly —
 * that is the whole of "response" — and the release eases back on the
 * strong curve. Reduced motion is a live module flag consulted by every
 * custom animation; system-provided motion (page sheets, modals) already
 * respects it on its own.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Pressable, PressableProps,
  StyleProp, ViewStyle,
} from 'react-native';

/** the strong curve — same house curve as the web app's --ease-out */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

/* the current answer, readable synchronously by imperative code that
   cannot hold a hook. Components must use useReduceMotion() instead —
   reading this in a mount effect is what made it a race. */
export let reduceMotion = false;

const watchers = new Set<(v: boolean) => void>();
function publish(v: boolean): void {
  if (v === reduceMotion) return;
  reduceMotion = v;
  watchers.forEach((f) => f(v));
}
AccessibilityInfo.isReduceMotionEnabled().then(publish).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', publish);

/**
 * The setting, as state — so a component re-runs when it changes.
 *
 * Seeded twice on purpose: once at render from whatever has already
 * arrived, and again on mount, because the promise can resolve in the gap
 * between the two and a value that lands there would otherwise be missed
 * until the next toggle.
 */
export function useReduceMotion(): boolean {
  const [on, setOn] = useState(reduceMotion);
  useEffect(() => {
    setOn(reduceMotion);
    watchers.add(setOn);
    return () => { watchers.delete(setOn); };
  }, []);
  return on;
}

export interface PressProps extends PressableProps {
  /** scale at full press; 1 = opacity-only feedback */
  pressScale?: number;
  pressOpacity?: number;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** a Pressable whose press is instant and whose release eases back */
export function Press({ pressScale = 1, pressOpacity = 0.85, style, children, ...rest }: PressProps) {
  const v = useRef(new Animated.Value(0)).current;
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => { v.stopAnimation(); v.setValue(1); rest.onPressIn?.(e); }}
      onPressOut={(e) => {
        Animated.timing(v, {
          toValue: 0,
          duration: reduceMotion ? 0 : 180,
          easing: EASE_OUT,
          useNativeDriver: true,
        }).start();
        rest.onPressOut?.(e);
      }}
    >
      <Animated.View
        style={[
          style,
          {
            opacity: v.interpolate({ inputRange: [0, 1], outputRange: [1, pressOpacity] }),
            transform: pressScale !== 1
              ? [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, pressScale] }) }]
              : [],
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
