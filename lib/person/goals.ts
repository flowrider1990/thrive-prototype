'use client'

import { defaultAreaIcon, isAreaIcon } from '@/lib/area-icons'
import { LEGACY_AREAS, type AreaId } from '@/lib/areas'
import { newId, remember, type Person } from './store'

/**
 * Goals and next steps, expressed as ordinary facts.
 *
 * Nothing here touches storage — every write goes through the store's
 * `remember()`, so the consent gate applies unchanged. This module owns exactly
 * one thing: the shape of the keys, and how current state is derived from them.
 * Nothing outside it should build a key by hand.
 *
 * ```
 * area.<a>.review              'yes' | 'not_now'
 * area.<a>.goal                the goal, verbatim
 * area.<a>.step.<sid>.text     the step, verbatim   — newest wins, history = edits
 * area.<a>.step.<sid>.state    'done' | 'retired'   — absent means open
 * area.<a>.step.<sid>.goal     <gid>
 * area.<a>.step.<sid>.pinned   'yes' | 'no'         — absent means not pinned
 * area.<a>.goal.<gid>.progress '1'…'5'              — absent means never evaluated
 * area.<a>.icon                one emoji            — absent means the area's default
 * area.<a>.step_active         <sid>                — LEGACY, read as a pin
 * ```
 *
 * **The step id lives in the key, not in a value.** A fact carries one string, so
 * putting the id in the key is what leaves that string free to be the step's text
 * — which is what makes editing a step expressible at all. It also means a step's
 * identity is stable and independent of its wording: the same sentence written
 * twice is two steps, because doing the same useful thing again later is a new
 * thing to do, not a repeat of the old one.
 *
 * Only `goal` and `step.<sid>.text` hold the person's own words. The rest are
 * tokens and references the app wrote, and they are never shown raw — `/you`
 * resolves them back into the words they point at.
 */

export const SOURCE = 'goals'

/**
 * That the introduction was finished, rather than a conclusion drawn from counting
 * the areas that have been answered. Not an `area.` key — it is about the pass, not
 * about one area — so `isAreaKey()` correctly leaves it to the generic list on
 * `/data/stored/`.
 */
export const INTRODUCTION_DONE = 'introduction_done'

/**
 * Three things to try at a time, **per area**, counting the one being worked on.
 *
 * The cap is deliberately on the area rather than on the goal. Three goals each
 * holding three would be nine open entries in one area, which is the task manager
 * this is not — so an area can hold up to `MAX_GOALS` goals but only ever three
 * things actively being tried across all of them.
 */
export const MAX_OPEN_STEPS = 3

/** Enough to weigh against each other, few enough to still be a choice. */
export const MAX_GOALS = 3

export type Review = 'yes' | 'not_now'

export type StepState = 'open' | 'done' | 'retired'

/** Deliberately the same vocabulary as `StepState`: absent means current. */
export type GoalState = 'active' | 'done' | 'retired'

/**
 * How close this feels, in the person's own judgement. Five points, 1 to 5.
 *
 * Stored as the semantic step rather than as a fraction. `0.6` would be a number the app
 * invented from an answer that was never a number — and the labels ("Getting closer") are
 * what the person actually chose, so the scale has to survive as the scale.
 *
 * **Absent is not 1.** Never having been asked and feeling far away are different states,
 * and the whole point of an optional check-in is that most goals are in the first one. The
 * type is `Progress | undefined` everywhere for that reason.
 *
 * **5 does not sit still.** Reaching a goal closes it, so the fifth point is a transition
 * rather than a resting state — see `setGoalProgress` and the note in
 * `docs/goals-and-areas.md`.
 */
export type Progress = 1 | 2 | 3 | 4 | 5

export type Goal = {
  /** A UUID, or `LEGACY_GID` for a goal written before goals had ids. */
  id: string
  text: string
  /** Why it matters, in the person's own words. Empty reads as absent. */
  why: string | undefined
  state: GoalState
  /**
   * Starred, so the start page leads with it.
   *
   * **Not `goal_priority`.** That pointer orders goals *within* one area and there is one
   * of it; this is a per-goal flag, several may be set, and it exists to order a list that
   * crosses areas — where "first in its own area" says nothing about what to show first
   * overall. Same shape and same reasoning as a step's `pinned`, so `/data/stored/` reads
   * them the same way.
   */
  pinned: boolean
  /**
   * The newest self-reported answer to "how close are you to reaching this?", if there
   * ever was one. `undefined` means never evaluated, which is not the same as 1.
   */
  progress: Progress | undefined
  /** `learnedAt` of its first wording. */
  createdAt: string
}

export type Step = {
  id: string
  text: string
  state: StepState
  createdAt: string
  /**
   * The goal this serves. `undefined` only when the area has no goal to attribute
   * it to — see `readArea`.
   */
  goalId: string | undefined
  /** Whether that link was stored, or inferred from the area having one goal. */
  linked: boolean
  /**
   * Kept in view on the start page. Optional, never asked for, and **not a
   * ranking** — any number of entries can be pinned at once.
   */
  pinned: boolean
}

export type AreaState = {
  area: AreaId
  /** `undefined` means the area has never been asked about. */
  review: Review | undefined
  /** Starred, so `/areas/` leads with it. Never asked for, and not a ranking. */
  pinned: boolean
  /** Every goal ever written here, oldest first. */
  goals: Goal[]
  /** Still current, capped at `MAX_GOALS`. */
  activeGoals: Goal[]
  /** The one put first, if any, and only while it is still active. */
  priority: Goal | undefined
  /** Every step ever written down for this area, oldest first. */
  steps: Step[]
  /** Those still under consideration — at most `MAX_OPEN_STEPS`. */
  open: Step[]
}

/**
 * The id of a goal written before goals had ids.
 *
 * Reserved, never generated: `newId()` returns a UUID or `fact-…`, so it cannot
 * collide. Its **text stays at the old `area.<a>.goal` key forever**, which is what
 * keeps a goal's wording history contiguous — that history is what `/data/stored/`
 * renders as "changed from". Its newer fields live under the gid like any other
 * goal's, which is the whole point of putting the id in the key: a goal can grow
 * fields without its text having to move.
 *
 * There is at most one per area, ever, so this special case cannot grow.
 */
export const LEGACY_GID = 'legacy'

const reviewKey = (area: AreaId) => `area.${area}.review`
/**
 * Kept at the top of `/areas/`.
 *
 * One segment under the area, where a goal's and an entry's live two and three deep — which
 * is what keeps it out of `GOAL_KEY` and `STEP_KEY` without either pattern needing to know
 * about it. Same vocabulary as the other two stars, and the same rule: any number may be
 * set, and it is a preference about what you want to see rather than a ranking.
 */
const areaPinnedKey = (area: AreaId) => `area.${area}.pinned`
/**
 * Which emoji this area is drawn with.
 *
 * The **glyph** is stored, not an index into `areaIcons`. An index is one byte smaller and
 * wrong: it means nothing without the list it points into, so reordering that list would
 * silently repoint every stored choice at a different emoji, and there would be no way to
 * tell a stale index from a current one. The glyph says what it means on its own, and
 * `isAreaIcon` is what turns an unrecognised one back into the default.
 *
 * One segment under the area, like `pinned`, which is what keeps it clear of `GOAL_KEY`
 * and `STEP_KEY` without either pattern having to know it exists.
 */
const iconKey = (area: AreaId) => `area.${area}.icon`
const pinnedKey = (area: AreaId, step: string) => `area.${area}.step.${step}.pinned`
const goalPinnedKey = (area: AreaId, goal: string) => `area.${area}.goal.${goal}.pinned`
const goalProgressKey = (area: AreaId, goal: string) => `area.${area}.goal.${goal}.progress`

/**
 * **Legacy, read-only.** The single pointer that used to mean "the one being worked
 * on" in this area.
 *
 * Pinning replaced it: several entries can be kept in view, which one pointer cannot
 * express. An existing pointer is read as a pin, because that is what it meant — see
 * `readArea`. Nothing writes this key any more, and it is never sliced out of a store
 * either, so `/data/stored/` keeps showing what is there.
 */
const legacyActiveKey = (area: AreaId) => `area.${area}.step_active`
const priorityKey = (area: AreaId) => `area.${area}.goal_priority`
const textKey = (area: AreaId, step: string) => `area.${area}.step.${step}.text`
const stateKey = (area: AreaId, step: string) => `area.${area}.step.${step}.state`
const stepGoalKey = (area: AreaId, step: string) => `area.${area}.step.${step}.goal`
const goalWhyKey = (area: AreaId, goal: string) => `area.${area}.goal.${goal}.why`
const goalStateKey = (area: AreaId, goal: string) => `area.${area}.goal.${goal}.state`

/** The one ternary that is the entire legacy special case. */
const goalTextKey = (area: AreaId, goal: string) =>
  goal === LEGACY_GID ? `area.${area}.goal` : `area.${area}.goal.${goal}.text`

/** `area.<a>.step.<sid>.<field>` — ids are UUIDs, so they contain no dots. */
const STEP_KEY = /^area\.([^.]+)\.step\.([^.]+)\.(text|state|goal|pinned)$/

/**
 * `area.<a>.goal.<gid>.<field>`.
 *
 * Cannot match the legacy `area.<a>.goal` (too few segments) or
 * `area.<a>.goal_priority` (`goal_priority` is not `goal`), so all three coexist
 * without ambiguity. That is what makes the migration a read rather than a rewrite.
 */
const GOAL_KEY = /^area\.([^.]+)\.goal\.([^.]+)\.(text|why|state)$/
// `pinned` and `progress` are deliberately **not** in `GOAL_KEY`: that pattern is what
// discovers which goals exist, and a star or a rating on its own — from a hand-edited store
// — must not conjure a goal with no words. Anything added here later has to answer the same
// question: is this field enough, on its own, to mean a goal is there?

/** Everything this module owns, so `/you` can tell it apart from the rest. */
export function isAreaKey(key: string): boolean {
  return key.startsWith('area.')
}

function toReview(value: string | undefined): Review | undefined {
  return value === 'yes' || value === 'not_now' ? value : undefined
}

/** Absent or unrecognised reads as open, the same way an absent theme reads as "follow the OS". */
function toState(value: string | undefined): StepState {
  return value === 'done' || value === 'retired' ? value : 'open'
}

/** Same rule one level up: absent or unrecognised means the goal still stands. */
function toGoalState(value: string | undefined): GoalState {
  return value === 'done' || value === 'retired' ? value : 'active'
}

/**
 * Absent, empty or unrecognised all read as *never evaluated*, which is the same degrading
 * rule the two above follow — a hand-edited store should lose a rating, not white-screen.
 *
 * Empty reading as absent is deliberate rather than incidental: it is how `why` is cleared,
 * so if a "clear this rating" control is ever wanted, the read side already accepts what it
 * would write. Nothing writes an empty one today.
 */
function toProgress(value: string | undefined): Progress | undefined {
  switch (value) {
    case '1':
      return 1
    case '2':
      return 2
    case '3':
      return 3
    case '4':
      return 4
    case '5':
      return 5
    default:
      return undefined
  }
}

/**
 * Every goal ever written for an area, oldest first.
 *
 * The legacy goal comes first when it exists, which is also its place by creation
 * time: it necessarily predates anything written under the newer shape.
 */
function readGoals(person: Person, area: AreaId): Goal[] {
  const ids: string[] = []
  const seen = new Set<string>()
  if (person.current(goalTextKey(area, LEGACY_GID))) {
    ids.push(LEGACY_GID)
    seen.add(LEGACY_GID)
  }
  for (const fact of person.facts) {
    const match = GOAL_KEY.exec(fact.key)
    if (!match || match[1] !== area) continue
    if (seen.has(match[2])) continue
    seen.add(match[2])
    ids.push(match[2])
  }

  const goals: Goal[] = []
  for (const id of ids) {
    const wordings = person.history(goalTextKey(area, id))
    const text = wordings.at(-1)
    // A goal with a `why` or a `state` but no text can only come from a hand-edited
    // store. Skipping degrades rather than throwing, as everywhere else here.
    if (!text || !wordings[0]) continue
    // An empty why is how one is cleared: append-only has no delete, so the way to
    // take something back is to say nothing, and nothing reads as absent.
    const why = person.current(goalWhyKey(area, id))?.value
    goals.push({
      id,
      text: text.value,
      why: why || undefined,
      state: toGoalState(person.current(goalStateKey(area, id))?.value),
      pinned: person.current(goalPinnedKey(area, id))?.value === 'yes',
      progress: toProgress(person.current(goalProgressKey(area, id))?.value),
      createdAt: wordings[0].learnedAt,
    })
  }

  // Tie-broken on the id so two goals minted in the same millisecond still sort
  // identically on every device — see the note on `newest()` in `./store`.
  goals.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  return goals
}

export function readArea(person: Person, area: AreaId): AreaState {
  // Goals first: a step's attribution *and* whether it is open both depend on the
  // state of the goal it serves, so the order here is not incidental.
  const goals = readGoals(person, area)
  const byId = new Map(goals.map((goal) => [goal.id, goal]))
  // Capped oldest-first, so a hand-edited store renders three rather than throwing,
  // and a fourth never displaces one already there.
  const activeGoals = goals.filter((goal) => goal.state === 'active').slice(0, MAX_GOALS)

  const priorityId = person.current(priorityKey(area))?.value
  const priority = activeGoals.find((goal) => goal.id === priorityId)

  const hasLegacy = byId.get(LEGACY_GID) !== undefined
  // What the retired pointer named, if this store still has one. Read once rather
  // than per entry, and never written.
  const legacyPinned = person.current(legacyActiveKey(area))?.value

  // The ids come out of the keys, since that is where they live.
  const ids: string[] = []
  const seen = new Set<string>()
  for (const fact of person.facts) {
    const match = STEP_KEY.exec(fact.key)
    if (!match || match[1] !== area || match[3] !== 'text') continue
    if (seen.has(match[2])) continue
    seen.add(match[2])
    ids.push(match[2])
  }

  const steps: Step[] = []
  for (const id of ids) {
    const text = person.current(textKey(area, id))
    const written = person.history(textKey(area, id))[0]
    // Both exist by construction; guarding keeps a hand-edited store from
    // throwing rather than degrading, which is the rule everywhere else too.
    if (!text || !written) continue
    // An entry with no stored link belongs to the legacy goal, when the area has
    // one. That is not a guess: before goals had ids an area held exactly one, so
    // the link was implied by the key shape rather than written down. It is never
    // guessed between several newer goals — with no legacy goal it stays unlinked,
    // and so does a link naming a goal that is not there.
    const stored = person.current(stepGoalKey(area, id))?.value
    const linked = Boolean(stored && byId.has(stored))
    // An explicit pin wins, in either direction — which is what lets a legacy
    // pointer be unpinned without a special case. Only when nothing was ever said
    // about this entry does the old pointer speak for it.
    const said = person.current(pinnedKey(area, id))?.value
    steps.push({
      id,
      text: text.value,
      state: toState(person.current(stateKey(area, id))?.value),
      createdAt: written.learnedAt,
      goalId: linked ? stored : hasLegacy ? LEGACY_GID : undefined,
      linked,
      pinned: said ? said === 'yes' : legacyPinned === id,
    })
  }
  steps.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))

  // Two rules composed. An entry leaves the open set when it is finished or set
  // aside, **or** when the goal it serves is — which is the cascade, done as a
  // derivation: closing a goal is one write, nothing is destroyed, and
  // `/data/stored/` can still show what was being tried.
  const open = steps.filter(
    (step) =>
      step.state === 'open' &&
      (step.goalId === undefined || byId.get(step.goalId)?.state === 'active'),
  )

  return {
    area,
    review: toReview(person.current(reviewKey(area))?.value),
    pinned: person.current(areaPinnedKey(area))?.value === 'yes',
    goals,
    activeGoals,
    priority,
    steps,
    open,
  }
}

export type StepDetail = Step & {
  /** Earlier wordings, newest first. */
  previous: string[]
  /** When the state last changed, if it ever did. */
  stateAt: string | undefined
}

export type GoalDetail = Goal & {
  /** Earlier wordings, newest first. */
  previous: string[]
  /** When the state last changed, if it ever did. */
  stateAt: string | undefined
  /** When it was last rated, if it ever was. */
  progressAt: string | undefined
  /** Whether this is the one put first. */
  priority: boolean
}

export type AreaDetail = {
  area: AreaId
  /** Starred on `/areas/`. A preference, so it carries no date — like the priority goal. */
  pinned: boolean
  /**
   * The emoji they chose, or `undefined` if they never chose one.
   *
   * Deliberately **not** `readAreaIcon`'s answer, which is never undefined. This page
   * reports what is stored, and "we are showing you the default" is not something the
   * person did. The heading beside it draws the icon either way.
   */
  icon: string | undefined
  /** Newest first. */
  reviews: { value: Review; at: string }[]
  /** Newest first, so the current goal comes before the ones it replaced. */
  goals: GoalDetail[]
  steps: StepDetail[]
  /** Whether this area holds anything at all. */
  any: boolean
}

/**
 * Everything stored about an area, with the history and the dates — for `/you`.
 *
 * `/you` has to be able to show every fact, and every id has to resolve to words
 * the person recognises. That resolution belongs here, next to the keys, rather
 * than in a component reaching into the key format itself.
 */
export function readAreaDetail(person: Person, area: AreaId): AreaDetail {
  const state = readArea(person, area)

  const reviews: AreaDetail['reviews'] = []
  for (const fact of person.history(reviewKey(area))) {
    const value = toReview(fact.value)
    if (value) reviews.unshift({ value, at: fact.learnedAt })
  }

  // Newest first, so the current goal comes before the ones it replaced.
  const goals: GoalDetail[] = state.goals
    .map((goal) => {
      const wordings = person.history(goalTextKey(area, goal.id))
      return {
        ...goal,
        previous: wordings.slice(0, -1).map((fact) => fact.value).reverse(),
        stateAt: person.current(goalStateKey(area, goal.id))?.learnedAt,
        progressAt: person.current(goalProgressKey(area, goal.id))?.learnedAt,
        priority: state.priority?.id === goal.id,
      }
    })
    .reverse()

  const steps: StepDetail[] = state.steps.map((step) => {
    const wordings = person.history(textKey(area, step.id))
    return {
      ...step,
      previous: wordings.slice(0, -1).map((fact) => fact.value).reverse(),
      stateAt: person.current(stateKey(area, step.id))?.learnedAt,
    }
  })

  // Read straight from the key rather than through `readAreaIcon`, which answers with the
  // default when nothing is stored — the opposite of what this page needs to know.
  const storedIcon = person.current(iconKey(area))?.value
  const icon = isAreaIcon(area, storedIcon) ? storedIcon : undefined

  return {
    area,
    pinned: state.pinned,
    icon,
    reviews,
    goals,
    steps,
    // A star counts, and so does a chosen icon. `/data/stored/` promises to show everything
    // the app holds, and an area whose only fact is one of those two would otherwise be
    // held and never shown. **Two features running have hit exactly this**, which makes it
    // the first thing to check when a life-area fact is added, not the last.
    any:
      reviews.length > 0 ||
      goals.length > 0 ||
      steps.length > 0 ||
      state.pinned ||
      icon !== undefined,
  }
}

/**
 * Is the introduction over?
 *
 * Two callers rely on it and have to agree: `app/page.tsx` decides whether to show
 * the introduction or the home screen, and `components/page-shell.tsx` decides
 * whether the navigation exists yet. A nav appearing mid-introduction offers pages
 * that are empty until it is finished.
 *
 * Not to be confused with where an interrupted pass *resumes*, which is the first
 * area holding no review answer at all — see `app/page.tsx`. That one moves forward
 * as answers arrive; this one, once true, stays true.
 *
 * ### Why this is a fact and no longer only a derivation
 *
 * It used to be `areas.every(a => readArea(a).review)` — monotonic, but only by the
 * accident that a review answer is never taken away. It was monotonic *in the
 * answers* and not in the **question set**, so adding a life area made this false
 * for every store that already existed. Not "showed one more screen": the start page
 * stopped showing what someone was working on, and `page-shell.tsx` withdrew the
 * navigation from every page — including `/data/`, the one that explains what is
 * stored and offers to delete it. It also self-heals after a single answer, so it
 * would have looked like a cosmetic glitch rather than what it was.
 *
 * So completion is recorded. The fallback covers stores written before it was, and
 * `LEGACY_AREAS` must never grow — see the note there.
 *
 * One consequence worth knowing rather than discovering: a *fresh* visitor who
 * deep-links past the introduction and answers exactly the legacy areas also
 * satisfies the fallback. It cannot be told apart from an upgraded store from the
 * facts alone, and the outcome is the same one upgrading produces — the newer area
 * waits on `/areas/` as "no goal yet" — so it is accepted rather than guarded
 * against with a stored format marker.
 */
export function introductionFinished(person: Person): boolean {
  if (person.current(INTRODUCTION_DONE)) return true
  // The review fact directly, not through `readArea` — which now derives every goal,
  // entry and pointer in an area to answer a question about one key, from two call
  // sites, on every render.
  return LEGACY_AREAS.every((area) => Boolean(toReview(person.current(reviewKey(area))?.value)))
}

/**
 * Records that the introduction was carried to its end.
 *
 * A token, not an utterance: `/data/stored/` renders it as a sentence and must never
 * print the value. Written once, at the one transition that closes the introduction
 * — appending a second would be harmless under append-only but would show up as a
 * duplicate entry on the page whose job is to be readable.
 */
export function finishIntroduction(person: Person): void {
  if (person.current(INTRODUCTION_DONE)) return
  remember(INTRODUCTION_DONE, 'yes', SOURCE)
}

export function setReview(area: AreaId, review: Review): void {
  remember(reviewKey(area), review, SOURCE)
}

/**
 * The emoji this area is drawn with, everywhere it is drawn.
 *
 * Falls back to the default on anything it does not recognise, which covers a store
 * written before an emoji was taken out of the list as well as a hand-edited one. That is
 * the same rule `toReview` and `toState` follow: an unreadable value reads as "nothing was
 * said", never as a reason to break the page.
 */
export function readAreaIcon(person: Person, area: AreaId): string {
  const stored = person.current(iconKey(area))?.value
  return isAreaIcon(area, stored) ? stored : defaultAreaIcon(area)
}

/**
 * Choosing an icon. **Saying the same thing twice writes nothing.**
 *
 * The guard is here rather than at the call site, for the reason `setGoalProgress` gives:
 * a second caller would otherwise have to remember it, and the two would drift. It matters
 * more here than it looks — the picker shows the current choice among the options, so
 * tapping the one already chosen is a perfectly ordinary way to close the panel, and
 * without this every such tap would leave a fact behind on the page that promises to show
 * every fact.
 *
 * The validity check is a second guard on the same write. The picker can only ever send
 * one of this area's own emoji, so it should be unreachable — which is exactly why it is
 * cheap to keep: the one function that can put an emoji on the device refuses to store
 * something the renderer would then refuse to read.
 */
export function setAreaIcon(person: Person, area: AreaId, icon: string): void {
  if (!isAreaIcon(area, icon)) return
  if (readAreaIcon(person, area) === icon) return
  remember(iconKey(area), icon, SOURCE)
}

/** Returns the new goal's id, because the caller usually wants to act on it. */
export function addGoal(area: AreaId, text: string): string {
  const id = newId()
  remember(goalTextKey(area, id), text, SOURCE)
  return id
}

/** Appends new wording. The previous wording stays in history. */
export function editGoal(area: AreaId, goal: string, text: string): void {
  remember(goalTextKey(area, goal), text, SOURCE)
}


/**
 * Reached. One write: its entries leave the open set by derivation rather than by a
 * cascade, and nothing is destroyed — `/data/stored/` can still show what was tried.
 */
export function completeGoal(area: AreaId, goal: string): void {
  remember(goalStateKey(area, goal), 'done', SOURCE)
}

/** No longer a goal for this person. Set aside, not deleted — append-only has no delete. */
export function retireGoal(area: AreaId, goal: string): void {
  remember(goalStateKey(area, goal), 'retired', SOURCE)
}

/**
 * The goal this area is about right now.
 *
 * The same pointer trick as `step_active`: it resolves only while its target is still
 * active, so completing the priority goal clears the slot with no write at all, and
 * there is no sentinel for "nothing is first".
 */
export function prioritiseGoal(area: AreaId, goal: string): void {
  remember(priorityKey(area), goal, SOURCE)
}

/**
 * Returns the new step's id, because the caller usually wants to make it active.
 *
 * `goalId` is optional only for the transitional period: while `setGoal` writes
 * legacy goals, an unlinked entry is attributed to the legacy goal by `readArea` and
 * means the same thing. The multi-goal UI always passes one.
 */
export function addStep(area: AreaId, text: string, goalId?: string): string {
  const id = newId()
  remember(textKey(area, id), text, SOURCE)
  if (goalId) remember(stepGoalKey(area, id), goalId, SOURCE)
  return id
}

/** Moves an entry to another goal, keeping its wording history and its id. */
export function attachStep(area: AreaId, step: string, goalId: string): void {
  remember(stepGoalKey(area, step), goalId, SOURCE)
}

/** Appends new wording. The previous wording stays in history. */
export function editStep(area: AreaId, step: string, text: string): void {
  remember(textKey(area, step), text, SOURCE)
}

/**
  * Keep an entry in view on the start page.
  *
  * Optional, never asked for during the introduction, and **not a ranking** — any
  * number of entries can be pinned. It is deliberately a per-entry fact rather than
  * a pointer: a pointer can name one thing, which is the limitation it replaced.
  *
  * Separate from `goal_priority`, which orders *goals*. This is about what you want
  * to see, not about what matters most.
  */
export function pinStep(area: AreaId, step: string): void {
  remember(pinnedKey(area, step), 'yes', SOURCE)
}

/** Explicitly not pinned — which is also how a legacy pointer is taken back. */
export function unpinStep(area: AreaId, step: string): void {
  remember(pinnedKey(area, step), 'no', SOURCE)
}

/** Starred, so the start page's list of goals leads with it. */
export function pinGoal(area: AreaId, goal: string): void {
  remember(goalPinnedKey(area, goal), 'yes', SOURCE)
}

export function unpinGoal(area: AreaId, goal: string): void {
  remember(goalPinnedKey(area, goal), 'no', SOURCE)
}

/**
 * How close this feels, in the person's own judgement.
 *
 * **Saying the same thing twice writes nothing.** `2 → 3 → 3 → 4` stores `2 → 3 → 4`. The
 * guard is here rather than at the call sites because there are two of them — the area page
 * and the start page — and a rule enforced in one place drifts out of the other. Taking
 * `person` in order to read before writing is the same shape `finishIntroduction` uses.
 *
 * What that costs, stated so it is not rediscovered: the log now records **changes**, not
 * check-ins. "When did they last confirm this was still a 3" has no answer. That is the
 * right trade for a history a person reads — a column of identical entries is noise — but a
 * future periodic check-in wants the opposite, and it should get its own key rather than
 * loosen this one. `docs/goals-and-areas.md` already sketches that key.
 *
 * Reaching 5 does **not** close the goal from in here. The caller writes this and then calls
 * `completeGoal`, because the confirmation that precedes it is a UI concern and burying a
 * second write in this one would make an innocuous-looking call close a goal.
 */
export function setGoalProgress(
  person: Person,
  area: AreaId,
  goal: string,
  progress: Progress,
): void {
  if (person.current(goalProgressKey(area, goal))?.value === String(progress)) return
  remember(goalProgressKey(area, goal), String(progress), SOURCE)
}

/**
 * Keep a life area at the top of `/areas/`.
 *
 * The third thing in this app that can be starred, after entries and goals, and it means
 * the same thing as the other two: *this is what I want to see first*. Any number may be
 * set — it is not a ranking, and there is deliberately no "the area I am focused on".
 *
 * It changes nothing but the order of one list. No area behaves differently for being
 * starred, nothing is asked more often, and nothing else in the app reads it.
 */
export function pinArea(area: AreaId): void {
  remember(areaPinnedKey(area), 'yes', SOURCE)
}

export function unpinArea(area: AreaId): void {
  remember(areaPinnedKey(area), 'no', SOURCE)
}

export function completeStep(area: AreaId, step: string): void {
  remember(stateKey(area, step), 'done', SOURCE)
}

/** Out of current consideration, not deleted — append-only has no delete. */
export function retireStep(area: AreaId, step: string): void {
  remember(stateKey(area, step), 'retired', SOURCE)
}
