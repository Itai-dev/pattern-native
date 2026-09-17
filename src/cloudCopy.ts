/**
 * The copy the server cannot read — the envelope, and nothing else.
 *
 * docs/ACCOUNTS.md is the design; this is step one of it, and the only
 * step with no pending decision in it. What a blob looks like, how it is
 * sealed, how it is opened, and what makes one invalid. No network, no
 * keychain, no native module, no Node: the cipher and the compressor
 * arrive as arguments, so the device can pass CryptoKit and the tests can
 * pass Node's own AES-GCM and zlib. Nothing here rolls its own crypto.
 *
 * WHY THE PAYLOAD IS THE BACKUP FILE. `exportBackup()` already produces
 * exactly the right JSON, is already versioned, and is already covered by
 * tests that check three states survive a round trip. A second format
 * would be a second thing to migrate and a second thing to get wrong, so
 * there is one payload definition and this seals it.
 *
 * WHY THE METADATA IS AUTHENTICATED. The version, the algorithm and the
 * timestamp sit outside the ciphertext, because a client has to know
 * whether it can read a blob before it spends a decryption on one. Sitting
 * outside would normally mean unauthenticated and so forgeable, which for
 * `backupVersion` would let a corrupt store talk a client into the wrong
 * reader. So they are passed to the cipher as additional authenticated
 * data: readable without the key, and unchangeable without it. Tamper with
 * any of them and the open fails rather than lying.
 *
 * WHAT THIS REFUSES TO DO. It never throws on bad input — a malformed or
 * hostile blob returns null, the same posture as `validateBackup`, because
 * this code runs on the way back from the one event where a person has
 * already lost their record once. It throws only on a programming error a
 * caller could have prevented: a key or nonce of the wrong length, which
 * is never a fact about data and always a fact about the call.
 */

/** the envelope format. Bump only for a shape change; the payload inside
 *  carries its own version and moves independently. */
export const COPY_ENVELOPE_VERSION = 1;

/** AES-256-GCM. Named in the envelope so a future algorithm is a value
 *  rather than a guess about what the bytes are. */
export const COPY_ALG = 'A256GCM';

export const COPY_KEY_BYTES = 32;
export const COPY_NONCE_BYTES = 12;

/** the longest a sealed blob may be, as base64. A dense year of
 *  check-ins compresses to a small fraction of this; the cap exists so a
 *  hostile or corrupt store cannot hand a phone something it will try to
 *  hold in memory. */
export const COPY_MAX_CT_CHARS = 8 * 1024 * 1024;

export interface CopyEnvelope {
  /** COPY_ENVELOPE_VERSION at seal time */
  v: number;
  alg: string;
  /** base64, COPY_NONCE_BYTES long once decoded */
  nonce: string;
  /** base64 of ciphertext-with-tag, as the AEAD returned it */
  ct: string;
  /** the backup format version inside, so a client can refuse a blob it
   *  cannot read without decrypting it. Authenticated, never trusted over
   *  the version in the decrypted JSON itself. */
  backupVersion: number;
  /** ISO instant the blob was sealed, for showing "last copy" without
   *  opening it */
  createdAt: string;
}

/** An authenticated cipher. The device supplies CryptoKit's AES-GCM; the
 *  tests supply Node's. `open` returns null when authentication fails —
 *  wrong key, tampered bytes, tampered metadata — and never partial
 *  plaintext. */
export interface Aead {
  seal(plaintext: Uint8Array, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array): Uint8Array;
  open(sealed: Uint8Array, key: Uint8Array, nonce: Uint8Array, aad: Uint8Array): Uint8Array | null;
}

/** gzip, or anything symmetric. `inflate` returns null on malformed
 *  input rather than throwing. */
export interface Compressor {
  deflate(bytes: Uint8Array): Uint8Array;
  inflate(bytes: Uint8Array): Uint8Array | null;
}

/* ── base64, strict ──────────────────────────────────────────
   Written out rather than taken from the platform: `btoa` is not reliably
   present in Hermes, a dependency for twenty lines is a dependency to
   audit, and decoding has to be STRICT — a blob whose base64 silently
   half-decodes is a record half-restored, which is worse than a refusal. */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_REV: Record<string, number> = {};
for (let i = 0; i < B64.length; i++) B64_REV[B64[i]] = i;

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const has1 = i + 1 < bytes.length;
    const has2 = i + 2 < bytes.length;
    const b1 = has1 ? bytes[i + 1] : 0;
    const b2 = has2 ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += has1 ? B64[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += has2 ? B64[b2 & 0x3f] : '=';
  }
  return out;
}

/** null on anything that is not exactly well-formed base64: a stray
 *  character, wrong padding, a length that is not a multiple of four */
export function fromBase64(s: string): Uint8Array | null {
  if (typeof s !== 'string' || s.length % 4 !== 0) return null;
  let pad = 0;
  if (s.length > 0) {
    if (s[s.length - 1] === '=') pad++;
    if (s.length > 1 && s[s.length - 2] === '=') pad++;
  }
  const body = s.slice(0, s.length - pad);
  for (let i = 0; i < body.length; i++) if (B64_REV[body[i]] === undefined) return null;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < body.length; i += 4) {
    const c0 = B64_REV[body[i]];
    const c1 = B64_REV[body[i + 1]];
    /* a group of one is impossible in valid base64 */
    if (c1 === undefined) return null;
    const c2 = i + 2 < body.length ? B64_REV[body[i + 2]] : 0;
    const c3 = i + 3 < body.length ? B64_REV[body[i + 3]] : 0;
    if (o < out.length) out[o++] = (c0 << 2) | (c1 >> 4);
    if (o < out.length) out[o++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
    if (o < out.length) out[o++] = ((c2 & 0x03) << 6) | c3;
  }
  return out;
}

/* ── UTF-8, both ways ───────────────────────────────────────
   Also written out, and for the same reason plus one more: a note can
   hold an emoji, so surrogate pairs have to be right. A lone surrogate
   becomes U+FFFD on the way out, which is what every standard encoder
   does; decoding is strict and returns null rather than inventing a
   character, because after a successful AEAD open invalid UTF-8 means a
   bug in this file, not a hostile blob. */

export function utf8Encode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        c = 0x10000 + ((c - 0xd800) << 10) + (next - 0xdc00);
        i++;
      } else {
        c = 0xfffd;
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      c = 0xfffd;
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    else {
      out.push(
        0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f),
        0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)
      );
    }
  }
  return new Uint8Array(out);
}

export function utf8Decode(bytes: Uint8Array): string | null {
  let out = '';
  let i = 0;
  const cont = (n: number): number => {
    const b = bytes[n];
    return b !== undefined && (b & 0xc0) === 0x80 ? b & 0x3f : -1;
  };
  while (i < bytes.length) {
    const b0 = bytes[i];
    let c: number;
    let len: number;
    if (b0 < 0x80) { c = b0; len = 1; }
    else if ((b0 & 0xe0) === 0xc0) { c = b0 & 0x1f; len = 2; }
    else if ((b0 & 0xf0) === 0xe0) { c = b0 & 0x0f; len = 3; }
    else if ((b0 & 0xf8) === 0xf0) { c = b0 & 0x07; len = 4; }
    else return null;
    if (i + len > bytes.length) return null;
    for (let k = 1; k < len; k++) {
      const v = cont(i + k);
      if (v < 0) return null;
      c = (c << 6) | v;
    }
    /* overlong, surrogate, and out-of-range are all refusals */
    if (len === 2 && c < 0x80) return null;
    if (len === 3 && c < 0x800) return null;
    if (len === 4 && c < 0x10000) return null;
    if (c > 0x10ffff) return null;
    if (c >= 0xd800 && c <= 0xdfff) return null;
    if (c < 0x10000) out += String.fromCharCode(c);
    else {
      const v = c - 0x10000;
      out += String.fromCharCode(0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff));
    }
    i += len;
  }
  return out;
}

/* ── the envelope ───────────────────────────────────────────── */

/** the authenticated metadata, as bytes the cipher signs over. A stable
 *  canonical form, not JSON.stringify: key order is a property of the
 *  writer and this has to hash the same on both sides forever. */
export function copyAad(e: Pick<CopyEnvelope, 'v' | 'alg' | 'backupVersion' | 'createdAt'>): Uint8Array {
  return utf8Encode([
    'pattern.copy', String(e.v), e.alg, String(e.backupVersion), e.createdAt,
  ].join('\n'));
}

/** a raw blob from the store → an envelope, or null. Shape only: this
 *  says the thing is readable in principle, never that the key is right. */
export function validateEnvelope(raw: unknown): CopyEnvelope | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== COPY_ENVELOPE_VERSION) return null;
  if (r.alg !== COPY_ALG) return null;
  if (typeof r.backupVersion !== 'number' || !isFinite(r.backupVersion)) return null;
  if (typeof r.createdAt !== 'string' || !r.createdAt) return null;
  if (typeof r.nonce !== 'string' || typeof r.ct !== 'string') return null;
  if (!r.ct.length || r.ct.length > COPY_MAX_CT_CHARS) return null;
  const nonce = fromBase64(r.nonce);
  if (!nonce || nonce.length !== COPY_NONCE_BYTES) return null;
  if (!fromBase64(r.ct)) return null;
  return {
    v: r.v, alg: r.alg, nonce: r.nonce, ct: r.ct,
    backupVersion: r.backupVersion, createdAt: r.createdAt,
  };
}

/** Seal the backup JSON. The nonce is a caller's argument rather than
 *  generated here, because randomness belongs to the platform and a
 *  cipher that cannot be given a known nonce cannot be tested. Every
 *  seal needs a FRESH one: a reused nonce under the same key breaks
 *  GCM completely. */
export function sealCopy(
  backupJson: string,
  backupVersion: number,
  key: Uint8Array,
  nonce: Uint8Array,
  createdAtIso: string,
  aead: Aead,
  zip: Compressor
): CopyEnvelope {
  if (key.length !== COPY_KEY_BYTES) throw new Error('cloudCopy: key must be 32 bytes');
  if (nonce.length !== COPY_NONCE_BYTES) throw new Error('cloudCopy: nonce must be 12 bytes');
  const head = {
    v: COPY_ENVELOPE_VERSION, alg: COPY_ALG, backupVersion, createdAt: createdAtIso,
  };
  const sealed = aead.seal(
    zip.deflate(utf8Encode(backupJson)), key, nonce, copyAad(head)
  );
  return { ...head, nonce: toBase64(nonce), ct: toBase64(sealed) };
}

/** what a successful open yields: the JSON exactly as `exportBackup`
 *  wrote it, and the version the ENVELOPE claimed — which by now is
 *  proven to be the version that was sealed, because the open
 *  authenticated it. The caller still reads the authoritative version
 *  from inside the JSON, through `validateBackup`, as it always did. */
export interface OpenedCopy {
  json: string;
  backupVersion: number;
  createdAt: string;
}

/** Open a blob. null for every failure, and they are deliberately
 *  indistinguishable to the caller: a malformed envelope, a wrong key, a
 *  tampered byte and a tampered version all mean the same thing to a
 *  person standing in front of an empty app, which is "this copy cannot
 *  be opened on this phone". */
export function openCopy(
  raw: unknown,
  key: Uint8Array,
  aead: Aead,
  zip: Compressor
): OpenedCopy | null {
  if (key.length !== COPY_KEY_BYTES) throw new Error('cloudCopy: key must be 32 bytes');
  const e = validateEnvelope(raw);
  if (!e) return null;
  const nonce = fromBase64(e.nonce);
  const sealed = fromBase64(e.ct);
  if (!nonce || !sealed) return null;
  const zipped = aead.open(sealed, key, nonce, copyAad(e));
  if (!zipped) return null;
  const plain = zip.inflate(zipped);
  if (!plain) return null;
  const json = utf8Decode(plain);
  if (json === null) return null;
  return { json, backupVersion: e.backupVersion, createdAt: e.createdAt };
}
