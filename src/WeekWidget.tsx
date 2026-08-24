/**
 * The home-screen widget: your last seven days, and a way in.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW is a number. Trends is built under a
 * calm-surface rule — no deltas, no arrows, nothing that rewards checking
 * — because an always-available view of your own pain is what turns
 * keeping a record into watching a figure. A home screen is that surface
 * with the choice removed. So the widget carries the shape of the week
 * and nothing you can read as a verdict, and its whole surface is a
 * widgetURL into the check-in.
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
 * fallback literal, and nothing outside the function body is referenced.
 * The gallery preview renders the function with NO props at all, so the
 * fallbacks are what the picker shows.
 *
 * The colours are computed in the app by painScale and arrive as hex
 * strings through the snapshot. One definition of the pain ramp, still.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { HStack, RoundedRectangle, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground, font, foregroundStyle, frame, padding, widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import type { WidgetSnapshot } from './widget';

/** the deep link the whole widget opens — handled in App.tsx. The literal
 *  is repeated inside the widget function because the function cannot see
 *  this constant; this export exists so the app side and any test compare
 *  against one name. */
export const WIDGET_URL = 'pattern://checkin';

/** oldest to newest: seven hex fills and one line of words. The shape is
 *  defined in widget.ts, which is where it is built and tested. */
export type WeekWidgetProps = Partial<WidgetSnapshot>;

const WeekWidget = (props: WeekWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  return (
    <VStack
      spacing={9}
      modifiers={[
        padding({ all: 14 }),
        containerBackground('#000000', 'widget'),
        widgetURL('pattern://checkin'),
      ]}
    >
      <Text
        modifiers={[
          font({ textStyle: 'caption2', weight: 'semibold' }),
          foregroundStyle('#8E8E93'),
        ]}
      >
        LAST 7 DAYS
      </Text>

      <HStack spacing={4}>
        <RoundedRectangle cornerRadius={4}
          modifiers={[frame({ width: 15, height: 15 }), foregroundStyle(props.d0 || '#2E2E30')]} />
        <RoundedRectangle cornerRadius={4}
          modifiers={[frame({ width: 15, height: 15 }), foregroundStyle(props.d1 || '#2E2E30')]} />
        <RoundedRectangle cornerRadius={4}
          modifiers={[frame({ width: 15, height: 15 }), foregroundStyle(props.d2 || '#2E2E30')]} />
        <RoundedRectangle cornerRadius={4}
          modifiers={[frame({ width: 15, height: 15 }), foregroundStyle(props.d3 || '#2E2E30')]} />
        <RoundedRectangle cornerRadius={4}
          modifiers={[frame({ width: 15, height: 15 }), foregroundStyle(props.d4 || '#2E2E30')]} />
        <RoundedRectangle cornerRadius={4}
          modifiers={[frame({ width: 15, height: 15 }), foregroundStyle(props.d5 || '#2E2E30')]} />
        <RoundedRectangle cornerRadius={4}
          modifiers={[frame({ width: 15, height: 15 }), foregroundStyle(props.d6 || '#2E2E30')]} />
      </HStack>

      <Text
        modifiers={[
          font({ textStyle: 'subheadline', weight: 'semibold' }),
          foregroundStyle('#FFFFFF'),
        ]}
      >
        {props.caption || 'Check in'}
      </Text>
    </VStack>
  );
};

export default createWidget('WeekWidget', WeekWidget);
