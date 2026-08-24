/**
 * The house motion rules, in one place.
 *
 * Press feedback is asymmetric on purpose: the press lands instantly —
 * that is the whole of "response" — and the release eases back on the
 * strong curve. Reduced motion is a live module flag consulted by every
 * custom animation; system-provided motion (page sheets, modals) already
 * respects it on its own.
 */
import React, { useRef } from 'react';
import {
  AccessibilityInfo, Animated, Easing, Pressable, PressableProps,
  StyleProp, ViewStyle,
} from 'react-native';

/** the strong curve — same house curve as the web app's --ease-out */
export const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);

export let reduceMotion = false;
AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotion = v; }).catch(() => {});
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => { reduceMotion = v; });

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
