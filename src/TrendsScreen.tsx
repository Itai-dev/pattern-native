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
 *
 * THE REDESIGN'S SKIN, NOT ITS CONTENT (21 Oct 2026). The cards are
 * Today's (SummaryCard): icon and label, a big rounded value where a card
 * has one, grey lines under it, the "not" line last and inside. Pain
 * values are squares in the ramp (PainChip) or the chart's ramp bars;
 * counts are white bars; every figure is in the rounded face. What the
 * screen says, in what order, behind which gate, is unchanged — the
 * mockup's new Highlights (a usual morning range, a "for your physio"
 * PDF row) are new content and wait for their own change.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleProp, StyleSheet, Text, TextStyle, View,
} from 'react-native';
import { Press } from './motion';
import InfoTip, { InfoGlyph, InfoTitle } from './InfoTip';
import {
  EVENT_LABELS, Entries, FuncEntry, INTERVENTIONS, PainEvent,
  RESPONSE_LABELS, Response, dateFromISO, } from './model';
import { fmtClock } from './clock';
import { BAND_AT, formatScore, inkOn, painColor, painLabel } from './painScale';
import {
  ChartColumn, EndOfRecord, ReportData, buildReportData, chartColumns, chartGrain,
  fmtReportDate,
} from './report';
import {
  Association as HealthAssociation, EARLY_NOTE, EarlyLook, FIRST_NOTE, IN_BED_NOTE,
  associationCopy, earlyCopy, fadedCopy, factorLabel, firstTitle, groupLabels, isCategorical,
} from './health/engine';
import { FirstDays, HealthProgress } from './health/noticed';
import { BUDGET_NOTE_SHORT, LoadBudget, budgetCopy } from './health/budget';
import {
  AFTER_WORKOUTS_NOTE, AFTER_WORKOUTS_PENDING, AfterWorkout, workoutLabel,
} from './health/afterWorkouts';
import {
  DOSE_TIMING, DoseAssociation, DoseEarly, DoseProgress, FirstDoses, doseCopy,
  doseObservationCopy, fadedDoseCopy,
} from './health/doses';
import {
  FirstWorkouts, WORKOUT_TIMING, WorkoutAssociation, WorkoutEarly, WorkoutProgress,
  fadedWorkoutCopy, workoutCopy, workoutObservationCopy,
} from './health/workouts';
import { capitalise } from './health/workoutNames';
import { DigestCard, recordSays } from './digest';
import { color, font, size } from './theme';
import Icon, { IconName } from './Icon';
import {
  BigValue, CardHeader, IconName as HeaderIcon, Num, ROUNDED, card as summaryCard, summary,
} from './SummaryCard';
import { FIRST_DAYS_OPEN } from './thresholds';

const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso: string) => {
  const d = dateFromISO(iso);
  return d.getDate() + ' ' + M3[d.getMonth()];
};

export interface TrendsScreenProps {
  entries: Entries;
  /** opening a day from this screen: the chart's readout and the two
   *  extremes name days, and a named day opens. The calendar of every
   *  day lived at the foot of this page until 17 Sep 2026; it is a view
   *  of the day screen now (DayScreen), because a page about what the
   *  days add up to is not where a person looks for one day. */
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
    /** the pictures before the gates — see thresholds.ts, early looks */
    early: EarlyLook[];
    /** and before the pictures, the first paired days as facts */
    first: FirstDays[];
    /** the workout-load association read forward: where this person's
     *  harder-workout days begin, in minutes. null until the association
     *  clears its gates, and only when more load paired with harder
     *  mornings — budget.ts says why one direction only */
    budget: LoadBudget | null;
    /** each workout beside the next morning's first check-in, newest
     *  first — facts with no gate, see afterWorkouts.ts */
    after: AfterWorkout[];
    /** the same four, for doses logged in Health — before-and-after a
     *  dose rather than groups of days, gated in doses.ts */
    doses: {
      best: DoseAssociation | null;
      fading: DoseAssociation[];
      groups: DoseAssociation[];
      progress: DoseProgress[];
      early: DoseEarly[];
      first: FirstDoses[];
    };
    /** and around a workout — before it started, after it ended, per
     *  activity, gated in workouts.ts. Optional so a caller built
     *  before it existed still renders. */
    workouts?: {
      best: WorkoutAssociation | null;
      fading: WorkoutAssociation[];
      groups: WorkoutAssociation[];
      progress: WorkoutProgress[];
      early: WorkoutEarly[];
      first: FirstWorkouts[];
    };
  };
  /** the PDF, from its natural home at the foot of the screen — the
   *  handoff is the destination of everything above it */
  onShare?: () => void;
  sharing?: boolean;
}

/* ── the type of this screen ──────────────────────────────────
   A line of words with its figures in the rounded face — the redesign's
   rule (SummaryCard) that a number looks the same in a value and in the
   sentence under it. Every string here that carries a date, a count or
   a score goes through Say, so none of them lands in the text face by
   accident when the copy is reworded. */
function Say({ style, children, lines }: {
  style: StyleProp<TextStyle>;
  children: string;
  lines?: number;
}) {
  return (
    <Text style={style} numberOfLines={lines} allowFontScaling maxFontSizeMultiplier={1.4}>
      <Num>{children}</Num>
    </Text>
  );
}

/** the chevron that says a row goes somewhere — Health's grey, never
 *  the text's white, so it is read as a door and not as a word */
function Door({ down }: { down?: boolean }) {
  return <Icon name={down ? 'chevron.down' : 'chevron.right'} size={13} color={summary.chevron} />;
}

/**
 * A pain value as the redesign draws one: a rounded square in the ramp
 * with the number on it — the mockup's Highlights rows. Squares mean pain
 * everywhere in the app, so this is only ever handed a pain value, and
 * nothing that is not one is drawn square on this screen. The number is
 * written on it because a colour alone is not information anyone can
 * rely on; the ink follows the square's own luminance (inkOn), so it
 * reads in every theme and at both ends of the ramp.
 */
function PainChip({ v }: { v: number }) {
  return (
    <View style={[chip.box, { backgroundColor: painColor(v) }]}>
      {/* fixed, like the square it sits on: the row's spoken label
          carries the number for anyone who needs it larger */}
      <Text style={[chip.num, { color: inkOn(v) }]} allowFontScaling={false}>{formatScore(v)}</Text>
    </View>
  );
}

const chip = StyleSheet.create({
  box: {
    minWidth: 28, height: 28, paddingHorizontal: 3, borderRadius: 8, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center',
    /* the mockup's 0.5pt inset edge: a 10 is near-black on the card, and
       without an edge the square would vanish into it */
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  num: { fontFamily: ROUNDED, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

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
 *
 * HEALTH'S CHART, NOT HEALTH'S COLOURS (21 Oct 2026). The redesign takes
 * Apple Health's chart page: hairline gridlines, the scale on the right,
 * rounded bar tops, the others dimmed while one is picked. The bars stay
 * the ramp, because each one IS a pain value — the day's (or week's)
 * average of what was entered. Sessions draws its minutes white; a pain
 * chart drawn white would be the one place pain lost its colour.
 */
/** the drawing height of the plot, shared by the bars, the band and the
 *  gridlines so the shading lines up with the columns rather than nearly
 *  lining up */
const PLOT_H = 112;
/** where the scale is ruled: the two ends and the middle, the three a
 *  0–10 scale needs to be read without counting */
const GRID = [10, 5, 0];

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

  /* a window with nothing in it says so in words — a row of 2pt gap
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
              <Num>{'  ' + painLabel(pick.avg) + '  ·  ' + name(pick)
                + (weekly ? '  ·  ' + pick.logged + (pick.logged === 1 ? ' day' : ' days') : '')}</Num>
            </Text>
            <Door />
          </Press>
        ) : pick ? (
          <Say style={styles.readoutText}>
            {'Nothing logged ' + (weekly ? 'in the week of ' : 'on ') + shortDate(pick.from)}
          </Say>
        ) : (
          <Text style={styles.readoutHint} allowFontScaling maxFontSizeMultiplier={1.3}>
            {weekly ? 'Tap a week' : 'Tap a day'}
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
        <View style={styles.plot}>
          {GRID.map((g) => (
            <View key={g} pointerEvents="none"
              style={[styles.gridLine, g === 0 && styles.gridBase, { bottom: (g / 10) * PLOT_H }]} />
          ))}
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
                      style={[styles.bar, {
                        height: Math.max(3, (c.avg / 10) * PLOT_H),
                        backgroundColor: painColor(c.avg),
                        opacity: selected && !on ? 0.4 : 1,
                      }]}
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
        {/* the scale on the right, where Health keeps it — the eye
            reads the bars first and the numbers only when it needs them */}
        <View style={styles.gutter} pointerEvents="none">
          {GRID.map((g) => (
            <Text key={g} allowFontScaling={false}
              style={[styles.gutterText, { bottom: (g / 10) * PLOT_H - 7 }]}>
              {g}
            </Text>
          ))}
        </View>
      </View>
      <View style={styles.chartAxis}>
        <Say style={styles.axisText}>{shortDate(cols[0].from)}</Say>
        <Say style={styles.axisText}>{shortDate(cols[cols.length - 1].to)}</Say>
      </View>
      {(weekly || easier != null) && (
        <InfoTip
          label="How to read the chart"
          text={[
            weekly
              ? 'Each bar is a week: the average of the days you logged in it. A week with nothing logged stays blank.'
              : '',
            easier != null
              ? 'The shaded band is your own easier third — ' + formatScore(easier)
                + ' and below. Lower is less pain on this chart, so a bar that ends inside the band is in the range of your easier days.'
              : '',
          ].filter(Boolean).join(' ')}
        />
      )}
    </View>
  );
}

/**
 * The two halves of the range, as the report prints them — and no more.
 *
 * This named a direction ("1.2 lower", then "easier" or "harder")
 * until 18 Oct 2026. That is a delta on
 * pain with a verdict word, which the app refuses: at Month (halves need
 * HALVES_MIN_DAYS logged) it is fortnight against fortnight, and the
 * second half holds today, so one check-in could turn "easier" into
 * "harder" between two opens. The clinician's page already says only
 * the two averages; this now says the same words, so the screen and the
 * page cannot disagree, and the reader is not handed the subtraction.
 * Rejected: keeping "about the same" alone — a verdict that only ever
 * speaks when it is good news is still a verdict.
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
 * between two opens on the same day. The redesign's big rounded value
 * stays the record's average; the two halves are never given one, since
 * two big numbers side by side are a delta the reader does in their head.
 */
function Direction({ first, second }: { first: number; second: number }) {
  return (
    <View style={styles.direction}>
      <Say style={styles.directionSub}>
        {'First half of this range averaged ' + formatScore(first) + ', second half '
          + formatScore(second) + '. Averages of what you entered, not a measure of how you are doing.'}
      </Say>
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
   short record never sees a fourth segment.

   W · M · 3M · All on the control, Health's letters (21 Oct 2026), and
   the whole word to VoiceOver — `label` is what is spoken, `short` is
   only what fits. "All" stays a word: it is the one width that is not a
   length of time, and the empty range still says "try All". */
const RANGES: { key: string; label: string; short: string; days: number }[] = [
  { key: 'w', label: 'Week', short: 'W', days: 7 },
  { key: 'm', label: 'Month', short: 'M', days: 30 },
  { key: 'q', label: '3 months', short: '3M', days: 90 },
  { key: 'a', label: 'All', short: 'All', days: 0 },
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
          tint={it.tint || summary.text}
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
          <Say style={styles.foldText}>
            {open ? 'Show fewer' : 'Show all ' + items.length}
          </Say>
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
 *
 * THE NOTE IS SHOWN, LAST (21 Oct 2026). It sat behind an (i) on the
 * title row; the redesign's card ends with its grey "not" line instead
 * (SummaryCard), the same anatomy Today's cards have, so a card here and
 * a card there qualify their numbers the same way. The header is the
 * shared CardHeader — icon, label — so the sizes are Today's, not a copy.
 */
function Card({
  icon, title, note, children,
}: {
  icon: HeaderIcon;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={[summaryCard.box, styles.box]}>
      <CardHeader icon={icon} label={title} />
      <View style={styles.cardBody}>{children}</View>
      {!!note && <Say style={[summaryCard.fine, styles.cardNote]}>{note}</Say>}
    </View>
  );
}

/* ── the drawing primitives ───────────────────────────────────
   A handful of shapes cover every section on this screen, and all are
   plain Views. No SVG, no charting library: a bar is a box with a width,
   and a dependency that needs a native build would have been
   unshippable over the air anyway.

   Proportions come out as flex weights rather than percentage strings,
   because a bar built from two flex children divides the width it is
   actually given — no measurement, no rounding drift at the right edge,
   and correct at any Dynamic Type size.

   WHITE FOR COUNTS, THE RAMP FOR PAIN. A bar here is days or times —
   never a pain value — so it is white, as Health draws its non-pain
   measures; a pain value is a PainChip square. */

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
        <Say style={styles.barRight}>{right}</Say>
      </View>
      <Bar frac={frac} tint={tint} />
      {!!sub && <Say style={styles.barSub}>{sub}</Say>}
    </View>
  );
}

/** a pain average as a row: its square, what it is, and the line under
 *  it — the time-of-day bands, which are pain and so are never a white
 *  bar. The spoken label is the one the bar row gave. */
function ChipRow({ v, label, sub }: { v: number; label: string; sub?: string }) {
  return (
    <View style={styles.chipRow} accessible accessibilityLabel={label + ', ' + formatScore(v)}>
      <PainChip v={v} />
      <View style={styles.chipText}>
        <Text style={styles.barLabel} allowFontScaling maxFontSizeMultiplier={1.3}>{label}</Text>
        {!!sub && <Say style={styles.barSub}>{sub}</Say>}
      </View>
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
 *  because colour on its own is not information anyone can rely on.
 *  `square` for the pain bands, a dot for anything else: squares mean
 *  pain, and the four answers to "did it help" are not a pain value. */
function Key({ items, square }: {
  items: { key: string; label: string; tint: string; n: number }[];
  square?: boolean;
}) {
  return (
    <View style={styles.keyWrap}>
      {items.map((i) => (
        <View key={i.key} style={styles.keyItem} accessible
          accessibilityLabel={i.label + ', ' + i.n + (i.n === 1 ? ' day' : ' days')}>
          <View style={[square ? styles.keySquare : styles.keyDot, { backgroundColor: i.tint }]} />
          <Say style={styles.keyText}>{i.label + ' ' + i.n}</Say>
        </View>
      ))}
    </View>
  );
}

function Row({ left, right }: { left: string; right?: string }) {
  return (
    <View style={styles.row}>
      <Say style={styles.rowLeft} lines={2}>{left}</Say>
      {!!right && <Say style={styles.rowRight}>{right}</Say>}
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
 *
 * ELEVEN SQUARES, the mockup's usual-range strip: one per point of the
 * scale, each lit in its own ramp colour when it falls inside an end and
 * grey in the set-aside middle. A square is lit only when its whole
 * number is inside the end — 3 under a boundary of 3.4, not 4 — so the
 * strip never claims a point the cut did not reach; the words under it
 * carry the exact boundary.
 */
function Split({ low, high }: { low: number; high: number }) {
  return (
    <View style={styles.splitWrap}>
      <View style={styles.splitCells} accessible={false}>
        {Array.from({ length: 11 }, (_, i) => i).map((i) => (
          <View key={i} style={[styles.splitCell,
            i <= low || i >= high
              ? [styles.splitLit, { backgroundColor: painColor(i) }]
              : styles.splitOff]} />
        ))}
      </View>
      <View style={styles.splitAxis}>
        <Say style={styles.axisText}>{'easiest · ' + formatScore(low) + ' and below'}</Say>
        <Say style={styles.axisText}>{formatScore(high) + ' and above · hardest'}</Say>
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
      <Say style={styles.endWhen}>
        {e.days + ' ' + (e.days === 1 ? 'day' : 'days') + ' · ' + when + ' · averaging ' + formatScore(e.avg)}
      </Say>
      {!!locs && <Say style={styles.endLine}>{'Where: ' + locs}</Say>}
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
 * Each group is a PainChip — its mean pain, in the ramp, with the number
 * on it — beside what the group is and how many days are in it: the
 * mockup's sleep card (21 Oct 2026). The factor (sleep, steps, workout
 * minutes) lives entirely in the label text, never in the ramp, so
 * colour stays a pain value. These were bars whose length was the mean;
 * two squares with their numbers say the same two facts without a
 * length that invites reading one group as "longer" than the other.
 * Every row carries its n, because a value without its sample size is a
 * claim wearing a chart's clothes.
 */
function GroupBars({ a }: { a: Pick<HealthAssociation, 'kind' | 'low' | 'high'> }) {
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
          <PainChip v={r.g.painMean} />
          <Say style={cmpStyles.label}>
            {r.word[0].toUpperCase() + r.word.slice(1) + ' ' + w.noun
              + (isCategorical(a.kind)
                ? '' : ' · avg ' + factorLabel(a.kind, r.g.factorMean))}
          </Say>
          <Say style={cmpStyles.n}>{r.g.n + ' ' + w.noun}</Say>
        </View>
      ))}
    </View>
  );
}

/**
 * Before and after, drawn the same way as the groups: the square is the
 * mean pain, what it was around lives in the text. Each row carries its
 * n — the same n, because these are pairs. One drawing for a dose and
 * for a workout; only the words differ.
 */
function PairBars({ before, after, pairs, words, unit, of }: {
  before?: number; after?: number; pairs: number;
  /** the two row labels — "Before a dose", "After a dose" */
  words: [string, string];
  /** what n counts — "doses", "workouts" */
  unit: string;
  /** the thing, for the spoken label — the medication, the activity */
  of: string;
}) {
  if (before == null || after == null) return null;
  const rows = [
    { word: words[0], v: before },
    { word: words[1], v: after },
  ];
  return (
    <View style={cmpStyles.wrap}>
      {rows.map((r) => (
        <View
          key={r.word}
          style={cmpStyles.row}
          accessible
          accessibilityLabel={r.word + ' of ' + of + ', pain averaged '
            + formatScore(r.v) + ' across ' + pairs + ' ' + unit}
        >
          <PainChip v={r.v} />
          <Text style={cmpStyles.label} allowFontScaling maxFontSizeMultiplier={1.3}>
            {r.word}
          </Text>
          <Say style={cmpStyles.n}>{pairs + ' ' + unit}</Say>
        </View>
      ))}
    </View>
  );
}
function DoseBars({ a }: { a: Pick<DoseAssociation, 'med' | 'pairs' | 'before' | 'after'> }) {
  return <PairBars before={a.before} after={a.after} pairs={a.pairs} of={a.med}
    words={['Before a dose', 'After a dose']} unit="doses" />;
}
function WorkoutBars({ a }: { a: Pick<WorkoutAssociation, 'activity' | 'pairs' | 'before' | 'after'> }) {
  return <PairBars before={a.before} after={a.after} pairs={a.pairs} of={a.activity}
    words={['Before ' + a.activity, 'After ' + a.activity]} unit="workouts" />;
}

const cmpStyles = StyleSheet.create({
  wrap: { marginTop: 12, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 32 },
  label: { flex: 1, color: summary.text, fontSize: font.subheadline, lineHeight: 20 },
  n: { color: summary.secondary, fontSize: font.subheadline, fontVariant: ['tabular-nums'] },
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
      <Say style={digestStyles.title}>{card.title}</Say>
      <Say style={digestStyles.evidence}>{card.evidence}</Say>
      {!!card.caveat && <Say style={digestStyles.caveat}>{card.caveat}</Say>}
    </View>
  );
}

const digestStyles = StyleSheet.create({
  row: { paddingVertical: 12, gap: 5 },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: summary.separator,
  },
  title: {
    color: summary.text, fontSize: font.body, fontWeight: '600', lineHeight: 22,
  },
  evidence: {
    color: summary.secondary, fontSize: font.subheadline, lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
  caveat: { color: summary.tertiary, fontSize: font.footnote, lineHeight: 18 },
});

/* ── what stands out, as cards ─────────────────────────────── */

/** the sentence every stand-out card is qualified by — inside the sheet
 *  that opens it and behind the (i) on the section, never far from the
 *  numbers it qualifies */
const STANDOUT_NOTE = 'A pattern in what you recorded, never proof of cause. Nothing here moves on its own — only when you add a check-in or Apple Health adds a day.';

/**
 * One thing that stands out: the sentence, one line under it, and what
 * opens when the card is tapped. `detail` null is a card with nothing
 * further to say — a fact about the wait, drawn without the chevron.
 */
interface Standout {
  key: string;
  title: string;
  line: string;
  detail: React.ReactNode | null;
  /** behind "Show more" until asked for — the first-days lists, of
   *  which ten can exist in the first week */
  folded?: boolean;
  /** what the line does not mean, ON the card. The (i) on the section
   *  heading sits outside every card and the sheet is a tap away, so a
   *  card showing averages or minutes without this was a claim on its
   *  own on the page a person opens five times a day. */
  note?: string;
}

/* WHAT EACH CARD IS ABOUT, AS A GLYPH. Health's Highlights put the
   category's icon on every card; here it is read off the card's key,
   which already names what it compares, so no card's data had to grow a
   field for a drawing. White always — the category is never a colour —
   and anything unknown falls back to the record's own glyph rather than
   to nothing. */
const KIND_ICON: Record<string, IconName> = {
  sleepVsMorning: 'bed.double.fill',
  prevDayStepsVsMorning: 'figure.walk',
  stepsBeforeVsEvening: 'figure.walk',
  workoutVsNextMorning: 'figure.mixed.cardio',
  workoutLoadVsNextMorning: 'figure.mixed.cardio',
  standBeforeVsEvening: 'figure.stand',
  waterBeforeVsEvening: 'drop.fill',
  caffeineBeforeVsEvening: 'cup.and.saucer.fill',
};
function standoutIcon(key: string): IconName {
  if (key === 'collecting') return 'hourglass';
  if (key === 'bands') return 'clock.fill';
  if (key.indexOf('progress.') === 0) return 'hourglass';
  if (key === 'budget' || key === 'after.workouts' || key === 'best.workout'
    || /^(faded\.workout|we|wf|w)\./.test(key)) return 'figure.mixed.cardio';
  if (key === 'best.dose' || /^(faded\.dose|de|df|d)\./.test(key)) return 'pills.fill';
  const m = /^(best|faded|e|f|g)\.(.+)$/.exec(key);
  if (m) return KIND_ICON[m[2]] || 'heart.fill';
  return 'chart.bar.fill';
}

/** the card on the page: the glyph, the sentence, the line under it,
 *  and the chevron that is the door — white on the surface, no bar and
 *  no colour, because the squares are what it opens to */
function StandoutCard({ card, onOpen }: { card: Standout; onOpen: () => void }) {
  const opens = card.detail !== null;
  const body = (
    <>
      <View style={styles.standoutHead}>
        <View style={styles.standoutIcon}><Icon name={standoutIcon(card.key)} size={18} /></View>
        <Say style={styles.noticeTitle}>{card.title}</Say>
        {opens && <View style={styles.standoutChev}><Door /></View>}
      </View>
      {/* three lines when the card opens to the rest; all of it when it
          does not, since a clipped sentence with no door was a sentence
          nobody could finish */}
      <Say style={styles.standoutLine} lines={opens ? 3 : undefined}>{card.line}</Say>
      {!!card.note && (
        <Say style={styles.standoutNote}>{card.note}</Say>
      )}
    </>
  );
  if (!opens) {
    return (
      <View style={[summaryCard.box, styles.box]} accessible accessibilityLabel={card.title + '. ' + card.line + (card.note ? ' ' + card.note : '')}>
        {body}
      </View>
    );
  }
  return (
    <Press
      onPress={onOpen}
      pressScale={0.985}
      pressOpacity={0.92}
      style={[summaryCard.box, styles.box]}
      accessibilityRole="button"
      accessibilityLabel={card.title + '. ' + card.line + (card.note ? ' ' + card.note : '')}
      accessibilityHint="Opens this in full: the numbers behind it and what it does not mean"
    >
      {body}
    </Press>
  );
}

/** the card in full, as a sheet: the sentence as its title, everything
 *  behind it, and the qualifying sentence at the foot — inside the
 *  sheet, where the numbers are */
function StandoutSheet({ card, onClose }: { card: Standout; onClose: () => void }) {
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetBar}>
        <Text style={styles.sheetTitle} numberOfLines={1}>What stands out</Text>
        <Press
          onPress={onClose}
          style={styles.sheetBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.sheetBtnText}>Done</Text>
        </Press>
      </View>
      <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
        <View style={styles.sheetIcon}><Icon name={standoutIcon(card.key)} size={22} /></View>
        <Say style={styles.sheetHeadline}>{card.title}</Say>
        <View style={styles.sheetDetail}>{card.detail}</View>
        <Text style={styles.sheetNote} allowFontScaling maxFontSizeMultiplier={1.4}>{STANDOUT_NOTE}</Text>
      </ScrollView>
    </View>
  );
}

/** the range the screen is showing, with what to make of it behind the
 *  (i) — the InfoTitle shape, built here so the dates take the rounded
 *  face like every other figure on the page */
function RangeHead({ title, text }: { title: string; text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.rangeHead}>
      <View style={styles.rangeRow}>
        <Say style={styles.sub}>{title}</Say>
        <InfoGlyph open={open} onPress={() => setOpen((v) => !v)} label="About this screen" />
      </View>
      {open && <Text style={styles.rangeNote} allowFontScaling maxFontSizeMultiplier={1.4}>{text}</Text>}
    </View>
  );
}

export default function TrendsScreen({
  entries, events, func, goalText, todayIso, onOpenDay, onSpanChange,
  healthNoticed, onShare, sharing,
}: TrendsScreenProps) {
  /* All by default. The first look at this chart must show every logged
     day — a fixed window that happens to miss the days someone logged
     reads as "nothing here", which is exactly the bug report it
     generated. Narrower ranges are for leaning in, not landing on. */
  const [rangeKey, setRangeKey] = useState('a');
  /* the descriptive tail, folded — counts of places, words and times
     are the record's appendix, not its findings */
  /* the fold: the tables inside Your record. Session state, not a
     preference — a person who opened the tables yesterday has not asked
     to see them every day. */
  const [recordOpen, setRecordOpen] = useState(false);
  /* the stand-out card opened to be read in full — see Standout */
  const [openCard, setOpenCard] = useState<Standout | null>(null);
  /* THE FIRST DAYS, FOLDED. Ten comparisons can be licensed at once, and
     in the first week every one of them has one to three paired days —
     ten titled lists of dates, each closed by the same caption, was the
     wall of text on the second card. Two stay open; the rest are one
     tap away; the caption is said once, under all of them. */
  const [firstOpen, setFirstOpen] = useState(false);
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

  /* EVERY HOOK ON THIS SCREEN RUNS ON EVERY RENDER, and the three below
     sit above the empty-state guard for that reason alone. They used to
     live under it, next to the JSX that reads them, which is the more
     readable place and was a crash: buildReportData returns null when the
     chosen range holds no logged days, the guard returned early, and the
     two useMemo calls after it never ran. React counts hooks per render,
     so switching from a range with days to one without dropped the count
     from ten to eight and threw "Rendered fewer hooks than expected".

     It needed a record with a gap: pick Week while everything logged is
     older than a week and the screen dies. A person who stopped logging
     for a fortnight — which is to say a person having a bad fortnight —
     found it every time, and the range control is the one control on
     this screen. Reading data as nullable here is the price of that. */
  const tried = data ? data.events.filter((ev) => ev.intervention || ev.resp || ev.helped != null) : [];

  /* Days grouped by the SAME five words the slider, the day detail and
     the report use. A sixth vocabulary invented for one chart is how two
     screens end up disagreeing about what a 4 is called. */
  const feltBands = useMemo(() => {
    if (!data) return [];
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
  }, [data]);

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

  /* THE RECORD, WHAT STANDS OUT, THE APPENDIX, THE HANDOFF. Eleven
     surfaces at one radius carried the hierarchy by order alone, and
     the record's appendix — counts of places, words and times — sat at
     the same weight as the record itself. Now: the record (Your pain,
     with the sentences that read it), the one place a claim may appear
     (What stands out — a card per thing, each opening to be read in
     full), the appendix (Your record, face and details), and the
     handoff. The tables are one tap further in. */
  const he = data.harderEasier;
  const otherGroups = (healthNoticed?.groups || []).filter((a) => a !== healthNoticed?.best);
  const bestCopy = healthNoticed?.best ? associationCopy(healthNoticed.best) : null;
  const healthWaiting = healthNoticed ? healthNoticed.progress : [];
  /* ONE HEADLINE. A day comparison, a dose comparison and a workout
     comparison may all have cleared; the card still carries one
     sentence, the largest change, and the others keep their bars
     further down with no claim attached. Same house rule as
     PATTERN_MAX_CARDS, applied across the three. A tie goes to the
     day comparison, then the dose: the older question first. */
  const dz = healthNoticed?.doses;
  const wk = healthNoticed?.workouts;
  const doseBestCopy = dz?.best ? doseCopy(dz.best) : null;
  const workoutBestCopy = wk?.best ? workoutCopy(wk.best) : null;
  const mag = (d: number | null | undefined) => (d == null ? -1 : Math.abs(d));
  const dayBest = healthNoticed?.best ? mag(healthNoticed.best.delta) : -1;
  const doseSize = doseBestCopy && dz?.best ? mag(dz.best.delta) : -1;
  const workoutSize = workoutBestCopy && wk?.best ? mag(wk.best.delta) : -1;
  const workoutLeads = workoutSize >= 0 && workoutSize > dayBest && workoutSize > doseSize;
  const doseLeads = !workoutLeads && doseSize >= 0 && doseSize > dayBest;
  const dayLeads = !workoutLeads && !doseLeads;
  const doseGroups = (dz?.groups || []).filter((a) => !(doseLeads && a === dz?.best));
  const workoutGroups = (wk?.groups || []).filter((a) => !(workoutLeads && a === wk?.best));
  const doseWaiting = dz ? dz.progress : [];
  const workoutWaiting = wk ? wk.progress : [];
  const workoutEarly = wk?.early || [];
  const workoutFirst = wk?.first || [];
  const early = healthNoticed?.early || [];
  const doseEarly = dz?.early || [];
  const after = healthNoticed?.after || [];
  /* the workout-load first days are the same rows with less in them —
     minutes and a number, no activity — so while After your workouts is
     on the page they are not listed twice */
  const first = (healthNoticed?.first || [])
    .filter((f) => !(after.length > 0 && f.kind === 'workoutLoadVsNextMorning'));
  /* the budget's sentence, with the dates in this screen's style */
  const budget = healthNoticed?.budget || null;
  const budgetCard = budget
    ? budgetCopy(budget, budget.association.from && budget.association.to
      ? fmtReportDate(budget.association.from) + ' – ' + fmtReportDate(budget.association.to)
      : undefined)
    : null;
  const doseFirst = dz?.first || [];
  /* what is still short of a picture, in two truthful lists. One to
     three paired days are listed above as the first days and four or
     more are usually drawn as early looks — but an early look also
     needs both groups to hold EARLY_MIN_GROUP_DAYS, so a fortnight of
     covered days with one workout has fourteen paired days and no
     picture. Those keep their count ("workouts 14 of 18"); only what
     has no paired day at all is named without a number, because
     "sleep 0 of 18 · water 0 of 18 · …" was eight zeros saying nothing
     a name does not. */
  const waiting = healthWaiting
    .filter((p) => !early.some((e) => e.kind === p.kind) && !(healthNoticed?.first || []).some((e) => e.kind === p.kind))
    .map((p) => ({ name: groupLabels(p.kind).factor.toLowerCase(), have: p.pairedDays, need: p.needed }))
    .concat(doseWaiting
      .filter((p) => !doseEarly.some((e) => e.medId === p.medId) && !doseFirst.some((e) => e.medId === p.medId))
      .map((p) => ({ name: p.med, have: p.pairs, need: p.needed })))
    .concat(workoutWaiting
      .filter((p) => !workoutEarly.some((e) => e.activity === p.activity)
        && !workoutFirst.some((e) => e.activity === p.activity))
      .map((p) => ({ name: p.activity + ', before and after', have: p.pairs, need: p.needed })));
  const notYetPaired = waiting.filter((w) => w.have === 0).map((w) => w.name);
  const stillCounting = waiting.filter((w) => w.have > 0).map((w) => w.name + ' ' + w.have + ' of ' + w.need);
  const collectingShown = notYetPaired.concat(stillCounting);
  /* THE CARDS, IN THE ORDER THEY EARNED. The record's own sentences
     first — they exist from the first week and need no sensor — then
     the budget, the headline (one claim: the larger of a day and a dose
     comparison), a faded one said out loud, the early looks, the first
     days, the doses whose pairs formed, the comparisons whose groups
     did not differ, and last what is still collecting. Each card
     carries the sentence and one line; `detail` is what opens. */
  const standouts: Standout[] = [];
  says.forEach((c) => standouts.push({
    key: c.key, title: c.title, line: c.evidence, note: c.caveat,
    detail: (
      <>
        <Say style={styles.noticeBody}>{c.evidence}</Say>
        {!!c.caveat && (
          <Say style={styles.noticeMeta}>{c.caveat}</Say>
        )}
      </>
    ),
  }));
  /* THE BUDGET. The one sentence on this screen written for the NEXT
     decision rather than the last one: the same workout-load
     association a card below may carry, read forward as minutes. Words
     and grey numbers, no colour — colour is for pain. */
  if (budgetCard) standouts.push({
    key: 'budget', title: 'Before your next workout', line: budgetCard.title,
    note: BUDGET_NOTE_SHORT,
    detail: <DigestRow card={budgetCard} first />,
  });
  /* AFTER YOUR WORKOUTS. The workout and the next morning, row by row,
     from the first workout — the one workout surface that needs no gate,
     because it compares nothing. It sits under the budget because both
     are about the next session; the claim-bearing cards follow. The
     pain number is the number entered, in the same weight as the first
     days, and nothing between the rows is summed or averaged. */
  if (after.length > 0) {
    const top = after[0];
    standouts.push({
      key: 'after.workouts', title: 'After your workouts',
      line: workoutLabel(top) + ' on ' + fmtReportDate(top.date) + ' · '
        + (top.morning == null ? AFTER_WORKOUTS_PENDING : 'next morning ' + formatScore(top.morning)),
      detail: (
        <>
          {after.map((r) => (
            <Text key={r.date} style={styles.firstRow} allowFontScaling maxFontSizeMultiplier={1.4}
              accessibilityLabel={fmtReportDate(r.date) + ', ' + workoutLabel(r) + ', '
                + (r.morning == null ? AFTER_WORKOUTS_PENDING : 'next morning pain ' + formatScore(r.morning))}>
              <Text style={styles.firstDate}><Num>{fmtReportDate(r.date)}</Num></Text>
              <Num>{'   ' + workoutLabel(r) + '  ·  '}</Num>
              {r.morning == null
                ? <Text style={styles.firstDate}>{AFTER_WORKOUTS_PENDING}</Text>
                : <>{'next morning '}<Text style={styles.firstNum}>{formatScore(r.morning)}</Text></>}
            </Text>
          ))}
          <Say style={styles.noticeMeta}>{AFTER_WORKOUTS_NOTE}</Say>
        </>
      ),
    });
  }
  if (workoutLeads && workoutBestCopy && wk && wk.best) {
    const a = wk.best;
    standouts.push({
      key: 'best.workout', title: workoutBestCopy.title, line: workoutBestCopy.body,
      note: workoutBestCopy.disclaimer,
      detail: (
        <>
          <Say style={styles.noticeBody}>{workoutBestCopy.body}</Say>
          <WorkoutBars a={a} />
          <Say style={styles.noticeMeta}>
            {workoutBestCopy.sample
              + (a.from && a.to ? ' ' + fmtReportDate(a.from) + ' – ' + fmtReportDate(a.to) + '.' : '')}
          </Say>
          <Say style={styles.noticeMeta}>{workoutBestCopy.timing}</Say>
          {/* the selection line is the card, not a footnote: without it
              "lower after" reads as a verdict on the exercise */}
          <Say style={styles.noticeMeta}>{workoutBestCopy.disclaimer}</Say>
        </>
      ),
    });
  } else if (doseLeads && doseBestCopy && dz && dz.best) {
    const a = dz.best;
    standouts.push({
      key: 'best.dose', title: doseBestCopy.title, line: doseBestCopy.body,
      note: doseBestCopy.disclaimer,
      detail: (
        <>
          <Say style={styles.noticeBody}>{doseBestCopy.body}</Say>
          <DoseBars a={a} />
          <Say style={styles.noticeMeta}>
            {doseBestCopy.sample
              + (a.from && a.to ? ' ' + fmtReportDate(a.from) + ' – ' + fmtReportDate(a.to) + '.' : '')}
          </Say>
          <Say style={styles.noticeMeta}>{doseBestCopy.timing}</Say>
          {/* the regression line is the card, not a footnote: without
              it "lower after a dose" reads as a verdict on the tablet */}
          <Say style={styles.noticeMeta}>{doseBestCopy.disclaimer}</Say>
        </>
      ),
    });
  } else if (dayLeads && bestCopy && healthNoticed && healthNoticed.best) {
    const a = healthNoticed.best;
    standouts.push({
      key: 'best.' + a.kind, title: bestCopy.title, line: bestCopy.body,
      note: bestCopy.disclaimer,
      detail: (
        <>
          <Say style={styles.noticeBody}>{bestCopy.body}</Say>
          <GroupBars a={a} />
          <Say style={styles.noticeMeta}>
            {bestCopy.sample
              + (a.from && a.to ? ' ' + fmtReportDate(a.from) + ' – ' + fmtReportDate(a.to) + '.' : '')}
          </Say>
          <Say style={styles.noticeMeta}>
            {bestCopy.timing + ' Days without Health data are left out, never counted as anything.'}
          </Say>
          {a.basis === 'inBed' && (
            <Say style={styles.noticeMeta}>{IN_BED_NOTE}</Say>
          )}
        </>
      ),
    });
  } else if (healthNoticed && healthNoticed.fading.length > 0) {
    standouts.push({
      key: 'faded.' + healthNoticed.fading[0].kind, title: 'Something that faded',
      line: fadedCopy(healthNoticed.fading[0]),
      detail: (
        <Say style={styles.noticeBody}>
          {fadedCopy(healthNoticed.fading[0])}
        </Say>
      ),
    });
  } else if (dz && dz.fading.length > 0) {
    standouts.push({
      key: 'faded.dose.' + dz.fading[0].medId, title: 'Something that faded',
      line: fadedDoseCopy(dz.fading[0]),
      detail: (
        <Say style={styles.noticeBody}>
          {fadedDoseCopy(dz.fading[0])}
        </Say>
      ),
    });
  } else if (wk && wk.fading.length > 0) {
    standouts.push({
      key: 'faded.workout.' + wk.fading[0].activity, title: 'Something that faded',
      line: fadedWorkoutCopy(wk.fading[0]),
      detail: (
        <Say style={styles.noticeBody}>
          {fadedWorkoutCopy(wk.fading[0])}
        </Say>
      ),
    });
  }
  /* THE EARLY LOOKS. The same bars a claim would carry, before any
     claim may be made, captioned as a picture: a person who connected
     Health sees it doing something in the first week instead of a
     fortnight of silence. */
  early.forEach((e) => {
    const c = earlyCopy(e);
    standouts.push({
      key: 'e.' + e.kind, title: c.title, line: c.evidence,
      detail: (
        <>
          <GroupBars a={e} />
          <Say style={styles.noticeMeta}>{c.evidence}</Say>
          <Say style={styles.noticeMeta}>{EARLY_NOTE}</Say>
        </>
      ),
    });
  });
  doseEarly.forEach((e) => standouts.push({
    key: 'de.' + e.medId, title: e.med + ', around your doses so far',
    line: e.pairs + ' doses with a check-in before and after.',
    detail: (
      <>
        <DoseBars a={e} />
        <Say style={styles.noticeMeta}>
          {e.pairs + ' doses with a check-in before and after. ' + EARLY_NOTE}
        </Say>
      </>
    ),
  }));
  workoutEarly.forEach((e) => standouts.push({
    key: 'we.' + e.activity, title: capitalise(e.activity) + ', before and after so far',
    line: e.pairs + ' workouts with a check-in before and after.',
    detail: (
      <>
        <WorkoutBars a={e} />
        <Say style={styles.noticeMeta}>
          {e.pairs + ' workouts with a check-in before and after. ' + EARLY_NOTE}
        </Say>
      </>
    ),
  }));
  /* THE FIRST DAYS. One to three paired days: not a picture yet, so the
     facts themselves — the night and the morning's number, the mood and
     the evening's. Ten of these can be licensed at once in the first
     week; two stay on the page and the rest fold behind "Show more". */
  first.forEach((fd, i) => standouts.push({
    key: 'f.' + fd.kind, title: firstTitle(fd.kind),
    line: fd.pairs.length + (fd.pairs.length === 1 ? ' paired day' : ' paired days') + ' so far.',
    folded: i >= FIRST_DAYS_OPEN,
    detail: (
      <>
        {fd.pairs.map((p) => (
          <Text key={p.date} style={styles.firstRow} allowFontScaling maxFontSizeMultiplier={1.4}
            accessibilityLabel={fmtReportDate(p.date) + ', ' + factorLabel(fd.kind, p.factor)
              + ', pain ' + formatScore(p.pain)}>
            <Text style={styles.firstDate}><Num>{fmtReportDate(p.date)}</Num></Text>
            <Num>{'   ' + factorLabel(fd.kind, p.factor) + '  ·  pain '}</Num>
            <Text style={styles.firstNum}>{formatScore(p.pain)}</Text>
          </Text>
        ))}
        <Say style={styles.noticeMeta}>{FIRST_NOTE}</Say>
      </>
    ),
  }));
  doseFirst.forEach((fd) => standouts.push({
    key: 'df.' + fd.medId, title: fd.med + ', around the first doses',
    line: fd.pairs.length + (fd.pairs.length === 1 ? ' dose' : ' doses') + ' so far.',
    detail: (
      <>
        {fd.pairs.map((p) => (
          <Text key={p.date} style={styles.firstRow} allowFontScaling maxFontSizeMultiplier={1.4}
            accessibilityLabel={fmtReportDate(p.date) + ', pain ' + formatScore(p.before)
              + ' before the dose, ' + formatScore(p.after) + ' after'}>
            <Text style={styles.firstDate}><Num>{fmtReportDate(p.date)}</Num></Text>
            {'   before '}
            <Text style={styles.firstNum}>{formatScore(p.before)}</Text>
            {'  ·  after '}
            <Text style={styles.firstNum}>{formatScore(p.after)}</Text>
          </Text>
        ))}
        <Text style={styles.noticeMeta} allowFontScaling maxFontSizeMultiplier={1.4}>
          The doses so far, as recorded — a picture starts at three, and a dose is
          often taken when pain is high.
        </Text>
      </>
    ),
  }));
  /* THE FIRST WORKOUTS. The first swim with a number before and after
     it is exactly the fact a person went in for, and it is shown as
     that — two numbers and a date, with the sentence still to come. */
  workoutFirst.forEach((fd) => standouts.push({
    key: 'wf.' + fd.activity, title: capitalise(fd.activity) + ', before and after',
    line: fd.pairs.length + (fd.pairs.length === 1 ? ' workout' : ' workouts') + ' so far.',
    detail: (
      <>
        {fd.pairs.map((p) => (
          <Text key={p.date} style={styles.firstRow} allowFontScaling maxFontSizeMultiplier={1.4}
            accessibilityLabel={fmtReportDate(p.date) + ', pain ' + formatScore(p.before)
              + ' before ' + fd.activity + ', ' + formatScore(p.after) + ' after'}>
            <Text style={styles.firstDate}><Num>{fmtReportDate(p.date)}</Num></Text>
            {'   before '}
            <Text style={styles.firstNum}>{formatScore(p.before)}</Text>
            {'  ·  after '}
            <Text style={styles.firstNum}>{formatScore(p.after)}</Text>
          </Text>
        ))}
        <Text style={styles.noticeMeta} allowFontScaling maxFontSizeMultiplier={1.4}>
          The workouts so far, as recorded — a picture starts at three, and a workout
          happens on the days you felt able to.
        </Text>
      </>
    ),
  }));
  /* doses whose pairs formed: the bars, with the observation's words
     or — for a change that did not lead — no words beyond the timing
     and the regression line */
  doseGroups.forEach((a) => standouts.push({
    key: 'd.' + a.medId, title: a.med + ', around your doses',
    line: a.verdict === 'observation' ? doseObservationCopy(a) : DOSE_TIMING,
    detail: (
      <>
        {a.verdict === 'observation' && (
          <Say style={styles.noticeBody}>
            {doseObservationCopy(a)}
          </Say>
        )}
        <DoseBars a={a} />
        <Say style={styles.noticeMeta}>{DOSE_TIMING}</Say>
      </>
    ),
  }));
  workoutGroups.forEach((a) => standouts.push({
    key: 'w.' + a.activity, title: capitalise(a.activity) + ', before and after',
    line: a.verdict === 'observation' ? workoutObservationCopy(a) : WORKOUT_TIMING,
    detail: (
      <>
        {a.verdict === 'observation' && (
          <Say style={styles.noticeBody}>
            {workoutObservationCopy(a)}
          </Say>
        )}
        <WorkoutBars a={a} />
        <Say style={styles.noticeMeta}>{WORKOUT_TIMING}</Say>
      </>
    ),
  }));
  otherGroups.forEach((a) => {
    const w = groupLabels(a.kind);
    const line = 'No meaningful difference in ' + w.outcome + ' between these groups so far — '
      + 'that is a finding about these ' + a.pairedDays + ' days, not a failure of them.';
    standouts.push({
      key: 'g.' + a.kind, title: w.factor + ', against your record', line,
      detail: (
        <>
          <Say style={styles.noticeBody}>{line}</Say>
          <GroupBars a={a} />
          <Say style={styles.noticeMeta}>{w.timing}</Say>
        </>
      ),
    });
  });
  /* what is still short of a picture — a fact about the wait, so the
     card has nothing further to open */
  if (collectingShown.length > 0) {
    const lines: string[] = [];
    if (notYetPaired.length > 0) {
      lines.push('No paired day yet for ' + notYetPaired.join(', ') + '. A comparison needs the '
        + 'days on both sides of it — a morning check-in for sleep, an evening one for movement.');
    }
    if (stillCounting.length > 0) {
      lines.push('Still counting: ' + stillCounting.join(' · ') + ' — paired days on both sides of '
        + 'the comparison, a few of each, before a picture can be drawn.');
    }
    standouts.push({ key: 'collecting', title: 'Still collecting', line: lines.join(' '), detail: null });
  }

  return (
    <View style={styles.page}>
      {/* the range is the fact; what to make of it folds behind the (i),
          with the short-record caveat while it applies */}
      <RangeHead
        title={fmtReportDate(data.rangeStart) + ' – ' + fmtReportDate(data.rangeEnd)}
        text={'What you’ve recorded over this range, and nothing inferred from it.'
          + (data.limited
            ? ' Still a short record — ' + data.loggedDays
              + (data.loggedDays === 1 ? ' day' : ' days')
              + ' logged, so changes over time aren’t worth reading much into yet.'
            : '')}
      />

      {/* ── 1. your pain ─────────────────────────────────────
          The record itself leads: the chart, the two figures, and the
          sentences that read it. The extremes open their days.

          THE CARD'S VALUE IS THE AVERAGE OF WHAT WAS ENTERED, set like
          Today's — the big rounded figure, its word as the unit — and
          it is the only big number here. It is the range's own average,
          which moves only when the range or the record does: never a
          change against last week, never a score. */}
      <Card
        icon="chart.bar.fill"
        title={data.limited ? 'Pain recorded so far' : 'Your pain'}
        note="Blank days were not logged. Colour is the day’s average pain, 0–10. Every number here is an average of what you entered — not a score of how you are doing."
      >
        <View
          style={styles.painHead}
          accessible
          accessibilityLabel={'Average ' + formatScore(data.avg) + ', ' + painLabel(data.avg) + '. '
            + data.loggedDays + (data.loggedDays === 1 ? ' day' : ' days') + ' recorded'
            + (data.limitation
              ? ', limited by pain ' + data.limitation.avg + ' out of 10 across '
                + data.limitation.days + (data.limitation.days === 1 ? ' evening' : ' evenings')
              : '')}
        >
          <BigValue compact prefix="Average" value={formatScore(data.avg)} unit={painLabel(data.avg)} />
          <Say style={summaryCard.sub}>
            {data.loggedDays + ' ' + (data.loggedDays === 1 ? 'day' : 'days') + ' recorded'
              /* the second number, beside the first and never blended
                 with it: how much it cost, on the evenings that said */
              + (data.limitation
                ? ' · limited by pain ' + data.limitation.avg + '/10 across '
                  + data.limitation.days + (data.limitation.days === 1 ? ' evening' : ' evenings')
                : '')}
          </Say>
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
                  <Say style={[styles.segText, on && styles.segTextOn]} lines={1}>
                    {r.short}
                  </Say>
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
        {!!data.halves && (
          <Direction first={data.halves.first} second={data.halves.second} />
        )}

        {/* the extremes, as doors — a summary that names a day opens it.
            Two rows of Health's inset list: the word, the figure and its
            date in grey, the chevron that says where the tap goes. */}
        <View style={styles.extremes}>
          <Press
            onPress={() => onOpenDay(data.lowestDayDate)}
            pressOpacity={0.7}
            style={styles.extremeRow}
            accessibilityRole="button"
            accessibilityLabel={'Lowest day, ' + formatScore(data.lowestDay)
              + ', ' + shortDate(data.lowestDayDate) + '. Opens this day'}
          >
            <Text style={styles.extremeKey} allowFontScaling maxFontSizeMultiplier={1.3}>Lowest</Text>
            <Say style={styles.extremeVal}>
              {formatScore(data.lowestDay) + ' · ' + shortDate(data.lowestDayDate)}
            </Say>
            <Door />
          </Press>
          <Press
            onPress={() => onOpenDay(data.highestDayDate)}
            pressOpacity={0.7}
            style={styles.extremeRow}
            accessibilityRole="button"
            accessibilityLabel={'Highest day, ' + formatScore(data.highestDay)
              + ', ' + shortDate(data.highestDayDate) + '. Opens this day'}
          >
            <Text style={styles.extremeKey} allowFontScaling maxFontSizeMultiplier={1.3}>Highest</Text>
            <Say style={styles.extremeVal}>
              {formatScore(data.highestDay) + ' · ' + shortDate(data.highestDayDate)}
            </Say>
            <Door />
          </Press>
        </View>

      </Card>

      {/* ── 2. what stands out ─────────────────────────────
          The one place on which anything like a claim may appear, and
          only after the gates. ONE CARD PER THING, since 17 Sep 2026:
          it used to be a single card holding every sentence, picture
          and list in a column, and a person with Health connected read
          a page of sub-blocks before reaching the second one. Now each
          thing is its own card — the sentence and one line under it —
          and opens to be read in full: the squares, the sample, the
          timing, and what it does not mean. Absent when none of that
          exists — silence is a valid section. */}
      <InfoTitle
        title="What stands out"
        titleStyle={styles.sectionTitle}
        style={styles.sectionHead}
        label="About what stands out"
        text={STANDOUT_NOTE}
      />
      {(firstOpen ? standouts : standouts.filter((c) => !c.folded)).map((c) => (
        <StandoutCard key={c.key} card={c} onOpen={() => setOpenCard(c)} />
      ))}
      {!firstOpen && standouts.some((c) => c.folded) && (
        <Press
          onPress={() => setFirstOpen(true)}
          pressOpacity={0.7}
          style={styles.more}
          accessibilityRole="button"
          accessibilityLabel={'Show ' + standouts.filter((c) => c.folded).length + ' more first-days lists'}
        >
          <Say style={styles.moreText}>
            {'Show ' + standouts.filter((c) => c.folded).length + ' more'}
          </Say>
          <Door down />
        </Press>
      )}
      {standouts.length === 0 && (
        <View style={[summaryCard.box, styles.box]}>
          <Text style={summaryCard.sub} allowFontScaling maxFontSizeMultiplier={1.4}>
            Nothing yet. This fills as the record does — a few days of check-ins,
            and Apple Health if you connect it.
          </Text>
        </View>
      )}

      {/* the card, read in full: a sheet over the page, with the same
          sentence about what it is not at its foot */}
      <Modal
        visible={!!openCard}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpenCard(null)}
      >
        {openCard && <StandoutSheet card={openCard} onClose={() => setOpenCard(null)} />}
      </Modal>

      {/* ── 3. the handoff ──────────────────────────────────
          Straight after the findings, above the folded appendix: the
          report is the thing this screen is most often opened to make.
          The one filled button on the page — white, black words, the
          same shape as Today's Check in — because it is the one thing
          this screen exists to let a person do. */}
      {!!onShare && (
        <Card icon="doc.text.fill" title="Share with your clinician">
          <Text style={summaryCard.sub} allowFontScaling maxFontSizeMultiplier={1.4}>
            A PDF of this record — your background, the numbers above, and what
            they do and don’t mean. Made on this iPhone, sent only where you
            send it, and it says on its face that it is self-recorded and not a
            diagnosis.
          </Text>
          <Press
            onPress={onShare}
            pressOpacity={0.8}
            style={[summaryCard.primary, styles.shareBtn, !!sharing && styles.shareBusy]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !!sharing }}
            accessibilityLabel={sharing ? 'Preparing the PDF' : 'Create the PDF and open the share sheet'}
          >
            <Text style={summaryCard.primaryText} allowFontScaling maxFontSizeMultiplier={1.3}>
              {sharing ? 'Preparing…' : 'Create the PDF'}
            </Text>
          </Press>
        </Card>
      )}
      {/* ── 4. your record ──────────────────────────────────
          The appendix, folded WHOLE since 30 Sep 2026: the band chart
          and the most-recorded lines used to show above the fold, and
          Patterns read as three screens of counts before the report.
          Closed, it is a title, one row, and the sentence about what it
          is not. Counts, never findings, and the card says so inside
          itself. */}
      <Card
        icon="list.bullet"
        title="Your record"
        note="Counts of what you recorded, never findings. What you noticed is your own read of a day, so it can’t be weighed against the days you didn’t notice it."
      >
        {!recordOpen ? (
          <Press
            onPress={() => setRecordOpen(true)}
            pressOpacity={0.7}
            style={styles.foldOpen}
            accessibilityRole="button"
            accessibilityLabel="Show your record: how the days split, the hardest and easiest days, the tables and the events"
          >
            <Text style={styles.foldOpenText} allowFontScaling maxFontSizeMultiplier={1.3}>Show details</Text>
            <Door down />
          </Press>
        ) : (
          <>
            {feltBands.length > 0 && (
              <>
                <Text style={styles.subhead}>Days like this</Text>
                <Stack segments={feltBands.map((b) => ({ key: b.key, n: b.n, tint: b.tint }))} />
                <Key items={feltBands} square />
                <InfoTip
                  label="About days like this"
                  text={'Your ' + data.days.length + ' logged ' + (data.days.length === 1 ? 'day' : 'days')
                    + ', grouped by how they averaged — the same days as the chart, counted by band. It says how many days were like this, not how you are doing.'}
                />
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
                        <Say style={styles.contrastCount}>
                          {c.harderDays + '/' + he.harder.days + ' hardest · '
                            + c.easierDays + '/' + he.easier.days + ' easiest'}
                        </Say>
                      </View>
                    ))}
                  </>
                )}
                <InfoTip
                  label="About hardest and easiest days"
                  text={'The highest and lowest third of your logged days, with the middle third ('
                    + he.middleDays + (he.middleDays === 1 ? ' day' : ' days')
                    + ') set aside. This describes where the pain was and how you described it — not what caused it.'}
                />
              </View>
            )}

            {(data.locations.length > 0 || data.qualities.length > 0 || data.symptoms.length > 0 || data.timeOfDay.length > 0) && (
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
                        tint: summary.text,
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
                        tint: summary.text,
                      }))}
                    />
                  </>
                )}
                {data.symptoms.length > 0 && (
                  <>
                    <Text style={styles.subhead}>Also marked</Text>
                    <FoldedList
                      bars
                      label="symptoms"
                      items={data.symptoms.map((x) => ({
                        key: x.id,
                        left: x.name,
                        right: x.days + (x.days === 1 ? ' day' : ' days'),
                        frac: x.days / Math.max(1, data.symptoms[0].days),
                        tint: summary.text,
                      }))}
                    />
                    {/* the sentence about what the count is not, inside
                        the card it qualifies */}
                    <InfoTip
                      label="About the symptoms count"
                      text="Days you marked it at a check-in. A day without a mark is not a day without it."
                    />
                  </>
                )}
                {data.timeOfDay.length > 0 && (
                  <>
                    <Text style={styles.subhead}>Time of day</Text>
                    {/* averages of pain, so squares in the ramp — the
                        one list in this card that is not a count */}
                    {data.timeOfDay.map((b) => (
                      <ChipRow
                        key={b.key}
                        v={b.avg}
                        label={b.label}
                        sub={b.range + ' · ' + b.checkins
                          + (b.checkins === 1 ? ' check-in' : ' check-ins')}
                      />
                    ))}
                    <InfoTip
                      label="About time of day"
                      text="These are the averages of when you happened to check in — not a claim about when your pain is worst."
                    />
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
                <InfoTip
                  label="About events"
                  text={'Events sit alongside your check-ins. Their timing doesn’t prove they caused a change'
                    + (tried.length > 0
                      ? '; impressions are your own, afterwards, recorded as you gave them.'
                      : '.')}
                />
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

    </View>
  );
}

const styles = StyleSheet.create({
  /* the same gutter Today and the Map sit in. This screen used to run
     full-bleed, which made it the one page whose text started somewhere
     different from every other page's. The cards take the shared
     SummaryCard surface with its own side margin cancelled (`box`), since
     the page already holds them in the gutter. */
  page: { paddingHorizontal: size.pageX, paddingTop: 2 },
  box: { marginHorizontal: 0 },
  cardBody: { marginTop: 10 },
  cardNote: { marginTop: 14 },
  emptyWrap: { paddingTop: 8 },
  empty: { color: summary.secondary, fontSize: font.body, lineHeight: 24 },
  /* the range above the first card: grey, like the meta beside a
     Highlights title, with the (i) at its end */
  rangeHead: { paddingHorizontal: 4 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sub: { flex: 1, color: summary.secondary, fontSize: font.subheadline, lineHeight: 20 },
  rangeNote: { color: summary.tertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 6 },
  /* one paired day as a line: the date in grey, the numbers in ink —
     no square, because a single day's number beside its date is a fact
     in a sentence, and the sentence already says it is pain */
  firstRow: {
    color: summary.secondary, fontSize: font.subheadline, lineHeight: 22, marginTop: 4,
    fontVariant: ['tabular-nums'],
  },
  firstDate: { color: summary.tertiary },
  firstNum: { color: summary.text, fontWeight: '700', fontFamily: ROUNDED },
  subBlock: {
    marginTop: 18, paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: summary.separator,
  },
  subBlockTitle: {
    color: summary.text, fontSize: font.body, fontWeight: '600',
    marginBottom: 10,
  },
  /* a section of cards: the title sits on the page above them, with the
     (i) that qualifies all of them — Highlights' 20pt, from the mockup */
  sectionHead: { marginTop: 24, marginBottom: 0, paddingHorizontal: 4 },
  sectionTitle: {
    color: summary.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.24,
  },
  /* the stand-out card: Health's Highlights anatomy — the glyph and the
     sentence on one line, the chevron at the end, the line under it */
  standoutHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  standoutIcon: { width: 20, height: 22, alignItems: 'center', justifyContent: 'center' },
  standoutChev: { height: 22, justifyContent: 'center' },
  noticeTitle: {
    flex: 1, color: summary.text, fontSize: font.body, fontWeight: '600', lineHeight: 22,
  },
  /* the sheet's text: the same type scale as everything else on this
     screen; a finding earns no bigger font than a fact */
  noticeBody: {
    color: summary.text, fontSize: font.subheadline, lineHeight: 21, marginTop: 6,
  },
  noticeMeta: {
    color: summary.secondary, fontSize: font.footnote, lineHeight: 18, marginTop: 8,
    fontVariant: ['tabular-nums'],
  },
  standoutLine: { color: summary.secondary, fontSize: font.subheadline, lineHeight: 20, marginTop: 6 },
  standoutNote: { color: summary.tertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 8 },
  /* the stand-out sheet: the app's sheet surface and the app's sheet bar */
  sheet: { flex: 1, backgroundColor: color.bgSheet },
  sheetBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: summary.separator,
  },
  sheetTitle: {
    flex: 1, textAlign: 'center', color: summary.text, fontSize: font.body, fontWeight: '600',
    /* centred on the sheet: the bar has a button on the right only */
    paddingLeft: 72,
  },
  sheetBtn: { minWidth: 72, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  sheetBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  sheetBody: { padding: size.sheetX, paddingTop: 22, paddingBottom: 60 },
  sheetIcon: { marginBottom: 10, alignSelf: 'flex-start' },
  sheetHeadline: {
    color: summary.text, fontSize: font.title2, fontWeight: '700', letterSpacing: -0.3, lineHeight: 28,
  },
  sheetDetail: { marginTop: 14 },
  sheetNote: {
    color: summary.tertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 22,
    paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: summary.separator,
  },
  /* ── the drawn shapes ──────────────────────────────────── */
  barRow: { gap: 6, paddingVertical: 7 },
  barHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10 },
  barLabel: {
    flex: 1, color: summary.text, fontSize: font.subheadline, lineHeight: 20,
  },
  barRight: {
    color: summary.secondary, fontSize: font.subheadline, fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  barSub: { color: summary.tertiary, fontSize: font.footnote, lineHeight: 18 },
  /* Health's thin capsule: white on the grey track, nothing on the ends */
  barTrack: {
    flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden',
    backgroundColor: color.bgSegmentTrack,
  },
  barFill: { flexBasis: 0, borderRadius: 3 },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  chipText: { flex: 1, gap: 1 },
  stackTrack: {
    flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden',
    backgroundColor: color.bgSegmentTrack, marginTop: 4, gap: 2,
  },
  keyWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  keyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  keyDot: { width: 9, height: 9, borderRadius: 5 },
  /* a pain band's swatch is a square, like every pain value; the edge
     keeps the darkest band visible on the card */
  keySquare: {
    width: 10, height: 10, borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  keyText: {
    color: summary.secondary, fontSize: font.footnote, fontVariant: ['tabular-nums'],
  },
  splitWrap: { marginBottom: 14 },
  splitCells: { flexDirection: 'row', gap: 3 },
  splitCell: { flex: 1, height: 22, borderRadius: 6, borderCurve: 'continuous' },
  splitLit: { borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)' },
  splitOff: { backgroundColor: color.bgSegmentTrack },
  splitAxis: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 8,
  },
  direction: { marginTop: 12, gap: 2 },
  directionSub: {
    color: summary.tertiary, fontSize: font.footnote, lineHeight: 18, fontVariant: ['tabular-nums'],
  },
  /* the plot and the scale beside it */
  chartBody: { flexDirection: 'row', gap: 6 },
  plot: { flex: 1, height: PLOT_H, justifyContent: 'flex-end' },
  gridLine: {
    position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth,
    backgroundColor: summary.separator,
  },
  /* the floor a touch brighter than the lines above it, as Health rules it */
  gridBase: { backgroundColor: '#48484A' },
  gutter: { width: 20, height: PLOT_H },
  gutterText: {
    position: 'absolute', left: 0, right: 0,
    color: summary.tertiary, fontSize: 11, lineHeight: 14, fontFamily: ROUNDED,
    fontVariant: ['tabular-nums'],
  },
  /* the easier end of the scale, marked so the direction is seen rather
     than remembered */
  easierBand: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#48484A',
  },
  chartRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: PLOT_H,
  },
  chartSlot: { flex: 1, justifyContent: 'flex-end', minHeight: 44 },
  /* Health's bar: a rounded top on a square foot, so it stands on the
     floor line; the edge keeps a 10 visible against the card */
  bar: {
    borderTopLeftRadius: 4, borderTopRightRadius: 4,
    borderBottomLeftRadius: 1, borderBottomRightRadius: 1,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  /* a gap is still a target: without one, the days you did not log are the
     only ones you cannot ask about */
  emptyCol: {
    height: 2, borderRadius: 1, backgroundColor: color.bgSegmentTrack,
  },
  emptyColOn: { backgroundColor: summary.chevron, height: 4 },
  /* the readout as a button: the text it always showed, plus the
     chevron that says it goes somewhere */
  readoutOpen: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  readout: { height: 32, justifyContent: 'center', marginTop: 4 },
  readoutText: { color: summary.secondary, fontSize: font.subheadline },
  readoutStrong: {
    color: summary.text, fontSize: 20, fontWeight: '700', fontFamily: ROUNDED,
    fontVariant: ['tabular-nums'],
  },
  readoutHint: { color: summary.tertiary, fontSize: font.footnote },
  /* Health's segmented control, on the card: Apple's fill for the track
     (#1C1C1E, the mockup's track, is the card itself here) and the
     mockup's #636366 for the chosen width */
  segment: {
    flexDirection: 'row', gap: 2, padding: 2, height: 32, borderRadius: 9, borderCurve: 'continuous',
    backgroundColor: 'rgba(118,118,128,0.24)', marginTop: 14,
  },
  segItem: {
    flex: 1, borderRadius: 7, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  segItemOn: { backgroundColor: summary.chevron },
  segText: { color: summary.text, fontSize: font.footnote, fontWeight: '500' },
  segTextOn: { fontWeight: '600' },
  chartAxis: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginRight: 26,
  },
  axisText: { color: summary.tertiary, fontSize: 12 },
  foldRow: {
    minHeight: 44, alignItems: 'center', justifyContent: 'center',
  },
  foldText: { color: summary.text, fontSize: font.subheadline, fontWeight: '600' },
  /* the closed appendix: one row, the word and the chevron that opens it */
  foldOpen: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: summary.separator,
  },
  foldOpenText: { color: summary.text, fontSize: font.body },
  contrastRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, minHeight: 36,
  },
  contrastName: { flexShrink: 1, color: summary.text, fontSize: font.subheadline },
  contrastCount: {
    color: summary.secondary, fontSize: font.footnote,
    fontVariant: ['tabular-nums'],
  },
  subhead: {
    color: summary.secondary, fontSize: font.footnote, fontWeight: '600',
    marginTop: 12, marginBottom: 2,
  },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 10, paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: summary.separator,
  },
  rowLeft: { color: summary.text, fontSize: font.subheadline, lineHeight: 20, flexShrink: 1 },
  rowRight: {
    color: summary.secondary, fontSize: font.subheadline, fontVariant: ['tabular-nums'],
  },
  /* an end of the record, as an inset tile one step lighter than the
     card — Health's nested surface */
  endCard: {
    borderRadius: 12, borderCurve: 'continuous', padding: 12, marginBottom: 8,
    backgroundColor: color.bgSegmentTrack, gap: 3,
  },
  endTitle: { color: summary.text, fontSize: font.subheadline, fontWeight: '600' },
  endWhen: {
    color: summary.secondary, fontSize: font.footnote, fontVariant: ['tabular-nums'],
  },
  endLine: { color: summary.secondary, fontSize: font.footnote, lineHeight: 18 },
  more: {
    minHeight: 44, flexDirection: 'row', gap: 6,
    alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  moreText: { color: summary.text, fontSize: font.subheadline, fontWeight: '600' },
  /* two lines, deliberately. This was one row with the count on the
     right, and the moment the count grew a second clause ("· limited by
     pain 3/10 across 2 evenings") it wrapped under the average and ran
     off the card's edge — "Moderate2 days recorded · limited b". */
  painHead: { gap: 2 },
  extremes: { marginTop: 12 },
  extremeRow: {
    minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: summary.separator,
  },
  extremeKey: { flex: 1, color: summary.text, fontSize: font.body },
  extremeVal: { color: summary.secondary, fontSize: font.subheadline, fontVariant: ['tabular-nums'] },
  profileLine: {
    color: summary.text, fontSize: font.subheadline, lineHeight: 22, marginTop: 6,
  },
  profileKey: { color: summary.secondary, fontSize: font.footnote, fontWeight: '600' },
  shareBtn: { marginTop: 16 },
  /* while the PDF is made: the same button, quieter, so a second tap is
     visibly not going to start a second one */
  shareBusy: { opacity: 0.6 },
});
