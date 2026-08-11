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

- Initial locale from `navigator.language` (`de*` → German, otherwise English).
  Reading it is not storing it, so this is allowed before consent — and it has to
  be, since the consent question itself has to be in some language.
- The switcher works on **every** screen, including consent: nobody should have to
  agree to something in a language they did not choose.
- The chosen locale is data like anything else: persisted when consented,
  session-only when not.
- The language a person *answers* in is not detected and not recorded. Their words
  are stored verbatim, whatever language they are in.

## Rules for adding copy

1. Add the key to `en.ts` first, then `de.ts` — the build will not let you forget.
2. Nest by screen. Prose goes in named paragraphs (`isP1`, `isP2`), never arrays:
   an array of the wrong length still type-checks.
3. Never hardcode a user-visible string in a component, including `aria-label`s.
4. Keep the tone plain and unhurried. No exclamation marks except the one genuine
   thank-you, no urgency, no encouragement nobody asked for.
