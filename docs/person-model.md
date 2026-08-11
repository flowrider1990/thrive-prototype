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
  consentAt: string   // only ever written when consent was given
  locale: 'de' | 'en'
  facts: PersonFact[]
}
```

Defined in `lib/person/store.ts`, which is the only module in the app that
touches storage.

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

## Keys

| key | asked by | notes |
| --- | --- | --- |
| `preferred_name` | the name question | may appear more than once |
| `opening_intent` | the one open question | absent if they skipped it |
| `consent_concern` | the question after declining | **memory mode only** — never written to the device |

New keys need no migration: the store is a list, and `/you` labels unknown keys
with the raw key until a translation is added for it.

## Reading and writing

```ts
const { status, mode, facts, current, history } = usePerson()
remember('preferred_name', 'Flo')     // appends
forgetEverything()                     // removes the key, returns to a fresh state
```

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
