/**
 * The home-screen and lock-screen widget: what you last said, the shape
 * of your days, and a way in.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW is anything derived. No average, no
 * trend, no arrow, no count of days logged, no "you haven't checked in
 * today". Trends is built under a calm-surface rule — nothing that
 * rewards checking — because an always-available view of your own pain
 * is what turns keeping a record into watching a figure, and a home
 * screen is that surface with the choice removed.
 *
 * A rolling average was the tempting one and is the clearest example of
 * why not: it MOVES ON ITS OWN as an old day falls out of the window, so
 * a hard week improves by the calendar rather than by anything that
 * happened. What is shown instead is the number the user typed, said
 * back to them, and only ever today's.
 *
 * The caption is a statement, never a prompt, for the same reason: a
 * nudge on a surface nobody can dismiss is the one thing a home screen
 * must not do.
 *
 * THE LOCK SCREEN IS DISCREET UNLESS ASKED. A lock screen is read by
 * whoever lifts the phone — a colleague, a parent, a partner — and the
 * spec's rule for notifications, no pain scores on the lock screen,
 * applies to a widget with more force, since a widget is always there.
 * So the accessory families show the app's square and a word by
 * default, and carry the number only when `lock` says 'number', which
 * a person turns on in Profile. Home-screen families keep the number:
 * a home screen is behind the passcode.
 *
 * HOW THIS FILE ACTUALLY RUNS, because getting it wrong rendered a black
 * rectangle twice. The 'widget' directive makes babel-preset-expo
 * serialize this function to a SOURCE STRING at build time; the widget
 * extension evaluates that string in its own JavaScriptCore context and
 * walks the returned element tree. That context contains the SwiftUI
 * components, the modifiers and the jsx runtime as globals — and NOTHING
 * ELSE. A reference to anything in this module's scope survives
 * serialization as a bare identifier and throws ReferenceError at
 * evaluation, which the extension swallows and shows as an empty widget.
 *
 * THEREFORE: every constant is inlined, every prop access carries its own
 * fallback literal, no helper is called that is not a global, and
 * nothing outside the function body is referenced. The gallery preview
 * renders the function with NO props at all, so the fallbacks are what
 * the picker shows. tools/test-widget.js evaluates the serialized string
 * in a sandbox holding exactly those globals, for every family.
 *
 * SIX LAYOUTS, ONE FUNCTION. The family arrives in the environment.
 *  - accessoryCircular    the lock screen, at a glance
 *  - accessoryRectangular the lock screen, with a line of words
 *  - accessoryInline      one line beside the clock
 *  - systemSmall          today's reading over the last seven days
 *  - systemMedium         the reading beside the last fourteen
 *  - systemLarge          the reading over the last thirty-five
 * The grids are rows of seven ending on today, so the weekday letters
 * under the last row name every column above them.
 *
 * The colours are computed in the app by painScale and arrive as hex
 * strings through the snapshot. One definition of the pain ramp, still.
 * Accessory families render monochrome, so those layouts carry the
 * meaning in words and never in a fill.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { HStack, RoundedRectangle, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground, font, foregroundStyle, frame, padding, widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import type { WidgetSnapshot } from './widget';

/** the deep link the whole widget opens — handled in App.tsx. The literal
 *  is repeated inside the widget function because the function cannot see
 *  this constant; this export exists so the app side and any test compare
 *  against one name. */
export const WIDGET_URL = 'pattern://checkin';

/** oldest to newest: seven fills, seven letters, thirty-five grid fills,
 *  today's reading and one line of words. The shape is defined in
 *  widget.ts, which is where it is built and tested. */
export type WeekWidgetProps = Partial<WidgetSnapshot>;

const WeekWidget = (props: WeekWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const family = (environment && environment.widgetFamily) || 'systemSmall';
  const value = props.last || '';
  const word = props.word || '';
  const at = props.at || '';
  const caption = props.caption || 'Check in';
  const number = props.lock === 'number';
  /* the grid, read by name; a missing cell is the empty-day outline */
  const P = props as { [k: string]: string | undefined };
  const cell = (i: number) => P['g' + i] || '#2E2E30';
  const letters = [
    props.w0 || ' ', props.w1 || ' ', props.w2 || ' ', props.w3 || ' ',
    props.w4 || ' ', props.w5 || ' ', props.w6 || ' ',
  ];

  /* ── the lock screen ─────────────────────────────────────
     Rendered monochrome by the system, so nothing here leans on colour.
     Discreet by default: the square, and a word that says whether today
     has a check-in. With the number turned on, circular is one glyph —
     the number, or a dash on a day with nothing in it — never a zero,
     which on this scale is a real answer. */
  if (family === 'accessoryCircular') {
    return (
      <VStack
        spacing={number ? 0 : 3}
        modifiers={[containerBackground('#000000', 'widget'), widgetURL('pattern://checkin')]}
      >
        {number ? (
          <Text modifiers={[font({ textStyle: 'title2', weight: 'semibold' })]}>
            {value || '–'}
          </Text>
        ) : (
          <RoundedRectangle cornerRadius={5}
            modifiers={[frame({ width: 18, height: 18 }), foregroundStyle('#FFFFFF')]} />
        )}
        <Text modifiers={[font({ textStyle: 'caption2' })]}>
          {number ? (value ? 'pain' : 'log') : (value ? 'logged' : 'log')}
        </Text>
      </VStack>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack
        spacing={1}
        modifiers={[containerBackground('#000000', 'widget'), widgetURL('pattern://checkin')]}
      >
        <Text modifiers={[font({ textStyle: 'headline', weight: 'semibold' })]}>
          {number ? (value ? value + ' · ' + word : 'No check-in yet') : 'Pattern'}
        </Text>
        <Text modifiers={[font({ textStyle: 'caption2' })]}>
          {number
            ? (at ? 'Last at ' + at : 'Tap to check in')
            : (value ? 'Checked in today' : 'Tap to check in')}
        </Text>
      </VStack>
    );
  }

  if (family === 'accessoryInline') {
    /* one line of text beside the clock; the system draws nothing else,
       and the background is declared anyway because every family
       declares it — the one rule the sandbox test holds all six to */
    return (
      <Text modifiers={[containerBackground('#000000', 'widget'), widgetURL('pattern://checkin')]}>
        {number
          ? (value ? 'Pain ' + value + ' · ' + word : 'Pattern · check in')
          : (value ? 'Pattern · checked in today' : 'Pattern · check in')}
      </Text>
    );
  }

  /* ── the home screen ─────────────────────────────────────
     The reading first, because "what did I last say" is the question
     this surface is opened for; the days under or beside it as context,
     not as a verdict. */
  const medium = family === 'systemMedium';
  const large = family === 'systemLarge';
  const size = large ? 30 : medium ? 20 : 15;
  const rows = large ? 5 : medium ? 2 : 1;
  const first = 35 - rows * 7;

  const reading = (
    <HStack spacing={6}>
      <Text
        modifiers={[
          font({ textStyle: large || medium ? 'largeTitle' : 'title2', weight: 'bold' }),
          foregroundStyle(value ? (props.tint || '#FFFFFF') : '#8E8E93'),
        ]}
      >
        {value || '–'}
      </Text>
      <VStack spacing={0}>
        <Text
          modifiers={[
            font({ textStyle: 'subheadline', weight: 'semibold' }),
            foregroundStyle('#FFFFFF'),
          ]}
        >
          {value ? word : caption}
        </Text>
        <Text
          modifiers={[font({ textStyle: 'caption2' }), foregroundStyle('#8E8E93')]}
        >
          {at ? 'Last at ' + at : 'Nothing yet today'}
        </Text>
      </VStack>
      <Spacer />
    </HStack>
  );

  /* the days, oldest first, rows of seven ending today. The small widget
     reads its seven from the d props the first build shipped, so an
     older extension given a new snapshot still draws; the bigger ones
     read the grid. The letters sit under the LAST row only, and name
     every column. */
  const grid = (
    <VStack spacing={4}>
      {Array.from({ length: rows }, (_, r) => (
        <HStack spacing={4} key={'r' + r}>
          {Array.from({ length: 7 }, (_, c) => {
            const i = first + r * 7 + c;
            const fill = rows === 1
              ? (P['d' + c] || '#2E2E30')
              : cell(i);
            return (
              <RoundedRectangle cornerRadius={4} key={'c' + i}
                modifiers={[frame({ width: size, height: size }), foregroundStyle(fill)]} />
            );
          })}
          <Spacer />
        </HStack>
      ))}
      <HStack spacing={4}>
        {letters.map((l, c) => (
          <Text key={'w' + c}
            modifiers={[
              frame({ width: size }),
              font({ textStyle: 'caption2', weight: c === 6 ? 'bold' : 'regular' }),
              foregroundStyle(c === 6 ? '#FFFFFF' : '#8E8E93'),
            ]}>
            {l}
          </Text>
        ))}
        <Spacer />
      </HStack>
    </VStack>
  );

  if (medium) {
    /* side by side: the reading has the left, the fortnight the right */
    return (
      <HStack
        spacing={16}
        modifiers={[
          padding({ all: 14 }),
          containerBackground('#000000', 'widget'),
          widgetURL('pattern://checkin'),
        ]}
      >
        {reading}
        {grid}
      </HStack>
    );
  }

  return (
    <VStack
      spacing={large ? 14 : 8}
      modifiers={[
        padding({ all: 14 }),
        containerBackground('#000000', 'widget'),
        widgetURL('pattern://checkin'),
      ]}
    >
      {reading}
      {grid}
      {large ? <Spacer /> : null}
    </VStack>
  );
};

export default createWidget('WeekWidget', WeekWidget);
