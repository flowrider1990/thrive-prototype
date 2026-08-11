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

## Known debt: UI preferences ride along with personal data

**This is recorded, not fixed. Do not fix it in a UI change.**

Turning saving off from `/data/` has to leave `localStorage` completely empty — that
is the §8 guarantee, and it applies to that path as much as to declining at the start.
The only function that clears the key today is `forgetEverything()`, so that is what
the UI calls, followed by `declineConsent()` to carry the visit on in memory.

`declineConsent()` on its own does **not** clear the key: `commit()` writes only when
the mode is `local`, and nothing in it removes anything. Calling it alone would leave
the stored key on disk while the app claimed nothing was being saved.

The consequence is that **turning saving off also resets the theme preference**, since
`forgetEverything()` returns the whole snapshot to "nothing known yet" — including
`theme`, whose `null` means "follow the operating system". Nobody asked for their theme
to be forgotten; it is collateral from the only available way to clear the key.

The underlying problem is that one key holds two different kinds of thing:

- **personal data** — goals, what someone wanted to try, their own words,
- **UI preferences** — the theme, and the chosen language.

They have different lifetimes and deserve different controls. "Delete my personal
data" should not mean "and also forget that I prefer dark mode".

So a future persistence-layer change should make it possible to **clear stored
personal data without disturbing unrelated UI preferences.** Whoever does it decides
the shape; the requirement is the separation, not a particular mechanism. Two things
it must not break on the way:

- the consent gate still has to sit above preferences — a theme is still something
  written to someone's device, which is why `setTheme()` goes through `commit()`
  today, and why declining means the choice lasts only the visit;
- "declining leaves `localStorage` completely empty" has to keep meaning *empty*. A
  preferences key that survives declining would be the single write that proves the
  person right to have declined.

Note that `forgetEverything()` already makes one exception of exactly this kind, and
for exactly this reason: it deliberately leaves the *displayed language* alone, because
yanking that away mid-sentence would be its own small betrayal. The theme simply never
got the same treatment.

## What would have to be true to change it

Sync between devices, or any feature that needs data outside the browser, means
a backend. **`docs/supabase-migration.md` is the full proposal for that**, written
against this architecture and awaiting approval. The shape it takes was first
sketched at the end of `docs/plan.md`:
a third backend behind the existing store interface, RLS as the *only* guard
because there is no server to add a second layer, and local data offered as a
one-time import. Consent gating survives unchanged — it already sits above the
choice of backend.
