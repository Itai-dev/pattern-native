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
 *  is where you act, and Patterns is what the record is
 *  beginning to show — findings first, description folded beneath. */
export const TAB_ORDER: Tab[] = ['today', 'trends'];

export interface TabBarProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
  /** the check-in, from the one place a thumb always reaches. The Log
   *  pill top-right stays for now; this is the same door, lower. */
  onLog?: () => void;
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
  /* Patterns, not Record: "here is everything you entered" is a
     spreadsheet's promise, and "here is what you're beginning to
     learn" is this app's */
  { key: 'trends', label: 'Patterns' },
];

function glyphFor(key: Tab, active: boolean) {
  return key === 'today' ? <TodayGlyph active={active} /> : <TrendsGlyph active={active} />;
}

/** the day square with a plus in it — Today's empty card, at glyph
 *  size. An ACTION in the bar, not a place: it never fills, because
 *  you are never "on" it. */
function LogGlyph() {
  return (
    <View style={[styles.dayGlyph, styles.logGlyph]}>
      <View style={styles.plusH} />
      <View style={styles.plusV} />
    </View>
  );
}

export default function TabBar({ tab, onChange, onLog }: TabBarProps) {
  const insets = useSafeAreaInsets();

  /* the action sits apart from the tabs behind a hairline, iOS 26's
     accessory grammar: the same pill, a different kind of thing in it */
  const logItem = onLog ? (
    <React.Fragment key="log">
      <View style={styles.divider} />
      <Press
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onLog();
        }}
        pressOpacity={0.7}
        style={styles.item}
        accessibilityRole="button"
        accessibilityLabel="Check in"
        accessibilityHint="Records how your pain is right now"
      >
        <LogGlyph />
        <Text allowFontScaling={false} style={[styles.label, styles.labelActive]}>Log</Text>
      </Press>
    </React.Fragment>
  ) : null;

  const items = TABS.map((t) => {
    const active = tab === t.key;
    return (
      <Press
        key={t.key}
        /* the tab you are already on still fires. Tapping Today from a
           day you had walked into should land you back on Today, the way
           every iOS tab bar pops its stack — swallowing the tap left the
           only way out of the day screen its own back arrow. */
        onPress={() => {
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
          {logItem}
        </GlassView>
      ) : (
        <BlurView
          intensity={80}
          tint="systemChromeMaterialDark"
          style={[styles.pill, styles.blurFallback]}
        >
          {items}
          {logItem}
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

     Losing a destination did NOT earn the pill more room. Widened to
     fill what three tabs had used, it read as a slab across the bottom
     of the screen and took attention the content should have; a
     floating bar is supposed to be smaller than the thing it floats
     over. Same size as it always was — two items simply sit in it with
     more air. */
  pill: {
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    borderRadius: 30, borderCurve: 'continuous', height: 60, paddingHorizontal: 5, gap: 2,
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
  /* narrower than they were: three things share the pill now, and a
     bar that grew to hold a third would read as a slab. The 96 the two
     tabs had was air, not need. */
  item: {
    minHeight: 50, minWidth: 82, borderRadius: 25, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', gap: 3,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  itemActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  divider: {
    width: StyleSheet.hairlineWidth, height: 30, marginHorizontal: 3,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  dayGlyph: { width: 21, height: 21, borderRadius: 6, borderWidth: 1.9 },
  /* the plus, drawn: two bars in the square's own stroke weight */
  logGlyph: {
    borderColor: color.textPrimary, alignItems: 'center', justifyContent: 'center',
  },
  plusH: { position: 'absolute', width: 9, height: 1.9, backgroundColor: color.textPrimary },
  plusV: { position: 'absolute', width: 1.9, height: 9, backgroundColor: color.textPrimary },
  /* outline until chosen: the border draws the shape either way, and the
     fill arrives only with selection — a colour swap alone never says it */
  barsGlyph: {
    width: 21, height: 21,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  bar: { width: 5.5, borderRadius: 2, borderWidth: 1.6 },
  label: { fontSize: 11, fontWeight: '600', color: color.textTertiary, letterSpacing: 0.1 },
  labelActive: { color: color.textPrimary },
});
