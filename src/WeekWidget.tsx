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
 *
 * THE REDESIGN'S CARD (21 Oct 2026, build 49). A home-screen widget is a
 * card on someone's home screen, so it takes Today's card: the #1C1C1E
 * surface, a small white SF Symbol and a semibold label on top with the
 * time in grey at the right, every number in SF Rounded, and the reading
 * as the check-in draws it — the number INSIDE its pain square, black or
 * white by the square's luminance (PainShape's inkForBg, recomputed here
 * from `tint` because this function can call nothing but globals). The
 * medium and large cards end on the phone's "not" line. What it shows is
 * unchanged: the snapshot's keys, today only, nothing derived.
 *
 * Only the extension's globals are used — the sandbox in
 * tools/test-widget.js holds exactly those, and a modifier outside it
 * (lineLimit, shapes, …) would be a ReferenceError there and a black
 * rectangle on a phone.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { HStack, Image, RoundedRectangle, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  background, containerBackground, font, foregroundStyle, frame, padding, widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import type { WidgetSnapshot } from './widget';

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
          <Text modifiers={[font({ textStyle: 'title2', weight: 'bold', design: 'rounded' })]}>
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
        {/* rounded like every figure in the redesign; the whole line takes
            it, because a word and a number in two faces on one lock-screen
            line read as two things */}
        <Text modifiers={[font({ textStyle: 'headline', weight: 'semibold', design: 'rounded' })]}>
          {number ? (value ? value + ' · ' + word : 'No check-in yet') : 'Pattern'}
        </Text>
        <Text modifiers={[font({ textStyle: 'caption2', design: 'rounded' })]}>
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
     Today's card, on the home screen: the header, the reading first —
     "what did I last say" is the question this surface is opened for —
     and the days under or beside it as context, not as a verdict. */
  const medium = family === 'systemMedium';
  const large = family === 'systemLarge';
  const size = large ? 30 : medium ? 18 : 15;
  const rows = large ? 5 : medium ? 2 : 1;
  const first = 35 - rows * 7;
  /* the reading's square: the check-in's shape at widget scale. 0.27 of
     the side is the phone's day square (11 on 40); the number takes a
     little over half the side, as on the watch */
  const side = large ? 56 : medium ? 40 : 44;

  /* the ink for a number inside its square: black on a light fill,
     white on a dark one, by WCAG luminance with the 0.179 crossover —
     painScale's inkForBg, written out, because this function can call
     nothing it did not define itself. A tint that does not parse gets
     white, which is what a dark unknown would get. */
  const tint = props.tint || '#2E2E30';
  const hex = parseInt(tint.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = isNaN(hex) ? 0
    : 0.2126 * lin((hex >> 16) & 255) + 0.7152 * lin((hex >> 8) & 255) + 0.0722 * lin(hex & 255);
  const ink = lum > 0.179 ? '#000000' : '#FFFFFF';

  /* SummaryCard's CardHeader: a small white glyph, the label, and the
     fact at the right in grey. The glyph is the SF Symbol Today's card
     stands for; white, because a hue here would be a pain value that
     is not one. The time is the latest check-in's, today's only. */
  const header = (
    <HStack spacing={5}>
      <Image systemName="calendar" size={13} color="#FFFFFF" />
      <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>
        Today
      </Text>
      <Spacer />
      {at ? (
        <Text modifiers={[font({ size: 13, weight: 'semibold', design: 'rounded' }), foregroundStyle('#98989F')]}>
          {large || medium ? 'Last check-in ' + at : at}
        </Text>
      ) : null}
    </HStack>
  );

  /* THE SQUARE IS THE TEXT'S OWN BACKGROUND, not a shape beside it: the
     number sits inside it as it does on the check-in and the watch, and
     the RoundedRectangles in the tree stay exactly the days — which is
     what tools/test-widget.js counts and what the gallery preview's
     outlines are held to. Before anything is logged there is no square
     at all: an empty square here read, on Today, as a pain value not
     yet given, and Today dropped it for that reason. */
  const reading = value ? (
    <HStack spacing={8}>
      <Text
        modifiers={[
          font({ size: Math.round(side * 0.58), weight: 'bold', design: 'rounded' }),
          foregroundStyle(ink),
          frame({ width: side, height: side }),
          background(tint, {
            shape: 'roundedRectangle', cornerRadius: Math.round(side * 0.27),
            roundedCornerStyle: 'continuous', cornerSize: undefined,
          }),
        ]}
      >
        {value}
      </Text>
      {/* the word, white, where Health puts a value's unit; it wraps to
          two lines in the small card rather than truncating "Most intense" */}
      <Text modifiers={[font({ size: medium ? 15 : 17, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>
        {word}
      </Text>
      <Spacer />
    </HStack>
  ) : (
    /* nothing yet today: a statement and the tap's label, never a zero,
       never a nudge — the caption's own two words, as before */
    <VStack spacing={2} alignment="leading">
      <Text modifiers={[font({ size: 17, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>
        Nothing yet today
      </Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle('#98989F')]}>
        {caption}
      </Text>
    </VStack>
  );

  /* the days, oldest first, rows of seven ending today. The small widget
     reads its seven from the d props the first build shipped, so an
     older extension given a new snapshot still draws; the bigger ones
     read the grid. The letters sit under the LAST row only, and name
     every column. In the medium card the grid sits beside the reading
     and takes no trailing spacer, so the two do not split the width
     between two flexible gaps. */
  const tail = !medium;
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
              <RoundedRectangle cornerRadius={Math.round(size * 0.27)} key={'c' + i}
                modifiers={[frame({ width: size, height: size }), foregroundStyle(fill)]} />
            );
          })}
          {tail ? <Spacer /> : null}
        </HStack>
      ))}
      <HStack spacing={4}>
        {letters.map((l, c) => (
          <Text key={'w' + c}
            modifiers={[
              frame({ width: size }),
              font({ size: 11, weight: c === 6 ? 'bold' : 'regular', design: 'rounded' }),
              foregroundStyle(c === 6 ? '#FFFFFF' : '#8E8E93'),
            ]}>
            {l}
          </Text>
        ))}
        {tail ? <Spacer /> : null}
      </HStack>
    </VStack>
  );

  /* what the numbers are not, inside the card — Today's own line. The
     small card has no room for it, and is the same reading as Today,
     whose card carries it. */
  const fine = (
    <Text modifiers={[font({ size: 11 }), foregroundStyle('#8E8E93')]}>
      The number you entered. Lighter squares are less.
    </Text>
  );

  /* the redesign's card surface, not the black page behind it */
  const surface = containerBackground('#1C1C1E', 'widget');

  if (medium) {
    /* the header across, the reading left and the fortnight right, the
       line under both */
    return (
      <VStack
        spacing={8}
        alignment="leading"
        modifiers={[padding({ all: 14 }), surface, widgetURL('pattern://checkin')]}
      >
        {header}
        <HStack spacing={12}>
          {reading}
          {grid}
        </HStack>
        <Spacer />
        {fine}
      </VStack>
    );
  }

  return (
    <VStack
      spacing={large ? 12 : 8}
      alignment="leading"
      modifiers={[padding({ all: 14 }), surface, widgetURL('pattern://checkin')]}
    >
      {header}
      {reading}
      {large ? null : <Spacer />}
      {grid}
      {large ? <Spacer /> : null}
      {large ? fine : null}
    </VStack>
  );
};

export default createWidget('WeekWidget', WeekWidget);
