-- One person's facts, mirrored from the device.
--
-- Deliberately complete in a single migration: table, Data API grants, RLS, and
-- the policies together. A table that exists before its policies do is readable
-- by everyone for as long as that gap lasts, and "we will add RLS next" is a
-- promise, not a boundary. See docs/supabase-migration.md sections 5 to 8.
--
-- The shape mirrors PersonFact in lib/person/store.ts one-to-one, and reuses the
-- id the client already generated. That is what makes every push idempotent: the
-- same fact inserted twice is a primary-key conflict, not a duplicate row.

create table public.person_facts (
  id          uuid primary key,
  -- Never sent by the client. The default fills it from the verified JWT, and the
  -- insert policy below rejects any attempt to claim a different one.
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null check (length(key) between 1 and 128),
  value       text not null check (length(value) <= 10000),
  source      text not null check (length(source) between 1 and 64),
  -- From the client's clock. It only ever orders one person's own answers.
  learned_at  timestamptz not null,
  -- Server-side, and therefore the trustworthy basis for a pull window.
  created_at  timestamptz not null default now()
);

create index person_facts_user_key_idx
  on public.person_facts (user_id, key, learned_at desc);

alter table public.person_facts enable row level security;

-- Privileges. A SEPARATE question from RLS: RLS decides which rows a role may
-- see, privileges decide whether the role may address the table at all.
--
-- Revoking first is the load-bearing part, and it was not obvious. Supabase runs
-- ALTER DEFAULT PRIVILEGES on the public schema, so a brand-new table arrives
-- with SELECT, INSERT, DELETE, REFERENCES, TRIGGER and TRUNCATE already granted
-- to both `anon` and `authenticated`. A migration that only adds grants
-- therefore leaves an anonymous client holding six privileges on this table,
-- with RLS as the single thing standing between a stranger and someone's
-- answers. Measured on the first version of this migration, not assumed.
--
-- So: take everything away, then hand back exactly what is needed.
revoke all on public.person_facts from public;
revoke all on public.person_facts from anon;
revoke all on public.person_facts from authenticated;

-- `anon` is deliberately given nothing at all. An unauthenticated client has no
-- business here, and no privilege is a stronger statement than a policy that
-- happens to match no rows.
--
-- No UPDATE for anyone either: append-only is enforced by the database rather
-- than by convention. A correction is a newer fact, never an edit. This and the
-- absent UPDATE policy below are belt and braces; either alone would do.
grant select, insert, delete on public.person_facts to authenticated;

-- `service_role` keeps the privileges it already has. It never reaches a
-- browser, and the delete-account Edge Function will need them.

-- `to authenticated` keeps an anonymous client from even reaching the predicate.
-- The `(select auth.uid())` form lets Postgres evaluate it once per statement
-- rather than once per row.
create policy "read own facts"
  on public.person_facts for select
  to authenticated
  using ((select auth.uid()) = user_id);

-- `with check` is what makes the ownership claim above true: it rejects a spoofed
-- user_id instead of trusting the column default to have been left alone.
create policy "append own facts"
  on public.person_facts for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

-- Delete exists because "forget everything" has to actually work. It is the only
-- destructive right a client is given.
create policy "delete own facts"
  on public.person_facts for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Deliberately absent: any UPDATE policy. Append-only is a product guarantee, so
-- the database offers no way to edit a fact, only to add a newer one.
