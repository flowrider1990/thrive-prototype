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
  locale: 'de' | 'en'
  theme?: 'light' | 'dark' // absent = follow the operating system
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

`theme` is **optional rather than a `version: 2`**. Absent or invalid reads as
"follow the operating system", so a store written before the theme existed keeps
loading. Bumping the version would have made `parse()` reject every existing
store and silently discard real answers — the version number is there for changes
that genuinely cannot be read the old way, not for additions.

## Append-only

Entries are **added, never edited**. Answer the same question differently in
three months and both are kept, so the app can see that something changed. For an
app about how a life is going, that history is the interesting part — the current
value is the cheap part.

Current state is therefore a derived read: **newest entry per `key`**, which is
what `current(key)` returns. `history(key)` gives all of them, oldest first, and
`/you` shows every entry with the date it was noted.

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

A reference must never reach a screen. That is why `/you` renders life-area facts
through `lib/person/goals.ts` rather than through its generic key-grouped list —
see `docs/goals-and-areas.md`.

## Keys

| key | asked by | notes |
| --- | --- | --- |
| `area.<a>.review` | each life area | `'yes'` or `'not_now'` — both real answers |
| `area.<a>.goal` | the goal question | one current goal per area; earlier ones kept |
| `area.<a>.step.<sid>.text` | the next-step question | the step's words; re-appended when reworded |
| `area.<a>.step.<sid>.state` | done, or removed from current steps | `'done'` / `'retired'`; absent means open |
| `area.<a>.step_active` | choosing what to work on | holds a step id, so it is never rendered raw |
| `consent_concern` | the question after declining | **memory mode only** — never written to the device |
| `preferred_name` | *parked* — the name question was removed | still shown on `/you` if it is there |
| `opening_intent` | *parked* — the open question was removed | still shown on `/you` if it is there |

The area keys are documented in full in `docs/goals-and-areas.md`, including why a
step's id lives in its key rather than in a value.

**Parked is not deleted.** The app no longer asks for a name or for what someone
wanted when they arrived, but an answer already given is still theirs: the keys,
their `/you` labels and their copy all stay. Removing them would silently drop real
answers from someone's store.

New keys need no migration: the store is a list, and `/you` labels unknown keys
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
