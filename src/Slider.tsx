/**
 * The 0–10 slider, built on PanResponder rather than a native slider package.
 * Two reasons: the design is bespoke anyway (fat white thumb, thin track,
 * value snapping to whole numbers), and a JS-only control ships over the air —
 * adding a native module would mean a fresh App Store build for every tweak.
 *
 * Dragging is absolute, not relative: the value follows the finger's position
 * along the track, so a tap anywhere jumps there, exactly like the web version.
 */
import React, { useCallback, useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { color, size } from './theme';

const THUMB = size.sliderThumb;

export interface SliderProps {
  value: number;
  onChange: (v: number) => void;
  max?: number;
}

export default function Slider({ value, onChange, max = 10 }: SliderProps) {
  const [width, setWidth] = useState(0);
  /* the responder closes over these refs, not over props — it is created once,
     so reading state through refs is what keeps it current */
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  const changeRef = useRef(onChange);
  widthRef.current = width;
  valueRef.current = value;
  changeRef.current = onChange;

  const setFromX = useCallback((x: number) => {
    const w = widthRef.current;
    if (!w) return;
    const usable = w - THUMB;
    const t = Math.max(0, Math.min(1, (x - THUMB / 2) / usable));
    const next = Math.round(t * max);
    if (next !== valueRef.current) {
      // a tick per whole number: the value change is felt, not just seen
      Haptics.selectionAsync().catch(() => {});
      changeRef.current(next);
    }
  }, [max]);

  const responder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e, g) => setFromX(g.moveX - originRef.current),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  /* where the track starts on screen — moveX is a page coordinate, so the
     drag needs the offset to become a position within the track */
  const originRef = useRef(0);
  const trackRef = useRef<View>(null);

  const fill = width ? ((width - THUMB) * (value / max)) : 0;

  return (
    <View
      ref={trackRef}
      {...responder.panHandlers}
      onLayout={(e) => {
        setWidth(e.nativeEvent.layout.width);
        trackRef.current?.measureInWindow((x) => { originRef.current = x; });
      }}
      style={styles.hit}
    >
      <View style={styles.track} />
      <View style={[styles.thumb, { transform: [{ translateX: fill }] }]} />
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
