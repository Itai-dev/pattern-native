/**
 * The first ninety seconds — five screens, then a check-in or Today.
 *
 * What this deliberately does NOT do is the whole design. It asks for no
 * account, no medication list, no Health permission and no choice of
 * what to track. Every one of those is a question the app cannot yet
 * make useful, and asking them before someone has recorded a single day
 * is asking them to commit to a tool they have not used. Health stays a
 * card on Today, on day two; the background stays day three.
 *
 * THE ORDER (Oct 2026 redesign): welcome, goal, focus, diagnosis,
 * reminder. The goal and the place lead because Today now opens on
 * them — "Back to running", and the place being worked back from — and
 * both are already in the head of someone who just installed this.
 *
 * THE DIAGNOSIS EARNED A SCREEN (17 Sep 2026). Its answer decides what
 * the app is FOR this person. Someone with a diagnosis wants to know
 * what affects it and what lets them stay active — what helps, what
 * costs the next morning. Someone without one wants a clearer picture
 * and better information for the doctor, without the distortion of
 * memory; the diagnosis, if one comes, is the doctor's, never this
 * app's. The answer orders what Today offers first and leads page one
 * of the PDF.
 *
 * THE GOAL EARNED ONE TOO (28 Sep 2026). The first version asked it on
 * Today — a setup form on top of the screen for every tester, new or
 * old. It is a day-zero question in the way the diagnosis is. Phones
 * that onboarded before it are offered it once, in Today's
 * one-at-a-time slot.
 *
 * THE FOCUS is the one place being worked back from, with a side where
 * the body has two, and how long it has been going on. The place seeds
 * the first check-in's "your usual places" offer and the duration seeds
 * the background's onset line; they are the same two answers the old
 * "where does it usually hurt" screen stored, in the same preference
 * and the same words, so nothing downstream had to change.
 *
 * THE REMINDER IS ASKED, AND OFF UNTIL TURNED ON. The activity card is
 * read from mornings, so a morning check-in is what lets it say
 * anything; this is the moment that explains a notification permission,
 * which is why the permission sheet arrives when the switch is turned
 * on and not before. Leaving it off is a full answer: the app works
 * without a reminder, and Today does not ask again.
 *
 * Every screen after the first can be passed over, and a pass is stored
 * as a pass. The button says Skip for now when nothing is chosen — the
 * check-in's rule — so someone who installs this during a flare reaches
 * the check-in in five taps.
 *
 * THE SAFETY TEXT IS SHORT ON PURPOSE. A page of medical disclaimer is
 * read by nobody and protects no one — it is the interface equivalent of
 * a mumbled warning. Three sentences that a person actually reads do more
 * than three paragraphs they scroll past, and the red flags are the part
 * that matters: this app must never be the reason someone sits at home
 * with a symptom that needed a doctor tonight.
 */
import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import DiagnosisStep, { emptyDraft, draftToRaw } from './DiagnosisStep';
import { Diagnosis, collapseSidedLocs, todayISO } from './model';
import { painColor } from './painScale';
import { GOAL_ACTIVITIES, GoalActivity, RecoveryGoal } from './recovery';
import { WEEKLY_CHOICES, makeGoal, skippedGoal } from './RecoveryCards';
import { capitalise } from './health/workoutNames';
import { DEFAULT_SLOTS, ensurePermission } from './reminders';
import { fmtClock } from './clock';
import { color, font, size } from './theme';

export interface OnboardingResult {
  /** location ids — the first check-in's usual-places offer. The one
   *  place chosen, sided where a side was given ('kneeL', or both of a
   *  pair), the coarse family word where it was not ('knees'). */
  where: string[];
  /** '' when skipped */
  duration: '' | 'weeks' | 'months' | 'years';
  /** the diagnosis record as it will be stored — status '' when the
   *  screen was passed over, which is a state and is kept */
  diagnosis: Diagnosis;
  /** the goal as it will be stored — activity null when passed over,
   *  which is a state and is kept, like the diagnosis */
  goal: RecoveryGoal;
  /** the morning reminder's minute of day, or null when it was left off */
  reminder: number | null;
  /** which of the last screen's two buttons finished it */
  then: 'checkin' | 'today';
}

export interface OnboardingScreenProps {
  /** the backup picker, offered on the first screen only — the way back
   *  in for a reinstall that has a file to bring home. Absent in review
   *  mode, where the record already exists. */
  onRestore?: () => void;
  /** finished — record it, then open the check-in or Today */
  onDone: (result: OnboardingResult) => void;
  /** Reading it again from Profile, not arriving for the first time. The
     spec requires the urgent-care guidance to stay reachable, and a
     safety card shown once and never again is not reachable — it is
     remembered or lost. */
  review?: boolean;
}

/** the five screens, by name, so the code reads as the flow does.
 *  PROMISE is the welcome: the promise and the boundaries together. */
const PROMISE = 0;
const GOAL = 1;
const PLACES = 2;
const DIAGNOSIS = 3;
const REMINDER = 4;
const STEPS = [PROMISE, GOAL, PLACES, DIAGNOSIS, REMINDER];

/* the redesign's greys, named here until theme.ts carries them */
const GREY_TEXT = '#98989F';
const WELCOME_TEXT = '#C7C7CC';
const HAIRLINE = '#38383A';
const SEG_ON = '#636366';
const SWITCH_OFF = '#39393D';

/* an icon per activity — Ionicons' filled set, white, because nothing
   here is a pain value. Ionicons has no runner: its walking figure is
   mid-stride, so it is running's, and walking takes the footsteps. */
type IconName = React.ComponentProps<typeof Ionicons>['name'];
const GOAL_ICON: Record<GoalActivity, IconName> = {
  running: 'walk',
  'strength training': 'barbell',
  swimming: 'water',
  cycling: 'bicycle',
  walking: 'footsteps',
  pilates: 'body',
  other: 'ellipsis-horizontal',
};
const goalName = (a: GoalActivity) => (a === 'other' ? 'Something else' : capitalise(a));

/* THE PLACES, in the record's own vocabulary (model.ts LOC_NAMES) — no
   new id, so the first check-in, the PDF and a restored backup already
   speak every answer this can give. A place the body has two of names
   its sided pair; the rest name the one coarse id. Ordered by what
   people working back to an activity most often name first; "All over"
   last, because it is a real answer and not a place to work back from.
   The mockup's Achilles and hamstring are here as Ankle and Thigh: the
   record has no word for either, and a chip is a word the record stores. */
interface Place { key: string; label: string; id?: string; pair?: [string, string] }
const PLACE_LIST: Place[] = [
  { key: 'lowerBack', label: 'Lower back', id: 'lowerBack' },
  { key: 'knee', label: 'Knee', pair: ['kneeL', 'kneeR'] },
  { key: 'hip', label: 'Hip', pair: ['hipL', 'hipR'] },
  { key: 'shoulder', label: 'Shoulder', pair: ['shoulderL', 'shoulderR'] },
  { key: 'neck', label: 'Neck', id: 'neck' },
  { key: 'ankle', label: 'Ankle', pair: ['ankleL', 'ankleR'] },
  { key: 'foot', label: 'Foot', pair: ['footL', 'footR'] },
  { key: 'thigh', label: 'Thigh', pair: ['thighL', 'thighR'] },
  { key: 'elbow', label: 'Elbow', pair: ['elbowL', 'elbowR'] },
  { key: 'wrist', label: 'Wrist', pair: ['wristL', 'wristR'] },
  { key: 'hand', label: 'Hand', pair: ['handL', 'handR'] },
  { key: 'upperBack', label: 'Upper back', id: 'upperBack' },
  { key: 'head', label: 'Head', id: 'head' },
  { key: 'chest', label: 'Chest', id: 'chest' },
  { key: 'belly', label: 'Belly', id: 'belly' },
  { key: 'allOver', label: 'All over', id: 'allOver' },
];
type Side = 'L' | 'R' | 'both';

/** the place as the ids it stores. A sided place with no side said is
 *  stored as its coarse family word — 'knees', which the check-in's
 *  main chips speak — rather than guessing a side or claiming both. */
function placeIds(key: string | null, side: Side | null): string[] {
  const p = PLACE_LIST.find((x) => x.key === key);
  if (!p) return [];
  if (!p.pair) return [p.id!];
  if (side === 'L') return [p.pair[0]];
  if (side === 'R') return [p.pair[1]];
  if (side === 'both') return p.pair.slice();
  return collapseSidedLocs([p.pair[0]]);
}

/* the morning times on offer, as minutes of day: half-hour steps around
   the slot's own default, all well inside the morning window the
   activity card reads its outcomes from (before noon). Any other time
   is one tap away in Profile, on the iPhone's own wheel. */
const MORNING_DEFAULT = (() => {
  const m = DEFAULT_SLOTS.find((s) => s.key === 'm');
  return m ? m.hour * 60 + m.minute : 8 * 60;
})();
const MORNING_TIMES = [7 * 60, 7 * 60 + 30, 8 * 60, 8 * 60 + 30];
/* the same words Profile's reminder row uses when iOS says no */
const DENIED = 'Notifications are off for Pattern — turn them on in iPhone Settings.';

export default function OnboardingScreen({ onDone, review, onRestore }: OnboardingScreenProps) {
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState(PROMISE);
  const [duration, setDuration] = useState<OnboardingResult['duration']>('');
  const [diagnosis, setDiagnosis] = useState(emptyDraft);
  const [goal, setGoal] = useState<GoalActivity | null>(null);
  const [goalOther, setGoalOther] = useState('');
  /* 'none' is "no weekly target", said out loud. It stores exactly as an
     untouched control does — weeklySessions null — but the control has
     to show the choice that was made. */
  const [weekly, setWeekly] = useState<number | 'none' | null>(null);
  /* "other" with no words is not an answer yet — the button still says Skip */
  const goalAnswered = !!goal && (goal !== 'other' || !!goalOther.trim());
  const [place, setPlace] = useState<string | null>(null);
  const [side, setSide] = useState<Side | null>(null);
  const placeSided = !!(PLACE_LIST.find((x) => x.key === place) || {}).pair;
  /* the reminder starts OFF, as every reminder in this app does: one
     defaulting on would be scheduled before iOS ever granted it */
  const [remindOn, setRemindOn] = useState(false);
  const [remindAt, setRemindAt] = useState(MORNING_DEFAULT);
  const [remindNote, setRemindNote] = useState('');

  /* reading it again from Profile stops at the boundaries — the row says
     "what Pattern is and isn't", and re-asking questions of someone who
     answered them weeks ago is not what they tapped */
  const lastStep = review ? PROMISE : REMINDER;

  const result = (then: OnboardingResult['then']): OnboardingResult => ({
    where: placeIds(place, placeSided ? side : null),
    duration,
    diagnosis: draftToRaw(diagnosis, todayISO()),
    goal: goalAnswered
      ? makeGoal(goal!, goalOther, typeof weekly === 'number' ? weekly : null, todayISO())
      : skippedGoal(todayISO()),
    reminder: remindOn ? remindAt : null,
    then,
  });

  const advance = (then: OnboardingResult['then'] = 'checkin') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (step < lastStep) setStep(step + 1);
    else onDone(result(then));
  };

  /* THE WAY BACK (18 Oct 2026). Before this, a mis-tapped diagnosis or
     goal could only be put right later in Profile, by someone who had to
     know it was there. Back is safe on every step for one reason, and the
     reason is load-bearing: NOTHING HERE IS WRITTEN UNTIL onDone. Every
     answer lives in this component's state, the steps swap inside one
     mounted screen, and App stores the diagnosis, goal, place and
     reminder only when the last button is pressed. So stepping back
     moves `step` and clears nothing, and the screen it lands on shows the
     answer as it was left — a chosen row still chosen, a passed-over one
     still empty with its button still saying Skip.

     That is also what keeps three states three. Finishing still means
     going forward through every screen, so each question has been put by
     the time anything is stored: a skip is stored as a skip, never as
     "never asked", and passing back over an answer never drops it. If a
     step ever starts writing on Continue, this stops being true and back
     must be scoped to the steps after that one. (The notification
     permission is asked when the switch turns on; that is iOS's, not the
     record's, and a granted permission with no reminder on fires nothing.)

     Not on the first screen, which has nothing behind it, and so not in
     review, which is only that screen. No animation to honour Reduce
     Motion for: steps swap instantly forward, and back matches. */
  const back = () => {
    if (step <= PROMISE) return;
    Haptics.selectionAsync().catch(() => {});
    setStep(step - 1);
  };

  /* the switch asks iOS at the moment the question explains itself. A
     refusal turns it back off and says where to change it: a reminder
     shown as on that iOS will never deliver is a promise the screen
     cannot keep. */
  const toggleReminder = (on: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    setRemindNote('');
    setRemindOn(on);
    if (!on) return;
    ensurePermission()
      .then((ok) => { if (!ok) { setRemindOn(false); setRemindNote(DENIED); } })
      .catch(() => { setRemindOn(false); setRemindNote(DENIED); });
  };

  /* There is no separate skip door. Every screen's one button leaves
     with whatever was filled in, everything being optional, and says
     Skip for now when nothing on its screen is chosen. */
  const answered = step === GOAL ? goalAnswered
    : step === PLACES ? !!place || !!duration
      : step === DIAGNOSIS ? !!diagnosis.status
        : true;
  const primaryLabel = review ? 'Done'
    : step === PROMISE ? 'Get started'
      : step === REMINDER ? 'Take your first check-in'
        : answered ? 'Continue' : 'Skip for now';
  const skipLook = !review && !answered;

  const pickOne = <T,>(cur: T | null, set: (v: T | null) => void, v: T) => {
    Haptics.selectionAsync().catch(() => {});
    /* tapping the chosen one again un-chooses it: the skip stays
       reachable after a mis-tap, and nothing here is mandatory */
    set(cur === v ? null : v);
  };

  /* iOS's segmented control, drawn: a dark track, the chosen segment a
     lighter grey. Grey, not white, because white here means a button. */
  const segmented = <T extends string | number>(
    label: string, options: { id: T; text: string; a11y?: string }[],
    value: T | null, onPick: (v: T) => void,
    opts: { numeric?: boolean; inCard?: boolean } = {}
  ) => (
    <View style={[styles.seg, opts.inCard && styles.segInCard]} accessibilityRole="radiogroup"
      accessibilityLabel={label}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <View key={String(o.id)} style={styles.segCell}>
            <Press
              onPress={() => onPick(o.id)}
              pressOpacity={0.7}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={o.a11y || o.text}
              style={[styles.segBtn, opts.inCard && styles.segBtnInCard, on && styles.segBtnOn]}
            >
              <Text
                style={[
                  opts.numeric ? styles.segNum : styles.segText,
                  on && (opts.numeric ? styles.segNumOn : styles.segTextOn),
                ]}
                numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
                allowFontScaling maxFontSizeMultiplier={1.2}
              >
                {o.text}
              </Text>
            </Press>
          </View>
        );
      })}
    </View>
  );

  const fieldLabel = (text: string) => (
    <Text style={styles.fieldLabel} allowFontScaling maxFontSizeMultiplier={1.3}>{text}</Text>
  );

  const title = (text: string) => (
    <Text style={styles.title} accessibilityRole="header" allowFontScaling maxFontSizeMultiplier={1.3}>
      {text}
    </Text>
  );
  const lede = (text: string) => (
    <Text style={styles.lede} allowFontScaling maxFontSizeMultiplier={1.4}>{text}</Text>
  );

  const goalTile = (a: GoalActivity) => {
    const on = goal === a;
    const ink = on ? '#000000' : color.textPrimary;
    return (
      <View key={a} style={styles.tileCell}>
        <Press
          onPress={() => pickOne(goal, setGoal, a)}
          pressOpacity={0.8}
          accessibilityRole="radio"
          accessibilityState={{ selected: on }}
          accessibilityLabel={goalName(a)}
          style={[styles.tile, on && styles.tileOn]}
        >
          <Ionicons name={GOAL_ICON[a]} size={24} color={ink} />
          <Text style={[styles.tileText, { color: ink }]} numberOfLines={2}
            allowFontScaling maxFontSizeMultiplier={1.3}>
            {goalName(a)}
          </Text>
        </Press>
      </View>
    );
  };
  /* two to a row, and "Something else" across the whole last row */
  const goalRows: GoalActivity[][] = [];
  GOAL_ACTIVITIES.filter((a) => a !== 'other').forEach((a, i) => {
    if (i % 2 === 0) goalRows.push([a]); else goalRows[goalRows.length - 1].push(a);
  });
  goalRows.push(['other']);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.root}
    >
      <View
        style={[
          styles.inner,
          { paddingTop: insets.top, paddingBottom: insets.bottom + 16 },
        ]}
        /* VoiceOver's two-finger scrub is iOS's back; it goes where the
           button goes */
        onAccessibilityEscape={step > PROMISE ? back : undefined}
      >
      {/* where a navigation bar would be: 44pt under the safe area, the
          place iOS puts back on every screen — the chevron, and the five
          screens as five segments, white up to this one. A step count,
          not a score: it moves only when the person moves. The welcome
          has neither, and sits lower, as the mockup draws it. */}
      <View style={[styles.header, step === PROMISE && styles.headerWelcome]}>
        {step > PROMISE && (
          <Press
            onPress={back}
            pressOpacity={0.6}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Back"
            accessibilityHint="The previous screen, with your answers as you left them"
          >
            <Ionicons name="chevron-back" size={28} color={color.textPrimary} style={styles.backText} />
          </Press>
        )}
        {step > PROMISE && (
          <View style={styles.progress} accessible
            accessibilityLabel={'Step ' + (step + 1) + ' of ' + STEPS.length}>
            {STEPS.map((i) => (
              <View key={i} style={[styles.progressSeg, i <= step && styles.progressSegDone]} />
            ))}
          </View>
        )}
      </View>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {step === PROMISE ? (
          <>
            {/* five squares of the app's own language, light to dark —
                the scale explained before a word of it is read. Squares
                are pain values, and these are: stops of the ramp. */}
            <View style={styles.marks}>
              {[1, 3, 5, 7, 9].map((v) => (
                <View key={v} style={[styles.mark, { backgroundColor: painColor(v) }]} />
              ))}
            </View>

            <Text style={styles.welcomeTitle} accessibilityRole="header"
              allowFontScaling maxFontSizeMultiplier={1.3}>
              A record of{'\n'}your pain.
            </Text>
            {/* not the landing's line: "Understand your pain. Keep living."
                is two orders, to someone who may be mid-flare, and it
                promises an understanding the app does not claim. Health
                is named conditionally because it is not asked for until
                Today — a watch sentence would be false for everyone on
                day one */}
            <Text style={styles.welcomeBody} allowFontScaling maxFontSizeMultiplier={1.4}>
              One number, a few seconds. With Apple Health, Pattern looks at
              how your mornings go after a workout and suggests a small next
              step.
            </Text>

            {/* the boundaries, on the first screen and not a second one:
                the red flags are the sentences a person must have seen,
                and a screen of their own was where they got skipped past.
                Every red flag stays — numbness, weakness, fever and
                bladder or bowel loss are the signs that turn back pain
                into an emergency, and a safety card that drops them to
                read nicer protects nobody. One grouped card, two rows. */}
            <View style={styles.group}>
              <View style={styles.groupRow}>
                <Ionicons name="warning" size={22} color={color.textPrimary} style={styles.groupIcon} />
                <View style={styles.groupText}>
                  <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
                    Know when not to log
                  </Text>
                  <Text style={styles.cardBody} allowFontScaling maxFontSizeMultiplier={1.4}>
                    Sudden severe pain, chest pain, a serious injury, or pain with
                    numbness, weakness, fever, or loss of bladder or bowel control
                    needs medical attention now — not a check-in. Pattern does not
                    diagnose, identify causes, advise on medication, or replace
                    medical care.
                  </Text>
                </View>
                <View style={styles.groupSep} />
              </View>
              {/* the promise in full, not the mockup's shorter line: until
                  the encrypted account ships, the shipped promise is the
                  absolute one, and it is not softened ahead of the code */}
              <View style={styles.groupRow}>
                <Ionicons name="lock-closed" size={22} color={color.textPrimary} style={styles.groupIcon} />
                <View style={styles.groupText}>
                  <Text style={styles.cardTitle} allowFontScaling maxFontSizeMultiplier={1.3}>
                    Your record stays on this iPhone
                  </Text>
                  <Text style={styles.cardBody} allowFontScaling maxFontSizeMultiplier={1.4}>
                    No account, no sign-in, nothing sent to Pattern. It rides in your
                    iPhone’s own backup, so a new phone gets it back. What you write
                    leaves your hands only if you save a copy or share the PDF
                    yourself.
                  </Text>
                </View>
              </View>
            </View>
          </>
        ) : step === GOAL ? (
          <>
            {title('What are you getting back to?')}
            {lede('Pattern reads how your body responds to it, from your own sessions in Apple Health.')}
            <View style={styles.tiles} accessibilityRole="radiogroup" accessibilityLabel="Activity">
              {goalRows.map((row) => (
                <View key={row.join()} style={styles.tileRow}>{row.map(goalTile)}</View>
              ))}
            </View>
            {goal === 'other' && (
              <TextInput value={goalOther} onChangeText={setGoalOther} maxLength={40}
                /* focus is for a field that has just opened empty. Coming
                   back to words already typed, a keyboard over the tiles
                   is in the way of the thing back was for. */
                autoFocus={!goalOther}
                placeholder="In your words" placeholderTextColor={color.textTertiary}
                accessibilityLabel="Your activity, in your words" style={styles.input} />
            )}
            {goalAnswered && (
              <View style={styles.field}>
                {fieldLabel('Sessions a week · optional')}
                {segmented<number | 'none'>(
                  'Sessions a week',
                  (WEEKLY_CHOICES as (number | 'none')[]).concat('none').map((w) => ({
                    id: w,
                    text: w === 'none' ? 'None' : String(w),
                    a11y: w === 'none' ? 'No weekly target' : w + ' a week',
                  })),
                  weekly,
                  (w) => pickOne(weekly, setWeekly, w),
                  { numeric: true }
                )}
              </View>
            )}
          </>
        ) : step === PLACES ? (
          <>
            {title('Where does it hurt?')}
            {lede('Pick the one you’re working back from. You can add other places on any check-in.')}
            <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Body part">
              {PLACE_LIST.map((p) => {
                const on = place === p.key;
                return (
                  <Press
                    key={p.key}
                    /* a side belongs to the place it was given for: a
                       left knee does not make the hip chosen next a
                       left one */
                    onPress={() => { pickOne(place, setPlace, p.key); setSide(null); }}
                    pressOpacity={0.8}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={p.label}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}
                      allowFontScaling maxFontSizeMultiplier={1.3}>{p.label}</Text>
                  </Press>
                );
              })}
            </View>

            {placeSided && (
              <View style={styles.field}>
                {fieldLabel('Which side?')}
                {segmented<Side>(
                  'Side',
                  [{ id: 'L', text: 'Left' }, { id: 'R', text: 'Right' }, { id: 'both', text: 'Both' }],
                  side,
                  (s) => pickOne(side, setSide, s)
                )}
              </View>
            )}

            {/* the same three answers as before, in the same words: they
                are what becomes the background's onset line, and a new
                label would print a sentence nobody chose */}
            <View style={styles.field}>
              {fieldLabel('How long has it been going on? · optional')}
              {segmented<'weeks' | 'months' | 'years'>(
                'How long',
                [
                  { id: 'weeks', text: 'A few weeks' },
                  { id: 'months', text: 'Months' },
                  { id: 'years', text: 'A year or more' },
                ],
                duration || null,
                (d) => pickOne<'weeks' | 'months' | 'years'>(duration || null, (v) => setDuration(v || ''), d)
              )}
            </View>
          </>
        ) : step === DIAGNOSIS ? (
          <>
            {title('Do you have a diagnosis?')}
            {lede('It decides what Pattern is for you. You can change it later.')}
            <View style={styles.field}>
              <DiagnosisStep draft={diagnosis} onChange={setDiagnosis} />
            </View>
          </>
        ) : (
          <>
            {title('A reminder each morning, if you want one')}
            {lede('How you feel the morning after a session is what decides the next one. A reminder can ask once each morning, and it never mentions a missed day.')}
            <View style={styles.group}>
              <View style={styles.switchRow}>
                <Ionicons name="notifications" size={24} color={color.textPrimary} />
                <Text style={styles.switchLabel} allowFontScaling maxFontSizeMultiplier={1.3}>
                  Morning reminder
                </Text>
                {/* white track, black thumb: the mockup's switch, and the
                    one way a white "on" does not swallow its own thumb */}
                <Switch
                  value={remindOn}
                  onValueChange={toggleReminder}
                  accessibilityLabel="Morning reminder"
                  trackColor={{ true: color.textPrimary, false: SWITCH_OFF }}
                  thumbColor={remindOn ? '#000000' : color.textPrimary}
                  ios_backgroundColor={SWITCH_OFF}
                />
              </View>
              {remindOn && (
                <>
                  <View style={styles.rowSep} />
                  <View style={styles.timeBlock}>
                    <View style={styles.timeHead}>
                      <Text style={styles.switchLabel} allowFontScaling maxFontSizeMultiplier={1.3}>
                        Time
                      </Text>
                      <View style={styles.timePill}>
                        <Text style={styles.timePillText} allowFontScaling maxFontSizeMultiplier={1.2}>
                          {fmtClock(remindAt)}
                        </Text>
                      </View>
                    </View>
                    {segmented<number>(
                      'Reminder time',
                      MORNING_TIMES.map((m) => ({
                        id: m,
                        /* the pill above carries AM; four of it in a row
                           is noise. Other locales keep their own form. */
                        text: fmtClock(m).replace(/\s?[AaPp]\.?[Mm]\.?$/, ''),
                        a11y: fmtClock(m),
                      })),
                      remindAt,
                      (m) => { Haptics.selectionAsync().catch(() => {}); setRemindAt(m); },
                      { numeric: true, inCard: true }
                    )}
                  </View>
                </>
              )}
            </View>
            {!!remindNote && (
              <Text style={styles.note} allowFontScaling maxFontSizeMultiplier={1.4}>{remindNote}</Text>
            )}
            {/* what the switch does not promise, beside it: the time can
                move once Health knows when this person wakes, and the
                reminder never makes anything but pain mandatory */}
            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              Change it in Profile. Once Apple Health is connected, the time can
              follow when you usually wake. Pain is the only question you have
              to answer.
            </Text>
          </>
        )}
      </ScrollView>

      <View style={styles.bottom}>
        <Press
          onPress={() => advance('checkin')}
          pressScale={0.985}
          style={[styles.primary, skipLook && styles.primarySkip]}
          accessibilityRole="button"
          accessibilityLabel={primaryLabel}
        >
          <Text style={[styles.primaryText, skipLook && styles.primaryTextSkip]}
            allowFontScaling maxFontSizeMultiplier={1.3}>{primaryLabel}</Text>
        </Press>

        {/* the way to finish without a check-in: the reminder screen is
            the last, and "now" is not always the moment for the first
            number. Everything above is stored the same either way. */}
        {!review && step === REMINDER && (
          <Press
            onPress={() => advance('today')}
            pressOpacity={0.7}
            style={styles.linkBtn}
            accessibilityRole="button"
            accessibilityLabel="Later — go to Today"
          >
            <Text style={styles.linkText} allowFontScaling maxFontSizeMultiplier={1.3}>
              Later — go to Today
            </Text>
          </Press>
        )}

        {/* THE WAY BACK IN. Someone whose app was deleted — by them, by a
            test build running out — reinstalls and lands here with an empty
            record and, if they were lucky, a backup file in Files. Restore
            is otherwise several screens and a Profile sheet away, behind a
            first check-in that would then sit beside the restored days as a
            duplicate of one of them. It belongs on the first screen a
            reinstall sees, and nowhere else: one line, no badge, invisible
            to anyone installing for the first time in any way that matters.

            The phone's own backup does NOT cover this case — iOS gives a
            reinstalled app an empty container and never consults it — so
            this line is the only way back for someone who has a file. */}
        {!review && step === PROMISE && onRestore && (
          <Press
            onPress={onRestore}
            pressOpacity={0.7}
            style={styles.linkBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Used Pattern before? Restore a saved copy"
          >
            <Text style={styles.linkText} allowFontScaling maxFontSizeMultiplier={1.3}>
              Used Pattern before? Restore a saved copy
            </Text>
          </Press>
        )}
      </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  /* the avoider owns nothing it can overwrite — see CheckinScreen */
  root: { flex: 1, backgroundColor: color.bgRoot },
  inner: { flex: 1, paddingHorizontal: size.pageX },
  header: { height: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerWelcome: { height: 30 },
  /* the target is 44 by at least 44, not the glyph; pulled left so the
     chevron lines up with the titles under it. White, like every button
     here — a hue on this screen would be a pain value. */
  back: {
    minHeight: 44, minWidth: 44, marginLeft: -8,
    alignItems: 'flex-start', justifyContent: 'center',
  },
  backText: { color: color.textPrimary },
  /* the bar is centred on the screen: the right margin balances the
     chevron's 44 on the left */
  progress: { flex: 1, flexDirection: 'row', gap: 6, marginRight: 44 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.borderControl },
  progressSegDone: { backgroundColor: color.textPrimary },
  body: { flexGrow: 1, paddingTop: 22, paddingBottom: 20 },
  marks: { flexDirection: 'row', gap: 6, marginTop: 24 },
  /* every painted square carries the white hairline, so the dark end of
     the ramp does not vanish into the black ground */
  mark: {
    width: 30, height: 30, borderRadius: 9, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.16)',
  },
  welcomeTitle: {
    color: color.textPrimary, fontSize: 40, fontWeight: '800',
    letterSpacing: -1.1, lineHeight: 42, marginTop: 28,
  },
  welcomeBody: {
    color: WELCOME_TEXT, fontSize: font.body, lineHeight: 25, marginTop: 14,
  },
  title: {
    color: color.textPrimary, fontSize: 32, fontWeight: '800',
    letterSpacing: -0.8, lineHeight: 35,
  },
  lede: { color: GREY_TEXT, fontSize: 16, lineHeight: 22, marginTop: 10 },
  group: {
    marginTop: 22, borderRadius: 16, borderCurve: 'continuous', overflow: 'hidden',
    backgroundColor: color.bgSurface,
  },
  groupRow: { flexDirection: 'row', gap: 12, paddingVertical: 14, paddingHorizontal: 16 },
  groupIcon: { marginTop: 1 },
  groupText: { flex: 1, gap: 3 },
  groupSep: {
    position: 'absolute', left: 16, right: 0, bottom: 0,
    height: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE,
  },
  cardTitle: { color: color.textPrimary, fontSize: 16, fontWeight: '600' },
  cardBody: { color: GREY_TEXT, fontSize: 14, lineHeight: 20 },
  tiles: { marginTop: 20, gap: 10 },
  tileRow: { flexDirection: 'row', gap: 10 },
  tileCell: { flex: 1 },
  tile: {
    minHeight: 64, borderRadius: 16, borderCurve: 'continuous',
    paddingHorizontal: 14, paddingVertical: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: color.bgSurface,
  },
  tileOn: { backgroundColor: color.textPrimary },
  tileText: { flex: 1, fontSize: 16, fontWeight: '600' },
  field: { marginTop: 20, gap: 8 },
  fieldLabel: { color: GREY_TEXT, fontSize: font.subheadline, fontWeight: '600' },
  seg: {
    flexDirection: 'row', gap: 2, padding: 3, minHeight: 40,
    borderRadius: 12, borderCurve: 'continuous', backgroundColor: color.bgSurface,
  },
  segInCard: { minHeight: 36, borderRadius: 10, backgroundColor: color.bgSegmentTrack },
  segCell: { flex: 1 },
  segBtn: {
    flex: 1, minHeight: 34, borderRadius: 9, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  segBtnInCard: { minHeight: 30, borderRadius: 8 },
  segBtnOn: { backgroundColor: SEG_ON },
  segText: { color: color.textPrimary, fontSize: 14, fontWeight: '500' },
  segTextOn: { fontWeight: '600' },
  /* every number on screen is set in SF Pro Rounded */
  segNum: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '500', fontFamily: 'ui-rounded' },
  segNumOn: { fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  chip: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 16,
    borderRadius: 22, borderCurve: 'continuous', backgroundColor: color.bgSurface,
  },
  chipOn: { backgroundColor: color.textPrimary },
  chipText: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  chipTextOn: { color: '#000000' },
  input: {
    color: color.textPrimary, borderRadius: 12, borderCurve: 'continuous',
    padding: 12, marginTop: 12, fontSize: font.body,
    backgroundColor: color.bgSurface,
  },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    minHeight: 55, paddingVertical: 10, paddingHorizontal: 16,
  },
  switchLabel: { flex: 1, color: color.textPrimary, fontSize: font.body, fontWeight: '500' },
  rowSep: { marginLeft: 52, height: StyleSheet.hairlineWidth, backgroundColor: HAIRLINE },
  timeBlock: { paddingTop: 12, paddingBottom: 14, paddingLeft: 52, paddingRight: 16, gap: 10 },
  timeHead: { flexDirection: 'row', alignItems: 'center' },
  timePill: {
    backgroundColor: color.bgSegmentTrack, borderRadius: 8, borderCurve: 'continuous',
    paddingVertical: 6, paddingHorizontal: 10,
  },
  timePillText: { color: color.textPrimary, fontSize: font.body, fontWeight: '700', fontFamily: 'ui-rounded' },
  note: { color: color.textPrimary, fontSize: font.footnote, lineHeight: 18, marginTop: 12, marginHorizontal: 4 },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 14, marginHorizontal: 4 },
  bottom: { flexShrink: 0, paddingTop: 10, gap: 6 },
  primary: {
    minHeight: 54, borderRadius: 27, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
    backgroundColor: color.textPrimary,
  },
  /* a skip is not a lesser button, only a quieter one: the same size,
     the same place, and it still records that the question was put */
  primarySkip: { backgroundColor: color.bgSurface },
  primaryText: { color: '#000000', fontSize: font.body, fontWeight: '600' },
  primaryTextSkip: { color: color.textPrimary },
  linkBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: GREY_TEXT, fontSize: font.subheadline },
});
