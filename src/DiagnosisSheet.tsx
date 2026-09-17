/**
 * The diagnosis, from Profile — the same question onboarding asked,
 * open to change.
 *
 * Why it exists at all: a diagnosis arrives. "Still looking" is the
 * answer most likely to be out of date in three months, and it is the
 * person who gave it whom the app most needs to hear from again — the
 * order of Today's offers and the first row of the report both hang on
 * it. Installs from before the question existed also land here: Today
 * puts the question once, and this is where the answer goes.
 *
 * Drafted apart from storage, written on Done: backing out is a real
 * cancel. Done with nothing chosen stores the skip — the person looked
 * at the question and passed, which is an answer, and Today will not
 * ask again.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import * as db from './db';
import { Press } from './motion';
import DiagnosisStep, { draftOf, draftToRaw } from './DiagnosisStep';
import { cleanDiagnosis, todayISO } from './model';
import { color, font, size } from './theme';

export interface DiagnosisSheetProps {
  onClose: () => void;
}

export default function DiagnosisSheet({ onClose }: DiagnosisSheetProps) {
  const [draft, setDraft] = useState(() => draftOf(db.getDiagnosis()));

  const save = () => {
    db.setDiagnosis(cleanDiagnosis(draftToRaw(draft, todayISO())));
    onClose();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View style={styles.navBar}>
        <View style={styles.navSpacer} />
        <Text style={styles.navTitle}>Diagnosis</Text>
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
        <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.3}>
          Do you have a diagnosis?
        </Text>
        <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.4}>
          It decides what Pattern is for you. Without one, the record is what
          a clinician builds a diagnosis from. With one, it is how you see
          what helps you manage it. Change it whenever it changes.
        </Text>
        <Text style={styles.leadFine} allowFontScaling maxFontSizeMultiplier={1.4}>
          Printed on the first page of your clinician summary, exactly as
          you set it here. Kept on this iPhone; never analysed, never sent.
        </Text>
        <View style={styles.step}>
          <DiagnosisStep draft={draft} onChange={setDraft} />
        </View>
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
  navSpacer: { width: 64, minHeight: 44 },
  navTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  body: { padding: size.sheetX, paddingTop: 22, paddingBottom: 40 },
  title: {
    color: color.textPrimary, fontSize: font.title2, fontWeight: '700',
    letterSpacing: -0.4, lineHeight: 30, marginBottom: 10,
  },
  lead: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21 },
  leadFine: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: 8,
  },
  step: { marginTop: 20 },
});
