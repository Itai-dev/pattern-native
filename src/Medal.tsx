/**
 * One achievement medal (coach.ts) — the material says what KIND of
 * thing was done, never how much it is worth (docs/REDESIGN-2026-10.md,
 * "Medal materials", decided 21 Oct 2026):
 *
 *   roadmap  polished steel, a circle
 *   pacing   frosted glass, a hexagon
 *   finding  cut crystal, a gem
 *   time     dark titanium, a circle
 *
 * NO RANK AND NO HUE. Bronze → gold → diamond was the obvious design and
 * was turned down: a rank makes "held the line" a lesser metal than
 * "45 minutes", so the medals would argue for pushing, and warm metals
 * put hue on screens where hue is a pain score. Every material here is
 * grey to white. NEVER A SQUARE — a square is a pain value in this app.
 *
 * SKIA WHERE IT EXISTS, A FLAT MEDAL WHERE IT DOES NOT. Skia is younger
 * than runtime 1.3.0 (PainOrb.tsx), so it is required inside try/catch:
 * a binary without it draws each material as a flat disc of its middle
 * tone. The medal reads the same either way; only the polish differs.
 */
import React from 'react';
import { Platform, Text, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Achievement, MedalKind } from './coach';

type SkiaLib = typeof import('@shopify/react-native-skia');

const SK: SkiaLib | null = (() => {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('@shopify/react-native-skia');
    return m && m.Skia && m.Canvas && m.Path && m.SweepGradient ? (m as SkiaLib) : null;
  } catch {
    return null; // a binary without Skia — flat medals until TestFlight
  }
})();

interface Material {
  /** the sweep that makes the metal, or null for glass */
  sweep: string[] | null;
  /** sweep stop positions, for crystal's hard facets */
  positions?: number[];
  base: string;
  /** the specular highlight's strength, 0–1 */
  shine: number;
  /** the inner rim */
  rim: string;
  /** the glyph's colour on the earned medal */
  ink: string;
  /** the flat stand-in without Skia */
  flat: string;
}

const facet = ['#FFFFFF', '#D1D1D6', '#F2F2F7', '#AEAEB2', '#FFFFFF', '#C7C7CC', '#E5E5EA', '#98989F'];

const MATERIALS: Record<MedalKind, Material> = {
  roadmap: {
    sweep: ['#8E8E93', '#F2F2F7', '#AEAEB2', '#FFFFFF', '#8E8E93', '#E5E5EA', '#8E8E93'],
    base: '#D1D1D6', shine: 0.9, rim: 'rgba(255,255,255,0.35)', ink: '#1C1C1E', flat: '#D1D1D6',
  },
  pacing: {
    sweep: null, base: '#2C2C2E', shine: 0.42, rim: 'rgba(255,255,255,0.28)', ink: '#FFFFFF', flat: '#3A3A3C',
  },
  finding: {
    /* hard stops: each colour held across its eighth, so the sweep
       breaks into facets instead of blending */
    sweep: facet.reduce<string[]>((a, c) => a.concat([c, c]), []),
    positions: facet.reduce<number[]>((a, _c, i) => a.concat([i / 8, (i + 1) / 8]), []),
    base: '#E5E5EA', shine: 0, rim: 'rgba(255,255,255,0.5)', ink: '#1C1C1E', flat: '#E5E5EA',
  },
  time: {
    sweep: ['#1C1C1E', '#636366', '#2C2C2E', '#8E8E93', '#1C1C1E', '#48484A', '#1C1C1E'],
    base: '#2C2C2E', shine: 0.45, rim: 'rgba(255,255,255,0.22)', ink: '#FFFFFF', flat: '#48484A',
  },
};

const LOCKED = { fill: '#1C1C1E', rim: '#2C2C2E', ink: '#48484A' };

/** the outline, in a w×h box: circle, hexagon (points left and right),
 *  or an octagonal gem — the same shapes as the approved mockup */
function outline(sk: SkiaLib, kind: MedalKind, w: number, h: number) {
  const p = sk.Skia.Path.Make();
  if (kind === 'pacing') {
    const pts: [number, number][] = [[0.25, 0.03], [0.75, 0.03], [1, 0.5], [0.75, 0.97], [0.25, 0.97], [0, 0.5]];
    pts.forEach(([x, y], i) => (i ? p.lineTo(x * w, y * h) : p.moveTo(x * w, y * h)));
    p.close();
  } else if (kind === 'finding') {
    const pts: [number, number][] = [[0.3, 0], [0.7, 0], [1, 0.3], [1, 0.7], [0.7, 1], [0.3, 1], [0, 0.7], [0, 0.3]];
    pts.forEach(([x, y], i) => (i ? p.lineTo(x * w, y * h) : p.moveTo(x * w, y * h)));
    p.close();
  } else {
    p.addCircle(w / 2, h / 2, Math.min(w, h) / 2);
  }
  return p;
}

const ACTIVITY_ICON: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  running: 'run', walking: 'walk', cycling: 'bike', swimming: 'swim',
  'strength training': 'dumbbell', pilates: 'yoga',
};

function Glyph({ a, size, ink, activity }: { a: Achievement; size: number; ink: string; activity?: string | null }) {
  if (a.icon === 'number') {
    return (
      <Text allowFontScaling={false}
        style={{ fontFamily: 'ui-rounded', fontWeight: '800', fontSize: size * 0.36, color: ink, letterSpacing: -0.5 }}>
        {a.num}
      </Text>
    );
  }
  const g = size * 0.42;
  if (a.icon === 'activity') {
    return <MaterialCommunityIcons name={(activity && ACTIVITY_ICON[activity]) || 'run'} size={g} color={ink} />;
  }
  const ION: Record<string, keyof typeof Ionicons.glyphMap> = {
    flag: 'flag', hold: 'pause', ease: 'arrow-undo', plan: 'checkmark-sharp',
    report: 'document-text', answer: 'hourglass', weeks: 'calendar-clear',
  };
  return <Ionicons name={ION[a.icon] || 'ellipse'} size={g} color={ink} />;
}

export interface MedalProps {
  a: Achievement;
  size: number;
  /** the goal's activity, for the activity glyph */
  activity?: string | null;
}

export default function Medal({ a, size, activity }: MedalProps) {
  const earned = !!a.earnedOn;
  const m = MATERIALS[a.kind];
  /* the hexagon is a little wider than tall, as in the mockup */
  const w = a.kind === 'pacing' ? Math.round(size * 1.08) : size;
  const h = size;
  const ink = earned ? m.ink : LOCKED.ink;

  let art: React.ReactNode = null;
  if (SK) {
    const { Canvas, Path, SweepGradient, RadialGradient, LinearGradient, vec, Group } = SK;
    const p = outline(SK, a.kind, w, h);
    art = (
      <Canvas style={{ position: 'absolute', width: w, height: h }} pointerEvents="none">
        {earned ? (
          <Group>
            {/* glass is its gradient over a dark base, so the base goes first */}
            {!m.sweep && <Path path={p} color={m.base} />}
            <Path path={p} color={m.base}>
              {m.sweep ? (
                <SweepGradient c={vec(w / 2, h / 2)} colors={m.sweep} positions={m.positions} />
              ) : (
                <LinearGradient start={vec(0, 0)} end={vec(w, h)}
                  colors={['rgba(255,255,255,0.42)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.26)']}
                  positions={[0, 0.46, 0.54, 1]} />
              )}
            </Path>
            {m.shine > 0 && (
              <Path path={p}>
                <RadialGradient c={vec(w * 0.3, h * 0.22)} r={size * 0.42}
                  colors={['rgba(255,255,255,' + m.shine + ')', 'rgba(255,255,255,0)']} />
              </Path>
            )}
            <Path path={p} style="stroke" strokeWidth={Math.max(1.5, size * 0.035)} color={m.rim} />
          </Group>
        ) : (
          <Group>
            <Path path={p} color={LOCKED.fill} />
            <Path path={p} style="stroke" strokeWidth={1.5} color={LOCKED.rim} />
          </Group>
        )}
      </Canvas>
    );
  }

  const flat = SK ? null : {
    backgroundColor: earned ? m.flat : LOCKED.fill,
    borderRadius: size / 2,
    borderWidth: earned ? 0 : 1.5,
    borderColor: LOCKED.rim,
  };

  return (
    <View
      accessible={false}
      style={[{ width: w, height: h, alignItems: 'center', justifyContent: 'center' }, flat]}
    >
      {art}
      <Glyph a={a} size={size} ink={ink} activity={activity} />
    </View>
  );
}
