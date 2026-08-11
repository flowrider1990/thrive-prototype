# Progress against `docs/plan.md`

This file records what was actually built, where reality differed from the plan,
and what is left.

**`docs/plan.md` is historical.** It is the original foundation plan, kept
unchanged on purpose, and it has been superseded as a description of current
product behaviour — it still describes a name question and a single open question,
both since removed. For what the app does today, read this file and the repository
itself.

Last worked: 2026-08-11.

## State: steps 0–11 done, verification 1–10 and 12 passing

Step 12 (push, and enabling Pages in the GitHub UI) is the only step not done —
it is the first outward-facing action, so it waits for a decision.

| Step | |
| --- | --- |
| 0. Preserve the plan | `docs/plan.md`, committed with the first commit |
| 1. pnpm | via corepack, with the caveat below |
| 2. Scaffold | Next 16.3.0, React 19.2.8, Tailwind 4.3.3 |
| 3. Pin pnpm | `packageManager: pnpm@11.18.0` |
| 4. Tidy | `AGENTS.md` kept, `CLAUDE.md` carries the project's own guidance |
| 5. Config and deploy | `next.config.ts`, `.github/workflows/deploy.yml` |
| 6. i18n | `lib/i18n/*`, both catalogs complete |
| 7. The store | `lib/person/store.ts`, both backends, consent gate |
| 8. The conversation | `app/page.tsx` + four components |
| 9. `/you` and `/about` | in-page confirm for forgetting |
| 10. Shell and styling | quiet monochrome palette, light/dark with no script |
| 11. Docs | `CLAUDE.md`, `README.md`, five `docs/*.md` |
| 12. Commit, push, enable Pages | committed; **push not done** |

## Verification

`pnpm verify` automates the plan's browser checks: it drives real headless Chrome
over the DevTools protocol against the *served static export*, with no packages
added (Node 22 has a global `WebSocket`). It covers plan items 4–10 — including
the two the plan singles out. **The current count is 78/78** (it was 25 at the
foundation and 39 after the header controls); the script itself is the only
authority on that number, so treat any count written in prose as a snapshot.

- **no flash on reload** (item 4) — sampled from `requestAnimationFrame` starting
  before the app's own scripts run, so a wrong-state frame would be caught rather
  than assumed absent; 35 frames, none containing the consent or naming question;
- **declining writes nothing** (item 5, "the critical one") — after the full flow
  in memory mode, `Object.keys(localStorage)` is `[]`. Not "no facts": no key.

The rest by hand or by build:

1. `pnpm build` clean, `pnpm lint` clean, `out/` produced. ✓
2. The export served from `out/` is what every browser check ran against. ✓
3. Deleting a key from `de.ts` fails the build with
   `TS2741: Property 'restart' is missing`. ✓
11. **Not possible yet** — needs the site deployed. The half that could be checked
    locally was: building with `PAGES_BASE_PATH=/thrive-prototype` puts every
    asset under `/thrive-prototype/_next/…`, and `out/you/index.html` exists, so a
    deep link resolves.
12. Rename rehearsal ✓ — the repo was copied to a differently-named folder without
    `node_modules`, `.next` or `tsconfig.tsbuildinfo`; `pnpm install`, `pnpm build`
    and `pnpm lint` all passed there from scratch.

## Where reality differed from the plan

- **`corepack enable pnpm` fails on this machine** with
  `EPERM … open 'C:\Program Files\nodejs\pnpm'` — the shim goes in the Node install
  directory, which needs an elevated shell. Fix, no admin required:
  `corepack enable pnpm --install-directory "$env:APPDATA\npm"`. That directory is
  npm's user prefix and already on `PATH`. Recorded in `docs/renaming.md` too,
  since a fresh clone hits it.
- **Step 3 was already done by step 2.** `pnpm create next-app` writes
  `packageManager` itself, so `corepack use pnpm@11` was never run. Left at the
  exact locally-installed 11.18.0, which serves the plan's reason for leaving
  `pnpm/action-setup` unpinned: CI cannot drift from local. pnpm reports 11.21.0 is
  available; bumping it means bumping `packageManager` in the same commit.
- **Step 4's `AGENTS.md` decision: kept, not deleted.** `next dev` rewrites that
  block on every run, so deleting it just recreates it as an uncommitted change.
  `CLAUDE.md` holds the project's own guidance above its `@AGENTS.md` reference.
- **React 19's lint rules rejected the first store.** `react-hooks/set-state-in-effect`
  and `react-hooks/refs` both fired: loading `localStorage` in a mount effect and
  setting state from it is exactly the pattern they now flag. Rewritten around
  `useSyncExternalStore`, which is the honest description of what the store is —
  an external mutable source with a build-time snapshot. This turned out better
  than the original: `getServerSnapshot()` makes the "prerendered HTML knows
  nothing" rule explicit, the load happens in `subscribe()` (which React calls
  after mount, never during render), and the React context and provider both
  disappeared. `app/page.tsx` lost its effect too — the opening step is now
  derived from `(mode, name)` rather than set from an effect.
- **Two files beyond the plan's list.** `lib/i18n/locale.ts`, because the `Locale`
  type is needed by both the i18n module and the store, and a leaf module both can
  import is what stops that being a circular import. And `scripts/verify.mjs`,
  which is the plan's own verification list turned into something repeatable —
  worth having before every deploy, not once.
- **`Messages` cannot be `as const`.** With literal types, `de.ts` could only
  satisfy `typeof en` by repeating the English strings verbatim. Widened to
  `string`, it still catches missing and misspelled keys, which is the point.
- **`innerText` reflects `text-transform`**, which cost two false failures in the
  verification script before it compared case-insensitively. Worth knowing before
  writing any further DOM assertions.

## Changes since the foundation

- **`CLAUDE.md` replaced** with the full product/engineering brief: mission, the
  Feature Manifest every feature has to pass, product and engineering
  principles, the development and git procedure, and the current constraints.
  The `@AGENTS.md` import stays at the top, which is what loads the Next.js 16
  agent rules into a session.
- **The palette is now monochrome** — `--color-accent` became a near-ink neutral
  (`#2f2e2b` light, `#e5e2dd` dark) in place of the muted green, so emphasis
  comes from contrast alone. Two token values; no component changed, because no
  component names a colour.
- **Disabled buttons were failing on contrast.** `disabled:opacity-40` on a
  filled button left the label grey-on-grey, which the monochrome palette made
  obvious. Disabled primaries now use the outlined, muted treatment instead, and
  every `.btn` carries a transparent border so gaining a visible one shifts
  nothing. Caught by screenshotting the states rather than by any test — worth
  repeating for future UI work.
- **The product name is now one edit.** The domain is not for sale, so a rename
  is likely. `lib/app.ts` holds `APP_NAME`; the header, page title and `/about`
  copy read it from there, with copy interpolating `{app}` instead of containing
  the word. `/about` interpolates the storage key too, so the page cannot drift
  from what is actually stored. Rehearsed rather than assumed: renaming to
  `Wintergreen` and rebuilding changed the header and the `/about` title while
  the saved answers survived untouched under the same key. **`STORAGE_KEY` must
  not travel with a rename** — see `docs/renaming.md`.
- **Verified at phone width for the first time** (390×844, both schemes), which
  closes a gap that had been assumption-only: the shell was previously only ever
  checked at a default headless viewport.

## Header controls (branch `feature/creating-subagents`)

Language dropdown, theme toggle, and a nav that collapses instead of wrapping.
`pnpm verify` now runs **39 checks**, all passing.

- **The language switch is a dropdown** showing the current language as a code
  (`EN ▾`), not a flag. Emoji flags were not an option: Windows has no
  country-flag glyphs, so `🇩🇪` renders as boxed letters. It is also the more
  accurate choice — flags are countries, and English is not only British.
- **A theme toggle** cycles light ↔ dark. Three states exist even though the
  button has two: until it is pressed nothing is stored and the OS decides, which
  is why the icon shows the *effective* theme. `Forget everything` is the way back
  to following the OS.
- **The theme is consent-gated** like everything else, through the store's
  `commit()`. Declining means the choice lasts the visit and no key is written —
  asserted by check 17b.
- **A pre-paint bootstrap script** (`lib/theme.ts`, first in `<body>`) applies a
  stored theme before anything is painted. Without it, a dark choice on a
  light-preference OS flashes white on every load. Check 16 samples the background
  every frame from before the app's own scripts run and asserts no light frame.
- **The nav collapses at `sm`**, and the header no longer wraps. Links are defined
  once and rendered twice, so a future entry costs nothing on a phone — the reason
  to collapse rather than shrink.
- **`components/menu.tsx`** is one shared disclosure dropdown, deliberately not
  `role="menu"`: a real menu owes the user arrow-key roving focus, and claiming
  the role without it tells screen reader users to expect keys that do nothing.

Three things worth remembering from doing it:

- **The bootstrap script needs `suppressHydrationWarning` on `<html>`.** Setting
  `data-theme` before React hydrates means the element really does differ from the
  built HTML — that difference is the point — and React reports it as a mismatch
  without the suppression. It covers that element's attributes only, so a genuine
  mismatch elsewhere still surfaces.
- **A suite that only runs against the export cannot see this.** React warns about
  hydration mismatches in development only, so 39 passing checks said nothing
  about it; it took opening the app in `pnpm dev`. Check 19 now fails on any
  console error, and it is worth running against the dev server too:
  `node scripts/verify.mjs http://localhost:3000`.

- **`theme` is optional, not `version: 2`.** A version bump would make `parse()`
  reject every existing store and discard real answers. Check 18 guards this by
  loading a store with no `theme` field.
- **Measuring "did the header wrap" is subtler than it looks.** Comparing child
  `offsetTop` fails twice over: `display:none` children report `0`, and
  centre-aligned children of different heights have different tops on the same
  line. Comparing vertical *centres* is the measure that actually works.

## Life areas, goals and next steps (branch `feature/goal-areas`)

The first product loop: five fixed life areas, one goal each where the person wants
one, up to three prepared next steps, and one being worked on. *Choose* and *Act*
of Notice → Choose → Act → Reflect → Adjust; no reflection mechanics yet.
`pnpm verify` now runs **78 checks**, all passing, against both the export and
`pnpm dev`.

Design and derivation rules live in `docs/goals-and-areas.md`. What is worth
recording here is where reality differed from the first plan.

- **The persistence boundary barely moved.** No new storage key, no `version` bump,
  no migration, no change to `parse()`, `commit()` or the consent gate. The one
  edit to `lib/person/store.ts` is exporting `newId()`, because a step's id is part
  of its keys and therefore has to exist before the first write about it.
- **Identity by text was the first plan, and it was wrong.** Using a step's words as
  its identity read well and needed no resolver on `/you`, but it collapses "walk
  for 20 minutes, done in August" and "walk for 20 minutes, worth doing again in
  October" into one thing. Ids fixed that — and turned out to make the derivation
  *simpler*: with a pointer at a step, completing it stops the pointer resolving, so
  there is no timestamp comparison and no sentinel for "nothing active".
- **The id had to go in the key, not the value.** A fact carries one string. With
  the id in the value there is no way to say "this step now reads X" without
  splitting a value, which `docs/person-model.md` forbids. `area.<a>.step.<sid>.text`
  leaves the value free to be the person's words, which is what makes editing a
  step possible at all. This was the single most load-bearing decision in the
  feature.
- **"Later" writes nothing, and that is a feature.** The area has no active step
  because the step was completed — already a recorded fact. No empty-string fact,
  no `step_later` key. The same trick means retiring a step clears the active slot
  for free.
- **Onboarding was restructured, not extended.** The name question and the open
  question are gone, so the app asks for less and feels less identifying. Both are
  **parked, not deleted**: `m.name.*`, `m.opening.*`, both `you.keys` labels and
  both `KEY_ORDER` entries stay, so anyone who already answered still sees their
  answers on `/you`. This is a deliberate exception to `CLAUDE.md` §13C's
  no-dead-code rule, agreed before implementation — not an oversight. Check 18b
  asserts the parked path still renders.
- **"Introduction finished" cannot be derived from area state.** The first attempt
  used "every area settled", which is not monotonic: completing a step and choosing
  "Later" makes an area unsettled again, and the app would have dropped someone back
  into onboarding months later. It is the count of areas with a `review` fact
  instead, which never decreases. Where an interrupted pass *resumes* is a separate,
  non-monotonic derivation. Both are in `docs/goals-and-areas.md`.
- **The accepted edge exposed a copy defect.** Closing the tab midway through the
  fifth area lands on home rather than resuming — fine in itself, but home then said
  "Nothing is active right now. That is a fine place to be." while a goal sat
  without a next step. Home now names interrupted setup, defined as *a goal with no
  step ever written*. An area paused on purpose has steps behind it and is excluded,
  because "Later" is a real answer and pointing at it would be nagging. §25 asserts
  all four properties that make the edge acceptable, including the guard that nobody
  is routed back into onboarding just because an area has no active step.
- **Two checks failed on the first run, and both were the assertion's fault, not the
  code's.** Check 4k asserted that no fact value is a UUID — but the active-step
  pointer is a UUID by design, which is what check 7f (nothing rendered contains a
  UUID) actually protects. Check 18 asserted `Hello Ada.`, a greeting that no longer
  exists; it now asserts the store was *accepted* rather than rejected, plus 18b for
  the parked answer, which is stronger than what it replaced.
- **Roughly half the suite was rewritten**, because sections 4–8 asserted the old
  onboarding by its exact copy. Nothing was weakened: the critical
  empty-`localStorage` check now runs after the whole area flow *including*
  completing a step, and append-only is now demonstrated by changing a goal twice
  rather than by renaming.
- **Screenshots caught nothing this time**, which is worth recording as well: 390px
  in both schemes, thirteen screens each, and the only thing to note is that the long
  "Remove from current steps" pill wraps onto its own line, which is what
  `flex-wrap` is for. The habit still earns its place — it is how the disabled-button
  contrast defect was found.

## UX/UI rework (branch `feature/ux-ui-rework`)

Four stages. Stage 1 is visual robustness only — no behaviour change.

### Stage 1: the surface stopped being faint

`pnpm verify` is **85 checks**, up from 78, passing against both the export and
`pnpm dev`.

- **A third border token, pinned to a number.** `--color-line-strong` sits between
  `--color-line` and `--color-muted` and must clear **3:1 against the ground**
  (WCAG 1.4.11 for a non-text UI component boundary); both themes measure 3.05:1.
  The old shared token measured **1.22:1**, which is the whole of why inactive marks
  and field borders were invisible. Separators stay on `--color-line`, which is
  decorative and exempt. Rationale in `docs/design-system.md`.
- **The progress marks differed by colour alone** between *current* and *upcoming* —
  §17 forbids exactly that, and the design-system doc claimed otherwise. Border width
  is now the second cue, which is free because `box-sizing: border-box` keeps a 12px
  box 12px at any border width.
- **The area context was detached, and size was not the fix.** It sat in an
  `space-y-8` stack equidistant from the progress marks and the question, so the
  question read as having no subject. It moved *inside* `QuestionCard` as an eyebrow,
  one tight group with the heading. Proximity did the work; the larger icon and
  `text-ink` only helped.

**Six checks would have kept printing PASS while proving nothing**, and finding that
was worth more than the checks that were added:

- **4l and 16**, the two rAF frame samplers, filter painted frames against copy
  strings. A stale needle after a copy change, or a sampler that never ran, leaves an
  empty array — and "no frame contained X" is trivially true of no frames. 4l is a
  §16 guarantee. Both now require a frame floor, and 4l has a **positive control**
  (4a2) proving that this needle and this sampler *can* see the consent screen before
  its absence is believed.
- **Check 11** (the header does not wrap at 390px) is measured on an empty store.
  Once the nav is hidden during onboarding — stage 3 — the header holds only brand,
  language and theme, so it *cannot* wrap and the check *cannot* fail. Splitting it
  into an empty-store and an onboarded case is queued with stage 3.
- **12a**, **20b**, and **7f** have the same shape of problem; all are handled in the
  stage that breaks them. 7f is the sharpest: it reads `innerText`, and the rework
  moves a step's own words into **accessible names**, which `innerText` cannot see.
- **The German theme-toggle selector has never matched anything.** It looked for
  `aria-label^="Wechsle"`; the German string is *"Zu Dunkel wechseln"*. Checks 22/23
  passed only because they happen to run in English. Fixed to a substring match.

Also: four dead `EN` fixture entries were left in place for now (`focus`,
`reconsider`, `leaveIt`, `contNo`) — they are cleaned up in the stage that rewrites
their sections.

### Stage 2: the app stopped being a to-do list

`pnpm verify` is **97 checks**, passing against both the export and `pnpm dev`.

- **The copy no longer names the concept.** "Next step" leaned task — a step is
  something you finish, and half of what belongs here is not finishable. Rather than
  pick one universal noun (task, habit, tactic, experiment) and be wrong for the
  others, the questions carry it: *What could help you move toward this goal?* /
  *What you want to try* / *How is it going?* The reasoning and the internal-vs-UI
  naming gap are in `docs/goals-and-areas.md`.
- **The persisted keys did not change**, and should not. `state` and `step_active`
  are *tokens* in the `docs/person-model.md` sense — never rendered — so `'done'` is
  an internal enum the interface can describe however it likes. The word locking the
  product into task semantics was in the copy, not the store.
- **Home's row was a trap.** The person's own words were a full-width button whose
  only content was those words; any tap completed the thing, with no confirmation, no
  undo, and looking exactly like the `.option` rows elsewhere that merely select.
  The words are now plain text and the control is explicit. §24a asserts the markup,
  §24a2 asserts that clicking the words changes nothing — **that pair is the rework**,
  and 24a2 is the one assertion that would have failed before it.
- **"How is it going?" instead of "Done".** Four answers cover both one-off and
  ongoing things, and map onto existing writers with no new fact values. Framing it
  as a question is also what keeps a future check-in from being a redesign: it asks
  the same thing on its own initiative and can offer the same four answers.
- **"Still on it" writes nothing — for now.** Recorded in
  `docs/goals-and-areas.md` as a decision with a stated expiry rather than a
  principle: once check-ins exist, the answer *and its timestamp* become the signal
  resurfacing needs, and the append-only model already supports it with no schema
  change.
- **Entries are a numbered `<ol>` with a per-entry Edit.** They used to render
  read-only with no affordance at all. The cap is now stated before the first entry
  instead of discovered at the third, and the add button changes from "Add" to
  "Add another" — §29b asserts the two labels really differ, because a bug rendering
  one label in both states would otherwise pass, `__click` finding it either way.
- **Focus management, which the codebase had nowhere.** Opening the answers moves
  focus into them; cancelling gives it back to the control that opened them. Both
  halves have to run *after* the render that changes the DOM, because the answers
  replace the trigger rather than appearing beside it — an inline `.focus()` on the
  way out is a no-op on a node React has not created yet.

Three things worth remembering from doing it:

- **Two assertions failed on the first run, and both were the assertion's fault.**
  7c counted retired facts *globally* and expected 1, which only held while setting
  something aside from Home went untested; it now measures a delta. 24k expected
  three `done` facts, from a flow that now produces two done and one retired.
- **Screenshots earned their place again.** The Edit pills wrapped onto their own
  line and read as peers of "Add another" — a stack of pills, which is exactly the
  "heavy and overly boxed" the visual direction rules out. Fixed with a `.btn-sm`
  size. And opening the answers *replaced* the row, so the question was about
  something no longer on screen; the text now stays. Neither was visible in 97
  passing checks.
- **A dropped view survived only because the suite caught it.** Restructuring
  `AreaManage` deleted its whole `add` view; check 25e failed immediately.

### Stage 3: the life areas became real routes

`pnpm verify` is **110 checks**, passing against both the export and `pnpm dev`.

- **Ten states to seven.** `/areas/` and `/areas/<id>/` used to be two states inside
  the home page's machine. `app/areas/[area]/page.tsx` is a server component for one
  narrow reason — a `'use client'` file cannot export `generateStaticParams`, which
  is a hard build error the Next docs never mention — so it awaits `params`,
  narrows the id, and delegates everything a person reads to `AreaScreen`.
- **Only the nav is gated, never the routes.** Gating a route under a static export
  means a client-side redirect, which is a flash (§9). `introductionFinished()` is now
  a named export because two callers have to agree on it, and it is derived from the
  person rather than from `localStorage` so memory mode gets the navigation too.
- **`/areas/` rows are `<a>`, not `<button>`.** They navigate; nothing on that page
  changes anything. §27b asserts the href **set**, not a count — five links all
  pointing at `body` is the copy-paste bug a count cannot see.
- **Verification item 11 from the original plan is finally closed** for the part that
  needed a nested route: §27d/§27e deep-link `/areas/body/` cold and reload it.

Three checks turned out to be unfalsifiable, and finding them was the real work:

- **11 could no longer fail.** With the nav hidden during onboarding, the header at
  390px holds only the wordmark, the language switch and the theme toggle — it
  *cannot* wrap. Split into 11a (empty store) and 11b (onboarded, nav present); 11b
  carries the original guarantee. `seedOnboarded()` exists for this and for 12/13/21/26,
  so none of them has to replay twelve clicks or couple itself to onboarding copy.
- **`!visible('Menu')` has always been true**, on every screen the app has ever had.
  `__visible` matches an element's *text*, and the collapsed-nav trigger is a
  hamburger whose name lives in `aria-label` — so check 13's "no menu trigger at
  desktop width" asserted nothing. There is now a `__shown(selector)` helper that
  asks whether something is laid out, and 13 uses it.
- **20b's premise depends on an empty store**, which was accidental before and is
  now deliberate and commented: `/` has to be the consent screen for "this page does
  not scroll" to hold. Seeding it would have made 20b fail for a reason unrelated to
  the scrollbar gutter.

And one genuine platform finding, from the new check 9b (no response ≥ 400):

- **The emitted `out/` tree is not platform-identical.** Next builds the RSC
  segment-prefetch filenames with `path.relative`, which yields `\` on Windows and
  `/` on Linux — so a Windows-built export nests `out/about/__next.about/__PAGE__.txt`
  in a *directory* while the client requests the flat `__next.about.__PAGE__.txt`.
  Verified on disk. **Pre-existing**: it already affects `/about` and `/you`, both
  older than this branch, and it costs only `<Link>` prefetch warm-up — every cold
  navigation and reload works, which §27d/§27e assert directly. 9b exempts those
  payloads and `favicon.ico`, with the reasoning written at the check, and still
  catches the thing worth catching: a document, script or stylesheet 404ing, which is
  what a dynamic route missing `generateStaticParams` looks like.

## Supabase: paused deliberately after the proposal (2026-08-11)

**This is a deliberate deferral, not a blocked task.** The approved plan's Phase 1
turned out to be more infrastructure than this stage of the project warrants, so
runtime work stops after the documentation and decisions.

Kept, so this resumes without redoing setup:

- the `supabase` CLI devDependency and `supabase/config.toml`,
- the linked project `oejjomqrugsgpunzmhnd`,
- `docs/supabase-migration.md`, including decisions **D1–D10** and open points
  **O1–O4** (O1–O4 were since decided: persistent sessions, no per-fact deletion,
  custom SMTP deferred until external testers, and the `/you` copy naming Supabase,
  describing hosting broadly as EU, and stating plainly that the operator could
  technically access cloud data — without implying RLS prevents that),
- the official Supabase agent skill (below).

**Not started:** local Supabase, schema, RLS, isolation tests, Edge Functions,
Auth, sync, and any database application code.

### When it resumes, in small steps

1. one basic table,
2. basic Auth,
3. basic RLS,
4. one authenticated read/write flow,
5. only then sync, migrations, Edge Functions, and advanced security testing.

The seven-phase plan in `docs/supabase-migration.md` stays as the destination, not
as the next action.

### Context for whoever resumes

This machine has **no container runtime**: no Docker, no Podman, and WSL is not
installed (Windows 10 Home, where Docker Desktop requires WSL2). There is no local
Postgres either. So step 1 above needs either a container runtime installed first,
or a decision to work directly against the hosted project. Recorded as context, not
as a task.

### The Supabase agent skill

Installed with `npx skills add supabase/agent-skills --skill supabase` (v0.1.2).
Nothing was duplicated: no Supabase plugin was installed, and `~/.claude/skills`
held none of these.

It landed **inside the repository** at `.agents/skills/supabase/`, symlinked into
`.claude/skills/supabase`, with `skills-lock.json` at the root. Of those, **only
`skills-lock.json` is committed** — see `.gitignore` for why.

Three things the skill flags that our own proposal does not yet cover, worth
folding in when work resumes:

- **Data API exposure is separate from RLS.** A newly created table may not be
  reachable at all until `anon`/`authenticated` are granted access, and that is a
  different question from which rows RLS permits.
- **`user_metadata` is user-editable** and must never be used in authorization
  decisions; `app_metadata` is the safe side.
- **Deleting a user does not invalidate their existing access tokens.** This bears
  directly on the D9/D10 delete-account design: sessions should be revoked as part
  of deletion, not assumed dead.

## Supabase CLI: installed and linked (tooling only)

`supabase` is a **devDependency** (`pnpm add -D supabase`, currently 2.113.0),
`supabase init` has been run, and the project is linked to the hosted project
**`project thrive`** (`oejjomqrugsgpunzmhnd`, Postgres 17.6, eu-central-1).

Nothing about the application has changed. There is no Auth, no table, no
migration, no client code, and the app still stores everything in the browser
under the rules in `CLAUDE.md` §8. Installing a CLI is tooling; introducing a
backend is the architectural change that section governs — see
`docs/supabase-migration.md` for the proposal that has to be approved first.

- The link state lives in `supabase/.temp/`, which `supabase/.gitignore` excludes,
  so it stays machine-local. `config.toml` is committed, including the project
  ref: it is not a secret (it appears in the project URL) and committing it is
  what makes migrations reproducible.
- `npm install` was **not** used despite the instruction, because this repo pins
  `packageManager` and CI runs `pnpm install --frozen-lockfile`; an npm lockfile
  would have left the dependency invisible to CI. Same end state via pnpm.
- Note for when Pages is enabled: `pnpm install --frozen-lockfile` installs dev
  dependencies too, so CI would download the CLI binary on every build without
  needing it. Worth scoping then.

## The repository

Pushed to <https://github.com/flowrider1990/thrive-prototype>, **private** for
now — going private later is easy, going public is not undoable.

**The Pages workflow is disabled on GitHub** (`disabled_manually`). It is not
broken: `actions/configure-pages` fails with `Get Pages site failed … Not Found`
because Pages is not enabled, and Pages on a private repository needs a paid
plan. Left enabled it would have failed on every push. The workflow file is
committed and unchanged.

To publish later:

```bash
gh repo edit --visibility public --accept-visibility-change-consequences
gh api -X POST repos/flowrider1990/thrive-prototype/pages -f build_type=workflow
gh workflow enable "Deploy to GitHub Pages"
gh workflow run "Deploy to GitHub Pages"
```

## Open decisions

- **Publishing.** Still private, so the site is not live and step 12 is only
  half done: the commits are pushed, Pages is not enabled.
- **Verification 11** (the live URL, assets under the `/<repo>/` subpath, and a
  deep link to `/you/` surviving a reload) can only be done once it is live. The
  locally checkable half of it passed — see above.
- **pnpm 11.21.0** is available, as above.
