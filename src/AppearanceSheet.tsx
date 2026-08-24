/**
 * The colour theme picker. One choice: which hue carries the pain scale.
 * Every option shows its actual ramp — five swatches from 0 to 10 — so
 * the user picks from the real thing, not from a name. The meaning never
 * changes with the hue: darker is less, brighter is more, in every theme.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PAIN_THEMES, PainThemeId, color, font, radius } from './theme';
import { getPainTheme, painColor } from './painScale';
import { Press } from './motion';

const SWATCH_AT = [0, 2.5, 5, 7.5, 10];

export interface AppearanceSheetProps {
  onPick: (id: PainThemeId) => void;
  onDone: () => void;
}

export default function AppearanceSheet({ onPick, onDone }: AppearanceSheetProps) {
  const current = getPainTheme();
  return (
    <View style={styles.sheet}>
      <View style={styles.navBar}>
        <View style={styles.navSpacer} />
        <Text style={styles.navTitle}>Colour theme</Text>
        <Pressable
          onPress={onDone}
          style={styles.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={styles.navBtnText}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.lede}>
          The colour that carries your pain scale. Darker always means less,
          brighter always means more — only the hue changes.
        </Text>

        <View style={styles.group}>
          {PAIN_THEMES.map((t, i) => {
            const on = t.id === current;
            return (
              <Press
                key={t.id}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  onPick(t.id);
                }}
                pressOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                accessibilityLabel={t.name + (on ? ', selected' : '')}
                style={[styles.row, i > 0 && styles.rowDivider]}
              >
                <View style={styles.rowMain}>
                  <Text style={styles.rowLabel}>{t.name}</Text>
                  <View style={styles.swatches}>
                    {SWATCH_AT.map((v) => (
                      <View
                        key={v}
                        style={[styles.swatch, { backgroundColor: painColor(v, t.id) }]}
                      />
                    ))}
                  </View>
                </View>
                <Text style={[styles.check, !on && styles.checkOff]}>✓</Text>
              </Press>
            );
          })}
        </View>
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
  lede: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginBottom: 14 },
  group: { borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSegmentTrack, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 64, paddingHorizontal: 16, paddingVertical: 10,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider },
  rowMain: { flex: 1, gap: 7 },
  rowLabel: { color: color.textPrimary, fontSize: font.body },
  swatches: { flexDirection: 'row', gap: 5 },
  swatch: {
    width: 26, height: 26, borderRadius: 7,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  check: { color: color.tint, fontSize: 17, fontWeight: '700', width: 22, textAlign: 'center' },
  checkOff: { opacity: 0 },
});
