/**
 * The background — page one of a pain history, written once, in the
 * user's own words.
 *
 * Every field is optional free text. Not pick-lists, deliberately: a
 * clinician reads "naproxen 500mg twice daily, amitriptyline at night"
 * better than any structured widget could collect it, and free text
 * cannot pretend to be data — nothing here is read by any engine,
 * because a static fact has an n of 1 and no comparison group, ever.
 *
 * THE AUDIENCE IS NAMED UP FRONT. Day notes are private by default and
 * opt into the PDF at share time because they are written with no
 * reader in mind; this sheet exists FOR the report and says so in its
 * first sentence, which is why it rides every share without a second
 * toggle. Someone who wants a thing kept out of the PDF leaves the
 * field empty.
 *
 * The life-events question is asked the guarded way — around the time
 * it started or changed, did anything major change? — and never as an
 * inventory of griefs. This app is not conducting a psychiatric
 * assessment, and its copy must not drift into looking like one.
 */
import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as db from './db';
import { Press } from './motion';
import { BACKGROUND_FIELDS, Background, BACKGROUND_FIELD_MAX, cleanBackground } from './model';
import { color, font, radius, size } from './theme';

/** what sits under each label as the empty-state hint — examples, not
 *  demands, and none of them imply a field is expected to be filled */
const HINTS: Record<string, string> = {
  body: 'Age, height, weight — whatever feels relevant',
  onset: 'When it began, sudden or gradual, any injury behind it',
  diagnoses: 'Anything a clinician has named',
  medications: 'What you take regularly, with doses if you know them',
  allergies: 'Medicines, foods, anything significant',
  lifestyle: 'Work, exercise, sleep, alcohol, caffeine — the usual shape',
  changes: 'Health, life, stress, work, sleep, activity — anything major',
  family: 'Conditions in the family that might plausibly matter',
  other: 'Anything a clinician should know that fits nowhere above',
};

export interface BackgroundSheetProps {
  onClose: () => void;
}

export default function BackgroundSheet({ onClose }: BackgroundSheetProps) {
  /* drafted apart from storage; nothing is written until Done, so
     backing out is a real cancel */
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const b = db.getBackground();
    const out: Record<string, string> = {};
    BACKGROUND_FIELDS.forEach(({ key }) => { out[key] = (b && b[key]) || ''; });
    return out;
  });

  const save = useCallback(() => {
    /* the cleaner runs on the way in, so what is stored is exactly what
       will print — and a sheet of empty fields stores nothing at all */
    db.setBackground(cleanBackground({ ...draft, v: 1 }));
    onClose();
  }, [draft, onClose]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View style={styles.navBar}>
        <View style={styles.navSpacer} />
        <Text style={styles.navTitle}>Background</Text>
        <Press
          onPress={save}
          style={styles.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Save and close"
        >
          <Text style={styles.navBtnText}>Done</Text>
        </Press>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.4}>
          This goes on the first page of the PDF you share with a clinician —
          the background they would otherwise ask for in the room. In your own
          words; every field is optional.
        </Text>
        <Text style={styles.leadFine} allowFontScaling maxFontSizeMultiplier={1.4}>
          Kept on this iPhone with the rest of your record. Nothing here is
          analysed or compared — it is printed exactly as written, only in the
          report you choose to share.
        </Text>

        {BACKGROUND_FIELDS.map(({ key, label }) => (
          <View key={key} style={styles.field}>
            <Text style={styles.label} allowFontScaling maxFontSizeMultiplier={1.3}>
              {label}
            </Text>
            <TextInput
              value={draft[key]}
              onChangeText={(t) => setDraft((d) => ({ ...d, [key]: t }))}
              placeholder={HINTS[key]}
              placeholderTextColor={color.textTertiary}
              style={styles.input}
              multiline
              maxLength={BACKGROUND_FIELD_MAX}
              accessibilityLabel={label}
              accessibilityHint={HINTS[key]}
            />
          </View>
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 64 },
  navTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  body: { padding: size.sheetX, paddingTop: 18, paddingBottom: 40 },
  lead: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21 },
  leadFine: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: 8,
  },
  field: { marginTop: 18 },
  label: { color: color.textSecondary, fontSize: font.footnote, fontWeight: '600' },
  input: {
    color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21,
    minHeight: 44, textAlignVertical: 'top',
    borderRadius: radius.button, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
    backgroundColor: color.bgSurface,
    paddingHorizontal: 12, paddingVertical: 10, marginTop: 6,
  },
});
