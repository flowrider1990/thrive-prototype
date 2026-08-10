# Progress against `docs/plan.md`

Working notes for resuming. The plan itself is the spec; this file only records
where the work stopped and what was learned along the way.

Last worked: 2026-08-11 (session stopped for the night, mid-step 6).

## Done

- **Step 0** — plan copied to `docs/plan.md`, committed with the scaffold's
  initial commit.
- **Step 1** — pnpm 11.18.0 available via corepack. See the caveat below; this
  did not go the way the plan assumed.
- **Step 2** — scaffolded with
  `pnpm create next-app@latest . --ts --tailwind --eslint --app --empty --import-alias "@/*" --use-pnpm --yes`.
  Got **Next 16.3.0, React 19.2.8, Tailwind 4.3.3**. No saved
  create-next-app preferences existed, so `--reset-preferences` was not needed
  and no `src/` directory was forced. Git was auto-initialized *and* an initial
  commit was made. `"name": "thrive-prototype"` was set by the CLI already.
- **Step 3** — `packageManager` is `pnpm@11.18.0`, written by the create
  command itself, so `corepack use pnpm@11` was not run. The plan's goal (a
  pinned `packageManager` the CI workflow can read) is satisfied. Pinning the
  exact locally-installed version is if anything closer to the plan's stated
  reason for leaving `pnpm/action-setup` unpinned: no drift from local.
- **Step 5** — `next.config.ts` and `.github/workflows/deploy.yml`, both as
  specified. Verified against Next 16's own bundled docs
  (`node_modules/next/dist/docs/01-app/02-guides/static-exports.md`), not from
  memory — the scaffold ships an `AGENTS.md` warning that Next 16 differs from
  training data. The static-export config, the unsupported-features list and
  the GitHub Pages template reference all still hold in 16.3.
- **First `pnpm build` passes**: zero type errors, `out/` produced, containing
  `404.html` — both as the plan predicted.

## In progress

- **Step 6 (i18n)** — only `lib/i18n/locale.ts` exists so far (`Locale` type,
  `isLocale`, `detectLocale` from `navigator.language`). Still to write:
  `lib/i18n/messages/en.ts`, `messages/de.ts` typed as `Messages = typeof en`,
  and `lib/i18n/index.tsx` with the provider and `t()`.

## Not started

Steps 4 (the `AGENTS.md` decision), 7–12, and the whole verification list.

## Things learned that the plan could not have known

- **`corepack enable pnpm` fails on this machine** with
  `EPERM … open 'C:\Program Files\nodejs\pnpm'` — writing the shim into the
  Node install directory needs an elevated shell. The fix, no admin required:

  ```powershell
  corepack enable pnpm --install-directory "C:\Users\flori\AppData\Roaming\npm"
  ```

  That directory is npm's user-global prefix and is already on `PATH`, so
  `pnpm` resolves normally afterwards. Worth knowing before any fresh clone or
  a rename rehearsal (verification step 12) sends someone back through setup.
- **pnpm reports 11.21.0 is available.** Left alone deliberately: bumping it
  means also updating `packageManager`, and matching CI to local is the point.
- **The scaffold now writes both `AGENTS.md` and `CLAUDE.md`**, where
  `CLAUDE.md` is just `@AGENTS.md` and `AGENTS.md` carries a block that
  `next dev` rewrites on every run. Step 4's decision should account for that
  regeneration: deleting `AGENTS.md` outright means `next dev` recreates it as
  an uncommitted change. Keeping it, and writing the project's own guidance
  into `CLAUDE.md` above the `@AGENTS.md` reference, avoids fighting the tool.
- **One file beyond the plan's file list**: `lib/i18n/locale.ts`. The `Locale`
  type is needed by both `lib/i18n` and `lib/person/store.ts` (the store
  persists the chosen locale), and a leaf module both can import is what keeps
  that from becoming a circular import between the provider and the store.

## Next action

Finish step 6: write `messages/en.ts`, then `de.ts` typed against it, then
`lib/i18n/index.tsx`. Then step 7, the store — it is what the conversation in
step 8 sits on.
