/**
 * The watch bridge's JS entry. requireNativeModule THROWS on a binary
 * that predates the module — which is every binary through build 29 —
 * so this import must only ever happen inside a try/catch. src/watch.ts
 * is that catch; nothing else imports this file.
 */
import { requireNativeModule } from 'expo-modules-core';

export interface WatchBridgeNative {
  /** the queued check-ins, cleared atomically — the caller owns them */
  drain(): Record<string, unknown>[];
  pendingCount(): number;
  /** the scale's presentation for the watch to wear — absent on the
   *  first watch build, so callers test for it before calling */
  setContext?(ctx: Record<string, unknown>): void;
}

export default requireNativeModule<WatchBridgeNative>('WatchBridge');
