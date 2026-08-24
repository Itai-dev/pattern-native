/**
 * The home-screen widget: your last seven days, and a way in.
 *
 * WHAT IT DELIBERATELY DOES NOT SHOW is a number. Trends is built under a
 * calm-surface rule — no deltas, no arrows, nothing that rewards checking
 * — because an always-available view of your own pain is what turns
 * keeping a record into watching a figure. A home screen is that surface
 * with the choice removed: you see it every time you unlock the phone,
 * whether you meant to or not. So the widget carries the shape of the
 * week and nothing you can read as a verdict.
 *
 * What it IS for is the thing that actually limits this product. Nothing
 * here works without days logged, and the cheapest way to get more of
 * them is to make starting one a single tap from the home screen. Hence
 * widgetURL: the whole surface opens the check-in.
 *
 * THREE THINGS THAT MADE THE FIRST VERSION RENDER BLACK, all fixed here
 * and all worth writing down, because none of them fail loudly:
 *
 *  1. No containerBackground. From iOS 17 a widget must declare its own
 *     background through this modifier; a widget that does not gets no
 *     background at all, which on a home screen is a black rectangle.
 *  2. Squares drawn as empty <Text> with a background modifier. In
 *     SwiftUI a Text with no content has nothing to lay out, so the frame
 *     collapsed and the fill had nothing to fill. Shapes are the right
 *     tool, and a Shape takes its colour from foregroundStyle rather than
 *     from background.
 *  3. No fallback for missing props. The widget gallery renders a preview
 *     before the app has ever pushed a snapshot, so every prop is
 *     undefined there — and an undefined colour is not a colour.
 *
 * Otherwise still written the boring way ON PURPOSE. Everything under the
 * 'widget' directive compiles to SwiftUI rather than running as
 * JavaScript, so there are no arrays, no .map and no closures — seven
 * flat props and seven shapes. Iterating costs a native build and a
 * TestFlight submission, so this is the version least likely to need a
 * third.
 *
 * The colours are computed in the app, by painScale, and arrive as hex
 * strings. There is still exactly one definition of the pain ramp.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { HStack, RoundedRectangle, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground, font, foregroundStyle, frame, padding, widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import type { WidgetSnapshot } from './widget';

/** the deep link the whole widget opens — handled in App.tsx */
export const WIDGET_URL = 'pattern://checkin';

/** the app is dark-only (userInterfaceStyle in app.json), so the widget is
 *  too. Inlined rather than imported from theme.ts: this file compiles to
 *  SwiftUI and does not run as JavaScript, so it cannot read a module. */
const BG = '#000000';
const EMPTY = '#2E2E30';

/** oldest to newest: seven hex fills and one line of words. The shape is
 *  defined in widget.ts, which is where it is built and tested. */
export type WeekWidgetProps = Partial<WidgetSnapshot>;

const SQ = 15;
const RADIUS = 4;

const WeekWidget = (props: WeekWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  return (
    <VStack
      spacing={9}
      modifiers={[
        padding({ all: 14 }),
        containerBackground(BG, 'widget'),
        widgetURL(WIDGET_URL),
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
        <RoundedRectangle cornerRadius={RADIUS}
          modifiers={[frame({ width: SQ, height: SQ }), foregroundStyle(props.d0 || EMPTY)]} />
        <RoundedRectangle cornerRadius={RADIUS}
          modifiers={[frame({ width: SQ, height: SQ }), foregroundStyle(props.d1 || EMPTY)]} />
        <RoundedRectangle cornerRadius={RADIUS}
          modifiers={[frame({ width: SQ, height: SQ }), foregroundStyle(props.d2 || EMPTY)]} />
        <RoundedRectangle cornerRadius={RADIUS}
          modifiers={[frame({ width: SQ, height: SQ }), foregroundStyle(props.d3 || EMPTY)]} />
        <RoundedRectangle cornerRadius={RADIUS}
          modifiers={[frame({ width: SQ, height: SQ }), foregroundStyle(props.d4 || EMPTY)]} />
        <RoundedRectangle cornerRadius={RADIUS}
          modifiers={[frame({ width: SQ, height: SQ }), foregroundStyle(props.d5 || EMPTY)]} />
        <RoundedRectangle cornerRadius={RADIUS}
          modifiers={[frame({ width: SQ, height: SQ }), foregroundStyle(props.d6 || EMPTY)]} />
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
