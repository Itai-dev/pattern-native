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
  StyleProp, StyleSheet, ViewStyle,
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

/** A Pressable whose press is instant and whose release eases back.
 *
 *  THE STYLE IS SPLIT, and the split is load-bearing. Everything used to
 *  land on the Animated.View inside an unstyled Pressable, which meant a
 *  caller's flex: 1 in a row sized an inner view while the Pressable
 *  itself collapsed to zero width — the Trends chart drew its bars zero
 *  points wide for exactly this reason, and every flexed control in a
 *  row was quietly doing the same.
 *
 *  So: the OUTER layout — how this control sits in its parent: flex,
 *  size, margins, position — goes on the Pressable, where the parent can
 *  see it. Everything else — background, border, padding, and how the
 *  CHILDREN are arranged — goes on the Animated.View, which fills the
 *  Pressable and still dims and scales as one surface under the finger. */
const OUTER_KEYS = [
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'width', 'height', 'minWidth', 'minHeight', 'maxWidth', 'maxHeight',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginHorizontal', 'marginVertical', 'marginStart', 'marginEnd',
  'position', 'top', 'bottom', 'left', 'right', 'zIndex',
] as const;

function splitStyle(style: StyleProp<ViewStyle>): { outer: ViewStyle; inner: ViewStyle } {
  const flat = StyleSheet.flatten(style) || {};
  const outer: Record<string, unknown> = {};
  const inner: Record<string, unknown> = { ...flat };
  for (const k of OUTER_KEYS) {
    if (k in inner) { outer[k] = inner[k]; delete inner[k]; }
  }
  return { outer: outer as ViewStyle, inner: inner as ViewStyle };
}

export function Press({ pressScale = 1, pressOpacity = 0.85, style, children, ...rest }: PressProps) {
  const v = useRef(new Animated.Value(0)).current;
  const { outer, inner } = splitStyle(style);
  return (
    <Pressable
      style={outer}
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
          inner,
          /* fills whatever the outer layout won — a flexed Pressable with
             a content-sized inner is the collapse all over again */
          { flexGrow: 1 },
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
