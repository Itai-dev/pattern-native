/**
 * The background — page one of a pain history, written once, in the
 * user's own words.
 *
 * TWO MODES, ONE DOCUMENT. The first fill is an INTERVIEW: one question
 * per screen, answer or skip, ending on a review of everything said —
 * the check-in's own pacing, because nine input boxes on one screen is
 * hospital paperwork and one plain question at a time is how a person
 * actually recalls their history. Every later open is the FORM: a
 * transcript is a bad edit surface, and medications change.
 *
 * The interview is NOT a chat, deliberately. Bubbles imply a conversant,
 * and a script that cannot understand a reply breaks that promise within
 * two exchanges — while an actual model would send health history off
 * the phone, probe where this app has promised not to, and paraphrase
 * words whose whole value is being printed exactly as written. So:
 * questions, not messages; no persona, no "I"; and every answer stored
 * verbatim.
 *
 * Every field is optional free text. Not pick-lists: a clinician reads
 * "naproxen 500mg twice daily" better than any widget collects it, and
 * free text cannot pretend to be data — nothing here is read by any
 * engine, because a static fact has an n of 1 and no comparison group.
 *
 * THE AUDIENCE IS NAMED UP FRONT. This sheet exists FOR the report and
 * says so in its first sentence, which is why it rides every share
 * without a second toggle. The life-events question is asked the
 * guarded way — never as an inventory of griefs.
 */
import React, { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as db from './db';
import { Press } from './motion';
import { BACKGROUND_FIELDS, BACKGROUND_FIELD_MAX, cleanBackground } from './model';
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

/** the interview's phrasings: plain questions, no persona, no "I".
 *  The same nine fields as the form — the interview is pacing, not a
 *  different document. */
const QUESTIONS: Record<string, string> = {
  body: 'To start — anything about you that feels relevant?',
  onset: 'How did this pain begin?',
  diagnoses: 'Has anything been diagnosed?',
  medications: 'What do you take regularly?',
  allergies: 'Any allergies worth knowing about?',
  lifestyle: 'What does an ordinary week look like?',
  changes: 'Around the time it started or changed, did anything major change?',
  family: 'Any family history that might plausibly matter?',
  other: 'Anything else a clinician should know?',
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

  /* first fill interviews; every later open edits. A mode chosen once,
     at open — a sheet that switched layouts mid-use would be chaos. */
  const [mode] = useState<'interview' | 'form'>(
    () => (db.getBackground() ? 'form' : 'interview')
  );
  /* 0..8 are the questions; 9 is the review */
  const [at, setAt] = useState(0);
  /* a question opened FROM the review goes back to the review — walking
     the rest of the interview again to reach it would punish editing */
  const [fromReview, setFromReview] = useState(false);
  const reviewing = mode === 'interview' && at >= BACKGROUND_FIELDS.length;

  const save = useCallback(() => {
    /* the cleaner runs on the way in, so what is stored is always exactly
       what would print — and a sheet of empty fields stores nothing */
    db.setBackground(cleanBackground({ ...draft, v: 1 }));
    onClose();
  }, [draft, onClose]);

  const stepNext = () => {
    Haptics.selectionAsync().catch(() => {});
    if (fromReview) { setFromReview(false); setAt(BACKGROUND_FIELDS.length); }
    else setAt(at + 1);
  };
  const stepBack = () => {
    Haptics.selectionAsync().catch(() => {});
    setAt(Math.max(0, at - 1));
  };

  const field = mode === 'interview' && !reviewing ? BACKGROUND_FIELDS[at] : null;
  const answered = field ? !!draft[field.key].trim() : false;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View style={styles.navBar}>
        <View style={styles.navSpacer}>
          {mode === 'interview' && at > 0 && (
            <Press
              onPress={stepBack}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Back to the previous question"
            >
              <Text style={styles.navBack} allowFontScaling={false}>‹</Text>
            </Press>
          )}
        </View>
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

      {mode === 'form' ? (
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
      ) : reviewing ? (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.qTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
            What you said
          </Text>
          <Text style={styles.leadFine} allowFontScaling maxFontSizeMultiplier={1.4}>
            Exactly as written, and exactly how it will print on the first page
            of your clinician report. Tap anything to change it; everything can
            be edited later from Profile.
          </Text>
          {BACKGROUND_FIELDS.map(({ key, label }, i) => (
            draft[key].trim() ? (
              <Press
                key={key}
                onPress={() => { setFromReview(true); setAt(i); }}
                pressOpacity={0.7}
                style={styles.reviewRow}
                accessibilityRole="button"
                accessibilityLabel={label + ': ' + draft[key] + '. Edits this answer'}
              >
                <Text style={styles.label} allowFontScaling maxFontSizeMultiplier={1.3}>
                  {label}
                </Text>
                <Text style={styles.reviewText} allowFontScaling maxFontSizeMultiplier={1.4}>
                  {draft[key]}
                </Text>
              </Press>
            ) : null
          ))}
          {BACKGROUND_FIELDS.every(({ key }) => !draft[key].trim()) && (
            <Text style={styles.leadFine} allowFontScaling maxFontSizeMultiplier={1.4}>
              Nothing yet — every question was skipped, which is a fine answer.
              The report simply carries no background section.
            </Text>
          )}
          <Press
            onPress={save}
            pressScale={0.985}
            style={styles.primary}
            accessibilityRole="button"
            accessibilityLabel="Save the background and close"
          >
            <Text style={styles.primaryText}>Done</Text>
          </Press>
        </ScrollView>
      ) : (
        <View style={styles.interview}>
          <ScrollView
            contentContainerStyle={styles.qBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.qTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
              {QUESTIONS[field!.key]}
            </Text>
            {at === 0 && (
              <Text style={styles.leadFine} allowFontScaling maxFontSizeMultiplier={1.4}>
                A few questions, one at a time — the background a clinician
                would ask for in the room, for the first page of your report.
                Skip anything; it all stays on this iPhone, in your words.
              </Text>
            )}
            <TextInput
              value={draft[field!.key]}
              onChangeText={(t) => setDraft((d) => ({ ...d, [field!.key]: t }))}
              placeholder={HINTS[field!.key]}
              placeholderTextColor={color.textTertiary}
              style={[styles.input, styles.qInput]}
              multiline
              maxLength={BACKGROUND_FIELD_MAX}
              accessibilityLabel={QUESTIONS[field!.key]}
              accessibilityHint={HINTS[field!.key]}
            />
          </ScrollView>
          <View style={styles.qBottom}>
            <Press
              onPress={stepNext}
              pressScale={0.985}
              style={styles.primary}
              accessibilityRole="button"
              accessibilityLabel={answered ? 'Continue' : 'Skip this question'}
            >
              {/* the button admits what it does — a skip walks through the
                  same door as an answer, and says so, the check-in's rule */}
              <Text style={styles.primaryText}>{answered ? 'Continue' : 'Skip'}</Text>
            </Press>
            <Text style={styles.qCount} allowFontScaling maxFontSizeMultiplier={1.3}>
              {at + 1} of {BACKGROUND_FIELDS.length}
            </Text>
          </View>
        </View>
      )}
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
  navSpacer: { width: 64, minHeight: 44, justifyContent: 'center' },
  navBack: { color: color.textPrimary, fontSize: 26, lineHeight: 30, paddingLeft: 4 },
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
  /* ── the interview ── */
  interview: { flex: 1 },
  qBody: { padding: size.sheetX, paddingTop: 26, flexGrow: 1 },
  qTitle: {
    color: color.textPrimary, fontSize: font.title2, fontWeight: '700',
    letterSpacing: -0.4, lineHeight: 30, marginBottom: 10,
  },
  qInput: { minHeight: 96, marginTop: 14, fontSize: font.body, lineHeight: 23 },
  qBottom: { padding: size.sheetX, paddingTop: 0, paddingBottom: 24 },
  qCount: {
    color: color.textTertiary, fontSize: font.footnote,
    textAlign: 'center', marginTop: 12, fontVariant: ['tabular-nums'],
  },
  reviewRow: {
    marginTop: 16, paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  reviewText: {
    color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21, marginTop: 4,
  },
  primary: {
    minHeight: size.buttonH, borderRadius: radius.button, borderCurve: 'continuous',
    backgroundColor: color.textPrimary,
    alignItems: 'center', justifyContent: 'center', marginTop: 20, paddingHorizontal: 16,
  },
  primaryText: { color: '#000000', fontSize: font.title3, fontWeight: '600' },
});
