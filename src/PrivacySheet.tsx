/**
 * The privacy policy, readable inside the app.
 *
 * docs/privacy.html is the canonical text and the page a store listing
 * will link to; this is the same policy in the app's own type, so a
 * person deciding whether to trust Pattern with their pain does not
 * have to leave it to find out what it does with the answer. Update
 * both when either changes — the date under the title is the check.
 *
 * Tomo pass, 21 Nov 2026: the in-app wording was tightened by about a
 * third. Every claim is still here, none softened or added, so the
 * date did not move; docs/privacy.html keeps the long form. Shorten a
 * sentence here, never a promise — and if a promise changes, both
 * texts and the date change together.
 */
import React from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Press } from './motion';
import { list, settings } from './SettingsList';
import { Num } from './SummaryCard';
import { font } from './theme';

export const PRIVACY_UPDATED = '16 September 2026';

const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What stays on your device',
    body: [
      'Every check-in (pain score, time, body areas, quality words), everything you write (notes, what you tried, what you are testing for a fortnight), your answers to the daily questions and which were asked or skipped, events, reminders and your preferences.',
      'It lives in the app’s own storage, protected by your device’s encryption and passcode. Deleting Pattern deletes all of it.',
      'It is part of your iPhone’s own backup — iCloud Backup, or a backup to a computer — if you have one on. That backup is Apple’s, made and encrypted under your Apple Account; Pattern does not make it, cannot see it and cannot turn it off. It is how a new phone gets your record back, and the only copy other than one you save yourself.',
    ],
  },
  {
    title: 'What is sent',
    body: [
      'Pattern counts anonymous usage events so we can tell whether the app is used — for example that a check-in was completed, roughly how many seconds it took, and whether the record was opened.',
      'They never contain anything about your body: no pain score, body area, answer, note or free text of any kind. The code enforces it — event names come from a fixed list, and each value is a number, a true-or-false, or at most 24 characters.',
      'They go to Aptabase, an open-source analytics service, on servers in the European Union, tied to a session identifier that changes every launch and is linked to nothing and no one. There is no lasting identifier for your device or for you. Aptabase also records your operating system version, the app version and your device’s language.',
      'Turn it off in Profile with “Anonymous usage counts”. Nothing is sent after that.',
      'Separately, when Pattern opens it asks Expo’s update service whether newer app code is available. That request carries the app’s version, platform and an installation identifier for updates — never anything from your record. It is not analytics.',
    ],
  },
  {
    title: 'What we never do',
    body: [
      'No advertising or advertising identifiers. No selling or sharing of data with anyone, for any purpose. No third-party trackers or SDKs beyond the analytics above. No location tracking. No contacts, photos or microphone. Calendar only if you turn it on, and then read-only.',
    ],
  },
  {
    title: 'When you share something yourself',
    body: [
      'The PDF for a clinician is made on your device and handed to the iOS share sheet. It goes only where you send it, never to us. A copy of your record you save is the same: written locally, and yours to place.',
    ],
  },
  {
    title: 'Apple Health',
    body: [
      'If you connect it, Pattern reads only the categories you choose and never writes to Health. What it reads stays on this iPhone, apart from your record and outside backups, so a new phone reads Health afresh. It is not in a copy you save, and disconnecting removes it.',
    ],
  },
  {
    title: 'Your calendar',
    body: [
      'If you turn on “Use my calendar”, Pattern reads event titles and times on this iPhone — to ask about pain after the ones that read as exertion, and to show what is booked beside your record. It never writes to your calendar; its one action opens Apple’s own editor. What it reads is not stored, not in a saved copy, and not sent.',
    ],
  },
  {
    title: 'Reminders',
    body: [
      'Scheduled locally by iOS. No push server, and no notification content leaves your phone.',
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
      'Your health record never reaches us, so there is nothing for us to hand over, correct or delete — you hold all of it, and deleting the app erases it. Switching usage counts off stops collection; they are not linked to your identity, so we cannot single out past events for one person.',
    ],
  },
  {
    title: 'Medical disclaimer',
    body: [
      'Pattern is a record-keeping tool, not a medical device. It does not diagnose, treat or give medical advice, and nothing it shows is a clinical finding. Always speak to a qualified healthcare professional about your symptoms.',
    ],
  },
  {
    title: 'Changes',
    body: [
      'If what is collected changes, the date at the top changes and the app says so before it takes effect.',
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
    <View style={settings.sheet}>
      <View style={settings.navBar}>
        <View style={settings.navSpacer} />
        <Text style={settings.navTitle}>Privacy</Text>
        <Press onPress={onDone} style={settings.navBtn} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Done">
          <Text style={settings.navBtnText}>Done</Text>
        </Press>
      </View>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* the date is the check that this text and docs/privacy.html
            agree, and a number, so it is rounded like every other */}
        <Text style={styles.updated} allowFontScaling maxFontSizeMultiplier={1.4}>
          <Num>{'Last updated ' + PRIVACY_UPDATED}</Num>
        </Text>
        <Text style={styles.lede} allowFontScaling maxFontSizeMultiplier={1.4}>
          Nothing you record about your body is ever sent to Pattern. It is
          stored on your iPhone, and Pattern has no server that could
          receive it.
        </Text>
        <Text style={styles.p} allowFontScaling maxFontSizeMultiplier={1.4}>
          No accounts, no login, no cloud sync of its own. There is nowhere
          for us to store your health record, and no way for us to read it.
        </Text>
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.h} allowFontScaling maxFontSizeMultiplier={1.3}>{s.title}</Text>
            {s.body.map((b, i) => (
              <Text key={i} style={styles.p} allowFontScaling maxFontSizeMultiplier={1.4}><Num>{b}</Num></Text>
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
              Questions: {contactEmail}
            </Text>
          </Press>
        </View>
      </ScrollView>
    </View>
  );
}

/* the frame is Profile's (SettingsList). The policy stays running text
   on the ground, not a stack of cards: it is read top to bottom, once,
   and a box per section would make a legal page look like a dashboard. */
const styles = StyleSheet.create({
  body: { padding: 20, paddingTop: 12, paddingBottom: 48 },
  updated: { color: list.tertiary, fontSize: font.footnote, marginBottom: 12 },
  lede: {
    color: list.text, fontSize: font.body, lineHeight: 24, fontWeight: '500',
    marginBottom: 14,
  },
  p: { color: list.secondary, fontSize: font.subheadline, lineHeight: 22, marginBottom: 10 },
  section: { marginTop: 14 },
  h: { color: list.text, fontSize: font.body, fontWeight: '600', marginBottom: 6 },
  /* white and heavier: a link differs by weight, never by hue */
  link: { color: list.text, fontWeight: '600' },
});
