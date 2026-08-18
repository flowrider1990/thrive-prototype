@AGENTS.md

# CLAUDE.md

## 1. Project North Star

This is a mobile-first application whose core mission is to support the user's **long-term well-being, agency, relationships, growth, and flourishing**.

The product should help a person:
- understand what matters to them,
- identify needs without assuming identity, gender, religion, culture, or ideology,
- choose a small number of meaningful goals,
- turn those goals into concrete next actions,
- reflect on whether actions actually helped,
- communicate needs with kindness and clarity,
- gradually learn what works for them.

The app must not optimize for compulsive engagement. A short session that helps the user take a useful action outside the app is a success.

### Core product loop

**Notice → Choose → Act → Reflect → Adjust**

Features should strengthen this loop rather than compete with it.

---

## 2. Feature Manifest — Every Feature Must Pass This Test

Before implementing a feature, ask:

1. **Does it support long-term well-being rather than short-term engagement alone?**
2. **Does it increase agency, clarity, competence, connection, health, meaning, growth, or joy?**
3. **Does it lead toward a concrete useful action or better reflection?**
4. **Does it respect user autonomy?**
5. **Does it avoid unnecessary assumptions about gender, identity, culture, religion, politics, or lifestyle?**
6. **Can it be explained simply to the user?**
7. **Is it necessary at the current product stage?**
8. **Can we measure whether it actually helps?**
9. **Does it avoid manipulative dark patterns, shame, addictive engagement mechanics, or false psychological/medical claims?**
10. **Is there a simpler version that delivers most of the value?**

If a proposed feature fails this test, challenge it before building it.

---

## 3. Product Principles

### Behavioral psychology first
Prefer mechanisms that help users act:
- clear next actions,
- small achievable steps,
- implementation intentions,
- reflection and feedback,
- appropriate reminders,
- progressive challenge,
- user-controlled accountability.

Do not confuse information, inspiration, streaks, notifications, or screen time with meaningful progress.

### Flourishing, not permanent happiness
Do not promise constant happiness. The app should support a life that the user considers worthwhile, including difficult periods.

### Autonomy over prescription
Ask before assuming. Prefer:
- “What matters to you?”
- “What do you need?”
- “What would make this slightly better?”
- “Is this still a goal you want?”

Avoid presenting one correct lifestyle.

### Psychology of the individual
Personalize based on the person's stated goals, behavior, feedback, and outcomes rather than identity categories.

### Warm, not sentimental
The UI and copy should be humane, clear, calm, modern, and minimal. Avoid corporate wellness language, forced positivity, excessive praise, or pseudo-therapy.

### The product speaks in dialogue, not in labels
Communication with the person is held to a high standard. Inside a flow or a process, aim
for an exchange that reads as **dynamic and organic** — a question, and something that
reads like an answer to it.

Concretely, this means the two halves have to be written **as a pair**:

- a question earns its place when it says what the thing under it is *for*; a heading that
  merely names the field does not,
- the options offered in reply should read as things a person would say, not as states the
  app is asserting about them. "How close are you to reaching this goal?" is answered with
  *Kind of*, not with *Getting closer* — the second is the app narrating your situation back
  at you,
- an answer is short. A label explains itself; a reply does not have to,
- what is shown afterwards should sound like it heard the answer.

This is a writing rule, not an instruction to add prompts. Asking more often is not more
dialogue — §2 and §5 still govern whether a question exists at all. It governs the wording of
the exchanges that are already there.

`docs/copy-and-language.md` holds the mechanics; this is the standard they serve.

### Evidence over folklore
Where product behavior depends on psychology, health, behavioral science, or safety:
- distinguish evidence from hypothesis,
- prefer systematic reviews, meta-analyses, validated frameworks, and primary sources,
- do not make medical or therapeutic claims without appropriate evidence,
- document important evidence or uncertainty.

### No engagement-for-engagement's-sake
Do not optimize for:
- maximum time in app,
- infinite feeds,
- compulsive streak protection,
- unnecessary notifications,
- artificial urgency.

Prefer meaningful actions completed outside the app.

---

## 4. Current Product Stage

The repository contains the trusted shell, the first product loop, and — since the
cloud-sync phase — an optional account that mirrors the same data to Supabase. Nothing
beyond that.

Existing foundation:
- consent flow,
- optional decline reason,
- continue-without-persistence path,
- `/you` and `/about`,
- English and German copy,
- local/in-memory person store,
- static export,
- automated verification.

First product loop (see `docs/goals-and-areas.md`):
- seven fixed life areas, reviewed one per screen during onboarding,
- up to three goals per area, where the person wants them — **one** asked for during
  onboarding, more added from the area's own page,
- up to three prepared next steps per area — again **one** during onboarding, where
  saving it carries straight on to the next area,
- completing a step, then choosing another or not,
- a small per-area view for changing the goal and the steps,
- starring an entry, a goal or a life area, which orders the list it appears in,
- an optional five-point answer to "how close are you to reaching this goal?", offered on
  the area page and the start page, never asked for — and where the top of the scale asks
  whether to mark the goal reached.

Name capture and the single open question were **removed** so the app asks for less.
Their keys, labels and copy are parked rather than deleted, so an answer someone
already gave still shows on `/you`.

Do not interpret the broader product vision in this file as permission to skip ahead and implement future domains without an explicit task.

---

## 5. Near-Term Product Direction

Once the current shell/deployment foundation is complete and a new implementation phase is explicitly approved, the first useful product should remain deliberately small.

Built (approved and implemented — §4):
- a small set of life areas,
- up to three goals per area, with one of them put first,
- an optional note on a goal saying why it matters,
- up to three things to try across an area, each belonging to one goal, any number of
  which can be pinned to the start page,
- complete a step,
- an optional five-point self-report on how close a goal feels, where the top of the
  scale offers to close the goal,
- mobile-first responsive UI,
- light and dark monochrome themes,
- an **optional** account (email one-time code) that mirrors the same facts to
  Supabase, with an explicit choice when the device and the account disagree, and
  with signing out, deleting the data, and deleting the account kept as three
  distinct acts. Off by default, never prompted for, and the app is complete
  without it.

Still not built, and each needs its own approval:
- lightweight daily check-in,
- perceived difficulty + helpfulness feedback,
- weekly review,
- gratitude page,
- resurfacing or reminding someone of a next step,
- **any prompt the app raises on its own initiative** about how something is going,
  what is getting in the way, or whether it still matters.

That last line used to read "any prompt about how something is going", and the goal
check-in is why it now says *on its own initiative*. The distinction is the one worth
holding: a control someone reaches for is a different product from a question the app
decides to ask. Nothing resurfaces, nothing reminds, and no answer is ever required —
which is the whole of what this entry was protecting. See `docs/goals-and-areas.md`.

The behavioural direction those belong to is Purpose → Next Step → Resurface →
Action, and only where action repeatedly stalls, Obstacle → Reflection → Adjust.
Direction, not a queue of work.

Do **not** add unless explicitly approved:
- AI coaching,
- community/social feed,
- health APIs,
- screen-time integrations,
- calendar integrations,
- external task-manager integrations,
- personality typing,
- marketplace,
- paid skins,
- complex gamification,
- monetization systems.

Design current work so future additions remain possible, but do not prematurely implement or abstract for them.

---

## 6. Future Product Direction

Potential later capabilities include:
- AI-assisted coaching and reflection,
- selectable coaching style (gentle, direct, minimal, etc.),
- calendar / task / knowledge-system integrations,
- health and screen-time signals,
- personalized next-action recommendations,
- community-rated task difficulty and helpfulness,
- consensual sharing of experiences, life tips, and challenges,
- collaborative idea/function voting,
- contributor attribution and gratitude,
- optional customization and skins,
- virtual-assistant calls/reminders,
- optional account-backed cloud synchronization.

Treat these as **direction**, not current requirements.

---

## 7. UX Direction

### Mobile first
Design for phone width first, then tablet and desktop.

### Visual language
Direction:
- black and white / neutral, with no accent hue,
- modern,
- warm rather than sterile,
- strong typography and spacing,
- low visual noise.

Calm is the constraint, not plainness: the visual direction may be more
distinctive than "minimal" first suggested, as long as it stays quiet. A serif
display face for headings against sans body text is the current expression of
that.

Support:
- light mode,
- dark mode.

Build the visual system so themes and future skins can be changed without
rewriting product logic. Tokens are authoritative: no component may name a color.

### Design-system approach
The visual system is project-owned. Established interaction and accessibility
patterns are the reference, with Material Design 3 useful for the patterns — not
the look. Do not reproduce Material's visual identity by default and do not make
the product technically dependent on Material components.

For genuinely complex interactive behavior — roving focus, collision-aware
positioning, focus trapping — prefer an established **headless** primitive
library over a hand-rolled implementation. Base UI is the current choice if and
when one is needed; it is not a dependency today, and adding it needs approval
(§11).

Keep UI components driven by project-owned design tokens so colors, typography,
spacing, shapes, themes, and future skins can change without rewriting product
behavior.

Component-level rules — the token table, the type and shape scales, why the
active-state indicator must not change an element's metrics, and why a theme
change must never be animated — live in `docs/design-system.md`.

### Interface hierarchy
As the product grows, the primary experience should increasingly help answer:

**“What is the most useful next thing for me to do?”**

Avoid dashboard overload.

### Inclusive language
- Do not ask for or assume gender unless a future feature genuinely requires it.
- Do not infer identity, religion, political orientation, sexuality, health status, or personality.
- Use neutral language by default.

---

## 8. Current Engineering Constraints

Respect the architecture that exists today.

Current stack:
- Next.js 16 App Router,
- React 19,
- TypeScript,
- Tailwind 4,
- pnpm,
- static export hosted/planned for GitHub Pages,
- Git / GitHub.

`@supabase/supabase-js` is the one runtime dependency beyond the framework
(decision D3 in `docs/supabase-migration.md`). It **is** in the shipped bundle now:
`lib/cloud/` uses it for email sign-in and cloud sync. Beyond that, there are
deliberately no additional runtime dependencies at the current stage.

### Supabase secret handling
- Client/runtime code may use only the Supabase publishable key.
- Never expose `sb_secret_...`, service-role, or other privileged credentials
  through `NEXT_PUBLIC_*`, client-side code, static output, or Git.
- Privileged Supabase credentials may only be used in isolated trusted tooling or
  test scripts that are outside the shipped application runtime and use gitignored
  environment files.
- Never use an admin/service-role client to verify RLS behavior; RLS assertions
  must run as real authenticated users.

An admin client that asserts RLS proves nothing: it bypasses RLS by definition, so
every check would pass whether the policies were right, wrong, or absent. Admin
rights are for creating and destroying throwaway users, never for the assertions
themselves. Cleanup must run even when the assertions fail.

### Current persistence model
- `lib/person/store.ts` is the only storage boundary.
- Everything else must use the existing person-store API.
- Persistence is gated by consent.
- Declining persistence must leave `localStorage` completely empty.
- Memory mode must remain genuinely non-persistent.
- Facts are append-only; current state is derived from the newest fact for a key.

### Cloud sync, and what it does not change
Signing in adds a **mirror**, never a second source of truth (decision D1). The
device stays authoritative, every write lands locally first and is acknowledged
immediately, and the app is fully usable with no account and no network.

- `lib/cloud/` is the only place that talks to the network:
  `account.ts` (sessions), `facts.ts` (rows), `compare.ts` (are two datasets the
  same?), `sync.ts` (when any of that happens). No component performs a database
  write, and `sync.ts` renders nothing.
- **Cloud requires device consent first** (decision D2). Staying signed in means
  keeping a token on the device, so it is never offered to someone who declined.
- **Signed in means syncing.** There is one state, not two: "turn sync off" and
  "sign out" are the same function reached from two places.
- **`MEMORY_ONLY_KEYS` are filtered where rows are built**, so `consent_concern`
  is never uploaded. Asserted by `pnpm check:sync`, not assumed.
- **A union is only safe between peers.** Merging two devices by set union is
  lossless right up until one copy has been *declared wrong* by somebody choosing
  which wins. `person_generations` is what tells the two situations apart: a fact
  is active only while its generation is the newest, and because a row's
  generation is fixed on insert and nothing may `UPDATE`, a discarded dataset
  cannot come back. Do not add an `UPDATE` policy to either table without
  understanding that this is what it would break.
- `theme`, `locale`, `homeView` and `consentAt` stay device-local (decision D5).
- Whatever a screen claims about where data lives must stay true in all four
  states — undecided, memory, local, and cloud. `/data/`, `/data/stored/`,
  `/about` and the start page each carry a cloud variant for exactly that reason.

### Current static-export constraint
The current iteration has **no server-side application runtime**.

Therefore do not introduce:
- Server Actions,
- request-dependent Route Handlers,
- middleware,
- cookies,
- rewrites,
- redirects,
- request-dependent headers,
- any other feature incompatible with the static export,

unless the task explicitly changes the architecture.

The current “no server” rule describes **this implementation phase**, not an irreversible lifetime product decision.

One narrow exception exists and is not a precedent: `supabase/functions/delete-account/`
holds the privileged credential needed to delete an `auth.users` row, which a browser
must never hold (decisions D9 and D10). It takes no parameters, reads the caller's
identity from the verified bearer token, and deletes exactly that one account. It is
deployed to Supabase, not to Pages, so the export is unaffected. **A second Edge
Function, or any widening of this one, is a new architectural decision needing its own
approval.**

A future backend such as Supabase may be introduced only as an explicit architectural change. If that happens:
1. review the existing persistence/consent guarantees,
2. read `docs/persistence-decision.md`,
3. propose the migration boundary before implementation,
4. preserve privacy and user ownership semantics,
5. update architecture documentation,
6. update this file and `AGENTS.md` if their current constraints no longer apply.

Do not silently bolt a backend onto the current shell.

---

## 9. Client Rendering and Persistence

`localStorage` and `navigator.language` do not exist at build time.

Preserve the existing rendering guarantees:
- prerendered HTML must not assume person data or locale,
- no user-facing copy should render before the app is ready if doing so would cause an incorrect-state flash,
- do not read browser storage during server/prerender execution,
- do not reintroduce page-level mount-effect loading that causes flashes,
- preserve the existing `useSyncExternalStore` approach unless there is a demonstrated reason to replace it,
- the one sanctioned exception is the theme bootstrap script (`lib/theme.ts`, rendered by `app/layout.tsx`): it must stay synchronous and first in `<body>`, because applying a stored theme after mount *is* the flash. It only reads storage, which is not writing it.

Do not “simplify” this architecture by reintroducing hydration mismatches or incorrect first-frame content.

---

## 10. Internationalization

Every user-visible string must live in the i18n message catalogs.

Current rules:
- `lib/i18n/messages/en.ts` is the structural source,
- `de.ts` is type-checked against it,
- German copy uses natural **du** language,
- do not hardcode user-facing strings,
- preserve build-time detection of missing translation keys.

See `docs/copy-and-language.md`.

---

## 11. Engineering Principles

### Optimize for learning + maintainability
This project is both a real product and an educational project.

Prefer:
- straightforward architecture,
- typed code,
- small modules,
- explicit data flow,
- conventional patterns,
- good naming,
- understandable abstractions,
- incremental implementation.

Avoid cleverness that makes the project harder to understand.

### Dependency discipline
Before adding a package:
1. check whether the platform or existing dependencies already solve the problem,
2. verify that the package is maintained and compatible,
3. prefer mature, widely used packages,
4. avoid dependencies for trivial functionality,
5. get approval before introducing a major framework, state system, backend, database, UI system, or infrastructure dependency.

### Current documentation
For fast-changing tools such as Next.js, React, Supabase, Claude Code, deployment platforms, and package APIs:
- inspect the installed version first,
- consult current official documentation when behavior or API shape may have changed,
- do not rely solely on model memory,
- do not silently upgrade dependencies.

---

## 12. Data, Privacy, and Safety

Treat personal reflections, goals, relationship information, health-related signals, and future AI conversations as sensitive user data.

Principles:
- collect only what is needed,
- make consent explicit where appropriate,
- minimize retention,
- clearly distinguish local and cloud data,
- default to private data,
- design future sharing as explicit opt-in,
- never expose secrets or privileged backend credentials to clients.

Never commit:
- `.env`,
- secrets,
- API keys,
- service-role keys,
- private user data.

If/when an account-backed backend is introduced:
- authenticate ownership server-side,
- use database-level access controls such as RLS where applicable,
- never trust client-supplied ownership identifiers,
- test cross-user isolation explicitly.

For features touching mental or physical health, do not present the app as a replacement for professional medical or psychological care.

---

## 13. Development Procedure

For any non-trivial task:

### A. Understand
1. Read this `CLAUDE.md`.
2. Read `AGENTS.md`.
3. Read `docs/progress.md` and relevant files under `docs/`.
4. Read `docs/plan.md` when the task relates to the original foundation plan.
5. Inspect the existing implementation before proposing changes.
6. Check the current branch and `git status`.
7. Identify the smallest coherent change.

If instructions conflict:
- prefer the most current explicit user instruction,
- then current implementation/progress documentation,
- then durable project guidance,
- surface meaningful contradictions rather than guessing.

### B. Plan
Before editing:
- state the intended outcome,
- identify files likely to change,
- identify data/schema/API implications,
- identify relevant tests,
- call out uncertainty or meaningful trade-offs.

For tiny, obvious changes, keep the plan correspondingly tiny.

### C. Implement
- make the smallest coherent change,
- preserve existing behavior unless change is intentional,
- follow existing project conventions,
- avoid unrelated refactors,
- do not leave dead code,
- do not duplicate logic unnecessarily,
- do not silently broaden scope.

### D. Verify
Run the narrowest useful checks first, then broader checks as warranted.

Typical order:
1. targeted verification,
2. type checking/build,
3. lint,
4. existing automated verification suite,
5. relevant manual path.

For future auth/database changes also verify:
- unauthenticated path,
- authenticated owner path,
- unauthorized cross-user path,
- failure/error states.

Do not claim something works unless it was actually verified.

### E. Review
Before finishing:
- inspect `git diff`,
- check for accidental files,
- check for secrets,
- check scope creep,
- check accessibility implications,
- check whether docs need updating,
- check whether the implementation still serves the Feature Manifest.

### F. Report
Summarize:
- what changed,
- important decisions,
- what was verified,
- anything not verified,
- remaining risks or next step.

---

## 14. Git Procedure

Before meaningful feature work:
- confirm the current branch,
- inspect `git status`,
- avoid overwriting unrelated user changes.

Commits should:
- represent coherent units of work,
- use descriptive messages,
- exclude secrets/generated junk,
- be made only when requested or when the active plan explicitly calls for one.

Before committing:
- run relevant verification,
- inspect the diff.

Do not push to GitHub unless explicitly requested or already approved by the active workflow.

Never rewrite shared history or use destructive Git operations without explicit approval.

### Versioning

Use Semantic Versioning (`MAJOR.MINOR.PATCH`) for application releases. The version
lives in `package.json`.

- PATCH: fixes and non-breaking refinements
- MINOR: new backward-compatible functionality
- MAJOR: intentionally breaking product/data/API changes

Do not bump versions, create tags, or publish releases unless the task explicitly
includes a release.

Keep version changes in the same commit as the release they describe.

---

## 15. Change Discipline

### Do not silently broaden scope
If implementing one feature reveals another desirable feature, note it rather than automatically building it.

### Avoid premature architecture
Do not create abstractions for hypothetical future requirements unless the current implementation clearly benefits.

### Avoid premature AI
Do not use AI merely because AI is part of the long-term vision. First create reliable non-AI product behavior and data flows.

### Preserve reversibility
Prefer decisions that are easy to change while the product is young.

---

## 16. Testing Expectations

The existing verification suite is part of the product contract.

Current known verification:
- `pnpm verify` — `scripts/verify.mjs`, the browser suite,
- `pnpm check:schema` — every table in the exposed schemas has RLS, real policies,
  no grant to `anon`, and every view is `security_invoker`. Catches the table
  somebody adds later, which a behavioural test cannot,
- `pnpm check:rls` — the policies on `person_facts`, as two real users,
- `pnpm check:sync` — the sync contract against the real database: idempotent
  push, congruence, both conflict resolutions, isolation, and that
  `consent_concern` never lands,
- `pnpm check:delete-account` — the deployed Edge Function, end to end: real
  accounts made by the app's own sign-in, real one-time codes, real sessions.
  Includes the one that matters — a body naming somebody else's account deletes
  the caller's own,
- `pnpm check:bundle` — no privileged credential in `out/`, with the publishable
  key as the positive control,
- `pnpm check:supabase` — connectivity,
- all automated checks currently pass — the script is the authority on the count, not this file,
- it drives real headless Chrome against the served static export,
- declining persistence leaves `localStorage` completely empty, even after the whole area flow,
- no incorrect consent/onboarding flash on reload,
- a step's internal id never reaches the screen,
- missing German keys fail the build,
- corrupt persisted data degrades rather than white-screening,
- **no external request at all in local or memory mode** — the guarantee that
  signing in is genuinely opt-in, and the one the cloud work had to preserve
  rather than retire,
- opening the sign-in dialog reaches no server and writes nothing,
- rename rehearsal succeeds.

Preserve these guarantees.

Test behavior rather than implementation trivia.

Prioritize:
- core user flows,
- persistence/consent boundaries,
- state transitions,
- error states,
- locale/i18n behavior,
- static-export behavior,
- future auth/data ownership boundaries when introduced.

A feature is not complete merely because it renders.

---

## 17. Accessibility

For every UI change:
- use semantic HTML,
- preserve keyboard accessibility,
- use visible focus states,
- maintain sufficient contrast,
- associate labels with controls,
- do not encode meaning by color alone,
- respect reduced-motion preferences where animation exists.

Accessibility is part of completion, not a later polish phase.

---

## 18. Documentation

Keep the root `CLAUDE.md` focused on durable project-wide instructions and high-level current constraints.

Use:
- `AGENTS.md` — framework/tool-generated repository guidance; preserve its managed block and read it when present,
- `docs/plan.md` — documents the original foundation plan and is intentionally kept unchanged; use `docs/progress.md` and the repository itself for the current product state,
- `docs/progress.md` — current implementation/deployment status and learnings,
- `docs/persistence-decision.md` — conditions for a future persistence/backend change,
- `docs/copy-and-language.md` — i18n/copy rules,
- `docs/design-system.md` — tokens, component classes, and the visual rules behind them,
- `docs/goals-and-areas.md` — the life-area fact keys and how current state is derived,
- other `docs/*` files for detailed or changing decisions.

When implementation changes documented behavior, update the relevant documentation in the same task.

Do not let `CLAUDE.md` become a changelog or scratchpad.

---

## 19. Current Project State

The initial foundation through plan step 11 is implemented and committed on `main`.

Current known state:
- check `git status` and recent history for the authoritative repository state,
- nothing pushed yet,
- the static-export shell works,
- onboarding is implemented as a state machine,
- persistence is consent-gated,
- `lib/person/store.ts` is the single storage boundary,
- local and in-memory storage backends share one API,
- i18n is complete for English and German,
- `useSyncExternalStore` is intentionally used for browser-backed external state,
- static-export verification is implemented in `scripts/verify.mjs`,
- the verification suite currently passes every check,
- cloud sync is implemented and deployed: `lib/cloud/`, `supabase/migrations/`,
  `supabase/functions/delete-account/` (live), and the check scripts in §16.

**Known limitation, accepted deliberately (decision D11):** a real person cannot
finish signing in. Replacing Supabase's stock email template needs a paid plan or
a custom SMTP provider, and the prototype has both of those off the table — so the
sign-in email arrives with a link and no code, while the app deliberately ignores
links (D4). Everything else about sync works and is tested; sign-in is exercised
internally by reading the code out of the admin API.

Three things follow from that, and each will look like a bug to whoever finds it
next:

- **the sign-in dialog carries `m.auth.prototypeNote`**, which says so. A control
  that cannot succeed must admit it. Check 54e2 fails if the sentence goes;
- **sign-up stays enabled** on the project, because `check:delete-account` creates
  its throwaway accounts through the app's own `signInWithOtp`;
- **do not "fix" this by switching to magic links.** It is the cheap-looking
  option and it is the one §3 rejected on the merits: a link returns to an
  allowlisted URL, and this is a static export on a subpath.

Revisiting it is one commit, described at the end of
`docs/supabase-migration.md`.

Important implementation details:
- `lib/i18n/locale.ts` holds the shared `Locale` type and avoids circular imports.
- `lib/person/goals.ts` is the only module that knows the life-area fact-key shape;
  a next step's id lives inside its keys, which is what leaves a fact's single value
  free to be the person's own words. See `docs/goals-and-areas.md`.
- `scripts/verify.mjs` drives real headless Chrome against the served static export without adding a browser-test dependency.
- On this Windows setup, plain `corepack enable pnpm` can fail with `EPERM`; the documented non-admin workaround is:
  `corepack enable pnpm --install-directory "$env:APPDATA\npm"`.

Current remaining work from the original foundation plan:
1. push the existing commits when explicitly approved,
2. enable GitHub Pages,
3. verify the deployed URL,
4. verify subpath asset loading,
5. verify a deep-link reload such as `/you/`.

Use `docs/progress.md` for live implementation status. If this section becomes stale, `docs/progress.md` and the repository itself take precedence.

Do not redo completed foundation work merely because it appears in older planning material.

---

## 20. Working With the Developer

The developer is learning while building.

Therefore:
- explain important architectural decisions briefly,
- do not hide complexity behind unnecessary automation,
- surface meaningful trade-offs,
- challenge requirements when they introduce avoidable complexity or conflict with the product mission,
- prefer solutions that leave the codebase understandable after Claude leaves,
- ask before making high-impact, destructive, expensive, security-sensitive, or scope-expanding decisions.

Do not ask for confirmation for every routine implementation detail.

---

## 21. Definition of Done

A task is done when:
- the requested behavior exists,
- it satisfies the Feature Manifest,
- current architecture constraints are respected or explicitly changed,
- code is understandable and scoped,
- relevant tests/checks pass,
- privacy/security implications were considered,
- accessibility was considered,
- documentation is updated when needed,
- `git diff` contains no accidental changes,
- unverified assumptions are explicitly reported.

**Working software that safely advances the product mission is more valuable than maximum feature count.**
