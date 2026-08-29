/**
 * The body map — "where does it hurt", answered by touching a body.
 *
 * A flat figure, front and back, built from the app's own rounded-square
 * vocabulary rather than a shaded mannequin — because this is an INPUT
 * for a closed vocabulary, not a drawing surface. Every touchable region
 * maps to one of the fourteen location ids the record has always stored,
 * so storage, backups, the report's frequencies and the three answer
 * states are byte-identical to the chip screen this replaces. The paper
 * pain drawing clinicians have used for fifty years is front/back and
 * flat; so is this.
 *
 * A region lights in THE CHECK-IN'S OWN pain colour — the intensity
 * chosen one step earlier. Colour means pain here as everywhere; the map
 * only ever answers where. Per-region intensities are deliberately not a
 * thing: they would be a second data model wearing a brush.
 *
 * Bilateral parts (arms, legs, shoulders…) are two touch targets writing
 * ONE id, because the vocabulary does not split sides yet. VoiceOver
 * reads each target by its side and name and announces selection — a
 * paint canvas can never say "left shoulder, selected", and that is the
 * deciding argument for regions over pixels.
 */
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LOC_NAMES } from './model';
import { color, font } from './theme';

/* Regions in a 100 × 200 design space, symmetric about x = 50. The 2pt
   gutters between blocks are what make the figure read as a segmented
   body — the same trick the calendar plays with day squares. */
interface Region {
  id: string;          // a LOC_NAMES id — several regions may share one
  side?: 'Left' | 'Right';
  x: number; y: number; w: number; h: number; r: number;
}

const SHARED: Region[] = [
  { id: 'head', x: 40, y: 2, w: 20, h: 19, r: 9 },
  { id: 'neck', x: 44.5, y: 22, w: 11, h: 6, r: 2.5 },
  { id: 'shoulders', side: 'Left', x: 22, y: 29, w: 17, h: 11, r: 4 },
  { id: 'shoulders', side: 'Right', x: 61, y: 29, w: 17, h: 11, r: 4 },
  { id: 'arms', side: 'Left', x: 13, y: 41, w: 11, h: 46, r: 5 },
  { id: 'arms', side: 'Right', x: 76, y: 41, w: 11, h: 46, r: 5 },
  { id: 'hands', side: 'Left', x: 11, y: 88, w: 12, h: 14, r: 5 },
  { id: 'hands', side: 'Right', x: 77, y: 88, w: 12, h: 14, r: 5 },
  { id: 'hips', x: 36, y: 75, w: 28, h: 16, r: 5 },
  { id: 'legs', side: 'Left', x: 36.5, y: 92, w: 12.5, h: 37, r: 5 },
  { id: 'legs', side: 'Right', x: 51, y: 92, w: 12.5, h: 37, r: 5 },
  { id: 'knees', side: 'Left', x: 36.5, y: 130, w: 12.5, h: 13, r: 5 },
  { id: 'knees', side: 'Right', x: 51, y: 130, w: 12.5, h: 13, r: 5 },
  { id: 'legs', side: 'Left', x: 36.5, y: 144, w: 12.5, h: 32, r: 5 },
  { id: 'legs', side: 'Right', x: 51, y: 144, w: 12.5, h: 32, r: 5 },
  { id: 'feet', side: 'Left', x: 33, y: 177, w: 16, h: 12, r: 5 },
  { id: 'feet', side: 'Right', x: 51, y: 177, w: 16, h: 12, r: 5 },
];

const FRONT: Region[] = SHARED.concat([
  { id: 'chest', x: 40, y: 29, w: 20, h: 23, r: 4 },
  { id: 'belly', x: 40, y: 53, w: 20, h: 21, r: 4 },
]);

const BACK: Region[] = SHARED.concat([
  { id: 'upperBack', x: 40, y: 29, w: 20, h: 23, r: 4 },
  { id: 'lowerBack', x: 40, y: 53, w: 20, h: 21, r: 4 },
]);

export interface BodyMapProps {
  selected: string[];
  onToggle: (id: string) => void;
  /** the check-in's pain colour — what a marked region wears */
  tint: string;
  /** legible ink on that colour, for the one control that carries words */
  ink: string;
  /** width the figure may use; height follows at 2× */
  width: number;
}

export default function BodyMap({ selected, onToggle, tint, ink, width }: BodyMapProps) {
  /* Front/back as a toggle, not a rotation: two flat views ARE the
     clinical instrument, and a slider would be precision the record
     cannot store. Chest pain and back pain live on different sides,
     which is the whole reason two views exist. */
  const [view, setView] = useState<'front' | 'back'>('front');
  const k = width / 100;               // design units → points
  const regions = view === 'front' ? FRONT : BACK;

  const tap = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    onToggle(id);
  };

  return (
    <View>
      <View style={styles.viewSwitch}>
        {(['front', 'back'] as const).map((v) => {
          const on = view === v;
          return (
            <Pressable
              key={v}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setView(v); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={v === 'front' ? 'Front of the body' : 'Back of the body'}
              style={({ pressed }) => [
                styles.viewItem, on && styles.viewItemOn, pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={[styles.viewText, on && styles.viewTextOn]}
                allowFontScaling maxFontSizeMultiplier={1.3}>
                {v === 'front' ? 'Front' : 'Back'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ width, height: 200 * k, alignSelf: 'center' }}>
        {regions.map((rg, i) => {
          const on = selected.indexOf(rg.id) >= 0;
          return (
            <Pressable
              key={rg.id + (rg.side || '') + i}
              onPress={() => tap(rg.id)}
              hitSlop={2}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={(rg.side ? rg.side + ' ' : '') + (LOC_NAMES[rg.id] || rg.id)}
              accessibilityHint={on ? 'Removes this area' : 'Marks this area'}
              style={({ pressed }) => [
                {
                  position: 'absolute',
                  left: rg.x * k, top: rg.y * k,
                  width: rg.w * k, height: rg.h * k,
                  borderRadius: rg.r * k, borderCurve: 'continuous',
                },
                on
                  ? { backgroundColor: tint, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)' }
                  : {
                      backgroundColor: color.bgSurface,
                      borderWidth: 1, borderColor: color.borderControl,
                    },
                pressed && { opacity: 0.7 },
              ]}
            />
          );
        })}
      </View>

      {/* the one place with no place — a real answer, and its own control
          rather than a fifteenth patch of body */}
      <Pressable
        onPress={() => tap('allOver')}
        accessibilityRole="button"
        accessibilityState={{ selected: selected.indexOf('allOver') >= 0 }}
        accessibilityLabel="All over"
        style={({ pressed }) => [
          styles.allOver,
          selected.indexOf('allOver') >= 0 && {
            backgroundColor: tint, borderColor: 'rgba(255,255,255,0.35)',
          },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Text
          style={[
            styles.allOverText,
            selected.indexOf('allOver') >= 0 && { color: ink, fontWeight: '700' as const },
          ]}
          allowFontScaling maxFontSizeMultiplier={1.3}
        >
          All over
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  viewSwitch: {
    flexDirection: 'row', alignSelf: 'center', marginBottom: 14,
    backgroundColor: color.bgSegmentTrack, borderRadius: 11, borderCurve: 'continuous',
    padding: 2,
  },
  viewItem: {
    minWidth: 86, minHeight: 34, alignItems: 'center', justifyContent: 'center',
    borderRadius: 9, borderCurve: 'continuous', paddingHorizontal: 14,
  },
  viewItemOn: { backgroundColor: color.bgSegmentActive },
  viewText: { color: color.textSecondary, fontSize: font.subheadline, fontWeight: '600' },
  viewTextOn: { color: color.textPrimary },
  allOver: {
    alignSelf: 'center', marginTop: 16, minHeight: 40,
    paddingHorizontal: 18, justifyContent: 'center',
    borderRadius: 20, borderCurve: 'continuous',
    borderWidth: 1, borderColor: color.borderControl, backgroundColor: color.bgSurface,
  },
  allOverText: { color: color.textPrimary, fontSize: font.subheadline, fontWeight: '600' },
});
