# Copy and language

## Both languages, complete, from the start

German and English are both first-class. `lib/i18n/messages/en.ts` is the source;
`de.ts` is typed as `Messages = typeof en`, so **a missing or misspelled key is a
build error** rather than a string that quietly falls back to English at 11pm.

Verified rather than assumed: deleting a key from `de.ts` fails `pnpm build` with
`TS2741: Property 'restart' is missing`.

`Messages` is deliberately not `as const` — with literal types, `de.ts` could only
satisfy it by repeating the English strings word for word.

## No i18n library

A catalog plus a hook is a few dozen lines. `next-intl`'s routing machinery buys
nothing here: there is no server and no SEO need, and locale routes would mean
`/de/you` and `/en/you` prerendered separately for an app whose pages are already
client-rendered.

`t()` interpolates `{name}`-style placeholders and leaves unknown ones visible, so
a typo shows up on screen rather than vanishing.

## Register: `du`, decided once

German addresses the person as **du** everywhere. It is a wellbeing app; `Sie`
would put a counter between two people who are meant to be talking. Switching
register mid-flow feels broken in a way that is hard to name, so the decision is
made once and written down here.

## German is written, not translated

Copy is rewritten to read naturally rather than mapped word for word:

| English | German | not |
| --- | --- | --- |
| How should I call you? | Wie darf ich dich nennen? | ~~Wie soll ich dich rufen?~~ |
| Nothing right now | Gerade nichts | ~~Nichts im Moment~~ |
| That is completely fine. | Das ist völlig in Ordnung. | ~~Das ist komplett fein.~~ |

## The consent question is phrased positively

> This is an app prototype, only for personal use. Information you give is saved
> only on the device you are using right now. **Is this okay for you?**

An earlier draft asked *"Is this a problem for you?"*, which made the yes-branch
thank people for objecting. The two replies now land the right way round.

## Which language a person sees

- Locale from `navigator.languages` (`de*` → German, otherwise English), matched on
  the prefix so regional variants count: `de-AT` and `de-CH` are German. Reading it is
  not storing it, so this is allowed before consent — and it has to be, since the
  consent question itself has to be in some language.
- **Detection applies until someone actually chooses**, not until they consent. An
  unchosen language is stored as nothing at all, so the browser keeps deciding; see
  `docs/person-model.md` for why that needed a separate field.
- An explicit choice wins permanently, on any browser, until "delete my data".
- The switcher works on **every** screen, including consent: nobody should have to
  agree to something in a language they did not choose.
- The chosen locale is data like anything else: persisted when consented,
  session-only when not.
- §47 asserts all four directions — German browser, neither-language browser, a store
  with no choice following the browser, and a choice overriding it — plus that using
  the switch is the only thing that writes one. It runs last in the file: it is the
  only section that overrides the browser language, and a leaked override would answer
  the German assertions in earlier sections for them.
- The language a person *answers* in is not detected and not recorded. Their words
  are stored verbatim, whatever language they are in.

## One act, one word — across onboarding and everyday use

The same action must read the same wherever it is offered, or the introduction teaches a
vocabulary the rest of the app then contradicts. Three keys carry that:

- **`goals.stepsSave`** — saving an action, used by the introduction, the area page and
  the start page. It replaced `home.newStepSubmit`, which said the right word from the
  wrong namespace while two other screens borrowed it.
- **`manage.addStep`** — adding an action to a goal, used by the area page *and* by the
  introduction's "one more?" choice. Deliberately not "Add another" there: during the
  introduction it sits beside "Add another goal", and two near-identical labels for acts
  on two different levels of the hierarchy is exactly the confusion the hierarchy work
  set out to remove.
- **`goals.forGoal`** — the goal an action is being written for, rendered by `GoalLine` at
  both places that ask. Always shown, including when an area holds one goal: "this goal"
  needs a *this*, and it used to be hidden precisely where nothing else on the screen
  named it.

**Saving is not adding another.** The submit says "Save" for the first action and every
later one. It used to relabel itself "Add another" from the second on, which named an act
the person had not decided to take, while an empty field sat open as though a second were
expected. Saving now closes the field; adding another is the choice that follows.

`stepsNote` ("One is enough. You can add up to three.") moved with it — from above the
field, where it answered a question nobody had asked yet, to under the list, where there
is a first entry to add to.

## Rules for adding copy

1. Add the key to `en.ts` first, then `de.ts` — the build will not let you forget.
2. Nest by screen. Prose goes in named paragraphs (`isP1`, `isP2`), never arrays:
   an array of the wrong length still type-checks.
3. Never hardcode a user-visible string in a component, including `aria-label`s.
4. Keep the tone plain and unhurried. No exclamation marks except the one genuine
   thank-you, no urgency, no encouragement nobody asked for.
