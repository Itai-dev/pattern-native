/**
 * Trends — your record, on a screen you can open.
 *
 * This used to be a sheet you had to know to go looking for, behind a row
 * in Settings called "Doctor summary". Everything in it was already
 * computed and already worth reading; it just was not anywhere. Now it is
 * a tab, and the PDF is an export of what you are already looking at
 * rather than a document you go and generate.
 *
 * One data path: buildReportData() computes every block here, and the
 * same object renders the print document in report.ts. A number cannot
 * differ between this screen and the file you hand a clinician, because
 * there is only one place it is worked out.
 *
 * NOTHING ON THIS SCREEN IS AN INFERENCE. It is what you recorded, shown
 * back to you. Claims about what affects your pain are a different thing
 * with a different gate, and they are not here.
 *
 * The screen is also deliberately dull, and that is a design requirement
 * rather than an omission. An always-available view of your own pain is
 * the surface most likely to turn "I keep a record" into "I check my
 * numbers five times a day", so: no week-over-week deltas, no arrows, no
 * percentages moving, no streak, no completion ring, nothing that differs
 * between two opens on the same day except data you added yourself, and
 * no notification ever originates here. It is somewhere to go, not
 * something that asks.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as db from './db';
import { Press } from './motion';
import MapScreen from './MapScreen';
import {
  EVENT_LABELS, Entries, FuncEntry, INTERVENTIONS, PainEvent, Protocol,
  RESPONSE_LABELS, Response, dateFromISO, } from './model';
import { fmtClock } from './clock';
import { BAND_AT, formatScore, painColor, painLabel } from './painScale';
import {
  ChartColumn, EndOfRecord, ReportData, buildReportData, chartColumns, chartGrain,
  fmtReportDate,
} from './report';
import {
  Association as HealthAssociation, IN_BED_NOTE, associationCopy, fadedCopy, factorLabel,
  groupLabels, progressCopy,
} from './health/engine';
import { HealthProgress } from './health/noticed';
import { DigestCard, checkinBuys, recordSays } from './digest';
import { color, font, radius, size } from './theme';

const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => {
  const d = dateFromISO(iso);
  return d.getDate() + ' ' + M3[d.getMonth()];
};

export interface TrendsScreenProps {
  entries: Entries;
  /** opening a day from the calendar at the foot of this screen. History
   *  used to be its own tab; it is the last section here now — the
   *  record and what the record adds up to are one subject, and two
   *  tabs made the user decide which of them they wanted before they
   *  could look at either. */
  onOpenDay: (dateIso: string) => void;
  events: PainEvent[];
  func: FuncEntry[];
  goalText: string | null;
  todayIso: string;
  /** how many days the chart is currently showing, reported upward so the
   *  PDF the title bar exports covers what is actually on screen */
  onSpanChange?: (days: number) => void;
  /** What Pattern noticed in Apple Health context — computed upstream
   *  by the health engine, already gated. null/empty = the section is
   *  simply not drawn; this screen never manufactures an insight. */
  healthNoticed?: {
    best: HealthAssociation | null;
    fading: HealthAssociation[];
    /** associations whose tercile groups formed, verdict or not — the
     *  comparison is drawable the moment the groups exist; the CLAIM
     *  stays gated exactly as before */
    groups: HealthAssociation[];
    /** the comparisons still short of their gate, with the count and
     *  the instruction — what a connected person sees before anything
     *  has cleared, so the wait is never silent */
    progress: HealthProgress[];
  };
  /** the active observation period, for the progress cards — what a
   *  check-in is currently buying */
  protocol?: Protocol | null;
  /** the PDF, from its natural home at the foot of the screen — the
   *  handoff is the destination of everything above it */
  onShare?: () => void;
  sharing?: boolean;
}

function Metric({ label, value, sub, onPress }: {
  label: string; value: string; sub?: string;
  /** a summary that names a day should open it — the figure stops being
   *  a dead end and becomes the door to the day it is about */
  onPress?: () => void;
}) {
  const body = (
    <>
      <Text style={styles.metricV} allowFontScaling maxFontSizeMultiplier={1.4}>{value}</Text>
      <Text style={styles.metricL} allowFontScaling maxFontSizeMultiplier={1.4}>{label}</Text>
      {!!sub && (
        <Text style={[styles.metricS, !!onPress && styles.metricLink]} numberOfLines={2}>
          {sub}{onPress ? ' ›' : ''}
        </Text>
      )}
    </>
  );
  if (onPress) {
    return (
      <Press
        onPress={onPress}
        pressOpacity={0.7}
        style={styles.metric}
        accessibilityRole="button"
        accessibilityLabel={label + ', ' + value + (sub ? ', ' + sub : '') + '. Opens this day'}
      >
        {body}
      </Press>
    );
  }
  return (
    <View
      style={styles.metric}
      accessible
      accessibilityLabel={label + ', ' + value + (sub ? ', ' + sub : '')}
    >
      {body}
    </View>
  );
}

/**
 * The chart, and the one thing on this screen you can touch.
 *
 * It used to draw a fixed thirty columns regardless of the range, so a
 * record of eight days sat as a huddle of bars against the right edge
 * with two-thirds of the width empty — which reads as "most of your days
 * are missing" rather than "you have eight days". It now draws exactly
 * the span being looked at, so the bars always fill the width.
 *
 * Tapping a bar names the day. A column of colour is a shape; a date and
 * a number is a fact, and getting from one to the other should not
 * require going to another screen to look it up.
 */
/** the drawing height of the plot, shared by the bars and the band so
 *  the shading lines up with the columns rather than nearly lining up */
const PLOT_H = 76;

function MiniChart({
  data, span, selected, onSelect, onOpenDay,
}: {
  data: ReportData;
  span: number;
  selected: string | null;
  onSelect: (key: string | null) => void;
  /** the second tap: a bar answers in the readout, the readout opens
   *  the day itself — which is how a specific day is reached from this
   *  chart without a calendar standing around for the purpose. A WEEK
   *  opens its latest logged day. */
  onOpenDay: (dateIso: string) => void;
}) {
  /* one column per day, or per week once the span is long enough that
     a day would be a texture — the rule lives in report.ts and is
     tested there, not decided here */
  const cols = chartColumns(data.days, data.rangeEnd, span);
  const weekly = chartGrain(span) === 'week';
  const logged = cols.filter((c) => c.avg != null).length;
  const pick = cols.filter((c) => c.from === selected)[0];
  /* the top of the user's own easier third, or null when the record is
     too short for the split to mean anything */
  const easier = data.harderEasier ? data.harderEasier.boundaryLow : null;
  const name = (c: ChartColumn) =>
    weekly ? shortDate(c.from) + '–' + shortDate(c.to) : shortDate(c.from);
  const unit = weekly ? 'week' : 'day';

  /* a window with nothing in it says so in words — a row of 3pt gap
     marks is indistinguishable from a chart that failed to render */
  if (!logged) {
    return (
      <View style={styles.readout}>
        <Text style={styles.readoutText} allowFontScaling maxFontSizeMultiplier={1.3}>
          Nothing logged in this range — try All.
        </Text>
      </View>
    );
  }

  return (
    <View>
      {/* the readout sits ABOVE the bars and holds its height whether or
          not anything is selected, so tapping never shifts the layout */}
      <View style={styles.readout}>
        {pick && pick.avg != null && pick.openDate ? (
          <Press
            onPress={() => onOpenDay(pick.openDate!)}
            pressOpacity={0.7}
            style={styles.readoutOpen}
            accessibilityRole="button"
            accessibilityLabel={name(pick) + ', ' + formatScore(pick.avg)
              + ', ' + painLabel(pick.avg)
              + (weekly ? ', ' + pick.logged + (pick.logged === 1 ? ' day' : ' days') : '')
              + '. Opens ' + (weekly ? 'its latest day' : 'this day')}
          >
            <Text style={styles.readoutText} allowFontScaling maxFontSizeMultiplier={1.3}>
              <Text style={styles.readoutStrong}>{formatScore(pick.avg)}</Text>
              {'  ' + painLabel(pick.avg) + '  ·  ' + name(pick)
                + (weekly ? '  ·  ' + pick.logged + (pick.logged === 1 ? ' day' : ' days') : '')}
            </Text>
            <Text style={styles.readoutChev} allowFontScaling={false}>›</Text>
          </Press>
        ) : pick ? (
          <Text style={styles.readoutText} allowFontScaling maxFontSizeMultiplier={1.3}>
            Nothing logged {weekly ? 'in the week of ' : 'on '}{shortDate(pick.from)}
          </Text>
        ) : (
          <Text style={styles.readoutHint} allowFontScaling maxFontSizeMultiplier={1.3}>
            {weekly
              ? 'Tap a week to see it — tap its reading to open its latest day'
              : 'Tap a day to see it — tap its reading to open it'}
          </Text>
        )}
      </View>

      {/* WHICH WAY IS GOOD, drawn rather than remembered.
          A falling line reads as decline to anyone who has ever seen a
          chart, and on this one it is the opposite. So the easier end is
          shaded and the scale is written down the side: the reader does
          not have to hold "lower is better" in their head while looking.

          The band is the user's OWN easier third, not a threshold Pattern
          invented for what counts as a good day. Below seven days there
          is no third to speak of and nothing is shaded — an easier range
          drawn from four days would be a guess wearing a fact's clothes. */}
      <View style={styles.chartBody}>
        <View style={styles.gutter}>
          <Text style={styles.gutterText} allowFontScaling={false}>10</Text>
          <Text style={styles.gutterText} allowFontScaling={false}>0</Text>
        </View>
        <View style={styles.plot}>
          {easier != null && (
            <View
              pointerEvents="none"
              style={[styles.easierBand, { height: Math.max(4, (easier / 10) * PLOT_H) }]}
            />
          )}
      <View
        style={styles.chartRow}
        accessible={false}
        accessibilityLabel={
          (weekly ? 'Weekly' : 'Daily') + ' average pain. ' + logged + ' '
          + unit + 's logged, the rest are gaps.'
        }
      >
        {cols.map((c) => {
          const on = c.from === selected;
          return (
            <Pressable
              key={c.from}
              onPress={() => onSelect(on ? null : c.from)}
              style={styles.chartSlot}
              accessibilityRole="button"
              accessibilityLabel={
                name(c) + (c.avg == null ? ', nothing logged'
                  : ', average ' + formatScore(c.avg) + ' out of 10')
              }
            >
              {c.avg != null ? (
                <View
                  style={{
                    height: Math.max(3, (c.avg / 10) * PLOT_H),
                    backgroundColor: painColor(c.avg),
                    borderRadius: 2,
                    opacity: selected && !on ? 0.4 : 1,
                  }}
                />
              ) : (
                /* an unlogged day still needs something to aim at, or the
                   gaps are the one thing you cannot ask about */
                <View style={[styles.emptyCol, on && styles.emptyColOn]} />
              )}
            </Pressable>
          );
        })}
      </View>
        </View>
      </View>
      <View style={styles.chartAxis}>
        <Text style={styles.axisText}>{shortDate(cols[0].from)}</Text>
        <Text style={styles.axisText}>{shortDate(cols[cols.length - 1].to)}</Text>
      </View>
      {weekly && (
        <Text style={styles.noteLine}>
          Each bar is a week: the average of the days you logged in it. A
          week with nothing logged stays blank.
        </Text>
      )}
      {easier != null && (
        <Text style={styles.noteLine}>
          The shaded band is your own easier third — {formatScore(easier)} and
          below. Lower is better, so a bar that stops inside it is a better day.
        </Text>
      )}
    </View>
  );
}

/**
 * The change across the window, in words, with the direction named.
 *
 * "First half 4.8, second half 3.6" makes the reader do the subtraction
 * AND remember which way is good. It says it: 1.2 lower, easier. The two
 * numbers stay, because the sentence is a reading of them and a reading
 * should never replace the thing it read.
 *
 * WHITE, not the ramp. This line used to be tinted painColor(2) or
 * painColor(8) to say which way it went — and it is a DIFFERENCE between
 * two halves, not a pain value. Colour on this screen carries a score
 * or it is not a colour; a sentence wearing a hue nobody entered was
 * the one place the app broke its own rule. The words already carry
 * the direction.
 *
 * No arrow, no percentage, no comparison to last week. This screen holds
 * to being somewhere you go rather than something that reports at you,
 * and the halves comparison is a fact about a window that does not move
 * between two opens on the same day.
 */
function Direction({ first, second }: { first: number; second: number }) {
  const delta = first - second;
  const size = Math.abs(delta);
  const same = size < 0.25;
  const better = delta > 0;
  return (
    <View style={styles.direction}>
      <Text style={[styles.directionText, { color: same ? color.textSecondary : color.textPrimary }]}
        allowFontScaling maxFontSizeMultiplier={1.4}>
        {same
          ? 'About the same across this period'
          : formatScore(size) + (better ? ' lower — easier' : ' higher — harder')}
      </Text>
      <Text style={styles.directionSub} allowFontScaling maxFontSizeMultiplier={1.4}>
        First half {formatScore(first)} · second half {formatScore(second)}
      </Text>
    </View>
  );
}

/** how much of the record to look at. "All" is the whole thing rather
 *  than a fixed number, so a long record is never silently cropped. */
/* Week, Month, 3 months, All — one control, four widths of the same
   record. 3 months went once for crowding the segment; it is back
   because a record past two months draws WEEKS at All, and a person
   who wants their days back needs a range that still shows them. It is
   offered only once the record is longer than it (see `ranges`), so a
   short record never sees a fourth segment. */
const RANGES: { key: string; label: string; days: number }[] = [
  { key: 'w', label: 'Week', days: 7 },
  { key: 'm', label: 'Month', days: 30 },
  { key: 'q', label: '3 months', days: 90 },
  { key: 'a', label: 'All', days: 0 },
];

/**
 * A list that shows its first few and admits how many it is holding back.
 *
 * "Show all 11" rather than "Show more": a reader who cannot tell whether
 * two rows are hidden or twenty cannot tell whether the list is worth
 * opening, and a body-area tally that silently stops at eight is a
 * frequency count that quietly lies about its own tail.
 */
function FoldedList({
  items, limit = 4, label, bars,
}: {
  /* frac and tint are what turn a row into a bar. A list without them
     stays a list — the dated ones (events, what you tried) have no
     magnitude to draw, and a bar there would be decoration. */
  items: { key: string; left: string; right: string; frac?: number; tint?: string }[];
  limit?: number;
  label: string;
  bars?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, limit);
  return (
    <>
      {shown.map((it) => (bars ? (
        <BarRow
          key={it.key}
          label={it.left}
          right={it.right}
          frac={it.frac || 0}
          tint={it.tint || color.textPrimary}
        />
      ) : (
        <Row key={it.key} left={it.left} right={it.right} />
      )))}
      {items.length > limit && (
        <Press
          onPress={() => setOpen(!open)}
          pressOpacity={0.7}
          style={styles.foldRow}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityLabel={open
            ? 'Show fewer ' + label
            : 'Show all ' + items.length + ' ' + label}
        >
          <Text style={styles.foldText}>
            {open ? 'Show fewer' : 'Show all ' + items.length}
          </Text>
        </Press>
      )}
    </>
  );
}

/**
 * One section, in a card — the grammar Apple Health's Summary uses.
 *
 * A flat run of headings on a black ground made every section the same
 * weight as every other, so the eye had to read the type scale to find
 * the boundaries. A card draws the boundary instead: the title belongs
 * to what is inside it, and a section can be skipped by looking rather
 * than by reading.
 *
 * The note goes in the card too. Every one of these screens carries a
 * sentence saying what the numbers above it do not mean, and that
 * sentence is worthless anywhere but touching the thing it qualifies.
 */
function Card({
  title, note, children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      {children}
      {!!note && (
        <Text style={styles.noteLine} allowFontScaling maxFontSizeMultiplier={1.4}>
          {note}
        </Text>
      )}
    </View>
  );
}

/* ── the drawing primitives ───────────────────────────────────
   Four shapes cover every section on this screen, and all four are plain
   Views. No SVG, no charting library: a bar is a box with a width, and a
   dependency that needs a native build would have been unshippable over
   the air anyway.

   Proportions come out as flex weights rather than percentage strings,
   because a bar built from two flex children divides the width it is
   actually given — no measurement, no rounding drift at the right edge,
   and correct at any Dynamic Type size. */

/** the smallest useful fraction: a real but tiny count must still draw */
const FLOOR = 0.035;

/** one horizontal bar — the shape behind almost every list here */
function Bar({ frac, tint }: { frac: number; tint: string }) {
  const f = Math.max(FLOOR, Math.min(1, frac || 0));
  return (
    <View style={styles.barTrack}>
      <View style={[styles.barFill, { flexGrow: f, backgroundColor: tint }]} />
      <View style={{ flexGrow: Math.max(0.0001, 1 - f), flexBasis: 0 }} />
    </View>
  );
}

/** a labelled bar row: what it is, how big, and the figure behind it */
function BarRow({
  label, sub, right, frac, tint,
}: {
  label: string; sub?: string; right: string; frac: number; tint: string;
}) {
  return (
    <View style={styles.barRow} accessible accessibilityLabel={label + ', ' + right}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={1} allowFontScaling maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        <Text style={styles.barRight} allowFontScaling maxFontSizeMultiplier={1.3}>{right}</Text>
      </View>
      <Bar frac={frac} tint={tint} />
      {!!sub && <Text style={styles.barSub}>{sub}</Text>}
    </View>
  );
}

/** several proportions in ONE track — a whole of something, divided */
function Stack({ segments }: { segments: { key: string; n: number; tint: string }[] }) {
  const total = segments.reduce((t, x) => t + x.n, 0) || 1;
  return (
    <View style={styles.stackTrack}>
      {segments.filter((x) => x.n > 0).map((x) => (
        <View key={x.key} style={{ flexGrow: x.n / total, flexBasis: 0, backgroundColor: x.tint }} />
      ))}
    </View>
  );
}

/** a swatch and a name — what a stack's colours mean, said in words,
 *  because colour on its own is not information anyone can rely on */
function Key({ items }: { items: { key: string; label: string; tint: string; n: number }[] }) {
  return (
    <View style={styles.keyWrap}>
      {items.map((i) => (
        <View key={i.key} style={styles.keyItem} accessible
          accessibilityLabel={i.label + ', ' + i.n + (i.n === 1 ? ' day' : ' days')}>
          <View style={[styles.keyDot, { backgroundColor: i.tint }]} />
          <Text style={styles.keyText} allowFontScaling maxFontSizeMultiplier={1.3}>
            {i.label} {i.n}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** small columns — used only for ability, which is not pain and so never
 *  borrows the pain ramp's colours */
function Columns({ values, tint }: { values: { key: string; v: number }[]; tint: string }) {
  return (
    <View style={styles.colRow}>
      {values.map((x) => (
        <View key={x.key} style={styles.colSlot}>
          <View style={{
            height: Math.max(3, (x.v / 10) * 54), backgroundColor: tint, borderRadius: 2,
          }} />
        </View>
      ))}
    </View>
  );
}

function Row({ left, right }: { left: string; right?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.bodyText} numberOfLines={2}>{left}</Text>
      {!!right && <Text style={styles.rowRight}>{right}</Text>}
    </View>
  );
}

/**
 * Where the record was cut, drawn on the 0–10 scale it was cut from.
 *
 * "The highest and lowest third, middle third set aside" is four lines of
 * prose describing a shape. The shape is two marked regions on a ruler
 * with a gap between them, which is one glance — and it also makes plain
 * that the boundaries are the user's own spread rather than fixed grades.
 */
function Split({ low, high }: { low: number; high: number }) {
  return (
    <View style={styles.splitWrap}>
      <View style={styles.splitTrack}>
        <View style={[styles.splitSeg, {
          flexGrow: Math.max(0.02, low / 10), backgroundColor: painColor(low),
        }]} />
        <View style={{ flexGrow: Math.max(0.02, (high - low) / 10), flexBasis: 0 }} />
        <View style={[styles.splitSeg, {
          flexGrow: Math.max(0.02, (10 - high) / 10), backgroundColor: painColor(high),
        }]} />
      </View>
      <View style={styles.splitAxis}>
        <Text style={styles.axisText}>easiest · {formatScore(low)} and below</Text>
        <Text style={styles.axisText}>{formatScore(high)} and above · hardest</Text>
      </View>
    </View>
  );
}

/** one end of the record: how many days, and what was recorded on them */
function End({ title, when, e }: { title: string; when: string; e: EndOfRecord }) {
  const locs = e.locations.slice(0, 4).map((l) => l.name + ' (' + l.days + ')').join(' · ');
  const qs = e.qualities.slice(0, 4).map((q) => q.name).join(' · ');
  return (
    <View style={styles.endCard}>
      <Text style={styles.endTitle}>{title}</Text>
      <Text style={styles.endWhen}>
        {e.days} {e.days === 1 ? 'day' : 'days'} · {when} · averaging {formatScore(e.avg)}
      </Text>
      {!!locs && <Text style={styles.endLine}>Where: {locs}</Text>}
      {!!qs && <Text style={styles.endLine}>Described as: {qs}</Text>}
    </View>
  );
}

/** the intervention line, showing whichever response format was recorded.
 *  A 0–10 impression and a four-level answer are different questions, so
 *  neither is converted into the other for display. */
function outcomeOf(ev: PainEvent): string {
  if (ev.resp) return RESPONSE_LABELS[ev.resp as Response];
  if (ev.helped != null) return ev.helped + '/10';
  return '';
}

/**
 * The two groups of a health comparison, drawn.
 *
 * Bar LENGTH is the group's mean pain; bar COLOUR is painColor of that
 * same mean — colour stays a pain value, and the factor (sleep, steps,
 * workout minutes) lives entirely in the label text, never in the ramp.
 * Every bar carries its n, because a bar without its sample size is a
 * claim wearing a chart's clothes.
 */
function GroupBars({ a }: { a: HealthAssociation }) {
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
                + (a.kind === 'workoutVsNextMorning'
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

/** one digest sentence: the claim, the numbers, the caveat. Sentence
 *  first and biggest — the Health pattern — with no glyph, no arrow and
 *  no colour: colour means pain, and none of these is a pain value. */
function DigestRow({ card, first }: { card: DigestCard; first: boolean }) {
  return (
    <View
      style={[digestStyles.row, !first && digestStyles.rowDivider]}
      accessible
      accessibilityLabel={card.title + ' ' + card.evidence
        + (card.caveat ? ' ' + card.caveat : '')}
    >
      <Text style={digestStyles.title} allowFontScaling maxFontSizeMultiplier={1.4}>
        {card.title}
      </Text>
      <Text style={digestStyles.evidence} allowFontScaling maxFontSizeMultiplier={1.4}>
        {card.evidence}
      </Text>
      {!!card.caveat && (
        <Text style={digestStyles.caveat} allowFontScaling maxFontSizeMultiplier={1.4}>
          {card.caveat}
        </Text>
      )}
    </View>
  );
}

const digestStyles = StyleSheet.create({
  row: { paddingVertical: 12, gap: 5 },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  title: {
    color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 23,
  },
  evidence: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 18,
    fontVariant: ['tabular-nums'],
  },
  caveat: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18 },
});

export default function TrendsScreen({
  entries, events, func, goalText, todayIso, onOpenDay, onSpanChange,
  healthNoticed, protocol, onShare, sharing,
}: TrendsScreenProps) {
  /* All by default. The first look at this chart must show every logged
     day — a fixed window that happens to miss the days someone logged
     reads as "nothing here", which is exactly the bug report it
     generated. Narrower ranges are for leaning in, not landing on. */
  const [rangeKey, setRangeKey] = useState('a');
  /* the descriptive tail, folded — counts of places, words and times
     are the record's appendix, not its findings */
  /* the two folds: the calendar inside Your pain, and the tables
     inside Your record. Session state, not a preference — a person who
     opened the tables yesterday has not asked to see them every day. */
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  /* "All" measures from the first day ever logged, so the chart spans the
     record rather than a guess at how long it might be */
  /* The chosen range is a CEILING, not the width. Draw thirty columns at
     a fortnight-old record and the bars huddle against the right edge
     with sixteen empty slots to their left — which is the exact
     off-to-the-side misreading this chart had before ranges existed,
     reintroduced for every range except All. So the span is clamped to
     the record: Month on two weeks of data draws two weeks, full width.
     The floor of 7 keeps a three-day record from becoming three enormous
     bars. */
  /* how long the record actually is, in days since the first entry */
  const spanRecord = useMemo(() => {
    const keys = Object.keys(entries).sort();
    if (!keys.length) return 7;
    const first = dateFromISO(keys[0]).getTime();
    const last = dateFromISO(todayIso).getTime();
    return Math.max(7, Math.round((last - first) / 86400000) + 1);
  }, [entries, todayIso]);

  const spanDays = useMemo(() => {
    const chosen = RANGES.filter((r) => r.key === rangeKey)[0] || RANGES[1];
    const ceiling = chosen.days > 0 ? chosen.days : spanRecord;
    return Math.max(7, Math.min(ceiling, spanRecord));
  }, [rangeKey, spanRecord]);

  const data = useMemo(
    () => buildReportData({ entries, events, func, goalText, todayIso, windowDays: spanDays }),
    [entries, events, func, goalText, todayIso, spanDays]
  );

  useEffect(() => { if (onSpanChange) onSpanChange(spanDays); }, [spanDays, onSpanChange]);

  if (!data) {
    return (
      <View style={[styles.page, styles.emptyWrap]}>
        <Text style={styles.empty}>
          Nothing logged yet. Check in once and this fills in from your own
          entries — nothing here is ever filled in for you.
        </Text>
      </View>
    );
  }

  /* a fixed range longer than the record shows exactly what All shows —
     a range that changes nothing is not offered, and when that leaves one
     the control itself is not drawn either */
  const ranges = RANGES.filter((r) => r.days === 0 || r.days < spanRecord);

  /* the digest: the record as sentences, and what a check-in is buying.
     Both come back empty until their gates clear, and empty sections are
     not drawn — silence is a valid digest. */
  const says = recordSays(data);
  const buys = checkinBuys(protocol || null, entries, todayIso);

  const tried = data.events.filter((ev) => ev.intervention || ev.resp || ev.helped != null);

  /* Days grouped by the SAME five words the slider, the day detail and
     the report use. A sixth vocabulary invented for one chart is how two
     screens end up disagreeing about what a 4 is called. */
  const feltBands = useMemo(() => {
    /* the label is ASKED FOR, never copied. A hardcoded 'Moderate' beside
       a painLabel() that had been reworded would match nothing, and those
       days would leave the chart without leaving an error — the total
       would just quietly be short. */
    return BAND_AT
      .map((at) => {
        const label = painLabel(at);
        return {
          key: 'b' + at,
          label,
          tint: painColor(at),
          n: data.days.filter((d) => painLabel(d.avg) === label).length,
        };
      })
      .filter((b) => b.n > 0);
  }, [data.days]);

  /* the four responses, counted. The legacy 0–10 impression is NOT folded
     in: a number and a four-level answer are different questions, and no
     cutpoint between them would be anything but invented. */
  const outcomes = useMemo(() => {
    const order: Response[] = ['better', 'same', 'worse', 'unsure'];
    const tints: Record<Response, string> = {
      better: '#E5E5EA', same: color.textTertiary,
      worse: color.bgSegmentActive, unsure: color.borderControl,
    };
    return order
      .map((r) => ({
        key: r,
        label: RESPONSE_LABELS[r],
        tint: tints[r],
        n: tried.filter((ev) => ev.resp === r).length,
      }))
      .filter((o) => o.n > 0);
  }, [tried]);

  /* FOUR CARDS. Eleven surfaces at one radius carried the hierarchy by
     order alone, and the record's appendix — counts of places, words
     and times — sat at the same weight as the record itself. Now: the
     record (Your pain, with the sentences that read it and the calendar
     behind a fold), the one place a claim may appear (Worth watching),
     the appendix (Your record, face and details), and the handoff.
     Nothing was removed; the tables are one tap further in. */
  const he = data.harderEasier;
  const otherGroups = (healthNoticed?.groups || []).filter((a) => a !== healthNoticed?.best);
  const bestCopy = healthNoticed?.best ? associationCopy(healthNoticed.best) : null;
  const healthWaiting = healthNoticed ? healthNoticed.progress : [];
  const watching = !!bestCopy || !!(healthNoticed && healthNoticed.fading.length)
    || otherGroups.length > 0 || buys.length > 0 || healthWaiting.length > 0;

  return (
    <View style={styles.page}>
      <Text style={styles.sub} allowFontScaling maxFontSizeMultiplier={1.5}>
        What you’ve recorded, {fmtReportDate(data.rangeStart)} – {fmtReportDate(data.rangeEnd)}.
        {data.limited && (
          <Text style={styles.subCaveat}>
            {'  '}Still a short record — {data.loggedDays}{' '}
            {data.loggedDays === 1 ? 'day' : 'days'} logged, so changes over time
            aren’t worth reading much into yet.
          </Text>
        )}
      </Text>

      {/* ── 1. your pain ─────────────────────────────────────
          The record itself leads: the chart, the two figures, the
          sentences that read it, and every day as a calendar behind a
          fold. A calendar square opens its day. */}
      <Card title={data.limited ? 'Pain recorded so far' : 'Your pain'}>
        <View style={styles.painHead}>
          <Text style={styles.painAvg} allowFontScaling maxFontSizeMultiplier={1.3}>
            {formatScore(data.avg)}
            <Text style={styles.painAvgUnit}>  average · {painLabel(data.avg)}</Text>
          </Text>
          <Text style={styles.painDays} allowFontScaling maxFontSizeMultiplier={1.3}>
            {data.loggedDays} {data.loggedDays === 1 ? 'day' : 'days'} recorded
          </Text>
        </View>
        {ranges.length > 1 && (
          <View style={styles.segment}>
            {ranges.map((r) => {
              const on = r.key === rangeKey;
              return (
                <Pressable
                  key={r.key}
                  onPress={() => { setRangeKey(r.key); setPicked(null); }}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={r.label}
                  style={({ pressed }) => [
                    styles.segItem, on && styles.segItemOn, pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.segText, on && styles.segTextOn]}
                    allowFontScaling maxFontSizeMultiplier={1.2} numberOfLines={1}>
                    {r.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <MiniChart
          data={data}
          span={spanDays}
          selected={picked}
          onSelect={setPicked}
          onOpenDay={onOpenDay}
        />
        <Text style={styles.noteLine}>
          Days without check-ins stay blank — nothing is filled in for a day you
          didn’t log.
        </Text>
        {!!data.halves && (
          <Direction first={data.halves.first} second={data.halves.second} />
        )}

        {/* the extremes, as doors — a summary that names a day opens it */}
        <View style={styles.extremes}>
          <Press
            onPress={() => onOpenDay(data.lowestDayDate)}
            pressOpacity={0.7}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={'Lowest day, ' + formatScore(data.lowestDay)
              + ', ' + shortDate(data.lowestDayDate) + '. Opens this day'}
          >
            <Text style={styles.extremeText} allowFontScaling maxFontSizeMultiplier={1.3}>
              Lowest {formatScore(data.lowestDay)} · {shortDate(data.lowestDayDate)} ›
            </Text>
          </Press>
          <Press
            onPress={() => onOpenDay(data.highestDayDate)}
            pressOpacity={0.7}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={'Highest day, ' + formatScore(data.highestDay)
              + ', ' + shortDate(data.highestDayDate) + '. Opens this day'}
          >
            <Text style={styles.extremeText} allowFontScaling maxFontSizeMultiplier={1.3}>
              Highest {formatScore(data.highestDay)} · {shortDate(data.highestDayDate)} ›
            </Text>
          </Press>
        </View>

        {/* the record as sentences — each one a statistic that already
            cleared its named gate; none rates today or compares opens */}
        {says.length > 0 && (
          <View style={styles.subBlock}>
            {says.map((c, i) => <DigestRow key={c.key} card={c} first={i === 0} />)}
          </View>
        )}

        {/* every day, as a calendar, behind a fold — the way to any day,
            one tap further in so the chart stays the first thing read */}
        <View style={styles.subBlock}>
          {!calendarOpen ? (
            <Press
              onPress={() => setCalendarOpen(true)}
              pressOpacity={0.7}
              style={styles.more}
              accessibilityRole="button"
              accessibilityLabel="Show the calendar of every day"
            >
              <Text style={styles.moreText}>Show the calendar ›</Text>
            </Press>
          ) : (
            <MapScreen entries={entries} onDayPress={onOpenDay} flat />
          )}
        </View>
      </Card>

      {/* ── 2. worth watching ───────────────────────────────
          The one card on which anything like a claim may appear, and
          only after the gates: the strongest Health association, a
          faded one said out loud, comparisons whose groups formed but
          did not differ, and what the focus is still collecting. Absent
          when none of that exists — silence is a valid card. */}
      {watching && (
        <Card
          title="Worth watching"
          note="An association here is a pattern in what you recorded, not proof of what caused what. Groups are your own lowest and highest third, the middle third left out. Nothing on this card moves on its own — only when you add a check-in."
        >
          {bestCopy && healthNoticed && healthNoticed.best ? (
            <>
              <Text style={styles.noticeTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                {bestCopy.title}
              </Text>
              <Text style={styles.noticeBody} allowFontScaling maxFontSizeMultiplier={1.4}>
                {bestCopy.body}
              </Text>
              <GroupBars a={healthNoticed.best} />
              <Text style={styles.noticeMeta} allowFontScaling maxFontSizeMultiplier={1.4}>
                {bestCopy.sample}
                {healthNoticed.best.from && healthNoticed.best.to
                  ? ' ' + fmtReportDate(healthNoticed.best.from) + ' – '
                    + fmtReportDate(healthNoticed.best.to) + '.'
                  : ''}
              </Text>
              <Text style={styles.noticeMeta} allowFontScaling maxFontSizeMultiplier={1.4}>
                {bestCopy.timing} Days without Health data are left out, never counted
                as anything.
              </Text>
              {healthNoticed.best.basis === 'inBed' && (
                <Text style={styles.noticeMeta} allowFontScaling maxFontSizeMultiplier={1.4}>
                  {IN_BED_NOTE}
                </Text>
              )}
            </>
          ) : healthNoticed && healthNoticed.fading.length > 0 ? (
            <Text style={styles.noticeBody} allowFontScaling maxFontSizeMultiplier={1.4}>
              {fadedCopy(healthNoticed.fading[0])}
            </Text>
          ) : null}

          {otherGroups.map((a) => {
            const w = groupLabels(a.kind);
            return (
              <View key={a.kind} style={styles.subBlock}>
                <Text style={styles.subBlockTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                  {w.factor}, against your record
                </Text>
                <Text style={styles.noticeBody} allowFontScaling maxFontSizeMultiplier={1.4}>
                  No meaningful difference in {w.outcome} between these groups so
                  far — that is a finding about these {a.pairedDays} days, not a
                  failure of them.
                </Text>
                <GroupBars a={a} />
                <Text style={styles.noticeMeta} allowFontScaling maxFontSizeMultiplier={1.4}>
                  {w.timing}
                </Text>
              </View>
            );
          })}

          {(buys.length > 0 || healthWaiting.length > 0) && (
            <View style={styles.subBlock}>
              <Text style={styles.subBlockTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                Still collecting
              </Text>
              {buys.map((c, i) => <DigestRow key={c.key} card={c} first={i === 0} />)}
              {/* the Health comparisons short of their gate: the count,
                  and what one more paired day takes — so a person who
                  logs at lunch learns that a morning check-in is what
                  sleep is waiting for, instead of waiting forever */}
              {healthWaiting.map((p, i) => {
                const c = progressCopy(p);
                return (
                  <DigestRow
                    key={'h.' + p.kind}
                    card={{ key: 'h.' + p.kind, title: c.title, evidence: c.evidence, caveat: c.caveat }}
                    first={i === 0 && buys.length === 0}
                  />
                );
              })}
            </View>
          )}
        </Card>
      )}

      {/* ── 3. your record ──────────────────────────────────
          The appendix: how the days split by band, the most recorded
          places and words, and behind a fold the whole of it — what you
          noticed, the two ends, the tables, the events. Counts, never
          findings, and the card says so inside itself. */}
      <Card
        title="Your record"
        note="Counts of what you recorded — where, which words, when, what you noticed — and nothing compared to last week. What you noticed is your own read of a day: a thing only lands there on days you already suspected it, so there are no days without it to weigh against."
      >
        {feltBands.length > 0 && (
          <>
            <Text style={styles.subhead}>Days like this</Text>
            <Stack segments={feltBands.map((b) => ({ key: b.key, n: b.n, tint: b.tint }))} />
            <Key items={feltBands} />
            <Text style={styles.noteLine}>
              Your {data.days.length} logged {data.days.length === 1 ? 'day' : 'days'},
              grouped by how they averaged. This is the figure here that rises as
              things get easier.
            </Text>
          </>
        )}
        {data.locations.length > 0 && (
          <Text style={styles.profileLine} allowFontScaling maxFontSizeMultiplier={1.4}>
            <Text style={styles.profileKey}>Most recorded areas   </Text>
            {data.locations.slice(0, 3).map((l) => l.name).join(' · ')}
          </Text>
        )}
        {data.qualities.length > 0 && (
          <Text style={styles.profileLine} allowFontScaling maxFontSizeMultiplier={1.4}>
            <Text style={styles.profileKey}>Most used words   </Text>
            {data.qualities.slice(0, 3).map((q) => q.name).join(' · ')}
          </Text>
        )}
        <Text style={styles.profileLine} allowFontScaling maxFontSizeMultiplier={1.4}>
          <Text style={styles.profileKey}>The record   </Text>
          {data.loggedDays} {data.loggedDays === 1 ? 'day' : 'days'} · {data.totalCheckins}{' '}
          {data.totalCheckins === 1 ? 'check-in' : 'check-ins'}
        </Text>

        {!recordOpen ? (
          <Press
            onPress={() => setRecordOpen(true)}
            pressOpacity={0.7}
            style={styles.more}
            accessibilityRole="button"
            accessibilityLabel="Show everything: what you noticed, the hardest and easiest days, the tables and the events"
          >
            <Text style={styles.moreText}>Show details ›</Text>
          </Press>
        ) : (
          <>
            {(data.flagged.worse.length > 0 || data.flagged.better.length > 0) && (
              <View style={styles.subBlock}>
                <Text style={styles.subBlockTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                  What you noticed
                </Text>
                {data.flagged.worse.length > 0 && (
                  <>
                    <Text style={styles.subhead}>Made it harder</Text>
                    <FoldedList
                      bars
                      label="things"
                      items={data.flagged.worse.map((f) => ({
                        key: 'w' + f.id,
                        left: f.name,
                        right: f.days + (f.days === 1 ? ' day' : ' days'),
                        frac: f.days / Math.max(1, data.flagged.worse[0].days),
                        tint: color.textPrimary,
                      }))}
                    />
                  </>
                )}
                {data.flagged.better.length > 0 && (
                  <>
                    <Text style={styles.subhead}>Helped</Text>
                    <FoldedList
                      bars
                      label="things"
                      items={data.flagged.better.map((f) => ({
                        key: 'b' + f.id,
                        left: f.name,
                        right: f.days + (f.days === 1 ? ' day' : ' days'),
                        frac: f.days / Math.max(1, data.flagged.better[0].days),
                        tint: color.textPrimary,
                      }))}
                    />
                  </>
                )}
              </View>
            )}

            {!!he && (
              <View style={styles.subBlock}>
                <Text style={styles.subBlockTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                  Hardest and easiest days
                </Text>
                <Split low={he.boundaryLow} high={he.boundaryHigh} />
                <End
                  title="Hardest days"
                  when={formatScore(he.boundaryHigh) + ' and above'}
                  e={he.harder}
                />
                <End
                  title="Easiest days"
                  when={formatScore(he.boundaryLow) + ' and below'}
                  e={he.easier}
                />
                {he.contrasts.length > 0 && (
                  <>
                    <Text style={styles.subhead}>What was different</Text>
                    {he.contrasts.map((c) => (
                      <View
                        key={c.kind + c.id}
                        style={styles.contrastRow}
                        accessible
                        accessibilityLabel={c.name + ': on ' + c.harderDays + ' of '
                          + he.harder.days + ' hardest days, '
                          + c.easierDays + ' of ' + he.easier.days + ' easiest'}
                      >
                        <Text style={styles.contrastName} allowFontScaling maxFontSizeMultiplier={1.3}>
                          {c.name}
                        </Text>
                        <Text style={styles.contrastCount} allowFontScaling maxFontSizeMultiplier={1.3}>
                          {c.harderDays}/{he.harder.days} hardest ·{' '}
                          {c.easierDays}/{he.easier.days} easiest
                        </Text>
                      </View>
                    ))}
                  </>
                )}
                <Text style={styles.noteLine}>
                  The highest and lowest third of your logged days, with the middle
                  third ({he.middleDays}{he.middleDays === 1 ? ' day' : ' days'}) set
                  aside. This describes where the pain was and how you described it
                  — not what caused it.
                </Text>
              </View>
            )}

            {(data.locations.length > 0 || data.qualities.length > 0 || data.timeOfDay.length > 0) && (
              <View style={styles.subBlock}>
                {data.locations.length > 0 && (
                  <>
                    <Text style={styles.subhead}>Where</Text>
                    <FoldedList
                      bars
                      label="body areas"
                      items={data.locations.map((l) => ({
                        key: l.id,
                        left: l.name,
                        right: l.days + (l.days === 1 ? ' day' : ' days'),
                        frac: l.days / Math.max(1, data.locations[0].days),
                        tint: color.textPrimary,
                      }))}
                    />
                  </>
                )}
                {data.qualities.length > 0 && (
                  <>
                    <Text style={styles.subhead}>Described as</Text>
                    <FoldedList
                      bars
                      label="words"
                      items={data.qualities.map((q) => ({
                        key: q.id,
                        left: q.name,
                        right: '×' + q.count,
                        frac: q.count / Math.max(1, data.qualities[0].count),
                        tint: color.textPrimary,
                      }))}
                    />
                  </>
                )}
                {data.timeOfDay.length > 0 && (
                  <>
                    <Text style={styles.subhead}>Time of day</Text>
                    {data.timeOfDay.map((b) => (
                      <BarRow
                        key={b.key}
                        label={b.label}
                        sub={b.range + ' · ' + b.checkins
                          + (b.checkins === 1 ? ' check-in' : ' check-ins')}
                        right={formatScore(b.avg)}
                        frac={b.avg / 10}
                        tint={painColor(b.avg)}
                      />
                    ))}
                    <Text style={styles.noteLine}>
                      These are the averages of when you happened to check in — not
                      a claim about when your pain is worst.
                    </Text>
                  </>
                )}
              </View>
            )}

            {data.events.length > 0 && (
              <View style={styles.subBlock}>
                <Text style={styles.subBlockTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                  Events
                </Text>
                {outcomes.length > 0 && (
                  <>
                    <Stack segments={outcomes.map((o) => ({ key: o.key, n: o.n, tint: o.tint }))} />
                    <Key items={outcomes} />
                  </>
                )}
                <FoldedList
                  label="events"
                  items={data.events.slice().reverse().map((ev, i) => ({
                    key: ev.id != null ? 'e' + ev.id : 'ei' + i,
                    left: shortDate(ev.date) + ' ' + fmtClock(ev.h) + ' · '
                      + (ev.intervention
                        ? INTERVENTIONS[ev.intervention] || ev.intervention
                        : EVENT_LABELS[ev.kind])
                      + (ev.text ? ' — ' + ev.text : ''),
                    right: outcomeOf(ev),
                  }))}
                />
                <Text style={styles.noteLine}>
                  Events sit alongside your check-ins. Their timing doesn’t prove
                  they caused a change
                  {tried.length > 0
                    ? '; impressions are your own, afterwards, recorded as you gave them.'
                    : '.'}
                </Text>
              </View>
            )}

            <Press
              onPress={() => setRecordOpen(false)}
              pressOpacity={0.7}
              style={styles.more}
              accessibilityRole="button"
              accessibilityLabel="Hide the details"
            >
              <Text style={styles.moreText}>Show less</Text>
            </Press>
          </>
        )}
      </Card>

      {/* ── 4. the handoff ──────────────────────────────────
          The PDF's natural home: at the foot, as the destination of
          everything above it. */}
      {!!onShare && (
        <Card title="Share with your clinician">
          <Text style={styles.bodyText} allowFontScaling maxFontSizeMultiplier={1.4}>
            A PDF of this record — your background, the numbers above, and what
            they do and don’t mean. Made on this iPhone, sent only where you
            send it, and it says on its face that it is self-recorded and not a
            diagnosis.
          </Text>
          <Press
            onPress={onShare}
            pressOpacity={0.8}
            style={styles.shareBtn}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!sharing }}
            accessibilityLabel={sharing ? 'Preparing the PDF' : 'Create the PDF and open the share sheet'}
          >
            <Text style={styles.shareBtnText} allowFontScaling maxFontSizeMultiplier={1.3}>
              {sharing ? 'Preparing…' : 'Create report'}
            </Text>
          </Press>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /* the same gutter Today and the Map sit in. This screen used to run
     full-bleed, which made it the one page whose text started somewhere
     different from every other page's. */
  page: { paddingHorizontal: size.pageX, paddingTop: 2 },
  emptyWrap: { paddingTop: 8 },
  empty: { color: color.textSecondary, fontSize: font.body, lineHeight: 24 },
  sub: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21 },
  subCaveat: { color: color.textTertiary },
  /* a second thought inside a card, ruled off from the first */
  subBlock: {
    marginTop: 18, paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  subBlockTitle: {
    color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600',
    marginBottom: 10,
  },
  /* Health's Summary grammar: a surface per section, the title inside
     it, the qualifying sentence inside it too. Sections are told apart by
     their edges rather than by reading the type scale. */
  card: {
    backgroundColor: color.bgSurface,
    borderRadius: radius.card, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderDivider,
    padding: 16,
    marginTop: 14,
  },
  cardTitle: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.2, marginBottom: 10,
  },
  rangeLine: { color: color.textSecondary, fontSize: font.footnote, marginBottom: 10, marginTop: -4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    flexGrow: 1, flexBasis: '30%', borderRadius: 12, borderCurve: 'continuous', padding: 10,
    backgroundColor: color.bgSheet, gap: 1,
  },
  metricV: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricL: { color: color.textSecondary, fontSize: font.footnote },
  metricS: { color: color.textTertiary, fontSize: font.footnote },
  /* the date under an openable figure wears the tint every other link
     wears — it is the tappable part's own signal, not decoration */
  metricLink: { color: color.tint, fontWeight: '600' },
  /* ── the drawn shapes ──────────────────────────────────── */
  barRow: { gap: 5, paddingVertical: 7 },
  barHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  barLabel: {
    flex: 1, color: color.textPrimary, fontSize: font.subheadline, lineHeight: 20,
  },
  barRight: {
    color: color.textSecondary, fontSize: font.subheadline, fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  barSub: { color: color.textTertiary, fontSize: font.footnote },
  barTrack: {
    flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden',
    backgroundColor: color.bgSegmentTrack,
  },
  barFill: { flexBasis: 0, borderRadius: 4 },
  stackTrack: {
    flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden',
    backgroundColor: color.bgSegmentTrack, marginTop: 2,
  },
  keyWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyDot: { width: 9, height: 9, borderRadius: 5 },
  keyText: {
    color: color.textSecondary, fontSize: font.footnote, fontVariant: ['tabular-nums'],
  },
  colRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 58,
    marginTop: 14,
  },
  colSlot: { flex: 1, justifyContent: 'flex-end' },
  splitWrap: { marginBottom: 14 },
  splitTrack: {
    flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden',
    backgroundColor: color.bgSegmentTrack,
  },
  splitSeg: { flexBasis: 0 },
  splitAxis: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 8,
  },
  direction: { marginTop: 12, gap: 2 },
  directionText: { fontSize: font.title3, fontWeight: '700', letterSpacing: -0.2 },
  directionSub: {
    color: color.textTertiary, fontSize: font.footnote, fontVariant: ['tabular-nums'],
  },
  /* the plot and the scale beside it */
  chartBody: { flexDirection: 'row', gap: 7 },
  gutter: { height: 80, paddingTop: 4, justifyContent: 'space-between', width: 18 },
  gutterText: {
    color: color.textTertiary, fontSize: 10, textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  plot: { flex: 1, justifyContent: 'flex-end' },
  /* the easier end of the scale, marked so the direction is seen rather
     than remembered */
  easierBand: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: '#232325', borderRadius: 3,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#48484A',
  },
  chartRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 80, paddingTop: 4,
  },
  chartSlot: { flex: 1, justifyContent: 'flex-end', minHeight: 44 },
  /* a gap is still a target: without one, the days you did not log are the
     only ones you cannot ask about */
  emptyCol: {
    height: 3, borderRadius: 2, backgroundColor: color.borderDivider,
  },
  emptyColOn: { backgroundColor: color.textTertiary, height: 5 },
  /* the readout as a button: the text it always showed, plus the
     chevron that says it goes somewhere */
  readoutOpen: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readoutChev: { color: color.textTertiary, fontSize: 17, marginTop: -1 },
  readout: { height: 26, justifyContent: 'center' },
  readoutText: { color: color.textSecondary, fontSize: font.subheadline },
  readoutStrong: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  readoutHint: { color: color.textTertiary, fontSize: font.footnote },
  segment: {
    flexDirection: 'row', gap: 3, padding: 3, borderRadius: 12, borderCurve: 'continuous',
    backgroundColor: color.bgSheet, marginBottom: 12,
  },
  segItem: {
    flex: 1, minHeight: 34, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  segItemOn: { backgroundColor: color.bgSegmentActive },
  segText: { color: color.textSecondary, fontSize: font.footnote, fontWeight: '600' },
  segTextOn: { color: color.textPrimary },
  chartAxis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { color: color.textTertiary, fontSize: font.footnote },
  noteLine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 8 },
  /* the noticed card — the same type scale as everything else on this
     screen; a finding earns no bigger font than a fact */
  noticeTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  noticeBody: {
    color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21, marginTop: 6,
  },
  noticeMeta: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  foldRow: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  foldText: { color: color.tint, fontSize: font.subheadline, fontWeight: '500' },
  contrastRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, minHeight: 34,
  },
  contrastName: { flexShrink: 1, color: color.textPrimary, fontSize: font.subheadline },
  contrastCount: {
    color: color.textSecondary, fontSize: font.footnote,
    fontVariant: ['tabular-nums'],
  },
  subhead: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    marginTop: 12, marginBottom: 2,
  },
  bodyText: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21, flexShrink: 1 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  rowRight: {
    color: color.textSecondary, fontSize: font.subheadline, fontVariant: ['tabular-nums'],
  },
  bandMain: { flexShrink: 1, gap: 1 },
  bandRange: {
    color: color.textTertiary, fontSize: font.footnote, fontVariant: ['tabular-nums'],
  },
  endCard: {
    borderRadius: radius.card, borderCurve: 'continuous', padding: 12, marginBottom: 8,
    backgroundColor: color.bgSheet, gap: 3,
  },
  endTitle: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  endWhen: {
    color: color.textSecondary, fontSize: font.footnote, fontVariant: ['tabular-nums'],
  },
  endLine: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },
  more: { minHeight: 40, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  moreText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  painHead: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginBottom: 10,
  },
  painAvg: {
    color: color.textPrimary, fontSize: font.title2, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  painAvgUnit: { color: color.textSecondary, fontSize: font.footnote, fontWeight: '500' },
  painDays: { color: color.textSecondary, fontSize: font.footnote },
  extremes: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 12,
  },
  extremeText: { color: color.tint, fontSize: font.footnote, fontWeight: '600' },
  profileLine: {
    color: color.textPrimary, fontSize: font.subheadline, lineHeight: 22, marginTop: 6,
  },
  profileKey: { color: color.textSecondary, fontSize: font.footnote, fontWeight: '600' },
  shareBtn: {
    minHeight: 48, borderRadius: radius.button, borderCurve: 'continuous',
    backgroundColor: color.textPrimary, alignItems: 'center', justifyContent: 'center',
    marginTop: 14, paddingHorizontal: 16,
  },
  shareBtnText: { color: '#000000', fontSize: font.body, fontWeight: '600' },
  footNote: {
    color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 24,
  },
});
