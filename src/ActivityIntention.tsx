import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Press } from './motion';
import { ACTIVITY_TEXT_MAX } from './thresholds';
import { color, font, radius } from './theme';

/** An intention, not a target or a second daily measurement. Text stays
 *  local with the record and is included in the user's shared summary. */
export default function ActivityIntention({ value, onChange, initiallyEditing = false, compact = false }: {
  value: string | null;
  onChange: (value: string) => void;
  initiallyEditing?: boolean;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(initiallyEditing);
  const [draft, setDraft] = useState(value || '');
  const save = (text: string) => { onChange(text.trim()); setEditing(false); };
  if (!editing && compact) return (
    <Press accessibilityRole="button" accessibilityLabel={'Edit what matters to you: ' + (value || '')}
      onPress={() => { setDraft(value || ''); setEditing(true); }} style={styles.compact}>
      <Text style={styles.body}>What matters: {value}</Text>
      <Text style={styles.link}>Edit</Text>
    </Press>
  );
  if (!editing) return (
    <Press accessibilityRole="button" accessibilityLabel="Edit what you want to keep doing"
      onPress={() => { setDraft(value || ''); setEditing(true); }} style={styles.card}>
      <Text style={styles.label}>What matters to you</Text>
      <Text style={styles.title}>{value || 'What do you want to keep doing?'}</Text>
      <Text style={styles.link}>{value ? 'Edit intention' : 'Add an activity, if you want'}</Text>
    </Press>
  );
  return (
    <View style={styles.card}>
      <Text style={styles.title}>What do you want to keep doing?</Text>
      <Text style={styles.body}>Walking the dog, cooking dinner, getting back to running. Keep what matters beside your record.</Text>
      <TextInput value={draft} onChangeText={setDraft} maxLength={ACTIVITY_TEXT_MAX}
        placeholder="An activity that matters to you" placeholderTextColor={color.textTertiary}
        accessibilityLabel="Activity that matters to you" style={styles.input}
        multiline textAlignVertical="top" />
      <Text style={styles.note}>Optional. No daily rating. Included when you share your summary; editable here or in Profile.</Text>
      <View style={styles.actions}>
        <Press onPress={() => save(draft)} disabled={!draft.trim()} accessibilityRole="button"
          accessibilityLabel="Save activity intention" style={styles.action}>
          <Text style={[styles.link, !draft.trim() && styles.disabled]}>Save intention</Text>
        </Press>
        <Press onPress={() => save('')} accessibilityRole="button"
          accessibilityLabel={value ? 'Remove activity intention' : 'Skip activity intention'} style={styles.action}>
          <Text style={styles.body}>{value ? 'Remove' : 'Not now'}</Text>
        </Press>
        {value && <Press onPress={() => setEditing(false)} accessibilityRole="button" style={styles.action}>
          <Text style={styles.body}>Cancel</Text>
        </Press>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 12, paddingHorizontal: 2 },
  card: { backgroundColor: color.bgSurface, borderRadius: radius.card, padding: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider },
  label: { color: color.textSecondary, fontSize: font.footnote, marginBottom: 6 },
  title: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 24 },
  body: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 21 },
  note: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 19 },
  input: { color: color.textPrimary, borderColor: color.borderControl, borderWidth: 1,
    borderRadius: 10, padding: 12, marginVertical: 12, minHeight: 72, fontSize: font.body },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginTop: 8 },
  action: { minHeight: 44, justifyContent: 'center' },
  link: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600', marginTop: 6 },
  disabled: { opacity: 0.4 },
});
