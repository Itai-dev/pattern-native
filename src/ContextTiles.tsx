/**
 * What went with the number: up to three neutral tiles from Health —
 * slept, steps, workout — under the chart on the day page. One
 * component, so any surface that shows them later cannot drift from what
 * a tile is allowed to be.
 *
 * Nothing when Health has nothing: never a zero, never an empty ring.
 * White numbers on a neutral surface; the ramp means pain and none of
 * these is a pain value. The remark under a value compares the factor
 * to the person's own usual and never touches the pain beside it.
 *
 * IN THE CARD GRAMMAR (21 Oct 2026, the October redesign): the #1C1C1E
 * surface at 16pt corners with no hairline — on black the surface is its
 * own edge — a grey label on top and the value in the rounded face, as
 * every value in SummaryCard is. A tile is a small card, not a square:
 * squares are pain.
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ContextTile } from './todayTiles';
import { Num, ROUNDED, summary } from './SummaryCard';
import { font } from './theme';

export default function ContextTiles({ tiles, style }: {
  tiles: ContextTile[];
  /** the caller's margins — the tiles sit in a different gutter on each
   *  surface, and the row itself has no opinion about where it lives */
  style?: StyleProp<ViewStyle>;
}) {
  if (!tiles.length) return null;
  return (
    <View style={[styles.tiles, style]} accessible accessibilityRole="summary"
      accessibilityLabel={'From Apple Health: ' + tiles.map((x) => x.label + ' ' + x.value + (x.sub ? ', ' + x.sub : '')).join('. ')}>
      {tiles.map((x) => (
        <View key={x.key} style={styles.tile}>
          <Text style={styles.tileK} allowFontScaling maxFontSizeMultiplier={1.3}>{x.label}</Text>
          <Text style={styles.tileV} allowFontScaling maxFontSizeMultiplier={1.3} numberOfLines={1} adjustsFontSizeToFit>{x.value}</Text>
          {!!x.sub && (
            <Text style={styles.tileS} allowFontScaling maxFontSizeMultiplier={1.3} numberOfLines={2}>
              <Num>{x.sub}</Num>
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  /* neutral surfaces, white numbers, no fills */
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1, borderRadius: summary.radius, borderCurve: 'continuous',
    paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12,
    backgroundColor: summary.surface,
  },
  tileK: { color: summary.secondary, fontSize: font.footnote, fontWeight: '600' },
  /* the whole value rounded, units with it: "7h 40m" and "6,214" are
     figures, and half a figure in each face reads as two things */
  tileV: {
    fontFamily: ROUNDED, color: summary.text, fontSize: 22, fontWeight: '700',
    letterSpacing: -0.3, marginTop: 2, fontVariant: ['tabular-nums'],
  },
  tileS: { color: summary.tertiary, fontSize: 12, lineHeight: 15, marginTop: 2 },
});
