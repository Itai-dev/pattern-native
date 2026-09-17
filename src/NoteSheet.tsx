/**
 * The day's note, as a sheet.
 *
 * "Add a note about today" used to walk you off Today, into the day
 * screen, and down to a section near its bottom where a field had been
 * opened for you — a shortcut that took you somewhere you had not asked
 * to go and left you there when you finished. A note is a sentence, and
 * a sentence wants a sheet: it slides up over where you are, takes the
 * words, and puts you back. Today's card and the layered day page both
 * open this; the classic day page keeps its inline editor.
 *
 * Drafted apart from storage, written on Done — Cancel is a real cancel,
 * the same rule every sheet in this app follows. One note per day, and
 * writing it on a later day is the normal case, not the dishonest one.
 *
 * Read by nothing. It has no levels and nothing to compare against, so
 * the engine never sees it; it reaches the PDF only when the share asks,
 * and the share asks every time.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as db from './db';
import { Press } from './motion';
import { todayISO } from './model';
import { fmtDay } from './DayScreen';
import { color, font, radius, size } from './theme';

export interface NoteSheetProps {
  dateIso: string;
  /** saved — the caller re-reads the record and closes */
  onDone: () => void;
  onClose: () => void;
}

export default function NoteSheet({ dateIso, onDone, onClose }: NoteSheetProps) {
  /* a note hangs on a day that exists in the record: db.setNote refuses
     a day with no entry, and manufacturing one would mean writing a pain
     value nobody entered just to hang a sentence on. Every route here
     comes from a day with a check-in, so this is a guard, not a state
     anyone should see. */
  const [exists] = useState(() => !!db.getDay(dateIso));
  const [draft, setDraft] = useState(() => db.getDay(dateIso)?.note || '');
  const isToday = dateIso === todayISO();

  const save = () => {
    if (exists) db.setNote(dateIso, draft.trim());
    onDone();
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
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
        <Text style={styles.navTitle} numberOfLines={1}>
          {isToday ? 'Today’s note' : fmtDay(dateIso)}
        </Text>
        <Press
          onPress={save}
          style={styles.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Save the note and close"
        >
          <Text style={[styles.navBtnText, styles.navBtnStrong]}>Done</Text>
        </Press>
      </View>

      <View style={styles.body}>
        {exists ? (
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            autoFocus
            placeholder="Anything about this day worth remembering"
            placeholderTextColor={color.textTertiary}
            style={styles.input}
            accessibilityLabel={isToday ? 'Note about today' : 'Note about this day'}
          />
        ) : (
          <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.4}>
            A note goes with a day’s check-ins. Add a check-in for this day
            first, then the note has somewhere to live.
          </Text>
        )}
        <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
          One note per day, in your words. Kept on this iPhone with the rest of
          your record. Never analysed — it goes into the PDF only if you say so
          when you share.
        </Text>
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
  navTitle: { flex: 1, textAlign: 'center', color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 72, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navLeft: { alignItems: 'flex-start' },
  navBtnText: { color: color.tint, fontSize: font.body },
  navBtnStrong: { fontWeight: '600' },
  body: { padding: size.sheetX, paddingTop: 20 },
  /* the field reads at body size: this is the one place in the app the
     person writes a sentence rather than picks an answer */
  input: {
    color: color.textPrimary, fontSize: font.body, lineHeight: 24,
    minHeight: 150, textAlignVertical: 'top',
    borderRadius: radius.button, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
    backgroundColor: color.bgSurface,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  lead: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21 },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 12 },
});
