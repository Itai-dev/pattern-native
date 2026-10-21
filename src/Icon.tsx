/**
 * One icon — Apple's SF Symbol where the binary can draw it, the
 * nearest Ionicon where it cannot.
 *
 * WHY SF SYMBOLS (20 Oct 2026). The redesign takes Apple Health as its
 * model, and Health's icons are SF Symbols. Apple's licence allows them
 * inside apps on Apple platforms (never in an app icon or a logo), and
 * they match the system type weight for weight, which no icon font does.
 *
 * NATIVE, SO GUARDED. expo-symbols is younger than runtime 1.3.0
 * (AGENTS.md, tools/test-native-guards.js). Its JS asks for the native
 * view at module load, so it is required only after
 * requireOptionalNativeModule says the module is in this binary, and
 * inside try/catch. A binary from before it draws FALLBACK's Ionicon —
 * the same size, the same white — and the screen reads the same.
 *
 * ADDING AN ICON: put the SF name and its Ionicons stand-in in FALLBACK.
 * The type is the table's keys, so an icon without a fallback does not
 * compile. Filled symbols, white, unless a screen says otherwise.
 */
import React from 'react';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type SymbolViewType = typeof import('expo-symbols').SymbolView;

const SYMBOL: SymbolViewType | null = (() => {
  if (Platform.OS !== 'ios') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const core = require('expo-modules-core');
    if (!core.requireOptionalNativeModule || !core.requireOptionalNativeModule('SymbolModule')) return null;
  } catch {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('expo-symbols');
    return m && m.SymbolView ? (m.SymbolView as SymbolViewType) : null;
  } catch {
    return null; // a binary without expo-symbols — Ionicons until TestFlight
  }
})();

/** true on binaries that draw real SF Symbols */
export const SF_SYMBOLS_AVAILABLE = SYMBOL != null;

/** SF Symbol name → its Ionicons stand-in */
export const FALLBACK = {
  'figure.run': 'walk',
  'figure.walk': 'footsteps',
  'figure.outdoor.cycle': 'bicycle',
  'figure.pool.swim': 'water',
  'figure.strengthtraining.traditional': 'barbell',
  'figure.pilates': 'body',
  'figure.mixed.cardio': 'fitness',
  'bed.double.fill': 'bed',
  'clock.fill': 'time',
  'calendar': 'calendar',
  'calendar.badge.clock': 'calendar',
  'chart.bar.fill': 'stats-chart',
  'chart.line.uptrend.xyaxis': 'trending-up',
  'hourglass': 'hourglass',
  'doc.text.fill': 'document-text',
  'heart.fill': 'heart',
  'bell.fill': 'notifications',
  'folder.fill': 'folder',
  'lock.fill': 'lock-closed',
  'exclamationmark.triangle.fill': 'warning',
  'medal.fill': 'medal',
  'flag.fill': 'flag',
  'pause.fill': 'pause',
  'arrow.uturn.backward': 'arrow-undo',
  'checkmark': 'checkmark-sharp',
  'checkmark.circle.fill': 'checkmark-circle',
  'chevron.right': 'chevron-forward',
  'chevron.left': 'chevron-back',
  'chevron.down': 'chevron-down',
  'xmark': 'close',
  'plus': 'add',
  'info.circle': 'information-circle-outline',
  'info.circle.fill': 'information-circle',
  'person.crop.circle.fill': 'person-circle',
  'gearshape.fill': 'settings',
  'square.and.arrow.up': 'share-outline',
  'sun.horizon.fill': 'sunny',
  'sun.max.fill': 'sunny',
  'moon.fill': 'moon',
  'sparkles': 'sparkles',
  'flame.fill': 'flame',
  'pills.fill': 'medkit',
  'drop.fill': 'water',
  'cup.and.saucer.fill': 'cafe',
  'brain.head.profile': 'happy-outline',
  'note.text': 'reader',
  'trash': 'trash-outline',
  'pencil': 'pencil',
  'ellipsis': 'ellipsis-horizontal',
  'magnifyingglass': 'search',
  'applewatch': 'watch',
  'iphone': 'phone-portrait',
  'icloud.fill': 'cloud',
  'hand.raised.fill': 'hand-left',
  'list.bullet': 'list',
  'figure.stand': 'body',
} as const satisfies Record<string, keyof typeof Ionicons.glyphMap>;

export type IconName = keyof typeof FALLBACK;

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** SF weight; the symbol follows the text it sits beside */
  weight?: 'regular' | 'medium' | 'semibold' | 'bold';
}

export default function Icon({ name, size = 18, color = '#FFFFFF', weight = 'semibold' }: IconProps) {
  const fallback = <Ionicons name={FALLBACK[name]} size={size} color={color} />;
  if (!SYMBOL) return fallback;
  return (
    <SYMBOL name={name} size={size} tintColor={color} type="monochrome" weight={weight}
      resizeMode="scaleAspectFit" fallback={fallback} />
  );
}
