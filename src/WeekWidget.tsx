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
 * Written the boring way ON PURPOSE. Everything under the 'widget'
 * directive compiles to SwiftUI rather than running as JavaScript, so
 * there are no arrays, no .map, no closures and no imported helpers in
 * here — seven flat colour props and seven squares. Iterating on this
 * costs a native build and a TestFlight submission, so the first version
 * is the one least likely to need a second.
 *
 * The colours are computed in the app, by painScale, and arrive as hex
 * strings. There is still exactly one definition of the pain ramp.
 */
import { createWidget, type WidgetEnvironment } from 'expo-widgets';
import { HStack, Text, VStack } from '@expo/ui/swift-ui';
import {
  background, cornerRadius, font, foregroundStyle, frame, padding, widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import type { WidgetSnapshot } from './widget';

/** the deep link the whole widget opens — handled in App.tsx */
export const WIDGET_URL = 'pattern://checkin';

/** oldest to newest: seven hex fills and one line of words. The shape is
 *  defined in widget.ts, which is where it is built and tested. */
export type WeekWidgetProps = WidgetSnapshot;

const SQ = 15;
const RADIUS = 4;

const WeekWidget = (props: WeekWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  return (
    <VStack
      spacing={10}
      modifiers={[
        padding({ all: 14 }),
        widgetURL(WIDGET_URL),
      ]}
    >
      <Text
        modifiers={[
          font({ textStyle: 'caption2', weight: 'semibold' }),
          foregroundStyle({ type: 'hierarchical', style: 'secondary' }),
        ]}
      >
        LAST 7 DAYS
      </Text>

      <HStack spacing={4}>
        <Text modifiers={[frame({ width: SQ, height: SQ }), background(props.d0), cornerRadius(RADIUS)]} />
        <Text modifiers={[frame({ width: SQ, height: SQ }), background(props.d1), cornerRadius(RADIUS)]} />
        <Text modifiers={[frame({ width: SQ, height: SQ }), background(props.d2), cornerRadius(RADIUS)]} />
        <Text modifiers={[frame({ width: SQ, height: SQ }), background(props.d3), cornerRadius(RADIUS)]} />
        <Text modifiers={[frame({ width: SQ, height: SQ }), background(props.d4), cornerRadius(RADIUS)]} />
        <Text modifiers={[frame({ width: SQ, height: SQ }), background(props.d5), cornerRadius(RADIUS)]} />
        <Text modifiers={[frame({ width: SQ, height: SQ }), background(props.d6), cornerRadius(RADIUS)]} />
      </HStack>

      <Text modifiers={[font({ textStyle: 'subheadline', weight: 'semibold' })]}>
        {props.caption}
      </Text>
    </VStack>
  );
};

export default createWidget('WeekWidget', WeekWidget);
