/**
 * THE FALLBACK BAR (21 Oct 2026). Navigation is the system's own tab
 * bar now (AppTabs.tsx); this draws only where that cannot — the web
 * preview, a development client without the native module — so there
 * is always a way between the two places. What follows is its history.
 *
 * The floating bar — Pattern's navigation as iOS 26 draws its own: a
 * Liquid Glass pill hovering over the content, and beside it a round
 * glass + for the check-in (the October mockup, Main). Nothing is docked
 * to the screen edge; the content scrolls underneath and reads through
 * the material.
 *
 * REAL GLASS WHERE IT EXISTS. expo-glass-effect exposes the system's
 * Liquid Glass — the same material the platform's own bars refract
 * through. On anything older than iOS 26 the pill and the + fall back to
 * the chrome blur they had before: one layout, two materials, no other
 * branch.
 *
 * TWO GLYPHS, AND NEITHER IS A SQUARE (21 Oct 2026). Today used to be a
 * rounded square and Patterns three square-ended bars, "the app's square
 * language". Since the redesign a square means a pain value and nothing
 * else — Today's week strip, the check-in's hero, the day page — so a
 * white square in the bar read as a score with no number on it. Today is
 * SF Symbols' `calendar` (a day, the thing the screen is about) and
 * Patterns is `chart.line.uptrend.xyaxis`, the same symbol Insights
 * takes in the mockup. Rejected: `square.fill` for Today (the square
 * again), `chart.bar.fill` for Patterns (white bars are the Sessions
 * minutes on Today, so the tab would point at the wrong thing).
 *
 * SELECTION IS THE WASH AND WHITE, NOT A FILL SWAP. The old outline-to-
 * filled grammar needs a symbol with both forms, and neither of these
 * has one: there is no `calendar.fill` or `chart.line…fill` in SF
 * Symbols, and drawing an outline Ionicon on older binaries beside a
 * filled SF Symbol on newer ones would make the same tab two shapes on
 * two phones. So both glyphs are always the filled form the symbol
 * comes in; where you are is said three ways that need no colour — the
 * light wash behind the item, white over grey, and VoiceOver's selected
 * state — which is how iOS 26's own bar says it.
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
import Icon, { IconName } from './Icon';
import { color } from './theme';

export type Tab = 'today' | 'trends';

/** Left to right, and the same order the pages sit in. TWO tabs: Today
 *  is where you act, and Patterns is what the record is
 *  beginning to show — findings first, description folded beneath. */
export const TAB_ORDER: Tab[] = ['today', 'trends'];

export interface TabBarProps {
  tab: Tab;
  onChange: (tab: Tab) => void;
  /** the check-in, from the one place a thumb always reaches — drawn
   *  as the round + beside the bar */
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

/* The mockup's geometry: the pill and the + are both 62 tall, so the
   two read as one row of glass; the pill holds its items 4pt in. */
const BAR_H = 62;
const BAR_PAD = 4;
const ITEM_H = BAR_H - BAR_PAD * 2;
const GLYPH = 22;

/* LABELS SCALE, UP TO WHAT THE ITEM HOLDS (18 Oct 2026, re-measured
   21 Oct). They were fixed at 11pt, so someone reading at a larger text
   size got the one row of words in the app that ignored it. An item is
   54 (62 less 4 above and below) with 7 of padding top and bottom, which
   leaves 40 for the glyph (22), the gap (2) and one line of label: 16pt
   of line — the same 40 the 60pt pill left for a 21 glyph and a 3 gap,
   so the cap did not move. SF at 11pt sets a line of about 13.1, so
   16 / 13.1 ≈ 1.22. Capped at 1.2: 13.2pt type on a ~15.8 line, 39.7 of
   the 40. Past it the item grows toward the pill's edge, the selected
   wash touches it and then clips under overflow: hidden — and a taller
   pill would stand taller than the + beside it. Width is not the limit:
   each item is half of the bar, well over 100pt on the narrowest phone,
   and one line is enforced, so a label can only widen, never wrap into
   a line the height cannot hold.
   iOS's own tab bar meets the largest sizes differently: it does not
   grow, it shows the item in the large-content viewer on a long press.
   RN's core View carries that (accessibilityShowsLargeContentViewer, no
   new native code, so it is safe over the air), and it is set too — but
   nothing depends on it. The cap is what fits; the viewer is extra, and
   only at the accessibility sizes. */
const TAB_LABEL_MAX_SCALE = 1.2;

const TABS: { key: Tab; label: string; icon: IconName }[] = [
  { key: 'today', label: 'Today', icon: 'calendar' },
  /* Patterns, not Record: "here is everything you entered" is a
     spreadsheet's promise, and "here is what you're beginning to
     learn" is this app's */
  { key: 'trends', label: 'Patterns', icon: 'chart.line.uptrend.xyaxis' },
];

/* the mockup's quiet grey for a place you are not — SummaryCard's
   secondary, so the bar and the cards above it share one grey */
const IDLE = '#98989F';

/** one surface of glass, whichever material this binary has */
function Glass({ style, children }: { style: object[]; children: React.ReactNode }) {
  return LIQUID ? (
    <GlassView glassEffectStyle="regular" colorScheme="dark" style={[...style, styles.liquid]}>
      {children}
    </GlassView>
  ) : (
    <BlurView intensity={80} tint="systemChromeMaterialDark" style={[...style, styles.blurFallback]}>
      {children}
    </BlurView>
  );
}

export default function TabBar({ tab, onChange, onLog }: TabBarProps) {
  const insets = useSafeAreaInsets();

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
        /* each item takes half the pill — on the press itself, which is
           what the pill lays out (motion.tsx, hostStyle) */
        hostStyle={styles.itemHost}
        style={[styles.item, active && styles.itemActive]}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={t.label}
        accessibilityShowsLargeContentViewer
        accessibilityLargeContentTitle={t.label}
      >
        <Icon name={t.icon} size={GLYPH} color={active ? color.textPrimary : IDLE} />
        <Text
          allowFontScaling
          maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
          numberOfLines={1}
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
      {/* the bar takes the row and the + its own 62: the mockup's
          layout. A pill that only hugged two tabs left a gap beside the
          + that read as a missing third tab. */}
      <Glass style={[styles.pill]}>{items}</Glass>

      {/* An ACTION, not a place, so it sits outside the pill — iOS 26's
          accessory grammar — and never takes the selected wash: you are
          never "on" it. No label: the + is the most familiar glyph on
          the phone, and VoiceOver hears the words. */}
      {onLog && (
        <Press
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            onLog();
          }}
          pressOpacity={0.7}
          pressScale={0.97}
          accessibilityRole="button"
          accessibilityLabel="Check in"
          accessibilityHint="Records how your pain is right now"
          accessibilityShowsLargeContentViewer
          accessibilityLargeContentTitle="Log"
        >
          <Glass style={[styles.log]}>
            <Icon name="plus" size={24} color={color.textPrimary} weight="bold" />
          </Glass>
        </Press>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  pill: {
    flex: 1, flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    height: BAR_H, borderRadius: BAR_H / 2, borderCurve: 'continuous', padding: BAR_PAD,
  },
  /* the + — the same glass, the same height, a circle */
  log: {
    width: BAR_H, height: BAR_H, borderRadius: BAR_H / 2, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
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
  itemHost: { flex: 1, alignSelf: 'stretch' },
  item: {
    flex: 1, minHeight: ITEM_H, borderRadius: ITEM_H / 2, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  /* the light wash is where you are */
  itemActive: { backgroundColor: 'rgba(255,255,255,0.12)' },
  label: { fontSize: 11, fontWeight: '600', color: IDLE, letterSpacing: 0.1 },
  labelActive: { color: color.textPrimary },
});
