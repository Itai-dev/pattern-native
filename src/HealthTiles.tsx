/**
 * A day's Apple Health readings, as tiles.
 *
 * Apple Health organized the one way it is not in Apple's own app: by
 * the day it belongs to, beside the pain it is context for.
 *
 * Tiles in Pattern's own grammar — outline glyphs in line weight,
 * neutral ink, no borrowed Apple branding. COLOUR HERE MEANS PAIN OR IT
 * IS NOT A COLOUR, and a step count is not a pain value, so every figure
 * on this block is white. Missing categories are missing tiles, never
 * zeros. The caveat lives inside the block it qualifies, because a
 * sentence about what these numbers do not mean is worth nothing on a
 * different screen from the numbers.
 *
 * One component, two callers: today's readings on Today, and any day's
 * on the day screen. They were the same markup twice, which is how two
 * screens end up disagreeing about what a tile is.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as db from './db';
import { healthDayTiles } from './health/context';
import { color, font } from './theme';

/** whether this day has anything from Health to show. Callers need it
 *  BEFORE rendering, because the surface a caller wraps these tiles in —
 *  a card, a divider, a heading — must not be drawn around nothing, and
 *  a component returning null cannot stop its own wrapper. */
export function hasHealthTiles(dateIso: string): boolean {
  return healthDayTiles(db.getHealthDay(dateIso), db.getHealthDays()).length > 0;
}

export interface HealthTilesProps {
  dateIso: string;
  /** the section heading; null draws the tiles bare */
  title?: string | null;
}

export default function HealthTiles({ dateIso, title = 'From Apple Health' }: HealthTilesProps) {
  const tiles = healthDayTiles(db.getHealthDay(dateIso), db.getHealthDays());
  if (!tiles.length) return null;
  return (
    <View>
      {!!title && <Text style={styles.title}>{title}</Text>}
      <View style={styles.grid}>
        {tiles.map((t) => (
          <View
            key={t.key}
            style={styles.tile}
            accessible
            accessibilityLabel={t.label + ', ' + t.value + (t.sub ? ', ' + t.sub : '')}
          >
            <View style={styles.head}>
              <Ionicons
                name={t.icon as keyof typeof Ionicons.glyphMap}
                size={16}
                color={color.textSecondary}
              />
              <Text
                style={styles.label} numberOfLines={1}
                allowFontScaling maxFontSizeMultiplier={1.2}
              >
                {t.label}
              </Text>
            </View>
            <Text
              style={styles.value} numberOfLines={1} adjustsFontSizeToFit
              allowFontScaling maxFontSizeMultiplier={1.3}
            >
              {t.value}
            </Text>
            {!!t.sub && (
              <Text
                style={styles.sub} numberOfLines={2}
                allowFontScaling maxFontSizeMultiplier={1.3}
              >
                {t.sub}
              </Text>
            )}
          </View>
        ))}
      </View>
      <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
        Read from Health for context beside what you recorded. Sitting next to
        each other is not a claim that one caused the other.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    marginBottom: 4,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  tile: {
    flexGrow: 1, flexBasis: '30%', borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: color.bgSurface, padding: 10, gap: 3,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  label: { flex: 1, color: color.textSecondary, fontSize: font.footnote },
  value: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sub: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 16 },
  fine: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: 10,
  },
});
