/**
 * The roadmap and the achievements — one sheet, two pages, opened from
 * the goal on Today (coach.ts holds the rules; this only draws them).
 *
 * THE ROADMAP IS A PATH, NOT A PERCENTAGE. Stages are a list with "you
 * are here", never a bar or a fraction: AGENTS.md has no completion
 * percentages, and a stage someone stays on for a month is not 60% of
 * anything. Holding and easing back are said as part of the plan.
 *
 * NO NUMBER IS A PAIN NUMBER. Minutes, counts and dates only, in white
 * and grey; the medals are grey-to-white materials (Medal.tsx). The
 * sentences about what this does not mean sit inside the sheet, under
 * the things they qualify.
 */
import React, { useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Press } from './motion';
import Medal from './Medal';
import {
  Achievement, COACH_NOTE, CoachView, MedalKind, ROADMAP_NOTE, Stage,
} from './coach';
import { color, font } from './theme';

const ROUND = 'ui-rounded';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "9 Sep" */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return d + ' ' + MONTHS[m - 1];
}

const ACTIVITY_ICON: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  running: 'run', walking: 'walk', cycling: 'bike', swimming: 'swim',
  'strength training': 'dumbbell', pilates: 'yoga',
};

const SECTIONS: { kind: MedalKind; title: string; aside?: string }[] = [
  { kind: 'roadmap', title: 'On your roadmap' },
  { kind: 'pacing', title: 'Pacing' },
  { kind: 'finding', title: 'Finding out' },
  { kind: 'time', title: 'Over time', aside: 'Nothing resets' },
];

export interface CoachScreenProps {
  view: CoachView;
  /** the goal's activity, for its glyph */
  activity: string | null;
  onClose: () => void;
  /** open where the goal is set, when there is none */
  onSetGoal?: () => void;
  /** the page to open on */
  start?: 'roadmap' | 'achievements';
}

export default function CoachScreen({ view, activity, onClose, onSetGoal, start }: CoachScreenProps) {
  const [page, setPage] = useState<'roadmap' | 'achievements'>(
    start || (view.roadmap ? 'roadmap' : 'achievements'));
  const [open, setOpen] = useState<Achievement | null>(null);

  const back = page === 'achievements' && view.roadmap;
  return (
    <View style={styles.root}>
      <View style={styles.navBar}>
        {back ? (
          <Press onPress={() => setPage('roadmap')} style={styles.navBack} hitSlop={10}
            accessibilityRole="button" accessibilityLabel="Back to roadmap">
            <Ionicons name="chevron-back" size={22} color={color.tint} />
            <Text style={styles.navBtnText}>Roadmap</Text>
          </Press>
        ) : <View style={styles.navSpacer} />}
        <Text style={styles.navTitle}>{page === 'roadmap' ? 'Roadmap' : 'Achievements'}</Text>
        <Press onPress={onClose} style={styles.navBtn} hitSlop={10}
          accessibilityRole="button" accessibilityLabel="Close">
          <Text style={styles.navBtnText}>Done</Text>
        </Press>
      </View>
      {page === 'roadmap' && view.roadmap
        ? <RoadmapPage view={view} activity={activity} onAchievements={() => setPage('achievements')} onChangeGoal={onSetGoal} />
        : <AchievementsPage view={view} activity={activity} onOpen={setOpen} onSetGoal={view.roadmap ? undefined : onSetGoal} />}
      <Detail a={open} activity={activity} onClose={() => setOpen(null)} />
    </View>
  );
}

/* ── the roadmap ─────────────────────────────────────────────── */

function stepLine(step: 'up' | 'hold' | 'ease'): string {
  if (step === 'hold') return 'Held at this length after a harder morning. Holding is part of the plan.';
  if (step === 'ease') return 'Eased back after harder mornings, to build up again from here.';
  return 'Each session grows by at most a tenth, and only after mornings that went fine.';
}

function RoadmapPage({ view, activity, onAchievements, onChangeGoal }: {
  view: CoachView; activity: string | null; onAchievements: () => void; onChangeGoal?: () => void;
}) {
  const r = view.roadmap!;
  const earned = view.achievements.filter((a) => a.earnedOn);
  const recent = earned.slice().sort((a, b) => (a.earnedOn! < b.earnedOn! ? 1 : -1)).slice(0, 3);
  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text style={styles.large} accessibilityRole="header" maxFontSizeMultiplier={1.3}>{r.title}</Text>

      <View style={[styles.card, { paddingBottom: 6 }]}>
        {r.stages.map((s, i) => (
          <StageRow key={s.id} s={s} last={i === r.stages.length - 1} activity={activity}
            next={s.state === 'now' ? r.next : null} />
        ))}
      </View>
      <Text style={styles.note} maxFontSizeMultiplier={1.4}>{ROADMAP_NOTE}</Text>

      <Press onPress={onAchievements} style={[styles.card, { marginTop: 22 }]}
        accessibilityRole="button" accessibilityLabel={'Achievements, ' + earned.length + ' earned'}>
        <View style={styles.head}>
          <Ionicons name="medal" size={18} color={color.textPrimary} />
          <Text style={styles.headLabel}>Achievements</Text>
          <Text style={styles.headMeta}>{earned.length} earned</Text>
          <Ionicons name="chevron-forward" size={16} color="#636366" />
        </View>
        {recent.length > 0 ? (
          <View style={styles.recentRow}>
            {recent.map((a) => (
              <View key={a.id} style={styles.recentItem}>
                <Medal a={a} size={60} activity={activity} />
                <Text style={styles.recentLabel} numberOfLines={2}>{a.title}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.cardLine}>Your first one comes with your first session.</Text>
        )}
        <Text style={styles.cardFine}>Earned by what you did, never by a pain number.</Text>
      </Press>
      {onChangeGoal && (
        <Press onPress={onChangeGoal} style={styles.changeGoal} accessibilityRole="button">
          <Text style={styles.navBtnText}>Change goal</Text>
        </Press>
      )}
    </ScrollView>
  );
}

function StageRow({ s, last, activity, next }: {
  s: Stage; last: boolean; activity: string | null; next: { minutes: number; band: string | null; step: 'up' | 'hold' | 'ease' } | null;
}) {
  const now = s.state === 'now';
  const done = s.state === 'done';
  const node = now ? 32 : 26;
  return (
    <View style={styles.stage}
      accessible accessibilityLabel={s.title + ', ' + (done ? 'reached ' + shortDate(s.reachedOn!) : now ? 'you are here' : 'not yet')}>
      <View style={styles.rail}>
        <View style={[styles.node, { width: node, height: node, borderRadius: node / 2 },
          done || now ? styles.nodeOn : styles.nodeOff]}>
          {done && <Ionicons name="checkmark-sharp" size={16} color="#000000" />}
          {now && <MaterialCommunityIcons name={(activity && ACTIVITY_ICON[activity]) || 'run'} size={18} color="#000000" />}
          {!done && !now && s.goal && <Ionicons name="flag" size={13} color="#8E8E93" />}
        </View>
        {!last && <View style={[styles.line, { backgroundColor: done ? '#FFFFFF' : '#3A3A3C' }]} />}
      </View>
      <View style={{ flex: 1, paddingTop: now ? 4 : 2, paddingBottom: last ? 12 : 20 }}>
        <Text style={[styles.stageTitle, now && styles.stageTitleNow, !done && !now && { color: color.textSecondary }]}
          maxFontSizeMultiplier={1.3}>{s.title}</Text>
        <Text style={styles.stageSub} maxFontSizeMultiplier={1.3}>
          {done && s.reachedOn ? 'Reached ' + shortDate(s.reachedOn) : s.sub}
        </Text>
        {now && (
          <View style={styles.nowPanel}>
            <Text style={styles.nowLabel}>You’re here · next session</Text>
            {next ? (
              <>
                <View style={styles.valueRow}>
                  <Text style={styles.nowValue} maxFontSizeMultiplier={1.2}>{next.minutes}</Text>
                  <Text style={styles.nowUnit} maxFontSizeMultiplier={1.2}>
                    min{next.band === 'easy' ? ' easy' : next.band === 'moderate' ? ' steady' : ''}
                  </Text>
                </View>
                <Text style={styles.nowLine} maxFontSizeMultiplier={1.4}>{stepLine(next.step)}</Text>
              </>
            ) : (
              <Text style={styles.nowLine} maxFontSizeMultiplier={1.4}>
                Still learning — a few more sessions with a morning check-in that day and the next.
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

/* ── the achievements ───────────────────────────────────────── */

function AchievementsPage({ view, activity, onOpen, onSetGoal }: {
  view: CoachView; activity: string | null; onOpen: (a: Achievement) => void; onSetGoal?: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
      <Text style={styles.large} accessibilityRole="header" maxFontSizeMultiplier={1.3}>Achievements</Text>
      <View style={styles.card}>
        <Text style={styles.cardLine} maxFontSizeMultiplier={1.4}>{COACH_NOTE}</Text>
      </View>
      {SECTIONS.map((sec) => {
        const items = view.achievements.filter((a) => a.kind === sec.kind);
        if (!items.length) {
          if (sec.kind !== 'roadmap' || !onSetGoal) return null;
          return (
            <View key={sec.kind}>
              <Text style={styles.section}>{sec.title}</Text>
              <Press onPress={onSetGoal} style={styles.card} accessibilityRole="button">
                <Text style={styles.cardLine}>Set what you are getting back to, and a roadmap toward it appears here.</Text>
              </Press>
            </View>
          );
        }
        return (
          <View key={sec.kind}>
            <View style={styles.sectionRow}>
              <Text style={styles.section}>{sec.title}</Text>
              {sec.aside && <Text style={styles.sectionAside}>{sec.aside}</Text>}
            </View>
            <View style={styles.grid}>
              {items.map((a) => (
                <Press key={a.id} onPress={() => onOpen(a)} style={styles.cell} pressScale={0.96}
                  accessibilityRole="button"
                  accessibilityLabel={a.title + (a.earnedOn ? ', earned ' + shortDate(a.earnedOn) : ', not yet')}>
                  <Medal a={a} size={84} activity={activity} />
                  <Text style={styles.cellTitle} numberOfLines={2} maxFontSizeMultiplier={1.3}>{a.title}</Text>
                  <Text style={[styles.cellDate, !a.earnedOn && { color: '#636366' }]} maxFontSizeMultiplier={1.3}>
                    {a.earnedOn ? shortDate(a.earnedOn) : 'Not yet'}
                  </Text>
                </Press>
              ))}
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Detail({ a, activity, onClose }: { a: Achievement | null; activity: string | null; onClose: () => void }) {
  return (
    <Modal visible={!!a} transparent animationType="slide" onRequestClose={onClose}>
      <Press style={styles.scrim} onPress={onClose} accessibilityLabel="Close" pressOpacity={1} />
      {a && (
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={{ marginTop: 22 }}><Medal a={a} size={128} activity={activity} /></View>
          <Text style={styles.sheetTitle} maxFontSizeMultiplier={1.3}>{a.title}</Text>
          <Text style={styles.sheetBody} maxFontSizeMultiplier={1.4}>{a.body}</Text>
          <Text style={styles.sheetStatus} maxFontSizeMultiplier={1.3}>
            {a.earnedOn ? 'Earned ' + shortDate(a.earnedOn) : 'Not yet' + (a.sofar ? ' · ' + a.sofar : '')}
          </Text>
          <Press style={styles.primary} onPress={() => { Haptics.selectionAsync().catch(() => {}); onClose(); }}
            accessibilityRole="button">
            <Text style={styles.primaryText}>Done</Text>
          </Press>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
  },
  navSpacer: { width: 96, minHeight: 44 },
  navBack: { width: 96, minHeight: 44, flexDirection: 'row', alignItems: 'center' },
  navTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600' },
  navBtn: { width: 96, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' },
  navBtnText: { color: color.tint, fontSize: font.body, fontWeight: '600' },
  body: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 48 },
  large: {
    color: color.textPrimary, fontSize: font.largeTitle, fontWeight: '700', letterSpacing: -0.7,
    marginHorizontal: 4, marginBottom: 16,
  },
  card: { backgroundColor: '#1C1C1E', borderRadius: 16, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headLabel: { color: color.textPrimary, fontSize: 15, fontWeight: '600', flex: 1 },
  headMeta: { color: '#98989F', fontSize: 15, fontFamily: ROUND, fontWeight: '600' },
  cardLine: { color: '#98989F', fontSize: 15, lineHeight: 21 },
  cardFine: { color: '#8E8E93', fontSize: 13, lineHeight: 18, marginTop: 12 },
  note: { color: '#8E8E93', fontSize: 13, lineHeight: 18, marginTop: 10, marginHorizontal: 4 },
  changeGoal: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 18 },
  recentRow: { flexDirection: 'row', gap: 14, marginTop: 12 },
  recentItem: { width: 76, alignItems: 'center', gap: 6 },
  recentLabel: { color: color.textPrimary, fontSize: 12, fontWeight: '600', textAlign: 'center' },

  stage: { flexDirection: 'row', gap: 14 },
  rail: { width: 32, alignItems: 'center' },
  node: { alignItems: 'center', justifyContent: 'center' },
  nodeOn: { backgroundColor: '#FFFFFF' },
  nodeOff: { backgroundColor: '#2C2C2E', borderWidth: 1.5, borderColor: '#3A3A3C' },
  line: { width: 3, flex: 1, minHeight: 22, borderRadius: 2, marginVertical: 4 },
  stageTitle: { color: color.textPrimary, fontSize: 17, fontWeight: '600', letterSpacing: -0.2 },
  stageTitleNow: { fontSize: 20, fontWeight: '700' },
  stageSub: { color: '#98989F', fontSize: 14, marginTop: 2, fontFamily: ROUND, fontWeight: '600' },
  nowPanel: { marginTop: 12, backgroundColor: '#2C2C2E', borderRadius: 14, padding: 14, gap: 6 },
  nowLabel: { color: '#98989F', fontSize: 13, fontWeight: '600' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  nowValue: { color: color.textPrimary, fontFamily: ROUND, fontWeight: '700', fontSize: 34, letterSpacing: -0.6 },
  nowUnit: { color: '#98989F', fontFamily: ROUND, fontWeight: '600', fontSize: 18 },
  nowLine: { color: '#C7C7CC', fontSize: 14, lineHeight: 20 },

  sectionRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  section: {
    color: color.textPrimary, fontSize: font.title3, fontWeight: '700', letterSpacing: -0.3,
    marginTop: 26, marginBottom: 12, marginHorizontal: 4,
  },
  sectionAside: { color: '#98989F', fontSize: 15 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 },
  cell: { width: '33.333%', alignItems: 'center', gap: 7, paddingHorizontal: 4 },
  cellTitle: { color: color.textPrimary, fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 16 },
  cellDate: { color: '#98989F', fontSize: 12, fontFamily: ROUND, fontWeight: '600' },

  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40,
    alignItems: 'center',
  },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#48484A' },
  sheetTitle: { color: color.textPrimary, fontSize: 24, fontWeight: '700', letterSpacing: -0.4, marginTop: 18, textAlign: 'center' },
  sheetBody: { color: '#C7C7CC', fontSize: 16, lineHeight: 23, marginTop: 8, textAlign: 'center' },
  sheetStatus: { color: '#98989F', fontSize: 15, marginTop: 10, fontFamily: ROUND, fontWeight: '600' },
  primary: {
    alignSelf: 'stretch', height: 54, borderRadius: 27, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  primaryText: { color: '#000000', fontSize: 17, fontWeight: '600' },
});

/* exported for the unlock sheet, so both draw the same type */
export const coachStyles = styles;
