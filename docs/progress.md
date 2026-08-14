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
| 9. `/you` and `/about` | in-page confirm for forgetting — `/you` since replaced by `/data/` |
| 10. Shell and styling | quiet monochrome palette, light/dark with no script |
| 11. Docs | `CLAUDE.md`, `README.md`, five `docs/*.md` |
| 12. Commit, push, enable Pages | committed; **push not done** |

## Verification

`pnpm verify` automates the plan's browser checks: it drives real headless Chrome
over the DevTools protocol against the *served static export*, with no packages
added (Node 22 has a global `WebSocket`). It covers plan items 4–10 — including
the two the plan singles out. **The current count is 275/275** (25 at the
foundation, 39 after the header controls, 78 after the first product loop, 123 after
the UX/UI rework, 181 after the Supabase foundation, 248 after the less-friction
iteration); the script itself is the only authority on that number, so treat any count
written in prose as a snapshot.

**Pass the base URL explicitly.** The default is `http://localhost:4321`, which is
not safe on a machine running a second worktree — a stale or foreign server there
produces failures that look like defects. This worktree serves the export on
**4410** and `pnpm dev` on **4411**, and a dev run needs its routes warmed with curl
first or Turbopack's on-demand compile outruns the script's settle time.

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
11. **Still needs the site deployed** for the live-URL half. Two notes, one
    historical and one current:
    - *At the foundation:* building with `PAGES_BASE_PATH=/thrive-prototype` put every
      asset under `/thrive-prototype/_next/…`, and `out/you/index.html` existed, so a
      deep link resolved. **`/you` no longer exists** — it was replaced by `/data/` in
      the UX/UI rework — so read that as a record of what was checked then, not as a
      path to look for now.
    - *Now:* the deep-link half no longer waits for a deployment. `/areas/<id>/` is a
      real nested route, and `scripts/verify.mjs` §27d/§27e load it cold and reload it
      on every run. What is left for a live URL is the `basePath` behaviour under a
      real subpath.
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

### Stage 4: data protection someone can actually read

`pnpm verify` is **123 checks**, passing against both the export and `pnpm dev`.
`/you` is gone; the app's routes are `/`, `/areas/`, `/areas/<id>/`, `/data/`,
`/data/stored/`, `/about/`.

- **Two levels, not one page with a disclosure.** `/data/` explains in four plain
  sentences and links onward; `/data/stored/` shows the data and holds the delete
  flow. The stored view grows without bound as the app is used, so folding it into
  the explanation would have buried the explanation under the thing it explains.
  §28b asserts the split from the other direction: the plain page must **not**
  contain the person's goal.
- **Deleting took two confirmations, and the first only explained.** *(Reduced to one
  later in the sprint — see the fine-tuning pass below.)* §8a and §8b
  assert `raw()` is **byte-identical** after each — "the key still exists" would not
  notice it being rewritten — and §8c asserts backing out at the last moment leaves
  everything. `forgetEverything()` itself is untouched.
- **The safe choice carries the emphasis.** "Keep it" is `.btn-primary` on both
  steps; the step toward deletion is quiet. A filled "Yes, delete everything" would
  be the interface leaning on someone at the one moment it must not.
- **About moved to the footer**, where — unlike the nav — it is never gated. During
  the introduction the header has no links at all, and the page explaining what this
  is should not be the one thing you cannot reach while deciding whether to trust it.
  §12c asserts it from both sides, because the failure worth catching is it appearing
  in *both* places.
- **`about.whereP1` had to change.** It named *"forget everything" on the You page*
  as the way to remove your data. Deleting that route would have left the app making
  a false statement about privacy — the reason it was flagged before the work started
  rather than found afterwards.
- **The `you` message group is now `stored`.** A catalog group named for a route that
  no longer exists is how a catalog starts drifting from the app; `you-areas.tsx`
  became `stored-areas.tsx` for the same reason. Mechanical, and the build enforces it.

New §30 sweeps every route for internal ids in both `innerText` **and** accessible
names. §7f had done this for one page; the rework added four more surfaces where an
entry's own words sit next to its id, and moved those words into `aria-label`s, which
`innerText` cannot see at all.

### What the code review caught (PR #3)

Six findings, all of them real, all fixed before merge. Worth recording because four
of the six are the same shape: **a claim that was asserted in one place and false in
another.**

- **`--dark-line-strong` was below its own floor.** 3.05:1 against the ground and
  **2.77:1 against `--color-surface`** — and `.field`, `.option` and the menu panel are
  all `bg-surface`, which in dark mode is *lighter* than the page. §31c could not see
  it: it measures a progress mark, which sits on the page. Fixed to `#6b6b75`
  (3.39 ground / 3.08 surface), and **§31d now measures the surface path**. Proven able
  to fail by restoring the old value first — it reported exactly 2.77:1.
- **Arriving on `/data/stored/` put focus on "Delete everything".** The focus effect's
  returning branch also ran on mount, so the page scrolled past everything it exists to
  show and landed on its one destructive control. `next-steps.tsx` already guarded this
  with an `opened` ref; this effect did not.
- **The swap answer led to a dead end.** "I would rather do something else" with
  nothing else prepared dropped the person into a mandatory field with no way back
  except leaving the page. It was survivable before only because that state was
  previously reachable only *after* "Later" had been offered.
- **Both `role="status"` regions announced nothing.** A live region inserted together
  with its text is not a change to an existing region, which is what assistive tech
  watches for. Both are now mounted once, visually hidden, with the visible
  confirmation kept separate.
- **Check 12b was passing without the menu.** The nav renders twice, so at phone width
  the first DOM match for a nav label is the *hidden* inline copy, and `__click` had no
  visibility filter — "the collapsed menu still navigates" would have passed with the
  panel broken. `__click` now prefers laid-out matches.
- **`introductionFinished`'s doc named a caller that was not one.** `app/page.tsx` kept
  its own inline `reviewed === areas.length`, so the two definitions the function exists
  to unify could have drifted apart. Now actually wired.

## UI refinement (branch `feature/ui-refinement-2`)

`pnpm verify` is **154 checks**, up from 125, passing against both the export and
`pnpm dev`. Frontend only: no store, schema, key, consent-semantics or dependency
change.

- **Privacy copy now scopes itself to the current storage mode.** `data.p1`, `data.p2`,
  `stored.introSaved` and the footer description stated "there is no server, no
  account, no cloud" as timeless facts. They would have quietly become false the day
  anything syncs, and a privacy page that has to be retracted is worse than one
  accurate about its own scope. None of them implies a cloud is coming.
- **Home names the unfinished area and links to it.** "One of your life areas has a
  goal but nothing to try yet" left the reader to work out which. The link text is the
  area's own name, which is what makes it useful out of context. Only the first one is
  named — listing five would be a list of things you have not done.
- **The storage choice is reopenable on `/data/`,** reusing onboarding's own question
  verbatim rather than a toggle. See the finding below; this was the one item with a
  real trap in it.
- **`/data/stored/` folds per area** as a native `<details>`, and says what actually
  happened to each entry: added, reworded, working on, done, set aside.
- **Three levels of hierarchy on `/areas/`,** where the area name had been the quietest
  thing in its own row.
- **One shared back link** on both nested routes, replacing "no way back at all" on the
  area pages.

### The one real trap: turning saving off does not clear the key

`declineConsent()` alone leaves `localStorage` untouched. `commit()` writes only when
the mode is `local`, and nothing in it removes anything — so a "change storage
settings" control that simply called it would have left the stored key on disk while
the page said nothing was being saved. That is the §8 guarantee inverted, on a path
that had never existed because consent had only ever been decided once, at the start.

Leaving `local` is therefore `forgetEverything()` (which removes the key) and then
`declineConsent()` (which carries the visit on in memory), in that order. Both already
existed, so no store semantics changed — but it makes **turning saving off
necessarily destructive**, which is why the cost is on its own confirmation step with
"Keep it" as the filled button. §36f asserts `Object.keys(localStorage)` is empty
afterwards: not "no facts", no key.

Two consequences worth knowing before this is built on:

- **`forgetEverything()` also resets the theme preference**, since it returns the whole
  snapshot to "nothing known yet". Nobody asked for their theme to be forgotten; it is
  collateral from the only available way to clear the key. Written up as debt in
  `docs/persistence-decision.md` — the fix is to stop one key holding both personal
  data and UI preferences, and it belongs to a persistence-layer change, **not** to a
  UI change. Deliberately not fixed here.
- If keeping in-memory facts while clearing the key is ever wanted, that needs a new
  store function (`stopPersisting()` or similar) and belongs to whoever owns the
  persistence boundary — not to a UI change.

### Deliberately not done

- **No destructive colour on the final delete action.** The palette is monochrome by
  intent and there is no danger token; adding one would be the system's first hue and
  needs approval (`CLAUDE.md` §7). Emphasis and step count carry the weight instead.
  Recorded in `docs/design-system.md` so the next person does not re-litigate it.
- The `About` page's "there is no server, no account" wording was left alone. It is
  the same class of claim as the copy that was rescoped, but it was outside the pages
  this pass covered.

### Checks that would have kept passing while proving nothing

- **Six content checks read `/data/stored/` as text**, and `innerText` cannot see
  inside a closed `<details>`. Folding would have answered them instead of the content
  — "not there" and "hidden" are indistinguishable from outside. They unfold first now.
  §30 is the sharp one: it sweeps for leaked internal ids on the one surface where an
  entry's id sits beside its words, and it reports how many sections it opened.
- **Check 12a asked the whole document** whether "Data protection" was laid out at
  390px, in order to prove the header had collapsed. The new storage link on home
  carries that exact label, so a correct header started failing. It is scoped to
  `header` now, which is the region the claim was always about.
- **`__clickText` only clicks leaf elements**, which silently excludes every control
  holding an icon beside its label — the new back links and the disclosure summaries.
  `clickSelector` and `clickSummary` exist for those; without them the new checks
  would have thrown rather than asserted.
- **§7g asserted the word "removed"** in the stored record, which is precisely the
  claim this pass set out to stop making: an entry taken out of current use is still on
  the page one line down. It now asserts the new vocabulary *and* that "removed from"
  is gone.

### The closing polish pass

`pnpm verify` is **159 checks**. No new product behaviour; consistency only.

- **The storage state is a label, not a sentence.** "Currently: saved on this device" /
  "Aktuell: Nur für diesen Tab", directly under the title where someone who came to
  check one thing will read it. It used to restate what the four paragraphs below
  already say, which was most of why the section felt dense.
- **The two storage modes are named and the active one is marked** — a tick in an
  always-present slot plus `aria-current`. Yes and no could not do this: they answer a
  question, and neither is a thing that can be "the one you are already on". The
  question is now short and neutral rather than onboarding's, which asserts one of the
  options as settled fact; **onboarding itself is unchanged.** This deliberately
  softens the earlier "reuse onboarding's wording verbatim" instruction, and it is one
  message key to revert.
- **The destructive confirmation only appears when the change is destructive.** With
  nothing stored there is nothing to lose, so switching off happens directly — and
  still clears the key, because a consented store with no answers is still a key on
  the device. §36k and §36l pin both halves. A confirmation for a change with no
  consequence is the ceremony that teaches people to click through the ones that
  matter.
- **Page rhythm is one set of numbers** rather than five pages guessing. The table is
  in `docs/design-system.md`; the visible offenders were a title-to-intro gap that was
  2.5rem on one page, 1rem on another and 2rem on a third, and two nested pages whose
  back links sat at different distances from their content.
- **Three weights of action on `/data/`**: primary, secondary, quiet link. "Change
  storage settings" had been `.btn-sm`, which means "subordinate to the thing beside
  me" and made it look like it belonged to the button above it.
- **Empty states are all `text-sm text-muted`.** Guidance, not warnings — home's was at
  body size and read as more consequential than it is.
- **About no longer makes architectural promises.** "There is no server, no account, no
  cloud" became "at the moment there is…", matching the `data` group.

### Closing changes, and three follow-ups that were not built

Last in: leaving is now the emphasised action at the foot of the delete flow, with
"Delete everything" quiet beneath it — that section can be arrived at directly from
"delete my data", and for a while the destructive control was the only thing on it.

The storage-change flow was cut back to the change itself. It had been reprinting
onboarding's framing plus both modes with a line of explanation each, on a page whose
four paragraphs had just explained all of it; with two modes and the current one stated
above, the whole decision is "switch to the other, or do not". Only the mode you are not
on is offered.

**"Work on something else" is gone** from the area page, along with the view it was the
only entry into and its catalog key. Swapping freely between prepared items implied they
are interchangeable, which is the opposite of what the list should say.

Three requests were **documented instead of implemented**, in
`docs/goals-and-areas.md` under "Product follow-ups":

- **a visible status per life area on the start page** — needs its own domain concept.
  The four "How is it going?" answers are actions, not a state, and "Still on it" writes
  nothing, so nothing exists for a chip to read or for the button to disappear behind.
  Open: a real `area_status` fact versus a derived one, and the rules for when a status
  updates and when it goes stale;
- **priority marking and explicit ranking**, which is what should replace free swapping;
- **satisfaction check-ins per life area**, which will most likely consume whatever
  status concept is settled — a reason not to decide status first.

### Fine-tuning pass

`pnpm verify` is **176 checks**, passing against both the export and `pnpm dev`.

- **Three outcomes, not four.** "I would rather do something else" and "This does not
  fit anymore" were two labels for one state — *this is not right for me now* — and
  offering both asked the person to classify their own dissatisfaction before the app
  would act on it. They barely differed in effect either. The single answer, "This does
  not fit me anymore" / "Das passt für mich nicht mehr", sets the entry aside (still
  kept — `retireStep` never deletes) and then offers to choose another, which is where
  both old paths ended up. §24b1 asserts the count, so the distinction cannot creep back.
- **An area's name on the start page opens that area.** It is a sibling of the row's
  controls, never a wrapper: a link containing "How is it going?" would navigate on
  every answer, and the entry's own words have to stay inert.
- **Back on `/areas/<id>/` is no longer hard-coded.** The page has two ways in now, so
  the origin travels in the URL as `?from=home`, with `/areas` as the fallback for a
  deep link, a shared URL or an unrecognised value. Mechanism and reasoning in
  `docs/design-system.md`; the short version is that a URL parameter survives a reload
  where remembered state would go stale, and `history.back()` would leave the app when
  this page was the first one opened.

  **The first implementation of this was wrong in a way worth recording.** It read
  `window.location.search` during render, which is not reactive — and on a client-side
  navigation Next renders the new route *before* committing the URL, so the one render
  that mattered saw an empty search string and nothing re-ran. The back link said "Back
  to your life areas" on a page opened from the start page while the URL was correct the
  whole time, which is exactly what makes a bug look like a broken test. Fixed by using
  `useSearchParams()`, which is subscribed to the router.

  That costs a `Suspense` boundary in `app/areas/[area]/page.tsx` — mandatory, because on
  a prerendered route the hook bails the client tree out of prerendering and `next build`
  fails without one. Note it passes in `pnpm dev` either way, since development renders
  on demand: a defect class that only shows up in a production build. It also makes the
  area route's content client-rendered after the navigation commits, ~340ms against ~220
  before, which is why two checks now wait for the destination via `waitForText()` rather
  than sleeping a fixed delay. Nothing incorrect is shown in the gap — the fallback is
  `null`, so it is empty rather than wrong.
- **Deleting asks once, not twice.** The flow had three asks over: the button, "this
  removes everything, continue?", then "delete everything now, really?". The middle two
  said the same thing, and a step that adds no information is what teaches someone to
  click through the step that does. One confirmation now carries the consequence *and*
  the irreversibility. What still prevents an accident is unchanged: deleting is never
  the first tap, the consequence is in the same breath as the question, and the safe
  choice is the emphasised one. §8a2 asserts exactly one confirming click.

### Onboarding stopped requiring an invented action

The steps screen — "What could help you move toward this goal?" — offered only "Add", so
someone who wanted something to change here and had a goal but did not yet know what
would help had no way past except to make something up. An invented action is worse than
none: the app then treats it as a real intention.

It now offers **"I do not know yet"** / **"Ich weiß es noch nicht"** as a quiet second
action beside Add, and taking it writes nothing at all.

**The model already supported the resulting state** — a `review` fact, a `goal` fact, and
no step facts — so nothing was added: no key, no placeholder entry, no schema change, no
`version` bump. The absence is the representation, the same way "Later" writes nothing.
Downstream the copy already existed too: `manage.noStep` and `home.unfinished` describe
it in the same words, and neither surface treats it as incomplete data.

One real bug this exposed: `finishSteps()` had no zero case, so the flow would have fallen
through to "which one would you like to focus on first?" with an empty list — a dead
screen. §38e asserts the introduction moves on instead.

Recorded rather than fixed: `isSettled()` still requires an active step, so a reload
*during* the introduction resumes at the steps question of an area skipped this way and
re-offers it. Not a trap — the same answer works again, nothing fake is written — and
`isSettled` feeds nothing but the resume position. Making the skip survive a reload means
letting a goal alone count as settled, which changes a domain derivation and was out of
scope for a UI change. Details in `docs/goals-and-areas.md`.

One approximation worth knowing: the count beside "Show what is stored" is
`facts.length`, the number of stored facts. `/data/stored/` renders slightly fewer rows
than that, because an active-step pointer resolves into the words it points at rather
than appearing as its own entry. The number is truthful about the store; it is not a
count of visible rows.

Also: `serve` fell over mid-run twice, and checks failed in a way that looked like
a UI defect until the port was checked. Verification ports and the ownership check are
recorded in the session memory, not here — but the habit is worth repeating: confirm
the server before believing a failure.

### The concern could reach the device, and now cannot

`pnpm verify` is **181 checks**, passing against both the export and `pnpm dev`.

Found in cross-review of PR #4. `consent_concern` — what someone says when they decline
saving — is documented as memory-only, and that promise rested on nothing more than the
mode never changing after it was written. Reopening the storage choice changes it:
`grantConsent()` persists the in-memory snapshot as it stands, on purpose, so decline →
say why → finish the introduction → `/data/` → turn saving on wrote the objection to
disk. The one write the person had just refused.

**Fixed in `write()`, not at the call site that grants consent.** `write()` is the only
function that touches the device, so filtering there is the whole guarantee, for every
path that reaches local mode including ones not written yet. Scrubbing inside
`grantConsent()` would have worked today and quietly stopped working the next time
something set the mode.

Two things it deliberately does not do. It does not drop everything gathered before
consent — that would keep the concern off the device by throwing away the answers
turning saving on exists to keep (§39c fails on that over-correction, and passed
against the bug, which is the point of having it). And it does not remove the fact from
the snapshot: the concern stays visible for the rest of the visit, as it was meant to
be, and is simply gone on the next load. §39 walks that whole path, and §39b/§39e were
confirmed to fail against the unfixed store before the fix was restored.

One consequence worth knowing, left alone: the `facts.length` count above now counts
one more than the device holds, for a visit that took this path. It is honest about the
session's record, which is what it labels, and the store is the thing that had to be
right.

## Supabase: paused deliberately after the proposal (2026-08-11)

**Superseded in part — connectivity has since been established on
`feature/cloud-foundation`; see the section below.** The pause held for everything
else, and the reasoning here is why the resumed work is deliberately tiny.

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
Auth, sync, and any database application code. (Connectivity — the client
boundary, the env vars and `pnpm check:supabase` — has since been done; everything
in that list is still untouched.)

### When it resumes, in small steps

0. ~~runtime connectivity~~ — **done**, see below,
1. ~~one basic table~~ — **done**, with its privileges, RLS and policies in the
   same migration,
2. ~~basic RLS~~ — **done**; `pnpm check:rls` proves both directions,
3. basic Auth in the app — and with it, the `persistSession` decision (O1). Test
   users exist only inside the RLS harness so far; the app has no sign-in,
4. one authenticated read/write flow **from the app**,
5. only then sync, the `person_current` view, Edge Functions, and advanced
   security testing.

The seven-phase plan in `docs/supabase-migration.md` stays as the destination, not
as the next action.

### Context for whoever resumes

This machine has **no container runtime**: no Docker, no Podman, and WSL is not
installed (Windows 10 Home, where Docker Desktop requires WSL2). There is no local
Postgres either. So step 1 above needs either a container runtime installed first,
or a decision to work directly against the hosted project. Recorded as context, not
as a task.

### Connectivity established (branch `feature/cloud-foundation`)

The first resumed step, and deliberately the smallest one: the app *can* reach the
project, and nothing else changed. No table, no Auth, no RLS, no sync, no UI. The
person store, `app/`, `components/` and `lib/i18n/` are untouched, and
`scripts/verify.mjs` is unchanged and still **125/125** — including check 9, "no
request went anywhere but the app's own assets" (1401 requests, all local).

- **`lib/supabase/client.ts`** is the whole boundary. Two properties do the work:
  nothing happens on import (the client is built on the first `getSupabase()` call,
  not at module scope), and it uses the publishable key only. Because nothing in
  `app/` or `components/` imports it, `out/` contains no `sb_publishable_`, no
  `supabase.co` and no `@supabase` — checked, not assumed. G6 therefore survives by
  construction rather than by care.
- **`persistSession: false`, plus `autoRefreshToken` and `detectSessionInUrl` off.**
  There is no Auth yet, so the client must write nothing to the device; `sb-*` keys
  in `localStorage` would put "declining leaves localStorage completely empty" (G2)
  at risk. Approved for this phase only — **revisit explicitly when Auth lands**
  (open point O1).
- **`pnpm check:supabase` is separate from `pnpm verify` on purpose.** The verify
  suite asserts that nothing leaves the browser; a connectivity check that makes
  real network calls belongs beside it, not inside it.
- **It imports the real `client.ts`** rather than building its own client, so what
  it proves is the boundary the app will use. That needs Node's
  `--experimental-strip-types` (Node 22.14 here; unflagged from 22.18), which is why
  the script carries flags. The two warnings it would otherwise print are silenced
  individually rather than with a blanket `--no-warnings`.

Three things worth remembering from doing it:

- **The lasting success contract cannot mention the schema.** The obvious probe —
  "`person_facts` is not found" — is true today and false the moment Phase 1 lands,
  so the check would start failing for the very reason it was supposed to allow.
  Check 5 asserts instead that *PostgREST answered and accepted our credential*,
  which holds whether the table is absent (404 `PGRST205`, today), present (200), or
  empty under RLS (200). The table's absence is reported, never asserted.
- **Both negative controls were run, and both fired.** A wrong publishable key fails
  checks 4 and 5 with `key rejected (401): Invalid API key`; a fabricated
  `sb_secret_…` value fails 3a, and a fabricated `service_role` JWT placed in a
  variable named `SOME_INNOCENT_LOOKING_NAME` fails 3b. The secret scanner matches on
  **values, not variable names**, which is the case that actually matters. *Not*
  proven: check 6's failure branch, which would need the real secret key to trigger
  and was deliberately not exercised.
- **PowerShell 5.1's `ConvertFrom-Json` does not unroll an array into the pipeline.**
  `@(… | ConvertFrom-Json)` wraps all four key records as one element, so
  `Where-Object { $_.type -eq 'publishable' }` matched everything via member
  enumeration and handed back the legacy anon JWT instead. Cost two failed attempts
  at reading the key. Assign the result and `foreach` over it.

### The first table, with its grants, RLS and policies (branch `feature/cloud-foundation`)

`supabase/migrations/20260811193339_person_facts.sql` — the table, the privileges,
RLS and all three policies in **one** migration, applied to the hosted project.
Deliberately not table-first-policies-later: a table that exists before its
policies is readable by everyone for as long as that gap lasts.
`pnpm check:rls` is **17/17**.

No local stack was possible — still no Docker, no Podman, and WSL has no
distribution — so this ran against the hosted project. `docs/supabase-migration.md`
§2 recommends a throwaway local database for exactly this work; the trade-off was
made knowingly.

**The finding that justified the whole exercise: `anon` arrived holding six
privileges on the new table.** Supabase runs `ALTER DEFAULT PRIVILEGES` on the
`public` schema, so a freshly created table comes with `SELECT`, `INSERT`,
`DELETE`, `REFERENCES`, `TRIGGER` and `TRUNCATE` already granted to both `anon` and
`authenticated`. The first version of the migration only *added* grants, so its
comment claiming "`anon` is granted nothing" was false, and RLS was the single
layer between a stranger and someone's answers. The migration now revokes
everything from `public`, `anon` and `authenticated` first and grants back exactly
`select, insert, delete` to `authenticated`. Measured afterwards: `anon` no longer
appears in `information_schema.role_table_grants` at all.

The correction was made by reverting rather than by stacking a second migration —
the table was ten minutes old, empty, and nothing depended on it, so the committed
history is one migration that is actually correct rather than one that is wrong
plus one that fixes it.

- **`scripts/check-rls.mjs` never asserts through an admin client.** Admin rights
  create the two throwaway users and delete them again; every assertion runs
  through a real session, or through a client with no session at all. An admin
  client bypasses RLS by definition, so an assertion made with one passes whether
  the policies are right, wrong or absent — it tests nothing. The rule is now in
  `CLAUDE.md` §8.
- **Cleanup runs in a `finally`, and that was proven rather than assumed.** A
  forced exception was injected after user creation: the users were still deleted
  (`2/2`), and a project-wide query afterwards found zero leftover `rls-*` users.
- **"Returns no rows" was too weak an assertion, and it hid the grant defect.**
  While `anon` held those six privileges, the anon checks reported PASS because RLS
  returned an empty set. They now require an outright refusal, and I6b/I7b/I8b
  require that the refusal reads `permission denied for table` — the privilege
  layer — rather than merely an empty result.

Two things worth remembering:

- **HTTP 401 does not mean "bad key".** PostgREST answers 401 for `permission
  denied` too, so `check-supabase.mjs`'s check 5 started failing the moment `anon`
  correctly lost its privileges. The durable discriminator is the presence of a
  Postgres error `code`: the database answering at all proves the key was
  accepted, whereas a rejected key returns `Invalid API key` with no code, because
  that is the gateway talking rather than the database. Fixed, and both directions
  are covered by controls.
- **`supabase db query` defaults to the local stack.** Without `--linked` it tries
  `127.0.0.1:54322` and fails on missing Docker, which reads like a broken CLI
  rather than a missing flag.

Deferred on purpose: the `person_current` view (§5). It belongs with newest-per-key
derivation in the sync phase, and with no view there is nothing yet for isolation
requirement I2 — the missing `security_invoker` check — to test.

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
  so it stays machine-local. `config.toml` is committed and is what makes
  migrations reproducible — but it does **not** contain the hosted project ref, as
  this file previously claimed: its `project_id` is `"thrive-prototype"`, the local
  project name. The hosted ref appears only in `supabase/.temp/project-ref`
  (ignored) and in the docs. That is why `scripts/check-supabase.mjs` carries the
  ref as a committed constant; without it, a fresh clone could not tell the
  intended project from any other.
- `npm install` was **not** used despite the instruction, because this repo pins
  `packageManager` and CI runs `pnpm install --frozen-lockfile`; an npm lockfile
  would have left the dependency invisible to CI. Same end state via pnpm.
- Note for when Pages is enabled: `pnpm install --frozen-lockfile` installs dev
  dependencies too, so CI would download the CLI binary on every build without
  needing it. Worth scoping then.

## Sprint: taxonomy, multiple goals, hierarchy (branch `feature/verify-area-agnostic`)

Foundation-first, and the first two steps are both about being *able* to add a life
area safely rather than about adding one.

### Step 0 — the suite stopped caring how many life areas there are

No product change; 181/181 before and after, and `git diff` touched only
`scripts/verify.mjs`.

The reason it went first: **a sixth area does not make the suite fail, it makes it
abort.** `__click` throws when no control matches its exact text, `evaluate()`
rethrows, there is exactly one `try` block in 2900 lines, and the run is top-level
`await`. Nine walks through the introduction each carried their own literal number of
"Not right now" clicks; the first wrong one throws from inside the page, the process
dies after 9 of 181 results, no summary is printed, `chrome.kill()` is never reached,
and a headless Chrome is left running. So the damage could not be measured by running
the suite — it had to be fixed blind, which is exactly why it was worth isolating.

`AREAS` at the top of the script now carries ids and both languages' labels, mirrored
by hand from `lib/areas.ts` and the catalogs. Deliberately not imported: the script
runs outside the bundle, and owing nothing to the app's modules is what makes a
passing run mean something — the same discipline `STORAGE_KEY` already has.
`declineRest()` replaced all nine walks, bounded by `AREAS.length`, returning how many
it declined so §4h can assert the number rather than merely that the helper returned.

Three findings worth keeping:

- **`EN.intro` was a two-directional needle.** §4b asserts the introduction is on
  screen; §25f asserts it is not. A stale needle fails §4b loudly but makes §25f pass
  while guarding nothing, and the silent failure is the one to design against. It now
  matches "areas of your life, one at a time" — no number in it.
- **§4e compared against `marks[4]`**, which with six areas keeps passing while no
  longer being the last mark. Now `at(-1)`.
- **Relabelling `body` is not cosmetic** in a suite that selects controls by exact
  visible text: ten literals, three of them `clickOption`/`clickSummary`/`clickText`,
  which abort rather than fail. All ten now go through the fixture.

### Step 1 — the introduction records that it finished

`introductionFinished()` was `areas.every(a => readArea(a).review)` — monotonic in the
*answers* but not in the *question set*, so adding an area made it false for every
store that already existed. Now it reads an `introduction_done` fact and falls back to
`LEGACY_AREAS` for stores written before that fact existed. Behaviour-preserving today:
185/185, and `LEGACY_AREAS` is currently identical to `areas`.

What the old line actually cost, traced rather than guessed: the start page stops
rendering `NextSteps`, and `page-shell.tsx` withdraws the navigation from every page —
including `/data/`, the route to what is stored and to deleting it. Then it self-heals
after one answer, so it would have read as a cosmetic glitch. Real user impact today is
zero (Pages disabled, repo private, no users); behavioural impact was 100% of existing
stores, including every manual-QA profile, and it silently invalidated
`seedOnboarded()`.

Two things that made the work honest rather than plausible:

- **§40 runs on its own fixture.** `seedOnboarded()` now writes the fact, so it could
  only ever prove the easy half. `seedLegacyOnboarded()` writes the five area ids out
  as literals — deriving them from `AREAS` would make it agree with the app by
  construction and assert nothing. §40c also asserts the conclusion **wrote nothing**:
  the fallback is a read.
- **The fallback was falsified before being trusted.** Temporarily reducing
  `introductionFinished()` to the fact alone fails §25a, §25b and §25b2 *before* it
  fails §40 — because §25's scenario is interrupted before `nextArea()` closes the
  pass, so it has always been the fallback carrying it. Worth knowing: that section
  will keep exercising the fallback rather than the fact.

`introduction_done` is a token, so `/data/stored/` renders it through a new
`stored.tokens` map instead of printing `yes` at the person it is about. The generic
list prints `fact.value` directly, which is right for an utterance and wrong for
anything the app wrote.

### Step 2 — a sixth life area, and Physical Health

`mind` / "Mental Wellbeing" at **index 1**, not appended, and that is a verification
decision as much as a product one: §25 is built entirely on "closing the tab midway
through the *last* area" and pins `Hobbies & Creativity` and `/areas/creativity/` in
six places. Appending makes the new area last and moves all six. Inserting keeps
`creativity` last, and physical-then-mental is the better reading anyway. The cost is
one needle — §4g asserts which area comes third — against six.

`body` keeps its id and reads as "Physical Health". Without the contrast, "Body &
Health" quietly claimed all of health.

Step 0 paid off: the suite needed **one line** in `AREAS`, plus `/areas/mind/` added
to two route loops. 186/186.

It did leave one coupling that only a real sixth area could expose, and it is worth
recording because it is the same class of bug Step 0 was about:
`clickOption('Work & Career')` at §24m named the area §4's walk gives its second goal
to. That area is `AREAS[2]`, so inserting anything before it moves which one it is —
and the failure was not a failed assertion but an abort, on a screen showing the
"reconsider" view because the area it landed on had no goal. Now derived, with a
comment saying why.

Three compile-time guards caught the rest before any of it ran, which is worth
knowing about for the next area: `Record<AreaId, string>` in `area-icon.tsx`,
`m.areas[area]` indexing in `area-label.tsx` and `next-steps.tsx`, and `de: Messages`.
A half-added area does not build. `generateStaticParams` produced `/areas/mind/`
itself, and `ProgressMarks` needed no change at all — it was already generic.

### Step 3 — goal ids, and entries that belong to one

The real migration, and it landed with **no component changed and 186/186 still
green** — then 192/192 with the checks that exercise the new shape. That was the
design goal: `AreaState.goal` stayed as a deprecated derived read, so the key shape
and the screens move one at a time and each is reviewable alone.

`area.<a>.goal.<gid>.{text,why,state}`, `area.<a>.goal_priority`, and
`area.<a>.step.<sid>.goal`. **No `version` bump**, because `GOAL_KEY` cannot match the
legacy `area.<a>.goal` (too few segments) or `goal_priority` (not `goal.`), so all
three coexist and the migration is a read. `docs/goals-and-areas.md` had guessed this
"might qualify" for a bump; it does not, by that file's own test.

Decisions worth keeping:

- **The legacy goal's text stays at the old key forever.** One ternary in
  `goalTextKey()` is the whole special case. Migrating it on first edit would split one
  goal's wording history across two keys and break the "changed from" chain exactly at
  the seam — on the page whose job is to show how something changed.
- **Entries are attributed, not backfilled.** No `.goal` fact plus a legacy goal means
  it belongs to that goal — not a guess, since an area used to hold exactly one. Reads
  never write, which is also what lets §41f seed the same store twice.
- **The cascade is a derivation.** An entry leaves the open set when its own state says
  so *or* when its goal does. Closing a goal is one write, nothing is destroyed, and
  `/data/stored/` still shows what was being tried — better than a real cascade for a
  product whose copy promises nothing is removed.
- **The cap stays on the area** at three open entries, not three per goal. Nine open
  entries in one area is the task manager this is not.
- **`goalAt()` removed** rather than updated: "which goal was current when this
  happened" only had an answer while an area held one goal, and it had no caller.

Two things caught by doing rather than planning:

- **`stored-areas.tsx` could not be deferred** — it failed to compile the moment
  `AreaDetail.goals` changed shape, which is the right outcome: `/data/stored/` is the
  page that promises "nothing here is removed", so a new field it silently omitted
  would make that false.
- **§41b was vacuous on first writing.** It asserted an entry whose goal was reached
  does not appear on the start page — but home only ever shows the *active* entry per
  area, so that text could not have appeared whatever its goal. Rewritten against the
  area page with a controlled pair: two entries, both open, neither active, differing
  only in whether their goal was reached.

Also fixed here because sync would have made it expensive later: `newest()` broke ties
on array position, and array order is insertion order. Two devices could derive
different current state from the same facts, and being a derivation rather than a merge
nothing upstream would notice. Now tie-broken on the fact id, as are the sorts in
`goals.ts`.

Deliberately **not** done: the `usePerson` key index (no measured problem), `maxLength`
on `TextAnswer` (belongs with the "why" field that needs it), and an explicit `'open'`
state value (nothing needs the inverse yet).

### Steps 4 and 5 — the interface catches up: goals, hierarchy, priority, why

199/199. Onboarding still asks for **one goal per area** and should keep doing so: six
areas is already up to twenty-four screens, and a second goal is something you discover
you want rather than something to be asked for on first meeting. More are added from the
area's own page.

**The page is the hierarchy.** The area is the `h1`, each goal an `h2`, and what is
being tried for it is indented under it. Two of those three levels come free from the
two typefaces the app already owns — display serif for *what you want*, sans for *what
you will do* — and the third from the `border-s-2 border-line ps-5` rule that four other
call sites already use. **No new CSS class, no card, no badge, no colour token.**

Until this page had goals in it there was no heading element on it at all: the area name
was a `<p>` and the goal a `<dd>`. Fixing the outline turned out to be most of the
hierarchy work.

**Priority is the ordinal.** The goals are a real `<ol>`, the one put first is first, and
`1. 2. 3.` in `tabular-nums` is the entire marking — three cues (number, position, list
semantics), none of them colour, none changing an element's metrics. Hidden with one
goal, because a lone "1." implies siblings that are not there. One key, one write, and
two taps reach any order of three; there is no rank to renumber. That settles the
"marking versus ranking" question this file parked: **one pointer gives both**.

**The goal-change walk was replaced rather than retargeted.** Changing a goal used to
review every open entry one screen at a time, because entries belonged to the area. It
fired on the common case (rewording) where it is now unnecessary — same goal id, entries
stay attached — and did not exist for the rare one (closing) where something really is
affected. One sentence on one screen now covers what three screens used to: *"What you
were trying for it is set aside with it. Nothing is deleted."* With nothing being tried
for the goal there is no consequence and no confirmation, because a confirmation with
nothing to say teaches people to tap through steps.

Two things found by building rather than planning:

- **Entries added from the start page had no goal**, so they were stored and then
  invisible on the area page — there was no goal to list them under. `next-steps.tsx`
  now links them to the row's goal. `AreaManage` also grew a "Not tied to a goal right
  now" group, because *stored and unshowable* is the one state that page cannot have.
- **§7 could not test closing a goal.** Closing one takes its entries with it, and the
  goal it closed owned the only active entry left in the run — so a later check lost the
  word it was looking for. Moved to §41, on a seeded store where nothing downstream
  depends on it, and §7 now covers the case that costs nothing instead.

`AreaState.goal` is gone, as its deprecation note said it would be when this landed.

## Iteration: less friction (branch `feature/verify-area-agnostic`)

Using the six-area, three-goal loop surfaced friction rather than missing features, so
this iteration removes and clarifies more than it adds. 209/209.

### Step 1 — pinning, a shorter introduction, and one list of what you are working on

Three changes in one commit, and they could not be split: removing the prioritisation
screen means nothing is ever active, so a start page that filtered on `active` renders
empty — and §24 then **aborts at check 16 of ~190**, discarding the rest including the
network and console sweeps. The new start page is what keeps those checks meaningful.

**`step_active` became pinning.** One pointer per area meant *the* thing being worked
on; several entries can now be pinned, it is never asked for, and it orders the start
page without ranking anything. No migration: an explicit `step.<sid>.pinned` fact wins
in either direction, so only when nothing was ever said about an entry does the old
pointer speak for it — which means unpinning a legacy-pointed entry needs no special
case, and a store from before pinning keeps saying what it said. Same technique as
`LEGACY_GID`; reads never write.

**`isSettled()` is gone.** It required a goal *and* something active. Both are optional
now — the goal is skippable and nothing is prioritised — so it would have sent people
back to questions they deliberately passed on. Where an interrupted pass resumes is the
first area with **no review answer**: the first thing every pass writes, never taken
away, and therefore the only predicate that cannot nag.

**Both questions in an area can now be passed on**, and neither writes anything: *Not
sure yet* on the goal, *I do not know yet* on what could help. Worded differently
because they are different admissions. A skipped goal is never pointed at from the
start page, because `home.unfinished` needs a goal with no entries to fire.

Three things found by building rather than planning:

- **Relaxing the resume predicate silently skipped a screen.** An area counts as
  settled once it holds a goal, and `app/page.tsx` recomputed the walked area every
  render — so writing a goal advanced the walk instantly and the "what could help"
  question never appeared. The walked area is now fixed at the one transition that
  starts the walk. Found by the suite aborting on a screen it did not expect, which is
  the abort behaviour earning its keep.
- **The project's lint forbids `setState` inside an effect**, which rejected the first
  fix and pushed toward the better one — latching at the transition rather than
  reacting to a derived value.
- **A completed entry's row unmounted before its follow-up could render.** Once an
  entry leaves the open set its row disappears, so the "what could help" question had
  nowhere to appear. The old code kept the busy *area* mounted for exactly this reason;
  the new one keeps the busy *entry* in place.

Ten new checks (§42) cover pinning, several pinned at once, the legacy pointer read and
its unpinning, the skippable goal, and — for the first time — that the `role="status"`
region is mounted **before** it has anything to say. Nothing asserted that in any of the
three places that depend on it, and a list of rows is exactly what would have broken it
silently.

### Step 1b — the start page as a working list at width

Three regions per row from `sm` up, stacked on a phone, done with alignment rather than
a card. §43 measures it: at 1200px the regions run left to right with their tops within
12px; at 390px they share one x with increasing tops.

Not changed, deliberately: the column is `max-w-2xl`, shared by header, main and footer,
and 20a asserts its left edge is identical on every route so the page cannot jump
sideways as you navigate. A genuinely wider start page means retiring that guarantee,
which is a design-system decision rather than a Home refinement.

### Step 2 — during the introduction the life area is the heading

The question is the same on every area screen; the area is the one part that changes,
and it was the smallest thing on the page. `QuestionCard` gained a `subject` prop: given
an area it becomes the `h1` at full display scale with a matching icon size, and the
question drops to `text-lg` sans.

It is a new prop rather than a change to the existing `area` slot because that slot does
two jobs across thirteen call sites — four onboarding screens pass an area, seven pass a
*goal*, and six pass nothing. Enlarging the shared slot would have put someone's goal at
display size as the title of an "add something" screen.

Two things worth recording:

- **`AreaIcon` needed a new size key**, not a larger `eyebrow`: `eyebrow` is shared with
  `AreaLabel size="card"`, whose type size check 34a measures.
- **The risk flagged in planning turned out not to exist.** `AreaFlow`'s other caller is
  `AreaManage`'s flow view, which I expected to end up with two display-scale area names
  on one screen — but it *early-returns* `<AreaFlow>` instead of nesting it, so only one
  heading ever renders. Worth checking rather than assuming, and worth recording so the
  next person does not re-derive it.

§44 measures the result: the `h1` is the area, there is exactly one of them, it is more
than 1.4× the question's size, and the two use different faces — because matching sizes
with matching faces is how a hierarchy quietly flattens again.

### Step 3 — storage looks like a setting

Two switches on `/data/`, read and set in place, replacing a "Change storage settings"
button that opened a panel holding a single full-width `.option`. The complaint was that
it looked like a text field, and the CSS agrees: `.option` and `.field` are the same rule
in every property that draws a box, so one bordered row above a Cancel pill is
indistinguishable from an empty input.

`.switch` is therefore **not** on a surface at all — label left, state right, alignment
doing the structure. State is carried three ways with only one of them colour: knob
position, the word `ON`/`OFF`, and the track fill. Metrics never change when it flips.

A `<button role="switch" aria-checked>`, not a checkbox: `role="switch"` says "on or off
right now" where a checkbox says "included when you submit", and there is nothing to
submit. It also keeps `StorageChoice`'s `panel.querySelector('button')?.focus()` working,
which an `<input>` would have broken silently.

**The `Currently: …` line is gone.** The switch is the state, and a switch labelled "Save
on this device" beside a line reading "Currently: saved on this device" says it twice —
and would have to be kept in step with it forever. `data.storage.local`/`memory`/
`undecided`/`change`/`optionMemory` all lost their renderer and went with it; the copy
shrank. `undecided` now reads as off, truthfully: nothing is being written.

Cloud sync is the second switch — present, off, not operable, with the reason under it.

**Check 36c was inverted, not deleted.** It asserted
`count('main [role="switch"]') === 0` under the name "and no toggle was introduced beside
it": a deliberate guard against this redesign. Quietly deleting a check that says *do not
do this* is how a codebase forgets it ever decided, so it now asserts the opposite and
the reversal is recorded in `docs/design-system.md`. It still forbids a checkbox.

§36 is twelve checks again, and better ones: `aria-checked` rather than prose, so the
assertion reads the same fact the visible knob draws instead of a label that could drift
from it. Also fixed while here: the design-system doc claimed the storage choice was the
one `OptionList` `current` call site, which was never true — it passed no `current` at
all.

### Package A — three goals in the introduction, and a way to begin again

223/223. Twelve new checks.

**Up to three goals per area during the introduction**, offered from the entries screen
and never demanded: the first is still optional, and "Add another goal" disappears at the
cap. Two things had to be separated that were one variable before:

- **Which goal the entries screen is filling.** `activeGoals[0]` is the *oldest*, so
  without holding the id `addGoal` returns, entries typed for a second goal would have
  been linked to the first — silently, and permanently, because the log is append-only.
- **The cap versus the list.** `ActionEntry` computed `full` from the array it was handed.
  If the cap had followed the goal-scoped list, an area could hold nine entries; if the
  list had stayed area-wide, a second goal's screen would have opened showing the first
  goal's entries and — once three existed — no field at all. The list is now the goal's
  and the cap is passed in from the area.

**A real bug caught by exploring rather than by running:** `QuestionCard`'s `subject` and
`eyebrow` were mutually exclusive, so the goal line added to the entries screen was
silently dropped. It now renders in both branches — *above* the question when the question
owns the heading, *below* it when the area does, which is the difference between a label
over something and detail under it. Also renamed `area` → `eyebrow`, since seven of its
eight call sites pass a goal.

**After deleting everything, "Start again" is the emphasised offer** and points at `/` —
which is the whole mechanism, since `forgetEverything()` leaves the store `undecided` and
`app/page.tsx` derives `greeting` from that. "Back to data protection" drops one weight.

That looks like it breaks the rule putting `.btn-primary` on the *safe* choice in a
destructive flow, and does not: the rule is scoped to the steps *leading to* deletion, and
those are behind us. Nothing is being recommended against, and a page whose only offer is
"back to the privacy page" leaves someone who just cleared everything with nowhere to
begin. §46a and §46b now assert both states, because that rule is exactly the kind of
thing a later reader would "fix".

**38b was measuring the wrong scope.** It read `main form button`, so it stopped covering
the entries screen the moment a control appeared beside the form — which is precisely what
"Add another goal" is. It also used three `.find()` lookups and never noticed a second
primary. Now scoped to `main section` and asserting exactly one primary with every other
control quiet.

### Package B — one visual language for the start page and the area page

219/219. The count fell from 224 because §36 shrank from twelve checks to seven: the
turn-saving-off path they covered no longer exists.

**The start page row is one block, not three columns.** The action and what it is for share
a left edge with the action a step larger; the control sits against the right edge. The
previous version spread three regions across the row with `gap-x-6` — it used the width,
but the goal drifted away from the action it belonged to. Two lines on a phone rather than
four, and alignment doing all of it.

**The pin is an icon**, the same one on both screens. Bordered like the two icon-only
controls that already existed — the theme toggle and the collapsed-nav trigger — because a
control edge at rest is what says "this is a control", which is why `--color-line-strong`
exists. A pin in a small circle is still far lighter than a text pill, which was the point:
half the pill weight per row, not none.

Three decisions inside that, each of which the obvious version got wrong:

- **The glyph changes with the state, not the colour.** Filled when pinned, outlined when
  not, at identical box size — so pressing it moves nothing and the state does not rest on
  hue. The accessible name flips too, which four `clickAria` sites already required.
- **`aria-pressed` is deliberately absent.** With a name that already flips, "Unpin,
  pressed" is ambiguous rather than clearer.
- **The CSS hook is a class, not an attribute selector.** My first version keyed off
  `[aria-label^='Unpin']` and therefore had a German string hardcoded in the stylesheet.
  Once the state lives in the accessible name, a class is the only locale-independent hook.

**The per-goal "What you want to try" heading is gone** from the area page. It put the same
sentence on screen once per goal; the indent rule already says those entries belong to the
goal above. The label stays where it earns its place — the onboarding screen, which has no
indent to say it.

**And the "Save on this device" switch is gone from `/data/`.** Turning it off deleted what
was stored, which is the same act as "Delete my data" further down the page, done by the
control that said less about it. What remains in that direction is a plain quiet button
offering to opt *in*, shown only to someone not already saving — a one-way action is a
button, because a toggle that can only be flipped on is a control lying about itself.

That opt-in was kept rather than removed with the rest for a reason worth recording: §39
walks the path where someone declines, says *why*, and later turns saving on, proving
`consent_concern` never reaches the device even then. Removing the path outright would have
made that guarantee unreachable rather than merely untested.

**§43 was replaced rather than repaired.** It asserted three regions across one row and
stacked on a phone — the layout being undone. It now measures what the new row claims: one
block with the action larger than its metadata, the control attached to the right edge and
level with the action's first line, and a row under 2.8 line-heights on a phone.

## Goal progress (branch `feature/verify-area-agnostic`)

An optional self-report on one goal — *How close are you to reaching this goal?* on five
points — on the goal cards on `/areas/<id>/` and in the start page's "My goals" view. One
new fact key, one new component shared by both hosts, no schema change, no `version` bump.
**270/270 checks pass**; §50 is twenty-two of them.

`docs/goals-and-areas.md` holds the model and `docs/design-system.md` the visual side. What
belongs here is what was learned.

### The `GOAL_KEY` trap has teeth, and now has a check

`/^area\.([^.]+)\.goal\.([^.]+)\.(text|why|state)$/` is what *discovers which goals exist*.
Adding `progress` to it would have let a store holding a rating and no text render a goal
with no words — silently, and only for stores that got into that state. `pinned` was already
excluded with a comment saying so; the comment is now a check (§50j) that seeds exactly that
store and asserts one card renders, not two.

The general form, worth stating once: **every field added under a goal id has to answer
whether it is, on its own, enough to mean a goal is there.** For `text`, yes. For everything
else so far, no.

### The page that promises to show everything would have hidden this

`isAreaKey()` keeps every `area.*` fact out of the generic list on `/data/stored/`, because
those keys carry internal ids; life-area facts render through `readAreaDetail()` instead. So
a new key that is not explicitly rendered there is **stored and invisible** — on the one page
whose entire job is to make the privacy promise checkable. Rendering it was part of the
change rather than a follow-up, and `GoalDetail` grew `progressAt` so it could be dated the
way a goal's state already is.

### Confirm-to-save changed the element, and simplified the hard case

The requirement arrived mid-build: no value saves without a confirm. That settled a question
that had been open on style grounds — native `<input type="radio">` in a `<fieldset>` is
*correct* here rather than merely convenient, because a radio is a held selection waiting to
be committed and `OptionList` fires on tap. It also made the fifth point simpler: the plan
had *Reached* swapping the scale for its own confirmation screen, and with a confirm button
already present the question just changes what that button says, with the scale still on
screen. Picking a lower point now undoes the choice in one tap, where a separate screen would
have hidden the control that undoes it.

§50b asserts the store is **byte-identical** while a point is selected. "No new fact" would
have been the weaker form, satisfied by a rewrite that happened to keep the count.

### Three checks failed for reasons that had nothing to do with the product

All three are the same family — an assertion that would have passed while guarding nothing:

- **`EN.manageDone` is `'Back'`,** and every nested page's back link reads "Back to your life
  areas". A `screen.includes` test for the footer therefore passes whatever the footer does.
  Rewritten to read button *text*, plus a card count.
- **"no stars at all" was the wrong claim.** Rating one goal takes down *that* row's star; the
  other goals are still listed and still starrable. The check now asserts the count drops by
  exactly one, which is the actual rule.
- **The filter caught the fixture.** `key.includes('goal.<gid>.')` matched the seeded `text`
  and `why` alongside the two facts the act produces, so a count over it would have been
  right for the wrong reason.

One more turned out to be a *better* test than intended: the first goal on the start page is
the **legacy** one, whose words live at the old bare `area.<a>.goal` key. Its rating lands
under the reserved gid like any other goal's, which is exactly the claim that putting the id
in the key buys — a goal can grow a field without its text having to move. §50r now asserts
that deliberately.

### Saying the same thing twice writes nothing

The write guard lives in `setGoalProgress` rather than at the two call sites, so it cannot
drift between the area page and the start page. `finishIntroduction(person)` already had the
shape for a guarded write.

The cost is recorded rather than discovered later: the log now holds *changes*, not
check-ins, so "when did they last confirm this was still a 3" has no answer. A periodic
check-in wants the opposite and should get its own key.

### Two lint rules were right

`Math.random()` for the congratulation's emoji is a hydration mismatch in a render body, and
picking one in an effect trips `react-hooks/set-state-in-effect` — which exists because it
costs a second render pass. Deriving it from the goal's own words is pure, needs no effect,
and is just as unguessable from the reader's side, which is all "random" was asking for.

### Nothing had to be inverted

The established habit here is to **invert** a check that defends a reversed rule rather than
delete it. There was nothing to invert: progress is new, so no existing assertion claimed the
top of the scale leaves a goal open. §50 says so in a comment, because "no check changed" is
otherwise indistinguishable from "we forgot to look".

## The introduction stops at one of each (branch `feature/verify-area-agnostic`)

Saving an action during the introduction now carries straight on to the next area. One goal
and one action per area, and the closing screen says where the rest is done and links there.
**272/272 checks pass.**

### The change is one flag, and the risk was dead code

`ActionEntry` gained `autoContinue`, `AreaFlow` gained `guided`, and `app/page.tsx` sets it.
The thing worth checking before narrowing a flow is what stops being reachable — here the
numbered list, the cap notice, the per-entry Edit and the offer of a second action. **None of
it died**, because the area page enters the same `AreaFlow` after a goal is added there,
without the flag. That is also where the user deliberately put this capability during the
inline-CRUD pass, so the two decisions agree rather than colliding.

`guided` is its own prop rather than `!straightToGoal`, even though they are opposites today.
One decides which question opens the flow; the other decides when it ends. Collapsing them
would make "open on the goal, but allow three" inexpressible without unpicking it.

### §29 moved rather than being deleted

It asserted three complaints about the entries screen — that more than one is allowed, that
the cap is three, that what you typed can be changed — and it ran inside the introduction,
which is now the one place none of that happens. Deleting it would have retired three real
guarantees along with the path they happened to use, so it was **re-based** onto the area
page's flow, which is where the behaviour lives.

That turned out to be worth more than the original: because §29 runs on the unguided flow and
§45i asserts the guided one auto-continues, the pair proves the ceiling is a property of the
*introduction* rather than of `ActionEntry`. If saving ever auto-continued everywhere, §29
fails at once.

### §4 needed two entries in one area, and gets them the way a person would

§24's claim is about an *area* — "finishing one with others still open asks nothing further"
— so spreading the two entries across areas would have made it pass while testing something
else. The second entry is now added through the area page's inline field after the
introduction, which is a real path rather than a seeded store. `runArea` lost its array and
takes one action, or `null` for "I do not know yet".

### The German walk had its own line to fix

§6 clicked "Weiter" after saving, which no longer exists. Fixed in German rather than by
routing through the English needles — that section exists precisely to catch what only breaks
in one language.

## Line weight (branch `feature/verify-area-agnostic`)

Controls and cards are drawn at `2px` through a new `--edge` token; separators stay at 1px.
**275/275 checks pass.**

### The earlier diagnosis was wrong, and worth correcting in writing

A previous attempt was reverted with the finding recorded as *"the `globals.css` additions
were not reaching the built CSS at all"*. That is false. `.scale-toggle`, added this week,
appears in the built stylesheet with every declaration intact — checked by grepping
`out/_next/static/chunks/*.css` rather than by inference. Nothing about the build was broken,
and the task was never blocked.

What was true is the smaller half of the note: **a `border-width` after an `@apply` in the
same rule competes with the utility's own width.** The fix is not to fight it but to stop
asking for it — `@apply border-line-strong` sets only `border-color`, so dropping the bare
`border` from the `@apply` and declaring `border-width: var(--edge)` beside it composes
cleanly.

### 1.5px was a change that only existed on the machine it was written on

The first value shipped correctly and rendered as 1px. Chrome floors a border to whole device
pixels, so `1.5px` is 1.5px at DPR 2 and 1px at DPR 1 — visible on the retina screen it was
designed on, invisible everywhere else. It was caught by measuring `getComputedStyle` at DPR
1, not by looking.

§51a asserts the **used** width rather than the presence of a declaration, which is the only
form of the check that would have failed. §51b asserts separators are still hairlines, since
sweeping them along would erase the distinction the token exists to create, and §51c that the
progress marks keep their 1px/2px pair — that difference is the second, non-colour cue for
*filled*, so equalising it would break §17 while looking like cleanup.

### `.card` replaced two literals

`rounded-lg border border-line bg-surface px-4 py-4 sm:px-5` appeared twice in JSX. It is one
class now, so the next card does not have to guess the recipe and "the cards look fragile" is
one edit.

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

## Pending follow-ups (non-blocking)

Raised during the cross-reviews of PR #4 (UI refinement) and PR #5 (Supabase
foundation). **Both were approved and merged with these outstanding**, so none of them
blocks anything today. They are written down because each one is cheap to fix now and
expensive to rediscover later — two of them only become wrong when a future phase
lands, which is exactly the kind of thing that gets found by the failure rather than by
the note.

Recorded, deliberately **not** implemented. Each needs its own task.

### 1. Automate the `out/` secret guard before the app imports the Supabase client

`docs/supabase-migration.md` §20 lists it in Phase 1's scope — "a build guard that fails
if any file in `out/` contains a `service_role` JWT" — and it is the one Phase 1 item not
built. The property currently holds and was measured by hand on the merge build: `out/`
contains no `sb_publishable_`, `sb_secret_`, `service_role`, `supabase.co`, `@supabase`
or `SUPABASE`, even though `next build` reads `.env.local`.

**Why it holds is the reason it is not urgent, and also the reason it will stop holding.**
Nothing in `app/` or `components/` imports `lib/supabase/client.ts`, so no Supabase
identifier reaches the bundle at all. The first real import changes that in one commit,
and from then on "no privileged value in the export" depends on the env var names being
right rather than on the graph. A checked property that becomes a remembered one is
precisely what a guard is for.

So the trigger is not a date: **land it before or with the first import of the Supabase
client into `app/` or `components/`** — Phase 2. `CLAUDE.md` §8 already forbids the thing;
this makes it enforced.

### 2. Consider filtering `MEMORY_ONLY_KEYS` on read as well as on write

`write()` (`lib/person/store.ts:210`) drops memory-only keys on the way to
`localStorage`, which is what closed the blocker found in PR #4. `parse()` does not: its
only filter is `facts.filter(isFact)` (line 186).

Consequence: a store written by a build from *before* that fix — or a hand-edited one —
loads `consent_concern` back into the snapshot and `/data/stored/` presents it as saved
data. It is dropped again on the next `write()`, so it self-heals, but not immediately
and not visibly.

Filtering symmetrically in `parse()` would make "never on the device" true on both sides
and would close the hand-edited case too. `scripts/verify.mjs` §39 covers the write path
and would pass unchanged; the read path has no check. Low severity — nothing is released
and the window is narrow — but it is the one remaining gap in the guarantee as
`docs/person-model.md` states it.

### 3. "I do not know yet" has no fact of its own, and the resume walk shows it

`isSettled()` is `Boolean(state.goal && state.active)` for a reviewed area, so an area
left by answering "I do not know yet" — a `review` fact, a `goal` fact, no step facts —
never counts as settled. `docs/goals-and-areas.md` records the visible half: a reload
mid-introduction resumes at the steps question of that area and re-offers a question
already answered.

**The cross-review found it is broader than one re-asked question.** `app/page.tsx` picks
`resumeArea` as the first area that is not settled, but `nextArea()` then advances by
**array index**, not by settledness. So after answering the resumed area the flow steps
into the next one by position, and `resume()` in `components/area-flow.tsx` returns
`'focus'` for any area with open entries — including one that already has an active
entry. That re-asks "which one first?" on a settled area, and answering appends a
redundant `area.<a>.step_active` fact. Nothing is lost or falsified, and the defect is
structurally older than the "I do not know yet" button; what the button changed is that a
rare tab-close became the ordinary outcome of a deliberate answer.

**The root is a missing fact, not a wrong predicate.** "There is nothing I want to change
here" is recorded as a real answer (`review = 'not_now'`, and `components/area-flow.tsx`
says so in as many words). "I want to change something but do not know what yet" is
recorded as nothing at all. Those two have the same standing to the person and opposite
treatment in the store. The same absence is why one copy string has to serve both a
deliberate answer and interrupted setup on the start page and on `/areas/`.

Relaxing `isSettled()` to accept a goal alone would be wrong — interrupted setup
genuinely is unfinished — which is the tell. The shape of the fix is additive: one token
key, no `version` bump, per the rule in `docs/person-model.md`. It should be decided
together with the status concept already parked in `docs/goals-and-areas.md`, not before
it.

**Amended (2026-08-13, `introduction_done`).** Still open, and deliberately not fixed —
but its *worst* consequence is gone. `resumeArea` is only consulted when `step === 'area'`,
which now requires `introductionFinished()` to be false, so nobody is routed back into
onboarding by this. What remains is the narrow original complaint: a reload mid-pass can
re-offer the steps question for an area that answered "I do not know yet", and answering
again appends a redundant `step_active`. `introduction_done` records that the **pass**
finished; `isSettled` decides **where an interrupted pass resumes**. Those are separated on
purpose in `lib/person/goals.ts`, and conflating them is the mistake the comments there
exist to prevent.

### 4. Switching focus requires retiring the previous entry

`m.manage.changeStep` ("Focus on something else") was removed from the area page, and the
two dissatisfaction answers on the start page were merged into one that calls
`retireStep()`. In `main` before PR #4, "I would rather do something else" wrote
**nothing** — it offered the choice and left the old entry open.

The result is that `chooseStep()` is now reachable only from the onboarding focus
question, from `AreaManage`'s add view when nothing is active, and from the start page's
pick phase — which is entered only *after* `completeStep()` or `retireStep()`. So
**`step_active` can no longer be moved without also writing `done` or `retired` on the
entry being left**, and `retireStep` has no inverse in the UI: nothing writes `'open'`.

Copy and behaviour agree — "This does not fit me anymore" is honest about retiring — and
`docs/goals-and-areas.md` records the change. The consequence not yet recorded is a data
one: `retired` stops meaning "I decided this no longer applies" and starts also meaning
"I deprioritised this", which is exactly the set a future resurfacing, check-in or journey
summary would read. It also quietly frees a slot under the three-entry cap that swapping
used to occupy.

Belongs with the priority-and-ranking follow-up in `docs/goals-and-areas.md`, since that
is what should replace free swapping.

### 5. Correct the stale verification counts in `docs/supabase-migration.md`

Four places still say the suite is 40 checks — §1 ("all asserted by `pnpm verify` (40
checks)"), and the Phase 1, Phase 2 and Phase 7 exit criteria ("still 40/40", "40/40 in
local mode", "the existing 40 checks mirrored"). The count on this merge is **181**.

`CLAUDE.md` §16 needs no change: it already says the script is the authority on the count
rather than naming one, which is the pattern the migration doc should adopt instead of a
fresh number that will go stale the same way. The phase exit criteria are the ones that
matter, because "still 40/40" read literally is a target that can never be met again.

## Open decisions

- **Publishing.** Still private, so the site is not live and step 12 is only
  half done: the commits are pushed, Pages is not enabled.
- **Verification 11** (the live URL, assets under the `/<repo>/` subpath, and a
  deep link to `/you/` surviving a reload) can only be done once it is live. The
  locally checkable half of it passed — see above.
- **pnpm 11.21.0** is available, as above.
