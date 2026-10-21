/**
 * The diagnosis question — one body, two hosts.
 *
 * Onboarding asks it on day zero and Profile lets it change later,
 * because a diagnosis ARRIVES: the person who answered "still looking"
 * in September is the person most likely to have a name by December,
 * and an app that could only hear the answer once would be deaf at the
 * moment it mattered most. So the question is one component, the host
 * draws the title around it, and both write the same record.
 *
 * THREE ROWS, NOT THREE CHIPS. Each answer carries a line saying what
 * Pattern does for that person, because this is the one question in
 * the app whose answer changes what the app is for: understanding what
 * affects a named condition and what helps you stay active, or building
 * a clearer picture to bring to a doctor. A chip says yes or no; a row
 * has room to say what yes and no mean here.
 *
 * NEITHER ROW IS ABOUT GETTING A DIAGNOSIS. The undiagnosed person is a
 * headline audience, but "we help you get diagnosed" would make this a
 * quasi-diagnostic product (POSITIONING.md, 17 Sep 2026). The promise
 * to them is a clearer picture and better information for the doctor;
 * the diagnosis, if one comes, is the doctor's.
 *
 * THE LIST IS A VOCABULARY, NEVER A SUGGESTION. It appears only after
 * "yes", it holds what a clinician has already said, and the footnote
 * under it says so in the person's own direction. Multi-select, because
 * a pain clinic's waiting room is comorbidity: fibromyalgia beside
 * osteoarthritis beside migraine is a Tuesday, and a radio list would
 * make someone choose which of their diagnoses counts. "Something
 * else" is free text, capped and printed as written.
 *
 * ONE GROUPED LIST (Oct 2026 redesign). The three rows were three
 * bordered cards, each with a radio dot at the left; they are now one
 * card in the iOS inset-grouped grammar, hairlines between, and a check
 * circle at the right where Settings puts a chosen row's mark. The
 * words did not change, and neither did the rule that a chosen row is
 * marked in white and only the mark.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import { DIAGNOSES, DIAGNOSIS_OTHER_MAX, Diagnosis, DiagnosisStatus } from './model';
import { color, font } from './theme';

/** the answer as it sits on screen, before cleanDiagnosis stores it */
export interface DiagnosisDraft {
  status: DiagnosisStatus | '';
  named: string[];
  other: string;
  /** the "something else" field is open — kept apart from `other`
   *  having text, so an opened-and-empty field stays open */
  otherOpen: boolean;
}

export function emptyDraft(): DiagnosisDraft {
  return { status: '', named: [], other: '', otherOpen: false };
}

/** a stored record → a draft, for Profile's edit */
export function draftOf(d: Diagnosis | null): DiagnosisDraft {
  if (!d) return emptyDraft();
  return {
    status: d.status,
    named: (d.named || []).slice(),
    other: d.other || '',
    otherOpen: !!d.other,
  };
}

/** a draft → what cleanDiagnosis will read. `status: ''` is the skip,
 *  stored as such — three states, never two. */
export function draftToRaw(dr: DiagnosisDraft, todayIso: string): Diagnosis {
  return {
    v: 1, status: dr.status,
    named: dr.named, other: dr.other,
    setOn: todayIso,
  };
}

const OPTIONS: { id: DiagnosisStatus; label: string; body: string }[] = [
  {
    id: 'yes',
    label: 'Yes',
    body: 'Understand what affects your pain and what helps you stay active.',
  },
  {
    id: 'looking',
    label: 'Not yet — still being looked into',
    body: 'Build a clearer picture of your pain, see its patterns, and bring better information to your doctor.',
  },
  {
    id: 'no',
    label: 'No, and not looking for one',
    body: 'Understand what affects it and what helps you keep doing what you do. Nothing here needs a name.',
  },
];

export interface DiagnosisStepProps {
  draft: DiagnosisDraft;
  onChange: (next: DiagnosisDraft) => void;
}

export default function DiagnosisStep({ draft, onChange }: DiagnosisStepProps) {
  /* selection is white: themeBrand() is ramp stop 5, so a chosen
     diagnosis wore a pain-5 hue */
  const sel = color.textPrimary;

  const pick = (id: DiagnosisStatus) => {
    Haptics.selectionAsync().catch(() => {});
    /* tapping the chosen row again un-chooses it: the skip stays
       reachable after a mis-tap, and nothing here is mandatory */
    onChange({ ...draft, status: draft.status === id ? '' : id });
  };

  const toggleNamed = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    const on = draft.named.indexOf(id) >= 0;
    onChange({
      ...draft,
      named: on ? draft.named.filter((x) => x !== id) : draft.named.concat(id),
    });
  };

  const toggleOther = () => {
    Haptics.selectionAsync().catch(() => {});
    /* closing the field drops its text — an unlisted diagnosis that is
       no longer on screen is not one the person is stating */
    onChange({ ...draft, otherOpen: !draft.otherOpen, other: draft.otherOpen ? '' : draft.other });
  };

  return (
    <View>
      <View style={styles.group} accessibilityRole="radiogroup">
        {OPTIONS.map((o, i) => {
          const on = draft.status === o.id;
          return (
            <Press
              key={o.id}
              onPress={() => pick(o.id)}
              pressOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.label}
              accessibilityHint={o.body}
              style={styles.row}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowLabel} allowFontScaling maxFontSizeMultiplier={1.3}>
                  {o.label}
                </Text>
                <Text style={styles.rowBody} allowFontScaling maxFontSizeMultiplier={1.4}>
                  {o.body}
                </Text>
              </View>
              {/* the mark is white, and only the mark: a row
                  flooded in colour would read as a pain value. A
                  circle, never a square — squares are pain values. */}
              <View style={[styles.check, on && { backgroundColor: sel, borderColor: sel }]}>
                {on && <Ionicons name="checkmark" size={16} color="#000000" />}
              </View>
              {/* the hairline is inset from the leading edge and absent
                  under the last row, as a grouped list draws it */}
              {i < OPTIONS.length - 1 && <View style={styles.sep} />}
            </Press>
          );
        })}
      </View>

      {draft.status === 'yes' && (
        <View style={styles.named}>
          <Text style={styles.namedQ} allowFontScaling maxFontSizeMultiplier={1.3}>
            What has been diagnosed?
          </Text>
          <Text style={styles.namedHint} allowFontScaling maxFontSizeMultiplier={1.4}>
            Tap any that apply. It prints on the first page of the
            PDF, as you chose it here.
          </Text>
          <View style={styles.chips}>
            {DIAGNOSES.map((d) => {
              const on = draft.named.indexOf(d.id) >= 0;
              return (
                <Press
                  key={d.id}
                  onPress={() => toggleNamed(d.id)}
                  pressOpacity={0.8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={d.name}
                  hitSlop={6}
                  style={[styles.chip, on && { backgroundColor: sel, borderColor: sel }]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}
                    allowFontScaling maxFontSizeMultiplier={1.3}>{d.name}</Text>
                </Press>
              );
            })}
            <Press
              onPress={toggleOther}
              pressOpacity={0.8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draft.otherOpen }}
              accessibilityLabel="Something else"
              hitSlop={6}
              style={[styles.chip, draft.otherOpen && { backgroundColor: sel, borderColor: sel }]}
            >
              <Text style={[styles.chipText, draft.otherOpen && styles.chipTextOn]}
                allowFontScaling maxFontSizeMultiplier={1.3}>Something else</Text>
            </Press>
          </View>
          {draft.otherOpen && (
            <TextInput
              value={draft.other}
              onChangeText={(t) => onChange({ ...draft, other: t })}
              placeholder="In your words — one name, as your clinician said it"
              placeholderTextColor={color.textTertiary}
              maxLength={DIAGNOSIS_OTHER_MAX}
              style={styles.input}
              /* focus for a field just opened, not one coming back with
                 words in it — onboarding's Back, or Profile's edit of a
                 saved answer, would otherwise open on a keyboard */
              autoFocus={!draft.other}
              accessibilityLabel="Something else — the diagnosis in your words"
            />
          )}
          {/* the sentence about what this list is NOT, inside the card
              that shows it — the house rule for every set of numbers,
              applied to the one list in the app that could be mistaken
              for the app's own opinion */}
          <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
            Only what a clinician has actually told you. Pattern never
            suggests a diagnosis, and nothing you pick here is analysed
            or sent anywhere.
          </Text>
        </View>
      )}
    </View>
  );
}

/* the redesign's greys, named here until theme.ts carries them: the
   secondary text, the grouped list's hairline, and an unchosen circle */
const GREY_TEXT = '#98989F';
const HAIRLINE = '#38383A';
const CIRCLE_OFF = '#48484A';

const styles = StyleSheet.create({
  group: {
    borderRadius: 16, borderCurve: 'continuous', overflow: 'hidden',
    backgroundColor: color.bgSurface,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 16, minHeight: 44,
  },
  rowText: { flex: 1, gap: 3 },
  rowLabel: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  rowBody: { color: GREY_TEXT, fontSize: 14, lineHeight: 19 },
  check: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: CIRCLE_OFF,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  sep: {
    position: 'absolute', left: 16, right: 0, bottom: 0,
    height: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE,
  },
  named: { marginTop: 18 },
  namedQ: { color: GREY_TEXT, fontSize: font.subheadline, fontWeight: '600' },
  namedHint: {
    color: GREY_TEXT, fontSize: 14, lineHeight: 19, marginTop: 4, marginBottom: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 40, justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderCurve: 'continuous',
    borderWidth: 1, borderColor: 'transparent', backgroundColor: color.bgSurface,
  },
  chipText: { color: color.textPrimary, fontSize: 14, fontWeight: '500' },
  chipTextOn: { color: '#000000', fontWeight: '600' },
  input: {
    marginTop: 10, minHeight: 48, borderRadius: 14, borderCurve: 'continuous',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: color.bgSurface, color: color.textPrimary,
    fontSize: font.body, lineHeight: 22,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
  },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 12 },
});
