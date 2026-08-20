/**
 * One day as a rounded square — the app's whole visual language in a
 * component. A logged day is ONE solid colour: its daily average on the
 * brightness ramp, blue-black at 0 rising to icy near-white at 10. The
 * number of check-ins behind the average travels as text and dots, never
 * as extra rings — a single clean surface, no bands, no stripes.
 *
 * The map draws these at cell size, Today draws one at 116 — same
 * component, so the big square is literally the small one magnified.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Entry, dailyAverage } from './model';
import { color } from './theme';
import { painColor } from './painScale';

export interface DaySquareProps {
  entry: Entry | null;
  size: number;
  radius: number;
  /** an unlogged day shows an outline; today's also shows a plus */
  plus?: boolean;
  today?: boolean;
  /** paint this score instead of deriving the entry's daily average */
  value?: number | null;
  children?: React.ReactNode;
}

export default function DaySquare({
  entry, size, radius, plus, today, value, children,
}: DaySquareProps) {
  const score = value != null ? value : dailyAverage(entry);
  if (score == null) {
    return (
      <View
        style={[
          { width: size, height: size, borderRadius: radius, borderWidth: 1 },
          styles.centre,
          { borderColor: today ? color.textTertiary : color.borderControl },
        ]}
      >
        {children}
        {plus && !children && (
          <Text style={{ fontSize: size * 0.26, fontWeight: '300', color: color.textTertiary }}>+</Text>
        )}
      </View>
    );
  }
  return (
    <View style={[
      { width: size, height: size, borderRadius: radius, backgroundColor: painColor(score) },
      /* low scores are nearly black — the hairline keeps a logged day
         visible against the black ground without reading as a band */
      styles.defined,
      styles.centre,
    ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
  defined: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
});
