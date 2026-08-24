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
import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as db from './db';
import { Press } from './motion';
import {
  EVENT_LABELS, Entries, FuncEntry, INTERVENTIONS, PainEvent, RESPONSE_LABELS,
  Response, dateFromISO, fmtTime,
} from './model';
import { formatScore, painColor, painLabel } from './painScale';
import { EndOfRecord, ReportData, buildReportData, fmtReportDate, reportHtml } from './report';
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

  return (
    <View>
      {/* the readout sits ABOVE the bars and holds its height whether or
          not anything is selected, so tapping never shifts the layout */}
      <View style={styles.readout}>
        {pick && pick.avg != null ? (
          <Text style={styles.readoutText} allowFontScaling maxFontSizeMultiplier={1.3}>
            <Text style={styles.readoutStrong}>{formatScore(pick.avg)}/10</Text>
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
            <Press
              key={c.date}
              onPress={() => onSelect(on ? null : c.date)}
              pressOpacity={0.7}
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
                    height: Math.max(3, (c.avg / 10) * 76),
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
            </Press>
          );
        })}
      </View>
      <View style={styles.chartAxis}>
        <Text style={styles.axisText}>{shortDate(cols[0].date)}</Text>
        <Text style={styles.axisText}>{shortDate(cols[cols.length - 1].date)}</Text>
      </View>
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

function Row({ left, right }: { left: string; right?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.bodyText} numberOfLines={2}>{left}</Text>
      {!!right && <Text style={styles.rowRight}>{right}</Text>}
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
        {e.days} {e.days === 1 ? 'day' : 'days'} · {when} · averaging {formatScore(e.avg)}/10
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
  entries, events, func, goalText, todayIso,
}: TrendsScreenProps) {
  const [rangeKey, setRangeKey] = useState('m');
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

  const [sharing, setSharing] = useState(false);

  const sharePdf = async () => {
    if (!data || sharing) return;
    setSharing(true);
    try {
      const { uri } = await Print.printToFileAsync({ html: reportHtml(data) });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          UTI: 'com.adobe.pdf',
          dialogTitle: 'Pattern — summary for your doctor',
        });
      } else {
        Alert.alert('Sharing isn’t available on this device.');
      }
    } catch {
      Alert.alert('Couldn’t create the PDF', 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

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

  const tried = data.events.filter((ev) => ev.intervention || ev.resp || ev.helped != null);

  return (
    <View style={styles.page}>
      <Text style={styles.sub} allowFontScaling maxFontSizeMultiplier={1.5}>
        What you’ve recorded, {fmtReportDate(data.rangeStart)} – {fmtReportDate(data.rangeEnd)}.
      </Text>

      {data.limited && (
        <View style={styles.limited}>
          <Text style={styles.limitedTitle}>
            Limited record — {data.loggedDays} {data.loggedDays === 1 ? 'day' : 'days'} logged
          </Text>
          <Text style={styles.limitedSub}>
            This shows what’s here. More days are needed before changes over
            time can be meaningfully reviewed.
          </Text>
        </View>
      )}

      {/* ── the numbers ─────────────────────────────────────── */}
      <Text style={styles.section}>Your record</Text>
      <Text style={styles.rangeLine}>Scale 0–10, 0 = no pain</Text>
      <View style={styles.metrics}>
        <Metric label="Average pain" value={formatScore(data.avg) + '/10'} sub={painLabel(data.avg)} />
        <Metric label="Lowest day" value={formatScore(data.lowestDay) + '/10'} />
        <Metric label="Highest day" value={formatScore(data.highestDay) + '/10'} />
        <Metric label="Logged days" value={String(data.loggedDays)} />
        <Metric label="Check-ins" value={String(data.totalCheckins)} />
        {data.goalText != null && data.latestAbility != null && (
          <Metric
            label="Weekly ability"
            value={data.latestAbility.ability + '/10'}
            sub={data.goalText}
          />
        )}
      </View>

      {/* ── pain over time ──────────────────────────────────── */}
      <Text style={styles.section}>
        {data.limited ? 'Pain recorded so far' : 'Pain over time'}
      </Text>
      <View style={styles.segment}>
        {/* a fixed range longer than the record shows exactly what All
            shows — a control that changes nothing is not offered */}
        {RANGES.filter((r) => r.days === 0 || r.days < spanRecord).map((r) => {
          const on = r.key === rangeKey;
          return (
            <Press
              key={r.key}
              onPress={() => { setRangeKey(r.key); setPicked(null); }}
              pressOpacity={0.85}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={r.label}
              style={[styles.segItem, on && styles.segItemOn]}
            >
              <Text style={[styles.segText, on && styles.segTextOn]}
                allowFontScaling maxFontSizeMultiplier={1.2} numberOfLines={1}>
                {r.label}
              </Text>
            </Press>
          );
        })}
      </View>
      <MiniChart data={data} span={spanDays} selected={picked} onSelect={setPicked} />
      <Text style={styles.noteLine}>
        Days without check-ins stay blank — nothing is filled in for a day you
        didn’t log.
      </Text>
      {!!data.halves && (
        <Text style={styles.noteLine}>
          First half of this period averaged {formatScore(data.halves.first)}/10,
          second half {formatScore(data.halves.second)}/10.
        </Text>
      )}

      {/* ── the two ends ────────────────────────────────────── */}
      {!!data.harderEasier && (
        <>
          <Text style={styles.section}>Hardest and easiest days</Text>
          <End
            title="Hardest days"
            when={formatScore(data.harderEasier.boundaryHigh) + '/10 and above'}
            e={data.harderEasier.harder}
          />
          <End
            title="Easiest days"
            when={formatScore(data.harderEasier.boundaryLow) + '/10 and below'}
            e={data.harderEasier.easier}
          />
          <Text style={styles.noteLine}>
            The highest and lowest third of your logged days, with the middle
            third ({data.harderEasier.middleDays}{' '}
            {data.harderEasier.middleDays === 1 ? 'day' : 'days'}) set aside.
            This describes where the pain was and how you described it — not
            what caused it.
          </Text>
        </>
      )}

      {/* ── time of day ─────────────────────────────────────── */}
      {data.timeOfDay.length > 0 && (
        <>
          <Text style={styles.section}>Time of day</Text>
          {data.timeOfDay.map((b) => (
            <View key={b.key} style={styles.row}>
              <View style={styles.bandMain}>
                <Text style={styles.bodyText}>{b.label}</Text>
                <Text style={styles.bandRange}>{b.range}</Text>
              </View>
              <Text style={styles.rowRight}>
                {formatScore(b.avg)}/10 · {b.checkins}
              </Text>
            </View>
          ))}
          <Text style={styles.noteLine}>
            The average of the check-ins you recorded in each part of the day,
            with how many are behind it. It reflects when you checked in — not
            a claim about when your pain is worst.
          </Text>
        </>
      )}

      {/* ── where ───────────────────────────────────────────── */}
      {data.locations.length > 0 && (
        <>
          <Text style={styles.section}>Where</Text>
          {data.locations.slice(0, 8).map((l) => (
            <Row key={l.id} left={l.name} right={l.days + (l.days === 1 ? ' day' : ' days')} />
          ))}
        </>
      )}

      {/* ── described as ────────────────────────────────────── */}
      {data.qualities.length > 0 && (
        <>
          <Text style={styles.section}>Described as</Text>
          {data.qualities.slice(0, 8).map((q) => (
            <Row key={q.id} left={q.name} right={'×' + q.count} />
          ))}
        </>
      )}

      {/* ── what you pointed at ─────────────────────────────── */}
      {(data.flagged.worse.length > 0 || data.flagged.better.length > 0) && (
        <>
          <Text style={styles.section}>What you pointed at</Text>
          {data.flagged.worse.length > 0 && (
            <>
              <Text style={styles.subhead}>Made it harder</Text>
              {data.flagged.worse.slice(0, 6).map((f) => (
                <Row key={'w' + f.id} left={f.name}
                  right={f.days + (f.days === 1 ? ' day' : ' days')} />
              ))}
            </>
          )}
          {data.flagged.better.length > 0 && (
            <>
              <Text style={styles.subhead}>Helped</Text>
              {data.flagged.better.slice(0, 6).map((f) => (
                <Row key={'b' + f.id} left={f.name}
                  right={f.days + (f.days === 1 ? ' day' : ' days')} />
              ))}
            </>
          )}
          <Text style={styles.noteLine}>
            This is your read on those days, counted — not a comparison. A thing
            only lands here on days you already suspected it, so there are no
            days without it to weigh against. Pattern will offer to ask about
            something properly once you’ve pointed at it enough times.
          </Text>
        </>
      )}

      {/* ── function ────────────────────────────────────────── */}
      {!!data.goalText && (
        <>
          <Text style={styles.section}>Function</Text>
          <Text style={styles.bodyText}>
            {data.goalText}
            {data.latestAbility
              ? ' — latest weekly ability ' + data.latestAbility.ability + '/10'
              : ' — no weekly ratings yet'}
            {data.abilityChange && !data.limited
              ? '. Since the first rating: ' + data.abilityChange.first.ability
                + '/10 → ' + data.abilityChange.last.ability + '/10.'
              : '.'}
          </Text>
          <Text style={styles.noteLine}>
            Ability is a separate scale from pain, and a higher number is
            better. The two are never averaged together.
          </Text>
        </>
      )}

      {/* ── what you tried ──────────────────────────────────── */}
      {tried.length > 0 && (
        <>
          <Text style={styles.section}>What you tried</Text>
          {tried.slice(-8).map((ev, i) => (
            <Row
              key={ev.id != null ? 't' + ev.id : 'ti' + i}
              left={
                shortDate(ev.date) + ' · '
                + (ev.intervention ? INTERVENTIONS[ev.intervention] || ev.intervention : EVENT_LABELS[ev.kind])
                + (ev.text ? ' — ' + ev.text : '')
              }
              right={outcomeOf(ev)}
            />
          ))}
          <Text style={styles.noteLine}>
            Your own impression afterwards, recorded as you gave it. Pattern
            doesn’t assess whether something worked.
          </Text>
        </>
      )}

      {/* ── events ──────────────────────────────────────────── */}
      {data.events.length > 0 && (
        <>
          <Text style={styles.section}>Events</Text>
          {data.events.slice(-8).map((ev, i) => (
            <Row
              key={ev.id != null ? 'e' + ev.id : 'ei' + i}
              left={
                shortDate(ev.date) + ' ' + fmtTime(ev.h) + ' · ' + EVENT_LABELS[ev.kind]
                + (ev.text ? ' — ' + ev.text : '')
              }
            />
          ))}
          <Text style={styles.noteLine}>
            Events sit alongside your check-ins. Their timing doesn’t prove they
            caused a change.
          </Text>
        </>
      )}

      {/* ── share ───────────────────────────────────────────── */}
      <Press
        onPress={sharePdf}
        disabled={sharing}
        pressScale={0.985}
        style={[styles.primary, sharing && styles.primaryOff]}
        accessibilityRole="button"
        accessibilityState={{ disabled: sharing }}
        accessibilityLabel="Share a summary for your doctor"
        accessibilityHint="Creates this record as a PDF and opens the share sheet"
      >
        <Text style={[styles.primaryText, sharing && styles.primaryTextOff]}>
          {sharing ? 'Preparing…' : 'Share with your doctor'}
        </Text>
      </Press>
      <Text style={styles.noteLine}>
        The PDF is made on this iPhone and goes only where you send it. It
        carries the same numbers you see here, and states that it is
        self-recorded and not a diagnosis.
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
  limited: {
    marginTop: 16, padding: 12, borderRadius: radius.card,
    backgroundColor: color.bgSurface, borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.borderControl, gap: 3,
  },
  limitedTitle: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  limitedSub: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },
  section: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    marginTop: 26, marginBottom: 8, letterSpacing: -0.2,
  },
  rangeLine: { color: color.textSecondary, fontSize: font.footnote, marginBottom: 10, marginTop: -4 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: {
    flexGrow: 1, flexBasis: '30%', borderRadius: 12, padding: 10,
    backgroundColor: color.bgSurface, gap: 1,
  },
  metricV: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  metricL: { color: color.textSecondary, fontSize: font.footnote },
  metricS: { color: color.textTertiary, fontSize: font.footnote },
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
    backgroundColor: color.bgSurface, marginBottom: 12,
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
    backgroundColor: color.bgSurface, gap: 3,
  },
  endTitle: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  endWhen: {
    color: color.textSecondary, fontSize: font.footnote, fontVariant: ['tabular-nums'],
  },
  endLine: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },
  primary: {
    minHeight: size.buttonH, borderRadius: radius.button, backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 28, paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
  primaryOff: { backgroundColor: color.bgSegmentActive },
  primaryTextOff: { color: color.textTertiary },
});
