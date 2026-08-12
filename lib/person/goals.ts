'use client'

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
 * area.<a>.step_active         <sid>
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

export type Goal = {
  /** A UUID, or `LEGACY_GID` for a goal written before goals had ids. */
  id: string
  text: string
  /** Why it matters, in the person's own words. Empty reads as absent. */
  why: string | undefined
  state: GoalState
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
}

export type AreaState = {
  area: AreaId
  /** `undefined` means the area has never been asked about. */
  review: Review | undefined
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
  /** The one being worked on, if there is one. */
  active: Step | undefined
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
const activeKey = (area: AreaId) => `area.${area}.step_active`
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
const STEP_KEY = /^area\.([^.]+)\.step\.([^.]+)\.(text|state|goal)$/

/**
 * `area.<a>.goal.<gid>.<field>`.
 *
 * Cannot match the legacy `area.<a>.goal` (too few segments) or
 * `area.<a>.goal_priority` (`goal_priority` is not `goal`), so all three coexist
 * without ambiguity. That is what makes the migration a read rather than a rewrite.
 */
const GOAL_KEY = /^area\.([^.]+)\.goal\.([^.]+)\.(text|why|state)$/

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
    steps.push({
      id,
      text: text.value,
      state: toState(person.current(stateKey(area, id))?.value),
      createdAt: written.learnedAt,
      goalId: linked ? stored : hasLegacy ? LEGACY_GID : undefined,
      linked,
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

  // The pointer resolves only while its target is still open, which is what
  // makes completing a step clear the active slot without a second write — and
  // what lets "Later" write nothing at all.
  const activeId = person.current(activeKey(area))?.value
  const active = open.find((step) => step.id === activeId)

  return {
    area,
    review: toReview(person.current(reviewKey(area))?.value),
    goals,
    activeGoals,
    priority,
    steps,
    open,
    active,
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
  /** Whether this is the one put first. */
  priority: boolean
}

export type AreaDetail = {
  area: AreaId
  /** Newest first. */
  reviews: { value: Review; at: string }[]
  /** Newest first, so the current goal comes before the ones it replaced. */
  goals: GoalDetail[]
  steps: StepDetail[]
  activeId: string | undefined
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

  return {
    area,
    reviews,
    goals,
    steps,
    activeId: state.active?.id,
    any: reviews.length > 0 || goals.length > 0 || steps.length > 0,
  }
}

/**
 * Has this area been carried through to a resting point?
 *
 * Used to resume the introduction in the right place after a reload. Note that it
 * is **not** monotonic — completing a step and choosing "Later" makes an area
 * unsettled again, which is a perfectly good state to be in — so it must never be
 * what decides whether the introduction is over. The count of areas with a review
 * fact does that, because a review fact is never taken away.
 */
export function isSettled(state: AreaState): boolean {
  if (!state.review) return false
  if (state.review === 'not_now') return true
  return state.activeGoals.length > 0 && Boolean(state.active)
}

/**
 * Is the introduction over?
 *
 * Two callers rely on it and have to agree: `app/page.tsx` decides whether to show
 * the introduction or the home screen, and `components/page-shell.tsx` decides
 * whether the navigation exists yet. A nav appearing mid-introduction offers pages
 * that are empty until it is finished.
 *
 * `isSettled()` looks like it would do the job and must not be used for it:
 * completing something and choosing "Later" un-settles an area, which would drop a
 * person back into onboarding months later.
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
 * Why this goal matters, in the person's own words.
 *
 * An empty string is how one is cleared: an append-only log has no delete, so taking
 * something back means saying nothing, and `readGoals` reads nothing as absent. The
 * earlier wording stays in history, exactly as rewording already behaves.
 */
export function setGoalWhy(area: AreaId, goal: string, why: string): void {
  remember(goalWhyKey(area, goal), why, SOURCE)
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

export function chooseStep(area: AreaId, step: string): void {
  remember(activeKey(area), step, SOURCE)
}

export function completeStep(area: AreaId, step: string): void {
  remember(stateKey(area, step), 'done', SOURCE)
}

/** Out of current consideration, not deleted — append-only has no delete. */
export function retireStep(area: AreaId, step: string): void {
  remember(stateKey(area, step), 'retired', SOURCE)
}
