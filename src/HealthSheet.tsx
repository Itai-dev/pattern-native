/**
 * The Apple Health setup — optional, skippable, and honest about the
 * one thing HealthKit will not tell anyone.
 *
 * THE STATES THIS SCREEN IS ALLOWED TO CLAIM. HealthKit hides read
 * denials by design: a denied type just returns nothing, forever. So
 * the screen speaks only in facts it can actually know — "not set up",
 * "you've completed the Health sheet", "data seen for this category",
 * "no data yet" — and NEVER says "denied", because an empty result is
 * not evidence of one. Changing what is shared happens in Apple's own
 * Health app, and the screen says where.
 *
 * Categories are chosen HERE, before the system sheet: only the
 * underlying types for what the user ticked are requested, so Apple's
 * sheet shows exactly the ask and nothing speculative. There is no
 * reward for connecting, no red dot for skipping, and Done is always
 * one tap away.
 */
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import { track } from './analytics';
import {
  HealthCategory, HealthService, offeredCategories,
} from './health/types';
import {
  disconnectHealth, healthCategories, healthRequestedOn, markHealthRequested,
} from './health/sync';
import Icon from './Icon';
import { RowChevron, list, settings } from './SettingsList';
import { color, font } from './theme';

export interface HealthSheetProps {
  service: HealthService;
  /** something changed — ask App to sync and recompute */
  onChanged: () => void;
  onDone: () => void;
  onOpenData?: () => void;
}

export default function HealthSheet({ service, onChanged, onDone, onOpenData }: HealthSheetProps) {
  const available = service.available();
  const requestedOn = healthRequestedOn();
  const already = healthCategories();
  const [picked, setPicked] = useState<HealthCategory[]>(
    already.length ? already : ['sleep', 'movement', 'workouts']
  );
  const [busy, setBusy] = useState(false);

  const toggle = (id: HealthCategory) => {
    Haptics.selectionAsync().catch(() => {});
    setPicked((p) => (p.indexOf(id) >= 0 ? p.filter((x) => x !== id) : p.concat(id)));
  };

  const connect = async () => {
    if (busy || !picked.length) return;
    setBusy(true);
    try {
      await service.requestAuthorization(picked);
      /* the sheet completed — that is ALL this records. What was granted
         inside it belongs to Health, not to Pattern. */
      markHealthRequested(picked);
      track('health_connected', { categories: picked.length });
      onChanged();
    } catch {
      /* the sheet failed to present (or was cancelled by the system) —
         nothing is recorded, and the screen stays where it was */
    } finally {
      setBusy(false);
    }
  };

  const disconnect = () => {
    disconnectHealth();
    track('health_disconnected');
    onChanged();
    onDone();
  };

  return (
    <View style={settings.sheet}>
      <View style={settings.navBar}>
        <View style={settings.navSpacer} />
        <Text style={settings.navTitle}>Apple Health</Text>
        <Press onPress={onDone} style={settings.navBtn} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Done">
          <Text style={settings.navBtnText}>Done</Text>
        </Press>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {!available ? (
          /* an old binary, or not an iPhone. Not an error — a fact about
             this install, with the way forward named. */
          <Text style={styles.lede} allowFontScaling maxFontSizeMultiplier={1.4}>
            Apple Health needs the newest version of Pattern from TestFlight.
            Once it’s installed, this screen will offer the connection.
          </Text>
        ) : (
          <>
            <Text style={styles.headline} allowFontScaling maxFontSizeMultiplier={1.3}>
              Fewer questions, with Apple Health
            </Text>
            <Text style={styles.lede} allowFontScaling maxFontSizeMultiplier={1.4}>
              Connect Apple Health to let Pattern quietly compare your pain with
              sleep, activity and the doses you log. You choose what to share,
              and the data stays on this iPhone.
            </Text>

            {/* a row that opens a page, drawn as one: its own group, the
                chevron where Settings puts it */}
            {!!onOpenData && !!requestedOn && <Press onPress={onOpenData}
              style={[settings.group, styles.statusLink]}
              accessibilityRole="button" accessibilityLabel="View connected data">
              <Text style={settings.rowLabel}>View connected data</Text>
              <RowChevron />
            </Press>}
            <View style={styles.group}>
              {/* a row the phone cannot honour is not a row: iOS 26's
                  medication log is absent from older phones, and
                  offering it there would be a switch that does nothing */}
              {offeredCategories(already).filter((c) => service.supports(c.id)).map((c, i) => {
                const on = picked.indexOf(c.id) >= 0;
                return (
                  <Press
                    key={c.id}
                    onPress={() => toggle(c.id)}
                    pressOpacity={0.8}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={c.name + '. ' + c.blurb}
                    style={[styles.row, i > 0 && styles.rowDivider]}
                  >
                    <View style={styles.rowMain}>
                      <Text style={styles.rowLabel} allowFontScaling maxFontSizeMultiplier={1.4}>
                        {c.name}
                      </Text>
                      <Text style={styles.rowBlurb} allowFontScaling maxFontSizeMultiplier={1.4}>
                        {c.blurb}
                      </Text>
                      {/* This is the saved request, not permission or
                          availability. Received readings have their own view. */}
                      {!!requestedOn && already.indexOf(c.id) >= 0 && (
                        <Text style={styles.rowState} allowFontScaling maxFontSizeMultiplier={1.3}>
                          Selected for reading
                        </Text>
                      )}
                    </View>
                    {/* drawn either way and hidden when off, so a tick
                        never moves the row's words */}
                    <View style={[styles.check, !on && styles.checkOff]}>
                      <Icon name="checkmark" size={17} color={list.text} weight="bold" />
                    </View>
                  </Press>
                );
              })}
            </View>

            <Press
              onPress={connect}
              pressScale={0.985}
              style={[settings.primary, (busy || !picked.length) && settings.primaryOff]}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || !picked.length }}
              accessibilityLabel={requestedOn ? 'Update what Pattern reads' : 'Continue in Health'}
            >
              <Text style={settings.primaryText}>
                {requestedOn ? 'Update what Pattern reads' : 'Continue in Health'}
              </Text>
            </Press>

            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              Apple will show its own screen where you decide, type by type —
              and for medications, a second one where you pick which ones.
              Pattern only reads — it never writes to Health — and you can
              change or withdraw access any time in Health ▸ Profile ▸ Apps.
              Pattern can’t see what you allowed there; it only sees what
              data arrives.
            </Text>

            {!!requestedOn && (
              <>
                <Press
                  onPress={disconnect}
                  pressOpacity={0.8}
                  style={settings.secondary}
                  accessibilityRole="button"
                  accessibilityLabel="Stop using Apple Health"
                >
                  <Text style={styles.ghostText}>Stop using Apple Health</Text>
                </Press>
                <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
                  Stopping removes the imported context from Pattern. Your pain
                  record isn’t touched, and nothing changes in the Health app.
                </Text>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/* the frame, the buttons and the greys are Profile's (SettingsList);
   what is here is only what this sheet has that no other does */
const styles = StyleSheet.create({
  statusLink: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    minHeight: 48, paddingHorizontal: 16, marginBottom: 20,
  },
  body: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 48 },
  headline: {
    color: list.text, fontSize: font.title2, fontWeight: '700',
    letterSpacing: -0.33, marginBottom: 8, marginHorizontal: 4,
  },
  lede: {
    color: list.secondary, fontSize: font.subheadline, lineHeight: 21,
    marginBottom: 20, marginHorizontal: 4,
  },
  group: {
    borderRadius: list.radius, borderCurve: 'continuous',
    backgroundColor: list.surface, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 56, paddingHorizontal: 16, paddingVertical: 12,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: list.separator },
  rowMain: { flex: 1, gap: 3 },
  rowLabel: { color: list.text, fontSize: font.body, fontWeight: '600' },
  rowBlurb: { color: list.secondary, fontSize: font.footnote, lineHeight: 18 },
  rowState: { color: list.tertiary, fontSize: font.footnote, marginTop: 2 },
  check: { width: 22, alignItems: 'center' },
  checkOff: { opacity: 0 },
  fine: { color: list.tertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 14, marginHorizontal: 4 },
  ghostText: { color: color.danger, fontSize: font.body, fontWeight: '600' },
});
