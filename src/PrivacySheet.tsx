/**
 * The privacy policy, readable inside the app.
 *
 * docs/privacy.html is the canonical text and the page a store listing
 * will link to; this is the same policy in the app's own type, so a
 * person deciding whether to trust Pattern with their pain does not
 * have to leave it to find out what it does with the answer. Update
 * both when either changes — the date under the title is the check.
 */
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Press } from './motion';
import { color, font } from './theme';

export const PRIVACY_UPDATED = '24 August 2026';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What stays on your device',
    body: [
      'Every check-in: pain score, time, body areas, quality words. Everything you write: notes, what you tried, what you want to understand. Your answers to the daily questions, and which questions were asked or skipped. Events, reminders, and your app preferences.',
      'This lives in a database inside the app’s own storage, protected by your device’s encryption and passcode. Deleting Pattern deletes all of it. There is no copy anywhere else.',
    ],
  },
  {
    title: 'The one thing that is sent',
    body: [
      'Pattern counts anonymous usage events so we can tell whether the app is actually being used — for example that a check-in was completed, roughly how many seconds it took, and whether the record was opened.',
      'These counts never contain anything you told us about your body. No pain score, no body area, no answer, no note, no free text of any kind. This is enforced in the code: event names come from a fixed list, and any accompanying value is a number, a true-or-false, or a string capped at 24 characters — long enough for “evening”, far too short for anything a person wrote about themselves.',
      'Events are sent to Aptabase, an open-source analytics service, on servers in the European Union. They are tied to a random identifier generated on your device that is linked to nothing and to no one. Alongside each event, Aptabase records the standard technical context: your operating system version, the app version, and your device’s general locale.',
      'You can turn this off. Open Profile and switch off “Share anonymous usage counts”. Nothing is sent after that.',
    ],
  },
  {
    title: 'What we never do',
    body: [
      'No advertising, and no advertising identifiers. No selling or sharing of data with anyone, for any purpose. No third-party trackers or SDKs beyond the analytics named above. No location tracking. No contact list, photo, or microphone access.',
    ],
  },
  {
    title: 'When you share something yourself',
    body: [
      'Pattern can produce a PDF summary of your record for a clinician. It is generated on your device and handed to the iOS share sheet — it goes only where you send it, and never to us. The same is true of the backup file you can export: it is written locally, and what happens to it afterwards is entirely your choice.',
    ],
  },
  {
    title: 'Apple Health',
    body: [
      'If you connect Apple Health, Pattern reads only the categories you choose, never writes to Health, and keeps what it reads on this iPhone. Health context is not included in backups and is removed when you disconnect.',
    ],
  },
  {
    title: 'Reminders',
    body: [
      'Reminders are scheduled locally by iOS. No push server is involved and no notification content leaves your phone.',
    ],
  },
  {
    title: 'Children',
    body: [
      'Pattern is not directed at children under 13, and we do not knowingly collect information from them.',
    ],
  },
  {
    title: 'Your rights',
    body: [
      'Because your health record never reaches us, there is nothing for us to hand over, correct, or delete on your behalf — you already hold all of it, and deleting the app erases it. For the anonymous usage counts, switching analytics off in Profile stops collection; because those counts are not linked to your identity, we cannot single out or retrieve past events for an individual person.',
    ],
  },
  {
    title: 'Medical disclaimer',
    body: [
      'Pattern is a record-keeping tool, not a medical device. It does not diagnose, treat, or give medical advice, and nothing it shows you is a clinical finding. Always speak to a qualified healthcare professional about your symptoms.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'If this policy changes in a way that affects what is collected, the date at the top will change and the app will say so before the change takes effect.',
    ],
  },
];

export interface PrivacySheetProps {
  onDone: () => void;
  /** where questions go — the same address the feedback row uses */
  contactEmail: string;
}

export default function PrivacySheet({ onDone, contactEmail }: PrivacySheetProps) {
  return (
    <View style={styles.sheet}>
      <View style={styles.navBar}>
        <View style={styles.navSpacer} />
        <Text style={styles.navTitle}>Privacy</Text>
        <Press onPress={onDone} style={styles.navBtn} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Done">
          <Text style={styles.navBtnText}>Done</Text>
        </Press>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.updated} allowFontScaling maxFontSizeMultiplier={1.4}>
          Last updated {PRIVACY_UPDATED}
        </Text>
        <Text style={styles.lede} allowFontScaling maxFontSizeMultiplier={1.4}>
          Nothing you record about your body ever leaves your phone. Your pain
          scores, body areas, descriptions, notes, answers and hypotheses are
          stored only on your device, and Pattern has no server that could
          receive them.
        </Text>
        <Text style={styles.p} allowFontScaling maxFontSizeMultiplier={1.4}>
          Pattern has no accounts, no login, and no cloud sync. There is
          nowhere for us to store your health record even if we wanted to, and
          no way for us to read it.
        </Text>
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.h} allowFontScaling maxFontSizeMultiplier={1.3}>{s.title}</Text>
            {s.body.map((b, i) => (
              <Text key={i} style={styles.p} allowFontScaling maxFontSizeMultiplier={1.4}>{b}</Text>
            ))}
          </View>
        ))}
        <View style={styles.section}>
          <Text style={styles.h} allowFontScaling maxFontSizeMultiplier={1.3}>Contact</Text>
          <Press
            onPress={() => Linking.openURL('mailto:' + contactEmail).catch(() => {})}
            pressOpacity={0.7}
            accessibilityRole="link"
            accessibilityLabel={'Email ' + contactEmail}
          >
            <Text style={[styles.p, styles.link]} allowFontScaling maxFontSizeMultiplier={1.4}>
              Questions about privacy, or anything else: {contactEmail}
            </Text>
          </Press>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: color.bgSheet },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borderDivider,
  },
  navSpacer: { width: 64 },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  navBtn: { minWidth: 64, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  body: { padding: 20, paddingBottom: 48 },
  updated: { color: color.textTertiary, fontSize: font.footnote, marginBottom: 12 },
  lede: {
    color: color.textPrimary, fontSize: font.body, lineHeight: 24, fontWeight: '500',
    marginBottom: 14,
  },
  p: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 22, marginBottom: 10 },
  section: { marginTop: 14 },
  h: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', marginBottom: 6 },
  link: { color: color.tint },
});
