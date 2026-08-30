/**
 * The floating bar — Pattern's navigation as iOS 26 draws its own: a
 * Liquid Glass pill hovering over the content. Nothing is docked to the
 * screen edge; the content scrolls underneath and reads through the
 * material.
 *
 * REAL GLASS WHERE IT EXISTS. expo-glass-effect exposes the system's
 * Liquid Glass — the same material the platform's own bars refract
 * through. On anything older than iOS 26 the pill falls back to the
 * chrome blur it had before: one layout, two materials, no other branch.
 *
 * GLYPHS ARE DRAWN, NOT FILLED, UNTIL CHOSEN. The iOS grammar: an
 * outline is a place you could go, a filled shape is where you are. The
 * three glyphs stay in the app's square language — one day, a month of
 * them, a few stacked into a record — and each has an outline form and a
 * filled form rather than a colour swap.
 *
 * Tapping is INSTANT, on purpose: a tab change happens dozens of times a
 * day, and that frequency earns no animation — a selection haptic is the
 * whole of the feedback. Swiping between pages animates, because there
 * the movement IS the feedback.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import { color } from './theme';

export type Tab = 'today' | 'trends';

/** Left to right, and the same order the pages sit in. TWO tabs: Today
 *  is where you act, and Trends is the record — the calendar of every day
 *  and what those days add up to, which used to be split across two tabs
 *  that each held half the answer. */
export const TAB_ORDER: Tab[] = ['today', 'trends'];

export interface TabBarProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
}

/* Guarded, and the guard is load-bearing. On iOS this calls
   requireNativeModule, which THROWS when the binary predates the native
   module — and OTA updates share a runtime with builds 15 and 18, which
   do. Unguarded, this line crashes every phone still on those builds at
   launch. Caught, they fall back to the blur bar they already have, and
   the glass simply arrives with the next install. */
const LIQUID = (() => {
  try { return isLiquidGlassAvailable(); } catch { return false; }
})();

/** one rounded square — the day. Filled when you are here. */
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

/** the same square, three of them, at the heights of a record */
function TrendsGlyph({ active }: { active: boolean }) {
  return (
    <View style={styles.barsGlyph}>
      {[9, 18, 13].map((h, i) => (
        <View
          key={i}
          style={[
            styles.bar,
            { height: h },
            active
              ? { backgroundColor: color.textPrimary, borderColor: color.textPrimary }
              : { borderColor: color.textTertiary },
          ]}
        />
      ))}
    </View>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'trends', label: 'Record' },
];

function glyphFor(key: Tab, active: boolean) {
  return key === 'today' ? <TodayGlyph active={active} /> : <TrendsGlyph active={active} />;
}

export default function TabBar({ tab, onChange }: TabBarProps) {
  const insets = useSafeAreaInsets();

  const items = TABS.map((t) => {
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
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom, 12) + 6 }]}
    >
      {LIQUID ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme="dark"
          style={[styles.pill, styles.liquid]}
        >
          {items}
        </GlassView>
      ) : (
        <BlurView
          intensity={80}
          tint="systemChromeMaterialDark"
          style={[styles.pill, styles.blurFallback]}
        >
          {items}
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
  },
  /* A real iOS tab bar is 49pt of content sitting on the safe area, so it
     reads as roughly 83pt tall. A pill that floats has to carry that
     presence in its own height instead of borrowing it from the screen
     edge.

     TWO destinations, so the pill can spend the width three were
     sharing: taller, wider targets and type you can read without
     leaning in. Three cramped 84pt items became two generous ones —
     the same bar, no longer rationing itself. */
  pill: {
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    borderRadius: 33, borderCurve: 'continuous', height: 66, paddingHorizontal: 6, gap: 4,
  },
  /* the system material carries itself — the only paint on top is the
     hairline that catches light along the edge */
  liquid: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  /* pre-26 fallback: chrome material with a whisper of lift, same shape */
  blurFallback: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  item: {
    minHeight: 54, minWidth: 132, borderRadius: 27, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: 16, paddingVertical: 6,
  },
  itemActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  dayGlyph: { width: 23, height: 23, borderRadius: 7, borderWidth: 2 },
  /* outline until chosen: the border draws the shape either way, and the
     fill arrives only with selection — a colour swap alone never says it */
  barsGlyph: {
    width: 23, height: 23,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  bar: { width: 6, borderRadius: 2, borderWidth: 1.7 },
  label: { fontSize: 12, fontWeight: '600', color: color.textTertiary, letterSpacing: 0.1 },
  labelActive: { color: color.textPrimary },
});
