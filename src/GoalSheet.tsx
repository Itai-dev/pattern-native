/**
 * "Activity I want back" — a real sheet, not an alert box. One field, a
 * plain description of what the choice means, Cancel and Save (Save only
 * once there is a real name). Immediately after saving a NEW activity the
 * sheet offers the starting point — the first ability rating — so the
 * weekly loop starts with something to compare against.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import FunctionSheet from './FunctionSheet';
import * as db from './db';
import { Press } from './motion';
import { GOAL_EDITOR_DESCRIPTION, GOAL_EDITOR_TITLE } from './model';
import { color, font, radius, size } from './theme';

export interface GoalSheetProps {
  initialText: string | null;
  onDone: () => void;
  onClose: () => void;
}

export default function GoalSheet({ initialText, onDone, onClose }: GoalSheetProps) {
  const [text, setText] = useState(initialText || '');
  const [step, setStep] = useState<'name' | 'baseline'>('name');

  const trimmed = text.trim();
  const canSave = trimmed.length > 0;

  const save = () => {
    if (!canSave) return;
    db.setGoal(trimmed);
    /* an activity with ratings already has its starting point; a fresh
       one is offered the baseline right away */
    if (db.getFunc().length === 0) setStep('baseline');
    else onDone();
  };

  if (step === 'baseline') {
    return (
      <FunctionSheet
        goalText={trimmed}
        baseline
        onDone={onDone}
        /* skipping the baseline keeps the activity — the rating can come
           later from the home card */
        onClose={onDone}
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.navBar}>
        <Press
          onPress={onClose}
          style={[styles.navBtn, styles.navLeft]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.navBtnText}>Cancel</Text>
        </Press>
        <Text style={styles.navTitle} numberOfLines={1}>{GOAL_EDITOR_TITLE}</Text>
        <Press
          onPress={save}
          disabled={!canSave}
          style={styles.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canSave }}
          accessibilityLabel="Save activity"
        >
          <Text style={[styles.navBtnText, styles.navBtnStrong, !canSave && styles.navBtnOff]}>
            Save
          </Text>
        </Press>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.description} allowFontScaling maxFontSizeMultiplier={1.6}>
          {GOAL_EDITOR_DESCRIPTION}
        </Text>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="e.g. Running, playing with my kids, gardening"
          placeholderTextColor={color.textTertiary}
          style={styles.input}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={save}
          accessibilityLabel="The activity you want back"
        />
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
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', flexShrink: 1 },
  navBtn: { minWidth: 72, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navLeft: { alignItems: 'flex-start' },
  navBtnText: { color: color.tint, fontSize: font.body },
  navBtnStrong: { fontWeight: '600' },
  navBtnOff: { color: color.textTertiary },
  body: { padding: size.sheetX, paddingTop: 22, paddingBottom: 30 },
  description: { color: color.textSecondary, fontSize: font.body, lineHeight: 24 },
  input: {
    marginTop: 18, minHeight: 50, borderRadius: radius.card, padding: 14,
    backgroundColor: color.bgSurface, color: color.textPrimary, fontSize: font.body,
  },
});
