# Proposal: cloud persistence with Supabase

**Status: proposal. Nothing here is implemented.** No Auth, no tables, no
migrations, no RLS, no client code, no sync. The CLI is installed and the project
is linked (`oejjomqrugsgpunzmhnd`), which is tooling and changes nothing about the
app.

This document exists because `CLAUDE.md` §8 requires the migration boundary to be
proposed before implementation. The decisions still needing your approval are
collected at the end.

---

## 1. What exists today, and what must survive

The app is a static export with no server. `lib/person/store.ts` is the only
module that touches storage, with two backends behind one API: **local** (a single
`localStorage` key, `thrive.person.v1`) once consent is given, and **memory** when
it is not.

```ts
type PersonFact = { id, key, value, source, learnedAt }
type PersonStore = { version: 1, consentAt, locale, theme?, facts: PersonFact[] }
```

Guarantees currently enforced, all asserted by `pnpm verify` (40 checks):

| # | Guarantee | Where it lives |
| --- | --- | --- |
| G1 | Nothing is written without consent | the `mode === 'local'` check in `commit()` |
| G2 | Declining leaves **no key at all** | check 5e, 17b |
| G3 | Memory mode is genuinely non-persistent | `set()` without `write()` |
| G4 | Facts are append-only; state is newest-per-key | `remember()`, `current()` |
| G5 | Corrupt data degrades, never white-screens | `parse()` |
| G6 | **No request leaves the browser** | check 9 |
| G7 | No wrong first frame | `status !== 'ready'` gate, theme bootstrap |
| G8 | `/you` can show everything and delete everything | `/you`, `forgetEverything()` |

**G6 is the one this proposal breaks by design.** Everything else must survive
unchanged, and G6 must survive *in local-only mode* — which means check 9 becomes
conditional on the mode rather than deleted.

Three consequences of having no server, which shape everything below:

- No `@supabase/ssr`, no middleware session refresh, no server-side guard.
- The browser client and a publishable key only. **RLS is not one layer of
  several — it is the only thing between one person's answers and another's.**
- Anything `NEXT_PUBLIC_*` is inlined into JavaScript at build time and is
  readable by anyone who loads the page.

---

## 2. Local-first vs hosted development

**Recommendation: develop against a local stack; treat the hosted project as
deploy target and final check.**

| | Local (`supabase start`) | Hosted only |
| --- | --- | --- |
| Cost of an RLS mistake | a throwaway container | real data, real exposure |
| Throwaway users for isolation tests | trivial, instant | pollutes a real project |
| Reset | `supabase db reset` | destructive and slow |
| Requires | Docker Desktop running | nothing |
| Email delivery | Inbucket catches everything locally | real email, rate-limited |

The deciding factor is that the entire security model is RLS, and RLS is only
believable if you can run cross-user tests as two real users repeatedly. That
needs a database you can wreck. The cost is Docker on Windows.

Migrations live in `supabase/migrations/`, are applied locally with
`supabase db reset`, and reach the hosted project with `supabase db push` — so
the hosted schema is never edited by hand in the dashboard.

---

## 3. Authentication

**Recommendation: email one-time code (OTP), no password, no OAuth initially.**

Why, specifically for a static site on a subpath:

- **No redirect URL, no callback route.** Magic links and OAuth both return to a
  URL that must be allowlisted and parsed client-side; with `basePath` and
  `trailingSlash` on GitHub Pages that is a fiddly surface with a real chance of
  a link that works locally and breaks in production. A six-digit code entered in
  the app needs none of it.
- **It reuses a pattern the app already has.** The onboarding is a sequence of one
  question at a time; "what is your email" then "what was the code" is the same
  shape, and fits the existing `QuestionCard`/`TextAnswer` components.
- **No passwords** means no password requirements, no reset flow, no leaked
  password to worry about.

Costs to accept: an email round trip on every new device, and Supabase's built-in
SMTP is rate-limited and not for production — a custom SMTP provider is needed
before anyone but you uses it.

**Session persistence is a genuine fork**, because a session token is itself a
write to the device:

| Option | Consequence |
| --- | --- |
| `persistSession: true` | Stays signed in across reloads. Writes `sb-*` keys to `localStorage`, so the app no longer owns exactly one key — G2's test needs restating as "no `thrive.*` key and no `sb-*` key". |
| `persistSession: false` | Session lives in memory; a reload signs you out. Preserves the current "one key, and only with consent" cleanliness at a real usability cost. |

Recommendation: `persistSession: true`, **but only reachable after device consent**
(see §9), and `/you` must disclose the session keys as something stored.

---

## 4. How `PersonFact` maps to Supabase

It maps one-to-one, which was the point of the shape:

| `PersonFact` | column |
| --- | --- |
| `id` | `id uuid primary key` — the **same** UUID the client generated |
| `key` | `key text` |
| `value` | `value text` |
| `source` | `source text` |
| `learnedAt` | `learned_at timestamptz` |
| — | `user_id uuid` (ownership, added by the server default) |

Reusing the client's UUID as the primary key is what makes import and sync
idempotent: the same fact inserted twice is a primary-key conflict, not a
duplicate. `on conflict (id) do nothing` makes every push safe to retry.

Append-only maps onto an append-only table, and newest-per-key onto a view.

---

## 5. Proposed schema

```sql
-- supabase/migrations/<timestamp>_person_facts.sql

create table public.person_facts (
  id          uuid primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key         text not null check (length(key) between 1 and 128),
  value       text not null check (length(value) <= 10000),
  source      text not null check (length(source) between 1 and 64),
  learned_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index person_facts_user_key_idx
  on public.person_facts (user_id, key, learned_at desc);

alter table public.person_facts enable row level security;

-- Append-only, enforced by the database rather than by convention:
revoke update on public.person_facts from anon, authenticated;
```

Newest-per-key as a view:

```sql
create view public.person_current
  with (security_invoker = on) as   -- REQUIRED: without it the view runs as its
                                     -- owner and bypasses the policies below
select distinct on (user_id, key) *
from public.person_facts
order by user_id, key, learned_at desc;
```

`security_invoker = on` is the single most dangerous omission available here: a
view over an RLS table without it returns **everyone's** rows.

`on delete cascade` means deleting the auth user removes their facts — relevant to
§16.

**Settings (`locale`, `theme`, `consentAt`) get no table.** See §12.

---

## 6. Ownership model

- `user_id` defaults to `auth.uid()` and is **never sent by the client**. A client
  that tries to set it is rejected by the insert policy below rather than trusted.
- No anonymous rows. Unauthenticated users have no access at all.
- One row belongs to exactly one user; there is no sharing, no household, no
  therapist view. Sharing is a later product decision with its own security
  review, and the schema deliberately does not anticipate it.

---

## 7. RLS policies

```sql
create policy "read own facts"
  on public.person_facts for select
  to authenticated
  using (auth.uid() = user_id);

create policy "append own facts"
  on public.person_facts for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "delete own facts"
  on public.person_facts for delete
  to authenticated
  using (auth.uid() = user_id);

-- Deliberately absent: any UPDATE policy. Append-only is a product guarantee
-- (G4), so the database offers no way to edit a fact, only to add a newer one.
```

Notes on why each clause is written that way:

- `to authenticated` rather than `to public`: an anonymous client should not even
  reach the `using` expression.
- `with check` on insert is what makes §6 true — it rejects a spoofed `user_id`
  instead of relying on the column default.
- Delete is permitted because `/you`'s "forget everything" must actually work
  (G8). Delete is the only destructive right a client gets.

---

## 8. Cross-user isolation: explicit requirements

These are requirements, not suggestions. They run against the local stack with two
throwaway users, A and B, and **must be automated** — an isolation guarantee that
is only ever checked by hand is not a guarantee.

| # | Test | Expected |
| --- | --- | --- |
| I1 | A selects with no filter | only A's rows, never B's |
| I2 | A selects `person_current` | only A's rows (catches a missing `security_invoker`) |
| I3 | A inserts a row with `user_id = B` | rejected by `with check` |
| I4 | A deletes B's row by id | 0 rows affected |
| I5 | A updates own row | rejected — no update policy exists |
| I6 | anon selects anything | 0 rows |
| I7 | anon inserts | rejected |
| I8 | A signs out, then repeats I1 | 0 rows |
| I9 | B's row count is unchanged after every A operation above | exact count match |

I2 and I5 are the two that would silently pass code review and fail in reality.

Additionally: the publishable key must be confirmed to grant nothing on its own —
running the whole suite with only the key and no session must produce zero rows
and zero successful writes.

---

## 9. How consent semantics change

Today there is one question: *may this device remember?* Cloud persistence splits
it in two, and conflating them would be the dishonest move.

| | Device storage | Cloud storage |
| --- | --- | --- |
| Question | may this device remember? | may this leave the device? |
| Asked | first screen, as today | only when signing in |
| Declining | memory mode, nothing written | local mode, no account |

**Recommendation: cloud requires device consent first, and is never offered to
someone who declined.** Two reasons. A session token is a device write, so
offering an account to someone who declined device storage would require either
breaking G2 or a memory-only session that logs them out on reload. And someone
who just said "don't write to my device" is not the person to ask "may I put this
on a server".

So the modes become, in increasing order of what is stored:

1. **memory** — declined. Nothing written. Unchanged.
2. **local** — consented. One key on the device. Unchanged, and remains the
   default: signing in is opt-in, never a prompt on arrival.
3. **cloud** — consented and signed in. Device keys plus rows on a server.

The sign-in screen must say plainly, before the email field, that this sends
answers to a server outside the device, and that it can be undone.

---

## 10. What `/you` and the privacy copy must become

This is not a copy tweak; it is the honesty of the product. `/you` currently says:

> This has never left this browser: there is no server, no account, and nothing is
> sent anywhere.

In cloud mode **that sentence is false**, and a false version of it is worse than
having never made the claim. Required changes:

- `/you` gains a third intro variant for cloud mode, naming where data is (a
  Supabase project, its region), that it is tied to an account, and that other
  signed-in people cannot read it.
- `/about` §"Where your answers live" gains the same three-way split. The current
  text names one `localStorage` key as the whole story.
- `/you` should list **what else** is stored, not just facts: the session keys
  (`sb-*`), the locale and theme preferences. "Everything I know" is a claim that
  should include the boring entries.
- All of it in both catalogs; a missing German key fails the build.

The existing German/English tone rules apply — plain, unhurried, `du`.

---

## 11. Local-only and cloud modes, side by side

| Behaviour | local | cloud |
| --- | --- | --- |
| Source of truth | the device | the device, mirrored to the server |
| Writes | `localStorage` | `localStorage`, then pushed |
| Reads | `localStorage` | `localStorage`, reconciled on load |
| Network | none | on load, on write, on sign-in |
| Works offline | completely | completely, see §14 |

**Recommendation: local-first with a cloud mirror, not cloud-as-source-of-truth.**
The local path already works, is already tested, and is what keeps the app usable
with no network and instant on every interaction. Making the server authoritative
would introduce loading states and failure modes on every screen for a benefit
(multi-device) that a mirror also provides.

---

## 12. What stays local, permanently

- **`theme`** — a device preference. A phone at night and a laptop at work
  legitimately differ; syncing it would be a bug that looks like a feature.
- **`locale`** — same argument, weaker. Recommended local for now.
- **`consentAt`** — describes *this device*, so it cannot be meaningful elsewhere.
- **The store `version`** — a local format concern.

Consequence: no settings table, no `updated_at` scalars, and therefore no
last-write-wins merge to get wrong. Only facts sync, and facts cannot conflict
(§13). This is the single biggest simplification available, which is why it is
recommended rather than "sync everything".

---

## 13. Conflict and sync behaviour

Append-only plus client-generated UUIDs means **the merge is a set union and
conflicts are impossible**. There is no last-write-wins, no vector clock, no
"which version wins" dialog:

```
after sync, both sides hold:  local_facts ∪ cloud_facts
```

- **Push**: insert every local fact not known to be on the server, with
  `on conflict (id) do nothing`. Safe to retry, safe to run twice, safe if two
  devices push the same imported fact.
- **Pull**: select rows where `created_at > last_pull`, insert any unknown `id`
  into the local store. Keep `last_pull` local.
- **Deletes are the one asymmetry.** Deletion is not append-only, so a fact
  deleted on device A and pulled by device B would reappear. Recommendation: treat
  "forget everything" as a whole-account operation (§16) rather than supporting
  per-fact deletion, which sidesteps the need for tombstones entirely. If
  per-fact deletion is ever wanted, it needs a `deleted_facts` table and a rule,
  and that is a separate proposal.

Ordering: `learned_at` comes from the client and is only as trustworthy as the
device clock. It orders one person's own answers, which is all G4 needs, and
`created_at` (server) is used for pull windows.

---

## 14. Offline behaviour

The app must remain fully usable offline, because it is fully usable offline
today and losing that would be a regression.

- Every write lands in `localStorage` first and is acknowledged immediately. The
  UI never waits on the network.
- Unpushed facts are identified by comparing against a local `pushed` marker, not
  by a queue that could be lost — the facts *are* the queue.
- The next successful push flushes everything outstanding, in one call.
- No spinner, no toast, no "sync failed" interruption. At most a quiet line on
  `/you` saying when it last reached the server.

---

## 15. When Supabase is unavailable

Same path as offline, and it must be indistinguishable to the person: writes
succeed locally, reads come from the device, nothing blocks and nothing is lost.

- Sign-**in** is the only genuinely network-dependent action, and its failure is
  visible and explicit, because it cannot be faked.
- An expired or rejected session must not silently drop to local mode while the
  copy still claims cloud sync. It should say the account needs signing in again,
  and keep working locally in the meantime.
- No retry storm: one attempt per app load plus one per write, then wait.

---

## 16. Deletion, forget-everything, and logout

**"Forget everything" in cloud mode must delete both sides**, in this order:
delete the server rows (RLS-scoped), confirm, then clear the device. Local-first
ordering matters: if the local clear happened first and the server delete failed,
the data would be silently retained on a server the person believes they emptied.
If the server delete fails, say so and change nothing.

**There is a hard limitation to decide on.** Deleting the rows is possible from
the client; deleting the **auth user** is not — `auth.admin.deleteUser` needs the
service role key, which must never reach the browser (§18). With no server, there
are two options:

| Option | Consequence |
| --- | --- |
| Accept it | Rows are gone, the account row and its email remain in `auth.users`. "Forget everything" must then say exactly that, or it is a lie. |
| One Edge Function | A `delete-account` function holding the service role key server-side. Genuinely deletes the user, `on delete cascade` removes the facts. **But it introduces server-side code**, which the current phase excludes — an explicit architectural decision. |

**Logout** is separate from deletion and must not be confused with it in the UI:
sign out, clear the `sb-*` keys, and **keep the local data**, since device consent
still stands and the person did not ask to forget anything. The copy must say
which of the two just happened.

---

## 17. Static-export compatibility

Everything proposed here is client-side and compatible:

- No route handlers, no server actions, no middleware, no cookies. Sessions live
  in `localStorage` (or memory), not cookies, which is exactly why no server
  session refresh is needed.
- Email OTP needs no callback route, so no new prerendered page and no
  interaction with `basePath`/`trailingSlash`. (Magic links or OAuth would; that
  is part of why OTP is recommended.)
- Supabase's client is a runtime dependency added to the bundle — the first
  runtime dependency this project has taken. Worth stating plainly, since
  `CLAUDE.md` notes there are deliberately none.
- Env values are inlined at build time, so **rotating the publishable key
  requires a rebuild and redeploy**, not just a dashboard change.

---

## 18. Environment variables and security boundaries

| Variable | Value | Browser-safe? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://oejjomqrugsgpunzmhnd.supabase.co` | Yes — public by design |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable (anon) key | Yes — grants nothing without a session and RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Never.** Not in the client, not in the repo, not in a Pages build. |

- Both public values are **inlined into the JavaScript** by the static export.
  Treat them as printed on the page, because effectively they are.
- The service role key bypasses RLS entirely. In this architecture there is
  nowhere legitimate to use it, so the correct handling is that it never enters
  the project at all. If §16's Edge Function is approved, it lives in Supabase's
  function secrets and nowhere else.
- `.env*` is already gitignored; `supabase/.gitignore` additionally excludes
  `.env.keys` and `.env*.local`.
- For the Pages build these are repository **variables**, not secrets — marking a
  value secret that is then printed into a public bundle teaches the wrong lesson
  about which values are which.
- Guard to add: a check that fails the build if any bundled file contains a
  `service_role` JWT, so the boundary is enforced rather than remembered.

---

## 19. Migration and versioning strategy

- **Cloud schema**: `supabase/migrations/`, applied with `supabase db reset`
  locally and `supabase db push` to the hosted project. Never edited in the
  dashboard, or the migration history stops describing reality.
- **Local store**: stays `version: 1`. Cloud mode adds no field to the persisted
  shape except sync bookkeeping (`lastPulledAt`, pushed markers), which are
  optional fields for the same reason `theme` was — a version bump makes `parse()`
  reject every existing store and silently discard real answers.
- **Rollback**: because local remains the source of truth, abandoning the cloud
  is deleting the tables and the client code. Nobody loses anything. Preserving
  that property is worth more than any convenience that would break it.

---

## 20. Smallest recommended implementation sequence

Each step is independently reviewable, and the app keeps working after every one.

1. **Database only, no app code.** Local stack, the migration in §5, the policies
   in §7, and the isolation suite in §8 as a script. Nothing imports Supabase in
   the app yet. *This step is where the security model is either right or wrong,
   so it lands alone.*
2. **The store gains a `cloud` mode** behind the existing interface, with no UI
   and no sign-in — reachable only from a test. `pnpm verify`'s check 9 becomes
   mode-conditional here.
3. **Sign-in and sign-out**, with copy in both languages, plus §10's mode-aware
   `/you` and `/about`. Still no sync: signing in changes only what is displayed.
4. **Push, then pull.** One-time import of existing local facts (§21), then the
   union merge from §13.
5. **Forget-everything and logout semantics** from §16.
6. **A cloud-mode verification suite** against the local stack, mirroring the
   existing 40 checks: two users, offline behaviour, unavailable-server behaviour.

---

## 21. One-time import after first login

On the first sign-in on a device that has local facts:

- **Ask, do not assume.** The person consented to local storage, not to an upload.
  One screen: "You have N answers on this device. Add them to your account?" —
  with declining meaning they stay local only.
- The import inserts existing facts **with their existing UUIDs and `learnedAt`
  values**, so history is preserved and a repeat import is a no-op.
- Nothing is deleted locally afterwards; the local copy remains the working set.
- If the same local data is imported from two devices, the UUIDs make it one set
  of rows, not two.

---

## Decisions that need your approval before implementation

1. **Auth method** — email OTP (recommended), or magic link / OAuth despite the
   redirect-URL cost on a Pages subpath?
2. **Session persistence** — `persistSession: true` with `sb-*` keys on the device
   (recommended), or memory-only sessions that log out on reload?
3. **Cloud requires device consent** (recommended), or should someone who declined
   still be offered an account?
4. **Local-first with a cloud mirror** (recommended), or cloud as the source of
   truth?
5. **Account deletion** — accept that the `auth.users` row survives and say so in
   the copy, or approve **one Edge Function** with the service role key, which
   introduces server-side code this phase currently excludes?
6. **Do `locale` and `theme` stay device-local** (recommended), or sync?
7. **Per-fact deletion** — out of scope, keeping sync conflict-free (recommended),
   or in scope with tombstones?
8. **Accepting the first runtime dependency** (`@supabase/supabase-js`), against
   `CLAUDE.md`'s note that there are deliberately none.
9. **Custom SMTP** before anyone but you signs in — needed, or is the built-in
   rate-limited sender fine for now?
10. **The claim on `/you`** — I need your wording direction for cloud mode, since
    "never left this browser" becomes false and this is the sentence the product's
    credibility rests on.
