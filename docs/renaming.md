# Renaming the folder, the package or the repository

All three are cheap, and this file exists to keep them that way.

## Nothing in the repo names the folder

- `package.json` says `thrive-prototype`; imports go through the `@/*` alias;
  there are no absolute paths anywhere.
- Git is unaffected — `.git` is self-contained.
- **The storage key does not track the package name.** It stays
  `thrive.person.v1` whatever the project is called. Tying it to the package name
  would mean a rename silently orphaned every person's saved answers — the one
  rename consequence that would be invisible until someone complained their data
  had vanished.
- **The repo name is not hardcoded either.** `basePath` comes from
  `PAGES_BASE_PATH`, set during the Pages build, so renaming the repository is
  equally free.

## What actually breaks

Three machine-local caches that hold absolute paths, all gitignored:

```
.next/  node_modules/  tsconfig.tsbuildinfo
```

Recovery:

```bash
rm -rf .next node_modules tsconfig.tsbuildinfo
pnpm install
pnpm build
```

Rehearsed rather than assumed: the repo was copied to a differently-named folder
without those caches, then `pnpm install && pnpm build && pnpm lint` were run
there from scratch. All passed.

## Pick a name without spaces

The original folder had them, which is a low-grade hazard for shell tooling on
Windows. `thrive-prototype` — folder, package name and GitHub repo all agree, so
the Pages URL reads `…github.io/thrive-prototype/`.

## The one thing outside the repo's reach

Claude Code keys its session history by absolute path, so a rename leaves earlier
conversations behind under the old path. Nothing in the project depends on them —
`docs/plan.md` and `docs/progress.md` are the record.

## If pnpm is missing after a fresh clone

On this machine `corepack enable pnpm` fails with
`EPERM … open 'C:\Program Files\nodejs\pnpm'`, because writing shims into the Node
install directory needs an elevated shell. Install them into npm's user prefix
instead, which is already on `PATH`:

```powershell
corepack enable pnpm --install-directory "$env:APPDATA\npm"
```

Do **not** work around it with `npm i -g pnpm`: that defeats the pinned
`packageManager` version, which is the thing keeping CI and local in step.
