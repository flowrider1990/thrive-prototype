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
| `--color-muted` | secondary text, and `:hover` on a control |
| `--color-line` | hairlines and separators — decorative rules only |
| `--color-line-strong` | the edge of a control at rest |
| `--color-accent` | emphasis: the filled button's background |
| `--color-focus` | the focus ring, and nothing else |

### Why there are two border tokens

`--color-line-strong` is the only colour token pinned to a **number** rather than to
taste: at least **3:1 against `--color-ground`**, which is WCAG 1.4.11 for the
boundary of a non-text UI component. Both themes currently measure 3.05:1.

One token could not do both jobs. A hairline between sections is decorative and
explicitly exempt from any contrast floor; the edge of a field or an option is the
thing telling you the control is there. While they shared a variable, the control
edge could only ever be as quiet as the quietest rule on the page — and it was:
`#e6e3dd` on `#faf9f7` measured **1.22:1**. That is why inactive progress marks and
field borders were, accurately, described as barely visible.

So the ladder has three rungs, and a control has three states without any of them
being faint:

```
  --color-line          separators              (no floor — decorative)
  --color-line-strong   a control at rest       (≥ 3:1 against the ground)
  --color-muted         that control on :hover  (darker again)
```

`.field`, `.option`, `.btn-quiet`, `.btn-primary:disabled`, the two dropdown
triggers and the menu panel are on `line-strong`. Every `border-t` / `border-s-2`
rule stays on `line`.

**Do not "simplify" this by collapsing the two.** `scripts/verify.mjs` §31c asserts
the ratio in both themes, so the floor cannot drift back — and it is asserted as a
*ratio*, not as an inequality against the background, because an inequality passed
happily at 1.22:1.

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

Missing one of the two mappings is close to invisible in review: the token silently
falls back to its light value in that one path only. §31c runs its contrast
assertion in **both** themes for exactly this reason — a forgotten
`--dark-line-strong` fails there rather than shipping.

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
`.option`, `.menu-panel`. One-off layout stays as utilities on the element — a
class per element would be a second, worse component system.

`.option` is the pill's opposite number, for a choice whose text is a sentence
rather than a word. `.btn` is sized for "Continue"; three next steps like "Walk for
20 minutes after dinner" wrap into an unreadable row at 390px. So: full width,
left-aligned, stacked, `rounded-md` like a field rather than `rounded-full`.
It carries a **visible** border at rest, which is the one place it deliberately
departs from `.btn` — `.btn` needs a transparent border so its variants can gain
one without shifting the layout, whereas every `.option` state has a border
already and only its colour changes. `components/option-list.tsx` renders these as
a real `<ul>`, so a screen reader says how many there are to choose between.

`.option` means exactly one thing: **pick this**. Selecting one chooses something; it
never spends anything. That is now true, and it was not: the focused next step on the
home screen used to be a bare `.option` whose only content was the step's own words,
and tapping anywhere on it completed the step — no confirmation, no undo, and
visually identical to the rows that merely select. Keep the class for choices only.

It also has an `:active` state. A tap on a phone gets no `:hover`, so without one
there was no feedback at all between pressing an option and the screen changing.
Background and border colour only, so it cannot move anything.

`.btn-sm` is a size, not a variant: `px-3 py-1 text-xs`, composing with `.btn-quiet`
and inheriting the border rule. It exists for a control subordinate to the thing
beside it — the per-entry Edit in `components/action-entry.tsx`. At full size, three
of them in a three-item list read as peers of "Add another" and "That is enough", and
the list became a stack of pills.

**In a destructive flow, the safe choice takes `.btn-primary`.** On both steps of the
delete confirmation, "Keep it" is the filled button and the step toward deletion is
`.btn-quiet`. Emphasis marks what is *recommended*, not what is next — a filled
"Yes, delete everything" would be the interface leaning on someone at the one moment
it should not.

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

### The progress marks

`components/progress-marks.tsx` follows the same rule. Five marks, three states, and
a 12×12 box in every one of them, so advancing cannot reflow the question
underneath:

- **done** — filled, thick ring: `border-2 border-accent bg-accent`
- **current** — unfilled, thick ring: `border-2 border-ink`
- **upcoming** — unfilled, thin ring: `border border-line-strong`

Each state differs from the others in **two** ways, never in colour alone. That is a
correction: the earlier version differed only by colour between *current* and
*upcoming*, which was the one pair with no second cue — this file used to claim
"fill differs as well as colour", which was true of *done* and of nothing else.

**Varying the border width is free.** Tailwind's preflight sets
`box-sizing: border-box`, so a 12px box is 12px whether its border is 1px or 2px.
That is what buys a second cue without touching the metrics, and §31a asserts the
rects are identical so that a future `box-content` or a stray `padding` cannot
quietly reintroduce reflow-on-advance.

The current area is deliberately *not* filled: painting a mark before its question
is answered would claim something that has not happened.

The marks must stay **direct children** of the `[role="progressbar"]` element —
`__progress()` reads them as `[...el.children]`, and wrapping them would break it
silently rather than loudly.

`docs/plan.md` rejected a progress bar for onboarding — "there is nothing to
endure" — and that still holds for a flow of unknown length. The five areas are a
known, small, finite set, and knowing how many are left is orientation rather than
a demand. Percentages were considered and rejected: they frame reviewing your own
life as a task to complete.

It is a real `role="progressbar"` with `aria-valuenow` and a translated
`aria-valuetext` ("Area 2 of 5"), because five dots say nothing out loud. What it
measures is **areas looked at** — "not right now" advances it exactly as much as
setting a goal does.

## The area label

`components/area-label.tsx` in two sizes. `eyebrow` sits directly above a question
and is `text-ink`; `row` labels an area inside a list and is `text-sm text-muted`.
Neither renders a heading element — the eyebrow sits above the `h1` that owns the
question, and an `h2` in front of it would put the document outline in the wrong
order.

The eyebrow is passed to `QuestionCard`'s `area` slot rather than rendered beside
it, and that grouping is the whole point. Rendered by the caller it sat in an
`space-y-8` stack, equidistant from the progress marks above and the question below,
so it read as a third unrelated item and the question looked like it had no subject.
Inside the card it is one tight `space-y-1.5` group with the heading. Size alone did
not fix this; proximity did.

`components/area-icon.tsx` takes an explicit size for the same reason. Every call
site used to inherit `text-sm`, which rendered the emoji at body-small — the area
context was a footnote to its own question.

One variant stays outside this component, in `components/stored-areas.tsx`, where the
area name is a section `h2` inside a document rather than a label beside something.
Pulling it in would mean `AreaLabel` rendering headings, which is what would make it
wrong at the other four call sites.

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

Both of those depend on the theme toggle being present, which is why the toggle and
the language switch stay in the header on **every** screen, including during
onboarding when the nav links are hidden. `__watchThemeSwitch` selects the toggle by
its accessible name and throws if it is absent, so removing it would surface as a
confusing exception rather than as a named failure.

*(That selector was also wrong for a year: it matched `aria-label^="Wechsle"`, but
the German label is "Zu Dunkel wechseln". The German branch never matched anything,
and the checks passed only because they happen to run in English. It now matches on
a substring.)*

## Layout

`html { scrollbar-gutter: stable }`. Every page centres its column with
`mx-auto max-w-2xl`, and a classic scrollbar appearing on the tall pages but not
the short ones moved that column sideways between routes: `main` sat at x=264 on
`/` and x=256.5 on the other routes. Reserving the gutter everywhere costs
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
