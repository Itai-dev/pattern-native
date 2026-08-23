/**
 * The floating bar — Pattern's navigation as State of Mind draws its own:
 * a glass pill hovering over the content. Nothing is docked to the screen
 * edge; the content scrolls underneath and reads through the blur.
 *
 * Three places, and nothing else. The profile used to ride here in a
 * second glass circle, which put a settings button at thumb height beside
 * the three things people actually came to do. It lives in the top right
 * now, where iOS keeps it, and the pill is free to centre.
 *
 * Tapping is INSTANT, on purpose: a tab change happens dozens of times a
 * day, and that frequency earns no animation — a selection haptic is the
 * whole of the feedback. Swiping between pages animates, because there
 * the movement IS the feedback. The glyphs are the app's own square
 * language: one day, a month of them, and a few stacked into a record.
 *
 * The glass is a real iOS material rather than a dark rectangle with a
 * blur behind it. The previous recipe layered rgba(24,24,26,0.55) over
 * the blur, which is most of the way to opaque — the effect was a tinted
 * panel that happened to be slightly soft. systemChromeMaterialDark is
 * the vibrancy material UIKit uses for exactly this, so colour actually
 * comes through from the day squares underneath.
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
      {[8, 16, 12].map((h, i) => (
        <View key={i} style={[styles.bar, { height: h, backgroundColor: c }]} />
      ))}
    </View>
  );
}

/** Left to right, and the same order the pages sit in. Today is where you
 *  act, Pattern is the month you made, Trends is what it adds up to. */
export const TAB_ORDER: Tab[] = ['today', 'map', 'trends'];

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'map', label: 'Pattern' },
  { key: 'trends', label: 'Trends' },
];

function glyphFor(key: Tab, active: boolean) {
  if (key === 'today') return <TodayGlyph active={active} />;
  if (key === 'trends') return <TrendsGlyph active={active} />;
  return <MapGlyph active={active} />;
}

export default function TabBar({ tab, onChange }: TabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 6 }]}
    >
      {/* the pill: Today | Pattern | Trends */}
      <BlurView intensity={80} tint="systemChromeMaterialDark" style={[styles.glass, styles.pill]}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10,
  },
  /* the material does the work. The only paint on top is a whisper of
     white to lift it off a very dark screen, and the hairline that
     catches light along the top edge — the same two things a real iOS
     bar has. Anything heavier and the blur is decoration. */
  glass: {
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  /* iOS proportions: a 49pt bar, a 25pt glyph box, a 10pt label. The pill
     adds its own padding, so 52 lands the content where a real tab bar
     puts it. */
  pill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 26, height: 52, paddingHorizontal: 4, gap: 0,
  },
  item: {
    minHeight: 44, minWidth: 78, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  itemActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  dayGlyph: { width: 19, height: 19, borderRadius: 5.5, borderWidth: 1.8 },
  gridGlyph: {
    width: 19, height: 19,
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignContent: 'space-between',
  },
  gridCell: { width: 8, height: 8, borderRadius: 2.5 },
  barsGlyph: {
    width: 19, height: 19,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  bar: { width: 5, borderRadius: 2 },
  label: { fontSize: 10, fontWeight: '600', color: color.textTertiary, letterSpacing: 0.1 },
  labelActive: { color: color.textPrimary },
});
