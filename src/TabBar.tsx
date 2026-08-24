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
      {[9, 18, 13].map((h, i) => (
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
  /* A real iOS tab bar is 49pt of content sitting on the safe area, so it
     reads as roughly 83pt tall. A pill that floats has to carry that
     presence in its own height instead of borrowing it from the screen
     edge — 60 puts the glyphs and labels at the size they sit at in a
     docked bar rather than a shrunken copy of one. */
  pill: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 30, height: 60, paddingHorizontal: 5, gap: 2,
  },
  item: {
    minHeight: 50, minWidth: 84, borderRadius: 25,
    alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  itemActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  dayGlyph: { width: 21, height: 21, borderRadius: 6, borderWidth: 1.9 },
  gridGlyph: {
    width: 21, height: 21,
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', alignContent: 'space-between',
  },
  gridCell: { width: 9, height: 9, borderRadius: 2.5 },
  barsGlyph: {
    width: 21, height: 21,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  bar: { width: 5.5, borderRadius: 2 },
  label: { fontSize: 11, fontWeight: '600', color: color.textTertiary, letterSpacing: 0.1 },
  labelActive: { color: color.textPrimary },
});
