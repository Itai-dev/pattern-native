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
import React, { useRef, useState } from 'react';
import {
  GestureResponderEvent, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { LOC_NAMES, readLocSelection } from './model';
import { color, font } from './theme';

/* The silhouette and these regions share ONE coordinate system: the
   100 × 200 design space tools/make-body.js renders assets/body.png
   from. Change the figure there and the numbers here, together — the
   generator's shapes are the source of truth for where anatomy is. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BODY = require('../assets/body.png');

interface Region {
  id: string;          // a LOC_NAMES id — several regions may share one
  side?: 'Left' | 'Right';
  x: number; y: number; w: number; h: number; r: number;
}

/* The sided, jointed vocabulary — "right wrist" is a place now. Left in
   these tables means the figure's anatomical left, which sits on the
   VIEWER'S right in the front view; the x-coordinates encode that, and
   the back view mirrors it (your left shoulder is on the image's left
   when the figure faces away). Small joints (wrist, ankle, elbow) lean
   on hitSlop — a sore wrist deserves a target bigger than a wrist. */
const mirrorX = (r: Omit<Region, 'id' | 'side'>) => ({ ...r, x: 100 - r.x - r.w });
const pairL = (idL: string, idR: string, r: Omit<Region, 'id' | 'side'>, front: boolean): Region[] => [
  /* front view: figure faces you, its left = your right side of image */
  { id: front ? idR : idL, side: front ? 'Right' : 'Left', ...r },
  { id: front ? idL : idR, side: front ? 'Left' : 'Right', ...mirrorX(r) },
];

function sideRegions(front: boolean): Region[] {
  const p = (l: string, r: string, box: Omit<Region, 'id' | 'side'>) => pairL(l, r, box, front);
  return ([] as Region[]).concat(
    p('shoulderL', 'shoulderR', { x: 28, y: 26.5, w: 16, h: 11, r: 5 }),
    p('armL', 'armR', { x: 22, y: 38, w: 11, h: 17, r: 5 }),
    p('elbowL', 'elbowR', { x: 21.5, y: 55, w: 11, h: 9, r: 4.5 }),
    p('forearmL', 'forearmR', { x: 21, y: 64, w: 11, h: 13, r: 4.5 }),
    p('wristL', 'wristR', { x: 20.5, y: 77, w: 10.5, h: 7, r: 3.5 }),
    p('handL', 'handR', { x: 18.5, y: 84, w: 11, h: 13, r: 5 }),
    p('hipL', 'hipR', { x: 35, y: 72, w: 15, h: 21, r: 7 }),
    p('thighL', 'thighR', { x: 36, y: 93, w: 13.5, h: 34, r: 6 }),
    p('kneeL', 'kneeR', { x: 37, y: 127, w: 12.5, h: 15, r: 6 }),
    p('calfL', 'calfR', { x: 38, y: 142, w: 11.5, h: 26, r: 5.5 }),
    p('ankleL', 'ankleR', { x: 38.5, y: 168, w: 11, h: 8, r: 4 }),
    p('footL', 'footR', { x: 34, y: 176, w: 15.5, h: 13, r: 6 }),
  );
}

const CENTRE: Region[] = [
  { id: 'head', x: 40, y: 1, w: 20, h: 20, r: 10 },
  { id: 'neck', x: 43, y: 20, w: 14, h: 8, r: 3.5 },
];

const FRONT: Region[] = CENTRE.concat(sideRegions(true), [
  { id: 'chest', x: 37.5, y: 36, w: 25, h: 20, r: 7 },
  { id: 'belly', x: 37.5, y: 56, w: 25, h: 17, r: 7 },
]);

const BACK: Region[] = CENTRE.concat(sideRegions(false), [
  { id: 'upperBack', x: 37.5, y: 36, w: 25, h: 20, r: 7 },
  { id: 'lowerBack', x: 37.5, y: 56, w: 25, h: 17, r: 7 },
]);

export interface BodyMapProps {
  selected: string[];
  onToggle: (id: string) => void;
  /** the check-in's pain colour — what a marked region wears */
  tint: string;
  /** legible ink on that colour, for the one control that carries words */
  ink: string;
  /** The space the step actually has. The figure sizes itself to fit —
   *  never taller than the box, never so wide the side gutters (which
   *  carry the words and the All-over control) fall under ~64pt. */
  containerWidth: number;
  containerHeight: number;
}

/** the words and controls beside the figure need at least this much */
const GUTTER_MIN = 64;

export default function BodyMap({
  selected, onToggle, tint, ink, containerWidth, containerHeight,
}: BodyMapProps) {
  /* Front/back as a toggle, not a rotation: two flat views ARE the
     clinical instrument, and a slider would be precision the record
     cannot store. Chest pain and back pain live on different sides,
     which is the whole reason two views exist. */
  const [view, setView] = useState<'front' | 'back'>('front');
  /* fit: the switch takes ~48pt of the height; the figure takes what
     is left, capped by the width the gutters can spare */
  const k = Math.max(1.5, Math.min(
    (containerHeight - 56) / 200,
    (containerWidth - GUTTER_MIN * 2) / 100
  ));
  const width = 100 * k;
  const regions = view === 'front' ? FRONT : BACK;

  const tap = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    onToggle(id);
  };

  /* ── drag paints ──────────────────────────────────────────
     A finger swept across the figure ADDS every region it crosses —
     one stroke marks neck, shoulder and upper back together, with a
     tick of haptic per region. Adding only: a stroke that could also
     erase would betray the hand on the way back; removal stays a tap.
     The container CAPTURES the gesture only after ~10pt of movement,
     so plain taps still reach the region buttons (and VoiceOver), and
     the page can still scroll from outside the figure. */
  const start = useRef({ x: 0, y: 0 });
  const painted = useRef<Record<string, true>>({});
  const regionAt = (x: number, y: number): string | null => {
    for (const rg of regions) {
      if (x >= rg.x * k && x <= (rg.x + rg.w) * k
        && y >= rg.y * k && y <= (rg.y + rg.h) * k) return rg.id;
    }
    return null;
  };
  const paint = (x: number, y: number) => {
    const id = regionAt(x, y);
    if (!id || painted.current[id]) return;
    painted.current[id] = true;
    if (selected.indexOf(id) < 0) {
      Haptics.selectionAsync().catch(() => {});
      onToggle(id);
    }
  };
  const onTouchStart = (e: GestureResponderEvent) => {
    start.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
    painted.current = {};
  };
  const shouldCapture = (e: GestureResponderEvent) => {
    const dx = e.nativeEvent.locationX - start.current.x;
    const dy = e.nativeEvent.locationY - start.current.y;
    return Math.abs(dx) + Math.abs(dy) > 10;
  };
  const onMove = (e: GestureResponderEvent) => {
    /* the stroke's origin counts too — capture begins mid-gesture */
    paint(start.current.x, start.current.y);
    paint(e.nativeEvent.locationX, e.nativeEvent.locationY);
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

      <View style={styles.row}>
        {/* left gutter: the selection, read back in words as it is
            painted — the confirmation before Save, and the one place a
            mark on the OTHER view stays visible while you face this
            one. Pairs collapse to how a person says them. */}
        <View
          style={styles.gutter}
          accessible
          accessibilityLiveRegion="polite"
          accessibilityLabel={selected.length
            ? 'Marked: ' + readLocSelection(selected)
            : 'Nothing marked yet'}
        >
          {selected.length === 0 ? (
            <Text style={styles.gutterHint} allowFontScaling maxFontSizeMultiplier={1.3}>
              Nothing marked yet
            </Text>
          ) : readLocSelection(selected).split(' · ').map((word) => (
            <Text
              key={word}
              style={styles.gutterWord}
              allowFontScaling maxFontSizeMultiplier={1.3}
            >
              {word}
            </Text>
          ))}
        </View>

      <View
        style={{ width, height: 200 * k }}
        onTouchStart={onTouchStart}
        onMoveShouldSetResponderCapture={shouldCapture}
        onResponderMove={onMove}
        onResponderTerminationRequest={() => false}
      >
        {/* the figure — one generated silhouette serves front and back,
            the way a paper pain drawing's outline does */}
        <Image
          source={BODY}
          style={{ position: 'absolute', width, height: 200 * k }}
          resizeMode="stretch"
          accessible={false}
        />
        {/* Touch zones are INVISIBLE at rest — the body is the
            affordance, and the heading says to touch it. A mark is a
            soft patch of the check-in's own pain colour laid on the
            anatomy it names, with the hairline every painted surface in
            this app carries so a near-black 1 stays visible on the grey
            figure. */}
        {regions.map((rg, i) => {
          const on = selected.indexOf(rg.id) >= 0;
          return (
            <Pressable
              key={rg.id + (rg.side || '') + i}
              onPress={() => tap(rg.id)}
              hitSlop={rg.h < 10 ? 5 : 3}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={LOC_NAMES[rg.id] || rg.id}
              accessibilityHint={on ? 'Removes this area' : 'Marks this area'}
              style={({ pressed }) => [
                {
                  position: 'absolute',
                  left: rg.x * k, top: rg.y * k,
                  width: rg.w * k, height: rg.h * k,
                  borderRadius: rg.r * k, borderCurve: 'continuous',
                },
                on && {
                  backgroundColor: tint, opacity: 0.92,
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
                },
                pressed && !on && { backgroundColor: 'rgba(255,255,255,0.14)' },
                pressed && on && { opacity: 0.65 },
              ]}
            />
          );
        })}
      </View>

        {/* right gutter: the one place with no place — a real answer,
            and its own control rather than a fifteenth patch of body */}
        <View style={[styles.gutter, styles.gutterRight]}>
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
      </View>
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
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center' },
  /* the columns beside the figure — words on the left, controls on the
     right, both starting at the figure's shoulder height so the head
     keeps its air */
  gutter: { flex: 1, paddingTop: 46, gap: 6, alignItems: 'flex-end', paddingRight: 8 },
  gutterRight: { alignItems: 'flex-start', paddingLeft: 8, paddingRight: 0 },
  gutterWord: {
    color: color.textSecondary, fontSize: font.footnote, lineHeight: 17,
    textAlign: 'right',
  },
  gutterHint: {
    color: color.textTertiary, fontSize: font.footnote, lineHeight: 17,
    textAlign: 'right',
  },
  allOver: {
    minHeight: 38, paddingHorizontal: 14, justifyContent: 'center',
    borderRadius: 19, borderCurve: 'continuous',
    borderWidth: 1, borderColor: color.borderControl, backgroundColor: color.bgSurface,
  },
  allOverText: { color: color.textPrimary, fontSize: font.footnote, fontWeight: '600' },
});
