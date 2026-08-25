/**
 * A day's check-ins as a line: one dot per moment, placed at the time it
 * was taken and at the height of the number given.
 *
 * TIME IS THE AXIS, AND IT IS ALWAYS THE WHOLE DAY. The x scale runs
 * midnight to midnight regardless of when the check-ins fall, so two
 * check-ins an hour apart draw an hour apart rather than being stretched
 * to fill the card. A chart that rescales to its own contents makes a
 * quiet morning and a whole day look identical, and the gap between
 * check-ins is one of the few things this drawing can say truthfully.
 *
 * THE DOTS CARRY THE RAMP; THE LINE DOES NOT. A hue in this app is a
 * score, so each dot is painted at its own value — and the segment
 * joining a 4 to a 7 is painted at neither, because there is no score it
 * could honestly be. It is a neutral thread saying "same day, in this
 * order", which is all a connector between two self-reports ever means.
 * The reference this was drawn from ran one saturated hue through the
 * whole line and filled the area beneath it; that reads as a value the
 * user never entered, so it is the one thing here that is not copied.
 *
 * The dots keep the same hairline the day squares and swatches carry —
 * without it a 0 or a 1 is near-black on a near-black card and the record
 * looks like it lost a check-in.
 *
 * No SVG: this app has no drawing library and adding one is a native
 * build, which cannot reach a tester over the air. A segment is a thin
 * View rotated about its own centre — origin-independent arithmetic, so
 * it does not depend on transformOrigin being honoured.
 */
import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Moment, fmtTime } from './model';
import { formatScore, painColor, speakScore } from './painScale';
import { color, font } from './theme';

/** minutes in a day — the x axis, in full, always */
const DAY_MINUTES = 1440;

/** The thread between two check-ins.
 *
 *  Thicker and brighter than the first version, which was 2pt at 30%
 *  white and disappeared into the card — legible on a desk, invisible on
 *  a phone at arm's length. It stays neutral for the reason above, so the
 *  only way to make it readable is weight and value, not colour. */
const LINE_W = 3;
const LINE_COLOR = 'rgba(255,255,255,0.5)';

/** the three levels the eye needs to read a height off this chart. More
 *  would be a grid; fewer and 5 stops being a landmark. */
const GRID = [10, 5, 0];

/** how many marks make a dotted rule at card width. Fixed rather than
 *  derived: a count that changed with width would make the same rule look
 *  denser on a bigger phone. */
const DOTS = 40;

/** a dotted rule, drawn as marks rather than as borderStyle: 'dotted' —
 *  iOS renders a dotted border on a hairline box inconsistently, and a
 *  gridline that sometimes disappears is worse than none */
function Dotted() {
  return (
    <View style={styles.dotted} pointerEvents="none">
      {Array.from({ length: DOTS }, (_, i) => <View key={i} style={styles.dottedMark} />)}
    </View>
  );
}

export interface DayLineProps {
  logs: Moment[];
  /** drawing height of the plot, excluding the axis labels below it */
  height: number;
  /** dot diameter — also the inset the plot keeps at every edge, so a 0
   *  and a 10 are drawn whole rather than clipped in half by the frame */
  dot?: number;
  /** the 0/5/10 rules and the numbers down the side. Off on the small
   *  card, where the sentence beside it carries the reading instead. */
  grid?: boolean;
  /** Morning / Afternoon / Evening under the plot */
  axis?: boolean;
}

export default function DayLine({
  logs, height, dot = 12, grid, axis,
}: DayLineProps) {
  /* measured rather than computed from window width: this draws inside
     two different cards at two different widths, and a chart that has to
     be told its own size is a chart that silently misplaces a dot the
     day a padding changes */
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width);

  const pts = logs.slice().sort((a, b) => a.h - b.h);
  const r = dot / 2;
  const usableH = Math.max(1, height - dot);
  const usableW = Math.max(1, w - dot);
  const x = (h: number) => r + (Math.max(0, Math.min(DAY_MINUTES, h)) / DAY_MINUTES) * usableW;
  const y = (pain: number) => r + (1 - Math.max(0, Math.min(10, pain)) / 10) * usableH;

  /* one spoken sentence for the whole drawing. VoiceOver reading forty
     absolutely-positioned dots in layout order is noise; the shape of the
     day is the fact, and the rows underneath carry every check-in one at
     a time for anyone who wants them. */
  const spoken = pts.length === 0
    ? 'No check-ins to draw'
    : pts.length === 1
      ? 'One check-in, ' + speakScore(pts[0].pain) + ' at ' + fmtTime(pts[0].h)
      : pts.length + ' check-ins between ' + fmtTime(pts[0].h) + ' and '
        + fmtTime(pts[pts.length - 1].h) + ', from '
        + formatScore(pts.reduce((m, p) => (p.pain < m ? p.pain : m), 10)) + ' to '
        + formatScore(pts.reduce((m, p) => (p.pain > m ? p.pain : m), 0));

  return (
    <View accessible accessibilityLabel={spoken}>
      <View style={styles.body}>
        {grid && (
          <View style={[styles.gutter, { height }]}>
            {GRID.map((g) => (
              <Text
                key={g}
                allowFontScaling={false}
                style={[styles.gutterText, { top: y(g) - 8 }]}
              >
                {g}
              </Text>
            ))}
          </View>
        )}

        <View style={[styles.plot, { height }]} onLayout={onLayout}>
          {grid && GRID.map((g) => (
            <View key={g} style={[styles.gridRow, { top: y(g) - 1 }]}>
              <Dotted />
            </View>
          ))}

          {/* nothing is drawn until the plot has been measured — one frame,
              and the alternative is every dot landing at x = 0 first */}
          {w > 0 && pts.map((p, i) => {
            if (i === 0) return null;
            const a = pts[i - 1];
            const x0 = x(a.h), y0 = y(a.pain), x1 = x(p.h), y1 = y(p.pain);
            const dx = x1 - x0, dy = y1 - y0;
            const len = Math.sqrt(dx * dx + dy * dy);
            return (
              <View
                key={'seg' + a.h + '-' + p.h}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: (x0 + x1) / 2 - len / 2,
                  top: (y0 + y1) / 2 - LINE_W / 2,
                  width: len,
                  height: LINE_W,
                  borderRadius: LINE_W / 2,
                  backgroundColor: LINE_COLOR,
                  transform: [{ rotate: dx === 0 && dy === 0 ? '0rad' : Math.atan2(dy, dx) + 'rad' }],
                }}
              />
            );
          })}

          {w > 0 && pts.map((p) => (
            <View
              key={'dot' + p.h}
              pointerEvents="none"
              style={[
                styles.dot,
                {
                  left: x(p.h) - r,
                  top: y(p.pain) - r,
                  width: dot,
                  height: dot,
                  borderRadius: r,
                  backgroundColor: painColor(p.pain),
                },
              ]}
            />
          ))}
        </View>
      </View>

      {axis && (
        <View style={[styles.axis, grid ? styles.axisInset : null]}>
          <Text style={styles.axisText} allowFontScaling maxFontSizeMultiplier={1.2}>Morning</Text>
          <Text style={styles.axisText} allowFontScaling maxFontSizeMultiplier={1.2}>Afternoon</Text>
          <Text style={styles.axisText} allowFontScaling maxFontSizeMultiplier={1.2}>Evening</Text>
        </View>
      )}
    </View>
  );
}

/** the gutter's width, exported so the axis labels under a gridded chart
 *  can be inset by exactly as much and line up with the plot */
const GUTTER_W = 24;

const styles = StyleSheet.create({
  body: { flexDirection: 'row' },
  gutter: { width: GUTTER_W },
  gutterText: {
    position: 'absolute', left: 0, right: 6,
    textAlign: 'right', lineHeight: 16,
    color: color.textTertiary, fontSize: font.footnote,
    fontVariant: ['tabular-nums'],
  },
  plot: { flex: 1 },
  gridRow: { position: 'absolute', left: 0, right: 0, height: 2 },
  dotted: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dottedMark: {
    width: 2, height: 2, borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  /* the same hairline every other painted square in this app carries —
     it is what keeps a 0 visible on a near-black card */
  dot: {
    position: 'absolute',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)',
  },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  axisInset: { marginLeft: GUTTER_W },
  axisText: { color: color.textTertiary, fontSize: font.footnote },
});
