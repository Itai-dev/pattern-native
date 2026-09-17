import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Association as HealthAssociation, factorLabel, groupLabels, isCategorical } from './health/engine';
import { DoseAssociation } from './health/doses';
import { formatScore, painColor } from './painScale';
import { color, font } from './theme';

/**
 * The two groups of a health comparison, drawn.
 *
 * Bar LENGTH is the group's mean pain; bar COLOUR is painColor of that
 * same mean — colour stays a pain value, and the factor (sleep, steps,
 * workout minutes) lives entirely in the label text, never in the ramp.
 * Every bar carries its n, because a bar without its sample size is a
 * claim wearing a chart's clothes.
 */
export function GroupBars({ a }: { a: Pick<HealthAssociation, 'kind' | 'low' | 'high'> }) {
  if (!a.low || !a.high) return null;
  const w = groupLabels(a.kind);
  const rows = [
    { g: a.low, word: w.low },
    { g: a.high, word: w.high },
  ];
  return (
    <View style={cmpStyles.wrap}>
      {rows.map((r) => (
        <View
          key={r.word}
          style={cmpStyles.row}
          accessible
          accessibilityLabel={r.word + ' ' + w.noun + ', average '
            + factorLabel(a.kind, r.g.factorMean) + ', ' + w.outcome + ' averaged '
            + formatScore(r.g.painMean) + ' across ' + r.g.n + ' days'}
        >
          <View style={cmpStyles.head}>
            <Text style={cmpStyles.label} allowFontScaling maxFontSizeMultiplier={1.3}>
              {r.word[0].toUpperCase() + r.word.slice(1) + ' ' + w.noun
                + (isCategorical(a.kind)
                  ? '' : ' · avg ' + factorLabel(a.kind, r.g.factorMean))}
            </Text>
            <Text style={cmpStyles.n} allowFontScaling maxFontSizeMultiplier={1.3}>
              {r.g.n} {w.noun}
            </Text>
          </View>
          <View style={cmpStyles.barRow}>
            <View style={cmpStyles.track}>
              <View
                style={[
                  cmpStyles.fill,
                  {
                    width: `${Math.max(3, (r.g.painMean / 10) * 100)}%` as const,
                    backgroundColor: painColor(r.g.painMean),
                  },
                ]}
              />
            </View>
            <Text style={cmpStyles.value} allowFontScaling maxFontSizeMultiplier={1.3}>
              {formatScore(r.g.painMean)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * Before and after a dose, drawn the same way: bar length and colour
 * are the mean pain, the medication lives in the text. Each bar carries
 * its n — the same n, because these are pairs.
 */
export function DoseBars({ a }: { a: Pick<DoseAssociation, 'med' | 'pairs' | 'before' | 'after'> }) {
  if (a.before == null || a.after == null) return null;
  const rows = [
    { word: 'Before a dose', v: a.before },
    { word: 'After a dose', v: a.after },
  ];
  return (
    <View style={cmpStyles.wrap}>
      {rows.map((r) => (
        <View
          key={r.word}
          style={cmpStyles.row}
          accessible
          accessibilityLabel={r.word + ' of ' + a.med + ', pain averaged '
            + formatScore(r.v) + ' across ' + a.pairs + ' doses'}
        >
          <View style={cmpStyles.head}>
            <Text style={cmpStyles.label} allowFontScaling maxFontSizeMultiplier={1.3}>
              {r.word}
            </Text>
            <Text style={cmpStyles.n} allowFontScaling maxFontSizeMultiplier={1.3}>
              {a.pairs} doses
            </Text>
          </View>
          <View style={cmpStyles.barRow}>
            <View style={cmpStyles.track}>
              <View
                style={[
                  cmpStyles.fill,
                  {
                    width: `${Math.max(3, (r.v / 10) * 100)}%` as const,
                    backgroundColor: painColor(r.v),
                  },
                ]}
              />
            </View>
            <Text style={cmpStyles.value} allowFontScaling maxFontSizeMultiplier={1.3}>
              {formatScore(r.v)}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const cmpStyles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 12 },
  row: { gap: 4 },
  head: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  label: { flex: 1, color: color.textSecondary, fontSize: font.footnote },
  n: { color: color.textTertiary, fontSize: font.footnote, fontVariant: ['tabular-nums'] },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: {
    flex: 1, height: 10, borderRadius: 5, overflow: 'hidden',
    backgroundColor: color.bgSegmentTrack,
  },
  fill: {
    height: 10, borderRadius: 5,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)',
  },
  value: {
    color: color.textPrimary, fontSize: font.footnote, fontWeight: '600',
    minWidth: 26, textAlign: 'right', fontVariant: ['tabular-nums'],
  },
});

