-- Dataset generations: what makes "replace" mean replaced.
--
-- The problem this closes, in one sentence: device B holds the dataset that device A
-- just chose to discard, and when B reconnects a set-union merge quietly brings the
-- discarded facts back to life. Append-only data has no way to express "this is gone",
-- so a union is always safe *between peers* -- and after a replace, the two sides are
-- not peers any more. That is the thing the schema could not previously say.
--
-- A generation says it. Every fact is stamped with the generation it was appended
-- under, and **a fact is active only while its generation is the newest one**. Choosing
-- "keep what is on this device" mints a new generation and writes the winning dataset
-- into it, so everything from before is inert from that moment on.
--
-- Why this preserves append-only rather than working around it: a row's generation is
-- fixed when it is inserted and there is no UPDATE anywhere in this schema, so a
-- superseded fact **cannot** be promoted back into the current generation by anything --
-- not by a stale client, not by a buggy one, not by a race. The guarantee is structural
-- rather than enforced by a rule someone has to remember. Tombstones per fact were the
-- alternative (open point O2) and this is strictly less machinery: one stamp for a whole
-- dataset instead of one row per deletion.
--
-- See docs/supabase-migration.md, "Generations", and lib/cloud/generations.ts.

create table public.person_generations (
  id          uuid primary key,
  -- Never sent by the client, exactly as on person_facts: the default fills it from the
  -- verified JWT and the insert policy rejects any attempt to claim a different one.
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The server's clock, deliberately. Which generation is current is the one question in
  -- this system that two devices must never disagree about, and a device clock is exactly
  -- the wrong thing to settle it with.
  created_at  timestamptz not null default now()
);

-- The lookup this table exists for: the newest row for one person.
create index person_generations_user_idx
  on public.person_generations (user_id, created_at desc, id desc);

alter table public.person_generations enable row level security;

-- Revoke first, then grant back exactly what is needed. Supabase runs ALTER DEFAULT
-- PRIVILEGES on the public schema, so a new table arrives with six privileges already
-- granted to `anon` -- measured on person_facts in the first migration, not assumed.
revoke all on public.person_generations from public;
revoke all on public.person_generations from anon;
revoke all on public.person_generations from authenticated;
grant select, insert, delete on public.person_generations to authenticated;

create policy "read own generations"
  on public.person_generations for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "append own generations"
  on public.person_generations for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Delete exists so that "delete my data" can leave nothing behind, including the record
-- of how many times the dataset was reset. As on person_facts it is the only destructive
-- right a client is given.
create policy "delete own generations"
  on public.person_generations for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- No UPDATE policy and no UPDATE grant, for the same reason as person_facts: a
-- generation is a thing that happened at a moment. Correcting one would mean rewriting
-- history, and the whole point of the stamp is that it cannot be rewritten.

-- --------------------------------------------------------------------------------
-- person_facts joins the scheme.

alter table public.person_facts
  add column generation uuid references public.person_generations (id) on delete cascade;

-- Backfill: every existing person's facts belong to one generation, minted now. The
-- table is empty on the linked project as this is written, so in practice this loop does
-- nothing there -- it is here because the migration also has to be correct against a
-- local stack, a fresh project, or a restore that does have rows.
do $$
declare
  owner record;
  minted uuid;
begin
  for owner in select distinct user_id from public.person_facts where generation is null loop
    minted := gen_random_uuid();
    insert into public.person_generations (id, user_id) values (minted, owner.user_id);
    update public.person_facts
      set generation = minted
      where user_id = owner.user_id and generation is null;
  end loop;
end $$;

alter table public.person_facts alter column generation set not null;

-- **The primary key becomes (id, generation)**, and that is not incidental.
--
-- The same fact has to be able to exist in two generations at once, because "keep what
-- is on this device" writes the winning dataset into the new generation *before* the old
-- one is cleared away. With `id` alone that insert is a primary-key conflict, which would
-- force delete-then-insert -- and that ordering leaves a window in which the account holds
-- an empty current generation while a device is still uploading. Another device
-- reconnecting inside that window would see an empty authoritative dataset and adopt it.
--
-- Composite, the account never holds less than it did a moment ago, and pushes stay
-- idempotent: the same fact in the same generation is still a conflict, still `do nothing`.
alter table public.person_facts drop constraint person_facts_pkey;
alter table public.person_facts add constraint person_facts_pkey primary key (id, generation);

-- Reading a person's active set is `user_id = me and generation = current`, so that is
-- what gets the index.
create index person_facts_user_generation_idx
  on public.person_facts (user_id, generation);

-- The insert policy gains the ownership half of the stamp.
--
-- Deliberately **not** `generation = <the current one>`. That stricter rule sounds better
-- and buys nothing: a stale device that writes into its own superseded generation is
-- writing rows that are inert by definition, so there is nothing to prevent. What does
-- need preventing is stamping a row with a generation belonging to somebody else, which
-- the foreign key alone would allow.
--
-- It also keeps the schema out of the ordering business. A rule requiring the newest
-- generation would make every legitimate upload race the mint that precedes it.
drop policy "append own facts" on public.person_facts;

create policy "append own facts"
  on public.person_facts for insert
  to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.person_generations g
      where g.id = generation and g.user_id = (select auth.uid())
    )
  );
