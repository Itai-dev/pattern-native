/**
 * The colour theme picker. One choice: which hue carries the pain scale.
 * Every option shows its actual ramp — five swatches from 0 to 10 — so
 * the user picks from the real thing, not from a name. The meaning never
 * changes with the hue: lighter is less, darker is more, in every theme.
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PAIN_THEMES, PainThemeId, font } from './theme';
import Icon from './Icon';
import { list, settings } from './SettingsList';
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
    <View style={settings.sheet}>
      <View style={settings.navBar}>
        <View style={settings.navSpacer} />
        <Text style={settings.navTitle}>Colour theme</Text>
        <Pressable
          onPress={onDone}
          style={settings.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Done"
        >
          <Text style={settings.navBtnText}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.lede}>
          The colour that carries your pain scale. Lighter always means less,
          darker always means more — only the hue changes.
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
                <View style={[styles.check, !on && styles.checkOff]}>
                  <Icon name="checkmark" size={17} color={list.text} weight="bold" />
                </View>
              </Press>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/* the frame is Profile's (SettingsList). The swatches are the one place
   on these sheets a hue is allowed: they ARE the pain scale, squares in
   the ramp the way every pain value is drawn. */
const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 48 },
  lede: { color: list.secondary, fontSize: font.footnote, lineHeight: 18, marginBottom: 14, marginHorizontal: 16 },
  group: { borderRadius: list.radius, borderCurve: 'continuous', backgroundColor: list.surface, overflow: 'hidden' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 64, paddingHorizontal: 16, paddingVertical: 10,
  },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: list.separator },
  rowMain: { flex: 1, gap: 7 },
  rowLabel: { color: list.text, fontSize: font.body },
  swatches: { flexDirection: 'row', gap: 5 },
  swatch: {
    width: 26, height: 26, borderRadius: 7, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.18)',
  },
  check: { width: 22, alignItems: 'center' },
  checkOff: { opacity: 0 },
});
