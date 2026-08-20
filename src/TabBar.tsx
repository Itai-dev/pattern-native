/**
 * The bottom tab bar — two places, named for what they hold: Today (act)
 * and Map (reflect). One tab away from each other, exactly the structure
 * the PWA settled on.
 *
 * Switching is INSTANT, on purpose: a tab change happens dozens of times
 * a day, and that frequency earns no animation — a selection haptic is
 * the whole of the feedback. The glyphs are the app's own square
 * language: one day, and a month of them.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import { color } from './theme';

export type Tab = 'today' | 'map';

export interface TabBarProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
}

/** one rounded square — the day */
function TodayGlyph({ active }: { active: boolean }) {
  return (
    <View
      style={[
        styles.dayGlyph,
        active
          ? { backgroundColor: color.textPrimary, borderColor: color.textPrimary }
          : { borderColor: color.textTertiary },
      ]}
    />
  );
}

/** a small grid of them — the month */
function MapGlyph({ active }: { active: boolean }) {
  return (
    <View style={styles.gridGlyph}>
      {[0, 1, 2, 3].map((i) => (
        <View
          key={i}
          style={[
            styles.gridCell,
            { backgroundColor: active ? color.textPrimary : color.textTertiary },
          ]}
        />
      ))}
    </View>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'map', label: 'Map' },
];

export default function TabBar({ tab, onChange }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {TABS.map((t) => {
        const active = tab === t.key;
        return (
          <Press
            key={t.key}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync().catch(() => {});
              onChange(t.key);
            }}
            pressOpacity={0.7}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={t.label}
          >
            {t.key === 'today' ? <TodayGlyph active={active} /> : <MapGlyph active={active} />}
            <Text
              allowFontScaling={false}
              style={[styles.label, active && styles.labelActive]}
            >
              {t.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: color.bgRoot,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.borderDivider,
    paddingTop: 6,
  },
  item: {
    flex: 1, minHeight: 44,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  dayGlyph: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5 },
  gridGlyph: {
    width: 18, height: 18,
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignContent: 'space-between',
  },
  gridCell: { width: 8, height: 8, borderRadius: 2.5 },
  label: { fontSize: 10, fontWeight: '500', color: color.textTertiary },
  labelActive: { color: color.textPrimary, fontWeight: '600' },
});
