# Progress against `docs/plan.md`

The plan is the spec; this file records what was actually built, where reality
differed from the plan, and what is left.

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
added (Node 22 has a global `WebSocket`). **25/25 checks pass**, covering plan
items 4–10 — including the two the plan singles out:

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
