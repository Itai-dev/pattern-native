-- The copy the server cannot read. docs/ACCOUNTS.md is the design; this is
-- the store. One row per sealed copy, append-only, the newest few kept per
-- person. Every column that is not ciphertext is envelope metadata the
-- client authenticated before it arrived here (cloudCopy.ts, copyAad), so
-- nothing in this table can be edited into meaning something else, and
-- nothing in it can be read.
--
-- Row Level Security is the whole server. A person can insert, read and
-- delete their own rows and nothing else; the anon role cannot touch the
-- table at all; nobody can update, because a copy is replaced, never
-- edited. The Supabase dashboard shows whoever holds the project exactly
-- what an attacker with the database would see: base64 they cannot open.

create table public.copies (
  id             bigint      generated always as identity primary key,
  -- defaults to the caller, so the client never has to know or send its
  -- own id, and the insert policy below still checks it
  user_id        uuid        not null default auth.uid()
                             references auth.users (id) on delete cascade,
  -- the envelope, column for column (cloudCopy.ts, CopyEnvelope)
  v              smallint    not null,
  alg            text        not null,
  nonce          text        not null,
  -- the same cap the client enforces (COPY_MAX_CT_CHARS), so a blob a
  -- phone would refuse to hold is refused here first
  ct             text        not null check (char_length(ct) between 1 and 8388608),
  backup_version smallint    not null,
  -- the moment the CLIENT sealed it, for showing "last copy"; shown, never
  -- trusted for ordering, because a phone's clock is a phone's clock
  created_at     timestamptz not null,
  -- the moment it ARRIVED, which is what ordering and pruning use
  received_at    timestamptz not null default now()
);

comment on table public.copies is
  'Ciphertext only. Encrypted on the device under a key that never leaves it. Nothing in this table is readable here, by anyone.';

create index copies_user_received on public.copies (user_id, received_at desc);

-- ── the boundary ────────────────────────────────────────────

alter table public.copies enable row level security;

create policy copies_select_own on public.copies
  for select to authenticated
  using (user_id = auth.uid());

create policy copies_insert_own on public.copies
  for insert to authenticated
  with check (user_id = auth.uid());

create policy copies_delete_own on public.copies
  for delete to authenticated
  using (user_id = auth.uid());

-- no update policy exists, and the grant is removed as well, so there are
-- two independent reasons an update fails
revoke update on public.copies from anon, authenticated;
-- the anon role never reaches this table
revoke all on public.copies from anon;

-- ── keep the newest few ─────────────────────────────────────
-- A single mutable slot is one bad write away from the disaster this
-- feature exists to prevent, so a person always has their last five
-- copies. Five: a week of daily pushes with room for a bad one, at a size
-- where five of them cost nothing.

create or replace function public.prune_copies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.copies c
  where c.user_id = new.user_id
    and c.id not in (
      select id from public.copies
      where user_id = new.user_id
      order by received_at desc, id desc
      limit 5
    );
  return null;
end
$$;

revoke all on function public.prune_copies() from public, anon, authenticated;

create trigger copies_prune
  after insert on public.copies
  for each row execute function public.prune_copies();
