# The person model

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
  consentAt: string       // only ever written when consent was given
  locale?: 'de' | 'en'     // absent = follow the browser
  theme?: 'light' | 'dark' // absent = follow the operating system
  homeView?: 'goals'       // absent = the start page opens on next steps
  cloud?: {                // absent = never signed in, which is the ordinary state
    userId: string         // whose account these markers describe
    synced: string[]       // fact ids known to be in that generation
    at?: string            // when the device last agreed with the server
  }
  facts: PersonFact[]
}
```

The shape and the storage key live in `lib/person/schema.ts`, a leaf module with
no React so server code can import the key — `app/layout.tsx` needs it for the
theme bootstrap script. `lib/person/store.ts` re-exports both and remains the only
module in the app that *touches* storage.

### Preferences are data too

`locale` and `theme` are stored under the same rule as anything else: persisted
when consent was given, session-only when it was not. A theme choice is still
something written to someone's device.

`homeView` is the third of these and the simplest: only `'goals'` is ever written, so the
default leaves no trace and someone who never keeps that view has nothing stored about it.
Like the others it goes through `commit()`, which is what makes it consent-gated without
anything at the call site knowing — declining still leaves `localStorage` completely empty.
It is **not** a fact: a way of reading a page is not something the person said, which §49d
asserts by counting the log across a reload.

**All three are optional rather than a `version: 2`**, and absent means *follow the
environment* — the operating system for `theme`, the browser for `locale`. A store
written before either field existed keeps loading. Bumping the version would have made
`parse()` reject every existing store and silently discard real answers; the version
number is for changes that genuinely cannot be read the old way, not for additions.

"Unset" being a real third state is the whole point, and `locale` did not have it at
first. It was required, so the *detected* locale was written the moment anything was —
which made "German because your browser is German" indistinguishable from "German
because I chose it". Someone who consented on a German browser and later switched that
browser to English kept getting German, with nothing having ever asked them.

So the snapshot now holds both: `localeChoice` is what the person said (or `null`), and
`locale` is what is in force, already resolved from it. They are separate fields
because a single one gets written back on the next commit and quietly becomes a choice
nobody made. Only `setLocale` — the language switch — makes the choice non-null, and
only a non-null choice is persisted.

An invalid `locale` in a stored file now reads as unset rather than rejecting the store.
Rejecting threw away every real answer in it over one bad field, which is the opposite
of degrading gracefully.

### `cloud` is bookkeeping, not data

Every value in it can be thrown away and rebuilt by reading the account once, which is
what makes it safe to keep beside real answers — and why a malformed one reads as "never
signed in" rather than rejecting the store, the same rule as every optional field above.

`synced` is doing two jobs at once, and the second is the interesting one:

- **it is the push queue, derived.** What is outstanding is the facts whose ids are not
  in this set (`pendingForCloud()`), so there is no queue to lose, corrupt, or forget to
  enqueue into. A write made in a tunnel is indistinguishable from one made a second ago,
  which is why offline needs no separate code path at all.
- **it is the loop guard.** A fact pulled from the cloud is written *and* added to this
  set in the same commit, so the change notification it causes finds nothing to push.
  Nothing has to know whether a change was a real edit or hydration, because a hydrated
  fact is already where a push would send it.

Ids rather than a timestamp high-water mark, deliberately: `learnedAt` comes from whichever
device wrote it, and one skewed clock would make a mark quietly skip everything after it.


It is written only by `lib/cloud/sync.ts`, through named functions on the store
(`beginCloud`, `markSynced`, `mergeFromCloud`, `replaceWithCloud`, `endCloud`) — so the
store still owns storage and the sync layer still owns *when*.

`forgetEverything()` clears both choices while leaving the language *on screen* alone:
yanking that away mid-sentence would be its own small betrayal, but "delete my data"
has to include a preference, and a reload then follows the environment again.

## Append-only

Entries are **added, never edited**. Answer the same question differently in
three months and both are kept, so the app can see that something changed. For an
app about how a life is going, that history is the interesting part — the current
value is the cheap part.

Current state is therefore a derived read: **newest entry per `key`**, which is
what `current(key)` returns. `history(key)` gives all of them, oldest first, and
`/data/stored/` shows every entry with the date it was noted.

**Ties are broken on the id, never on position.** `newest()` used to prefer whichever
matching fact came later in the array, and array order is insertion order — which is
not the same on two devices once facts arrive by more than one route. Two devices
could then derive different current state from the same set of facts, and because that
is a derivation rather than a merge, nothing upstream would notice. Exact-timestamp
ties are rare and the tie-break is arbitrary; the point is that it is arbitrary the
same way everywhere. The sorts in `lib/person/goals.ts` follow the same rule.

`version` exists so a later shape change can migrate rather than guess.

## Values are never parsed

`value` holds what the person typed, unchanged. Nothing splits a name into parts,
infers a language, normalises capitalisation or interprets intent. Two reasons:
parsing throws away information that cannot be recovered, and every parse is a
small assumption about a person that they never got to correct.

The language a person answers in is deliberately not detected and not recorded.

### Two kinds of value

Since life areas arrived, a value is one of two things, and the rule above governs
the first:

- **an utterance** — the person's own words, verbatim: a goal, a next step, a name.
  Never parsed, and always rendered as itself.
- **a token or a reference** — written by the app: `'yes'`, `'done'`, or a step's
  internal id. Never shown as itself.

`/data/stored/`'s generic list prints `value` directly, which is correct for an
utterance and wrong for a token. `stored.tokens` in the catalogs maps a token to the
sentence it reads as — the same division of labour `stored.areas.review` / `yes`
already uses one level down: the label supplies the occasion, the value is a whole
sentence. An unrecognised token still falls through and prints, because a
hand-edited store should look odd rather than be quietly omitted.

A reference must never reach a screen. That is why `/data/stored/` renders life-area facts
through `lib/person/goals.ts` rather than through its generic key-grouped list —
see `docs/goals-and-areas.md`.

## Keys

| key | asked by | notes |
| --- | --- | --- |
| `area.<a>.review` | each life area | `'yes'` or `'not_now'` — both real answers |
| `area.<a>.goal` | the goal question | **legacy**: a goal written before goals had ids. Read, never written — new goals get an id |
| `area.<a>.goal.<gid>.text` | the goal question | one per goal; earlier wordings kept |
| `area.<a>.goal.<gid>.why` | why it matters | optional; an empty value is how it is cleared |
| `area.<a>.goal.<gid>.state` | reaching or setting a goal aside | `'done'` / `'retired'`; absent means active |
| `area.<a>.goal_priority` | the goal put first | holds a goal id, so it is never rendered raw |
| `area.<a>.step.<sid>.text` | the next-step question | the step's words; re-appended when reworded |
| `area.<a>.step.<sid>.state` | done, or removed from current steps | `'done'` / `'retired'`; absent means open |
| `area.<a>.step.<sid>.goal` | which goal an entry serves | holds a goal id; absent means "attribute it" |
| `area.<a>.step.<sid>.pinned` | keeping an entry in view | `'yes'` / `'no'`; absent means not pinned. Any number may be |
| `area.<a>.step_active` | *legacy* — one entry per area was "the one being worked on" | **read as a pin**, never written. Holds a step id, so it is never rendered raw |
| `introduction_done` | reaching the end of the introduction | `'yes'`. A token: rendered through `stored.tokens`, never as itself |
| `consent_concern` | the question after declining | **memory mode only** — never written to the device |
| `preferred_name` | *parked* — the name question was removed | still shown on `/data/stored/` if it is there |
| `opening_intent` | *parked* — the open question was removed | still shown on `/data/stored/` if it is there |

The area keys are documented in full in `docs/goals-and-areas.md`, including why a
step's id lives in its key rather than in a value.

**Parked is not deleted.** The app no longer asks for a name or for what someone
wanted when they arrived, but an answer already given is still theirs: the keys,
their labels on `/data/stored/` and their copy all stay. Removing them would silently drop real
answers from someone's store.

### Memory-only keys

`consent_concern` is the one key that is never persisted, whatever the mode. It is
what someone said when they declined saving, and writing it down would be the single
write that proves the objection right.

The rule is enforced in `write()` — the one function that touches the device — via
`MEMORY_ONLY_KEYS` in `lib/person/schema.ts`, **not** by the mode the fact was written
under. The mode does not stay fixed: saving can be turned on later from `/data/`, and
`grantConsent()` persists the in-memory snapshot as it stands, on purpose, so that
answers given this visit are kept rather than asked for again. Filtering at the
boundary is what keeps that convenience from carrying the concern onto the device with
everything else.

It is dropped on the way out, not out of the snapshot: the concern stays visible for
the rest of the visit, and disappears on the next load because it was never written.
`scripts/verify.mjs` §39 walks exactly that path.

New keys need no migration: the store is a list, and `/data/stored/` labels unknown keys
with the raw key until a translation is added for it.

## Reading and writing

```ts
const { status, mode, facts, current, history } = usePerson()
remember('area.body.goal', 'Sleep better')   // appends
forgetEverything()                            // removes the key, back to a fresh state
```

`newId()` is exported too, for the one case where a caller needs an id *before*
the write: a next step's id is part of its keys, so it has to exist before the
first fact about that step can be written. It is the same generator the store uses
for `PersonFact.id`, kept in one place so the insecure-context fallback is not
duplicated.

Two rules for anything built on this:

1. **Never touch `localStorage` outside the store.** The `mode === 'local'` check
   inside `commit()` is the entire consent gate; a write anywhere else silently
   escapes it.
2. **Never render before `status === 'ready'`.** See the note in `CLAUDE.md`.

## Corrupt or hand-edited data

`parse()` validates the shape and degrades to "nothing known yet" rather than
showing a white screen. A single malformed fact is dropped; the rest survive. The
corrupt key is left in place rather than being deleted — overwriting only happens
if consent is given again.

## Why it maps cleanly onto a table later

`key`, `value`, `source` and `learnedAt` are already columns, and append-only is
already an append-only table with a "newest per key" view. That was the point of
the shape.
