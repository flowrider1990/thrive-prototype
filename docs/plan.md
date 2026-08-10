# A shell for an app that supports living and thriving — local-first, statically hosted

> **Resuming this plan after the folder rename.** This file is the complete record —
> every decision below was settled deliberately, and nothing important lives only in
> the chat it came from. This file's own path is stable and outside any project folder:
> `C:\Users\flori\.claude\plans\we-will-create-an-fancy-hare.md`
>
> The originating conversation, if it is ever wanted, is at
> `C:\Users\flori\.claude\projects\C--Users-flori-dev-tutorial-project-document\3acf2276-814c-401d-bddc-9252224b136c.jsonl`
> — kept under the *old* folder name, since Claude Code keys history by path.
>
> To pick up: start a session in `C:\Users\flori\dev\thrive-prototype` and ask it to
> read this file. The project directory was empty when it was renamed, so there is no
> prior work to reconcile.
>
> **First action, before anything else:** copy this file into the project as
> `docs/plan.md` so it travels with the repo and gets committed. Then start at step 1.

## Context

`C:\Users\flori\dev\tutorial project document` is empty. The app's purpose is to
support a person in living and thriving. Concrete functions come later — **what has to
stand first is the shell**: consent, then a name, then one open question, then let them
in. Nothing further is demanded.

Two constraints shape everything below, and they happen to agree with each other:

- **Everything stores in the browser.** No Supabase, no accounts, no network. This
  deletes the hardest problem of an earlier draft — handing anonymous answers to a
  newly created account without losing them — rather than solving it, and it matches
  the precedent in `my-next-app`.
- **It has to be trivially hostable and shareable via GitHub Pages.** Which means a
  static export, no server, ever.

A local-first app is exactly what a static host can serve, so these pull in the same
direction: the app uses none of the features static export forbids. Supabase stays
deferred but recorded, with its shape kept portable (last section).

### The governing principle: consent gates persistence

Nothing leaves the browser — no API calls, no analytics, no CDN fonts, no AI. And
**nothing is written to the device unless the person said it was okay.** Declining
doesn't break the app; it runs in memory for that session and writes nothing at all.

One consequence the plan accepts rather than works around: declining means the
*decision itself* can't be remembered, so the question returns next visit. Persisting
"they said no" would be the single write that proves them right.

### Decisions locked

| Question | Decision |
| --- | --- |
| First build | Consent + opening conversation + person model. No feature domain. |
| Storage | Browser-local when consented; in-memory otherwise. |
| Hosting | GitHub Pages project site, static export, public repo. |
| Conversation | Scripted. Answers stored verbatim and unparsed. |
| Person model | Append-only list of facts. |
| Pacing | Name + one open question, then stop. |
| Languages | German **and** English, both complete from the start. |
| i18n | Typed catalogs in `lib/i18n`, no locale routes. |
| Answer language | Not detected, not recorded. Stored verbatim. |
| AI / Supabase | Not wired. |
| pnpm | Via corepack, pinned in `packageManager`. |

Folder, package name and GitHub repo all agree: **`thrive-prototype`** — so the Pages
URL reads `…github.io/thrive-prototype/`. The name shown to a person in the app is just
**thrive**; "prototype" is a fact about this iteration, not part of the product's name.

## Renaming the root folder

**Already handled**: the folder is renamed to `thrive-prototype` *before* scaffolding,
while it is still empty — no caches, no `node_modules`, no git history, nothing to
reconcile. The cheapest possible moment, and the reason this section is short.

The measures below keep any *future* rename equally cheap:

- **Nothing in the repo names the folder.** `package.json` says `thrive-prototype`;
  imports go through the `@/*` alias; no absolute paths anywhere. Git is unaffected —
  `.git` is self-contained.
- **The storage key does not track the package name.** It stays `thrive.person.v1`
  whatever the project is called. Tying it to the package name would mean a rename
  silently orphaned every person's saved answers — the one rename consequence that
  would be invisible until someone complained their data vanished.
- **The repo name isn't hardcoded either.** `basePath` comes from an environment
  variable set during the Pages build (below), so renaming the *repository* is equally
  free.
- **Only three things break**, all machine-local caches holding absolute paths, all
  gitignored: `.next/`, `node_modules/`, `tsconfig.tsbuildinfo`. Recovery is deleting
  them and running `pnpm install`. This goes in `docs/renaming.md`.
- **Pick a name without spaces.** The current one has them, which is a low-grade
  hazard for shell tooling on Windows.

The one thing outside my reach: this Claude Code session's history is keyed to the
current path, so it stays behind when the folder moves.

## Hosting

`next.config.ts`, following the official `nextjs/deploy-github-pages` template:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'export',
  basePath: process.env.PAGES_BASE_PATH,
  images: { unoptimized: true },
  trailingSlash: true,
}
export default nextConfig
```

`.github/workflows/deploy.yml` follows the same template: `actions/configure-pages@v5`
emits `base_path`, which is passed to the build as `PAGES_BASE_PATH`, then
`upload-pages-artifact@v3` and `deploy-pages@v4`. Two deliberate departures from the
template: `pnpm/action-setup@v4` runs **without a pinned version** so it reads
`packageManager` from `package.json` and can't drift from local, and Node is pinned to
22 to match this machine.

Verified rather than assumed:

- `output: 'export'` emits an `out/` folder, and a `404.html` that Pages picks up on
  its own.
- The artifact-based Pages flow **does not run Jekyll**, so the usual `.nojekyll` file
  is unnecessary. (It is required for the older gh-pages-branch approach — this is the
  classic trap and it does not apply here.)
- `images.unoptimized` is required for `next/image` under static export; set
  defensively even though the shell has no images yet.
- `trailingSlash: true` makes `/you` resolve as `/you/index.html`, which static hosts
  serve reliably.
- Static export forbids middleware, server actions, route handlers reading requests,
  cookies, rewrites, redirects, and headers. **The design uses none of them** — worth
  stating in `CLAUDE.md`, since reaching for a server action later would silently break
  the deploy.

Because the whole build is just `out/`, Cloudflare Pages, Netlify or Vercel would serve
it unchanged if Pages ever stops fitting.

## The opening conversation

Every string exists in German and English. English shown here.

**1. Consent.** *"This is an app prototype, only for personal use. Information you give
is saved only on the device you are using right now. Is this okay for you?"* —
**Yes** / **No**

Phrased positively so your two replies land the right way round; as originally written
(*"Is this a problem for you?"*) the yes-branch thanked people for objecting.

- **Yes** → *"Thank you for your trust, curiosity and willingness to help!"* → on to
  the name. Persistence is on from this moment.
- **No** → *"Oh ok. Why, what is the matter with that?"* — free text, **held in memory
  only, never written**. Their words are acknowledged, then they're asked whether
  they'd like to go on anyway. Continuing and stopping are both real options;
  continuing runs the whole app in memory-only mode.

**2. Name.** *"How should I call you?"*
**3. Open question.** *"Hello «name», how can I help you today?"* — skippable.

Then a thank-you, and they're in. One question on screen at a time, generous
whitespace, field already focused, no progress bar — there is nothing to endure.

## The person model

```ts
type PersonFact = {
  id: string          // crypto.randomUUID()
  key: string         // 'preferred_name' | 'opening_intent' | anything later
  value: string       // the person's own words, verbatim, unparsed
  source: string      // how it came up — 'onboarding' for now
  learnedAt: string   // ISO timestamp
}
type PersonStore = {
  version: 1
  consentAt: string   // only ever written when consent was given
  locale: 'de' | 'en'
  facts: PersonFact[]
}
```

Entries are **added, never edited** — answer the same question differently in three
months and the app keeps both, and can see something changed. For an app about how a
life is going, that history is the interesting part. Current state is a derived read:
newest entry per `key`. `version` exists so a later shape change can migrate rather
than guess.

### Two backends, one API

`lib/person/store.ts` exposes `usePerson()` for reads, `remember()` and
`forgetEverything()` for writes, over an interface with two implementations: **local**
(one `localStorage` key, `thrive.person.v1`) once consent is given, and **memory**
(React state, dies with the tab) when it isn't. Callers never know which is active.

Nothing else in the app touches storage. That chokepoint is what makes the consent
switch one line and the Supabase swap later one file. Guarded JSON parsing: a corrupt
or hand-edited key degrades to "nothing known yet", never a white screen. The chosen
locale is data too — persisted when consented, session-only when not.

## Internationalization

- `lib/i18n/messages/en.ts` is the source; `de.ts` is typed as `Messages = typeof en`,
  so **a missing or misspelled key is a build error**, not a string that silently falls
  back to English at 11pm.
- Nested by screen, with a small `t()` supporting `{name}` interpolation. No library —
  a catalog plus a context is a few dozen lines, and next-intl's routing machinery buys
  nothing without a server or SEO need.
- Initial locale from `navigator.language` (`de*` → German, else English). Reading is
  not storing, so this is fine before consent — which matters, since the consent screen
  itself must be in some language.
- A switcher in the shell, working on every screen including consent.
- German written as real copy, not word-for-word: *"How should I call you?"* → *"Wie
  darf ich dich nennen?"* The `du`/`Sie` choice is made once — **`du`**, for a wellbeing
  app — and recorded in the docs. Switching register mid-flow feels broken in a way
  that's hard to name.

## Routes

- **`/`** — the conversation, and the greeting once a name is known.
- **`/you`** — everything the app knows, in the person's own words, with when it was
  learned; a plain statement it never left this browser; and **forget everything**. In
  memory-only mode it says so instead. This page is what makes the premise credible.
- **`/about`** — what this is, and what it isn't yet.

### The one real technical wrinkle

`localStorage` and `navigator.language` don't exist during the build, and static export
prerenders every page at build time — so each page ships knowing neither the person nor
the language. Reading them during first render causes a hydration mismatch; reading
them in an effect causes a visible flash of the wrong state: a returning person greeted
with *"How should I call you?"* for a frame, in the wrong language. Precisely the wrong
first impression.

So the app is deliberately a client-rendered shell. The prerendered HTML is furniture
only; `usePerson()` and the locale context expose an explicit
`status: 'loading' | 'ready'`, and no copy renders until mounted. Same discipline as
the pre-paint theme script in `my-next-app`.

## Steps

0. **Preserve the plan**: copy this file to `docs/plan.md` in the project, before
   anything else, so it is committed with the first commit.
1. **pnpm**: `corepack enable pnpm`, confirm `pnpm -v`.
2. **Scaffold**: `pnpm create next-app@latest . --ts --tailwind --eslint --app --empty
   --import-alias "@/*" --use-pnpm`. No `--src-dir` — it doesn't exist as `--no-src-dir`
   and is off by default. If saved preferences from an earlier run force `src/`, re-run
   with `--reset-preferences`. Set `"name": "thrive-prototype"`.
3. **Pin pnpm**: `corepack use pnpm@11` — this, not `corepack enable`, is what writes
   `packageManager`.
4. **Tidy**: decide on the auto-generated `AGENTS.md` (delete in favour of `CLAUDE.md`,
   or keep as a pointer); confirm git was auto-initialized, since `create-next-app`
   does that by default now.
5. **Config and deploy**: `next.config.ts` and `.github/workflows/deploy.yml` as above.
6. **i18n first**, before any screen exists, so no string is ever hardcoded.
7. **The store**: `lib/person/store.ts`, both backends, the consent switch.
8. **The conversation**: `app/page.tsx` plus `components/question-card.tsx`,
   `text-answer.tsx`, `choice.tsx` — a state machine over consent → (concern →
   continue?) → name → open question → greeting.
9. **`/you` and `/about`**, with forget-everything behind an in-page confirm step — not
   a browser `confirm()` dialog.
10. **Shell and styling**: type and spacing scale, one quiet palette, light/dark set
    before first paint. Calm and restrained — the assumption you left to me.
11. **Docs**: `CLAUDE.md` (purpose, stack, running it, the absent feature domain, the
    consent principle, and the no-server constraint); `docs/persistence-decision.md`;
    `docs/person-model.md`; `docs/copy-and-language.md`; `docs/hosting.md`;
    `docs/renaming.md`.
12. **Commit**, then push and enable Pages (Settings → Pages → Source: GitHub Actions).

## Files created

```
package.json  pnpm-lock.yaml  tsconfig.json  next.config.ts  eslint.config.mjs  .gitignore
.github/workflows/deploy.yml
app/layout.tsx  app/globals.css  app/page.tsx  app/you/page.tsx  app/about/page.tsx
components/{page-shell,question-card,text-answer,choice,language-switch}.tsx
lib/person/store.ts
lib/i18n/{index.tsx,messages/en.ts,messages/de.ts}
CLAUDE.md  docs/plan.md
docs/{persistence-decision,person-model,copy-and-language,hosting,renaming}.md
```

## Verification

1. `pnpm build` — the real check; `pnpm dev` tolerates type errors the build rejects.
   Zero type errors, `pnpm lint` clean, and an `out/` folder produced.
2. **Serve the export locally** (`npx serve out`) and walk the whole flow there, not
   just in `pnpm dev`. Static export is where client-only assumptions surface.
3. **Missing translation is a build error**: delete a key from `de.ts` and confirm
   `pnpm build` fails. If it passes, the typing isn't doing its job.
4. **Consent yes**: full flow → greeting by name → reload → greeting appears
   immediately with **no flash** of the consent or naming question. Watch for it
   deliberately; it's the failure this design guards against.
5. **Consent no — the critical one**: decline, give a reason, continue, answer
   everything, then confirm `localStorage` is **completely empty**. Not "no facts" — no
   key at all, including consent and locale. Reload and confirm it starts over.
6. **Language**: switch to German on every screen including consent; no English leaks,
   and `{name}` interpolation reads correctly in both.
7. **Append-only**: answer the name question twice; `/you` shows both with timestamps
   and the greeting uses the newer.
8. **Forget everything** returns to a fresh state; reload confirms the key is gone.
9. **Nothing leaves the browser**: devtools Network open, whole flow in both languages,
   no request beyond the app's own assets. This is the claim the app makes to the
   person, so it's checked rather than assumed.
10. **Corrupt store**: hand-edit the key to invalid JSON; degrade to "nothing known
    yet", don't white-screen.
11. **Deployed**: after the first Pages run, the live URL loads, assets resolve under
    the `/<repo>/` subpath, and a deep link to `/you/` works on reload — the failure
    mode a wrong `basePath` or `trailingSlash` produces.
12. **Rename rehearsal**: rename the folder, delete `.next`, `node_modules`,
    `tsconfig.tsbuildinfo`, run `pnpm install`, and confirm `pnpm build` still passes.

## When this moves to Supabase

`PersonFact` is already shaped like a table row — `key`, `value`, `source`, `learnedAt`
map one-to-one onto columns, and append-only maps onto an append-only table with a
"newest per key" view. The move is: add auth, add `person_facts` with RLS on
`auth.uid()`, add a third backend behind the existing store interface, and offer local
data as a one-time import. Consent gating survives unchanged — it already sits above
the backend choice.

**Static hosting changes the shape of that integration**, so it's recorded now: with no
server there is no `@supabase/ssr`, no middleware session refresh, and no server-side
guard. It would be the browser client with the publishable key, and **RLS becomes the
only thing standing between one person's answers and another's** — not one layer of
several. Worth knowing before, not during.

Two details already scouted: a Postgres view over an RLS table needs
`security_invoker = on` or it bypasses the policies it sits behind; and the current env
var is `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
