# thrive

A prototype of an app meant to support a person in living and thriving.

What exists today is the shell: it asks for consent, then a name, then one open
question — and then stops. There is no feature domain yet, on purpose.

- **Everything stays in your browser.** No server, no accounts, no analytics, no
  AI, no network calls of any kind.
- **Nothing is written to your device unless you said it was okay.** Declining is
  a real option: the app then runs in memory for that visit and writes nothing at
  all.
- **What you say is kept in your own words**, added to a list rather than
  overwritten, so a later answer never erases an earlier one.
- German and English, both complete.

## Running it

```bash
pnpm install
pnpm dev                        # http://localhost:3000
```

## Checking it

```bash
pnpm build                      # the real check: static export into out/
pnpm lint
pnpm dlx serve out --listen 4321
pnpm verify                     # walks the whole flow in real Chrome, headless
```

The cloud side has its own checks, kept separate because `pnpm verify` asserts that
nothing leaves the browser and these deliberately make real network calls. They need
`.env.local` and `supabase/.env.rls-test`, both git-ignored:

```bash
pnpm check:schema          # every table has RLS, real policies, nothing granted to anon
pnpm check:rls             # those policies, as two real users
pnpm check:sync            # push, pull, conflicts and generations, against the real database
pnpm check:delete-account  # the deployed Edge Function, end to end
pnpm check:bundle          # no privileged credential in out/
```

`pnpm verify` drives the served export over the DevTools protocol and asserts the
things this app claims — including that declining leaves `localStorage`
completely empty, that a reload shows no flash of the wrong screen or the wrong
theme, and that no request goes anywhere but the app's own assets. It needs a
server already running at `http://localhost:4321` (or pass another base URL as an
argument).

Worth doing both, because they catch different things:

```bash
node scripts/verify.mjs http://localhost:3000   # against `pnpm dev`
```

React only warns about hydration mismatches in development, so the production
export cannot surface them however many checks pass.

## Accounts and sync

Optional, off by default, and the app is complete without it: signing in with an email
one-time code mirrors the same data to Supabase, so another device can catch up. Local
storage stays the source of truth and nothing waits on the network.

**Known limitation — a real person cannot finish signing in yet.** Replacing Supabase's
stock email template needs a paid plan or a custom SMTP provider, and the prototype has
decided against both, so the email arrives with a link and no code while the app
deliberately ignores links. The flow is complete and tested; it is exercised internally by
reading the code out of the admin API. The sign-in dialog says so on screen. Lifting it is
one commit — see the end of [docs/supabase-migration.md](docs/supabase-migration.md).

## Deployment

Static export to GitHub Pages via Actions. See [docs/hosting.md](docs/hosting.md).

## Documentation

| | |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | the constraints that govern the code |
| [docs/plan.md](docs/plan.md) | the plan this was built from, verbatim |
| [docs/progress.md](docs/progress.md) | what got built, and what was learned doing it |
| [docs/persistence-decision.md](docs/persistence-decision.md) | why browser-local, and what it costs |
| [docs/supabase-migration.md](docs/supabase-migration.md) | the cloud: decisions D1–D11, the schema, and what is deferred |
| [docs/supabase-migration.md](docs/supabase-migration.md) | proposal for cloud persistence — not implemented |
| [docs/person-model.md](docs/person-model.md) | the append-only fact list |
| [docs/copy-and-language.md](docs/copy-and-language.md) | both languages, and the `du` decision |
| [docs/hosting.md](docs/hosting.md) | static export and Pages |
| [docs/renaming.md](docs/renaming.md) | renaming the folder, package or repo |
