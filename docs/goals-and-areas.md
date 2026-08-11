# Life areas, goals, and what to try

Five fixed life areas. In each, at most one current goal, at most three prepared
things to try, and at most one being worked on. That is the whole feature.

This file holds the parts that are not self-evident from the code: why the keys
are shaped the way they are, and how current state is derived from them.

## `step` is the internal name for something the UI does not name

The code says `step`, `Step`, `addStep`, `completeStep`, `MAX_OPEN_STEPS`, and the
persisted keys say `area.<a>.step.<sid>.*`. **The user interface never says "step".**

That is deliberate, and the gap is worth understanding rather than closing.

The long-term model is `Life Area → Goal → Action → current focus`, where an Action
may be a one-off task, a habit-like behaviour, an experiment, a routine, a tactic, or
something else entirely. "Next step" leaned task: a step is something you finish, and
half of what belongs here is not finishable — "eat lower-carb most days", "use less
screen time in the evening". So the copy stopped naming the concept at all. The
questions do the work instead:

> What could help you move toward this goal?
> What you want to try
> Which one would you like to focus on first?
> How is it going?

Picking one universal noun would have been wrong for the other kinds, and choosing
per person is personalisation this stage of the product has not earned.

**The keys were not renamed, and should not be.** `docs/person-model.md` divides
fact values into *utterances* (rendered as themselves) and *tokens* (never
rendered). `state` and `step_active` are tokens — `'done'` never reaches a screen,
so it is an internal enum the interface is free to describe however it likes. The
word that was locking the product into task semantics was in the copy, not in the
store. Renaming the identifiers would touch every component and leave the code
saying `action` while the keys say `step`, which is a worse mismatch than this one.

A code-level rename stays cheap and available. A **key** rename is a migration.

## The five areas

`lib/areas.ts` holds ids and nothing else:

```ts
export const areas = ['body', 'relationships', 'work', 'finances', 'creativity'] as const
```

Names live in the message catalogs, emoji in `components/area-icon.tsx`. So an
area can be renamed or redrawn freely — but **the ids themselves cannot change**.
They are persisted inside fact keys, which puts them under the same rule as
`STORAGE_KEY`: renaming one orphans everything stored under it, invisibly. That is
a migration, not an edit.

## The keys

Nothing was added to `lib/person/schema.ts`. No new storage key, no `version` bump,
no migration, no change to the consent gate. These are ordinary facts, written
through the store's `remember()` with `source: 'goals'`.

```
area.<a>.review              'yes' | 'not_now'
area.<a>.goal                the goal, verbatim
area.<a>.step.<sid>.text     the step, verbatim   — newest wins, history = rewordings
area.<a>.step.<sid>.state    'done' | 'retired'   — absent means open
area.<a>.step_active         <sid>
```

`lib/person/goals.ts` is the only module that knows this shape. Nothing else should
build a key by hand.

### Why the step id is in the key

A fact carries exactly one string value. Putting the step's id in the *key* is what
leaves that value free to be the step's own text — which is the only way "reword
this step" is expressible at all. With the id in the value, a fact would have to
carry both an id and a new text, and splitting a value is precisely what
`docs/person-model.md` forbids.

It also gives a step an identity independent of its wording, which matters: "walk
for 20 minutes" can be done today and be worth doing again next month. Those are
two steps that happen to read the same, not one step done twice. Identity by text
would have merged them and lost the history.

### Two kinds of fact value

The model now has both, and the distinction is worth naming:

- **utterances** — `goal` and `step.<sid>.text`. The person's own words, verbatim,
  never parsed. These are the only values ever rendered as themselves.
- **references and tokens** — `review`, `state`, `step_active`. Written by the app.
  `step_active` holds a `sid`, which is an internal id.

An id must never reach a screen. `components/you-areas.tsx` exists for exactly
that reason: `/you` renders life-area facts through `readAreaDetail()` rather than
through its generic group-by-key list, so every reference resolves back to the
words it points at. `scripts/verify.mjs` check 7f asserts the rendered page
contains no UUID at all.

## Deriving current state

```
open(a)        = steps whose newest state is neither 'done' nor 'retired'
activeStep(a)  = the step `step_active` points at, but only while it is open
```

That second line is doing more work than it looks. Marking a step done appends
`state = 'done'`, and the pointer simply stops resolving — so:

- **completing a step clears the active slot with one write**, not two;
- **"Later" writes nothing at all.** The area has no active step because the step
  was completed, which is already recorded. There is no sentinel value, no
  empty-string fact, and no `step_later` key;
- choosing another step appends a newer pointer, and the area is active again.

A completed step never becomes active again. Wanting to do the same thing later
mints a new `sid`.

### The caps

| cap | how it holds |
| --- | --- |
| one current goal per area | newest wins on one key |
| three prepared steps | the UI refuses to add when `open(a).length >= 3` — the active step counts as one of the three |
| zero or one active step | one pointer key, and it resolves only while its target is open |

None of these is a stored constraint. They fall out of the derivation, which is
why a hand-edited store degrades rather than becoming invalid.

## The four outcomes

The home screen asks **"How is it going?"** about whatever is being worked on, and
offers four answers. They map onto the existing writers with no new fact values:

| answer | writer | what is stored |
| --- | --- | --- |
| I have done this | `completeStep` | `state = 'done'` |
| Still on it | — | **nothing** — see below |
| I would rather do something else | `chooseStep`, or `addStep` + `chooseStep` | a newer `step_active` |
| This does not fit anymore | `retireStep` | `state = 'retired'` |

**Why a question rather than a Done button.** Completion used to be the only
outcome, and it was reached by tapping the row — the whole row, which was a
full-width button whose only content was the person's own words, with no
confirmation and no undo. Two problems in one control: *done* is not the only way
this goes, and nothing said that touching the words would end it. The words are now
plain text and the control is explicit.

Framing it as a question is also what keeps the door open. A future check-in asks
the same thing on its own initiative and can offer the same four answers — the
affordance already exists, so building check-ins does not mean redesigning this.
That is the compatibility this stage was asked for, and none of it is built:
no timestamps, no frequency setting, no prompt, no resurfacing.

### "Still on it" writes nothing — for now

Today it is the honest answer. The person confirmed that nothing changed, the active
pointer already says so, and a fact with no consumer is clutter. The same reasoning
already covers "Later".

**This is a decision about the current, non-check-in UI, not a rule about the
model.** Once the app checks in periodically, persisting the answer *and its
timestamp* stops being redundant and becomes the signal that resurfacing and
reflection would need — "when did they last confirm they were still on this" cannot
be reconstructed after the fact. The append-only model already supports it with no
schema change: a key like `area.<a>.step.<sid>.checkin` whose value is the answer and
whose `learnedAt` is the timestamp.

So: not stored now, because nothing reads it. Stored later, when something does.

## Changing a goal

Steps belong to the **area**, not to the goal. A new goal therefore touches no
step fact — but it does trigger a review, one step per screen, over everything
still open:

- **Keep** writes nothing; the step stays open.
- **Edit** appends `step.<sid>.text`. The previous wording stays in history.
- **Remove from current steps** appends `state = 'retired'`.

Nothing is silently carried over into a changed goal, and nothing is silently
discarded. `retired` exists because an append-only log has no delete, and because
"I decided this no longer applies" is itself worth knowing later. The user-facing
label says "remove from current steps" rather than "remove" for the same reason:
nothing is deleted, and the copy should not claim otherwise on a page whose
neighbour is `/you`.

## Which goal was current when something happened

`goalAt(person, area, when)` answers it by looking for the newest goal fact at or
before `when`. Nothing extra is stored: every fact already carries `learnedAt`.

**This is a convenience over one device's local history, not a cross-device
ordering guarantee.** `learnedAt` is a wall clock on whichever machine wrote the
fact, so two devices with skewed clocks could interleave goal and step facts
misleadingly. If sync ever arrives, that is the moment to decide whether a step
needs explicit goal context of its own — deliberately not built now.

It is derivable today and unused by the UI today. It is what a future journey
summary would read.

## Completed steps are kept, and not shown

Completions stay in the store, with their timestamps, because reflection, journey
summaries and any later compression of old activity all need them. **No screen in
this iteration lists them.** Home shows what is active; the life-area view shows
the current goal, the active step, and what else is prepared. `/you` is where
everything can be inspected.

The direction that matters here: older activity should eventually be summarised
into something a person recognises as their own path, not displayed as thousands
of DONE rows.

## Where this lives

| route | what it is |
| --- | --- |
| `/` | the introduction, then the few things being worked on |
| `/areas/` | the five areas and where each one stands |
| `/areas/<id>/` | one area, deep-linkable — `components/area-manage.tsx` |

The last two used to be two states inside the home page's state machine, which is
what made it ten states long; it is seven now. `app/areas/[area]/page.tsx` is a
server component for one narrow reason — a `'use client'` file cannot export
`generateStaticParams` — so it does the two things that must happen at build time
and delegates everything a person reads to `components/area-screen.tsx`.

**The routes are not gated on the introduction; only the navigation is.** Gating a
route under a static export means a client-side redirect, which is a flash, and
`CLAUDE.md` §9 rules that out. Opening `/areas/` mid-introduction shows mostly-empty
areas, which is the same thing `/about` has always done for a fresh visitor.

## Introduction state

Two derivations that are easy to confuse:

- **whether the introduction is over** — `introductionFinished()`: every area has a
  `review` fact. This is monotonic, because a review answer is never taken away.
- **where an interrupted pass resumes** — `isSettled()`, which is *not* monotonic.
  Completing something and choosing "Later" makes an area unsettled again, which is
  a perfectly good state to be in.

Using `isSettled` for the first would drop someone back into onboarding months
later. Using the review count for the second would skip an area whose goal was
answered but whose entries were not.

`introductionFinished()` is a named export rather than a comparison written out at
each call site because it now has **two** callers that have to agree: `app/page.tsx`
chooses between the introduction and the home screen, and
`components/page-shell.tsx` decides whether the navigation exists yet. A nav that
appeared mid-introduction would offer pages that are empty until it is finished.

It is derived from the person, not from `localStorage`, so it holds in memory mode
too — someone who declined saving still finishes the introduction and still gets the
navigation. `scripts/verify.mjs` §26d asserts exactly that, alongside the store
still being empty.

### Interrupted setup is accepted, not fixed

Closing the tab midway through the **fifth** area lands on home rather than
resuming, because all five areas have a review answer by then. Complicating the
onboarding state to resume there is not worth it while nothing is lost — but that
only holds if four things stay true, so all four are asserted by
`scripts/verify.mjs` §25:

1. **five review answers end the introduction**, whatever state an area was left in;
2. **unfinished setup stays reachable afterward** — the area keeps its goal, and the
   list of life areas shows it as "no next step yet";
3. **home says so.** A goal with no step *ever* written is interrupted setup, and
   home names it rather than letting "that is a fine place to be" claim everything
   is settled. An area paused on purpose has steps behind it and is deliberately
   excluded from this, because "Later" is a real answer and pointing at it would be
   nagging;
4. **nobody is routed back into onboarding** just because an area has no active
   step. This is the regression guard on the monotonicity decision above.

Finishing an unfinished area is one action: open it from the list of life areas and
add a next step, which becomes the active one without a further question.

## What this is not

Not a to-do list, not a habit tracker, not a task manager. The point is to keep a
small number of actions in view because they connect to something the person
currently cares about — not to hold everything they could possibly do.

Deliberately absent: check-ins, reminders, resurfacing, difficulty and helpfulness
ratings, streaks, points, urgency, celebration, priorities, recurrence, due dates,
and any history browser. The behavioural layer that would ask "how is this going?"
or "does this still matter to you?" belongs to a later iteration.
