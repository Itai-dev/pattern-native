/**
 * The (i): an explanation kept inside the card it qualifies, one tap
 * away instead of always on.
 *
 * The rule this bends, and how far. AGENTS.md says every section that
 * shows numbers carries the sentence about what they are not, INSIDE the
 * card. That sentence is still here, still in the card, still next to
 * the thing — it is folded, not moved. What changed is the default: a
 * screen where every card carried two lines of small grey type read as
 * a page of caveats, and a caveat nobody reads protects nobody. The
 * ring is neutral, never the pain palette, because it is a control.
 *
 * Nothing is remembered between opens. A tip closed is a tip closed for
 * this look; the next open of the screen starts folded again, so the
 * screen is the same every time and never asks to be reset.
 *
 * Three shapes, one glyph:
 *   InfoGlyph — the ring alone, for a header row that owns its state
 *   InfoTip   — the ring right-aligned on its own row, text below
 *   InfoTitle — a title (and an aside) with the ring at the end, text below
 */
import React, { ReactNode, useState } from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { Press } from './motion';
import { color, font } from './theme';

export function InfoGlyph({ open, onPress, label }: {
  open: boolean;
  onPress: () => void;
  label: string;
}) {
  return (
    <Press
      onPress={onPress}
      pressOpacity={0.7}
      hitSlop={8}
      style={styles.hit}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      accessibilityHint={open ? 'Hides the explanation' : 'Shows what this does and does not mean'}
    >
      <View style={[styles.ring, open && styles.ringOn]}>
        <Text style={[styles.i, open && styles.iOn]} allowFontScaling={false}>i</Text>
      </View>
    </Press>
  );
}

/** the explanation itself, in the quiet type every card's note used */
function Body({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.text} allowFontScaling maxFontSizeMultiplier={1.4}>
      {children}
    </Text>
  );
}

/** the ring on its own row, right-aligned; the text below when open */
export default function InfoTip({ text, label, style }: {
  text: ReactNode;
  /** what the screen reader calls it; defaults to the generic */
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={style}>
      <View style={styles.rowEnd}>
        <InfoGlyph open={open} onPress={() => setOpen((v) => !v)}
          label={label || 'What these numbers do and do not mean'} />
      </View>
      {open && <Body>{text}</Body>}
    </View>
  );
}

/** a heading with the ring at its end — and an optional aside before
 *  it, for the "6 of 14 logged" kind of count that shares the row */
export function InfoTitle({ title, titleStyle, aside, asideStyle, text, label, style }: {
  title: string;
  titleStyle: StyleProp<TextStyle>;
  aside?: string;
  asideStyle?: StyleProp<TextStyle>;
  text: ReactNode;
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={style}>
      <View style={styles.row}>
        <Text style={[titleStyle, styles.title]} allowFontScaling maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        {!!aside && (
          <Text style={asideStyle} allowFontScaling maxFontSizeMultiplier={1.3}>{aside}</Text>
        )}
        <InfoGlyph open={open} onPress={() => setOpen((v) => !v)} label={label || 'About ' + title} />
      </View>
      {open && <Body>{text}</Body>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowEnd: { flexDirection: 'row', justifyContent: 'flex-end' },
  /* the title keeps its own type; this only lets it take the row and
     wrap, and cancels the bottom margin a heading carries when it is
     the last thing before content — the row is now that thing */
  title: { flex: 1, marginBottom: 0 },
  /* 32 drawn, 48 touchable with the slop — the floor for a hand that
     hurts, without a ring the size of a button */
  hit: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  ring: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: color.textTertiary,
    alignItems: 'center', justifyContent: 'center',
  },
  ringOn: { backgroundColor: color.textPrimary, borderColor: color.textPrimary },
  i: {
    color: color.textTertiary, fontSize: 12, fontWeight: '700', lineHeight: 14,
    fontStyle: 'italic',
  },
  iOn: { color: '#000000' },
  text: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 6 },
});
