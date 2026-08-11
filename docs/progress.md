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
the two the plan singles out. **The current count is 181/181** (25 at the
foundation, 39 after the header controls, 78 after the first product loop, 123 after
the UX/UI rework); the script itself is the only authority on that number, so treat
any count written in prose as a snapshot.

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
