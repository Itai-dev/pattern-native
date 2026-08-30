/**
 * The home-screen and lock-screen widget: what you last said, the shape
 * of your week, and a way in.
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
 * FOUR LAYOUTS, ONE FUNCTION. The family arrives in the environment.
 *  - accessoryCircular  the lock screen, at a glance: the number alone.
 *  - accessoryRectangular  the number, its word and the time.
 *  - systemSmall  that, over the week.
 *  - systemMedium  that, over the week with its weekday letters.
 * The lock-screen families are the point of this pass: the product's
 * whole bet is that a check-in takes ten seconds, and unlock-find-app
 * was most of them.
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

/** oldest to newest: seven fills, seven letters, today's reading and one
 *  line of words. The shape is defined in widget.ts, which is where it is
 *  built and tested. */
export type WeekWidgetProps = Partial<WidgetSnapshot>;

const WeekWidget = (props: WeekWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const family = (environment && environment.widgetFamily) || 'systemSmall';
  const value = props.last || '';
  const word = props.word || '';
  const at = props.at || '';
  const caption = props.caption || 'Check in';

  /* ── the lock screen ─────────────────────────────────────
     Rendered monochrome by the system, so nothing here leans on colour.
     Circular is one glyph: the number, or a dash on a day with nothing
     in it — never a zero, which on this scale is a real answer. */
  if (family === 'accessoryCircular') {
    return (
      <VStack
        spacing={0}
        modifiers={[containerBackground('#000000', 'widget'), widgetURL('pattern://checkin')]}
      >
        <Text modifiers={[font({ textStyle: 'title2', weight: 'semibold' })]}>
          {value || '–'}
        </Text>
        <Text modifiers={[font({ textStyle: 'caption2' })]}>
          {value ? 'pain' : 'log'}
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
          {value ? value + ' · ' + word : 'No check-in yet'}
        </Text>
        <Text modifiers={[font({ textStyle: 'caption2' })]}>
          {at ? 'Last at ' + at : 'Tap to check in'}
        </Text>
      </VStack>
    );
  }

  /* ── the home screen ─────────────────────────────────────
     The reading first, because "what did I last say" is the question
     this surface is opened for; the week under it as context, not as a
     verdict. */
  const medium = family === 'systemMedium';
  const cell = medium ? 26 : 15;

  return (
    <VStack
      spacing={medium ? 10 : 8}
      modifiers={[
        padding({ all: 14 }),
        containerBackground('#000000', 'widget'),
        widgetURL('pattern://checkin'),
      ]}
    >
      <HStack spacing={6}>
        <Text
          modifiers={[
            font({ textStyle: medium ? 'largeTitle' : 'title2', weight: 'bold' }),
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

      {/* the week, oldest first. The letters are what turn seven
          anonymous squares into days you can find yourself in — today is
          always the last one. */}
      <HStack spacing={4}>
        <VStack spacing={3}>
          <RoundedRectangle cornerRadius={4}
            modifiers={[frame({ width: cell, height: cell }), foregroundStyle(props.d0 || '#2E2E30')]} />
          <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle('#8E8E93')]}>
            {props.w0 || ' '}
          </Text>
        </VStack>
        <VStack spacing={3}>
          <RoundedRectangle cornerRadius={4}
            modifiers={[frame({ width: cell, height: cell }), foregroundStyle(props.d1 || '#2E2E30')]} />
          <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle('#8E8E93')]}>
            {props.w1 || ' '}
          </Text>
        </VStack>
        <VStack spacing={3}>
          <RoundedRectangle cornerRadius={4}
            modifiers={[frame({ width: cell, height: cell }), foregroundStyle(props.d2 || '#2E2E30')]} />
          <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle('#8E8E93')]}>
            {props.w2 || ' '}
          </Text>
        </VStack>
        <VStack spacing={3}>
          <RoundedRectangle cornerRadius={4}
            modifiers={[frame({ width: cell, height: cell }), foregroundStyle(props.d3 || '#2E2E30')]} />
          <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle('#8E8E93')]}>
            {props.w3 || ' '}
          </Text>
        </VStack>
        <VStack spacing={3}>
          <RoundedRectangle cornerRadius={4}
            modifiers={[frame({ width: cell, height: cell }), foregroundStyle(props.d4 || '#2E2E30')]} />
          <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle('#8E8E93')]}>
            {props.w4 || ' '}
          </Text>
        </VStack>
        <VStack spacing={3}>
          <RoundedRectangle cornerRadius={4}
            modifiers={[frame({ width: cell, height: cell }), foregroundStyle(props.d5 || '#2E2E30')]} />
          <Text modifiers={[font({ textStyle: 'caption2' }), foregroundStyle('#8E8E93')]}>
            {props.w5 || ' '}
          </Text>
        </VStack>
        <VStack spacing={3}>
          <RoundedRectangle cornerRadius={4}
            modifiers={[frame({ width: cell, height: cell }), foregroundStyle(props.d6 || '#2E2E30')]} />
          <Text modifiers={[font({ textStyle: 'caption2', weight: 'bold' }), foregroundStyle('#FFFFFF')]}>
            {props.w6 || ' '}
          </Text>
        </VStack>
        <Spacer />
      </HStack>
    </VStack>
  );
};

export default createWidget('WeekWidget', WeekWidget);
