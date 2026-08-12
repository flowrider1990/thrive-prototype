# Life areas, goals, and what to try

Six fixed life areas. In each, up to three current goals, at most three prepared
things to try **across the area**, and at most one being worked on. That is the
whole feature.

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

## The areas

`lib/areas.ts` holds ids and nothing else:

```ts
export const areas = ['body', 'mind', 'relationships', 'work', 'finances', 'creativity'] as const
```

| id | label |
| --- | --- |
| `body` | Physical Health |
| `mind` | Mental Wellbeing |
| `relationships` | Relationships & Social Life |
| `work` | Work & Career |
| `finances` | Finances |
| `creativity` | Hobbies & Creativity |

Names live in the message catalogs, emoji in `components/area-icon.tsx`. So an
area can be renamed or redrawn freely — but **the ids themselves cannot change**.
They are persisted inside fact keys, which puts them under the same rule as
`STORAGE_KEY`: renaming one orphans everything stored under it, invisibly. That is
a migration, not an edit. `body` reads as "Physical Health" while keeping the id it
was given, which is exactly the separation this rule buys.

### Why these six

**Physical and mental are separate on purpose.** Physical health is one input to
wellbeing; wellbeing is also downstream of relationships, work and circumstance.
Merging them would make the merged area the place everything hard goes.

The risk runs the other way, and it is a copy problem rather than a structural one:
Mental Wellbeing can absorb the whole app, because stress from work and loneliness
both land there and both have areas that own them. Its copy scopes it to *inner
life* — rest, mood, stress, calm, how you are in yourself — and leaves causes with
the areas they belong to. "Wellbeing" rather than "Health", and `Mentales` rather
than `Psychisches`, because this is not a clinical category and the app makes no
medical claims.

Six is the cap. Growth/Learning is the most defensible seventh and is absorbed by
Work and Creativity; Home/Environment is excluded outright.

**Order is presentation, not data.** It drives the sequence the introduction asks in
and the order of the progress marks, and nothing else. `mind` sits at index 1 so the
two health areas are adjacent, which is the only thing the ordering says.

### Adding an area is safe for the store, and used to break something else

No existing key changes, so nothing is orphaned — but until `introduction_done`
existed, adding an area silently un-finished the introduction for every store that
already had one. See "Introduction state" below; the short version is that
`LEGACY_AREAS` must never grow.

## The keys

Nothing was added to `lib/person/schema.ts`. No new storage key, no `version` bump,
no migration, no change to the consent gate. These are ordinary facts, written
through the store's `remember()` with `source: 'goals'`.

```
area.<a>.review              'yes' | 'not_now'
area.<a>.goal                the goal, verbatim   — LEGACY, still read, still written
area.<a>.goal.<gid>.text     the goal, verbatim   — newest wins, history = rewordings
area.<a>.goal.<gid>.why      why it matters       — empty reads as absent
area.<a>.goal.<gid>.state    'done' | 'retired'   — absent means active
area.<a>.goal_priority       <gid>
area.<a>.step.<sid>.text     the entry, verbatim  — newest wins, history = rewordings
area.<a>.step.<sid>.state    'done' | 'retired'   — absent means open
area.<a>.step.<sid>.goal     <gid>                — absent means "attribute it"
area.<a>.step_active         <sid>
```

`GOAL_KEY` cannot match the legacy `area.<a>.goal` (too few segments) or
`area.<a>.goal_priority` (`goal_priority` is not `goal`), so all three coexist
without ambiguity. **That is what makes the migration a read rather than a rewrite,
and why there is no `version` bump.**

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

An id must never reach a screen. `components/stored-areas.tsx` exists for exactly
that reason: `/data/stored/` renders life-area facts through `readAreaDetail()` rather than
through its generic group-by-key list, so every reference resolves back to the
words it points at. `scripts/verify.mjs` check 7f asserts the rendered page
contains no UUID at all.

## Deriving current state

```
goals(a)       = every goal ever written here, oldest first, tie-broken on id
activeGoals(a) = those whose newest state is neither 'done' nor 'retired',
                 capped at MAX_GOALS, oldest kept
priority(a)    = the goal `goal_priority` points at, but only while it is active
open(a)        = entries whose own newest state is neither 'done' nor 'retired'
                 AND whose goal is still active
activeStep(a)  = the entry `step_active` points at, but only while it is open
```

**Goals are derived before entries**, and the order is not incidental: an entry's
attribution *and* whether it is open both depend on the state of the goal it serves.

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
| three goals per area | `activeGoals` slices to `MAX_GOALS` after sorting, oldest kept, so a hand-edited store renders three rather than throwing |
| zero or one priority goal | one pointer key, resolving only while its target is active |
| three prepared entries **per area** | the UI refuses to add when `open(a).length >= 3` — the active one counts as one of the three. Deliberately on the area, not the goal: three goals holding three each would be nine open entries in one area, which is the task manager this is not |
| zero or one active step | one pointer key, and it resolves only while its target is open |
| zero steps against a goal | no step facts exist — nothing has to be written to mean it |

None of these is a stored constraint. They fall out of the derivation, which is
why a hand-edited store degrades rather than becoming invalid.

### A goal with nothing to try yet is a valid resting state

Wanting something to change in an area, having a goal, and **not yet knowing what would
help** is an ordinary place to be. The model represents it with nothing at all: a
`review` fact, a `goal` fact, and no step facts. `open(a)` is empty because no step
exists, not because something was written to say so.

Onboarding used to be unable to express it. The steps screen offered only "Add", so the
only way past was to invent something — and an invented action is worse than none,
because the app then treats it as a real intention the person never had. It now offers
**"I do not know yet"** / **"Ich weiß es noch nicht"** as a quiet second action, and
taking it writes nothing. §38c asserts that: no step key appears, and no fact value
contains the words.

Two consequences worth knowing:

- **No placeholder, ever.** There is deliberately no `'unknown'` step, no empty-string
  `text` fact and no `step_none` key. The absence *is* the representation, which is the
  same reasoning that makes "Later" write nothing.
- **`finishSteps()` has to handle zero.** Without that branch the flow fell through to
  the "which one first" question with an empty list — a dead screen. Zero means there is
  nothing to choose between, so the area is simply left as it is.

Downstream this state was already handled, and the copy already existed:
`manage.noStep` on `/areas/` ("You have not decided yet what could help") and
`home.unfinished` on the start page say the same thing in the same words. Neither treats
it as invalid or incomplete data. §38f–§38h assert all three surfaces.

One rough edge, recorded rather than fixed: `isSettled()` still requires an active step,
so a **reload in the middle of the introduction** resumes at the steps question of an
area that was skipped this way, re-offering a question already answered. It is not a
trap — the same answer works again and nothing fake is written — and `isSettled` is used
for nothing but choosing where to resume. Making the skip stick across a reload means
letting a goal alone count as settled, which changes that derivation and was left out of
a UI-only change.

### Up to three goals per area

This used to be recorded here as a first-iteration constraint that the code made look
like a rule. It is now built, and along the lines this file predicted: goal ids in the
key, an additive `.goal` reference on an entry, and no `version` bump.

Two things the prediction got right and one it did not. Entries really were already
independent of any one goal, so linking them was purely additive. Goals really did need
the treatment entries already had. But this file guessed that multiple goals "might
qualify" for a `version` bump, and it does not: the legacy key is readable under the new
shape, which is the doc's own test for whether a bump is needed.

**The cap is on the area, not the goal.** Up to three goals, but only three things being
tried across all of them — three goals holding three each would be nine open entries in
one area, which is the task manager this is not.

**The interface has not moved yet.** `setGoal()` still writes the legacy key, so every
goal written today is a legacy goal and the newer shape is read but not written. That is
deliberate: the migration and the screens change one at a time, and the read path is
covered by §41 in the meantime.

## The three outcomes

The home screen asks **"How is it going?"** about whatever is being worked on, and
offers three answers. They map onto the existing writers with no new fact values:

| answer | writer | what is stored |
| --- | --- | --- |
| I have done this | `completeStep` | `state = 'done'` |
| Still on it | — | **nothing** — see below |
| This does not fit me anymore | `retireStep` | `state = 'retired'` |

**It was four.** "I would rather do something else" and "This does not fit anymore"
were two labels for one state — *this is not right for me now* — and offering both made
the person classify their own dissatisfaction before the app would act on it. They
barely differed in effect either: one set the entry aside and then offered another, the
other kept it open and offered another. The surviving answer sets the entry aside and
then offers to choose something else, which is where both used to end up. Choosing
another is still reachable, from "Choose something" on the step that follows.

**Why a question rather than a Done button.** Completion used to be the only
outcome, and it was reached by tapping the row — the whole row, which was a
full-width button whose only content was the person's own words, with no
confirmation and no undo. Two problems in one control: *done* is not the only way
this goes, and nothing said that touching the words would end it. The words are now
plain text and the control is explicit.

Framing it as a question is also what keeps the door open. A future check-in asks
the same thing on its own initiative and can offer the same answers — the
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

**This describes the interface as it stands, and the model has moved underneath it.**
Entries now belong to a goal, so rewording one no longer risks orphaning anything —
the same goal id keeps the same entries, and nothing has to be asked about. The walk
below therefore has no reason to run on a reword any more, and should be retargeted
rather than deleted when the multi-goal screens land: **reaching or setting aside** a
goal is the case that still needs it, because its open entries would otherwise be
silently stranded or silently discarded, which is the pair this walk was built to
prevent.

Until then it behaves exactly as before, because `setGoal()` still writes the legacy
key and newest-wins on one key is still what "changing a goal" means.

Steps belonged to the **area**, not to the goal. A new goal therefore touched no
step fact — but it did trigger a review, one step per screen, over everything
still open:

- **Keep** writes nothing; the step stays open.
- **Edit** appends `step.<sid>.text`. The previous wording stays in history.
- **Remove from current steps** appends `state = 'retired'`.

Nothing is silently carried over into a changed goal, and nothing is silently
discarded. `retired` exists because an append-only log has no delete, and because
"I decided this no longer applies" is itself worth knowing later. The user-facing
label says "remove from current steps" rather than "remove" for the same reason:
nothing is deleted, and the copy should not claim otherwise on a page whose
neighbour is `/data/stored/`.

## The legacy goal, and why nothing was rewritten

A store written before goals had ids holds `area.<a>.goal`. It is read as a goal whose
id is the reserved literal `LEGACY_GID` — `newId()` returns UUIDs, so it cannot
collide — and **its text stays at that old key forever**. One ternary in
`goalTextKey()` is the entire special case; reading, editing, history, ordering and
`/data/stored/` all flow through it.

Keeping the text where it is matters more than it looks. Migrating it into
`area.<a>.goal.legacy.text` on first edit would split one goal's wording history
across two keys and break the "changed from" chain exactly at the seam — on the page
whose whole job is to show how something changed.

**Entries are attributed rather than backfilled.** An entry with no `.goal` fact
belongs to the legacy goal when the area has one. That is not a guess: before goals
had ids an area held exactly one, so the link was implied by the key shape rather than
stored. It is never guessed between several newer goals — with no legacy goal an entry
stays unlinked, and so does a link naming a goal that is not there. Reads never write,
which is also what lets §41f seed the same store twice and get the same answer.

`goalAt()` was **removed** rather than updated. "Which goal was current when this
happened" only had an answer while an area held one goal; with several it has no single
one, and it had no caller. A journey summary will need something, but it will need to
be designed against the model that exists rather than kept alive against the one that
does not.

## Completed steps are kept, and not shown

Completions stay in the store, with their timestamps, because reflection, journey
summaries and any later compression of old activity all need them. **No screen in
this iteration lists them.** Home shows what is active; the life-area view shows
the current goal, what is active, and what else is prepared. `/data/stored/` is where
everything can be inspected.

The direction that matters here: older activity should eventually be summarised
into something a person recognises as their own path, not displayed as thousands
of DONE rows.

## Where this lives

| route | what it is |
| --- | --- |
| `/` | the introduction, then the few things being worked on |
| `/areas/` | the life areas and where each one stands |
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

- **whether the introduction is over** — `introductionFinished()`: the
  `introduction_done` fact, or, for a store written before that fact existed, a
  `review` fact for every area in `LEGACY_AREAS`.
- **where an interrupted pass resumes** — `isSettled()`, which is *not* monotonic.
  Completing something and choosing "Later" makes an area unsettled again, which is
  a perfectly good state to be in.

### Why the first one is a fact and not only a derivation

It used to be `areas.every(a => readArea(a).review)`, and that was monotonic — but
only **in the answers**, not in the *question set*. A review answer is never taken
away, so the count could not fall; adding a life area moved the bar instead.

The consequence was much worse than one extra screen, and it is worth writing down
because nothing about the old line looked dangerous:

- `app/page.tsx` stops rendering `NextSteps` and shows a review question, so what
  someone is working on disappears;
- `components/page-shell.tsx` withdraws the navigation from **every** page —
  including `/data/`, which is where the app explains what it holds and offers to
  delete it. For a product whose privacy story is a feature, that is the real damage;
- `resumeArea` is `states.find(s => !isSettled(s))`, *not* the first unreviewed one,
  so anyone who had chosen "Later" was re-asked about an area they had answered;
- it self-heals after one answer, so it would have read as a cosmetic glitch.

So completion is recorded: one token fact, written once, at the single transition in
`nextArea()` where the introduction closes. `LEGACY_AREAS` in `lib/areas.ts` is the
fallback for stores written before it, and **it must never grow** — growing it would
re-open exactly this trap on the next area added.

One consequence recorded rather than guarded against: a *fresh* visitor who
deep-links past the introduction and answers exactly the legacy areas also satisfies
the fallback. It cannot be told apart from an upgraded store from the facts alone,
and the outcome is the one upgrading already produces — the newer area waits on
`/areas/` as "no goal yet" — so it is accepted rather than fixed with a stored format
marker.

`scripts/verify.mjs` §40 is the guard, on its own fixture: `seedOnboarded()` now
writes the fact, so it could only ever prove the easy half. §40 also asserts that
reaching the conclusion **wrote nothing** — the fallback is a read.

The value is a token, so `/data/stored/` renders it through `stored.tokens` as a
sentence. The generic list on that page prints `fact.value` directly, which is right
for an utterance and wrong for anything the app wrote itself.

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

Closing the tab midway through the **last** area lands on home rather than
resuming, because every area has a review answer by then. Complicating the
onboarding state to resume there is not worth it while nothing is lost — but that
only holds if four things stay true, so all four are asserted by
`scripts/verify.mjs` §25:

1. **a review answer for every area ends the introduction**, whatever state an area
   was left in. Note that this scenario is carried by the `LEGACY_AREAS` fallback
   rather than by the fact: the pass is interrupted before `nextArea()` closes it, so
   `introduction_done` is never written. Removing the fallback fails §25a before it
   fails §40 — measured, not assumed;
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

## Product follow-ups: asked for, and deliberately not built

Three things were requested during the UI sprint and are recorded here instead of
implemented, because each needs a domain concept rather than a screen. **None of them
should be attempted as a UI change.**

### A visible status per life area on the start page

The intent: the start page shows, for each life area, a visible status.

- The status **replaces** the "How is everything going?" button once one has been
  chosen — the button is not shown alongside it.
- Clicking the status **reopens the existing selection**, so it can be changed.
- The status should be compact and scannable, so the start page communicates the state
  of the life areas at a glance.

**This needs its own domain concept, not just UI.** There is no per-area status in the
model today. The four answers behind "How is it going?" are *actions*, not a state:
they write `area.<a>.step.<sid>.state` or move `area.<a>.step_active`, and "Still on
it" deliberately writes nothing at all (see "Still on it writes nothing" above). So
there is nothing for a chip to read, and nothing that could make the button disappear
— after "Still on it" the app would have to show the button again, which contradicts
the intent directly.

Open questions, to be decided before any implementation:

- **A status of its own** (`area.<a>.status`) — a real fact, explicitly chosen and
  stored. Needs a value set, and every value becomes a promise the UI has to keep.
- **Or a derived status**, computed from the facts that already exist — is there a
  goal, is something active, was the last thing set aside, has anything been done. Adds
  no keys, but can only ever say what the existing facts happen to imply, and cannot
  represent "I checked in and things are fine".
- **When it updates, and when it goes stale.** A status shown without a notion of age
  will eventually assert something that stopped being true months ago, which is worse
  than showing nothing. If it can go stale, the rules for that are part of the concept,
  not an afterthought.

Note the interaction with a second decision already parked: once check-ins exist,
"Still on it" is expected to start writing the answer *and its timestamp*, because that
pair is the signal resurfacing needs. Whichever way status goes, it should be decided
together with that, not before it.

### Ordering and priority instead of interchangeable items

"Work on something else" was **removed** from the area page in this sprint. Freely
swapping between prepared items implied they are equally interchangeable, which is the
opposite of what the list should communicate.

The intended direction, to be worked out later:

- someone should be able to **mark items as priorities**;
- there should also be an **explicit ranking** — an order, not just a flag;
- that ranking may later be **editable by dragging**;
- **marking and ranking are related but not the same thing**, and the difference has to
  be decided rather than assumed;
- the UI should eventually use the ordering to say **what matters most now**, so
  relevance is communicated by position rather than by offering an equal switch between
  peers.

Final semantics are deliberately not invented here. Note that swapping is still
reachable where it makes sense — from the "How is it going?" answers on the start page,
which ask about one specific thing rather than presenting a flat set of equals.

### Satisfaction check-ins per life area

Later, the app should periodically ask how satisfied someone is, or how things are
going, **within an individual life area** rather than about one entry.

This belongs to the future check-in and problem-solving flow, and should build on the
model that already exists — areas, goals, and the things someone wanted to try — rather
than introducing a parallel structure beside it. It is also the most likely consumer of
whatever status concept is settled above, which is a further reason not to fix status
first and discover the mismatch afterwards.
