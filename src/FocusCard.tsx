/**
 * The observation period, on Today: an invitation before there is one, a
 * quiet line while it runs, and a review when it reaches day 14.
 *
 * The review is the load-bearing part, and what it does NOT say is the
 * design. It reports how much has been collected and how much a comparison
 * would need — never what the collection says. "Stress was high on 8 of
 * your 11 hardest days" is a comparison run at whatever sample size
 * happened to exist, with the arithmetic left to the reader; printing it
 * at day 14 would invite exactly the conclusion the threshold exists to
 * prevent, and no amount of hedging copy undoes a number on a screen.
 *
 * So: group sizes, the target, and two ways forward. Nothing about pain.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as db from './db';
import { Press } from './motion';
import { getMetric } from './metrics';
import { Entries, Protocol } from './model';
import {
  FactorProgress, REVIEW_CHANGE, REVIEW_KEEP, activeFactorIds,
  progressSentence, promotionCandidate, promotionSentence, reviewDue, reviewProgress,
} from './protocol';
import { PROTOCOL_REVIEW_DAYS } from './thresholds';
import { color, font, radius, size } from './theme';

export interface FocusCardProps {
  protocol: Protocol | null;
  entries: Entries;
  todayIso: string;
  /** enough logged days to be worth asking the question at all */
  offerSetup: boolean;
  onStart: () => void;
  onKeepGoing: () => void;
  /** open the focus flow already pointed at one factor */
  onTest: (metricId: string) => void;
}

function Line({ f }: { f: FactorProgress }) {
  return (
    <View style={styles.progressLine}>
      <Text style={styles.progressName} allowFontScaling maxFontSizeMultiplier={1.4}>
        {f.name}
      </Text>
      <Text style={styles.progressBody} allowFontScaling maxFontSizeMultiplier={1.4}>
        {progressSentence(f)}
      </Text>
    </View>
  );
}

export default function FocusCard({
  protocol, entries, todayIso, offerSetup, onStart, onKeepGoing, onTest,
}: FocusCardProps) {
  /* Something the chips keep pointing at. The count is NOT a finding and
     is never phrased as one: it says how many times you thought this was
     the problem, which is a fact about you rather than about your pain.
     What it is good for is choosing what the next fourteen days should
     actually measure. */
  const promo = promotionCandidate(entries, todayIso, activeFactorIds(protocol));

  if (promo) {
    return (
      <>
        <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
          Worth a closer look
        </Text>
        <View style={styles.card}>
          <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
            {promo.chipName}
          </Text>
          <Text style={styles.cardSub} allowFontScaling maxFontSizeMultiplier={1.4}>
            {promotionSentence(promo)}
          </Text>
          <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
            Flagging something tells Pattern what you think. Answering it every
            day — on the days it seems relevant and the days it doesn’t — is
            what makes it checkable.
          </Text>
          <View style={styles.actions}>
            <Pressable
              onPress={() => onTest(promo.metricId)}
              style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel={'Start asking about ' + promo.chipName + ' every day'}
            >
              <Text style={styles.ghostText}>Ask me daily</Text>
            </Pressable>
            <Pressable
              onPress={onKeepGoing}
              style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <Text style={styles.ghostText}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  /* nothing running, and not enough record to have a question yet */
  if (!protocol && !offerSetup) return null;

  /* Nothing running — the invitation. When onboarding recorded
     suspicions, the offer NAMES the first one still untested instead of
     asking cold: "you suspected stress — ready to test it properly?" is
     the whole reason the suspicions were collected. The suspicion opens
     the picker POINTED at that factor, still a choice, never a start. */
  if (!protocol) {
    const suspicions = db.getPref<string[]>('suspicions.v1', []);
    /* the first suspicion NOT yet given its fourteen days — a factor a
       past period already tested waits at the back of the line, so the
       queue actually advances instead of re-offering the same thing */
    const tested: Record<string, true> = {};
    db.getProtocols().forEach((pr) => { tested[pr.chosenFactor] = true; });
    const suspect = suspicions
      .filter((id) => !tested[id])
      .map((id) => getMetric(id))
      .filter((m) => !!m)[0] || null;
    return (
      <>
        <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
          Your focus
        </Text>
        <Press
          onPress={() => (suspect ? onTest(suspect.id) : onStart())}
          pressOpacity={0.85}
          style={styles.card}
          accessibilityRole="button"
          accessibilityLabel={suspect
            ? 'Test whether ' + suspect.name + ' moves with your pain'
            : 'Choose what to watch for the next fourteen days'}
        >
          <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
            {suspect
              ? 'You suspected ' + suspect.name.toLowerCase()
              : 'What do you want to understand?'}
          </Text>
          <Text style={styles.cardSub} allowFontScaling maxFontSizeMultiplier={1.4}>
            {suspect
              ? 'Ready to test it properly? Pattern asks about it the same way '
                + 'for fourteen days, then says what the answers actually show.'
              : 'Pick one thing to watch alongside your pain, and Pattern will keep '
                + 'asking about it the same way for fourteen days.'}
          </Text>
          <Text style={styles.cardAction} allowFontScaling maxFontSizeMultiplier={1.4}>
            {suspect ? 'Test ' + suspect.name.toLowerCase() + ' →' : 'Choose a focus →'}
          </Text>
        </Press>
      </>
    );
  }

  const due = reviewDue(protocol, todayIso);

  /* Running, and not yet at the review: NOTHING.

     This was a line, then a card, and both were wrong in the same way —
     a period you are inside has nothing to say to you. It cannot report
     what it is finding, because saying anything before day fourteen is
     the exact thing the threshold exists to prevent. It cannot ask for
     anything, because the asking happens inside the check-in. So it sat
     on Today restating a decision you already made, which is how a
     screen fills up with things that are true and useless.

     It comes back on day fourteen with something to say. Until then the
     period is running whether or not it is drawn, and Today is about the
     day. What is being watched is in the check-in itself, where it is
     being answered.
     
     Kept out of the way rather than deleted: the review below, the
     invitation above, and the promotion offer all still render. */
  if (!due) return null;

  /* day fourteen: how much, never what */
  const prog = reviewProgress(protocol, entries, todayIso);

  return (
    <>
      <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
        Your focus
      </Text>
      <View style={styles.card}>
        <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
          Day {PROTOCOL_REVIEW_DAYS} of your observation period
        </Text>
        <Text style={styles.cardSub} allowFontScaling maxFontSizeMultiplier={1.4}>
          You logged {prog.loggedDays} {prog.loggedDays === 1 ? 'day' : 'days'} so far.
        </Text>

        {prog.factors.map((f) => <Line key={f.metricId} f={f} />)}

        {prog.unreachable.length > 0 && (
          <Text style={styles.warn} allowFontScaling maxFontSizeMultiplier={1.4}>
            {prog.unreachable
              .map((id) => { const m = getMetric(id); return m ? m.name : id; })
              .join(' and ')}{' '}
            {prog.unreachable.length === 1 ? 'is' : 'are'} asked at a time of day you
            haven’t been checking in. Nothing has been recorded for{' '}
            {prog.unreachable.length === 1 ? 'it' : 'them'} yet.
          </Text>
        )}

        <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
          Pattern isn’t drawing any conclusions from this yet, and it won’t
          until there’s enough of it to be worth saying out loud.
        </Text>

        <View style={styles.actions}>
          <Pressable
            onPress={onKeepGoing}
            style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={REVIEW_KEEP}
          >
            <Text style={styles.ghostText}>{REVIEW_KEEP}</Text>
          </Pressable>
          <Pressable
            onPress={onStart}
            style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={REVIEW_CHANGE}
          >
            <Text style={styles.ghostText}>{REVIEW_CHANGE}</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700',
    letterSpacing: -0.2, marginTop: 34, marginBottom: 10,
    paddingHorizontal: size.pageX,
  },
  card: {
    marginHorizontal: size.pageX,
    borderRadius: radius.card, borderCurve: 'continuous', backgroundColor: color.bgSurface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderDivider,
    padding: 16,
  },
  cardTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  cardSub: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 20, marginTop: 5,
  },
  cardAction: {
    color: color.tint, fontSize: font.subheadline, fontWeight: '500', marginTop: 12,
  },

  /* while it runs: a line, not a card. It is a fact about today, not
     something asking to be tapped. */

  progressLine: { marginTop: 14, gap: 2 },
  progressName: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  progressBody: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 20 },
  warn: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: 14 },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 14 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  ghost: {
    flex: 1, minHeight: 46, borderRadius: radius.button, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  ghostText: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
});
