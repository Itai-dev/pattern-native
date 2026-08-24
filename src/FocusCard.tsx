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
import { Press } from './motion';
import { getMetric } from './metrics';
import { Entries, Protocol } from './model';
import {
  FactorProgress, REVIEW_CHANGE, REVIEW_KEEP, activeFactorIds, dayNumber,
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

function factorNames(p: Protocol): string {
  return activeFactorIds(p)
    .map((id) => { const m = getMetric(id); return m ? m.name : id; })
    .join(' · ');
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

  /* nothing running — the invitation */
  if (!protocol) {
    return (
      <>
        <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
          Your focus
        </Text>
        <Press
          onPress={onStart}
          pressOpacity={0.85}
          style={styles.card}
          accessibilityRole="button"
          accessibilityLabel="Choose what to watch for the next fourteen days"
        >
          <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
            What do you want to understand?
          </Text>
          <Text style={styles.cardSub} allowFontScaling maxFontSizeMultiplier={1.4}>
            Pick one thing to watch alongside your pain, and Pattern will keep
            asking about it the same way for fourteen days.
          </Text>
          <Text style={styles.cardAction} allowFontScaling maxFontSizeMultiplier={1.4}>
            Choose a focus →
          </Text>
        </Press>
      </>
    );
  }

  const due = reviewDue(protocol, todayIso);
  const day = dayNumber(protocol, todayIso);

  /* running, and not yet at the review — one quiet line, no progress bar,
     no streak, nothing that rewards looking at it */
  if (!due) {
    return (
      <View
        style={styles.statusRow}
        accessible
        accessibilityLabel={'Your focus: day ' + day + ' of ' + PROTOCOL_REVIEW_DAYS
          + '. Watching ' + factorNames(protocol)}
      >
        <Text style={styles.statusDay} allowFontScaling maxFontSizeMultiplier={1.3}>
          Day {day} of {PROTOCOL_REVIEW_DAYS}
        </Text>
        <Text style={styles.statusDot}>·</Text>
        <Text style={styles.statusFactors} numberOfLines={1}
          allowFontScaling maxFontSizeMultiplier={1.3}>
          {factorNames(protocol)}
        </Text>
      </View>
    );
  }

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
    borderRadius: radius.card, backgroundColor: color.bgSurface,
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
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginTop: 26, paddingHorizontal: size.pageX,
  },
  statusDay: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statusDot: { color: color.textTertiary, fontSize: font.footnote },
  statusFactors: { color: color.textTertiary, fontSize: font.footnote, flexShrink: 1 },

  progressLine: { marginTop: 14, gap: 2 },
  progressName: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  progressBody: { color: color.textSecondary, fontSize: font.subheadline, lineHeight: 20 },
  warn: { color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: 14 },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 14 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  ghost: {
    flex: 1, minHeight: 46, borderRadius: radius.button,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  ghostText: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
});
