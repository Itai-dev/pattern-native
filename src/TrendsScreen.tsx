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
import {
  EVENT_LABELS, Entries, FuncEntry, INTERVENTIONS, PainEvent, RESPONSE_LABELS,
  Response, dateFromISO, fmtTime,
} from './model';
import { BAND_AT, formatScore, painColor, painLabel } from './painScale';
import { EndOfRecord, ReportData, buildReportData, fmtReportDate } from './report';
import { color, font, radius, size } from './theme';

const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => {
  const d = dateFromISO(iso);
  return d.getDate() + ' ' + M3[d.getMonth()];
};

export interface TrendsScreenProps {
  entries: Entries;
  events: PainEvent[];
  func: FuncEntry[];
  goalText: string | null;
  todayIso: string;
  /** how many days the chart is currently showing, reported upward so the
   *  PDF the title bar exports covers what is actually on screen */
  onSpanChange?: (days: number) => void;
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View
      style={styles.metric}
      accessible
      accessibilityLabel={label + ', ' + value + (sub ? ', ' + sub : '')}
    >
      <Text style={styles.metricV} allowFontScaling maxFontSizeMultiplier={1.4}>{value}</Text>
      <Text style={styles.metricL} allowFontScaling maxFontSizeMultiplier={1.4}>{label}</Text>
      {!!sub && <Text style={styles.metricS} numberOfLines={2}>{sub}</Text>}
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
  data, span, selected, onSelect,
}: {
  data: ReportData;
  span: number;
  selected: string | null;
  onSelect: (dateIso: string | null) => void;
}) {
  const byDate: Record<string, number> = {};
  data.days.forEach((d) => { byDate[d.date] = d.avg; });
  const end = dateFromISO(data.rangeEnd);
  const cols: { date: string; avg: number | null }[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
      + '-' + String(d.getDate()).padStart(2, '0');
    cols.push({ date: k, avg: byDate[k] != null ? byDate[k] : null });
  }
  const logged = cols.filter((c) => c.avg != null).length;
  const pick = cols.filter((c) => c.date === selected)[0];
  /* the top of the user's own easier third, or null when the record is
     too short for the split to mean anything */
  const easier = data.harderEasier ? data.harderEasier.boundaryLow : null;

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
        {pick && pick.avg != null ? (
          <Text style={styles.readoutText} allowFontScaling maxFontSizeMultiplier={1.3}>
            <Text style={styles.readoutStrong}>{formatScore(pick.avg)}</Text>
            {'  ' + painLabel(pick.avg) + '  ·  ' + shortDate(pick.date)}
          </Text>
        ) : pick ? (
          <Text style={styles.readoutText} allowFontScaling maxFontSizeMultiplier={1.3}>
            Nothing logged on {shortDate(pick.date)}
          </Text>
        ) : (
          <Text style={styles.readoutHint} allowFontScaling maxFontSizeMultiplier={1.3}>
            Tap a day to see it
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
          'Daily average pain. ' + logged + ' days logged, the rest are gaps.'
        }
      >
        {cols.map((c) => {
          const on = c.date === selected;
          return (
            <Pressable
              key={c.date}
              onPress={() => onSelect(on ? null : c.date)}
              style={styles.chartSlot}
              accessibilityRole="button"
              accessibilityLabel={
                shortDate(c.date) + (c.avg == null ? ', nothing logged'
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
        <Text style={styles.axisText}>{shortDate(cols[0].date)}</Text>
        <Text style={styles.axisText}>{shortDate(cols[cols.length - 1].date)}</Text>
      </View>
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
 * The colour comes from the pain ramp itself rather than a green/red
 * palette invented for this one line — the app already has a scale whose
 * hues mean better and worse, and a second one would only be a chance for
 * the two to disagree.
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
  const tint = same ? color.textSecondary : painColor(better ? 2 : 8);
  return (
    <View style={styles.direction}>
      <Text style={[styles.directionText, { color: tint }]}
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
          tint={it.tint || color.textSecondary}
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

export default function TrendsScreen({
  entries, events, func, goalText, todayIso, onSpanChange,
}: TrendsScreenProps) {
  /* All by default. The first look at this chart must show every logged
     day — a fixed window that happens to miss the days someone logged
     reads as "nothing here", which is exactly the bug report it
     generated. Narrower ranges are for leaning in, not landing on. */
  const [rangeKey, setRangeKey] = useState('a');
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


      {/* ── the numbers ─────────────────────────────────────── */}
      <Card title="Your record">
        {/* the scale, said once, so no figure on this screen has to
            carry "/10" on its back to be understood */}
        <Text style={styles.rangeLine}>Pain is 0–10, where 0 is no pain</Text>
        <View style={styles.metrics}>
          <Metric label="Average pain" value={formatScore(data.avg)} sub={painLabel(data.avg)} />
          <Metric label="Lowest day" value={formatScore(data.lowestDay)} />
          <Metric label="Highest day" value={formatScore(data.highestDay)} />
          <Metric label="Logged days" value={String(data.loggedDays)} />
          <Metric label="Check-ins" value={String(data.totalCheckins)} />
          {data.goalText != null && data.latestAbility != null && (
            <Metric
              label="Weekly ability"
              value={String(data.latestAbility.ability)}
              sub={data.goalText}
            />
          )}
        </View>
      </Card>

      {/* ── pain over time ──────────────────────────────────── */}
      <Card title={data.limited ? 'Pain recorded so far' : 'Pain over time'}>
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
      <MiniChart data={data} span={spanDays} selected={picked} onSelect={setPicked} />
      <Text style={styles.noteLine}>
        Days without check-ins stay blank — nothing is filled in for a day you
        didn’t log.
      </Text>
      {!!data.halves && (
        <Direction first={data.halves.first} second={data.halves.second} />
      )}

      {/* THE COUNT THAT GOES UP as things get better.

          Every other number on this screen falls when the record
          improves, which is the right shape for pain and a discouraging
          shape to look at daily. This one does not: it is how many of
          your logged days landed in each band, and the easier end grows.

          It is a COUNT, not a second scale. Pain stays the number you
          entered — the same 0–10 on Today, in the day detail and in the
          summary a clinician reads — and this counts those days rather
          than restating them upside down. The bands are the five the app
          already speaks in; nothing was invented to make a line point the
          other way. */}
      {feltBands.length > 0 && (
        <View style={styles.subBlock}>
          <Text style={styles.subBlockTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
            Your days by band
          </Text>
          <Stack segments={feltBands.map((b) => ({ key: b.key, n: b.n, tint: b.tint }))} />
          <Key items={feltBands} />
          <Text style={styles.noteLine}>
            The same {data.days.length} {data.days.length === 1 ? 'day' : 'days'} as
            the chart, counted instead of laid out in time. This is the one
            figure here that rises as things get easier.
          </Text>
        </View>
      )}
      </Card>

      {/* ── the two ends ────────────────────────────────────── */}
      {!!data.harderEasier && (
        <Card
          title="Hardest and easiest days"
          note={'The highest and lowest third of your logged days, with the middle third ('
            + data.harderEasier.middleDays
            + (data.harderEasier.middleDays === 1 ? ' day' : ' days')
            + ') set aside. This describes where the pain was and how you '
            + 'described it — not what caused it.'}
        >
          <Split
            low={data.harderEasier.boundaryLow}
            high={data.harderEasier.boundaryHigh}
          />
          <End
            title="Hardest days"
            when={formatScore(data.harderEasier.boundaryHigh) + ' and above'}
            e={data.harderEasier.harder}
          />
          <End
            title="Easiest days"
            when={formatScore(data.harderEasier.boundaryLow) + ' and below'}
            e={data.harderEasier.easier}
          />
        </Card>
      )}

      {/* ── time of day ─────────────────────────────────────── */}
      {data.timeOfDay.length > 0 && (
        <Card
          title="Time of day"
          note="The average of the check-ins you recorded in each part of the day, with how many are behind it. It reflects when you checked in — not a claim about when your pain is worst."
        >
          {/* bars run against the full 0–10 scale rather than against
              the highest band, so a day whose parts sit at 4, 5 and 6
              does not draw as if the evening were three times the
              morning. The comparison being invited is real. */}
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
        </Card>
      )}

      {/* ── where ───────────────────────────────────────────── */}
      {data.locations.length > 0 && (
        <Card title="Where">
          {/* against the most-recorded area, because the question a
              reader has here is "which of my places comes up most", not
              "how close is my shoulder to every day of the record" */}
          <FoldedList
            bars
            label="body areas"
            items={data.locations.map((l) => ({
              key: l.id,
              left: l.name,
              right: l.days + (l.days === 1 ? ' day' : ' days'),
              frac: l.days / Math.max(1, data.locations[0].days),
              tint: color.textSecondary,
            }))}
          />
        </Card>
      )}

      {/* ── described as ────────────────────────────────────── */}
      {data.qualities.length > 0 && (
        <Card title="Described as">
          <FoldedList
            bars
            label="words"
            items={data.qualities.map((q) => ({
              key: q.id,
              left: q.name,
              right: '×' + q.count,
              frac: q.count / Math.max(1, data.qualities[0].count),
              tint: color.textSecondary,
            }))}
          />
        </Card>
      )}

      {/* ── what you pointed at ─────────────────────────────── */}
      {(data.flagged.worse.length > 0 || data.flagged.better.length > 0) && (
        <Card
          title="What you pointed at"
          note="This is your read on those days, counted — not a comparison. A thing only lands here on days you already suspected it, so there are no days without it to weigh against. Pattern will offer to ask about something properly once you’ve pointed at it enough times."
        >
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
                  tint: color.textSecondary,
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
                  tint: color.textSecondary,
                }))}
              />
            </>
          )}
        </Card>
      )}

      {/* ── function ────────────────────────────────────────── */}
      {!!data.goalText && (
        <Card
          title="Function"
          note="Ability is a separate scale from pain, and a higher number is better. The two are never averaged together."
        >
          <Text style={styles.bodyText}>
            {data.goalText}
            {data.latestAbility
              ? ' — latest weekly ability ' + data.latestAbility.ability
              : ' — no weekly ratings yet'}
            {data.abilityChange && !data.limited
              ? '. Since the first rating: ' + data.abilityChange.first.ability
                + ' → ' + data.abilityChange.last.ability + '.'
              : '.'}
          </Text>
          {/* the one chart on this screen where a rising column is
              straightforwardly good news — and the reason it is drawn in
              the interface tint rather than the pain ramp. Borrowing those
              hues would say a high ability was a bad day. */}
          {data.func.length > 1 && (
            <>
              <Columns
                tint={color.textSecondary}
                values={data.func.map((f) => ({ key: f.week, v: f.ability }))}
              />
              <View style={styles.chartAxis}>
                <Text style={styles.axisText}>{shortDate(data.func[0].week)}</Text>
                <Text style={styles.axisText}>
                  {shortDate(data.func[data.func.length - 1].week)} · higher is better
                </Text>
              </View>
            </>
          )}
        </Card>
      )}

      {/* ── what you tried ──────────────────────────────────── */}
      {tried.length > 0 && (
        <Card
          title="What you tried"
          note="Your own impression afterwards, recorded as you gave it. Pattern doesn’t assess whether something worked."
        >
          {/* what came back, counted. The list underneath is dated and
              specific; this is the only place the whole run of them can
              be seen at once, and a lot of "About the same" is worth
              being able to notice. Recorded impressions only — Pattern
              does not assess whether anything worked. */}
          {outcomes.length > 0 && (
            <>
              <Stack segments={outcomes.map((o) => ({ key: o.key, n: o.n, tint: o.tint }))} />
              <Key items={outcomes} />
            </>
          )}
          <FoldedList
            label="things you tried"
            items={tried.slice().reverse().map((ev, i) => ({
              key: ev.id != null ? 't' + ev.id : 'ti' + i,
              left: shortDate(ev.date) + ' · '
                + (ev.intervention ? INTERVENTIONS[ev.intervention] || ev.intervention : EVENT_LABELS[ev.kind])
                + (ev.text ? ' — ' + ev.text : ''),
              right: outcomeOf(ev),
            }))}
          />
        </Card>
      )}

      {/* ── events ──────────────────────────────────────────── */}
      {data.events.length > 0 && (
        <Card
          title="Events"
          note="Events sit alongside your check-ins. Their timing doesn’t prove they caused a change."
        >
          <FoldedList
            label="events"
            items={data.events.slice().reverse().map((ev, i) => ({
              key: ev.id != null ? 'e' + ev.id : 'ei' + i,
              left: shortDate(ev.date) + ' ' + fmtTime(ev.h) + ' · ' + EVENT_LABELS[ev.kind]
                + (ev.text ? ' — ' + ev.text : ''),
              right: '',
            }))}
          />
        </Card>
      )}

      {/* the claim the share button used to sit under, kept where it can
          still be read before anything is sent */}
      <Text style={styles.footNote}>
        Share, at the top of this screen, makes a PDF on this iPhone and sends
        it only where you send it. It carries the same numbers you see here,
        and says on its face that it is self-recorded and not a diagnosis.
      </Text>
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
    borderRadius: radius.card,
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
    flexGrow: 1, flexBasis: '30%', borderRadius: 12, padding: 10,
    backgroundColor: color.bgSheet, gap: 1,
  },
  metricV: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricL: { color: color.textSecondary, fontSize: font.footnote },
  metricS: { color: color.textTertiary, fontSize: font.footnote },
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
  readout: { height: 26, justifyContent: 'center' },
  readoutText: { color: color.textSecondary, fontSize: font.subheadline },
  readoutStrong: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  readoutHint: { color: color.textTertiary, fontSize: font.footnote },
  segment: {
    flexDirection: 'row', gap: 3, padding: 3, borderRadius: 12,
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
  foldRow: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  foldText: { color: color.tint, fontSize: font.subheadline, fontWeight: '500' },
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
    borderRadius: radius.card, padding: 12, marginBottom: 8,
    backgroundColor: color.bgSheet, gap: 3,
  },
  endTitle: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  endWhen: {
    color: color.textSecondary, fontSize: font.footnote, fontVariant: ['tabular-nums'],
  },
  endLine: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },
  footNote: {
    color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 24,
  },
});
