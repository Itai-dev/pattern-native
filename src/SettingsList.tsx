/**
 * Profile and the sheets it opens, in the grammar of iOS Settings on the
 * redesign's black ground (21 Oct 2026): a large title, inset grouped
 * #1C1C1E cards at 16pt corners, a white glyph leading each row, the
 * hairline inset past it, a grey chevron where a row opens something.
 *
 * ONE GRAMMAR, IN ONE FILE — SummaryCard's rule, for lists. Profile's
 * rows were drawn in App.tsx and copied "to the pixel" into
 * AppointmentRow, and the reminders drew a third version of their own;
 * three copies of one row is how a 12pt corner survives on one group
 * while the next is 16. Every row and every sheet's bar takes its
 * values from here.
 *
 * NO COLOURED TILES. Settings gives each row a coloured square; here a
 * hue means pain and a square means a pain value, so a tinted tile would
 * borrow both meanings at once. The glyph is white and stands on the
 * card. The greys are SummaryCard's, so a list and a card on the same
 * screen agree.
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import Icon, { IconName } from './Icon';
import { ROUNDED, summary } from './SummaryCard';
import { font } from './theme';

export const list = {
  ground: '#000000',
  surface: summary.surface,
  text: summary.text,
  secondary: summary.secondary,
  tertiary: summary.tertiary,
  chevron: summary.chevron,
  separator: summary.separator,
  radius: summary.radius,
} as const;

/* the glyph's slot: Settings' 29pt tile without the tile, so labels
   start where an iOS user's eye expects them and the inset hairline
   lines up under the label, not under the glyph */
const ICON_SLOT = 29;
const ICON_SIZE = 20;
const ROW_X = 16;
const ROW_GAP = 12;
/** where a row's words start: the card edge, the glyph's slot, the gap.
 *  A row without a glyph of its own (an option under a switch) starts
 *  here, so the card keeps one left edge for reading. */
export const ROW_TEXT_X = ROW_X + ICON_SLOT + ROW_GAP;

/** a row's glyph — white, filled, on nothing */
export function RowIcon({ name }: { name: IconName }) {
  return (
    <View style={settings.rowIcon}>
      <Icon name={name} size={ICON_SIZE} color={list.text} />
    </View>
  );
}

/** the promise that a row opens something — never decoration */
export function RowChevron() {
  return <Icon name="chevron.right" size={14} color={list.chevron} weight="semibold" />;
}

export const settings = StyleSheet.create({
  /* ── a sheet's frame ── */
  sheet: { flex: 1, backgroundColor: list.ground },
  /* no hairline under the bar: on black the large title or the first
     card is the edge, and a rule across a page sheet drew a second top */
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4,
  },
  navSpacer: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  navTitle: { color: list.text, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  /* white, and told apart by weight — the tint was a pain hue once */
  navBtnText: { color: list.text, fontSize: font.body, fontWeight: '600' },
  /** iOS's large title, at the mockup's 34 and −2.2% tracking */
  largeTitle: {
    color: list.text, fontSize: font.largeTitle, fontWeight: '700', letterSpacing: -0.75,
    marginHorizontal: 4, marginBottom: 18,
  },
  body: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 48 },

  /* ── groups ── */
  group: {
    borderRadius: list.radius, borderCurve: 'continuous', backgroundColor: list.surface,
    overflow: 'hidden', marginBottom: 24,
  },
  /* the mockup's LABEL: 600, +4%, grey — a heading for the group,
     quieter than anything in it. 13, the footnote size its footers
     take (the calm pass, 21 Oct 2026): a 12 here was the one size on
     the sheet that appeared nowhere else, and two small sizes a point
     apart read as a mistake rather than a hierarchy. */
  groupTitle: {
    color: list.secondary, fontSize: font.footnote, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: 7, marginLeft: 16,
  },
  /* pulled up under its group: it qualifies the rows above, so it sits
     with them rather than half-way to the next heading */
  groupFooter: {
    color: list.tertiary, fontSize: font.footnote, lineHeight: 18,
    marginTop: -16, marginBottom: 24, marginHorizontal: 16,
  },

  /* ── rows ── */
  row: {
    flexDirection: 'row', alignItems: 'center', gap: ROW_GAP,
    minHeight: 48, paddingLeft: ROW_X,
  },
  rowCentre: { justifyContent: 'center', paddingLeft: 0 },
  rowIcon: { width: ICON_SLOT, minHeight: 29, alignItems: 'center', justifyContent: 'center' },
  /* the hairline belongs to the row's text, not the row, so it starts
     past the glyph exactly as Settings draws it */
  rowMain: {
    flex: 1, paddingRight: 16, minHeight: 48,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  rowLine: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: list.separator },
  rowLineLast: { borderBottomWidth: 0 },
  /** for rows drawn top-down (a row knows it is not first, not last) */
  rowRuleTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: list.separator },
  rowLabel: { color: list.text, fontSize: font.body, flex: 1 },
  rowValue: { color: list.secondary, fontSize: font.body, maxWidth: 160 },
  /** a figure in a row's value or a footer — every number is rounded */
  rounded: { fontFamily: ROUNDED, fontWeight: '600' },

  /* ── the two buttons a sheet may carry ── */
  /** the one filled action: white, black words, a capsule */
  primary: {
    minHeight: 54, borderRadius: 27, borderCurve: 'continuous', backgroundColor: list.text,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 20,
  },
  primaryOff: { opacity: 0.5 },
  primaryText: { color: '#000000', fontSize: font.body, fontWeight: '600' },
  /** everything else that is a button: the card's own grey */
  secondary: {
    minHeight: 50, borderRadius: 25, borderCurve: 'continuous', backgroundColor: list.surface,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 20,
  },
  secondaryText: { color: list.text, fontSize: font.body, fontWeight: '600' },
});
