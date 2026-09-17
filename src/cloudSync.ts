/**
 * The seam between the envelope and the store.
 *
 * cloudCopy.ts knows how to seal and open a blob and nothing about where
 * blobs live. This file knows the shape of one row in `public.copies`
 * and the two things a phone does with the store — push the newest copy,
 * pull the newest copy — and nothing about ciphers. The store itself
 * arrives as an interface, so the app hands in a Supabase client and the
 * tests hand in a fake, and the row shape is checked against the SQL
 * migration by tools/test-sync.js so the two cannot drift apart quietly.
 *
 * WHAT A FAILURE MEANS TO A PERSON. The envelope collapses every kind of
 * bad blob into one null, because a wrong key and a flipped bit are the
 * same fact to someone standing in front of an empty app. But three other
 * things are NOT the same fact and get their own word here: there is no
 * copy yet; the store could not be reached; you are not signed in. Each
 * of those has a different sentence and a different next step on screen.
 *
 * Nothing here throws on data or on the network. Only a caller's own
 * wrong-length key throws, and that comes from cloudCopy.
 */
import {
  Aead, Compressor, CopyEnvelope, COPY_NONCE_BYTES,
  openCopy, sealCopy, validateEnvelope,
} from './cloudCopy';

/** one row of `public.copies`, as the client writes and reads it. Column
 *  for column with supabase/migrations; `id`, `user_id` and `received_at`
 *  are the server's and never travel from the phone. */
export interface CopyRow {
  v: number;
  alg: string;
  nonce: string;
  ct: string;
  backup_version: number;
  created_at: string;
}

/** the store, as this file needs it. A Supabase client fits behind this
 *  in a dozen lines; so does a fake. */
export interface CopyStore {
  /** the signed-in user's id, or null when there is no session */
  userId(): string | null;
  /** append one row; the server fills in the rest and prunes */
  put(row: CopyRow): Promise<void>;
  /** the most recently RECEIVED row, or null when there is none */
  newest(): Promise<CopyRow | null>;
}

/** what the platform supplies: the cipher, the compressor, randomness
 *  and the clock. Injected for the same reason the store is. */
export interface SyncDeps {
  aead: Aead;
  zip: Compressor;
  randomBytes(n: number): Uint8Array;
  nowIso(): string;
}

/** envelope → row. Same fields, the store's names. */
export function rowOf(e: CopyEnvelope): CopyRow {
  return {
    v: e.v, alg: e.alg, nonce: e.nonce, ct: e.ct,
    backup_version: e.backupVersion, created_at: e.createdAt,
  };
}

/** row → envelope, through the same validator every blob passes, so a
 *  row the store hands back is trusted exactly as much as one from
 *  anywhere else: not at all until it validates. */
export function envelopeOf(r: unknown): CopyEnvelope | null {
  if (!r || typeof r !== 'object') return null;
  const x = r as Record<string, unknown>;
  return validateEnvelope({
    v: x.v, alg: x.alg, nonce: x.nonce, ct: x.ct,
    backupVersion: x.backup_version, createdAt: x.created_at,
  });
}

export type PushResult =
  | { ok: true; createdAt: string }
  | { ok: false; reason: 'signed-out' | 'store' };

/** Seal the backup and append it. A fresh nonce every time, from the
 *  platform's randomness, never reused. */
export async function pushCopy(
  store: CopyStore,
  key: Uint8Array,
  backupJson: string,
  backupVersion: number,
  deps: SyncDeps
): Promise<PushResult> {
  if (!store.userId()) return { ok: false, reason: 'signed-out' };
  const env = sealCopy(
    backupJson, backupVersion, key,
    deps.randomBytes(COPY_NONCE_BYTES), deps.nowIso(), deps.aead, deps.zip
  );
  try {
    await store.put(rowOf(env));
  } catch {
    return { ok: false, reason: 'store' };
  }
  return { ok: true, createdAt: env.createdAt };
}

export type PullResult =
  | { ok: true; json: string; backupVersion: number; createdAt: string }
  | { ok: false; reason: 'signed-out' | 'no-copy' | 'cannot-open' | 'store' };

/** Fetch the newest copy and open it. The JSON that comes back is what
 *  `exportBackup` wrote, and the caller hands it to `validateBackup` and
 *  `applyBackup` exactly as it would a file — the cloud restore is the
 *  file restore with a different source. */
export async function pullCopy(
  store: CopyStore,
  key: Uint8Array,
  deps: SyncDeps
): Promise<PullResult> {
  if (!store.userId()) return { ok: false, reason: 'signed-out' };
  let row: CopyRow | null;
  try {
    row = await store.newest();
  } catch {
    return { ok: false, reason: 'store' };
  }
  if (!row) return { ok: false, reason: 'no-copy' };
  const opened = openCopy(envelopeOf(row), key, deps.aead, deps.zip);
  if (!opened) return { ok: false, reason: 'cannot-open' };
  return {
    ok: true, json: opened.json,
    backupVersion: opened.backupVersion, createdAt: opened.createdAt,
  };
}
