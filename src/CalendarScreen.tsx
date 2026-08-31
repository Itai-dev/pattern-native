/**
 * Every day, as a calendar — summoned from Today's title, not parked in
 * a tab.
 *
 * The calendar is NAVIGATION: a map of days whose only interaction is
 * "open this day". It sat at the bottom of Record for a while, by way
 * of the History-tab merge, and served neither purpose there — too
 * buried to be quick navigation, not an aggregate so it diluted the
 * page whose job is what the record adds up to. Now the week strip on
 * Today covers the recent past, and this layer covers everything
 * older: title → calendar → day, each thing one kind of thing.
 *
 * The chrome is DayScreen's, deliberately — the same slide, the same
 * back button, the same live tab bar underneath — so "a layer over the
 * tab" stays one idea the app has, not two variants of it.
 */
import React, { useCallback, useEffect } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import MapScreen from './MapScreen';
import { Press, useReduceMotion } from './motion';
import { Entries } from './model';
import { color, font, size } from './theme';

export interface CalendarScreenProps {
  entries: Entries;
  onOpenDay: (dateIso: string) => void;
  onClose: () => void;
}

export default function CalendarScreen({ entries, onOpenDay, onClose }: CalendarScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const rm = useReduceMotion();

  /* the house curve, the one every arrival in this app eases on */
  const off = useSharedValue(1);
  const EASE = Easing.bezier(0.23, 1, 0.32, 1);
  useEffect(() => {
    off.value = withTiming(0, { duration: rm ? 0 : 340, easing: EASE });
  }, []);
  const layerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: off.value * width }],
  }));
  const dismiss = useCallback(() => {
    off.value = withTiming(1, { duration: rm ? 0 : 260, easing: EASE }, (done) => {
      if (done) runOnJS(onClose)();
    });
  }, [rm, onClose]);

  return (
    <Animated.View style={[styles.layer, { paddingTop: insets.top }, layerStyle]}>
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
          allowFontScaling
          maxFontSizeMultiplier={1.2}
        >
          Every day
        </Text>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
      >
        {/* the day screen opens OVER this layer, so coming back from a
            day lands here, mid-scroll, exactly where the browsing was */}
        <MapScreen entries={entries} onDayPress={onOpenDay} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /* opaque and full-bleed, over the tab it belongs to, with the tab bar
     still live beneath it — DayScreen's spec, shared on purpose */
  layer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: color.bgRoot,
  },
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
  /* MapScreen brings its own cards and, since the Record merge, expects
     its parent to own the gutter */
  page: { paddingHorizontal: size.pageX, paddingBottom: 140 },
});
