/**
 * A place, one level down — the app's one implementation of a push.
 *
 * THE RULE IT EXISTS TO ENFORCE: push for a place, sheet for a task,
 * full screen for a flow. A day, a colour theme, the page about what the
 * app is — those are places you go and come back from, and iOS says so by
 * sliding them in from the right over what you were reading, with a back
 * chevron. A task — record an event, choose a focus, open the profile —
 * is a sheet you finish and dismiss with Done.
 *
 * Before this, the app used both grammars at the same depth: the day
 * screen pushed and the day detail was a sheet, for the same date. And
 * the profile's own sub-pages were sheets presented on top of a sheet,
 * with a comment in App.tsx explaining that a SIBLING sheet would not
 * open at all while the profile was up. That comment was the code saying
 * it wanted a stack and had been given a modal tree.
 *
 * It is a layer rather than a real navigator because a real navigator is
 * a native dependency, and a native dependency is a TestFlight build —
 * which cannot be done from a phone, which is the whole constraint this
 * app is built around. So: one hand-rolled push, written once, used
 * everywhere, rather than the same animation re-derived per screen.
 *
 * DISMISSAL IS ANIMATED, WHICH MEANS THE PARENT MUST NOT UNMOUNT IT ON
 * THE TAP. The child is handed a `dismiss` function; the layer plays the
 * exit and calls `onClosed` when the last frame is done, and only then
 * should the parent drop it.
 */
import React, { useCallback, useEffect } from 'react';
import { StyleSheet, ViewStyle, useWindowDimensions } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from './motion';
import { color } from './theme';

/** the house curve — the same ease-out every press and transition uses */
const EASE = Easing.bezier(0.23, 1, 0.32, 1);

/* In, then out. Arriving is the slower of the two on purpose: a push
   introduces something and wants to be followed, while a pop returns you
   somewhere you have already read and should get out of the way. */
const IN_MS = 340;
const OUT_MS = 260;

export interface PushLayerProps {
  /** called once the exit animation has finished — drop the layer here,
   *  never on the tap that started it */
  onClosed: () => void;
  /** The layer is positioned absolutely, and Yoga measures an absolute
   *  child's offsets from its parent's BORDER box — a safe-area padding
   *  on the parent is not in it, so top: 0 is the top of the phone. A
   *  layer over the app's own chrome has to re-apply the inset itself; a
   *  layer inside a sheet must not, because a sheet has no notch above
   *  it. */
  safeTop?: boolean;
  /** black over the app, sheet-grey inside a sheet — an opaque ground
   *  either way, or what it covers shows through mid-slide */
  sheet?: boolean;
  style?: ViewStyle;
  children: (dismiss: () => void) => React.ReactNode;
}

export default function PushLayer({
  onClosed, safeTop, sheet, style, children,
}: PushLayerProps) {
  const insets = useSafeAreaInsets();
  const rm = useReduceMotion();
  /* the real width, not a large-enough number: the distance travelled is
     what sets the apparent speed, and a layer that starts twice as far
     away arrives twice as fast for the same duration */
  const { width } = useWindowDimensions();

  /** 1 = fully off to the right, 0 = home */
  const off = useSharedValue(1);
  useEffect(() => {
    off.value = withTiming(0, { duration: rm ? 0 : IN_MS, easing: EASE });
  }, []);

  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: off.value * width }],
  }));

  const dismiss = useCallback(() => {
    off.value = withTiming(1, { duration: rm ? 0 : OUT_MS, easing: EASE }, (done) => {
      if (done) runOnJS(onClosed)();
    });
  }, [rm, onClosed]);

  return (
    <Animated.View
      style={[
        styles.layer,
        { backgroundColor: sheet ? color.bgSheet : color.bgRoot },
        safeTop ? { paddingTop: insets.top } : null,
        style,
        layerStyle,
      ]}
    >
      {children(dismiss)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
});
