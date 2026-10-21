/**
 * The card anatomy Today borrows from Apple Health's Summary (the
 * approved Main mockup, 20 Oct 2026): a small white icon and a label on
 * top, a grey fact and a chevron at the right, a big rounded value with a
 * small grey unit, a grey line under it, and the "not" line last.
 *
 * ONE GRAMMAR, IN ONE FILE. The old rule on Today was that no card may
 * use a size no other card in the app uses — a design system one screen
 * obeys is not one. The redesign changes the sizes, not the rule: they
 * live here so Sessions and Insights can take the same header and the
 * same value rather than drawing their own copy of it. The greys are the
 * mockup's (#98989F, #8E8E93, #636366, #38383A), kept local until the
 * shared tokens land, so this screen does not move theme.ts under every
 * other screen at once.
 *
 * WHITE, NEVER A HUE. Health gives each category its colour; here colour
 * means pain and nothing else, so every icon is white and the only hue a
 * card may carry is a pain value drawn as a square (DaySquare).
 *
 * EVERY NUMBER IS ROUNDED. 'ui-rounded' is the system font's rounded
 * design (SF Pro Rounded) — React Native's font utils map the name to
 * UIFontDescriptorSystemDesignRounded, so no font file ships and this
 * goes over the air to every binary. A number inside a sentence takes it
 * too (Num), so a figure looks the same in a value and in the words
 * under it.
 */
import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { size } from './theme';
import Icon, { FALLBACK, IconName as SFName } from './Icon';

export const ROUNDED = 'ui-rounded';

export const summary = {
  surface: '#1C1C1E',
  text: '#FFFFFF',
  /** a fact beside a label, the line under a value */
  secondary: '#98989F',
  /** the "not" line */
  tertiary: '#8E8E93',
  chevron: '#636366',
  separator: '#38383A',
  radius: 16,
  /** between one card and the next */
  gap: 10,
} as const;

/** an SF Symbol name (drawn by Icon, with its Ionicons stand-in on older
 *  binaries) or, for code written before Icon, an Ionicons name */
export type IconName = SFName | keyof typeof Ionicons.glyphMap;

const isSF = (n: string): n is SFName => Object.prototype.hasOwnProperty.call(FALLBACK, n);

/* a run of digits, with the separators a figure carries inside it —
   "07:40", "28–33", "4.5" — so a range stays one rounded run */
const DIGITS = /(\d+(?:[.:–-]\d+)*)/;

/** a string with its numbers set in the rounded face, inheriting
 *  everything else from the Text it sits in */
export function Num({ children }: { children: string }) {
  const parts = children.split(DIGITS);
  if (parts.length === 1) return <>{children}</>;
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1
        ? <Text key={i} style={styles.rounded}>{p}</Text>
        : p))}
    </>
  );
}

/** icon, label, the fact on the right, and a chevron when the card opens
 *  something — the chevron is a promise, so it is never decoration */
export function CardHeader({ icon, label, meta, chevron }: {
  icon: IconName;
  label: ReactNode;
  meta?: string;
  chevron?: boolean;
}) {
  return (
    <View style={styles.head}>
      <View style={styles.icon}>
        {isSF(icon)
          ? <Icon name={icon} size={18} color={summary.text} />
          : <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={summary.text} />}
      </View>
      <Text style={styles.label} allowFontScaling maxFontSizeMultiplier={1.3}>
        {typeof label === 'string' ? <Num>{label}</Num> : label}
      </Text>
      {!!meta && (
        <Text style={styles.meta} allowFontScaling maxFontSizeMultiplier={1.3}>
          <Num>{meta}</Num>
        </Text>
      )}
      {chevron && <Chevron />}
    </View>
  );
}

export function Chevron() {
  return <View style={styles.chev}><Icon name="chevron.right" size={14} color={summary.chevron} weight="bold" /></View>;
}

/** the big value: "33 min", "2 Mild". `prefix` is Health's "Avg" slot —
 *  "Up to", "Around" — set small, so the number stays the thing read */
export function BigValue({ value, unit, prefix, compact }: {
  value: string;
  unit?: string;
  prefix?: string;
  /** a figure the app worked out (an average), not one the person
   *  entered or did: set smaller, because the redesign's hero is what
   *  was done, and a derived pain number at hero size invites checking */
  compact?: boolean;
}) {
  return (
    <View style={styles.valueRow}>
      {!!prefix && (
        <Text style={styles.unit} allowFontScaling maxFontSizeMultiplier={1.3}>{prefix}</Text>
      )}
      <Text style={[styles.value, compact && styles.valueCompact]} allowFontScaling maxFontSizeMultiplier={1.3}>{value}</Text>
      {!!unit && (
        <Text style={[styles.unit, styles.unitShrink]} allowFontScaling maxFontSizeMultiplier={1.3}>
          {unit}
        </Text>
      )}
    </View>
  );
}

/** the shared surfaces and lines, for the cards that compose them */
export const card = StyleSheet.create({
  /* no hairline: on black the #1C1C1E surface is its own edge, and a
     border on every card drew a frame around each fact */
  box: {
    marginHorizontal: size.pageX, marginTop: summary.gap,
    borderRadius: summary.radius, borderCurve: 'continuous', backgroundColor: summary.surface,
    paddingTop: 14, paddingHorizontal: 16, paddingBottom: 16,
  },
  /** the grey line under a value */
  sub: { color: summary.secondary, fontSize: 15, lineHeight: 20 },
  /** what the numbers are not — inside the card, last, quiet */
  fine: { color: summary.tertiary, fontSize: 13, lineHeight: 18 },
  /** a question the card puts to the person — the check-in's */
  question: { color: summary.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.24, lineHeight: 25 },
  rule: { height: StyleSheet.hairlineWidth, backgroundColor: summary.separator },
  /** the one filled action: white, black words, fully rounded */
  primary: {
    height: 48, borderRadius: 24, borderCurve: 'continuous', backgroundColor: summary.text,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
});

const styles = StyleSheet.create({
  rounded: { fontFamily: ROUNDED },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  icon: { width: 18 },
  label: { flex: 1, color: summary.text, fontSize: 15, fontWeight: '600' },
  meta: { color: summary.secondary, fontSize: 15, flexShrink: 0 },
  chev: { marginLeft: -1 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 4 },
  value: {
    fontFamily: ROUNDED, color: summary.text, fontSize: 40, fontWeight: '700',
    letterSpacing: -0.8, fontVariant: ['tabular-nums'],
  },
  valueCompact: { fontSize: 28, lineHeight: 32 },
  unit: { fontFamily: ROUNDED, color: summary.secondary, fontSize: 20, fontWeight: '600' },
  unitShrink: { flexShrink: 1 },
});
