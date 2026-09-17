/**
 * The 0–10 scale as eleven day squares — a slider drawn in the app's own
 * language, behind a switch in Profile while it is compared against the
 * thumb-and-track slider it might replace.
 *
 * WHY SQUARES. The day square is the calendar cell, the widget, the Watch
 * face and the icon. Choosing a pain level by choosing the square the day
 * will wear teaches the ramp without a legend: what you pick here is
 * literally what the month will show. A gauge or a wheel would be a second
 * metaphor for the same value; this is the first one, used one more time.
 *
 * WHY IT IS STILL A SLIDER UNDERNEATH. Eleven squares across a phone are
 * about thirty points each, under the 44 a hand that hurts needs. So the
 * whole row is the track: the finger lands anywhere and drags, exactly as
 * on the Slider, and the square under it grows and takes the white frame.
 * The squares are the visual; the row is the target. A tap on a square
 * works too, because a tap is a drag of zero length. Same UI-thread
 * gesture as Slider.tsx, for the same reason — the frame must never be
 * drawing a position the finger has already left.
 *
 * WHAT IT REFUSES. No square is framed until a finger has landed: the
 * scale has no default and zero is a real answer, so the app forms no
 * opinion on your behalf. The frame is white, because white is a button's
 * colour and not a pain's. Under Reduce Motion nothing scales or springs;
 * the frame simply moves.
 *
 * All eleven are always on screen, so both ends are visible — "no pain"
 * and "most intense" are anchors, and a wheel that hid them would ask
 * someone to place themselves on a scale they cannot see.
 */
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  SharedValue, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue,
  withSpring, withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useReduceMotion } from './motion';
import { PAIN_MAX, PAIN_MIN, painRamp } from './painScale';
import { color } from './theme';

/** the Profile switch. Off by default: the slider is what ships until
 *  the comparison says otherwise. */
export const PREF_SQUARE_PICKER = 'checkin.picker';

/** the gap between squares. The squares themselves size to the row. */
const GAP = 5;
/** how much the chosen square grows — enough to read as "this one",
 *  not enough to cover its neighbours' colour */
const GROW = 1.28;
const FRAME = 2;

export interface SquarePickerProps {
  /** the current whole-number value. Always a number here (the check-in
   *  keeps one from the start); whether it is CHOSEN is `chosen`. */
  value: number;
  /** false until a finger has landed: no frame, no grown square */
  chosen: boolean;
  onChange: (v: number) => void;
  /** optional continuous 0–10, driven on the UI thread — the shape above
   *  follows the finger while the value itself snaps */
  progress?: SharedValue<number>;
  accessibilityLabel?: string;
  accessibilityValue?: { min?: number; max?: number; now?: number; text?: string };
}

export default function SquarePicker({
  value, chosen, onChange, progress, accessibilityLabel, accessibilityValue,
}: SquarePickerProps) {
  const reduce = useReduceMotion();
  const width = useSharedValue(0);
  /* the continuous position along the row, 0..PAIN_MAX, on the UI thread */
  const at = useSharedValue(value);
  const dragging = useSharedValue(false);
  const lastStep = useSharedValue(chosen ? value : -1);
  const ramp = painRamp();

  const emit = useCallback((v: number) => {
    Haptics.selectionAsync().catch(() => {});
    onChange(v);
  }, [onChange]);

  /* when the finger is up the position follows the value, so an
     external change (an edit, a reset) still moves the frame */
  useDerivedValue(() => {
    if (!dragging.value) {
      at.value = reduce
        ? value
        : withSpring(value, { damping: 40, stiffness: 400, mass: 1 });
    }
  }, [value, reduce]);

  /* x → 0..10 across the row. Each square owns an equal slice of the
     width, so the mapping is the same whether the finger is on a square
     or in a gap: the nearest slice wins. */
  const toScale = (x: number, w: number): number => {
    'worklet';
    const usable = Math.max(1, w);
    return Math.max(PAIN_MIN, Math.min(PAIN_MAX, (x / usable) * (PAIN_MAX + 1) - 0.5));
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      'worklet';
      dragging.value = true;
      const p = toScale(e.x, width.value);
      at.value = p;
      if (progress) progress.value = p;
      const step = Math.round(p);
      if (step !== lastStep.value) { lastStep.value = step; runOnJS(emit)(step); }
    })
    .onUpdate((e) => {
      'worklet';
      const p = toScale(e.x, width.value);
      at.value = p;
      if (progress) progress.value = p;
      const step = Math.round(p);
      if (step !== lastStep.value) { lastStep.value = step; runOnJS(emit)(step); }
    })
    .onFinalize(() => {
      'worklet';
      dragging.value = false;
      /* settle onto the chosen square; the shape above settles with it */
      at.value = reduce
        ? lastStep.value
        : withSpring(lastStep.value, { damping: 40, stiffness: 400, mass: 1 });
      if (progress) progress.value = withTiming(lastStep.value, { duration: 160 });
    });

  return (
    <GestureDetector gesture={pan}>
      <View
        onLayout={(e) => { width.value = e.nativeEvent.layout.width; }}
        style={styles.row}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={accessibilityValue}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => {
          const cur = chosen ? value : -1;
          const next = e.nativeEvent.actionName === 'increment'
            ? Math.min(PAIN_MAX, cur + 1)
            : Math.max(PAIN_MIN, cur < 0 ? 0 : cur - 1);
          if (next !== value || !chosen) onChange(next);
        }}
      >
        {ramp.map((c, i) => (
          <Square key={i} index={i} colour={c} at={at} chosen={chosen} reduce={reduce} />
        ))}
      </View>
    </GestureDetector>
  );
}

/** one square: its ramp colour always; grown and framed as the position
 *  approaches it, so during a drag the emphasis slides rather than jumps */
function Square({ index, colour, at, chosen, reduce }: {
  index: number; colour: string; at: SharedValue<number>; chosen: boolean; reduce: boolean;
}) {
  const style = useAnimatedStyle(() => {
    if (!chosen) return { transform: [{ scale: 1 }], borderColor: 'transparent' };
    /* 1 on the square, falling to 0 one square away */
    const near = Math.max(0, 1 - Math.abs(at.value - index));
    const scale = reduce ? (near > 0.5 ? GROW : 1) : 1 + (GROW - 1) * near;
    return {
      transform: [{ scale }],
      borderColor: near > 0.5 ? color.textPrimary : 'transparent',
    };
  }, [chosen, reduce]);
  return (
    <Animated.View
      style={[styles.sq, { backgroundColor: colour }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  /* the row is the hit area: 52 tall so the target is generous even
     where a square is thirty wide, and the grown square has room */
  row: {
    height: 52, flexDirection: 'row', alignItems: 'center', gap: GAP,
    paddingHorizontal: 2,
  },
  sq: {
    flex: 1, aspectRatio: 1, borderRadius: 8, borderCurve: 'continuous',
    borderWidth: FRAME, borderColor: 'transparent',
  },
});
