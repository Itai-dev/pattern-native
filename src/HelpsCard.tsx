/**
 * Today's lead card — what helps, what makes it worse (helps.ts) — and
 * the small medicine card beneath it when a dose is due.
 *
 * ONE CARD, IN THIS ORDER. The experiment running now, because it is
 * the thing the person is actively finding out, with tonight's question
 * inline so answering it is one tap on the screen they already opened.
 * Then what the record found, by side. Then the sentence about what the
 * rows are not, inside the card it qualifies. A start button when
 * nothing is running — white, like every button: it is not a pain value.
 *
 * NO PAIN COLOUR ANYWHERE ON IT. The rows carry numbers about pain in
 * words; the ramp belongs to values the person entered, and a "better
 * days" heading tinted light would be the app grading a finding.
 */
import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import { fmtClock } from './clock';
import { ExperimentState, experimentCopy } from './experiment';
import { HELPS_EMPTY, HELPS_NOTE, HelpsRow, HelpsSide, HelpsView, SIDE_TITLES } from './helps';
import { DueDose, Medication } from './meds';
import { HELPS_TODAY_MAX } from './thresholds';
import { color, font, radius, size } from './theme';

export interface ExperimentAsk {
  question: string;
  options: { id: string; label: string }[];
}

export interface HelpsCardProps {
  view: HelpsView;
  /** tonight's experiment question, when it is due and unanswered */
  ask: ExperimentAsk | null;
  onAnswer: (id: string) => void;
  onStart: () => void;
  onEnd: (how: 'done' | 'stopped') => void;
}

function Row({ r }: { r: HelpsRow }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.row}>
      <Text style={styles.rowText} allowFontScaling maxFontSizeMultiplier={1.4}>{r.text}</Text>
      <Press onPress={() => setOpen(!open)} hitSlop={6} pressOpacity={0.7}
        accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide why' : 'Why?'}>
        <Text style={styles.why} allowFontScaling maxFontSizeMultiplier={1.3}>{open ? 'Hide' : 'Why?'}</Text>
      </Press>
      {open && (
        <>
          <Text style={styles.rowWhy} allowFontScaling maxFontSizeMultiplier={1.4}>{r.why}</Text>
          {!!r.caveat && (
            <Text style={styles.rowCaveat} allowFontScaling maxFontSizeMultiplier={1.4}>{r.caveat}</Text>
          )}
        </>
      )}
    </View>
  );
}

function ExperimentBlock({ s, ask, onAnswer, onStart, onEnd }: {
  s: ExperimentState; ask: ExperimentAsk | null;
  onAnswer: (id: string) => void; onStart: () => void; onEnd: (how: 'done' | 'stopped') => void;
}) {
  const c = experimentCopy(s);
  return (
    <View style={styles.block}>
      <Text style={styles.side} allowFontScaling maxFontSizeMultiplier={1.3}>
        {s.ended ? 'Your experiment, answered' : 'Finding out now'}
      </Text>
      <Text style={styles.xTitle} allowFontScaling maxFontSizeMultiplier={1.4}>{c.title}</Text>
      <Text style={styles.rowWhy} allowFontScaling maxFontSizeMultiplier={1.4}>{c.evidence}</Text>
      {!!c.caveat && <Text style={styles.rowCaveat} allowFontScaling maxFontSizeMultiplier={1.4}>{c.caveat}</Text>}
      {!s.ended && ask && (
        <View style={styles.ask}>
          <Text style={styles.askQ} allowFontScaling maxFontSizeMultiplier={1.4}>{ask.question}</Text>
          <View style={styles.askRow}>
            {ask.options.map((o) => (
              <Press key={o.id} onPress={() => { Haptics.selectionAsync().catch(() => {}); onAnswer(o.id); }}
                style={styles.askBtn} pressScale={0.97}
                accessibilityRole="button" accessibilityLabel={o.label}>
                <Text style={styles.askText} numberOfLines={2} allowFontScaling maxFontSizeMultiplier={1.3}>{o.label}</Text>
              </Press>
            ))}
          </View>
        </View>
      )}
      <View style={styles.actions}>
        {s.ended ? (
          <>
            <Press onPress={() => { onEnd('done'); onStart(); }} hitSlop={6} pressOpacity={0.8}
              accessibilityRole="button" accessibilityLabel="Try something else">
              <Text style={styles.go} allowFontScaling maxFontSizeMultiplier={1.3}>Try something else</Text>
            </Press>
            <Press onPress={() => onEnd('done')} hitSlop={6} pressOpacity={0.7}
              accessibilityRole="button" accessibilityLabel="Keep the answer and close">
              <Text style={styles.later} allowFontScaling maxFontSizeMultiplier={1.3}>Done</Text>
            </Press>
          </>
        ) : (
          <Press
            onPress={() => Alert.alert('Stop this experiment?',
              'The answers so far stay on their days. There will be no result.',
              [{ text: 'Keep going', style: 'cancel' },
                { text: 'Stop', style: 'destructive', onPress: () => onEnd('stopped') }])}
            hitSlop={6} pressOpacity={0.7}
            accessibilityRole="button" accessibilityLabel="Stop this experiment early">
            <Text style={styles.later} allowFontScaling maxFontSizeMultiplier={1.3}>Stop early</Text>
          </Press>
        )}
      </View>
    </View>
  );
}

export function HelpsCard({ view, ask, onAnswer, onStart, onEnd }: HelpsCardProps) {
  /* the rest open in place: several of them (tiredness, past
     experiments) live nowhere else, so a link away would lose them */
  const [all, setAll] = useState(false);
  const shown = all ? view.rows : view.rows.slice(0, HELPS_TODAY_MAX);
  /* the side headings, each once, in the order helps.ts sorted them */
  let last: HelpsSide | null = null;
  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>
        What helps, what makes it worse
      </Text>

      {view.experiment && (
        <ExperimentBlock s={view.experiment} ask={ask} onAnswer={onAnswer} onStart={onStart} onEnd={onEnd} />
      )}

      {shown.map((r) => {
        const head = r.side !== last;
        last = r.side;
        return (
          <View key={r.key} style={head ? styles.block : undefined}>
            {head && (
              <Text style={styles.side} allowFontScaling maxFontSizeMultiplier={1.3}>{SIDE_TITLES[r.side]}</Text>
            )}
            <Row r={r} />
          </View>
        );
      })}

      {view.empty && (
        <Text style={styles.empty} allowFontScaling maxFontSizeMultiplier={1.4}>{HELPS_EMPTY}</Text>
      )}

      {view.more > 0 && (
        <Press onPress={() => setAll(!all)} hitSlop={6} pressOpacity={0.7} style={styles.moreRow}
          accessibilityRole="button" accessibilityState={{ expanded: all }}
          accessibilityLabel={all ? 'Show fewer' : 'Show ' + view.more + ' more'}>
          <Text style={styles.go} allowFontScaling maxFontSizeMultiplier={1.3}>
            {all ? 'Show fewer' : 'Show ' + view.more + ' more'}
          </Text>
        </Press>
      )}

      {!view.experiment && (
        <Press onPress={onStart} style={styles.primary} pressScale={0.985}
          accessibilityRole="button" accessibilityLabel="Try something for two weeks">
          <Text style={styles.primaryText} allowFontScaling maxFontSizeMultiplier={1.3}>Try something for two weeks</Text>
        </Press>
      )}

      {/* what every row is not, inside the card it qualifies */}
      {(!view.empty || !!view.experiment) && (
        <Text style={styles.note} allowFontScaling maxFontSizeMultiplier={1.4}>{HELPS_NOTE}</Text>
      )}
    </View>
  );
}

export interface DoseCardProps {
  due: DueDose[];
  /** medicines with no times: offered as "took one now" */
  asNeeded: Medication[];
  onMark: (med: Medication, slot: number, status: 'taken' | 'skipped') => void;
}

/**
 * The medicine card: only while a scheduled dose is due and unanswered,
 * or for someone who keeps an as-needed medicine. No count of misses,
 * no yesterday, no percentage — an unanswered time simply leaves.
 */
export function DoseCard({ due, asNeeded, onMark }: DoseCardProps) {
  if (!due.length && !asNeeded.length) return null;
  return (
    <View style={[styles.card, styles.gap]}>
      <Text style={styles.eyebrow} allowFontScaling maxFontSizeMultiplier={1.3}>Medicines</Text>
      {due.map((d) => (
        <View key={d.med.id + '-' + d.slot} style={styles.doseRow}>
          <Text style={styles.doseName} allowFontScaling maxFontSizeMultiplier={1.3}>
            {d.med.name}{d.med.dose ? ' · ' + d.med.dose : ''}
            <Text style={styles.doseTime}>{'  ' + fmtClock(d.slot)}</Text>
          </Text>
          <View style={styles.doseBtns}>
            <Press onPress={() => onMark(d.med, d.slot, 'taken')} style={styles.pill} pressScale={0.97}
              accessibilityRole="button" accessibilityLabel={d.med.name + ' at ' + fmtClock(d.slot) + ', taken'}>
              <Text style={styles.pillText} allowFontScaling maxFontSizeMultiplier={1.3}>Taken</Text>
            </Press>
            <Press onPress={() => onMark(d.med, d.slot, 'skipped')} style={[styles.pill, styles.pillQuiet]} pressScale={0.97}
              accessibilityRole="button" accessibilityLabel={d.med.name + ' at ' + fmtClock(d.slot) + ', skipped'}>
              <Text style={[styles.pillText, styles.pillQuietText]} allowFontScaling maxFontSizeMultiplier={1.3}>Skipped</Text>
            </Press>
          </View>
        </View>
      ))}
      {asNeeded.length > 0 && (
        <View style={styles.doseRow}>
          <Text style={styles.doseTime} allowFontScaling maxFontSizeMultiplier={1.3}>Took one just now?</Text>
          <View style={styles.doseBtns}>
            {asNeeded.map((m) => (
              <Press key={m.id} onPress={() => onMark(m, -1, 'taken')} style={[styles.pill, styles.pillQuiet]} pressScale={0.97}
                accessibilityRole="button" accessibilityLabel={'Took ' + m.name + ' just now'}>
                <Text style={[styles.pillText, styles.pillQuietText]} allowFontScaling maxFontSizeMultiplier={1.3}>{m.name}</Text>
              </Press>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: size.pageX, marginTop: 14,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    padding: 16,
  },
  gap: { marginTop: 14 },
  eyebrow: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '600' },
  block: { marginTop: 16 },
  side: {
    color: color.textTertiary, fontSize: font.footnote, fontWeight: '600',
    letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: 6,
  },
  xTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 22 },
  row: { marginBottom: 10 },
  rowText: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21 },
  why: { color: color.tint, fontSize: font.footnote, fontWeight: '600', marginTop: 4 },
  rowWhy: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: 6 },
  rowCaveat: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 4 },
  ask: { marginTop: 14 },
  askQ: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '500', marginBottom: 8 },
  askRow: { flexDirection: 'row', gap: 8 },
  askBtn: {
    flex: 1, minHeight: 44, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1,
    borderColor: color.borderControl, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
  },
  askText: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '500', textAlign: 'center' },
  actions: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    flexWrap: 'wrap', gap: 12, marginTop: 12,
  },
  go: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  later: { color: color.textTertiary, fontSize: font.subheadline, fontWeight: '500' },
  empty: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 10 },
  moreRow: { marginTop: 4 },
  primary: {
    minHeight: 46, borderRadius: 23, borderCurve: 'continuous', marginTop: 16,
    backgroundColor: color.textPrimary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.subheadline, fontWeight: '600' },
  note: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 14 },
  doseRow: { marginTop: 12, gap: 8 },
  doseName: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '500' },
  doseTime: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '400' },
  doseBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    minHeight: 36, paddingHorizontal: 16, borderRadius: 18, borderCurve: 'continuous',
    backgroundColor: color.textPrimary, alignItems: 'center', justifyContent: 'center',
  },
  pillText: { color: '#000000', fontSize: font.subheadline, fontWeight: '600' },
  pillQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: color.borderControl },
  pillQuietText: { color: color.textPrimary, fontWeight: '500' },
});
