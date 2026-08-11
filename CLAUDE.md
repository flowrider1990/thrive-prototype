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

The repository currently contains a deliberately small, trusted shell rather than the full feature product.

Existing foundation:
- consent flow,
- optional decline reason,
- continue-without-persistence path,
- name capture,
- one open question,
- `/you` and `/about`,
- English and German copy,
- local/in-memory person store,
- static export,
- automated verification.

Do not interpret the broader product vision in this file as permission to skip ahead and implement future domains without an explicit task.

---

## 5. Near-Term Product Direction

Once the current shell/deployment foundation is complete and a new implementation phase is explicitly approved, the first useful product should remain deliberately small.

Likely early feature scope:
- a small set of life areas,
- one active goal per area,
- one **Next Challenge** per goal,
- lightweight daily check-in,
- complete / skip challenge,
- perceived difficulty + helpfulness feedback,
- weekly review,
- gratitude page,
- mobile-first responsive UI,
- light and dark monochrome themes.

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
Initial direction:
- black and white / neutral,
- modern,
- minimal,
- simple,
- warm rather than sterile,
- strong typography and spacing,
- low visual noise.

Support:
- light mode,
- dark mode.

Build the visual system so themes can later be extended without rewriting product logic.

### Design-system approach
Use established interaction and accessibility patterns, with Material Design 3 as a reference where useful.

Do not reproduce Material's visual identity by default and do not make the product technically dependent on Material components.

Keep UI components driven by project-owned design tokens so colors, typography, spacing, shapes, themes, and future skins can change without rewriting product behavior.

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

There are deliberately no additional runtime dependencies at the current stage.

### Current persistence model
- `lib/person/store.ts` is the only storage boundary.
- Everything else must use the existing person-store API.
- Persistence is gated by consent.
- Declining persistence must leave `localStorage` completely empty.
- Memory mode must remain genuinely non-persistent.
- Facts are append-only; current state is derived from the newest fact for a key.

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
- preserve the existing `useSyncExternalStore` approach unless there is a demonstrated reason to replace it.

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
- `scripts/verify.mjs`,
- 25/25 automated checks currently pass,
- it drives real headless Chrome against the served static export,
- declining persistence leaves `localStorage` empty,
- no incorrect consent/naming flash on reload,
- missing German keys fail the build,
- corrupt persisted data degrades rather than white-screening,
- no unexpected external requests,
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
- `docs/plan.md` — original implementation plan, kept verbatim,
- `docs/progress.md` — current implementation/deployment status and learnings,
- `docs/persistence-decision.md` — conditions for a future persistence/backend change,
- `docs/copy-and-language.md` — i18n/copy rules,
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
- the verification suite currently passes 25/25 checks.

Important implementation details:
- `lib/i18n/locale.ts` holds the shared `Locale` type and avoids circular imports.
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
