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
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import { track } from './analytics';
import { addDays, todayISO } from './model';
import {
  HEALTH_CATEGORIES, HealthCategory, HealthService,
} from './health/types';
import {
  disconnectHealth, healthCategories, healthRequestedOn, markHealthRequested,
  storedHealthDays,
} from './health/sync';
import { color, font, radius, size } from './theme';

export interface HealthSheetProps {
  service: HealthService;
  /** something changed — ask App to sync and recompute */
  onChanged: () => void;
  onDone: () => void;
}

export default function HealthSheet({ service, onChanged, onDone }: HealthSheetProps) {
  const available = service.available();
  const requestedOn = healthRequestedOn();
  const already = healthCategories();
  const [picked, setPicked] = useState<HealthCategory[]>(
    already.length ? already : ['sleep', 'movement', 'workouts']
  );
  const [busy, setBusy] = useState(false);

  /* which categories have actually produced data lately — a fact about
     query results, never a statement about permission */
  const seen = useMemo(() => {
    const days = storedHealthDays();
    const from = addDays(todayISO(), -13);
    const got: Partial<Record<HealthCategory, true>> = {};
    Object.keys(days).forEach((d) => {
      if (d < from) return;
      (Object.keys(days[d].coverage) as HealthCategory[]).forEach((c) => { got[c] = true; });
    });
    return got;
  }, [requestedOn]);

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
    <View style={styles.sheet}>
      <View style={styles.navBar}>
        <View style={styles.navSpacer} />
        <Text style={styles.navTitle}>Apple Health</Text>
        <Press onPress={onDone} style={styles.navBtn} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Done">
          <Text style={styles.navBtnText}>Done</Text>
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
              Help Pattern ask less
            </Text>
            <Text style={styles.lede} allowFontScaling maxFontSizeMultiplier={1.4}>
              Connect Apple Health to let Pattern quietly compare your pain with
              sleep and activity. You choose what to share, and the data stays
              on this iPhone.
            </Text>

            <View style={styles.group}>
              {HEALTH_CATEGORIES.map((c, i) => {
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
                      {/* data presence, said as data presence. "No data
                          yet" covers a denied grant, an empty store, and
                          a watch that has not synced — all honestly. */}
                      {!!requestedOn && already.indexOf(c.id) >= 0 && (
                        <Text style={styles.rowState} allowFontScaling maxFontSizeMultiplier={1.3}>
                          {seen[c.id] ? 'Data seen recently' : 'No data yet'}
                        </Text>
                      )}
                    </View>
                    <Text style={[styles.check, !on && styles.checkOff]}
                      allowFontScaling={false}>✓</Text>
                  </Press>
                );
              })}
            </View>

            <Press
              onPress={connect}
              pressScale={0.985}
              style={[styles.primary, (busy || !picked.length) && styles.primaryOff]}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy || !picked.length }}
              accessibilityLabel={requestedOn ? 'Update what Pattern reads' : 'Continue in Health'}
            >
              <Text style={styles.primaryText}>
                {requestedOn ? 'Update what Pattern reads' : 'Continue in Health'}
              </Text>
            </Press>

            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              Apple will show its own screen where you decide, type by type.
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
                  style={styles.ghost}
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

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 64 },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  body: { padding: 20, paddingBottom: 40 },
  headline: {
    color: color.textPrimary, fontSize: font.title2, fontWeight: '700',
    letterSpacing: -0.3, marginBottom: 8,
  },
  lede: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginBottom: 18 },
  group: {
    borderRadius: radius.card, borderCurve: 'continuous',
    backgroundColor: color.bgSegmentTrack, overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 56, paddingHorizontal: 16, paddingVertical: 12,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider },
  rowMain: { flex: 1, gap: 3 },
  rowLabel: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  rowBlurb: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },
  rowState: { color: color.textTertiary, fontSize: font.footnote, marginTop: 2 },
  check: { color: color.tint, fontSize: 17, fontWeight: '700', width: 22, textAlign: 'center' },
  checkOff: { opacity: 0 },
  primary: {
    minHeight: size.buttonH, borderRadius: radius.button, borderCurve: 'continuous',
    backgroundColor: color.textPrimary, alignItems: 'center', justifyContent: 'center',
    marginTop: 20, paddingHorizontal: 16,
  },
  primaryOff: { opacity: 0.5 },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 14 },
  ghost: {
    minHeight: 46, borderRadius: radius.button, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', marginTop: 22,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  ghostText: { color: color.danger, fontSize: font.subheadline, fontWeight: '600' },
});
