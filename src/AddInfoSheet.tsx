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
 *
 * THE CHECK-IN'S SHEET, SINCE THE OCTOBER REDESIGN (21 Oct 2026). Same
 * ground (#0E0E10), same grabber, same Cancel | title | Done bar, so the
 * two sheets read as one family. A chosen chip is WHITE WITH BLACK INK,
 * as on the onboarding steps. It used to wear the check-in's own pain
 * colour, which made a "burning" or a "left knee" look like a score —
 * a chip is a word the person marked, and only a pain value takes the
 * ramp. Every number is in the rounded face.
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
import { healthHintFor } from './health/context';
import { HealthDay } from './health/types';
import Icon from './Icon';
import { Num, summary } from './SummaryCard';
import {
  LOC_CHIP_IDS, LOC_NAMES, LOC_SECTIONS, Moment, QUALITYIDS, QUALITY_NAMES, SYMPTOMS_ASKED,
  SYMPTOM_NAMES, answerOf, collapseSidedLocs, defaultLocs, logsOf, minutesNow, todayISO,
} from './model';
import { color, font, size } from './theme';

/** the check-in sheet's ground (CheckinScreen's SHEET_BG): a step up
 *  from Today's black, so the sheet reads as lifted, and far under the
 *  #1C1C1E of a chip or a row */
const SHEET_BG = '#0E0E10';
/** the context pill's ink, a hair under white — a label, not a control */
const PILL_INK = '#EBEBF0';

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

  const [loc, setLoc] = useState<string[]>(moment && moment.loc ? moment.loc.slice() : []);
  const [quality, setQuality] = useState<string[]>(moment && moment.q ? moment.q.slice() : []);
  const [sym, setSym] = useState<string[]>(moment && moment.sym ? moment.sym.slice() : []);
  const [locExpanded, setLocExpanded] = useState(false);
  const [allWords, setAllWords] = useState(false);
  const [noteDraft, setNoteDraft] = useState(() => (entry && entry.note) || '');

  /* ── the day's questions ──────────────────────────────────
     How much pain limited the day, once, in the evening — the same
     window and the same once-a-day rule the check-in used to apply. Today only: a
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
    return ids;
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
    /* before any history, the places named at onboarding are the usual
       ones, so they lead — a tie at zero would otherwise fall back to
       the list's own order and bury them */
    const usual = prev.fromHistory ? [] : prev.ids;
    usual.forEach((id) => { locCount[id] = (locCount[id] || 0) + 0.5; });
    const rank = (ids: string[], counts: Record<string, number>) =>
      ids.slice().sort((a, b) => (counts[b] || 0) - (counts[a] || 0));
    return { loc: rank(LOC_CHIP_IDS, locCount), q: rank(QUALITYIDS, qCount) };
  }, []);

  /* collapsed: the six you use most, plus anything already chosen. The
     words always worked this way; the places did not, and fourteen
     place chips before the first question was answered made this the
     densest block in the app (the calm pass, 21 Oct 2026). Expanded
     keeps the collapsed chips where they were and adds the rest after
     them, so opening the list never moves a chip under a finger. */
  const topSix = (ids: string[], chosen: string[]) =>
    ids.slice(0, 6).concat(chosen.filter((id) => ids.indexOf(id) >= 6));
  /* the extras are the places the check-in already carried when the
     sheet opened, not the live selection: a chip picked from the full
     list must not jump up beside the six the moment it is tapped */
  const [openedLoc] = useState(loc);
  const shownPlaces = topSix(ranked.loc, openedLoc);
  const visiblePlaces = locExpanded
    ? shownPlaces.concat(ranked.loc.filter((id) => shownPlaces.indexOf(id) < 0))
    : shownPlaces;
  const visibleWords = allWords ? ranked.q : topSix(ranked.q, quality);

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
          /* white when chosen, black ink — never the ramp: see the header */
          style={[styles.chip, big && styles.chipBig, on && styles.chipOn]}
        >
          <Text
            allowFontScaling maxFontSizeMultiplier={1.4}
            style={[styles.chipText, on && styles.chipTextOn]}
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
          <Icon name="plus" size={15} color={summary.secondary} weight="semibold" />
          <Text style={styles.qNoteAddText}>Add a note</Text>
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
          <Num>{healthHintFor(m.id, healthToday) as string}</Num>
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
              {on && <Icon name="checkmark" size={16} color="#000000" weight="bold" />}
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
          {v == null ? 'Not answered' : <Num>{v + '/10'}</Num>}
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
          <Text style={styles.endText} maxFontSizeMultiplier={1.3}>
            <Num>{(m.ends ? m.ends[0] : '0').toUpperCase()}</Num>
          </Text>
          <Text style={styles.endText} maxFontSizeMultiplier={1.3}>
            <Num>{(m.ends ? m.ends[1] : '10').toUpperCase()}</Num>
          </Text>
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
      {/* the grabber, drawn here as the check-in draws it: a React
          Native pageSheet does not ask UIKit for one */}
      <View style={styles.grabber} accessibilityElementsHidden importantForAccessibility="no" />
      <View style={styles.navBar}>
        <Press
          onPress={onClose}
          style={[styles.navBtn, styles.navLeft]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Text style={styles.navBtnText} maxFontSizeMultiplier={1.4}>Cancel</Text>
        </Press>
        {/* centred between two equal-width ends, so it sits on the
            sheet's centre rather than on what is left */}
        <Text style={styles.navTitle} numberOfLines={1} maxFontSizeMultiplier={1.4}>Add information</Text>
        <Press
          onPress={save}
          style={[styles.navBtn, styles.navRight]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Save and close"
        >
          <Text style={[styles.navBtnText, styles.navBtnStrong]} maxFontSizeMultiplier={1.4}>Done</Text>
        </Press>
      </View>

      {!entry ? (
        <View style={styles.body}>
          <Text style={styles.lead} allowFontScaling maxFontSizeMultiplier={1.4}>
            Information goes with a check-in, and there isn’t one on this day to
            add it to.
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
          {/* as a pill, the check-in sheet's context pill: a label, not a
              control */}
          <View style={styles.about}>
            <Icon name="clock.fill" size={13} color={PILL_INK} />
            <Text style={styles.aboutText} allowFontScaling maxFontSizeMultiplier={1.4}>
              <Num>
                {moment
                  ? 'About the ' + fmtClock(moment.h) + ' check-in'
                    + (isToday ? '' : ' on ' + fmtDay(dateIso))
                  : isToday ? 'About today' : 'About ' + fmtDay(dateIso)}
              </Num>
            </Text>
          </View>

          {moment && (
            <>
              {/* ── where ─────────────────────────────────────
                  Six main places, your usual ones first. "Show every
                  place" ADDS the other main places after them and the
                  sided vocabulary below in anatomical sections; the six
                  stay put, because more precision must never rearrange
                  what is already on screen. Both levels share one
                  selection. */}
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
                    <Icon name="arrow.uturn.backward" size={14} color={summary.text} weight="semibold" />
                    <Text style={styles.sameAsText} allowFontScaling maxFontSizeMultiplier={1.3}>
                      {prev.fromHistory ? 'Same as last time' : 'Your usual places'}
                    </Text>
                  </Press>
                )}
                <View style={styles.chipCloud}>
                  {chipRow(visiblePlaces, LOC_NAMES, loc, setLoc)}
                </View>
                {!locExpanded ? (
                  <Press
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setLocExpanded(true); }}
                    style={styles.more}
                    pressOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel="Show every place, left and right, in sections"
                  >
                    <Text style={styles.moreText}>Show every place</Text>
                    <Icon name="chevron.down" size={12} color={summary.secondary} weight="semibold" />
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
                    <Text style={styles.moreText}>Show every word</Text>
                    <Icon name="chevron.down" size={12} color={summary.secondary} weight="semibold" />
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
                  Also at the time
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
            const m = getMetric(id);
            if (!m) return null;
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
            {/* one sentence, down from three (the calm pass, 21 Oct
                2026); the three promises in it are the ones that matter */}
            <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
              Stays on this iPhone, is never analysed, and goes into the PDF only if you choose.
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
              <Icon name="flame.fill" size={18} color={summary.text} />
              <Text style={styles.eventLink} allowFontScaling maxFontSizeMultiplier={1.3}>
                Something happened? Log a flare or treatment
              </Text>
              <Icon name="chevron.right" size={14} color={summary.chevron} weight="semibold" />
            </Press>
          )}

          {/* one sentence, down from two (the calm pass, 21 Oct 2026),
              keeping both promises: a pain-only entry is never
              incomplete, and what is marked here is an attribution, never
              a finding (AGENTS.md) */}
          <Text style={styles.fine} allowFontScaling maxFontSizeMultiplier={1.4}>
            All optional — a check-in with the number alone is complete, and what you mark is never read as a cause.
          </Text>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SHEET_BG },
  grabber: {
    width: 36, height: 5, borderRadius: 3, alignSelf: 'center', marginTop: 8,
    backgroundColor: color.borderControl,
  },
  /* the check-in's bar: no rule under it — the sheet's ground is the
     bar's ground, as in Health's own entry sheets */
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: size.pageX, marginTop: 4,
  },
  navTitle: {
    flex: 1, flexShrink: 1, textAlign: 'center', color: color.textPrimary,
    fontSize: font.body, fontWeight: '600',
  },
  navBtn: { minWidth: 72, minHeight: 44, justifyContent: 'center' },
  navLeft: { alignItems: 'flex-start' },
  navRight: { alignItems: 'flex-end' },
  navBtnText: { color: color.tint, fontSize: font.body },
  navBtnStrong: { fontWeight: '600' },
  body: { paddingHorizontal: size.pageX, paddingTop: 16, paddingBottom: 60 },
  about: {
    alignSelf: 'flex-start', maxWidth: '100%',
    minHeight: 28, paddingHorizontal: 12, borderRadius: 14, borderCurve: 'continuous',
    backgroundColor: summary.surface, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  aboutText: { flexShrink: 1, color: PILL_INK, fontSize: font.footnote, fontWeight: '600' },
  lead: { color: color.textPrimary, fontSize: font.subheadline, lineHeight: 21, marginTop: 8 },
  /* the sections stand apart by air, not by rules: five optional things
     read as five because each starts with its own question */
  section: { paddingTop: 28, gap: 12 },
  /* each section opens on a question — the check-in's question weight,
     a size down, since this sheet asks several */
  sectionTitle: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700', letterSpacing: -0.3, lineHeight: 25,
  },
  subTitle: {
    color: summary.secondary, fontSize: font.footnote, fontWeight: '600',
    marginTop: 14, marginBottom: 10,
  },
  /* the onboarding chips, to the pixel: #1C1C1E, a 44pt capsule, white
     with black ink once chosen */
  chipCloud: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44, justifyContent: 'center', paddingHorizontal: 16,
    borderRadius: 22, borderCurve: 'continuous', backgroundColor: summary.surface,
  },
  /* the symptoms are 48 because the hands tapping them are the ones
     that hurt */
  chipBig: { minHeight: 48, borderRadius: 24 },
  chipOn: { backgroundColor: color.textPrimary },
  chipText: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
  chipTextOn: { color: '#000000' },
  more: {
    minHeight: 40, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  moreText: { color: summary.secondary, fontSize: font.subheadline, fontWeight: '500' },
  /* the shortcut, a secondary capsule rather than a chip: it is an
     action on the chips below, not one of them */
  sameAs: {
    alignSelf: 'flex-start', minHeight: 38, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 19, borderCurve: 'continuous', backgroundColor: color.bgSegmentTrack,
  },
  sameAsText: { color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
  /* the day's questions */
  qHealth: {
    color: summary.secondary, fontSize: font.footnote, lineHeight: 18, marginTop: -4,
    fontVariant: ['tabular-nums'],
  },
  qValue: {
    color: summary.secondary, fontSize: font.subheadline, fontWeight: '600',
    fontVariant: ['tabular-nums'], marginTop: -4,
  },
  /* the levels, one full-width row each, white once chosen — the chip's
     selected state at row width */
  options: { gap: 8 },
  optRow: {
    minHeight: 52, borderRadius: summary.radius, borderCurve: 'continuous',
    paddingHorizontal: 16, paddingVertical: 13,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: summary.surface,
  },
  optText: { flex: 1, color: color.textPrimary, fontSize: font.body, fontWeight: '600', lineHeight: 21 },
  optRowOn: { backgroundColor: color.textPrimary },
  optTextOn: { color: '#000000' },
  qNoteAdd: { alignSelf: 'flex-start', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 5 },
  qNoteAddText: { color: summary.secondary, fontSize: font.subheadline, fontWeight: '500' },
  ends: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2, paddingHorizontal: 6 },
  /* the check-in's anchors: small caps in the grey that says "about the
     control", numbers rounded */
  endText: { color: summary.tertiary, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  /* the field reads at body size: this is the place in the app the
     person writes a sentence rather than picks an answer */
  input: {
    color: color.textPrimary, fontSize: font.body, lineHeight: 24,
    minHeight: 58, textAlignVertical: 'top',
    borderRadius: summary.radius, borderCurve: 'continuous',
    backgroundColor: summary.surface,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  noteInput: { minHeight: 110 },
  fine: { color: summary.tertiary, fontSize: font.footnote, lineHeight: 18, marginTop: 8 },
  /* the door to the event sheet, as a grouped row: icon, words, chevron */
  eventRow: {
    minHeight: 54, marginTop: 28, paddingHorizontal: 16, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: summary.radius, borderCurve: 'continuous', backgroundColor: summary.surface,
  },
  eventLink: { flex: 1, color: color.tint, fontSize: font.subheadline, fontWeight: '600' },
});
