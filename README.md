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

`pnpm verify` drives the served export over the DevTools protocol and asserts the
things this app claims — including that declining leaves `localStorage`
completely empty, that a reload shows no flash of the wrong screen, and that no
request goes anywhere but the app's own assets. It needs a server already running
at `http://localhost:4321` (or pass another base URL as an argument).

## Deployment

Static export to GitHub Pages via Actions. See [docs/hosting.md](docs/hosting.md).

## Documentation

| | |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | the constraints that govern the code |
| [docs/plan.md](docs/plan.md) | the plan this was built from, verbatim |
| [docs/progress.md](docs/progress.md) | what got built, and what was learned doing it |
| [docs/persistence-decision.md](docs/persistence-decision.md) | why browser-local, and what it costs |
| [docs/person-model.md](docs/person-model.md) | the append-only fact list |
| [docs/copy-and-language.md](docs/copy-and-language.md) | both languages, and the `du` decision |
| [docs/hosting.md](docs/hosting.md) | static export and Pages |
| [docs/renaming.md](docs/renaming.md) | renaming the folder, package or repo |
