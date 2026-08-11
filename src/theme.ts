/**
 * Pattern design tokens — single source of truth for the native app.
 * Values are lifted verbatim from the shipped PWA and the Figma
 * design system ("Pattern — Design System", collection "Pattern / Core").
 */

export const color = {
  bgRoot: '#000000',
  bgSheet: '#242426',
  bgSurface: '#1C1C1E',
  bgSegmentTrack: '#2C2C2E',
  bgSegmentActive: '#48484A',
  borderDivider: '#2E2E30',
  borderControl: '#3A3A3C',
  textPrimary: '#FFFFFF',
  textSecondary: '#A0A0A8',
  textTertiary: '#8E8E93',
  danger: '#E0795A',
  shieldOk: '#7CC9A6',
} as const;

/** Colour themes — every ramp keeps the descending-lightness
 *  (colourblind-safe) guarantee. inkAbove = pain level from which
 *  foreground ink flips to light. */
export const themes = {
  bloom: {
    nameEn: 'Bloom', nameHe: 'פריחה', inkAbove: 7,
    ramp: ['#FF9F0A', '#FFD60A', '#FFD60A', '#32D74B', '#32D74B', '#64D2FF', '#0A84FF', '#0A84FF', '#5E5CE6', '#5E5CE6', '#BF5AF2'],
  },
} as const;

export type SlotKey = 'm' | 'd' | 'e';

export const radius = {
  button: 14,
  card: 16,
  sheet: 20,
  segment: 10,
  segmentTrack: 11,
} as const;

export const size = {
  buttonH: 52,
  rowH: 50,
  fab: 54,
  sliderThumb: 30,
  sliderTrackH: 6,
  pageX: 24,
  sheetX: 26,
} as const;

export const PAINWORDS = [
  'No pain', 'Barely there', 'Mild', 'Mild', 'Noticeable', 'Moderate',
  'Moderate to strong', 'Strong', 'Strong', 'Very strong', 'Most intense',
] as const;

export const CAPWORDS = [
  'Almost nothing', 'Very little', 'Very little', 'A little', 'Some things',
  'About half', 'More than half', 'Most things', 'Most things',
  'Nearly everything', 'Everything as usual',
] as const;
