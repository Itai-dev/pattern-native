/**
 * The check-in, in State of Mind's cadence: one question per screen, a
 * living shape under the finger, and chips you tap through rather than
 * forms you fill.
 *
 *   1. How intense?      — slider; the shape moves with the finger, the
 *                          word snaps. The moment is WRITTEN when this
 *                          step ends, so nothing later can lose it, and
 *                          the screen then offers Done as plainly as it
 *                          offers Add context.
 *   2. Today's questions — the active protocol's two factors, and how
 *                          much pain is getting in the way. Only the
 *                          ones this moment can honestly answer, only
 *                          once a day, each one skippable.
 *   3. How does it feel? — quality words (SOCRATES "Character", the answer
 *                          every clinician asks for).
 *   4. Where?            — the same places as last time, confirmed rather
 *                          than assumed.
 *   5. Logged.           — the day you just made, then out on one tap.
 *
 * PAIN IS THE ONLY MANDATORY ANSWER, and after step 1 the flow says so
 * out loud. Steps 2–4 are offered, never demanded, and a pain-only entry
 * is never called incomplete anywhere in the app.
 *
 * A question outside its window is not asked and not recorded. "How was
 * your sleep last night", answered at nine in the evening, is a recall
 * made after a whole day of pain — it is shaped by the outcome it is
 * meant to help explain. A gap is worth more than that.
 *
 * Apple's insight, kept: the shape is analogue while the label is discrete,
 * and every step edits the same already-durable moment in place.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSharedValue } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import Slider from './Slider';
import PainShape from './PainShape';
import DaySquare from './DaySquare';
import * as db from './db';
import { Press } from './motion';
import { getMetric, MetricDef } from './metrics';
import { questionsNow } from './protocol';
import { color, font, size } from './theme';
import {
  PAIN_END_HIGH, PAIN_END_LOW, formatOutOf, inkForBg, inkOn, painColor,
  painLabel, speakScore, themeBrand, SCALE_VERSION,
} from './painScale';
import {
  LOCIDS, LOC_NAMES, QUALITYIDS, QUALITY_NAMES,
  defaultLocs, fmtTime, logsOf, minutesNow, nowMeta, todayISO,
} from './model';

const SQUARE = 150, SQ_RADIUS = 36;
const INTERFERENCE_ID = 'pain.interference.v1';

type Step = 'pain' | 'questions' | 'feel' | 'where' | 'done';

/** how the where step is being answered. `ask` is the confirm prompt;
 *  `change` opens the picker with NOTHING pre-selected. */
type WhereMode = 'ask' | 'change';

export interface CheckinScreenProps {
  /** minutes since midnight; injectable so previews can fix the clock */
  now?: number;
  onDone: () => void;
  onClose: () => void;
}

export default function CheckinScreen({ now, onDone, onClose }: CheckinScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('pain');
  /* the selected value is optional and starts unset: nothing is recorded
     until the user actually moves or taps the slider. The shape needs a
     position to draw, so its internal 0-10 progress is kept separate. */
  const [pain, setPain] = useState<number | null>(null);
  const [quality, setQuality] = useState<string[]>([]);
  const [loc, setLoc] = useState<string[]>([]);
  const [writtenAt, setWrittenAt] = useState<number | null>(null);
  const progress = useSharedValue(0);

  const minutes = now != null ? now : minutesNow();
  const [showAllChips, setShowAllChips] = useState(false);

  /* ── today's questions ─────────────────────────────────────
     Resolved once, when the flow opens, from the active period and the
     clock. An empty list is the normal state before a protocol exists,
     and the step is skipped entirely rather than shown empty. */
  const today = todayISO();
  const [askIds] = useState<string[]>(() => {
    const entry = db.getDay(today);
    const isFirstOfDay = logsOf(entry).length === 0;
    /* interference is fixed core rather than part of a protocol, so it
       rides along as an extra and is asked once a day whether or not an
       observation period exists yet */
    return questionsNow(
      db.activeProtocol(),
      { h: minutes, isFirstOfDay, entry },
      [INTERFERENCE_ID]
    );
  });
  const [pid] = useState<number | null>(() => {
    const p = db.activeProtocol();
    return p && p.id != null ? p.id : null;
  });
  /* answers held in memory until the step is left, so backing out of a
     half-finished screen records nothing */
  const [answers, setAnswers] = useState<Record<string, string | number>>({});

  /* the places last recorded — shown as a reminder of what was true then,
     never pre-ticked as though it were true now */
  const [previous] = useState<string[]>(() => defaultLocs(db.getAll(), today));
  const [whereMode, setWhereMode] = useState<WhereMode>('ask');

  /* chips in personal order: what you actually pick floats to the front,
     and the rest waits behind "Show more" — a wall of fourteen options is
     a form, five of your usual ones is a question */
  const ranked = useMemo(() => {
    const locCount: Record<string, number> = {};
    const qCount: Record<string, number> = {};
    const all = db.getAll();
    Object.keys(all).forEach((k) => (all[k].logs || []).forEach((l) => {
      (l.loc || []).forEach((id) => { locCount[id] = (locCount[id] || 0) + 1; });
      (l.q || []).forEach((id) => { qCount[id] = (qCount[id] || 0) + 1; });
    }));
    const rank = (ids: string[], counts: Record<string, number>) =>
      ids.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    return { loc: rank(LOCIDS, locCount), q: rank(QUALITYIDS, qCount) };
  }, []);

  /* the logged screen acknowledges and leaves — no button tax on every log */
  useEffect(() => {
    if (step !== 'done') return;
    const t = setTimeout(onDone, 1600);
    return () => clearTimeout(t);
  }, [step, onDone]);

  const order: Step[] = ['pain', 'questions', 'feel', 'where'];
  const stepsShown = order.filter((s) => s !== 'questions' || askIds.length > 0);

  const back = () => {
    Haptics.selectionAsync().catch(() => {});
    const i = stepsShown.indexOf(step);
    setStep(stepsShown[Math.max(0, i - 1)]);
  };

  /* nothing may be written until a value has actually been chosen — closing
     the flow before that records no check-in at all */
  const canAdvance = pain != null;

  /** write the moment as it currently stands. Called at every step end, so
   *  the record is durable from the first one and each later step edits
   *  the same moment rather than adding another. */
  const persist = (opts?: { locAsked?: boolean; locSkipped?: boolean }) => {
    if (writtenAt == null || pain == null) return;
    db.writeMoment(today, writtenAt, pain, loc, quality, {
      ...nowMeta(SCALE_VERSION),
      ...(opts || {}),
    });
  };

  /** save the day-scoped answers, one per question that was actually put.
   *  A question shown and left alone is recorded as SKIPPED — asked and
   *  declined is a different fact from never asked, and neither of them
   *  is a value. */
  const persistAnswers = () => {
    askIds.forEach((id) => {
      const v = answers[id];
      if (v === undefined) db.skipAnswer(today, id, minutes, pid);
      else db.setAnswer(today, id, v, minutes, pid);
    });
  };

  const finish = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setStep('done');
  };

  const nextAfter = (s: Step): Step => {
    const i = stepsShown.indexOf(s);
    return i >= 0 && i + 1 < stepsShown.length ? stepsShown[i + 1] : 'done';
  };

  /** log the pain and stop there — a complete check-in */
  const logOnly = () => {
    if (pain == null) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    db.writeMoment(today, minutes, pain, null, null, nowMeta(SCALE_VERSION));
    setWrittenAt(minutes);
    setStep('done');
  };

  const advance = () => {
    if (pain == null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step === 'pain') {
      db.writeMoment(today, minutes, pain, null, null, nowMeta(SCALE_VERSION));
      setWrittenAt(minutes);
      setStep(nextAfter('pain'));
    } else if (step === 'questions') {
      persistAnswers();
      setStep(nextAfter('questions'));
    } else if (step === 'feel') {
      persist();
      setStep(nextAfter('feel'));
    } else {
      persist({ locAsked: true });
      finish();
    }
  };

  /* ── the where step's three answers ──────────────────────── */

  const whereSame = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (writtenAt != null && pain != null) {
      db.writeMoment(today, writtenAt, pain, previous, quality, {
        ...nowMeta(SCALE_VERSION), locAsked: true,
      });
    }
    finish();
  };
  const whereChange = () => {
    Haptics.selectionAsync().catch(() => {});
    setLoc([]);                      // nothing assumed; the picker starts empty
    setWhereMode('change');
  };
  const whereSkip = () => {
    Haptics.selectionAsync().catch(() => {});
    persist({ locSkipped: true });
    finish();
  };

  const chipRow = (
    ids: string[], names: Record<string, string>,
    chosen: string[], setChosen: (v: string[]) => void
  ) =>
    ids.map((id) => {
      const on = chosen.indexOf(id) >= 0;
      return (
        <Press
          key={id}
          onPress={() => {
            Haptics.selectionAsync().catch(() => {});
            setChosen(on ? chosen.filter((x) => x !== id) : chosen.concat(id));
          }}
          pressOpacity={0.8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: on }}
          accessibilityLabel={names[id] || id}
          style={[
            styles.chip,
            on
              /* the border keeps a selected chip visible when a low pain
                 value paints it nearly black */
              ? { backgroundColor: painColor(pain ?? 5), borderColor: 'rgba(255,255,255,0.3)' }
              : { backgroundColor: color.bgSurface, borderColor: color.borderDivider },
          ]}
        >
          <Text
            allowFontScaling maxFontSizeMultiplier={1.4}
            style={[styles.chipText, on && { color: inkOn(pain ?? 5) }]}
          >
            {names[id] || id}
          </Text>
        </Press>
      );
    });

  /* ── one of today's questions ────────────────────────────── */

  const ordinalRow = (m: MetricDef) => (
    <View key={m.id} style={styles.qBlock}>
      <Text style={styles.qLabel} allowFontScaling maxFontSizeMultiplier={1.4}>
        {m.question}
      </Text>
      <View style={styles.segment}>
        {(m.levels || []).map((l) => {
          const on = answers[m.id] === l.id;
          return (
            <Press
              key={l.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setAnswers((a) => {
                  const next = { ...a };
                  if (on) delete next[m.id]; else next[m.id] = l.id;
                  return next;
                });
              }}
              pressOpacity={0.8}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={l.label}
              style={[styles.segItem, on && { backgroundColor: themeBrand() }]}
            >
              <Text
                allowFontScaling maxFontSizeMultiplier={1.3}
                numberOfLines={1}
                style={[styles.segText, on && { color: inkForBg(themeBrand()) }]}
              >
                {l.label}
              </Text>
            </Press>
          );
        })}
      </View>
    </View>
  );

  const numericRow = (m: MetricDef) => {
    const v = typeof answers[m.id] === 'number' ? (answers[m.id] as number) : null;
    return (
      <View key={m.id} style={styles.qBlock}>
        <Text style={styles.qLabel} allowFontScaling maxFontSizeMultiplier={1.4}>
          {m.question}
        </Text>
        <Text style={styles.qValue} allowFontScaling maxFontSizeMultiplier={1.4}>
          {v == null ? 'Not answered' : v + '/10'}
        </Text>
        <Slider
          value={v}
          onChange={(n) => setAnswers((a) => ({ ...a, [m.id]: n }))}
          accessibilityLabel={m.question}
          accessibilityValue={v == null
            ? { text: 'Not answered' }
            : { min: 0, max: 10, now: v, text: v + ' out of 10' }}
        />
        <View style={styles.ends}>
          <Text style={styles.endText}>{(m.ends ? m.ends[0] : '0').toUpperCase()}</Text>
          <Text style={styles.endText}>{(m.ends ? m.ends[1] : '10').toUpperCase()}</Text>
        </View>
      </View>
    );
  };

  if (step === 'done') {
    const e = db.getDay(today);
    const count = e && e.logs ? e.logs.length : 1;
    return (
      <Pressable
        onPress={onDone}
        style={[styles.root, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 30 }]}
      >
        <View style={styles.middle}>
          <DaySquare entry={e} size={SQUARE} radius={SQ_RADIUS} />
          <Text style={styles.doneTitle}>Logged</Text>
          <Text style={styles.doneSub}>
            {count > 1
              ? count + ' moments today · ' + (e!.logs || []).map((l) => fmtTime(l.h)).join(' · ')
              : 'Today is on the map. You don’t need to solve it right now.'}
          </Text>
        </View>
      </Pressable>
    );
  }

  /* "right now", not "today": reminders arrive several times a day, so each
     check-in is a moment, and the day is their average */
  const title = step === 'pain' ? 'How intense is your pain\nright now?'
    : step === 'questions' ? 'A couple of questions\nabout today'
      : step === 'feel' ? 'How does it feel?'
        : 'Where in your body?';

  const hint = step === 'questions' ? 'All optional — skip any that don’t fit'
    : step === 'feel' ? 'Optional — tap any that fit'
      : step === 'where'
        ? (whereMode === 'change' ? 'Tap the places that fit right now' : null)
        : null;

  /* collapsed chips: the six you use most, plus anything already selected;
     "Show more" reveals the rest */
  const visibleIds = (ids: string[], chosen: string[]) => {
    if (showAllChips) return ids;
    const head = ids.slice(0, 6);
    chosen.forEach((id) => { if (head.indexOf(id) < 0) head.push(id); });
    return head;
  };

  /* the where step asks before it assumes: with places on record it offers
     to confirm them, and the picker it opens starts empty */
  const showWhereConfirm = step === 'where' && whereMode === 'ask' && previous.length > 0;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 30 }]}>
      <View style={styles.topBar}>
        {step !== 'pain' ? (
          <Press onPress={back} style={styles.close} hitSlop={12}
            accessibilityRole="button" accessibilityLabel="Back">
            <Text style={styles.closeGlyph}>‹</Text>
          </Press>
        ) : <View style={styles.close2} />}
        {/* the flow's name sits between the controls, the reference's way */}
        <Text style={styles.navTitle} allowFontScaling={false}>Check-In</Text>
        <Press onPress={onClose} style={styles.close} hitSlop={12}
          accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.closeGlyph}>✕</Text>
        </Press>
      </View>

      <Text style={styles.title}>{title}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}

      {step === 'pain' ? (
        <View style={styles.middle}>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={pain == null
              ? 'No pain level selected yet'
              : 'Pain ' + speakScore(pain)}
            style={pain == null && styles.shapeUnset}
          >
            <PainShape progress={progress} size={SQUARE} />
          </View>
          {/* the number and the word carry the value; colour never carries
              it alone, and an unset scale says so in words */}
          {pain == null ? (
            <Text style={styles.unsetWord} allowFontScaling maxFontSizeMultiplier={1.6}>
              Move the slider to choose.
            </Text>
          ) : (
            <>
              <Text style={styles.score} allowFontScaling maxFontSizeMultiplier={1.6}>
                {formatOutOf(pain)}
              </Text>
              <Text style={styles.word} allowFontScaling maxFontSizeMultiplier={1.6}>
                {painLabel(pain)}
              </Text>
            </>
          )}
        </View>
      ) : step === 'questions' ? (
        <ScrollView contentContainerStyle={styles.qWrap} showsVerticalScrollIndicator={false}>
          {askIds.map((id) => {
            const m = getMetric(id);
            if (!m) return null;
            return m.type === 'numeric' ? numericRow(m) : ordinalRow(m);
          })}
        </ScrollView>
      ) : showWhereConfirm ? (
        <View style={styles.middle}>
          <Text style={styles.confirmLead} allowFontScaling maxFontSizeMultiplier={1.4}>
            Last time you recorded
          </Text>
          <Text style={styles.confirmList} allowFontScaling maxFontSizeMultiplier={1.4}>
            {previous.map((id) => LOC_NAMES[id] || id).join(' · ')}
          </Text>
          <Text style={styles.confirmNote} allowFontScaling maxFontSizeMultiplier={1.4}>
            Same areas right now?
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.chipWrap} showsVerticalScrollIndicator={false}>
          {step === 'feel'
            ? chipRow(visibleIds(ranked.q, quality), QUALITY_NAMES, quality, setQuality)
            : chipRow(visibleIds(ranked.loc, loc), LOC_NAMES, loc, setLoc)}
          {!showAllChips && (
            <Press onPress={() => setShowAllChips(true)} style={styles.more} pressOpacity={0.7}>
              <Text style={styles.moreText}>Show more ›</Text>
            </Press>
          )}
        </ScrollView>
      )}

      <View style={styles.bottom}>
        {step === 'pain' && (
          <>
            <Slider
              value={pain}
              onChange={setPain}
              progress={progress}
              accessibilityLabel="Pain right now, 0 to 10"
              accessibilityValue={pain == null
                ? { text: 'Not set' }
                : { min: 0, max: 10, now: pain, text: speakScore(pain) }}
            />
            <View style={styles.ends}>
              <Text style={styles.endText}>{PAIN_END_LOW.toUpperCase()}</Text>
              <Text style={styles.endText}>{PAIN_END_HIGH.toUpperCase()}</Text>
            </View>
          </>
        )}

        {showWhereConfirm ? (
          /* three answers, none of them a default: same, different, or
             not saying. Nothing is recorded as confirmed that the user
             did not confirm. */
          <View style={styles.confirmRow}>
            <Press onPress={whereSkip} pressOpacity={0.75} style={styles.ghost}
              accessibilityRole="button" accessibilityLabel="Skip the where question">
              <Text style={styles.ghostText}>Skip</Text>
            </Press>
            <Press onPress={whereChange} pressOpacity={0.75} style={styles.ghost}
              accessibilityRole="button" accessibilityLabel="Choose different areas">
              <Text style={styles.ghostText}>Change</Text>
            </Press>
            <Press onPress={whereSame} pressScale={0.985}
              style={[styles.primary, styles.primaryGrow, { backgroundColor: themeBrand() }]}
              accessibilityRole="button" accessibilityLabel="Same areas as last time">
              <Text style={[styles.primaryText, { color: inkForBg(themeBrand()) }]}>Same</Text>
            </Press>
          </View>
        ) : (
          <>
            <Press
              onPress={advance}
              disabled={!canAdvance}
              pressScale={canAdvance ? 0.985 : 1}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAdvance }}
              accessibilityHint={canAdvance ? undefined : 'Choose a pain level first'}
              style={[
                styles.primary,
                /* the reference fills its Next button with its accent; ours is
                   the theme's own hue, ink chosen by real luminance */
                canAdvance ? { backgroundColor: themeBrand() } : styles.primaryOff,
              ]}
            >
              <Text style={[
                styles.primaryText,
                canAdvance ? { color: inkForBg(themeBrand()) } : styles.primaryTextOff,
              ]}>
                {step === 'pain' ? 'Add context'
                  : step === 'where' ? 'Save today' : 'Continue'}
              </Text>
            </Press>

            {/* pain on its own is a finished check-in, and the flow says so
                as plainly as it offers the rest */}
            {step === 'pain' && (
              <Press
                onPress={logOnly}
                disabled={!canAdvance}
                pressOpacity={0.75}
                style={styles.secondary}
                accessibilityRole="button"
                accessibilityState={{ disabled: !canAdvance }}
                accessibilityLabel="Log the pain and finish"
              >
                <Text style={[styles.secondaryText, !canAdvance && styles.primaryTextOff]}>
                  Just log the pain
                </Text>
              </Press>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bgRoot, paddingHorizontal: 28 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  navTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },
  close: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: color.borderDivider,
    alignItems: 'center', justifyContent: 'center',
  },
  close2: { width: 40, height: 40 },
  more: { paddingVertical: 12, paddingHorizontal: 8, alignSelf: 'center' },
  moreText: { color: color.textTertiary, fontSize: font.subheadline },
  closeGlyph: { color: color.textSecondary, fontSize: 15, lineHeight: 18 },
  title: {
    color: color.textPrimary, fontSize: font.title2, fontWeight: '700', letterSpacing: -0.3,
    lineHeight: 29, textAlign: 'center', marginTop: 14,
  },
  hint: { color: color.textTertiary, fontSize: font.subheadline, textAlign: 'center', marginTop: 8 },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /* unset reads as waiting, not as a value: the shape is dimmed rather than
     showing a colour the user has not chosen */
  shapeUnset: { opacity: 0.28 },
  unsetWord: {
    color: color.textSecondary, fontSize: font.body, marginTop: 30, textAlign: 'center',
  },
  /* the main pain value: a large display size that still scales with
     Dynamic Type — the number is the precise information */
  score: {
    color: color.textPrimary, fontSize: 44, fontWeight: '700',
    letterSpacing: -0.8, marginTop: 26, fontVariant: ['tabular-nums'],
  },
  primaryOff: { backgroundColor: color.bgSegmentActive },
  primaryTextOff: { color: color.textTertiary },
  /* the category beneath the score — the same five words everywhere */
  word: {
    color: color.textSecondary, fontSize: font.title3, fontWeight: '600',
    letterSpacing: -0.3, marginTop: 2, textAlign: 'center',
  },
  doneTitle: {
    color: color.textPrimary, fontSize: 26, fontWeight: '700',
    letterSpacing: -0.4, marginTop: 30,
  },
  doneSub: {
    color: color.textSecondary, fontSize: font.subheadline, lineHeight: 22,
    marginTop: 8, textAlign: 'center', maxWidth: 300,
  },

  /* ── today's questions ─────────────────────────────────── */
  qWrap: { paddingVertical: 22, gap: 26 },
  qBlock: { gap: 10 },
  qLabel: {
    color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 22,
  },
  qValue: {
    color: color.textSecondary, fontSize: font.subheadline,
    fontVariant: ['tabular-nums'], marginTop: -4,
  },
  segment: {
    flexDirection: 'row', gap: 8,
  },
  segItem: {
    flex: 1, minHeight: 46, borderRadius: 14, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: color.bgSurface,
    borderWidth: 1, borderColor: color.borderDivider,
  },
  segText: { color: '#D0D0D6', fontSize: font.subheadline, fontWeight: '600' },

  /* ── the where confirmation ────────────────────────────── */
  confirmLead: { color: color.textTertiary, fontSize: font.subheadline },
  confirmList: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '600',
    textAlign: 'center', marginTop: 8, lineHeight: 26,
  },
  confirmNote: {
    color: color.textSecondary, fontSize: font.body, marginTop: 22, textAlign: 'center',
  },
  confirmRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 26 },
  ghost: {
    minHeight: size.buttonH, borderRadius: size.buttonH / 2, paddingHorizontal: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: color.borderDivider, backgroundColor: color.bgSurface,
  },
  ghostText: { color: color.textPrimary, fontSize: font.body, fontWeight: '600' },

  chipWrap: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 9,
    justifyContent: 'center', paddingVertical: 24,
  },
  chip: { paddingVertical: 11, paddingHorizontal: 17, borderRadius: 22, borderWidth: 1 },
  chipText: { color: '#D0D0D6', fontSize: font.subheadline, fontWeight: '500' },
  bottom: { flexShrink: 0 },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 2 },
  /* CAPS at the ends of the slider, exactly as the reference sets them */
  endText: {
    color: color.textTertiary, fontSize: 11, fontWeight: '600', letterSpacing: 0.6,
  },
  /* a full pill, the reference's button shape */
  primary: {
    minHeight: size.buttonH, borderRadius: size.buttonH / 2,
    alignItems: 'center', justifyContent: 'center', marginTop: 26, paddingHorizontal: 16,
  },
  primaryGrow: { flex: 1, marginTop: 0 },
  primaryText: { fontSize: font.title3, fontWeight: '600' },
  secondary: {
    minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 6,
  },
  secondaryText: { color: color.textSecondary, fontSize: font.body, fontWeight: '600' },
});
