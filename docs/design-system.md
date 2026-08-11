# Design system

How the visual layer is built. `CLAUDE.md` §7 states the durable direction; this
file holds the component-level rules that change more often than that does.

Everything here lives in `app/globals.css`. There is no UI library and no
component library — see "Primitives" at the end for when that changes.

## Tokens are the only place a colour exists

`@theme` in `app/globals.css` declares the tokens; Tailwind turns each into a
utility (`--color-ink` → `text-ink`, `bg-ink`, `border-ink`). **No component names
a colour.** That is what makes a new theme or skin a change to one file.

| token | role |
| --- | --- |
| `--color-ground` | the page |
| `--color-surface` | anything raised off the page (the menu panel, fields) |
| `--color-ink` | primary text, and the active-nav underline |
| `--color-muted` | secondary text, borders that should recede, quiet controls |
| `--color-line` | hairlines and rests-at-default borders |
| `--color-accent` | emphasis: the filled button's background |
| `--color-focus` | the focus ring, and nothing else |

`--color-focus` is deliberately **not** an alias of `--color-accent`. They looked
interchangeable while both were near-ink, but they answer different questions —
"how much emphasis does this control want" versus "can the person see where they
are" — and sharing one variable meant tuning the first silently retuned the
second.

The palette is monochrome by intent (`CLAUDE.md` §7): emphasis comes from
contrast, not hue. Do not introduce an accent hue without asking.

### The dark palette

Defined once as `--dark-*` on `:root`, then mapped twice — once under
`@media (prefers-color-scheme: dark)` for "the OS asked", once under
`:root[data-theme='dark']` for "the person chose". A media condition and an
attribute selector cannot be combined in one rule, so the mapping is repeated
rather than shared. **Adding a colour token means adding it in three places**;
the file says so at each one.

## Type

| token | role |
| --- | --- |
| `--font-sans` | everything a person reads at length |
| `--font-display` | headings only |

Both are system stacks. Nothing may load from a network — the app promises that
nothing leaves the browser, and a webfont request would break that promise before
the first paint.

Scale, as classes rather than raw utilities:

- `.heading` — a page title. Display face, `text-3xl sm:text-4xl`, tight
  tracking, weight 400. A serif at 400 already reads as emphasis; bolder shouts.
- `.heading text-2xl leading-snug sm:text-3xl` — an onboarding *question*. Same
  face, one step down, looser leading, because a question can run to six lines
  where a title runs to one. Utilities win over `@layer components`, which is why
  overriding on the element works.
- Section labels (`text-xs`/`text-sm`, uppercase, `tracking-wide`, `text-muted`)
  stay sans. They are furniture, not voice.

## Shape

`--radius-sm` / `--radius-md` / `--radius-lg` (0.5 / 0.75 / 1 rem) replace
Tailwind's defaults for those three names, so `rounded-sm|md|lg` are this
project's scale:

- `rounded-sm` — items inside a panel
- `rounded-md` — fields
- `rounded-lg` — panels

`rounded-full` stays a literal. A pill is a decision about what a button *is*,
not a step on a scale.

## Component classes

`@layer components` in `app/globals.css` owns anything that appears more than
once: `.heading`, `.nav-link`, `.field`, `.btn` + `.btn-primary` / `.btn-quiet`,
`.menu-panel`. One-off layout stays as utilities on the element — a class per
element would be a second, worse component system.

Two rules that are load-bearing rather than stylistic:

- **`.btn` carries a transparent border always.** The disabled and quiet variants
  take a visible one, and without the transparent default they would shift the
  layout by a pixel when they did.
- **`.btn-primary:disabled` is not dimmed.** `opacity-40` on a filled button
  leaves the label grey-on-grey. Unavailability is shown by dropping the fill and
  taking an outline instead, so the text stays readable — a disabled control still
  has to be *understood*.

## State that must not move the layout

An indicator that changes an element's metrics reflows the page every time the
state changes. `.nav-link` is the worked example:

- the bottom border is **always 2px**, transparent until active
- the border is on both edges (`border-y-2`), so the text stays centred in its box
- the active state changes **colour only**: `text-muted` → `text-ink`, plus the
  border colour
- **font weight never changes.** Bold glyphs are wider. Weighting the current nav
  item would move the header on every navigation, which is a defect this project
  actually shipped and had to fix.

The hook is `aria-current="page"`, and `.nav-link[aria-current='page']` styles off
it — one source of truth for the underline and for the accessibility tree, rather
than a class saying one thing and the accessibility tree another. §17 forbids
encoding meaning by colour alone, which the underline satisfies; in the collapsed
menu the same job is done by `<Check>`, whose slot is always present so marking an
item shifts nothing.

## Motion

There is very little, and all of it is optional:

- 150ms colour transitions on interactive things (Tailwind's `transition-colors`)
- a 120ms opacity/transform entrance on `.menu-panel` — opacity and transform
  only, so it cannot move the trigger

`@media (prefers-reduced-motion: reduce)` turns all of it off, stated once in
`@layer base` rather than per component, so a new transition cannot forget it.

### A theme change is never animated

This is the one motion rule that is not a preference. Flipping `data-theme`
inverts every token in the same frame, and anything carrying `transition-colors`
would interpolate *across* that inversion for 150ms. Measured: 90ms into a
light→dark switch, `.btn-primary` was `rgb(141,139,135)` on `rgb(133,133,133)` —
an unreadable label — while the 2px focus ring on the just-pressed toggle swept
from near-ink to near-paper. That was the reported "flash".

The fix is `:root[data-theme-switching]`, which sets `transition: none !important`
on everything. `components/theme-switch.tsx` sets the attribute, mutates
`data-theme`, **reads a layout property to force the style recalculation to happen
while the suppression still applies**, and removes the attribute on the next
frame. The forced read is the part that is easy to drop and impossible to notice:
without it the browser may batch both changes into one recalculation and start the
transitions anyway.

`scripts/verify.mjs` checks 22a/22b assert the attribute is applied, that the
toggle's computed `transition-duration` is `0s` while it is set, and that it is
removed again. Checks 23a/23b assert the focus ring survived — the flash must
never be "fixed" by weakening focus indication.

## Layout

`html { scrollbar-gutter: stable }`. Every page centres its column with
`mx-auto max-w-2xl`, and a classic scrollbar appearing on the tall pages but not
the short ones moved that column sideways between routes: `main` sat at x=264 on
`/` and x=256.5 on `/you/` and `/about/`. Reserving the gutter everywhere costs
15px of width on pages that do not scroll and nothing at all where scrollbars
overlay, which is most phones. `scripts/verify.mjs` check 20a asserts the column
starts at the same x on all three routes, and 20b asserts the pages still differ
in height — so a future `overflow: hidden` cannot pass by hiding the problem
instead of fixing it.

## Primitives

There is no headless-primitive library yet. `components/menu.tsx` is a
disclosure, not a `role="menu"`: a real menu owes the user arrow-key roving focus,
and claiming the role without implementing it is worse than not claiming it. The
file says so.

Adopt one (Base UI is the current choice — unstyled, tree-shakable, no root
provider) when any of these becomes true:

- a menu needs arrow-key roving focus or typeahead
- a dropdown needs collision-aware positioning (the language panel is `end-0`; on
  a 390px screen a longer label would overflow today)
- a dialog, tooltip or combobox appears

At that point it wraps in a project-owned `components/ui/` component styled by
these tokens. It would be the project's second runtime dependency, so it needs
approval (`CLAUDE.md` §11).
