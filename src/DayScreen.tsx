/**
 * A day — all of it, on one screen.
 *
 * THERE USED TO BE TWO OF THESE. "Pain through the day" drew the chart
 * and could not edit; a day-detail sheet held the check-ins, the
 * questions and the events and could. Today's two cards opened one each,
 * FOR THE SAME DATE, and the chart screen's rows opened the sheet — so
 * you could be in a day inside a day. That is not a hierarchy, it is a
 * fork, and this is the two of them merged: one place, reached the same
 * way from Today, from History, and from itself.
 *
 * IT IS PUSHED, NOT PRESENTED. A day is a place you go and come back
 * from, so it slides in from the right under a back chevron, the way iOS
 * says a place arrives. Sheets are kept for tasks — recording an event,
 * choosing a focus, the profile — and a full screen for the check-in,
 * which is a flow.
 *
 * IT IS THE ONLY SCREEN THAT SWIPES BETWEEN DAYS, one card per page.
 * Today deliberately does not: Today is where you act, and Log always
 * means now, so a surface you act on must not be able to become Tuesday
 * underneath the button.
 *
 * NOTHING HERE IS DRAGGED. The check-in rows used to be swiped away to
 * delete them, and a horizontal swipe on a row inside a horizontal pager
 * is the same gesture asking two questions — the row would have taken
 * every drag that started on it, which is most of the screen, and the
 * pager would only have worked from the chart. So removal moved to an
 * explicit Edit on the list that holds it. It is a tap, it cannot fire by
 * accident, and it says the word rather than hiding behind a gesture.
 *
 * A CHECK-IN ROW IS NOT A BUTTON, because there is nothing to open. The
 * row used to claim it opened the check-in "to edit"; it opened a NEW
 * check-in, stamped with the time you tapped it rather than the time you
 * recorded. Editing is not missing here by oversight — a check-in is
 * stamped when it happened, and back-dating one would put a number in the
 * record that nobody took at the time. So the row states what it is, and
 * the only thing that can be done to it is to remove it.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList, LayoutAnimation, NativeScrollEvent, NativeSyntheticEvent, ScrollView,
  StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import Animated, {
  Extrapolation, SharedValue, interpolate, runOnJS,
  useAnimatedScrollHandler, useAnimatedStyle, useSharedValue,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import DayLine from './DayLine';
import PushLayer from './PushLayer';
import * as db from './db';
import { Press, useReduceMotion } from './motion';
import { getMetric, levelLabel } from './metrics';
import {
  Answer, Entries, Entry, EVENT_LABELS, LOC_NAMES, Moment, PainEvent, QUALITY_NAMES,
  checkinCount, dailyAverage, dateFromISO, fmtTime, iso, logsOf, todayISO,
} from './model';
import {
  formatRange, formatScore, painColor, speakScore,
} from './painScale';
import { color, font, radius, size } from './theme';

/* The pager's proportions. SIDE is the content padding at both ends, so
   an offset of i × itemW puts card i dead centre; GAP is the black
   between one card and the next. They add up to size.pageX on purpose:
   the card's left edge lands on the same gutter every other card in the
   app sits in, so walking in from Today does not shift the page. */
const SIDE = size.pageX - 6;
const GAP = 6;
/** how small a neighbour draws; the card is translated back out by
 *  whatever the scale pulls in, so the peek costs nothing */
const MIN_SCALE = 0.94;
/** how far off centre a card can be and still show its words — past this
 *  it is a blank surface, so a swipe never crosses a dark gap */
const READABLE = 0.35;

/** how far back the pager goes. Ninety days is a season — longer than
 *  anyone swipes, and History is still the way to anything older. */
const MAX_PAGES = 90;

/** the plot's drawing height — tall enough that a one-point difference is
 *  visible, short enough that the day's figures stay on the same screen */
const PLOT_H = 150;

/** quality words shown beside a check-in before the row gives up */
const CHIPS = 2;

/* ── the nudge ──────────────────────────────────────────────
   The pager leans toward the neighbouring day on arrival and settles
   back. It replaces a line of text that said the same thing: a sentence
   explaining a gesture is a sentence admitting the gesture is invisible,
   and showing the movement teaches it in less time than reading about it
   takes. It waits for the screen to finish arriving, stands down the
   moment a real finger touches the pager, and does not come back once the
   gesture has been used — a hint that keeps arriving after it has been
   taken is nagging. */
const NUDGE = 32;
const NUDGE_OUT_MS = 520;
const NUDGE_BACK_MS = 900;

/** set the first time a real finger drags the pager. The programmatic
 *  nudge cannot set it — only onScrollBeginDrag fires for a touch. */
const PREF_SWIPED = 'daypager.swiped';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const M3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Mon, 24 Aug" — short enough for the large title on the narrowest
 *  phone, which is why the app writes a date this way everywhere */
export function fmtDay(dateIso: string): string {
  const d = dateFromISO(dateIso);
  return WD[d.getDay()] + ', ' + d.getDate() + ' ' + M3[d.getMonth()];
}

function names(ids: string[] | undefined, map: Record<string, string>): string {
  return (ids || []).map((id) => map[id] || id).join(', ');
}

export interface DayScreenProps {
  entries: Entries;
  /** the day to open on. The pager starts there and can walk either way. */
  dateIso: string;
  /** something was removed — the record outside this screen has to know */
  onChanged: () => void;
  /** a check-in, always for now, never for the day being read */
  onAddLog: () => void;
  onAddEvent: (dateIso: string) => void;
  onEditEvent: (ev: PainEvent) => void;
  onClosed: () => void;
}

/* ── one figure of three ────────────────────────────────────── */
function Stat({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={label + ' ' + value + (unit || '')}>
      <Text style={styles.statV} allowFontScaling maxFontSizeMultiplier={1.3}>
        {value}
        {!!unit && <Text style={styles.statUnit}>{unit}</Text>}
      </Text>
      <Text style={styles.statL} allowFontScaling maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

/** a section's title, and the one control that turns its rows into
 *  removable ones. Per list rather than per screen: an Edit at the top of
 *  the day would arm three lists at once, and the one you meant is the
 *  one you are looking at. */
function SectionHead({ title, editing, onToggle }: {
  title: string; editing: boolean; onToggle?: () => void;
}) {
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
        {title}
      </Text>
      {!!onToggle && (
        <Press
          onPress={onToggle}
          pressOpacity={0.7}
          hitSlop={10}
          style={styles.editBtn}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Done editing ' + title : 'Edit ' + title}
        >
          <Text style={styles.editText}>{editing ? 'Done' : 'Edit'}</Text>
        </Press>
      )}
    </View>
  );
}

/** the control that removes a row, shown only while its list is armed */
function Remove({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Press
      onPress={onPress}
      pressOpacity={0.7}
      hitSlop={6}
      style={styles.removeBtn}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text style={styles.removeText}>Remove</Text>
    </Press>
  );
}

/* ── one day ────────────────────────────────────────────────── */
function DayPage({
  dateIso, entry, index, itemW, scrollX,
  onRemoveMoment, onRemoveAnswer, onRemoveEvent, onAddLog, onAddEvent, onEditEvent,
}: {
  dateIso: string;
  entry: Entry | null;
  index: number;
  itemW: number;
  /** live scroll offset, so a card sizes itself by how far off centre it
   *  is rather than waiting for the swipe to finish */
  scrollX: SharedValue<number>;
  /** Never read. It is here so that a removal changes this cell's PROPS —
   *  a page draws from the database rather than from the entries map it
   *  was handed, and a virtualised cell whose props are identical is
   *  entitled to skip the re-render that would show the row is gone. */
  tick: number;
  onRemoveMoment: (dateIso: string, h: number) => void;
  onRemoveAnswer: (dateIso: string, metricId: string) => void;
  onRemoveEvent: (ev: PainEvent) => void;
  onAddLog: () => void;
  onAddEvent: (dateIso: string) => void;
  onEditEvent: (ev: PainEvent) => void;
}) {
  const pageStyle = useAnimatedStyle(() => {
    const d = scrollX.value / itemW - index;
    const off = Math.abs(d);
    const scale = interpolate(off, [0, 1], [1, MIN_SCALE], Extrapolation.CLAMP);
    /* push back out by exactly what the scale pulled in, toward whichever
       edge of this card the screen can actually see */
    const back = (d === 0 ? 0 : Math.sign(d)) * (itemW * (1 - scale)) / 2;
    return {
      transform: [{ translateX: back }, { scale }],
      opacity: interpolate(off, [0, 1], [1, 0.75], Extrapolation.CLAMP),
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const off = Math.abs(scrollX.value / itemW - index);
    return { opacity: interpolate(off, [READABLE, 1], [1, 0], Extrapolation.CLAMP) };
  });

  /* one per list, not one per page: an Edit at the top of the day would
     arm three lists at once, and the one you meant is the one you are
     looking at */
  const [editLogs, setEditLogs] = useState(false);
  const [editAnswers, setEditAnswers] = useState(false);
  const [editEvents, setEditEvents] = useState(false);
  /* the database is the truth after a removal, not the entries map this
     page was handed — refreshing upward and re-rendering downward is a
     round trip the page cannot wait for */
  const live = db.getDay(dateIso) || entry;
  const isToday = dateIso === todayISO();
  const logs = logsOf(live).slice().sort((a, b) => b.h - a.h);
  const avg = dailyAverage(live);
  const count = live ? checkinCount(live) : 0;
  /* the day's own extremes, and they fall back to the day value rather
     than to the seeds: a legacy day carries an answer with no moments
     behind it, and seeding from 10 and 0 would print a range of 10–0 over
     a day that only ever said one thing */
  const low = logs.length ? logs.reduce((m, l) => (l.pain < m ? l.pain : m), 10) : avg;
  const high = logs.length ? logs.reduce((m, l) => (l.pain > m ? l.pain : m), 0) : avg;

  const ctx = live && live.ctx ? live.ctx.a : null;
  const answers = (ctx ? Object.keys(ctx) : [])
    .map((id) => ({ id, m: getMetric(id), a: ctx![id] as Answer }))
    .filter((r) => r.m != null);
  const events = db.getEventsFor(dateIso);

  return (
    <Animated.View style={[{ width: itemW }, pageStyle]}>
      {/* each page scrolls on its own. A day with eleven check-ins, its
          questions and its events will not fit any phone, and one fixed
          height for every page either clips the longest day or leaves the
          shortest floating in space. */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
        <Animated.View style={contentStyle}>
          {/* ── the shape of the day ───────────────────────── */}
          <View style={styles.card}>
            <Text
              style={styles.cardTitle}
              allowFontScaling maxFontSizeMultiplier={1.3}
              /* the nudge teaches the gesture by doing it, which VoiceOver
                 cannot see. The hint is the same fact, said the one way a
                 screen reader can receive it. */
              accessibilityHint="Swipe left or right for another day"
            >
              Pain through the day
            </Text>

            {avg == null ? (
              <Text style={styles.empty} allowFontScaling maxFontSizeMultiplier={1.4}>
                {isToday ? 'No check-ins yet today.' : 'Nothing was logged on this day.'}
              </Text>
            ) : (
              <>
                {logs.length > 0 ? (
                  <View style={styles.plotWrap}>
                    <DayLine logs={logs} height={PLOT_H} grid axis />
                  </View>
                ) : (
                  /* a day carrying an answer with no moment behind it —
                     legacy, or restored from an old backup. The figures
                     below are still true; there is simply no clock to put
                     them on, and drawing one would invent a time. */
                  <Text style={styles.empty} allowFontScaling maxFontSizeMultiplier={1.4}>
                    This day was recorded without a time, so there is nothing to
                    place against the clock.
                  </Text>
                )}

                <View style={styles.stats}>
                  <Stat value={formatScore(avg)} unit="/10" label="Average" />
                  <View style={styles.statRule} />
                  <Stat
                    value={low == null || high == null ? '—' : formatRange(low, high)}
                    label="Range"
                  />
                  <View style={styles.statRule} />
                  {/* a count, so it stays white — the ramp means pain, and
                      a tally of check-ins is not a pain value */}
                  <Stat value={String(count)} label={count === 1 ? 'Check-in' : 'Check-ins'} />
                </View>

                {/* what the drawing is NOT, inside the card it qualifies */}
                <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
                  The line joins the times you checked in. The stretches between
                  them are hours you didn’t record, not hours without pain.
                </Text>
              </>
            )}
          </View>

          {/* ── every check-in, in full ────────────────────── */}
          {logs.length > 0 && (
            <View style={[styles.card, styles.cardGap]}>
              <SectionHead
                title="Check-ins"
                editing={editLogs}
                onToggle={() => setEditLogs((v) => !v)}
              />
              {logs.map((l, i) => {
                const chips = (l.q || []).map((id) => QUALITY_NAMES[id] || id).slice(0, CHIPS);
                const where = names(l.loc, LOC_NAMES);
                return (
                  <View
                    key={l.h}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                    accessible
                    accessibilityLabel={fmtTime(l.h) + ', ' + speakScore(l.pain)
                      + (chips.length ? ', ' + chips.join(', ') : '')
                      + (where ? ', ' + where : '')}
                  >
                    <View style={[styles.swatch, { backgroundColor: painColor(l.pain) }]} />
                    <Text style={styles.rowScore} allowFontScaling maxFontSizeMultiplier={1.3}>
                      {formatScore(l.pain)}<Text style={styles.rowOutOf}>/10</Text>
                    </Text>
                    <View style={styles.rowMid}>
                      <View style={styles.chips}>
                        {chips.map((c) => (
                          <View key={c} style={styles.chip}>
                            <Text
                              style={styles.chipText} numberOfLines={1}
                              allowFontScaling maxFontSizeMultiplier={1.2}
                            >
                              {c}
                            </Text>
                          </View>
                        ))}
                      </View>
                      {!!where && (
                        <Text
                          style={styles.rowSub} numberOfLines={1}
                          allowFontScaling maxFontSizeMultiplier={1.2}
                        >
                          {where}
                        </Text>
                      )}
                    </View>
                    {editLogs ? (
                      <Remove
                        label={'Remove the ' + fmtTime(l.h) + ' check-in'}
                        onPress={() => onRemoveMoment(dateIso, l.h)}
                      />
                    ) : (
                      <Text style={styles.rowTime} allowFontScaling maxFontSizeMultiplier={1.2}>
                        {fmtTime(l.h)}
                      </Text>
                    )}
                  </View>
                );
              })}
              {/* said once, where it is true: this is not an oversight */}
              <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
                A check-in is stamped when you made it, and that stamp is not
                editable — a number nobody took at that time would not be a
                record of anything. A wrong one can be removed.
              </Text>
            </View>
          )}

          {/* ── what was asked, and what came back ─────────── */}
          {answers.length > 0 && (
            <View style={[styles.card, styles.cardGap]}>
              <SectionHead
                title="The day’s questions"
                editing={editAnswers}
                onToggle={() => setEditAnswers((v) => !v)}
              />
              {answers.map(({ id, m, a }, i) => {
                const skipped = a.skipped === 1;
                const value = skipped
                  ? 'Skipped'
                  : m!.type === 'numeric' ? a.value + '/10' : levelLabel(id, String(a.value));
                return (
                  <View
                    key={id}
                    style={[styles.row, styles.rowTop, i > 0 && styles.rowDivider]}
                    accessible
                    accessibilityLabel={m!.name + ', ' + value + (a.note ? '. Note: ' + a.note : '')}
                  >
                    <View style={styles.rowMid}>
                      <Text style={styles.rowLabel} allowFontScaling maxFontSizeMultiplier={1.3}>
                        {m!.name}
                      </Text>
                      <Text style={styles.rowSub}>{m!.question}</Text>
                      {/* their own words, if they left any — shown on a
                          skipped answer too, because "I'd rather not grade
                          it, but here is what happened" is a real thing to
                          have said */}
                      {!!a.note && (
                        <Text style={styles.rowNote} allowFontScaling maxFontSizeMultiplier={1.4}>
                          {a.note}
                        </Text>
                      )}
                    </View>
                    {editAnswers ? (
                      <Remove
                        label={'Remove the answer to ' + m!.name}
                        onPress={() => onRemoveAnswer(dateIso, id)}
                      />
                    ) : (
                      <Text
                        style={[styles.qValue, skipped && styles.qSkipped]}
                        allowFontScaling maxFontSizeMultiplier={1.3}
                      >
                        {value}
                      </Text>
                    )}
                  </View>
                );
              })}
              <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
                A removed answer goes back to never having been asked — which is
                a different thing from having been asked and skipped, and the
                record keeps them apart.
              </Text>
            </View>
          )}

          {/* ── what happened ─────────────────────────────── */}
          <View style={[styles.card, styles.cardGap]}>
            <SectionHead
              title="Events"
              editing={editEvents}
              onToggle={events.length ? () => setEditEvents((v) => !v) : undefined}
            />
            {events.map((ev, i) => (
              <View key={ev.id} style={[styles.row, i > 0 && styles.rowDivider]}>
                <Press
                  onPress={() => onEditEvent(ev)}
                  pressOpacity={0.7}
                  style={styles.rowMid}
                  accessibilityRole="button"
                  accessibilityLabel={fmtTime(ev.h) + ', ' + EVENT_LABELS[ev.kind]
                    + (ev.text ? ', ' + ev.text : '')}
                  accessibilityHint="Opens this event to edit"
                >
                  <Text style={styles.rowLabel} allowFontScaling maxFontSizeMultiplier={1.3}>
                    {EVENT_LABELS[ev.kind]}
                  </Text>
                  {!!ev.text && <Text style={styles.rowSub}>{ev.text}</Text>}
                  {ev.helped != null && (
                    <Text style={styles.rowSub}>Reported effect {ev.helped}/10</Text>
                  )}
                </Press>
                {editEvents ? (
                  <Remove
                    label={'Remove the ' + fmtTime(ev.h) + ' event'}
                    onPress={() => onRemoveEvent(ev)}
                  />
                ) : (
                  <Text style={styles.rowTime} allowFontScaling maxFontSizeMultiplier={1.2}>
                    {fmtTime(ev.h)}
                  </Text>
                )}
              </View>
            ))}

            <Press
              onPress={() => onAddEvent(dateIso)}
              pressOpacity={0.85}
              style={[styles.ghost, events.length > 0 && styles.ghostGap]}
              accessibilityRole="button"
              accessibilityLabel="Note something that happened"
              accessibilityHint="Opens a short set of questions about a flare or a treatment"
            >
              <Text style={styles.ghostText}>Note something that happened</Text>
            </Press>

            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              Events sit alongside your check-ins without any claim that they
              caused a change.
            </Text>
          </View>

          {!!live?.note && (
            <View style={[styles.card, styles.cardGap]}>
              <Text style={styles.note}>“{live.note}”</Text>
            </View>
          )}

          {/* Only on today, and it always means now. A check-in is stamped
              when it happened, so a past page cannot offer one — which is
              exactly why the button is absent rather than disabled. */}
          {isToday && (
            <Press
              onPress={onAddLog}
              pressScale={0.985}
              style={styles.primary}
              accessibilityRole="button"
              accessibilityLabel="Add a check-in"
            >
              <Text style={styles.primaryText}>Add a check-in</Text>
            </Press>
          )}
        </Animated.View>
      </ScrollView>
    </Animated.View>
  );
}

export default function DayScreen({
  entries, dateIso, onChanged, onAddLog, onAddEvent, onEditEvent, onClosed,
}: DayScreenProps) {
  const t = todayISO();
  const { width } = useWindowDimensions();
  const rm = useReduceMotion();

  /* Oldest first, today last — so the pager's resting place is the
     right-hand end and swiping right goes back in time, the direction a
     calendar runs and the direction History already scrolls. */
  const days = useMemo(() => {
    const keys = Object.keys(entries).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
    const first = keys.length ? keys[0] : t;
    const oldest = dateFromISO(first < dateIso ? first : dateIso);
    const span = Math.round((dateFromISO(t).getTime() - oldest.getTime()) / 86400000) + 1;
    const n = Math.max(1, Math.min(MAX_PAGES, span));
    const out: string[] = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = dateFromISO(t);
      d.setDate(d.getDate() - i);
      out.push(iso(d));
    }
    return out;
  }, [entries, t, dateIso]);

  const last = days.length - 1;
  const itemW = width - SIDE * 2;
  const start = Math.max(0, Math.min(last, days.indexOf(dateIso)));

  const list = useRef<FlatList<string>>(null);
  const [at, setAt] = useState(start);
  /* bumped by every removal — the pages read the database directly, and
     this is what tells them to look again */
  const [tick, setTick] = useState(0);

  /* A jump to today is animated, and an animated scroll reports every
     index it flies over. Each one landed in `at`, so the heading counted
     backwards through the week and the Today button blinked in and out on
     the way. The destination is known when the jump starts, so it is set
     once and the indices in between are ignored until the scroll stops. */
  const jumping = useRef(false);

  /* Declared ABOVE the scroll worklet, and it has to be: Reanimated builds
     a worklet's closure the moment the worklet is created, so a const
     referenced inside one but declared after it is read in its temporal
     dead zone — a ReferenceError on the first frame that TypeScript is
     happy to compile, because the reference sits inside a function body. */
  const land = useCallback((i: number) => {
    if (jumping.current) return;
    setAt(Math.max(0, Math.min(last, i)));
  }, [last]);
  const settle = (x: number) => {
    jumping.current = false;
    setAt(Math.max(0, Math.min(last, Math.round(x / itemW))));
  };

  const scrollX = useSharedValue(start * itemW);
  const page = useSharedValue(start);
  const onScroll = useAnimatedScrollHandler((ev) => {
    scrollX.value = ev.contentOffset.x;
    const i = Math.round(ev.contentOffset.x / itemW);
    if (i !== page.value) {
      page.value = i;
      runOnJS(land)(i);
    }
  }, [itemW, last]);

  /* ── removals ─────────────────────────────────────────────
     Immediate, with a haptic and a fade. There is no confirmation
     dialogue: arming a list with Edit and then tapping the word Remove is
     already two deliberate acts, and a third would make the second feel
     like a slip the app had caught. The record exports and restores. */
  const wipe = useCallback((run: () => void) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!rm) {
      LayoutAnimation.configureNext(LayoutAnimation.create(200, 'easeInEaseOut', 'opacity'));
    }
    run();
    setTick((n) => n + 1);
    onChanged();
  }, [rm, onChanged]);

  const removeMoment = useCallback((d: string, h: number) => {
    wipe(() => db.dropMoment(d, h));
  }, [wipe]);
  const removeAnswer = useCallback((d: string, metricId: string) => {
    wipe(() => db.clearAnswer(d, metricId));
  }, [wipe]);
  const removeEvent = useCallback((ev: PainEvent) => {
    wipe(() => { if (ev.id != null) db.dropEvent(ev.id); });
  }, [wipe]);

  /* ── the nudge ────────────────────────────────────────────
     Read once, at mount, so the pref cannot change under the effect. It
     leans toward whichever side actually has a day on it — leaning at an
     edge would bounce off nothing and teach the opposite lesson. */
  const [taught] = useState(() => db.getPref<boolean>(PREF_SWIPED, false));
  const touched = useRef(false);
  useEffect(() => {
    if (rm || taught || days.length < 2) return;
    const home = start * itemW;
    const dir = start > 0 ? -1 : 1;
    const lean = (offset: number) => {
      if (!touched.current) list.current?.scrollToOffset({ offset, animated: true });
    };
    const out = setTimeout(() => lean(home + dir * NUDGE), NUDGE_OUT_MS);
    const back = setTimeout(() => lean(home), NUDGE_BACK_MS);
    return () => { clearTimeout(out); clearTimeout(back); };
  }, []);

  const onDate = days[at] || dateIso;

  return (
    <PushLayer onClosed={onClosed} safeTop>
      {(dismiss) => (
        <>
          <View style={styles.topBar}>
            <Press
              onPress={dismiss}
              pressScale={0.94}
              style={styles.back}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <Text style={styles.backChev} allowFontScaling={false}>‹</Text>
            </Press>
            <Text
              style={styles.title}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              allowFontScaling
              maxFontSizeMultiplier={1.2}
            >
              {fmtDay(onDate)}
            </Text>
            {/* one tap out of a pager you can swipe a long way into — the
                same control History carries, and only once you have left */}
            {onDate !== t && (
              <Press
                onPress={() => {
                  jumping.current = true;
                  setAt(last);
                  list.current?.scrollToOffset({ offset: last * itemW, animated: true });
                }}
                pressOpacity={0.7}
                style={styles.todayBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Back to today"
              >
                <Text style={styles.todayText}>Today</Text>
              </Press>
            )}
          </View>

          <Animated.FlatList
            ref={list}
            data={days}
            keyExtractor={(d: string) => d}
            horizontal
            showsHorizontalScrollIndicator={false}
            /* snapToInterval rather than pagingEnabled: a page is one card
               wide, not one screen wide, and pagingEnabled only ever snaps
               to the screen. disableIntervalMomentum keeps a hard flick to
               one day — flying past four is how you lose your place. */
            snapToInterval={itemW}
            disableIntervalMomentum
            decelerationRate="fast"
            contentContainerStyle={{ paddingHorizontal: SIDE }}
            initialScrollIndex={start}
            getItemLayout={(_: unknown, i: number) => ({ length: itemW, offset: itemW * i, index: i })}
            onScroll={onScroll}
            scrollEventThrottle={16}
            /* a finger, not the nudge: a programmatic scroll never begins
               a drag, so this fires only when the gesture has really been
               used — and a touch mid-jump means the user has taken over */
            onScrollBeginDrag={() => {
              touched.current = true;
              jumping.current = false;
              if (!taught) db.setPref(PREF_SWIPED, true);
            }}
            onMomentumScrollEnd={(ev: NativeSyntheticEvent<NativeScrollEvent>) =>
              settle(ev.nativeEvent.contentOffset.x)}
            /* a slow drag released without a flick never fires momentum
               end, and the heading would sit on the wrong day until the
               next swipe. Both endings are handled. */
            onScrollEndDrag={(ev: NativeSyntheticEvent<NativeScrollEvent>) =>
              settle(ev.nativeEvent.contentOffset.x)}
            extraData={tick}
            style={styles.pager}
            renderItem={({ item, index }: { item: string; index: number }) => (
              <DayPage
                dateIso={item}
                entry={entries[item] || null}
                index={index}
                itemW={itemW}
                scrollX={scrollX}
                tick={tick}
                onRemoveMoment={removeMoment}
                onRemoveAnswer={removeAnswer}
                onRemoveEvent={removeEvent}
                onAddLog={onAddLog}
                onAddEvent={onAddEvent}
                onEditEvent={onEditEvent}
              />
            )}
          />
        </>
      )}
    </PushLayer>
  );
}

const styles = StyleSheet.create({
  /* the same gutter and rhythm as the app's own top bar, so the title
     does not jump sideways on the way in */
  topBar: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: size.pageX, paddingTop: 6, paddingBottom: 14,
  },
  back: {
    width: 38, height: 38, borderRadius: 19, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  backChev: { color: color.textPrimary, fontSize: 26, lineHeight: 30, marginTop: -3 },
  title: {
    flex: 1, color: color.textPrimary, fontSize: font.title1, fontWeight: '700',
    letterSpacing: -0.5,
  },
  todayBtn: { minHeight: 38, justifyContent: 'center', paddingLeft: 6 },
  todayText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  pager: { flex: 1 },
  /* room for the last line to clear the floating tab bar, which this
     screen keeps rather than covering */
  page: { paddingBottom: 132 },

  /* Trends' card, to the pixel — same surface, same 16pt padding, and
     below it the same type doing the same jobs: a figure is title3, a
     label is footnote, a sentence is subheadline. */
  card: {
    marginHorizontal: GAP,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    padding: 16,
  },
  cardGap: { marginTop: 14 },
  cardTitle: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.2,
  },
  plotWrap: { marginTop: 16 },
  empty: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21,
    marginTop: 12,
  },

  stats: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  stat: { flex: 1, alignItems: 'center', gap: 1 },
  statRule: { width: StyleSheet.hairlineWidth, height: 30, backgroundColor: color.borderDivider },
  /* the same spec as a Trends metric tile's value */
  statV: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statUnit: { fontSize: font.footnote, fontWeight: '600', color: color.textSecondary },
  statL: { color: color.textSecondary, fontSize: font.footnote },

  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 14 },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, marginBottom: 2, minHeight: 30,
  },
  sectionTitle: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.2,
  },
  editBtn: { minHeight: 30, justifyContent: 'center', paddingLeft: 10 },
  editText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  rowTop: { alignItems: 'flex-start', paddingVertical: 10 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider },
  swatch: {
    width: 11, height: 11, borderRadius: 5.5,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  rowScore: {
    color: color.textPrimary, fontSize: font.body, fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rowOutOf: { fontSize: font.footnote, fontWeight: '500', color: color.textSecondary },
  rowMid: { flex: 1, gap: 3 },
  rowLabel: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  rowSub: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },
  rowNote: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 20, marginTop: 3,
  },
  chips: { flexDirection: 'row', gap: 6, flexShrink: 1 },
  chip: {
    flexShrink: 1, borderRadius: 8, borderCurve: 'continuous',
    backgroundColor: color.bgSegmentTrack, paddingHorizontal: 8, paddingVertical: 4,
  },
  chipText: { color: color.textSecondary, fontSize: font.footnote },
  rowTime: {
    color: color.textSecondary, fontSize: font.subheadline,
    fontVariant: ['tabular-nums'],
  },
  qValue: {
    color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  qSkipped: { color: color.textTertiary, fontWeight: '500' },

  /* the one place on this screen that is destructive, in the app's soft
     terracotta rather than the platform red — a warning that does not
     shout on a screen about pain */
  removeBtn: { minHeight: 34, justifyContent: 'center', paddingLeft: 10 },
  removeText: { color: color.danger, fontSize: font.subheadline, fontWeight: '600' },

  ghost: {
    minHeight: 46, borderRadius: radius.button, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  ghostGap: { marginTop: 14 },
  ghostText: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },

  note: { color: color.textSecondary, fontSize: 15, lineHeight: 23, fontStyle: 'italic' },

  /* the same primary-button spec as everywhere else — one button, one size */
  primary: {
    marginHorizontal: GAP, marginTop: 18,
    minHeight: size.buttonH, borderRadius: radius.button, borderCurve: 'continuous',
    backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
});
