/**
 * The hypothesis, and the fourteen days that follow it.
 *
 * Three questions in the user's own words, then one factor they pick, then
 * one Pattern adds. Three screens, in the check-in's cadence.
 *
 *   1. Ask     — what are you trying to understand, what makes it harder,
 *                what helps. Free text, all optional, and NEVER SENT
 *                ANYWHERE. The words go into the database and into the
 *                doctor report exactly as typed; nothing reads them but a
 *                lookup table in this repo, on this phone.
 *   2. Pick    — the factor library, with whatever their own words pointed
 *                at floated to the top. They choose exactly one.
 *   3. Confirm — that one, plus a second they did not name, and the start.
 *
 * WHY THE SECOND FACTOR EXISTS. A period that tracks only what someone
 * already suspects can confirm but never discover, and the same person is
 * rating both the factor and the pain, at the same moment, holding a
 * stated theory about how the two relate. One factor nobody nominated is
 * the cheapest check available on that.
 *
 * It is NOT labelled a control and the screen does not tell anyone their
 * judgement is being checked. That framing would be discourteous, and it
 * would probably change how they answer it — which is the one thing that
 * would make the check useless. Whether naming it at all has that effect
 * is an open question; shadow_eval records both factors identically, with
 * a factorRole column, so it is a question real data can answer.
 *
 * Fourteen days is a REVIEW POINT. Nothing here promises a conclusion,
 * and §13.1's review reports how much was collected, never what it says.
 */
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as db from './db';
import { Press } from './motion';
import { MetricDef, matchFactors, matchedExclusions, protocolFactors } from './metrics';
import { PROTOCOL_VERSION, todayISO } from './model';
import {
  PROTOCOL_CONFIRM_BODY, PROTOCOL_CONFIRM_TITLE, PROTOCOL_CHOSEN_NOTE,
  PROTOCOL_SECOND_NOTE, pickSecondFactor, reviewDateFor,
} from './protocol';
import { color, font, radius, size } from './theme';

type Step = 'ask' | 'pick' | 'confirm';

export interface FocusSheetProps {
  /** a factor the chips kept pointing at — the flow opens on the picker
   *  with it already chosen, since the question it would ask has already
   *  been answered by the flagging */
  seedFactor?: string | null;
  onDone: () => void;
  onClose: () => void;
}

const QUESTIONS: { key: 'understand' | 'harder' | 'helps'; q: string; ph: string }[] = [
  {
    key: 'understand',
    q: 'What are you trying to understand about your pain?',
    ph: 'e.g. why some mornings are so much worse',
  },
  {
    key: 'harder',
    q: 'What do you think makes it harder?',
    ph: 'e.g. stress, cold weather, sitting too long',
  },
  {
    key: 'helps',
    q: 'What seems to help?',
    ph: 'e.g. sleep, heat, moving around',
  },
];

export default function FocusSheet({ seedFactor, onDone, onClose }: FocusSheetProps) {
  const [step, setStep] = useState<Step>(seedFactor ? 'pick' : 'ask');
  /* Onboarding asked the first question on day zero and stored the
     answer. Finding it here is the whole point of having asked then:
     the picker's suggestions are already built from their own words, and
     nobody is asked twice what they have already said. */
  const [existing] = useState(() => db.latestHypothesis());
  const [answers, setAnswers] = useState({
    understand: existing?.understand || '',
    harder: existing?.harder || '',
    helps: existing?.helps || '',
  });
  const [chosen, setChosen] = useState<string | null>(seedFactor || null);
  const [showAll, setShowAll] = useState(false);

  const words = (answers.understand + ' ' + answers.harder + ' ' + answers.helps).trim();

  /* what their own words pointed at, and what those words pointed at that
     Pattern cannot honestly track yet */
  const matched = useMemo(() => matchFactors(words).filter((m) => m.protocolEligible), [words]);
  const excluded = useMemo(() => matchedExclusions(words), [words]);
  const matchedIds = useMemo(() => matchFactors(words).map((m) => m.id), [words]);

  /* suggestions first, then the rest of the library behind Show all */
  const all = protocolFactors();
  const rest = all.filter((m) => !matched.some((x) => x.id === m.id));
  const offered: MetricDef[] = showAll || !matched.length ? matched.concat(rest) : matched;

  const second = useMemo(() => {
    if (!chosen) return null;
    const prev = db.getProtocols().filter((p) => p.status !== 'active').pop();
    return pickSecondFactor(chosen, matchedIds, prev ? prev.secondFactor : null, db.getRotation());
  }, [chosen, matchedIds]);

  const chosenDef = chosen ? all.filter((m) => m.id === chosen)[0] : null;

  const hasWords = !!(answers.understand.trim() || answers.harder.trim() || answers.helps.trim());

  const start = () => {
    if (!chosen || !second) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    const today = todayISO();
    /* update the row onboarding started rather than opening a second one
       — two hypotheses for one person is a record that contradicts
       itself in the doctor summary */
    let hid = existing?.id || 0;
    if (hasWords) {
      if (hid) db.updateHypothesis(hid, { createdOn: existing!.createdOn, ...answers });
      else hid = db.addHypothesis({ createdOn: today, ...answers });
    }
    db.startProtocol({
      version: PROTOCOL_VERSION,
      startDate: today,
      endDate: null,
      reviewOn: reviewDateFor(today),
      chosenFactor: chosen,
      secondFactor: second.factor.id,
      hypothesisId: hid || null,
      status: 'active',
    });
    db.setRotation(second.nextRotation);
    onDone();
  };

  const advance = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step === 'ask') setStep('pick');
    else if (step === 'pick') setStep('confirm');
    else start();
  };

  const back = () => {
    Haptics.selectionAsync().catch(() => {});
    setStep(step === 'confirm' ? 'pick' : 'ask');
  };

  const canAdvance = step === 'pick' ? !!chosen : step === 'confirm' ? !!second : true;

  const title = step === 'ask' ? 'What do you want to understand?'
    : step === 'pick' ? 'Pick one to watch'
      : PROTOCOL_CONFIRM_TITLE;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.navBar}>
        {step !== 'ask' ? (
          <Press onPress={back} style={styles.navBtn} hitSlop={10}
            accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.navBtnText}>Back</Text>
          </Press>
        ) : <View style={styles.navSpacer} />}
        <Text style={styles.navTitle}>Your focus</Text>
        <Press onPress={onClose} style={[styles.navBtn, styles.navBtnRight]} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.navBtnText}>Close</Text>
        </Press>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.title} allowFontScaling maxFontSizeMultiplier={1.4}>{title}</Text>

        {step === 'ask' && (
          <>
            <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.5}>
              In your own words. All three are optional, and they stay on this
              phone — they go into your doctor summary exactly as you type them,
              and nowhere else.
            </Text>
            {QUESTIONS.map((qq) => (
              <View key={qq.key} style={styles.qBlock}>
                <Text style={styles.q} allowFontScaling maxFontSizeMultiplier={1.4}>
                  {qq.q}
                </Text>
                <TextInput
                  value={answers[qq.key]}
                  onChangeText={(v) => setAnswers((a) => ({ ...a, [qq.key]: v }))}
                  placeholder={qq.ph}
                  placeholderTextColor={color.textTertiary}
                  style={styles.input}
                  multiline
                  accessibilityLabel={qq.q}
                />
              </View>
            ))}
          </>
        )}

        {step === 'pick' && (
          <>
            <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.5}>
              {matched.length
                ? 'From what you wrote. Choose one to answer every day — you can change it later.'
                : 'Choose one to answer every day. You can change it later.'}
            </Text>

            {offered.map((m) => {
              const on = chosen === m.id;
              const suggested = matched.some((x) => x.id === m.id);
              return (
                <Press
                  key={m.id}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setChosen(on ? null : m.id);
                  }}
                  pressOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={m.name + '. ' + m.question}
                  style={[styles.option, on && styles.optionOn]}
                >
                  <View style={styles.optionMain}>
                    <Text style={styles.optionName} allowFontScaling maxFontSizeMultiplier={1.4}>
                      {m.name}
                      {suggested && !showAll ? '' : ''}
                    </Text>
                    <Text style={styles.optionQ} allowFontScaling maxFontSizeMultiplier={1.3}>
                      {m.question}
                    </Text>
                  </View>
                  <View style={[styles.tick, on && styles.tickOn]}>
                    {on && <Text style={styles.tickMark}>✓</Text>}
                  </View>
                </Press>
              );
            })}

            {!showAll && matched.length > 0 && (
              <Press onPress={() => setShowAll(true)} style={styles.more} pressOpacity={0.7}
                accessibilityRole="button" accessibilityLabel="Show everything Pattern can track">
                <Text style={styles.moreText}>Show everything ›</Text>
              </Press>
            )}

            {/* what they named that Pattern cannot examine yet — said plainly,
                rather than quietly substituting something else for it */}
            {excluded.map((m) => (
              <View key={m.id} style={styles.cantCard}>
                <Text style={styles.cantTitle}>{m.name} — not yet</Text>
                <Text style={styles.cantBody}>{m.excludedBecause}</Text>
              </View>
            ))}
          </>
        )}

        {step === 'confirm' && chosenDef && second && (
          <>
            <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.5}>
              You’ll answer two short questions each day.
            </Text>

            <View style={styles.pickCard}>
              <Text style={styles.pickName}>{chosenDef.name}</Text>
              <Text style={styles.pickNote}>{PROTOCOL_CHOSEN_NOTE}</Text>
              <Text style={styles.pickQ}>{chosenDef.question}</Text>
            </View>

            <View style={styles.pickCard}>
              <Text style={styles.pickName}>{second.factor.name}</Text>
              <Text style={styles.pickNote}>{PROTOCOL_SECOND_NOTE}</Text>
              <Text style={styles.pickQ}>{second.factor.question}</Text>
            </View>

            <Text style={styles.body2} allowFontScaling maxFontSizeMultiplier={1.4}>
              {PROTOCOL_CONFIRM_BODY}
            </Text>
            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              Day 14 is when Pattern shows you how much you’ve collected — not
              a conclusion. Some questions need much longer than that.
            </Text>
          </>
        )}
      </ScrollView>

      <View style={styles.bottom}>
        <Press
          onPress={advance}
          disabled={!canAdvance}
          pressScale={canAdvance ? 0.985 : 1}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canAdvance }}
          style={[
            styles.primary,
            canAdvance ? styles.primaryOn : styles.primaryOff,
          ]}
        >
          <Text style={[
            styles.primaryText,
            canAdvance ? styles.primaryTextOn : styles.primaryTextOff,
          ]}>
            {step === 'confirm' ? 'Start the 14 days' : 'Continue'}
          </Text>
        </Press>
        {step === 'ask' && !hasWords && (
          <Text style={styles.skipNote} allowFontScaling maxFontSizeMultiplier={1.4}>
            You can skip these and just pick something to watch.
          </Text>
        )}
      </View>
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
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, justifyContent: 'center' },
  navBtnRight: { alignItems: 'flex-end' },
  navBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  body: { padding: size.sheetX, paddingTop: 20, paddingBottom: 30 },
  title: {
    color: color.textPrimary, fontSize: font.title2, fontWeight: '700',
    letterSpacing: -0.3, lineHeight: 30,
  },
  lead: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21, marginTop: 8,
  },
  body2: { color: color.textSecondary, fontSize: font.body, lineHeight: 22, marginTop: 18 },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 10 },

  qBlock: { marginTop: 22 },
  q: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 22 },
  input: {
    marginTop: 10, minHeight: 60, borderRadius: 12, borderCurve: 'continuous', padding: 12,
    backgroundColor: color.bgSurface, color: color.textPrimary, fontSize: font.body,
    textAlignVertical: 'top',
  },

  option: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginTop: 10, padding: 14, borderRadius: radius.card, borderCurve: 'continuous',
    backgroundColor: color.bgSurface,
    borderWidth: 1, borderColor: color.borderDivider,
  },
  optionOn: { borderColor: color.textPrimary },
  optionMain: { flex: 1, gap: 2 },
  optionName: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  optionQ: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },
  tick: {
    width: 24, height: 24, borderRadius: 12, borderCurve: 'continuous',
    borderWidth: 1.5, borderColor: color.borderControl,
    alignItems: 'center', justifyContent: 'center',
  },
  tickOn: { backgroundColor: color.textPrimary, borderColor: color.textPrimary },
  tickMark: { color: '#000000', fontSize: 13, fontWeight: '700' },
  more: { paddingVertical: 14, alignSelf: 'flex-start' },
  moreText: { color: color.tint, fontSize: font.subheadline, fontWeight: '500' },

  cantCard: {
    marginTop: 14, padding: 13, borderRadius: radius.card, borderCurve: 'continuous',
    backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl, gap: 4,
  },
  cantTitle: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  cantBody: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18 },

  pickCard: {
    marginTop: 12, padding: 15, borderRadius: radius.card, borderCurve: 'continuous',
    backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider, gap: 3,
  },
  pickName: { color: color.textPrimary, fontSize: font.title3, fontWeight: '700', letterSpacing: -0.2 },
  pickNote: { color: color.textTertiary, fontSize: font.footnote },
  pickQ: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 20, marginTop: 4 },

  bottom: {
    paddingHorizontal: size.sheetX, paddingTop: 10, paddingBottom: 22,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  primary: {
    minHeight: size.buttonH, borderRadius: size.buttonH / 2, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
  },
  primaryOn: { backgroundColor: color.textPrimary },
  primaryTextOn: { color: '#000000' },
  primaryOff: { backgroundColor: color.bgSegmentActive },
  primaryText: { fontSize: font.title3, fontWeight: '600' },
  primaryTextOff: { color: color.textTertiary },
  skipNote: {
    color: color.textTertiary, fontSize: font.footnote, textAlign: 'center', marginTop: 10,
  },
});
