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
import { list, settings } from './SettingsList';
import { font } from './theme';

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
      <View style={settings.navBar}>
        <View style={settings.navSpacer} />
        <Text style={settings.navTitle}>Diagnosis</Text>
        <Press
          onPress={save}
          style={settings.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Save and close"
        >
          <Text style={settings.navBtnText}>Done</Text>
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
          It decides what Pattern is for you. Without one, it helps you build
          a clearer picture to bring to your doctor. With one, it helps you
          see what affects your pain and what keeps you active. Change it
          whenever it changes.
        </Text>
        <Text style={styles.leadFine} allowFontScaling maxFontSizeMultiplier={1.4}>
          Printed on the first page of the PDF, exactly as you set it
          here. Kept on this iPhone; never analysed, never sent.
        </Text>
        <View style={styles.step}>
          <DiagnosisStep draft={draft} onChange={setDraft} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* the frame is Profile's (SettingsList); the question itself is
   DiagnosisStep, onboarding's own, so the two places ask it alike */
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: list.ground },
  body: { padding: 20, paddingTop: 14, paddingBottom: 48 },
  title: {
    color: list.text, fontSize: font.title2, fontWeight: '700',
    letterSpacing: -0.33, lineHeight: 28, marginBottom: 10,
  },
  lead: { color: list.text, fontSize: font.subheadline, lineHeight: 21 },
  leadFine: {
    color: list.secondary, fontSize: font.footnote, lineHeight: 18, marginTop: 8,
  },
  step: { marginTop: 20 },
});
