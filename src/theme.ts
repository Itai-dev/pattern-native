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
  /** the app's interactive tint — nav actions, links, selection */
  tint: '#5BA8FF',
  /** Pattern blue — the icon's rim, the brand's anchor hue */
  brand: '#0A84FF',
} as const;

/** The pain colour scale is a single brightness ramp of one hue:
 *  0 sits in near-black darkness and 10 is a luminous near-white — pain
 *  rises as luminosity, an amount rather than a verdict. Pure white is
 *  reserved for controls and selection, so 10 always stops short of it.
 *  Anchors are interpolated smoothly in painScale.painColor.
 *
 *  The HUE is the user's choice. Every theme keeps the same brightness
 *  story — anchors are channel-monotone, so luminance rises strictly from
 *  0 to 10 in every palette and the meaning of "brighter = more" never
 *  changes when the colour does. */
export type PainThemeId = 'blue' | 'violet' | 'rose' | 'mint';

export interface PainTheme {
  id: PainThemeId;
  name: string;
  /** the theme's saturated middle — today's ring, tinted accents */
  brand: string;
  anchors: ReadonlyArray<readonly [number, string]>;
}

export const PAIN_THEMES: readonly PainTheme[] = [
  {
    id: 'blue', name: 'Pattern Blue', brand: '#0A84FF',
    anchors: [
      [0, '#070C16'],   // very dark blue-black
      [2, '#152C52'],   // muted navy
      [5, '#0A84FF'],   // saturated Pattern blue
      [8, '#5FBEFF'],   // luminous sky
      [10, '#EAF6FF'],  // icy near-white — never pure white
    ],
  },
  {
    id: 'violet', name: 'Violet', brand: '#BF5AF2',
    anchors: [
      [0, '#0E0714'],
      [2, '#2E1650'],
      [5, '#A455F0'],
      [8, '#CDA0FF'],
      [10, '#F3EAFF'],
    ],
  },
  {
    id: 'rose', name: 'Rose', brand: '#FF375F',
    anchors: [
      [0, '#14070B'],
      [2, '#4A1430'],
      [5, '#F0447A'],
      [8, '#FC96B4'],
      [10, '#FFEAF4'],
    ],
  },
  {
    id: 'mint', name: 'Mint', brand: '#2AC0B0',
    anchors: [
      [0, '#071412'],
      [2, '#124A44'],
      [5, '#2AC0B0'],
      [8, '#8FE0D6'],
      [10, '#EAFBF8'],
    ],
  },
] as const;

export const DEFAULT_PAIN_THEME: PainThemeId = 'blue';

/** the default (blue) anchors — kept as a named export because the scale's
 *  documented contract is defined against them */
export const RAMP_ANCHORS = PAIN_THEMES[0].anchors;

/** semantic type scale — iOS text styles by name, in points. The system
 *  font (SF Pro on iOS) is the default family; Dynamic Type comes from
 *  allowFontScaling, which RN leaves on unless a style opts out. */
export const font = {
  largeTitle: 34,
  title1: 28,
  title2: 22,
  title3: 20,
  body: 17,
  subheadline: 15,
  footnote: 13,
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
