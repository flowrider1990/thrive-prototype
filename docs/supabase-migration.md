# Cloud persistence with Supabase

**Status: implemented 2026-08-18.** Phases 1 to 6 are done — the table, RLS,
email-OTP sign-in, import/push/pull, deletion on both sides, and the
`delete-account` Edge Function. Phase 7 exists in a different shape than planned:
rather than mirroring the browser suite for cloud mode, the cloud contract is
covered by `pnpm check:sync` against the real database with two throwaway users,
and `pnpm verify` covers the screens signed out. See "What was built" below for
where the implementation departs from this plan, and why.

The sections below are the **approved design**, kept as written so the reasoning
survives. Where the build differs from them, the difference is recorded rather
than the plan quietly edited.

This document exists because `CLAUDE.md` §8 requires the migration boundary to be
proposed before implementation. The approved decisions are recorded below, the
phases are in §20, and the few questions still open are at the end.

## Decisions (approved 2026-08-11)

| # | Decision | Section |
| --- | --- | --- |
| D1 | **Local-first**, with Supabase as a cloud **mirror** — the device stays the source of truth | §11 |
| D2 | Cloud functionality **requires the existing device-persistence consent**; it is never offered to someone who declined | §9 |
| D3 | `@supabase/supabase-js` is approved as the **first runtime dependency** | §17 |
| D4 | **Email OTP** initially, not magic links or OAuth | §3 |
| D5 | `locale` and `theme` stay **device-local** and never sync | §12 |
| D6 | `PersonFact` stays **append-only**; no `UPDATE` is granted to anyone | §5, §7 |
| D7 | Existing local data is imported **only after explicit confirmation** | §21 |
| D8 | The app **keeps working locally** when Supabase is unavailable | §14, §15 |
| D9 | Full "forget everything" **eventually deletes cloud data and the auth account** | §16 |
| D10 | A **narrowly scoped Edge Function** may hold the privileged credential for D9 — **for that purpose only**, and this does not open the door to a general server-side architecture | §16, §18 |

D10 is a deliberately small exception to "no server". The guard against it
spreading is written into §16 and §18 as requirements, not left to memory.

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
| G8 | `/data/stored/` can show everything and delete everything | `/you`, `forgetEverything()` |

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

### Sign-up is closed, server-side, as of 2026-08-14

`[auth] enable_signup = false` in `supabase/config.toml`, pushed to the linked project with
`supabase config push`. Verified twice, and the verification is the point:

- `GET /auth/v1/settings` → `disable_signup: true`
- `POST /auth/v1/signup` with nothing but the publishable key → `422 signup_disabled`

**It was open, and that was measured rather than assumed.** The same probe, run before the
change, created a *confirmed* account — `mailer_autoconfirm` is on — using only the
publishable key. That key is a browser key, not a secret: it ships in the bundle by design
(§18). So "no UI offers sign-up" was never a gate, and this is what a gate looks like.

Nothing in `app/` or `components/` imports Supabase yet, so no product behaviour depended on
this in either direction. The exposure was on the project, not in the deploy.

Two things worth knowing before this is turned back on:

- **`[auth.email] enable_signup` stays `true`, and the distinction is easy to get wrong.**
  That flag is the email *provider*, not the gate. Setting it to `false` removed email from
  the project's enabled providers altogether — which would stop an invited user signing
  **in**, not just stop a stranger signing **up**. The master switch closes sign-up on its
  own; the probe confirms it with the provider left enabled.
- **`config push` sends the whole auth block**, so it is not a scalpel. Pushing it wrote the
  CLI's stock local defaults over two settings that had to be put back — `max_frequency`
  (1m → 1s, a loosened email rate limit) and `otp_length` (8 → 6). `site_url` and
  `additional_redirect_urls` were pointed at the real Pages origin in the same change, rather
  than pushing `127.0.0.1` onto a hosted project. Anyone pushing this file again should read
  the diff the CLI prints, not just approve it.

Turning sign-up back on is part of the cloud-sync work, and it needs an invite or allow-list
decision made at the same time — an open endpoint with `mailer_autoconfirm` on means anyone
with the URL has an account.

### The method

**Decided (D4): email one-time code (OTP), no password, no OAuth initially.**

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

**Still open (O1).** D2 settles the precondition — sign-in is only reachable after
device consent — which makes `persistSession: true` coherent, since consent to
device writes already exists. That is the default this plan assumes, and it needs
one word of confirmation before Phase 3. Either way `/you` must disclose the
session keys as something stored (§10).

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

**Decided (D2): cloud requires device consent first, and is never offered to
someone who declined.** Two reasons. A session token is a device write, so
offering an account to someone who declined device storage would require either
breaking G2 or a memory-only session that logs them out on reload. And someone
who just said "don't write to my device" is not the person to ask "may I put this
on a server".

One consequence D2 forces, worth naming because it is easy to miss: **"forget
everything" must also sign out.** It returns the store to `undecided`, and cloud
mode requires consent — so staying signed in afterwards would be a state this
decision says cannot exist.

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

**Decided (D1): local-first with a cloud mirror, not cloud-as-source-of-truth.**
The local path already works, is already tested, and is what keeps the app usable
with no network and instant on every interaction. Making the server authoritative
would introduce loading states and failure modes on every screen for a benefit
(multi-device) that a mirror also provides.

---

## 12. What stays local, permanently — decided (D5)

- **`theme`** — a device preference. A phone at night and a laptop at work
  legitimately differ; syncing it would be a bug that looks like a feature.
- **`locale`** — same argument, weaker, and decided the same way.
- **`consentAt`** — describes *this device*, so it cannot be meaningful elsewhere.
- **The store `version`** — a local format concern.

Consequence: no settings table, no `updated_at` scalars, and therefore no
last-write-wins merge to get wrong. Only facts sync, and facts cannot conflict
(§13). This is the single biggest simplification available, which is why it is
recommended rather than "sync everything".

### One fact key never syncs: `consent_concern`

"Only facts sync" means *all* of them, and there is exactly one exception. It has
to be written down here, because the exception lives in code that a cloud push
would not go through.

`consent_concern` holds what someone said when they declined saving. It is the one
key promised never to reach the device, and the reason is that persisting it would
be the single write that proves the objection right. `lib/person/schema.ts` names
it in `MEMORY_ONLY_KEYS`, and `write()` in `lib/person/store.ts` drops those keys
on the way to `localStorage`. `scripts/verify.mjs` §39 walks the path that made
this necessary: declining, saying why, then turning saving on from `/data/`, which
hands the store a snapshot gathered while nothing was being written.

**That filter does not protect a server.** `write()` guards one destination, and
the in-memory snapshot deliberately still holds the concern so `/data/stored/` can
show it back for the rest of the visit. A push reads `facts` from that snapshot,
not from `write()`'s output — so an upload written the obvious way sends the one
value that was given precisely because nothing was being sent anywhere. That is a
worse version of the local bug, because a server copy is not the person's to
clear.

So, when Phase 4 lands:

- **Apply `MEMORY_ONLY_KEYS` in the push path**, at the point rows are built, not
  at a call site that happens to know about consent. Same reasoning as filtering in
  `write()` rather than in `grantConsent()`: the guarantee has to hold for paths
  that do not exist yet.
- **Filter the import count too** (§21). "You have N answers on this device" must
  not count an answer it is not going to send, or the number is a small lie on the
  one screen that asks permission to upload.
- **A pull can never bring it back**, since it was never sent — the same property
  §39e checks locally.
- **Assert it, do not assume it.** The Phase 7 cloud suite needs the §39 walk with
  a server on the other end: decline, say why, sign in, import, then query
  `person_facts` as that user and require zero rows with `key = 'consent_concern'`.

Nothing here changes the shape of `person_facts` (§5): the key is simply never a
row. Deliberately not solved by a database constraint — a `check (key <>
'consent_concern')` would turn a client bug into a failed insert that the sync
code then has to interpret, and the honest place to not send something is before
sending it.

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

**Deleting the auth user: decided (D9, D10).** Rows can be deleted from the client;
the `auth.users` row cannot — `auth.admin.deleteUser` needs the service role key,
which must never reach a browser (§18). So a **single Edge Function** is approved
to hold that credential, for this purpose only.

### The `delete-account` function: scope and requirements

This is the only server-side code in the project, and D10 says it stays that way.
These are requirements, because a function that deletes accounts is the most
dangerous thing here by a wide margin:

- **It takes no user identifier.** The caller's identity comes from verifying the
  `Authorization` bearer token and reading `auth.uid()` from it. A function that
  accepts an id in the body is account-deletion-as-a-service for anyone who finds
  the URL. Any id in the request body must be ignored, not validated.
- **No token, no work.** A missing, malformed or expired JWT returns 401 before
  anything else happens.
- **It deletes exactly one account** — the caller's — and nothing else. It runs no
  queries a client could have run itself, and takes no other parameters.
- **The service role key comes from function secrets** at runtime, never from the
  repository and never from a build.
- **`on delete cascade`** on `person_facts.user_id` is what removes the facts, so
  the function does not need table access at all.
- It is deployed with `supabase functions deploy delete-account`, and its source
  lives in `supabase/functions/delete-account/`.
- **Not a precedent.** Any second function, or any widening of this one, is a new
  architectural decision needing its own approval. If a future task reaches for
  "just add an endpoint", that is the signal to stop and ask.

Because deletion is now genuine, the copy can say plainly that everything is
gone — which is the point of D9. Ordering: cloud rows first (or the cascade), then
the local clear, then sign-out (§9). If the server step fails, nothing local is
touched and the person is told.

**Logout** is separate from deletion and must not be confused with it in the UI:
sign out, clear the `sb-*` keys, and **keep the local data**, since device consent
still stands and the person did not ask to forget anything. The copy must say
which of the two just happened.

---

## 17. Static-export compatibility

Everything in the **app** stays client-side, and the static export is unaffected.
D10's Edge Function is not part of the export at all: it is deployed to Supabase,
not to Pages, and the app reaches it with one authenticated `fetch`. So the export
keeps its property that the whole build is `out/` and any static host can serve it.

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
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | the publishable key (`sb_publishable_…`) | Yes — grants nothing without a session and RLS |
| `SUPABASE_SERVICE_ROLE_KEY` | the service role key | **Never in the browser, never in the repo, never in a Pages build.** It exists in exactly one place: the `delete-account` Edge Function's secrets (D10). |

- Both public values are **inlined into the JavaScript** by the static export.
  Treat them as printed on the page, because effectively they are.
- The service role key bypasses RLS entirely, so there is exactly one legitimate
  use of it (§16) and exactly one place it may live: the Edge Function's secrets,
  set with `supabase secrets set`. It must never appear in `.env` files that the
  Next build reads, because anything the build can read can end up in the bundle.
- **A key named `NEXT_PUBLIC_*` that holds a service role key would be a
  catastrophe**, since the export inlines it. The build guard below exists to make
  that impossible rather than merely forbidden.
- `.env*` is already gitignored; `supabase/.gitignore` additionally excludes
  `.env.keys` and `.env*.local`.
- For the Pages build these are repository **variables**, not secrets — marking a
  value secret that is then printed into a public bundle teaches the wrong lesson
  about which values are which.
- Guard to add: a check that fails the build if any bundled file contains a
  `service_role` JWT, so the boundary is enforced rather than remembered.

### Publishable key, not the legacy anon key (settled during connectivity work)

This section originally said "the publishable (anon) key", treating the two as one
thing. They are not. The project has four keys: legacy `anon` and `service_role`
JWTs, and the current `sb_publishable_…` / `sb_secret_…` pair. **The publishable
key is what the browser gets**; the legacy `anon` JWT exists for compatibility
only. `scripts/check-supabase.mjs` asserts the configured key starts with
`sb_publishable_`, so a legacy JWT is now a failure rather than a silent
substitution.

Two platform changes found in the Supabase changelog while wiring this up, both of
which affect this plan:

- **The OpenAPI spec at `/rest/v1/` is secret-key-only** (removed for anon keys,
  effective 2026-04-08). It answers a publishable key with
  `401 Secret API key required`. That rules it out as a reachability probe — and
  makes it a useful *positive control* instead: check 6 fails only if our key is
  ever **accepted** there, which would mean it is not really a publishable key.
- **Tables are no longer auto-exposed to the Data API** (2026-04-28, opt-in
  required by 2026-10-30). Privileges and RLS are two separate questions, and RLS
  on an unreachable table is not the same as a reachable table with policies.

**Correction, measured on this project (2026-08-11).** The bullet above led to the
wrong conclusion in practice: the danger was not too few grants but too many.
Supabase's `ALTER DEFAULT PRIVILEGES` on the `public` schema gave the newly created
`person_facts` **six privileges to `anon`** — `SELECT`, `INSERT`, `DELETE`,
`REFERENCES`, `TRIGGER`, `TRUNCATE` — before any grant of ours ran. A migration
that only adds grants therefore leaves an anonymous client fully privileged on the
table, with RLS as the only thing in the way.

So the rule for every future table in `public` is **revoke first, then grant back**:

```sql
revoke all on public.<table> from public, anon, authenticated;
grant select, insert, delete on public.<table> to authenticated;
```

Verified after the fact with `information_schema.role_table_grants`, where `anon`
no longer appears at all. An isolation check that only asserts "an anonymous client
sees no rows" cannot detect any of this, because RLS makes that true either way —
which is why `scripts/check-rls.mjs` requires the refusal to read
`permission denied for table`.

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

## 20. Implementation phases

Seven phases. Each is independently reviewable, each ends with the app working and
`pnpm verify` green, and **each keeps G1–G8 true** (§1) — with G6 becoming
mode-conditional in Phase 2 and nowhere else.

The ordering has one principle: the security model is settled before a single line
of the app can touch it, and the honesty of the copy never lags behind what is
actually stored.

### Phase 1 — Database and isolation, with no app code

- `supabase/migrations/0001_person_facts.sql`: the table (§5), the index, RLS
  enabled, `revoke update`, the three policies (§7), and the
  `person_current` view **with `security_invoker = on`**.
- `scripts/verify-rls.mjs`: the nine isolation requirements (§8), run against the
  **local** stack with two throwaway users, over PostgREST — the same wire the app
  will use, not just SQL-level policy checks.
- A build guard that fails if any file in `out/` contains a `service_role` JWT.
- **Exit:** I1–I9 pass locally; `pnpm verify` still 40/40; nothing in `app/`,
  `components/` or `lib/` has changed; `grep -r supabase app components lib` is
  still empty.
- **Blocked by:** nothing. Needs Docker running.

### Phase 2 — A `cloud` mode in the store, with no UI

- `@supabase/supabase-js` added (D3); a client factory reading the two public env
  vars; **nothing in the UI imports it**.
- `Mode` gains `'cloud'`; a remote interface with a no-op default; optional sync
  bookkeeping fields on the persisted shape (still `version: 1`, §19).
- `pnpm verify` check 9 becomes mode-conditional: **still zero external requests
  in local and memory mode**, which is the regression that would otherwise slip
  through unnoticed.
- **Exit:** 40/40 in local mode with zero network; cloud mode reachable only from
  a test.

### Phase 3 — Sign in, sign out, and honest copy

- Email OTP screens (D4) reusing `QuestionCard`/`TextAnswer`; sign-in reachable
  **only after device consent** (D2).
- §10's mode-aware `/you` and `/about`, in both catalogs.
- **The copy must describe this phase, not the next one.** After Phase 3 someone
  can be signed in while their answers are still only on the device, so the copy
  says exactly that. Claiming cloud storage before Phase 4 exists would be the
  dishonesty this whole document is trying to avoid.
- **Exit:** sign in and out work; `/you` is accurate in all three modes; no facts
  have left the device yet.
- **Blocked by:** O1 (session persistence) and O4 (the `/you` wording).

### Phase 4 — Import, push, pull

- The confirmation screen (D7): *N answers on this device — add them to your
  account?*, with declining leaving them local.
- Push with `on conflict (id) do nothing`; pull by `created_at` window; the union
  merge (§13).
- `MEMORY_ONLY_KEYS` applied where rows are built, so `consent_concern` is never
  uploaded and never counted on the import screen — see §12.
- Offline and unavailable behaviour (D8, §14, §15): writes land locally and are
  acknowledged immediately, always.
- **Exit:** two browsers converge on the same set; airplane mode loses nothing;
  stopping the local stack mid-session changes nothing a person can see; and after
  a decline-then-import walk, `person_facts` holds no `consent_concern` row.

### Phase 5 — Forget everything and logout, client side

- Cloud rows deleted first, then the local clear, then sign-out (§9, §16). A
  failed server step changes nothing locally and says so.
- Logout keeps local data and clears the `sb-*` keys.
- **The copy must admit what this phase cannot do.** Until Phase 6 lands, the
  account row survives a "forget everything", so the copy says so. The same rule as
  Phase 3: the words describe the phase that exists, not the one that is coming.
- **Exit:** both paths verified, and the copy distinguishes them.

### Phase 6 — The `delete-account` Edge Function

- `supabase/functions/delete-account/`, to the requirements in §16: identity from
  the verified JWT only, no id parameter, 401 without a token, one account, service
  role from function secrets.
- Tests: A cannot delete B; an unauthenticated call is refused; a deleted account's
  facts are gone by cascade.
- **Exit:** "forget everything" is literally true, and the copy can say so.
- **Blocked by:** Phase 5.

### Phase 7 — Cloud-mode verification suite

- The existing 40 checks mirrored for cloud mode against the local stack: two
  users, offline, server unreachable, expired session.
- **Exit:** one command covers both modes.

### Documentation, per phase

`CLAUDE.md` §8, §9 and §12 describe a no-server, browser-only app. From Phase 2 on
they are progressively untrue, so each phase updates `CLAUDE.md`, this file, and
`docs/person-model.md` in the same commit — §18 requires it, and stale constraints
are worse than none because they get trusted.

---

## 21. One-time import after first login — decided (D7)

On the first sign-in on a device that has local facts:

- **Ask, do not assume.** The person consented to local storage, not to an upload.
  One screen: "You have N answers on this device. Add them to your account?" —
  with declining meaning they stay local only.
- The import inserts existing facts **with their existing UUIDs and `learnedAt`
  values**, so history is preserved and a repeat import is a no-op.
- **`N` excludes memory-only keys** (§12). `consent_concern` is not uploaded, so
  counting it here would overstate what the screen is asking for.
- Nothing is deleted locally afterwards; the local copy remains the working set.
- If the same local data is imported from two devices, the UUIDs make it one set
  of rows, not two.

---

## Still open

Four questions remain. **None of them blocks Phase 1 or Phase 2**, which is why
those can start as soon as the plan is accepted.

| # | Question | Default if you say nothing | Blocks |
| --- | --- | --- | --- |
| **O1** | Session persistence: `sb-*` keys on the device, or memory-only sessions that sign out on reload? | `persistSession: true` — coherent with D2, since device consent already exists | Phase 3 |
| **O2** | Per-fact deletion: out of scope (keeps the merge conflict-free, §13), or in scope with tombstones? | out of scope; D9 covers deleting everything | Phase 5 |
| **O3** | Custom SMTP before anyone but you signs in? | built-in rate-limited sender while it is only you | Phase 3 for others, not for you |
| **O4** | The wording on `/you` in cloud mode — a draft is below | your call; I will not ship my own wording for this one | Phase 3 |

### O4: draft wording for review

`/you` currently says, in local mode:

> In your own words, exactly as you gave them. This has never left this browser:
> there is no server, no account, and nothing is sent anywhere.

Proposed cloud-mode replacement, for you to correct rather than approve blindly:

> In your own words, exactly as you gave them. These are on this device and in your
> account, on a server in Frankfurt. Nobody else signed in can read them, and
> nothing here is used to build a profile of you. You can take it all back at any
> time — forgetting everything deletes the account too.

And Phase 3 only, when signed in but not yet syncing:

> You are signed in, but nothing has been sent anywhere yet — your answers are
> still only on this device.

Three things I deliberately did **not** write, and want your view on: naming
Supabase as the provider, naming the region more precisely than "Frankfurt", and
whether to state that the operator (you) could technically read the database. The
third is the most honest and the most awkward.

---

## What was built, and where it departs from this plan

Implemented 2026-08-18, against a brief that asked for sign-in, continuous sync,
conflict resolution, and account deletion end to end. Four departures, each one a
place where the brief and this document disagreed, and each decided rather than
drifted into.

### 0. Generations, which §13 did not anticipate

§13 says conflicts are impossible, and as a statement about *data* it is still true:
append-only facts with client-generated ids cannot contradict each other, so a set
union loses nothing. What it missed is that the argument assumes the two sides are
**peers** — that neither has been declared wrong. Replace semantics break that
assumption, and the failure it produces is specific:

> Device A signs in, chooses "keep what is on this device", and the account's copy is
> replaced. Device B, offline at the time, still holds the copy that was discarded. B
> reconnects, unions, and every discarded fact is alive again.

Append-only data has no way to say "this is gone", so the union has no way to know.
Per-fact tombstones were the obvious fix and were rejected in O2 for good reasons; this
is the cheaper one.

**A generation is a stamp on the dataset as a whole.** `person_generations` is an
append-only log, one row per deliberate replacement; the current generation is the
newest row. Every fact carries the generation it was appended under, and **a fact is
active only while its generation is the current one**.

Why that closes it, and why it is still append-only: a row's generation is fixed when
it is inserted, and there is no `UPDATE` anywhere in this schema. A superseded fact
therefore *cannot* be promoted back into the current generation — not by a stale client,
not by a buggy one, not by a race. The guarantee is structural rather than a rule
somebody has to keep remembering. `pnpm check:sync` C12 is the proof: a stale device
pushes the whole discarded dataset, the rows are accepted, and the active set does not
move.

Three consequences worth having in mind:

- **The primary key is `(id, generation)`**, so the same fact can exist in two
  generations at once. That is what lets a replace stage the winning dataset *before*
  clearing the old one, so the account never holds less than it did a moment ago. Push
  idempotency becomes per-generation, which is exactly right.
- **Emptying an account mints one too.** Without it, another device would find the
  generation it already knew, conclude it was a peer of an account that had merely lost
  rows, and upload all of them again — the same bug wearing a different hat.
- **`null` and "an empty generation" are different states.** The first means the account
  has never held a dataset, and a device should upload; the second means it was reset,
  and a device should stand down. Collapsing them would make every deletion bounce.

The insert policy requires only that the generation **belongs to the caller**, not that
it is the newest. Stricter sounds better and buys nothing: a stale device writing into
its own superseded generation is writing rows that are inert by definition. What does
need preventing is stamping a row with somebody else's generation, which the foreign key
alone would allow — `check:sync` C14.

Client side: `lib/cloud/generations.ts`, and one `reconcile()` in `sync.ts` that every
entry point goes through. It adopts silently when this device's copy is wholly
superseded and it has nothing unsynced of its own, and asks otherwise — including the
guard that **an empty authoritative dataset is never adopted silently over a device that
holds something**, since that state is indistinguishable from a replace still in flight.

### 1. Conflict resolution is a **choice**, not a union (§13 said conflicts were impossible)

§13 is still true about the *data*: append-only facts with client-generated ids
cannot contradict each other, and a union loses nothing. The brief nonetheless
asked for an explicit "this device" / "my account" choice on first sign-in, with
replace semantics on both sides. Both are now in the product, and which one runs
is decided by **whether the two datasets describe the same app**:

- **equivalent** (derived current state matches) → union, silently. No question,
  nothing discarded. This is §13's behaviour, and it is what runs on every app
  load with a stored session, which is why two devices do not produce a dialog
  every morning.
- **different** → the dialog, and the loser is genuinely replaced.

So the union survives where it is provably safe, and the person is only asked
where a real disagreement exists. `lib/cloud/compare.ts` is the whole of that
decision, and `pnpm check:sync` C5–C7 are the tests of it.

`replaceWithCloud()` is the only path in the app that discards facts without
deleting everything. It is reachable from exactly one dialog, which states the
consequence.

### 2. Importing local data is no longer a separate confirmation (D7)

D7 said: ask before uploading. The brief said: case A needs no additional
confirmation. The brief won, and the reason it can is that **the sign-in dialog
itself carries the sentence** — "What is on this device is added to your account
when you sign in" — above the field, before anything is typed. That is the same
consent D7 wanted, asked once rather than twice, on the screen where the person
is already deciding.

`scripts/verify.mjs` 54e asserts that sentence is on screen before the address
field. If that copy is ever removed, the check fails, which is the point.

### 3. `theme`, `locale` and `homeView` still do not sync (D5 preserved)

The brief listed "changing settings that are part of the user's persisted app
state" among the things to sync. D5 decided the opposite for these three, and D5
stands: a phone at night and a laptop at work legitimately differ, and syncing a
theme is a bug that looks like a feature. Nothing in the brief's acceptance
criteria depends on it. Everything a person *entered* syncs; the three device
preferences do not.

### 4. Phase 7's shape

Planned: the whole browser suite mirrored for cloud mode. Built: `check:sync`,
which exercises the same rows, policies and comparison logic against the real
database, plus `check:schema`, which audits every table rather than the one we
remember. Email OTP itself is not automatable from a script — reading a code out
of an inbox is the one step a machine here cannot take — so the throwaway users
in `check-sync.mjs` sign in with a password. What that changes is only how a
session is obtained.

### The loop guard, which this document did not specify

§14 called for a "pushed marker" rather than a queue. It is `CloudMark.synced` on
the persisted store: a set of fact ids known to be in the account. Two properties
fall out of it, and the second is the one worth naming:

- the push queue is **derived** (`pendingForCloud()`), so there is no queue to
  lose and no enqueue call to forget in a code path written next year;
- facts pulled from the cloud are written **and marked synced in the same
  commit**, so the change notification they cause finds nothing to push. There is
  no "am I hydrating?" flag, because a hydrated fact is already where a push would
  send it.

### Phase 6 is deployed and tested (2026-08-19)

`delete-account` is live, and `pnpm check:delete-account` proves the §16 requirements
against it rather than against the source: no token is 401, a malformed one is 401, a
non-POST method is 405, an unknown origin is not echoed, and — the requirement that
matters most — a body naming somebody else's account deletes the **caller's** account and
leaves the named one untouched, because the function reads no body at all.

Two things §16 did not anticipate:

- **The email template cannot be pushed on this plan**, so the sign-in email carries a
  link and no code. §3 chose codes over links for good reasons that still hold; the
  obstacle is billing, not design. Custom SMTP or a plan upgrade, and the template in
  `supabase/templates/magic_link.html` goes live unchanged.
- **A deleted account's access token stays valid until it expires.** §16 said sessions
  should be revoked as part of deletion rather than assumed dead, and they are — but
  revocation stops renewal, not the token already in hand. Measured: it can read nothing,
  write nothing, and cannot be refreshed.

### What still needs doing by hand

Two of the three original items are done: the auth config is pushed (sign-up is on)
and the Edge Function is deployed and tested. **One remains, and it blocks sign-in for
real people:** the email carries a link rather than a code, and the template cannot be
replaced on the free tier with the default sender. Configure custom SMTP or upgrade the
plan, then uncomment the `[auth.email.template.magic_link]` block in
`supabase/config.toml` and push.

Also open, and a product decision rather than a technical one: sign-up is now **open
registration**. Anyone with the URL can create an empty account. RLS keeps them out of
everybody else's rows, and in practice the template blocker means they cannot finish
signing in — but that is an accident of the current state, not a control.
