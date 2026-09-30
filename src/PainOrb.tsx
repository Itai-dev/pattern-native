/**
 * The check-in shape as a dotted orb — the founder's pick (30 Sep 2026)
 * from thinking-orbs' "listening" state, standing where the square stood.
 *
 * WHAT IS BORROWED AND WHAT IS NOT. thinking-orbs is a web component: it
 * paints an HTML canvas and reads the DOM, and imported whole it would
 * crash every phone at launch. Only its engine is used — the pure maths
 * that places the dots for a moment in time, which touches no DOM
 * (`thinking-orbs/engine`, MIT). The painting is ours, in Skia.
 *
 * ONE COLOUR, NOT THE LIBRARY'S SHADING. The stock orb shades each dot
 * from bright to dim to read as a sphere. On a scale where brightness IS
 * the pain value, that would put eleven scores on the screen at once.
 * Every dot here wears exactly painColor(value); depth is carried by dot
 * size alone, which the engine already varies. Each dot sits on a faint
 * white rim for the same reason every painted square carries a hairline:
 * a near-black 10 must not vanish into the black ground.
 *
 * WHAT IT KEEPS FROM THE SQUARE. It grows a little as pain rises (the
 * same 0.94 → 1.04 the square used), it follows the finger continuously,
 * and under Reduce Motion it holds one still frame and only its colour
 * and size move. It is slowed to half the library's speed: this screen is
 * where someone reports pain, and the library's pace is tuned for "an
 * agent is busy", which is the wrong mood here.
 *
 * NATIVE, SO GUARDED. Skia is a native module younger than runtime 1.3.0.
 * It is required inside try/catch (AGENTS.md, tools/test-native-guards.js):
 * a binary without it gets PAIN_ORB_AVAILABLE false and the check-in
 * keeps drawing the square. Nothing about the value, the words or the
 * slider changes between the two — only the picture.
 */
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { MODE_FRAMES, resolvePreset } from 'thinking-orbs/engine';
import { PAIN_MAX, PAIN_MIN, painColor } from './painScale';
import { useReduceMotion } from './motion';

type SkiaLib = typeof import('@shopify/react-native-skia');

const SK: SkiaLib | null = (() => {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const m = require('@shopify/react-native-skia');
    return m && m.Skia && m.Canvas && m.Picture ? (m as SkiaLib) : null;
  } catch {
    return null; // a binary without Skia — the square stays until TestFlight
  }
})();

/** true on binaries that carry Skia; the check-in draws the square otherwise */
export const PAIN_ORB_AVAILABLE = SK != null;

/** the engine's hand-tuned design size; we draw at that and scale up,
 *  because its dot counts and radii are tuned for 64, not a formula */
const DESIGN = 64;
/** half the library's pace — see "WHAT IT KEEPS FROM THE SQUARE" */
const CALM = 0.5;
/** the frame shown under Reduce Motion — the library's own still frame */
const STILL_T = 0.6;
/** the white rim under each dot, in screen points */
const RIM = 0.6;

export interface PainOrbProps {
  /** continuous 0–10, driven by the slider gesture */
  progress: SharedValue<number>;
  size: number;
}

export default function PainOrb(props: PainOrbProps) {
  return SK ? <Orb {...props} sk={SK} /> : null;
}

function Orb({ progress, size, sk }: PainOrbProps & { sk: SkiaLib }) {
  const { Skia, Canvas, Picture } = sk;
  const rm = useReduceMotion();
  const picture = useSharedValue(emptyPicture(sk, size));

  useEffect(() => {
    const { mode, speed, opts } = resolvePreset('listening', DESIGN);
    const frameOf = MODE_FRAMES[mode];
    const rect = Skia.XYWHRect(0, 0, size, size);
    const fill = Skia.Paint();
    fill.setAntiAlias(true);
    const rim = Skia.Paint();
    rim.setAntiAlias(true);
    rim.setColor(Skia.Color('rgba(255,255,255,0.16)'));

    const t0 = Date.now();
    let raf = 0;
    let lastStill = '';
    const loop = () => {
      const v = Math.max(PAIN_MIN, Math.min(PAIN_MAX, progress.value));
      /* under Reduce Motion the dots hold still, so a frame is only
         re-recorded when the value under the finger moves */
      const still = rm ? v.toFixed(2) : '';
      if (!rm || still !== lastStill) {
        lastStill = still;
        const t = rm ? STILL_T : ((Date.now() - t0) / 1000) * speed * CALM;
        const k = (size / DESIGN) * (0.94 + (v / PAIN_MAX) * 0.1);
        const { dots } = frameOf(DESIGN, t, opts);
        const rec = Skia.PictureRecorder();
        const c = rec.beginRecording(rect);
        c.translate(size / 2, size / 2);
        c.scale(k, k);
        c.translate(-DESIGN / 2, -DESIGN / 2);
        for (const d of dots) c.drawCircle(d.x, d.y, d.r + RIM / k, rim);
        const ink = Skia.Color(painColor(v));
        for (const d of dots) {
          fill.setColor(ink);
          fill.setAlphaf(d.a ?? 1);
          c.drawCircle(d.x, d.y, d.r, fill);
        }
        picture.value = rec.finishRecordingAsPicture();
      }
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [size, rm]);

  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <Picture picture={picture} />
    </Canvas>
  );
}

function emptyPicture(sk: SkiaLib, size: number) {
  const rec = sk.Skia.PictureRecorder();
  rec.beginRecording(sk.Skia.XYWHRect(0, 0, size, size));
  return rec.finishRecordingAsPicture();
}
