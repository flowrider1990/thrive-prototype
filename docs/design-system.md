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
taste: at least **3:1 against every background it is drawn on**, which is WCAG 1.4.11
for the boundary of a non-text UI component.

"Every background" means two, and that is the part that is easy to get wrong. A
control edge sits on `--color-surface`, not on the page — and in dark mode the surface
is *lighter* than the ground, so a value tuned against the ground alone comes out too
dark on every control that has a border. The first `--dark-line-strong` did exactly
that: 3.05 against the ground, **2.77** against the surface. Current figures:

| | ground | surface |
| --- | --- | --- |
| light `#948f86` | 3.06 | 3.21 |
| dark `#6b6b75` | 3.39 | 3.08 |

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
  --color-line-strong   a control at rest       (≥ 3:1 on ground *and* surface)
  --color-muted         that control on :hover  (darker again)
```

`.field`, `.option`, `.btn-quiet`, `.btn-primary:disabled`, the two dropdown
triggers and the menu panel are on `line-strong`. Every `border-t` / `border-s-2`
rule stays on `line`.

**Do not "simplify" this by collapsing the two.** `scripts/verify.mjs` §31c asserts
the ratio against the page and §31d against the surface, both in both themes, so the
floor cannot drift back on either. They are asserted as *ratios*, not as inequalities
against the background, because an inequality passed happily at 1.22:1.

Two checks rather than one because one could not see it: §31c measures a progress
mark, which sits on the page, and was green while every field and option in dark mode
was below the floor.

`--color-focus` is deliberately **not** an alias of `--color-accent`. They looked
interchangeable while both were near-ink, but they answer different questions —
"how much emphasis does this control want" versus "can the person see where they
are" — and sharing one variable meant tuning the first silently retuned the
second.

The palette is monochrome by intent (`CLAUDE.md` §7): emphasis comes from
contrast, not hue. Do not introduce an accent hue without asking.

**There is exactly one hue, and it was asked for.** It is not named for the colour it
is, because a name describing the colour invites the next reader to reuse it, and the
next reuse is the one that ends the monochrome palette by accident.

| token | paints | why it is safe |
| --- | --- | --- |
| `--color-note` | a hint, and an active star | a hint starts with "Note:" and is italic; a star is filled and its accessible name flips — colour is the third cue either way |

The pattern is the same both times and it is the whole licence: **colour is never the only
thing carrying the meaning.** Remove the hue and the state still reads. Adding a hue the
other way round — colour first, then hunting for a second cue — is how a colour-only state
ships. `--color-note` is gold rather than red on purpose: a hint is not a warning, and see
the danger-variant note below for what neither of these is.

It clears **4.5:1** on both backgrounds in both themes, not the 3:1 a border needs,
because its harder job is a sentence at `text-sm` that has to be read (§31g).

It briefly had a sibling. An active star was drawn in a red of its own until red on a
control meaning "keep this in view" read as a warning about the thing it was marking — and
the light value of the gold was an olive-brown that read as neither gold nor deliberate.
One warmer amber does both jobs, which is how the palette came back to a single hue.

### The dark palette

Defined once as `--dark-*` on `:root`, then mapped twice — once under
`@media (prefers-color-scheme: dark)` for "the OS asked", once under
`:root[data-theme='dark']` for "the person chose".

**Mapping one and forgetting the other is the trap, and it is invisible.** Every contrast
check in the suite emulates `prefers-color-scheme`, so a token missing from the
`[data-theme]` block passes all of them — which is exactly how `--color-pin` shipped
mapped in the media block only, drawing an active pin in the *light* red at 2.48:1 on a
chosen dark theme. §31f now asserts the shape instead of any one colour: for every
`--dark-*` on `:root`, the matching `--color-*` must resolve to it under
`[data-theme='dark']`. Any token added later is covered without anyone remembering to.

A media condition and an
attribute selector cannot be combined in one rule, so the mapping is repeated
rather than shared. **Adding a colour token means adding it in three places**;
the file says so at each one.

Missing one of the two mappings is close to invisible in review: the token silently
falls back to its light value in that one path only. §31c and §31d both run in
**both** themes for exactly this reason — a forgotten `--dark-line-strong` fails
there rather than shipping.

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

`AreaLabel` takes an optional `href` at `row` size, which turns the icon-and-name line
into a link — used on the start page, where an area's name opens that area. It belongs
in the component rather than being wrapped at the call site because that line was
duplicated at four call sites once, which is exactly what let it drift. The name takes
`.link-inline` and the icon does not: an underlined emoji reads as a mistake, and the
underline is what keeps "this is a link" off colour alone.

**The link is a sibling of the row's controls, never a wrapper around them.** A link
containing "How is it going?" would navigate on every answer, and the entry's own words
have to stay inert — §24a2 asserts that clicking them changes nothing, and §37a asserts
the link wraps neither.

`OptionList` takes a `current` flag per option, which renders as `aria-current` — the
same hook `.nav-link` uses, so the visible mark and the accessibility tree have one
source of truth. A caller that marks an option visually **must** set it: the tick is
`Check` from `components/menu.tsx` and is `aria-hidden`, so on its own it is a state
carried by appearance alone, which §17 does not allow. `Check`'s slot is always
rendered, so moving the mark shifts nothing. The only call site that sets it is the nav
in `components/page-shell.tsx` — an earlier version of this said the storage choice on
`/data/` was, which was never true: it passed no `current` at all, and it is a pair of
switches now.

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
delete confirmation, and on the step that turns saving off, "Keep it" is the filled
button and the step toward deletion is `.btn-quiet`. Emphasis marks what is
*recommended*, not what is next — a filled "Yes, delete everything" would be the
interface leaning on someone at the one moment it should not.

**The exception is the state *after* it happened.** Once everything is deleted there is
no destructive choice left on the screen: the confirmation is gone and "Delete
everything" has unmounted with the data. Nothing is being recommended against, and a
page whose only offer is "back to the privacy page" leaves someone who just cleared
everything with nowhere to begin. So "Start again" takes `.btn-primary` there and
leaving drops one weight to a full-size `.btn-quiet` — one primary per state, as
everywhere. §46a and §46b assert both states, because the rule above is exactly the kind
of thing a later reader would "fix".

**There is no destructive/danger variant, and adding one is a decision not yet
made.** The obvious ask — paint the final irreversible action red — has no token to
use: the palette is monochrome by intent (`CLAUDE.md` §7, "do not introduce an accent
hue without asking"), and `--color-pin` is **not** it — a red pushpin is an object, not a
warning, and reusing it here would make one token mean both "kept in view" and "this cannot
be undone". A danger colour was considered and deferred rather than improvised. What carries
the weight instead is *where* emphasis sits and how many steps there are, which is the
pattern above. If a danger token is ever added it needs the same treatment `--color-pin`
got, which is the treatment `--color-line-strong` got: a contrast floor against both
backgrounds, in both themes, asserted — §31e.

## A row that recedes

`.option-recede` is an `.option` for a life area with nothing being worked on. Two dials,
both already in the token set: the edge drops from `line-strong` to `line`, and the text
from ink to muted. Both restore on hover **and** focus, so a keyboard reaches the state a
pointer does.

**Not `opacity`.** Opacity multiplies against the background, so it would walk the text
under the contrast floor the rest of this file defends — and dim the focus ring with it.
`muted` is a measured token; 40% of ink is a guess.

**Nothing about it says disabled.** It keeps its border, its padding, its cursor, its
focus ring and its full hit area, and `aria-disabled` appears nowhere near it. §48b
asserts the frame — same padding, same border width, opacity 1, live pointer events, a
real `href` — because "de-emphasised" shipping as "switched off" is the whole risk of
this pattern.

**It works by inheritance, and that is not a preference.** A `text-ink` utility on the
label inside could not be overridden from a component class at all: Tailwind's
`utilities` layer wins over `components` regardless of specificity. So `AreaLabel
size="card"` sets no colour and takes the row's. Ink is the inherited value everywhere
else, so nothing changed for its other uses.

The hover border is deliberately left to `.option:hover`, which follows it in the file
and therefore wins — a receding row hovers into exactly the state every other row hovers
into, rather than into a third appearance of its own.

## Icon-only controls

There are three, and they share a shape: `inline-flex … rounded-full border
border-line-strong … text-muted transition-colors hover:border-muted hover:text-ink`. The
theme toggle and the collapsed-nav trigger set it; `.pin-toggle` follows it.

**They are bordered on purpose.** A control edge at rest is what says "this is a control",
which is the whole reason `--color-line-strong` exists — so a *bare* icon button would
remove the one thing at rest identifying it as pressable. A pin icon in a small circle is
still much lighter than a text pill, which was the point: half the pill weight per row,
not none.

The border is present in both states so pressing one moves nothing, the same guarantee
`.btn`'s always-transparent border gives.

**The "Icons" note below needs one exception.** It says icons here are `aria-hidden`
because the adjacent words already say what the icon says. That holds for `Lock` and
`ArrowLeft`. For a pin the glyph *is* the control's whole content, so the **button** is
named — `Pin: {text}` / `Unpin: {text}` — and the glyph stays hidden. State still needs
two cues, so the glyph changes too (filled when pinned, outlined when not) at identical
box size — size is never the difference.

**Colour is the third cue, and only ever the third.** An active pin is drawn in
`--color-pin`, the one hue in the palette. It is safe here precisely because it is
redundant: remove it and the filled glyph and the flipped accessible name still carry the
state, which is what §17 asks. Adding it the other way round — colour first, then looking
for a second cue — is how a colour-only state gets shipped. §42d3 asserts the class still
applies it (`.pin-toggle:hover` has the specificity to take it back), and §31e asserts it
is readable on both backgrounds in both themes.

The glyph is an office pushpin drawn straight down — wide grip, waist, flange, needle —
rather than a round head on a stem, which read as a map marker: "where this is" instead of
"keep this in front of me". The waist is what carries the recognition, so it is drawn wide
enough to survive at 14px rather than being a detail that disappears.

`aria-pressed` is deliberately **not** used. The accessible name already flips, and
"Unpin, pressed" is ambiguous rather than clearer — so the CSS hook is a class
(`.pin-toggle-on`), which is also the only locale-independent option once the state lives
in the name.

## The switch, and the check that used to forbid it

`.switch` is a settings row: label on the left, state on the right, and **no bordered
surface at all**. That absence is the whole point. `.option` and `.field` are the same
rule in every property that draws a box — `w-full rounded-md border border-line-strong
bg-surface px-4 py-3 leading-relaxed text-ink` — so the storage choice, which was one
full-width `.option` above a Cancel pill, was visually indistinguishable from an empty
text input. A setting has to look like a setting, and here that is alignment rather than
a container.

**There is one switch on `/data/` now, not two.** "Save on this device" was the other,
and turning it off deleted what was stored — the same act as "Delete my data" further down
the page, done by the control that said less about it. What remains in that direction is a
plain quiet button offering to opt *in*, shown only to someone not already saving: a
one-way action is a button, because a toggle that can only be flipped on is a control
lying about itself.

State is carried three ways, and only one of them is colour: the knob's **position**,
the literal word beside it (`ON` / `OFF`), and the track's fill. Metrics never change
when it flips, which is the same rule the progress marks follow — `.switch-track` and
`.switch-knob` keep their size in both states and the knob moves by `translateX`, so
nothing on the page reflows. The knob's travel uses a logical margin and is mirrored
under `[dir='rtl']`.

It is a `<button role="switch" aria-checked>`, not an `<input type="checkbox">`. Two
reasons: `role="switch"` says "this is on or off right now" where a checkbox says "this
will be included when you submit", and there is no form here to submit; and
`StorageChoice`'s inline-panel focus handling calls
`panel.querySelector('button')?.focus()`, which an input would have broken silently.

**Check 36c used to assert that no switch existed.** Its name was "and no toggle was
introduced beside it", and it was a deliberate guard against this exact redesign. It is
now inverted rather than deleted, because quietly removing a check that says *do not do
this* is how a codebase forgets it ever decided. It still forbids a checkbox.

A disabled switch — currently cloud sync — keeps its state readable and carries a line
saying why it cannot be operated, rather than being a dead control to poke at.

`.link-inline` is a link inside a sentence. Its underline is load-bearing, not
decoration: these sit in `text-muted` prose, so without the rule "this word is a
link" would be carried by the ink/muted difference alone, which §17 rules out. Two
cues at rest, and the hover strengthens the rule rather than adding a third.
`underline-offset-2` keeps it off the descenders, which is what stops an underlined
link reading as struck through.

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

`components/progress-marks.tsx` follows the same rule. One mark per area, three states, and
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
endure" — and that still holds for a flow of unknown length. The life areas are a
known, small, finite set, and knowing how many are left is orientation rather than
a demand. Percentages were considered and rejected: they frame reviewing your own
life as a task to complete.

It is a real `role="progressbar"` with `aria-valuenow` and a translated
`aria-valuetext` ("Area 2 of 6"), because a row of dots says nothing out loud. What it
measures is **areas looked at** — "not right now" advances it exactly as much as
setting a goal does.

### The same marks, on a goal

`components/goal-progress.tsx` draws how close a goal feels, and reuses this vocabulary
exactly — `border-2 border-accent bg-accent` filled, `border border-line-strong` empty, 12px
in both. Two states rather than three, so the *current* ring does not appear.

**`ProgressMarks` itself is not reused, and the reason is a trap rather than a preference.**
It is a `role="progressbar"`, and `__progress()` in `scripts/verify.mjs` reads *the*
progressbar on a page as `[...el.children]`. A second one inside a button would not fail §31;
it would make §31 measure the wrong element, which is the kind of breakage nothing reports.
Each file carries a comment pointing at the other so the pair stays in step by hand.

Two other rules land the same way here. §50s asserts the filled and empty marks have
identical rects and differ in fill *and* border width, not colour alone. And the row of five
is `aria-hidden` inside a named button — the icon-only rule below, since the glyphs are the
control's whole content.

### The fourth icon-only control

`.scale-toggle` joins the theme toggle, the collapsed-nav trigger and `.pin-toggle`: same
`border border-line-strong … hover:border-muted` at rest, because a control edge is what says
"this is pressable". Wider padding, since the content is five glyphs on a row rather than one.
It sets no colour of its own — unlike `.pin-toggle-on` it has no on/off state to mark, and
what it shows is *how many* are filled.

`.scale-option` is one point inside the open panel: a `sr-only` radio and a visible dot. The
radio stays a real `<input>` so the browser supplies arrow-key navigation, group semantics and
"3 of 5" — the parts that are expensive to hand-roll, and the same argument `.disclosure`
makes for native `<details>`. The cost is that the global `:focus-visible` outline lands on a
1px clipped input and is invisible, so the label takes it through `:has(input:focus-visible)`.
Padding, not size, makes the target big enough: the dot stays 12px in every state.

## Disclosure

`.disclosure` styles a native `<details>`, and native is the whole point: the
open/closed state, the role, Enter and Space, and find-in-page opening a closed
section all come from the element. "Primitives" at the end of this file explains why
this project will not claim a role it has not implemented — here there is nothing to
implement.

Two rules that are easy to undo by accident:

- **`<summary>` may only contain phrasing content and heading content.** A wrapping
  `<div>` is not allowed; an `<h2>` is. That is why `components/stored-areas.tsx`
  lays its summary out as a **grid** rather than nesting boxes — it needs a heading
  and a line of text beside a marker, and the grid places them without a wrapper the
  content model forbids. Keeping the real `h2` is what keeps each stored area
  visible as its own section in the document outline.
- **Only the marker moves.** The chevron rotates; no height, padding or weight
  changes, so opening a section shifts nothing except the content it reveals. The
  hover cue is on the marker rather than the summary text, because recolouring the
  whole summary would pull its muted second line up to ink and undo the hierarchy
  that line exists to have.

A collapsed section still has to be worth not opening: on `/data/stored/` each one
names the area, its current goal and how many entries are behind it. Folding may hide
detail; it may not hide that anything is there, which is what `scripts/verify.mjs`
§28c asserts.

**Anything folded is invisible to `innerText`.** Every check that reads text off a
page with disclosures has to unfold first — `expandAll()` exists for that — or the
assertion is answered by the fold rather than by the content, and "not there" and
"hidden" look identical from outside. §30, the sweep for leaked internal ids, is the
one where this matters most: it now unfolds and reports how many sections it opened,
because a sweep that silently stopped looking would still have printed PASS.

## Nested-page navigation

`components/back-link.tsx` is the one way back, shared by `/data/stored/` and
`/areas/<id>/`.

It navigates to an **explicit route, never `history.back()`.** Browser back answers a
different question — "undo my last navigation" — and when the page was the first one
opened it leaves the app entirely. The browser's own back button already does that job,
and better.

### Where back goes when a page has two ways in

`/areas/<id>/` can be opened from the life-areas list *or* from an area's name on the
start page, so a single hard-coded parent would be wrong for one of them.

The origin travels in the URL: the start page links to `/areas/<id>?from=home`, and
`components/area-screen.tsx` reads it to choose both the back target and where "Done"
lands. Three properties make that the right mechanism here rather than remembered
state:

- **it survives a reload**, and cannot go stale the way a module-level "last route"
  would;
- **it is read with `useSearchParams()`, not from `window.location`.** Reading `window`
  during render was the first attempt and it was quietly wrong: it is not reactive, and
  on a client-side navigation Next renders the new route *before* committing the URL, so
  the one render that mattered saw an empty search string and nothing re-ran. The link
  said "Back to your life areas" on a page opened from the start page while the URL was
  correct the whole time — which is what made it look like a broken test rather than a
  bug. `useSearchParams` is subscribed to the router, so it re-renders when the URL
  commits;
- **anything unrecognised or absent falls back to `/areas`**, the parent route, which is
  always a correct place to be. A deep link, a shared URL or a hand-typed address gets
  that instead of a dead end.

That hook costs a **`Suspense` boundary** in `app/areas/[area]/page.tsx`, which is not
optional: on a prerendered route `useSearchParams` bails the client tree up to the
nearest boundary out of prerendering, and without one `next build` fails. It passes in
`pnpm dev` regardless, because development renders on demand — so this is a defect class
that only appears in a production build, and a reason to keep building before believing a
route works.

It also costs latency worth knowing about: the area route's content is client-rendered
after the navigation commits, measured at ~340ms in headless Chrome against ~220ms
before. Nothing incorrect is shown in between — the boundary's fallback is `null`, so it
is empty rather than wrong — but it is why `scripts/verify.mjs` waits for the destination
with `waitForText()` at those two call sites instead of sleeping a fixed number of
milliseconds.

The label changes with the target (`manage.back` / `manage.backHome`), because a back
link should name where it goes — one saying "Back to your life areas" while returning to
the start page would be worse than no label at all. §37c–§37f cover the home origin,
following it, a deep link with no origin, and a bogus origin.

It sits **above** the page's own heading. A nested page can be as long as the
person's history, and a way back that has to be scrolled to is not a way back for
someone who took a wrong turn.

It reuses `.nav-link`, which is what keeps its size, colour and hover identical to
the rest of the app's navigation rather than becoming a third kind of link. §35e
measures that both nested pages render the same font size, colour, arrow and
position, so a hand-rolled second copy fails rather than quietly diverging.

On `/areas/<id>/` it is rendered by `AreaScreen`, **not** by `AreaManage`: it is
chrome belonging to the route, not content belonging to one of eight views. Put
inside, it would have to be repeated in each and would go missing from whichever view
was added next. That placement also gave three question views a way out they never
had — changing the goal, adding something, and choosing what to work on are plain
fields with no cancel.

## Icons

There is no icon library, and two glyphs do not justify one (`CLAUDE.md` §11).
`components/icons.tsx` holds `Lock` and `ArrowLeft`, the ones used on more than one
page. They follow the conventions the existing inline icons already set: a 12-unit
viewBox, `fill="none"`, `stroke="currentColor"` so they take the colour of the text
around them, and `aria-hidden`.

`Check` and `Chevron` deliberately stay in `components/menu.tsx`. They belong to that
widget; moving them would be churn without a reader benefit.

**An icon may not be the only thing making a claim.** The lock beside the storage
note on the start page is decorative and carries no label — the sentence beside it
says everything. §32b fails if it ever gains one, because a privacy assurance encoded
in a glyph is exactly what §17 forbids.

## The area label

`components/area-label.tsx` in three sizes. `eyebrow` sits directly above a question
and is `text-ink`; `row` labels an area inside a list and is `text-sm text-muted`;
`card` titles an area on `/areas/` and is `text-lg` medium ink.

`card` exists because that list had no hierarchy: the name was `text-sm text-muted`
while the goal beneath it was full-size ink, so the row's own *subject* was the
quietest thing in it and the rows read as twice as many interchangeable lines. The goal drops a
step in size but **stays `text-ink`** — muting the person's own words to make room for
a label the app chose would be the wrong trade, and size alone separates them once the
name is bigger. §34a measures the two font sizes rather than trusting the eye, and
§34b pins the goal to ink.

`QuestionCard`'s `subject` prop is the exception, and it does not go through
`AreaLabel` for exactly this reason: during the introduction the **area is the `h1`**,
at full `.heading` scale with `AreaIcon size="subject"` beside it, and the question
drops to `text-lg` sans. The question is identical on every area screen, so the one
part that changes should not be the smallest thing on the page. `AreaLabel` still may
not emit a heading — it has five call sites where an `h2` before the question would put
the outline in the wrong order — so `QuestionCard` builds that heading itself, the same
way `components/stored-areas.tsx` does. §44 measures both the size gap and that there
is only one `h1`.

None of `AreaLabel`'s own sizes renders a heading element — the eyebrow sits above the `h1` that owns the
question, and an `h2` in front of it would put the document outline in the wrong
order. On `/areas/` the whole row is a link, and a heading inside a link is worse
again.

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

## Page rhythm

Five pages had drifted into five different spacings for the same relationships. These are
now one set of numbers, and the point of writing them down is that the next page uses
them instead of picking again:

| relationship | value |
| --- | --- |
| between a page's top-level sections | `space-y-10` |
| a title and the line that belongs to it | `space-y-2` |
| a back link and the content under it | `space-y-6` |
| above a rule that separates a section | `border-t border-line pt-6` |
| between buttons in a row | `gap-x-5 gap-y-3` |

**A title and its one-line companion are a pair, not two sections.** `/areas/` has its
subtitle, `/data/stored/` its intro, and `/data/` the current storage mode — each
`space-y-2` from the `h1`, which is the same proximity argument that moved the area
eyebrow inside `QuestionCard`. They had been 2.5rem, 1rem and 2rem apart.

**Three weights of action, in this order.** `/data/` is the worked example: the primary
thing (`.btn-primary`), then a secondary full-size `.btn-quiet`, then a `.link-inline`
for the quiet one. `.btn-sm` is *not* the secondary size — it means "subordinate to the
thing beside me", which is a different claim, and using it for a page-level action made
"Change storage settings" look like it belonged to the button above it.

**A count belongs beside an action, not inside its label.** `/data/` puts the number of
stored entries next to "Show what is stored" rather than in it. A control whose
accessible name changes with the data cannot be found by name twice — which is also
true for `scripts/verify.mjs`, whose click and visibility helpers match text exactly.

## Empty states

An empty state is guidance, and it is weighted like guidance: `text-sm` and
`text-muted`, everywhere. Nothing is wrong when there is nothing active, so nothing
should look like a warning — no border, no icon, no colour, and never at body size
competing with the content that *is* there.

The list: home's "nothing is active right now", the unfinished-area note beside it,
`/areas/`'s no-goal / not-now / nothing-decided lines, and `/data/stored/`'s "nothing
yet".

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
