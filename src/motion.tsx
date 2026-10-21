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
import Reanimated, { Easing as REasing, FadeIn, ReduceMotion } from 'react-native-reanimated';

/** the strong curve — same house curve as the web app's --ease-out */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
/* the same curve, for Reanimated: a layout animation runs on the UI
   thread and takes its own Easing, not the core one */
const REVEAL_EASE = REasing.bezier(0.23, 1, 0.32, 1);

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

/**
 * Something opened in place — a "Why?", the details under a card, the
 * text behind an (i) — arriving as a short fade, not a cut.
 *
 * WHY IT MOVES AT ALL (21 Oct 2026, the Apple design pass). A disclosure
 * is a state change the person asked for, and a hard cut from nothing to
 * five lines of grey reads as the card swapping under the finger rather
 * than opening. A fade says "this was here, folded" — state indication,
 * one of the few jobs motion earns on a calm screen.
 *
 * WHY THIS LITTLE. 200ms, opacity only, on the house curve: a disclosure
 * is opened a few times a day, so it gets a standard animation and no
 * more — no slide (the content does not come from anywhere), no spring
 * (no gesture carried momentum into it), no exit (closing is putting it
 * away, and an echo of it leaving only delays the card settling). Under
 * Reduce Motion the system setting is honoured and it simply appears.
 */
export function Reveal({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Reanimated.View
      entering={FadeIn.duration(200).easing(REVEAL_EASE).reduceMotion(ReduceMotion.System)}
      style={style}
    >
      {children}
    </Reanimated.View>
  );
}
