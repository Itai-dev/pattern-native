/**
 * The check-in's hero: one square in the pain ramp, with the number in it.
 *
 * ONE solid rounded square, the number inside and nothing else. Its
 * colour follows the brightness ramp continuously under the finger —
 * near-white at 0 sinking to near-black at 10 — while the number in it
 * is the whole number the slider has snapped to. Apple's insight, kept
 * from the first shape: the surface is analogue, the label is discrete.
 *
 * THE NUMBER MOVED INSIDE (21 Oct 2026, the October redesign). It used
 * to sit under the shape at 44pt, which put the colour and the value it
 * stands for in two places; the square is the same object the calendar,
 * the widget and the Watch draw, and those carry their number in the
 * square. The colour still never carries the value alone — the number
 * is in it and the word is under it.
 *
 * INK BY LUMINANCE, NOT BY SCORE. The mockup flips to white above 4 on
 * the blue ramp, but "above 4" is a fact about one palette; on mint or
 * rose the crossover lands elsewhere. inkForBg asks the colour itself
 * (WCAG's 0.179 crossover), so whichever ink is chosen reaches 4.5:1 on
 * any theme's square. It is black or white, never a hue: the ink is not
 * a second pain value.
 *
 * IT HOLDS STILL. The square used to breathe and to swell a little as
 * pain rose. Neither said anything the number does not, a loop on a
 * calm screen is the kind of motion the redesign took out everywhere,
 * and "bigger when it is worse" was a second encoding of the score that
 * nobody had asked for. What moves is the colour, and only under the
 * finger — so Reduce Motion has nothing left here to turn off.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  SharedValue, interpolateColor, useAnimatedStyle,
} from 'react-native-reanimated';
import { formatScore, inkForBg, painColor, painRamp } from './painScale';

const STEPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** corner over side: 50 on the mockup's 172 — Apple's app-icon
 *  proportion, so the hero reads as the same family as the small day
 *  squares rather than as a button */
const CORNER = 50 / 172;
/** the number's size over the square's: 100pt in 172, which leaves a
 *  "10" a clear margin on both sides at the rounded face's width */
const NUMBER = 100 / 172;

export interface PainShapeProps {
  /** continuous 0–10, driven by the slider gesture — the colour */
  progress: SharedValue<number>;
  /** the whole number chosen — the figure and the ink */
  value: number;
  size: number;
}

export default function PainShape({ progress, value, size }: PainShapeProps) {
  const ramp = painRamp();
  const ink = inkForBg(painColor(value));

  const surface = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, STEPS, ramp),
  }));

  const n = Math.round(size * NUMBER);
  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          styles.square,
          { borderRadius: size * CORNER },
          surface,
        ]}
      >
        {/* fixed, not Dynamic Type: it is already the largest text on
            the screen, and a scaled figure would outgrow its square —
            the word underneath is the part that scales */}
        <Text
          allowFontScaling={false}
          style={[styles.number, { fontSize: n, lineHeight: Math.round(n * 1.15), letterSpacing: -0.04 * n, color: ink }]}
        >
          {formatScore(value)}
        </Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  square: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center',
    /* at 10 the surface is nearly black — the hairline keeps it present
       on the black ground without adding a second layer */
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)',
  },
  /* every number in the app is SF Pro Rounded: 'ui-rounded' is the
     system font's rounded design on iOS, so no font file ships */
  number: {
    fontFamily: 'ui-rounded', fontWeight: '700',
    fontVariant: ['tabular-nums'], textAlign: 'center',
  },
});
