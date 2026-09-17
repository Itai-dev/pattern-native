/**
 * The seam between the envelope and the store, and the store's own SQL.
 *
 * Two kinds of check. The first runs cloudSync against a fake store with
 * real crypto and asks the questions a person's restore depends on: does
 * a push leave no plaintext in the row, does a pull give the JSON back,
 * and does every way it can fail name the right reason. The second reads
 * the migration and the edge function as text and asks whether the
 * security boundary is still there — RLS on, three own-row policies, no
 * update, anon revoked, the prune trigger — and whether the row the
 * TypeScript writes has the columns the SQL declares. The SQL cannot run
 * here; the boundary can still be checked for having been deleted.
 *
 *   node tools/test-sync.js
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.PATTERN_TEST_OUT || path.join(ROOT, '.testbuild');
const sync = require(path.join(OUT, 'cloudSync.js'));
const cc = require(path.join(OUT, 'cloudCopy.js'));
const model = require(path.join(OUT, 'model.js'));

let pass = 0, fail = 0;
const ok = (name, cond, extra) => {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 220) : ''));
};
const group = (n) => console.log('\n' + n);

/* ── the platform, as the tests supply it ─────────────────── */
const aead = {
  seal(plaintext, key, nonce, aad) {
    const c = crypto.createCipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce));
    c.setAAD(Buffer.from(aad));
    const body = Buffer.concat([c.update(Buffer.from(plaintext)), c.final()]);
    return new Uint8Array(Buffer.concat([body, c.getAuthTag()]));
  },
  open(sealed, key, nonce, aad) {
    try {
      const buf = Buffer.from(sealed);
      const body = buf.subarray(0, buf.length - 16);
      const tag = buf.subarray(buf.length - 16);
      const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(key), Buffer.from(nonce));
      d.setAAD(Buffer.from(aad));
      d.setAuthTag(tag);
      return new Uint8Array(Buffer.concat([d.update(body), d.final()]));
    } catch { return null; }
  },
};
const zip = {
  deflate: (b) => new Uint8Array(zlib.gzipSync(Buffer.from(b))),
  inflate: (b) => { try { return new Uint8Array(zlib.gunzipSync(Buffer.from(b))); } catch { return null; } },
};
const nonces = [];
const deps = {
  aead, zip,
  randomBytes: (n) => { const b = new Uint8Array(crypto.randomBytes(n)); nonces.push(cc.toBase64(b)); return b; },
  nowIso: () => '2026-09-17T15:00:00Z',
};
const KEY = new Uint8Array(crypto.randomBytes(32));
const OTHER = new Uint8Array(crypto.randomBytes(32));

/** a fake store: an array of rows, newest last, optionally signed out or
 *  broken. What Supabase does behind CopyStore, minus the network. */
function fakeStore(opts = {}) {
  const rows = [];
  return {
    rows,
    userId: () => (opts.signedOut ? null : 'user-1'),
    async put(row) { if (opts.broken) throw new Error('network'); rows.push(row); },
    async newest() { if (opts.broken) throw new Error('network'); return rows.length ? rows[rows.length - 1] : null; },
  };
}

const BACKUP = JSON.stringify({
  app: 'pattern', version: model.BACKUP_VERSION, scaleVersion: 3, exported: '2026-09-17',
  background: null, diagnosis: { v: 1, status: 'looking' },
  entries: { '2026-09-17': { pain: 4, cap: null, note: 'stairs were fine 🙂', logs: [{ h: 500, pain: 4 }] } },
  events: [], func: [], goal: null, hypotheses: [], protocols: [], modifiers: [], experiments: [],
});

const run = async () => {
  /* ── push ─────────────────────────────────────────────────── */
  group('push');
  {
    const store = fakeStore();
    const r = await sync.pushCopy(store, KEY, BACKUP, model.BACKUP_VERSION, deps);
    ok('a push succeeds and reports when it was sealed', r.ok && r.createdAt === '2026-09-17T15:00:00Z', r);
    ok('one row was appended', store.rows.length === 1);
    const row = store.rows[0];
    ok('the row has the store\'s column names and nothing else', (() => {
      const keys = Object.keys(row).sort().join();
      return keys === 'alg,backup_version,created_at,ct,nonce,v';
    })(), Object.keys(row));
    ok('the row holds no plaintext', (() => {
      const s = JSON.stringify(row);
      return s.indexOf('stairs') < 0 && s.indexOf('looking') < 0 && s.indexOf('"pain"') < 0;
    })());
    ok('the row validates as an envelope on the way back', sync.envelopeOf(row) !== null);
  }
  ok('signed out, a push does nothing and says so', await (async () => {
    const store = fakeStore({ signedOut: true });
    const r = await sync.pushCopy(store, KEY, BACKUP, 7, deps);
    return !r.ok && r.reason === 'signed-out' && store.rows.length === 0;
  })());
  ok('a store that cannot be reached is "store", and nothing throws', await (async () => {
    const r = await sync.pushCopy(fakeStore({ broken: true }), KEY, BACKUP, 7, deps);
    return !r.ok && r.reason === 'store';
  })());
  ok('every push draws a fresh nonce', await (async () => {
    const store = fakeStore();
    nonces.length = 0;
    await sync.pushCopy(store, KEY, BACKUP, 7, deps);
    await sync.pushCopy(store, KEY, BACKUP, 7, deps);
    return nonces.length === 2 && nonces[0] !== nonces[1]
      && store.rows[0].nonce === nonces[0] && store.rows[1].nonce === nonces[1]
      && store.rows[0].ct !== store.rows[1].ct;
  })());

  /* ── pull ─────────────────────────────────────────────────── */
  group('pull');
  ok('a pull after a push gives the JSON back, byte for byte, and it is a backup', await (async () => {
    const store = fakeStore();
    await sync.pushCopy(store, KEY, BACKUP, model.BACKUP_VERSION, deps);
    const r = await sync.pullCopy(store, KEY, deps);
    if (!r.ok || r.json !== BACKUP) return false;
    const b = model.validateBackup(r.json);
    return b && b.diagnosis && b.diagnosis.status === 'looking'
      && b.entries['2026-09-17'].note === 'stairs were fine 🙂';
  })());
  ok('the newest copy is the one that comes back', await (async () => {
    const store = fakeStore();
    await sync.pushCopy(store, KEY, BACKUP.replace('"pain":4', '"pain":2'), 7, deps);
    await sync.pushCopy(store, KEY, BACKUP, 7, deps);
    const r = await sync.pullCopy(store, KEY, deps);
    return r.ok && r.json === BACKUP;
  })());
  ok('no copy yet is its own answer, not a failure to open', await (async () => {
    const r = await sync.pullCopy(fakeStore(), KEY, deps);
    return !r.ok && r.reason === 'no-copy';
  })());
  ok('signed out is its own answer', await (async () => {
    const r = await sync.pullCopy(fakeStore({ signedOut: true }), KEY, deps);
    return !r.ok && r.reason === 'signed-out';
  })());
  ok('an unreachable store is its own answer', await (async () => {
    const r = await sync.pullCopy(fakeStore({ broken: true }), KEY, deps);
    return !r.ok && r.reason === 'store';
  })());
  ok('the wrong key is "cannot-open", never a throw, never partial JSON', await (async () => {
    const store = fakeStore();
    await sync.pushCopy(store, KEY, BACKUP, 7, deps);
    const r = await sync.pullCopy(store, OTHER, deps);
    return !r.ok && r.reason === 'cannot-open';
  })());
  ok('a row the store corrupted is "cannot-open"', await (async () => {
    const store = fakeStore();
    await sync.pushCopy(store, KEY, BACKUP, 7, deps);
    store.rows[0].backup_version = 1;      // authenticated metadata, rewritten
    const r = await sync.pullCopy(store, KEY, deps);
    return !r.ok && r.reason === 'cannot-open';
  })());
  ok('a row that is not an envelope at all is "cannot-open"', await (async () => {
    const store = fakeStore();
    store.rows.push({ garbage: true });
    const r = await sync.pullCopy(store, KEY, deps);
    return !r.ok && r.reason === 'cannot-open';
  })());

  /* ── the SQL and the function, as text ─────────────────────── */
  group('the store\'s boundary is still there');
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20260917000000_copies.sql'), 'utf8');
  const fn = fs.readFileSync(path.join(ROOT, 'supabase/functions/delete-account/index.ts'), 'utf8');

  ok('the table exists with row level security on', /create table public\.copies/.test(sql)
    && /alter table public\.copies enable row level security/.test(sql));
  ok('the row the client writes has exactly the columns the SQL declares (minus the server\'s)', (() => {
    const body = sql.slice(sql.indexOf('create table public.copies ('), sql.indexOf(');'));
    /* a column line is "name type ...": a continuation line such as the
       foreign-key clause has no type in second place and is skipped */
    const TYPES = /^(bigint|uuid|smallint|text|timestamptz)$/;
    const cols = body.split('\n')
      .map((l) => l.trim()).filter((l) => l && !l.startsWith('--') && !l.startsWith('create table'))
      .map((l) => l.split(/\s+/)).filter((w) => TYPES.test(w[1] || ''))
      .map((w) => w[0]);
    const server = ['id', 'user_id', 'received_at'];
    const clientCols = cols.filter((c) => server.indexOf(c) < 0).sort().join();
    const rowKeys = Object.keys(sync.rowOf({
      v: 1, alg: 'A256GCM', nonce: 'x', ct: 'y', backupVersion: 7, createdAt: 'z',
    })).sort().join();
    return clientCols === rowKeys;
  })());
  ok('a person may read, insert and delete their own rows', /for select to authenticated[\s\S]*using \(user_id = auth\.uid\(\)\)/.test(sql)
    && /for insert to authenticated[\s\S]*with check \(user_id = auth\.uid\(\)\)/.test(sql)
    && /for delete to authenticated[\s\S]*using \(user_id = auth\.uid\(\)\)/.test(sql));
  ok('nobody may update: no policy, and the grant revoked', !/for update/.test(sql)
    && /revoke update on public\.copies from anon, authenticated/.test(sql));
  ok('the anon role cannot reach the table', /revoke all on public\.copies from anon/.test(sql));
  ok('user_id defaults to the caller and cascades on account deletion', /default auth\.uid\(\)/.test(sql)
    && /references auth\.users \(id\) on delete cascade/.test(sql));
  ok('the client\'s size cap is enforced server-side too', (() => {
    const m = sql.match(/char_length\(ct\) between 1 and (\d+)/);
    return m && Number(m[1]) === cc.COPY_MAX_CT_CHARS;
  })());
  ok('the newest few are kept by a trigger, ordered by arrival not by the phone\'s clock', /create trigger copies_prune[\s\S]*after insert/.test(sql)
    && /order by received_at desc/.test(sql) && !/order by created_at/.test(sql));
  ok('the prune function is not callable by clients', /revoke all on function public\.prune_copies\(\) from public, anon, authenticated/.test(sql));

  ok('the delete function takes the caller from their own token, with the anon key', /getUser\(\)/.test(fn)
    && /createClient\(url, anon/.test(fn));
  ok('it deletes only that user, rows first then the account', /\.eq\("user_id", user\.id\)/.test(fn)
    && /admin\.deleteUser\(user\.id\)/.test(fn)
    && fn.indexOf('.eq("user_id", user.id)') < fn.indexOf('admin.deleteUser(user.id)'));
  ok('the service role key comes from the environment and is not in the file', /Deno\.env\.get\("SUPABASE_SERVICE_ROLE_KEY"\)/.test(fn)
    && !/eyJ[A-Za-z0-9_-]{20,}/.test(fn) && !/sb_secret_/.test(fn));
  ok('nothing in the app imports the function or the service key', (() => {
    const src = fs.readdirSync(path.join(ROOT, 'src')).filter((f) => /\.tsx?$/.test(f))
      .map((f) => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n')
      + fs.readFileSync(path.join(ROOT, 'App.tsx'), 'utf8');
    return !/SERVICE_ROLE/.test(src) && !/sb_secret_/.test(src);
  })());

  console.log('\n' + (fail ? 'FAILED ' : 'PASSED ') + pass + ' assertions, ' + fail + ' failures');
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.log('  CRASH ' + (e && e.stack || e)); process.exit(1); });
