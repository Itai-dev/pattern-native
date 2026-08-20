/**
 * One day as a rounded square — the app's whole visual language in a
 * component. A day with a single log is a flat colour; several logs blend
 * into a gradient, earliest at the rim and latest at the core, drawn as
 * nested rounded squares since native has no inset shadows.
 *
 * The map draws these at cell size, Today draws one at 128 — same component,
 * so the big square is literally the small one magnified.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Entry, dayLayers } from './model';
import { color, theme } from './theme';
import { painColor } from './painScale';

export interface DaySquareProps {
  entry: Entry | null;
  size: number;
  radius: number;
  /** an unlogged day shows an outline; today's also shows a plus */
  plus?: boolean;
  today?: boolean;
  /** paint a single score instead of the day's moments — used wherever the
   *  surface represents the DAILY AVERAGE rather than each check-in */
  value?: number | null;
  children?: React.ReactNode;
}

export default function DaySquare({
  entry, size, radius, plus, today, value, children,
}: DaySquareProps) {
  if (value != null) {
    return (
      <View style={{
        width: size, height: size, borderRadius: radius,
        backgroundColor: painColor(value),
        alignItems: 'center', justifyContent: 'center',
      }}>
        {children}
      </View>
    );
  }
  if (!entry) {
    return (
      <View
        style={[
          { width: size, height: size, borderRadius: radius, borderWidth: 1 },
          styles.centre,
          { borderColor: today ? color.textTertiary : color.borderControl },
        ]}
      >
        {children}
        {plus && !children && <Text style={{ fontSize: size * 0.26, fontWeight: '300', color: color.textTertiary }}>+</Text>}
      </View>
    );
  }
  const layers = dayLayers(entry, size / 2, theme.ramp);
  return (
    <View style={{
      width: size, height: size, borderRadius: radius,
      backgroundColor: layers[0].color, overflow: 'hidden',
    }}>
      {layers.slice(1).map((l, i) => (
        <View
          key={i}
          style={{
            position: 'absolute',
            left: l.inset, right: l.inset, top: l.inset, bottom: l.inset,
            borderRadius: Math.max(2, radius - l.inset),
            backgroundColor: l.color,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  centre: { alignItems: 'center', justifyContent: 'center' },
});
