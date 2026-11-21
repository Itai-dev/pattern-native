/**
 * The moment a medal is earned — a sheet over Today, once per medal.
 *
 * EARNED BY THE SESSION, NOT BY HOW IT FELT. It appears when the record
 * shows the thing was done (a session synced from Health, a report
 * made), whether or not any check-in was answered, and says so in its
 * last line. It never appears for a check-in: a check-in is not an
 * achievement, and a sheet after one would reward looking at pain.
 *
 * ONCE, AND QUIETLY. One sheet per open at most, newest medal first;
 * closing it marks every medal earned so far as seen, so a person who
 * comes back after a fortnight gets one moment, not a queue. The first
 * run after this shipped shows nothing at all (coach.ts,
 * unseenAchievement) — months of record are not a pile of surprises.
 *
 * TOMO PASS, 21 NOV 2026: no "NEW ACHIEVEMENT" kicker over the title —
 * the medal says it, and VoiceOver hears it in the title's label. The
 * "not by how it felt" line stays: it is the sentence that says what
 * the medal does not mean.
 */
import React, { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import Icon from './Icon';
import * as Haptics from 'expo-haptics';
import { Press, useReduceMotion } from './motion';
import Medal from './Medal';
import { Achievement, Roadmap } from './coach';

export interface UnlockSheetProps {
  a: Achievement | null;
  activity: string | null;
  roadmap: Roadmap | null;
  onClose: () => void;
  onOpenRoadmap: () => void;
}

export default function UnlockSheet({ a, activity, roadmap, onClose, onOpenRoadmap }: UnlockSheetProps) {
  const rm = useReduceMotion();
  const scale = useSharedValue(rm ? 1 : 0.6);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  useEffect(() => {
    if (!a) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (rm) { scale.value = 1; return; }
    scale.value = 0.6;
    scale.value = withDelay(160, withSpring(1, { damping: 11, stiffness: 160 }));
  }, [a && a.id, rm]);

  const now = roadmap ? roadmap.stages.filter((s) => s.state === 'now')[0] : null;
  return (
    <Modal visible={!!a} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.scrim} />
      {a && (
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Animated.View style={[{ marginTop: 26 }, style]}>
            <Medal a={a} size={148} activity={activity} />
          </Animated.View>
          <Text style={styles.title} accessibilityRole="header" accessibilityLabel={'New achievement: ' + a.title}
            maxFontSizeMultiplier={1.3}>{a.title}</Text>
          <Text style={styles.body} maxFontSizeMultiplier={1.4}>{a.body}</Text>
          {now && (
            <Press style={styles.next} onPress={onOpenRoadmap} accessibilityRole="button"
              accessibilityLabel={'Next stage: ' + now.title}>
              <Icon name="flag.fill" size={20} />
              <View style={{ flex: 1 }}>
                <Text style={styles.nextLabel}>Next stage</Text>
                <Text style={styles.nextTitle}>{now.title}</Text>
              </View>
              <Icon name="chevron.right" size={14} color="#636366" weight="bold" />
            </Press>
          )}
          <Text style={styles.fine} maxFontSizeMultiplier={1.4}>Earned by what you did, not how it felt.</Text>
          <Press style={styles.primary} onPress={onClose} accessibilityRole="button" accessibilityLabel="Done">
            <Text style={styles.primaryText}>Done</Text>
          </Press>
        </View>
      )}
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#25221E',
    borderTopLeftRadius: 32, borderTopRightRadius: 32, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40,
    alignItems: 'center',
  },
  grabber: { width: 36, height: 5, borderRadius: 3, backgroundColor: '#4A443C' },
  title: { marginTop: 22, color: '#EDE6DA', fontSize: 26, fontFamily: 'ui-rounded', fontWeight: '600', letterSpacing: 0, textAlign: 'center' },
  body: { marginTop: 8, color: '#CFC7BA', fontSize: 16, lineHeight: 23, textAlign: 'center' },
  next: {
    marginTop: 22, alignSelf: 'stretch', backgroundColor: '#2E2A25', borderRadius: 16,
    paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  nextLabel: { color: '#A79E90', fontSize: 13, fontWeight: '600' },
  nextTitle: { color: '#EDE6DA', fontSize: 16, fontWeight: '600' },
  fine: { marginTop: 10, color: '#8A8276', fontSize: 13 },
  primary: {
    alignSelf: 'stretch', height: 54, borderRadius: 27, backgroundColor: '#9DB38A',
    alignItems: 'center', justifyContent: 'center', marginTop: 20,
  },
  primaryText: { color: '#1C1A17', fontSize: 17, fontWeight: '600' },
});
