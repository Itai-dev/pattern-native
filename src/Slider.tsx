/**
 * The 0–10 slider, built on PanResponder rather than a native slider package —
 * the design is bespoke anyway, and a JS-only control ships over the air.
 *
 * The thumb tracks the finger 1:1 for the whole gesture; only the VALUE
 * snaps to whole numbers (a haptic tick per step). On release the thumb
 * settles to its stop with a short critically-damped spring that inherits
 * the finger's velocity, so there is no seam between dragging and animating.
 * The Animated.Value carries the position without re-rendering React on
 * every move event.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { color, size } from './theme';
import { reduceMotion } from './motion';

const THUMB = size.sliderThumb;

export interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}

export default function Slider({ value, onChange, max = 10 }: SliderProps) {
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  /* the responder closes over refs, not props — it is created once */
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  const changeRef = useRef(onChange);
  const draggingRef = useRef(false);
  const originRef = useRef(0);
  widthRef.current = width;
  valueRef.current = value;
  changeRef.current = onChange;

  const posOf = useCallback((v: number) => {
    const usable = Math.max(1, widthRef.current - THUMB);
    return (usable * v) / max;
  }, [max]);

  /* an external value change (the capacity step arriving) repositions the
     thumb — but never while a finger owns it */
  useEffect(() => {
    if (!draggingRef.current && width) x.setValue(posOf(value));
  }, [value, width, posOf, x]);

  const track = useCallback((fingerX: number) => {
    const usable = Math.max(1, widthRef.current - THUMB);
    const clamped = Math.max(0, Math.min(usable, fingerX - THUMB / 2));
    x.setValue(clamped);                       // 1:1, no React re-render
    const next = Math.round((clamped / usable) * max);
    if (next !== valueRef.current) {
      // a tick per whole number: the value change is felt, not just seen
      Haptics.selectionAsync().catch(() => {});
      changeRef.current(next);
    }
  }, [max, x]);

  const settle = useCallback((vxPerMs: number) => {
    draggingRef.current = false;
    if (reduceMotion) { x.setValue(posOf(valueRef.current)); return; }
    Animated.spring(x, {
      toValue: posOf(valueRef.current),
      velocity: vxPerMs * 1000,               // the finger's speed, in units/s
      stiffness: 400, damping: 40, mass: 1,   // critically damped — settle, no bounce
      useNativeDriver: true,
    }).start();
  }, [posOf, x]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => { draggingRef.current = true; track(e.nativeEvent.locationX); },
      onPanResponderMove: (_e, g) => track(g.moveX - originRef.current),
      onPanResponderRelease: (_e, g) => settle(g.vx),
      onPanResponderTerminate: (_e, g) => settle(g.vx),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const trackRef = useRef<View>(null);

  return (
    <View
      ref={trackRef}
      {...responder.panHandlers}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        trackRef.current?.measureInWindow((wx) => { originRef.current = wx; });
      }}
      style={styles.hit}
    >
      <View style={styles.track} />
      <Animated.View style={[styles.thumb, { transform: [{ translateX: x }] }]} />
    </View>
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
