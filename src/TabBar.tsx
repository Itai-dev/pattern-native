/**
 * The floating bar — Pattern's navigation as State of Mind draws its own:
 * a glass pill hovering over the content, with the profile as a second,
 * smaller glass circle beside it. Nothing is docked to the screen edge;
 * the content scrolls underneath and reads through the blur.
 *
 * Switching is INSTANT, on purpose: a tab change happens dozens of times
 * a day, and that frequency earns no animation — a selection haptic is
 * the whole of the feedback. The glyphs are the app's own square
 * language: one day, a few of them stacked into a record, and a month.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import { color } from './theme';

export type Tab = 'today' | 'trends' | 'map';

export interface TabBarProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
  onProfile: () => void;
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

/** the same square, three of them, at the heights of a record */
function TrendsGlyph({ active }: { active: boolean }) {
  const c = active ? color.textPrimary : color.textTertiary;
  return (
    <View style={styles.barsGlyph}>
      {[7, 13, 10].map((h, i) => (
        <View key={i} style={[styles.bar, { height: h, backgroundColor: c }]} />
      ))}
    </View>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'trends', label: 'Trends' },
  { key: 'map', label: 'Map' },
];

function glyphFor(key: Tab, active: boolean) {
  if (key === 'today') return <TodayGlyph active={active} />;
  if (key === 'trends') return <TrendsGlyph active={active} />;
  return <MapGlyph active={active} />;
}

export default function TabBar({ tab, onChange, onProfile }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 6 }]}
    >
      {/* the pill: Today | Trends | Map */}
      <BlurView intensity={60} tint="dark" style={[styles.glass, styles.pill]}>
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
              style={[styles.item, active && styles.itemActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.label}
            >
              {glyphFor(t.key, active)}
              <Text
                allowFontScaling={false}
                style={[styles.label, active && styles.labelActive]}
              >
                {t.label}
              </Text>
            </Press>
          );
        })}
      </BlurView>

      {/* the person, in their own circle of glass */}
      <BlurView intensity={60} tint="dark" style={[styles.glass, styles.circle]}>
        <Press
          onPress={onProfile}
          pressOpacity={0.7}
          style={styles.circleHit}
          accessibilityRole="button"
          accessibilityLabel="Profile and settings"
        >
          <View style={styles.personHead} />
          <View style={styles.personBody} />
        </Press>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
  },
  /* one glass recipe for both elements — the blur does the work, the tint
     keeps it legible over a bright day-square, the hairline catches light */
  glass: {
    overflow: 'hidden',
    backgroundColor: 'rgba(24,24,26,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  pill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 27, height: 54, paddingHorizontal: 5, gap: 1,
  },
  /* three of these plus the profile circle have to clear a 375pt screen,
     so the glyph and the word stack instead of sitting side by side —
     the touch target stays well over 44pt in both directions */
  item: {
    minHeight: 44, minWidth: 62, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  itemActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  circle: { width: 54, height: 54, borderRadius: 27 },
  circleHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dayGlyph: { width: 16, height: 16, borderRadius: 4.5, borderWidth: 1.5 },
  gridGlyph: {
    width: 16, height: 16,
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignContent: 'space-between',
  },
  gridCell: { width: 7, height: 7, borderRadius: 2 },
  barsGlyph: {
    width: 16, height: 16,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  bar: { width: 4, borderRadius: 1.5 },
  label: { fontSize: 11, fontWeight: '600', color: color.textTertiary },
  labelActive: { color: color.textPrimary },
  personHead: {
    width: 8, height: 8, borderRadius: 4, borderWidth: 1.4,
    borderColor: color.textSecondary, marginBottom: 1,
  },
  personBody: {
    width: 16, height: 8, borderTopLeftRadius: 8, borderTopRightRadius: 8,
    borderWidth: 1.4, borderBottomWidth: 0, borderColor: color.textSecondary,
  },
});
