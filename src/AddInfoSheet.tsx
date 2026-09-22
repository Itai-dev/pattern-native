/**
 * Add information — everything a check-in used to ask after the number,
 * as one sheet over Today.
 *
 * The check-in is one question now (CheckinScreen). What it used to go
 * on to ask — where it hurts, how it feels, what else is going on, the
 * evening's questions — was never mandatory and was always about a day
 * that already had a number. So it lives here, one tap from the card
 * that shows that number, and it is offered in the card's own words:
 * "Add information". The note that used to have this row to itself is
 * the last section; it was never the only thing worth adding.
 *
 * WHICH CHECK-IN THE ANSWERS ATTACH TO. Where, the words and the
 * symptoms are recorded PER MOMENT, and the sheet says which moment at
 * the top: the one it was opened on (a tapped dot on the day page), or
 * the day's latest, which is the one Today's card is about. The day's
 * questions and the note are the day's, whichever moment is showing.
 *
 * THREE STATES, KEPT. Done with nothing tapped under Where is "asked,
 * nothing picked" — the sheet was on screen and the question was put —
 * and the moment says so (locAsked, qAsked, symAsked), exactly as the
 * old screens did. The day's questions are the exception: a question
 * left alone here is NOT recorded as declined. The old flow put it on
 * a screen the person was walking through; this sheet is opened for
 * whatever they came to add, and a person who came to say "left knee"
 * has not declined to say how much the day was limited. Their evening
 * question stays due, and the sheet asks it again next time.
 *
 * Drafted apart from storage, written on Done — Cancel is a real cancel,
 * the rule every sheet in this app follows. Read by nothing: the chips
 * are shown back as what was marked, never fed to the engine
 * (attributions are not findings), and the note reaches the PDF only
 * when the share asks.
 */
import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as db from './db';
import Slider from './Slider';
import { Press } from './motion';
import { track } from './analytics';
import { fmtDay } from './DayScreen';
import { fmtClock } from './clock';
import { LIMITATION_ID, MetricDef, eligibleNow, getMetric } from './metrics';
import { EXPERIMENT_METRIC_ID, experimentQuestion } from './experiment';
import { healthHintFor } from './health/context';
import { HealthDay } from './health/types';
import { inkOn, painColor } from './painScale';
import {
  LOC_CHIP_IDS, LOC_NAMES, LOC_SECTIONS, Moment, QUALITYIDS, QUALITY_NAMES, SYMPTOMS_ASKED,
  SYMPTOM_NAMES, answerOf, collapseSidedLocs, defaultLocs, logsOf, minutesNow, todayISO,
} from './model';
import { color, font, radius, size } from './theme';

export interface AddInfoSheetProps {
  dateIso: string;
  /** the moment the per-check-in answers attach to, by its minute.
   *  Absent = the day's latest, which is the one Today's card shows. */
  h?: number;
  /** saved — the caller re-reads the record and closes */
  onDone: () => void;
  onClose: () => void;
  /** "something happened": close this sheet and open the flare-or-
   *  treatment sheet in its place. Absent = the door is not offered. */
  onEvent?: () => void;
}

export default function AddInfoSheet({ dateIso, h, onDone, onClose, onEvent }: AddInfoSheetProps) {
  /* read once, at open: the record does not change under a sheet, and a
     moment that moved mid-draft would be the wrong kind of surprise */
  const [entry] = useState(() => db.getDay(dateIso));
  const [moment] = useState<Moment | null>(() => {
    const logs = logsOf(entry).slice().sort((a, b) => b.h - a.h);
    if (h !== undefined) return logs.filter((l) => l.h === h)[0] || null;
    return logs[0] || null;
  });
  const isToday = dateIso === todayISO();
  const pain = moment ? moment.pain : 5;

  const [loc, setLoc] = useState<string[]>(moment && moment.loc ? moment.loc.slice() : []);
  const [quality, setQuality] = useState<string[]>(moment && moment.q ? moment.q.slice() : []);
  const [sym, setSym] = useState<string[]>(moment && moment.sym ? moment.sym.slice() : []);
  const [locExpanded, setLocExpanded] = useState(false);
  const [allWords, setAllWords] = useState(false);
  const [noteDraft, setNoteDraft] = useState(() => (entry && entry.note) || '');

  /* ── the day's questions ──────────────────────────────────
     How much pain limited the day, once, in the evening, and the
     experiment's question while one runs — the same windows and the
     same once-a-day rule the check-in used to apply. Today only: a
     remembered attribution is recall bias invited into the one place
     it hurts most, so a past day's sheet asks nothing about the day. */
  const [askIds] = useState<string[]>(() => {
    if (!isToday) return [];
    const now = minutesNow();
    const ids: string[] = [];
    const m = getMetric(LIMITATION_ID);
    if (m && eligibleNow(m.eligibility, now, false, answerOf(entry, LIMITATION_ID) != null)) {
      ids.push(LIMITATION_ID);
    }
    const x = getMetric(EXPERIMENT_METRIC_ID);
    if (x && db.getExperiment() && eligibleNow(x.eligibility, now, false,
      answerOf(entry, EXPERIMENT_METRIC_ID) != null)) ids.push(EXPERIMENT_METRIC_ID);
    return ids;
  });
  /* the phrase the experiment's question wears */
  const [experimentWhat] = useState<string | null>(() => {
    const e = db.getExperiment();
    return e ? experimentQuestion(e) : null;
  });
  /* what Health already has for today — a hint above a question, never
     an answer to it */
  const [healthToday] = useState<HealthDay | null>(() => db.getHealthDay<HealthDay>(dateIso));
  /* answers held in memory until Done, so backing out records nothing */
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState<Record<string, boolean>>({});

  /* The offer's SOURCE decides its words. History says "same as last
     time"; before any history exists, the places named at onboarding
     stand in, and the pill says "your usual places" instead — there is
     no last time to be the same as, and a pill should not claim one. */
  const [prev] = useState<{ ids: string[]; fromHistory: boolean }>(() => {
    const fromLogs = collapseSidedLocs(defaultLocs(db.getAll(), dateIso));
    if (fromLogs.length) return { ids: fromLogs, fromHistory: true };
    return { ids: db.getPref<string[]>('onboard.loc.v1', []), fromHistory: false };
  });

  /* chips in personal order: what you actually pick floats to the front.
     Only the COLLAPSED where view ranks; the expanded sections stay
     anatomical — a body does not reorder itself by frequency of
     complaint. */
  const ranked = useMemo(() => {
    const locCount: Record<string, number> = {};
    const qCount: Record<string, number> = {};
    const all = db.getAll();
    Object.keys(all).forEach((k) => (all[k].logs || []).forEach((l) => {
      collapseSidedLocs(l.loc || []).forEach((id) => { locCount[id] = (locCount[id] || 0) + 1; });
      (l.q || []).forEach((id) => { qCount[id] = (qCount[id] || 0) + 1; });
    }));
    const rank = (ids: string[], counts: Record<string, number>) =>
      ids.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    return { loc: rank(LOC_CHIP_IDS, locCount), q: rank(QUALITYIDS, qCount) };
  }, []);

  /* collapsed words: the six you use most, plus anything already chosen */
  const visibleWords = allWords ? ranked.q
    : ranked.q.slice(0, 6).concat(quality.filter((id) => ranked.q.slice(0, 6).indexOf(id) < 0));

  const save = () => {
    if (moment) {
      /* the stamps the moment already carries stay its own — this is
         information added to a check-in, not a new check-in */
      db.writeMoment(dateIso, moment.h, moment.pain, loc, quality, {
        ...(moment.ts !== undefined ? { ts: moment.ts } : {}),
        ...(moment.tz !== undefined ? { tz: moment.tz } : {}),
        ...(moment.sv !== undefined ? { sv: moment.sv } : {}),
        locAsked: true, qAsked: true, sym,
      });
    }
    /* only the answers actually given — see the header for why a
       question left alone here is not a decline */
    askIds.forEach((id) => {
      const v = answers[id];
      if (v !== undefined) db.setAnswer(dateIso, id, v, minutesNow(), null, notes[id]);
    });
    if (entry && noteDraft.trim() !== (entry.note || '')) db.setNote(dateIso, noteDraft.trim());
    /* that information was added, never what */
    track('info_added');
    onDone();
  };

  const chipRow = (
    ids: string[], names: Record<string, string>,
    chosen: string[], setChosen: (v: string[]) => void, big?: boolean
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
            styles.chip, big && styles.chipBig,
            on
              /* a chosen chip wears the check-in's own pain colour — it
                 belongs to that moment; the border keeps a selected chip
                 visible when a low value paints it nearly black */
              ? { backgroundColor: painColor(pain), borderColor: 'rgba(255,255,255,0.3)' }
              : { backgroundColor: color.bgSurface, borderColor: color.borderDivider },
          ]}
        >
          <Text
            allowFontScaling maxFontSizeMultiplier={1.4}
            style={[styles.chipText, on && { color: inkOn(pain) }]}
          >
            {names[id] || id}
          </Text>
        </Press>
      );
    });

  /* ── one of the day's questions ─────────────────────────── */

  /** a place to say it in your own words, collapsed until asked for —
   *  a text field under every question turns a sheet into a form */
  const noteRow = (m: MetricDef) => {
    const open = noteOpen[m.id] || !!notes[m.id];
    if (!open) {
      return (
        <Press
          onPress={() => setNoteOpen((o) => ({ ...o, [m.id]: true }))}
          pressOpacity={0.7}
          style={styles.qNoteAdd}
          accessibilityRole="button"
          accessibilityLabel={'Add a note about: ' + m.name}
        >
          <Text style={styles.qNoteAddText}>+ Add a note</Text>
        </Press>
      );
    }
    return (
      <TextInput
        value={notes[m.id] || ''}
        onChangeText={(t) => setNotes((n) => ({ ...n, [m.id]: t }))}
        placeholder={m.notePlaceholder || 'In your own words — optional'}
        placeholderTextColor={color.textTertiary}
        style={styles.input}
        multiline
        maxLength={280}
        accessibilityLabel={'Note about: ' + m.name}
      />
    );
  };

  /** the levels, one full-width row each: three across truncated
   *  exactly where the meaning was */
  const ordinalRow = (m: MetricDef) => (
    <View key={m.id} style={styles.section}>
      <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
        {m.question}
      </Text>
      {!!healthHintFor(m.id, healthToday) && (
        <Text style={styles.qHealth} allowFontScaling maxFontSizeMultiplier={1.4}>
          {healthHintFor(m.id, healthToday)}
        </Text>
      )}
      <View style={styles.options}>
        {(m.levels || []).map((l) => {
          const on = answers[m.id] === l.id;
          return (
            <Pressable
              key={l.id}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setAnswers((a) => {
                  const next = { ...a };
                  if (on) delete next[m.id]; else next[m.id] = l.id;
                  return next;
                });
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={l.label}
              accessibilityHint={on ? 'Tap again to unselect' : undefined}
              style={({ pressed }) => [
                styles.optRow, on && styles.optRowOn, pressed && { opacity: 0.8 },
              ]}
            >
              <Text allowFontScaling maxFontSizeMultiplier={1.4}
                style={[styles.optText, on && styles.optTextOn]}>
                {l.label}
              </Text>
              {on && <Text style={styles.optCheck} allowFontScaling={false}>✓</Text>}
            </Pressable>
          );
        })}
      </View>
      {noteRow(m)}
    </View>
  );

  const numericRow = (m: MetricDef) => {
    const v = typeof answers[m.id] === 'number' ? (answers[m.id] as number) : null;
    return (
      <View key={m.id} style={styles.section}>
        <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
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
        {noteRow(m)}
      </View>
    );
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
        <Text style={styles.navTitle} numberOfLines={1}>Add information</Text>
        <Press
          onPress={save}
          style={styles.navBtn}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Save and close"
        >
          <Text style={[styles.navBtnText, styles.navBtnStrong]}>Done</Text>
        </Press>
      </View>

      {!entry ? (
        <View style={styles.body}>
          <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.4}>
            Information goes with a day’s check-ins. Check in first, then there is
            something to add to.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* which check-in the chips below belong to — said once, at
              the top, so an answer about "where" is never ambiguous
              about when */}
          <Text style={styles.about} allowFontScaling maxFontSizeMultiplier={1.4}>
            {moment
              ? 'About the ' + fmtClock(moment.h) + ' check-in'
                + (isToday ? '' : ' on ' + fmtDay(dateIso))
              : isToday ? 'About today' : 'About ' + fmtDay(dateIso)}
          </Text>

          {moment && (
            <>
              {/* ── where ─────────────────────────────────────
                  The main places, your usual ones first. "Show every
                  place" ADDS the sided vocabulary below in anatomical
                  sections; the main chips stay put, because more
                  precision must never rearrange what is already on
                  screen. Both levels share one selection. */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                  Where in your body?
                </Text>
                {/* the shortcut, only while nothing is chosen: once you
                    have said where it hurts, an offer to overwrite that
                    with last time's answer is a trap, not a shortcut */}
                {prev.ids.length > 0 && loc.length === 0 && (
                  <Press
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setLoc(prev.ids.slice()); }}
                    pressOpacity={0.7}
                    style={styles.sameAs}
                    accessibilityRole="button"
                    accessibilityLabel={(prev.fromHistory ? 'Same as last time: ' : 'Your usual places: ')
                      + prev.ids.map((id) => LOC_NAMES[id] || id).join(', ')}
                  >
                    <Text style={styles.sameAsText} allowFontScaling maxFontSizeMultiplier={1.3}>
                      {prev.fromHistory ? 'Same as last time' : 'Your usual places'}
                    </Text>
                  </Press>
                )}
                <View style={styles.chipCloud}>
                  {chipRow(ranked.loc, LOC_NAMES, loc, setLoc)}
                </View>
                {!locExpanded ? (
                  <Press
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setLocExpanded(true); }}
                    style={styles.more}
                    pressOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Show every place, left and right, in sections"
                  >
                    <Text style={styles.moreText}>Show every place ›</Text>
                  </Press>
                ) : (
                  LOC_SECTIONS.map((sec) => (
                    <View key={sec.title}>
                      <Text style={styles.subTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                        {sec.title}
                      </Text>
                      <View style={styles.chipCloud}>
                        {chipRow(sec.ids, LOC_NAMES, loc, setLoc)}
                      </View>
                    </View>
                  ))
                )}
              </View>

              {/* ── how it feels ──────────────────────────────
                  The SOCRATES "Character" words. For chronic pain the
                  character is the stable part, so the thing the
                  question is for is the day the words CHANGE. */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                  How does it feel?
                </Text>
                <View style={styles.chipCloud}>
                  {chipRow(visibleWords, QUALITY_NAMES, quality, setQuality)}
                </View>
                {!allWords && (
                  <Press onPress={() => setAllWords(true)} style={styles.more} pressOpacity={0.7}
                    accessibilityRole="button" accessibilityLabel="Show every word">
                    <Text style={styles.moreText}>Show more ›</Text>
                  </Press>
                )}
              </View>

              {/* ── also right now ────────────────────────────
                  Fatigue, fog, stiffness: symptoms, not causes, and the
                  targets are 48pt because the hands doing the tapping
                  are the ones that hurt. A retired id the moment still
                  carries stays on screen — an edit must show what it is
                  about to keep. */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
                  Also right now
                </Text>
                <View style={styles.chipCloud}>
                  {chipRow(
                    SYMPTOMS_ASKED.concat(sym.filter((id) => SYMPTOMS_ASKED.indexOf(id) < 0)),
                    SYMPTOM_NAMES, sym, setSym, true
                  )}
                </View>
              </View>
            </>
          )}

          {askIds.map((id) => {
            const base = getMetric(id);
            if (!base) return null;
            /* the experiment's question is the person's own phrase —
               the registry's wording is the fallback it never shows */
            const m = id === EXPERIMENT_METRIC_ID && experimentWhat
              ? { ...base, question: experimentWhat } : base;
            return m.type === 'numeric' ? numericRow(m) : ordinalRow(m);
          })}

          {/* ── the note ──────────────────────────────────── */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle} allowFontScaling maxFontSizeMultiplier={1.4}>
              {isToday ? 'A note about today' : 'A note about this day'}
            </Text>
            <TextInput
              value={noteDraft}
              onChangeText={setNoteDraft}
              multiline
              placeholder="Anything about this day worth remembering"
              placeholderTextColor={color.textTertiary}
              style={[styles.input, styles.noteInput]}
              accessibilityLabel={isToday ? 'Note about today' : 'Note about this day'}
            />
            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              One note per day, in your words. Kept on this iPhone with the rest of
              your record. Never analysed — it goes into the PDF only if you say so
              when you share.
            </Text>
          </View>

          {/* the event door: a flare or a treatment is information about
              the day too, and its sheet is one tap from here */}
          {!!onEvent && (
            <Press
              onPress={() => { Haptics.selectionAsync().catch(() => {}); onEvent(); }}
              pressOpacity={0.7}
              style={styles.eventRow}
              accessibilityRole="button"
              accessibilityLabel="Something happened: log a flare or treatment"
              accessibilityHint="Closes this sheet and opens the flare or treatment questions"
            >
              <Text style={styles.eventLink} allowFontScaling maxFontSizeMultiplier={1.3}>
                Something happened? Log a flare or treatment ›
              </Text>
            </Press>
          )}

          <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
            All of this is optional. A check-in with the number alone is complete;
            what you add here is shown back as what you marked, never read as a cause.
          </Text>
        </ScrollView>
      )}
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
  body: { padding: size.sheetX, paddingTop: 18, paddingBottom: 60 },
  about: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600', marginBottom: 6,
  },
  lead: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21 },
  /* the sections, ruled off from each other so five optional things
     read as five */
  section: {
    paddingTop: 20, paddingBottom: 6, gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borderDivider,
  },
  sectionTitle: { color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 22 },
  subTitle: {
    color: color.textSecondary, fontSize: font.footnote, fontWeight: '600',
    marginTop: 14, marginBottom: 10,
  },
  chipCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  chip: { paddingVertical: 11, paddingHorizontal: 17, borderRadius: 22, borderCurve: 'continuous', borderWidth: 1 },
  chipBig: { minHeight: 48, justifyContent: 'center' },
  chipText: { color: '#D0D0D6', fontSize: font.subheadline, fontWeight: '500' },
  more: { paddingVertical: 8, alignSelf: 'flex-start' },
  moreText: { color: color.textTertiary, fontSize: font.subheadline },
  /* the shortcut, drawn as a quiet outlined pill rather than as a chip:
     it is an action on the chips below, not one of them */
  sameAs: {
    alignSelf: 'flex-start', minHeight: 38, justifyContent: 'center', paddingHorizontal: 16,
    borderRadius: 19, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
  },
  sameAsText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  /* the day's questions */
  qHealth: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 18, marginTop: -4,
    fontVariant: ['tabular-nums'],
  },
  qValue: {
    color: color.textSecondary, fontSize: font.subheadline, fontVariant: ['tabular-nums'], marginTop: -4,
  },
  options: { gap: 8 },
  optRow: {
    minHeight: 52, borderRadius: 14, borderCurve: 'continuous', paddingHorizontal: 15, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: color.bgSurface, borderWidth: 1, borderColor: color.borderDivider,
  },
  optText: { flex: 1, color: '#D0D0D6', fontSize: font.body, fontWeight: '600', lineHeight: 21 },
  optRowOn: { backgroundColor: color.textPrimary, borderColor: color.textPrimary },
  optTextOn: { color: '#000000' },
  optCheck: { color: '#000000', fontSize: 15, fontWeight: '700' },
  qNoteAdd: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center' },
  qNoteAddText: { color: color.textTertiary, fontSize: font.subheadline, fontWeight: '500' },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingHorizontal: 2 },
  endText: { color: color.textTertiary, fontSize: 11, fontWeight: '600', letterSpacing: 0.6 },
  /* the field reads at body size: this is the place in the app the
     person writes a sentence rather than picks an answer */
  input: {
    color: color.textPrimary, fontSize: font.body, lineHeight: 24,
    minHeight: 58, textAlignVertical: 'top',
    borderRadius: radius.button, borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth, borderColor: color.borderControl,
    backgroundColor: color.bgSurface,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  noteInput: { minHeight: 110 },
  fine: { color: color.textTertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 8 },
  eventRow: { minHeight: 48, justifyContent: 'center', marginTop: 14 },
  eventLink: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
});
