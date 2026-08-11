# Why everything is stored in the browser

## The decision

All of a person's answers live in their own browser. No accounts, no server, no
network calls of any kind. When consent is given, one `localStorage` key
(`thrive.person.v1`); when it is not, React state that dies with the tab.

## Why

**It deletes the hardest problem rather than solving it.** An earlier draft had
anonymous answers collected before sign-up, which then had to be handed to a
newly created account without losing them. That handover is fiddly, easy to get
subtly wrong, and its failure mode is losing what someone told you. With no
accounts, the problem does not exist.

**It agrees with the hosting constraint.** The app has to be trivially hostable
and shareable via GitHub Pages, which means a static export and no server. A
local-first app is exactly what a static host can serve — the two constraints
pull in the same direction rather than against each other.

**It makes the privacy claim checkable instead of promised.** "Nothing leaves
this browser" is either true or false, and anyone can open devtools and see. No
privacy policy has to be believed.

## The governing principle: consent gates persistence

Nothing is written to the device unless the person said it was okay. Declining
does not break the app: it runs in memory for that session and writes nothing at
all.

One consequence is accepted rather than worked around: declining means the
**decision itself** cannot be remembered, so the question returns next visit.
Persisting "they said no" would be the single write that proves them right.

## What this costs

- **No sync.** Answers are on one device, in one browser. Clearing browser data
  loses them, and there is no recovery.
- **No sharing.** Nothing can be shown to anyone else, by design.
- **Memory mode is genuinely session-only.** Reloading the page — not just
  closing the tab — starts over, because the state lives in the JS module. This
  is the honest reading of "nothing is written", not an oversight.
- **A quota or a private-mode failure downgrades to memory mode** rather than
  claiming a save happened. See `commit()` in `lib/person/store.ts`.

## What would have to be true to change it

Sync between devices, or any feature that needs data outside the browser, means
a backend. **`docs/supabase-migration.md` is the full proposal for that**, written
against this architecture and awaiting approval. The shape it takes was first
sketched at the end of `docs/plan.md`:
a third backend behind the existing store interface, RLS as the *only* guard
because there is no server to add a second layer, and local data offered as a
one-time import. Consent gating survives unchanged — it already sits above the
choice of backend.
