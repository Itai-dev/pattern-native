/**
 * What went with the number: up to three neutral tiles from Health —
 * slept, steps, workout — under a check-in on the layered Today and
 * under the chart on the layered day page. One component, so the two
 * surfaces cannot drift apart in what a tile is allowed to be.
 *
 * Nothing when Health has nothing: never a zero, never an empty ring.
 * White numbers on a neutral surface; the ramp means pain and none of
 * these is a pain value. The remark under a value compares the factor
 * to the person's own usual and never touches the pain beside it.
 */
import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { ContextTile } from './todayTiles';
import { color, font } from './theme';

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
            <Text style={styles.tileS} allowFontScaling maxFontSizeMultiplier={1.3} numberOfLines={2}>{x.sub}</Text>
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
    flex: 1, borderRadius: 14, borderCurve: 'continuous', padding: 10,
    backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
  },
  tileK: { color: color.textSecondary, fontSize: font.footnote },
  tileV: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.3, marginTop: 2, fontVariant: ['tabular-nums'],
  },
  tileS: { color: color.textTertiary, fontSize: 11, lineHeight: 14, marginTop: 1 },
});
