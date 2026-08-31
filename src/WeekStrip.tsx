/**
 * The last seven days, under Today's title — the widget's strip, come
 * home. Same grammar exactly: a square's colour is that day's average
 * pain, a day with nothing logged is a quiet outline, and the row only
 * ever changes when the user logs. Tapping a day opens that day.
 *
 * WHAT IT REFUSES, because a seven-day row at the top of Today is one
 * wrong ornament away from a streak: no stars on empty days, no ring
 * closing, no count of days logged, nothing that celebrates or
 * chides. An outline is "a day you did not log", stated once by its
 * shape and never repeated in words. The reference app this layout
 * nods to decorates its unlogged days; that decoration is the line
 * between a map and a scoreboard, and it stays uncrossed.
 *
 * Today is marked by its NUMBER in the theme's accent — the calendar's
 * own convention, so the third surface drawing days speaks like the
 * other two.
 */
import React from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import DaySquare from './DaySquare';
import { Press } from './motion';
import { Entries, addDays, dailyAverage, dateFromISO } from './model';
import { speakScore, themeBrand } from './painScale';
import { color, font, size } from './theme';

const DAYS = 7;
const GAP = 7;
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** the same fit arithmetic the month calendar uses, without the card:
 *  seven cells and six gaps inside the page gutter, floored so the last
 *  square never kisses the edge */
function cellSize(): number {
  const inner = Math.min(Dimensions.get('window').width, 520) - size.pageX * 2;
  return Math.floor((inner - GAP * (DAYS - 1)) / DAYS);
}

export interface WeekStripProps {
  entries: Entries;
  todayIso: string;
  onOpenDay: (dateIso: string) => void;
}

export default function WeekStrip({ entries, todayIso, onOpenDay }: WeekStripProps) {
  const cell = cellSize();
  const brand = themeBrand();
  const days: string[] = [];
  for (let back = DAYS - 1; back >= 0; back--) days.push(addDays(todayIso, -back));

  return (
    <View style={styles.row}>
      {days.map((d) => {
        const entry = entries[d] || null;
        const avg = dailyAverage(entry);
        const date = dateFromISO(d);
        const isToday = d === todayIso;
        return (
          <Press
            key={d}
            onPress={() => onOpenDay(d)}
            pressOpacity={0.7}
            style={styles.cell}
            accessibilityRole="button"
            accessibilityLabel={
              (isToday ? 'Today' : WD[date.getDay()] + ' ' + date.getDate())
              + (avg == null ? ', nothing logged' : ', average ' + speakScore(avg))
            }
            accessibilityHint="Opens this day"
          >
            <Text style={styles.wd} allowFontScaling maxFontSizeMultiplier={1.2}>
              {WD[date.getDay()]}
            </Text>
            <DaySquare entry={entry} size={cell} radius={cell * 0.24} today={isToday} />
            <Text
              style={[
                styles.num,
                isToday && { color: brand, fontWeight: '700' },
              ]}
              allowFontScaling maxFontSizeMultiplier={1.2}
            >
              {date.getDate()}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginHorizontal: size.pageX, marginTop: 2,
  },
  cell: { alignItems: 'center', gap: 4 },
  wd: { color: color.textTertiary, fontSize: font.footnote },
  num: {
    color: color.textSecondary, fontSize: font.footnote,
    fontVariant: ['tabular-nums'],
  },
});
