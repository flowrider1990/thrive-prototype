@AGENTS.md

# thrive-prototype

An app shell meant to support a person in living and thriving. What stands today
is only the shell: consent, then a name, then one open question, then they are
in. Nothing further is demanded of them.

The product is called **thrive** where a person can see it. "prototype" is a
fact about this iteration, not part of the name.

`docs/plan.md` is the plan this was built from, kept verbatim. `docs/progress.md`
records how far it got and what was learned on the way.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · pnpm (pinned via
`packageManager`). No other runtime dependencies, deliberately.

```bash
pnpm install
pnpm dev            # http://localhost:3000
pnpm build          # the real check — type errors that dev tolerates fail here
pnpm lint
pnpm dlx serve out  # walk the actual static export
```

If `pnpm` is missing, see the corepack note in `docs/renaming.md`.

## Two constraints that govern everything

### 1. Consent gates persistence

Nothing leaves the browser — no API calls, no analytics, no CDN fonts, no AI —
and **nothing is written to the device unless the person said it was okay.**

- `lib/person/store.ts` is the only module that touches storage. Everything else
  goes through `usePerson()`, `remember()` and `forgetEverything()`. Keep it that
  way: that chokepoint is what makes the consent switch one line.
- Declining is a real option. The app then runs in memory mode and writes
  **nothing at all** — not the facts, not the locale, not even the decision to
  decline. Persisting "they said no" would be the single write that proves them
  right, so the question returns next visit instead. That is accepted, not a bug.
- Facts are **append-only**. Never edit or delete an entry to reflect a change;
  add a new one. Current state is a derived read (newest per key).

### 2. No server, ever

The app is a static export (`output: 'export'`) hosted on GitHub Pages. Static
export forbids middleware, proxy, server actions, route handlers that read the
request, cookies, rewrites, redirects and headers. **The design uses none of
them** — reaching for a server action later would silently break the deploy.

A consequence worth knowing before writing UI: `localStorage` and
`navigator.language` do not exist at build time, so every page ships knowing
neither the person nor the language. The app is therefore a deliberately
client-rendered shell — the prerendered HTML is furniture only, and **no copy
renders until `status === 'ready'`**. Reading storage during render is a
hydration mismatch; reading it in a page-level effect brings back the flash of
the wrong state this design exists to prevent.

## Copy

Every string lives in `lib/i18n/messages/en.ts` (the source) and `de.ts` (typed
as `Messages = typeof en`, so a missing key is a build error). German is real
copy, not word-for-word, and addresses the person as **du** throughout. Never
hardcode a user-visible string. See `docs/copy-and-language.md`.

## What is deliberately absent

No feature domain: no habits, no journal, no mood tracking, no reminders. No
accounts, no Supabase, no AI. Do not add one on the way past — the point of this
iteration is that the shell can be trusted before anything is built on it.
`docs/persistence-decision.md` records the terms a future Supabase backend would
have to meet.
