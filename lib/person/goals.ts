'use client'

import type { AreaId } from '@/lib/areas'
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

/** Three at a time, counting the active one. Enough to choose from, not a list. */
export const MAX_OPEN_STEPS = 3

export type Review = 'yes' | 'not_now'

export type StepState = 'open' | 'done' | 'retired'

export type Step = {
  id: string
  text: string
  state: StepState
  createdAt: string
}

export type AreaState = {
  area: AreaId
  /** `undefined` means the area has never been asked about. */
  review: Review | undefined
  goal: string | undefined
  /** Every step ever written down for this area, oldest first. */
  steps: Step[]
  /** Those still under consideration — at most `MAX_OPEN_STEPS`. */
  open: Step[]
  /** The one being worked on, if there is one. */
  active: Step | undefined
}

const reviewKey = (area: AreaId) => `area.${area}.review`
const goalKey = (area: AreaId) => `area.${area}.goal`
const activeKey = (area: AreaId) => `area.${area}.step_active`
const textKey = (area: AreaId, step: string) => `area.${area}.step.${step}.text`
const stateKey = (area: AreaId, step: string) => `area.${area}.step.${step}.state`

/** `area.<a>.step.<sid>.<field>` — ids are UUIDs, so they contain no dots. */
const STEP_KEY = /^area\.([^.]+)\.step\.([^.]+)\.(text|state)$/

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

export function readArea(person: Person, area: AreaId): AreaState {
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
    steps.push({
      id,
      text: text.value,
      state: toState(person.current(stateKey(area, id))?.value),
      createdAt: written.learnedAt,
    })
  }
  steps.sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  const open = steps.filter((step) => step.state === 'open')

  // The pointer resolves only while its target is still open, which is what
  // makes completing a step clear the active slot without a second write — and
  // what lets "Later" write nothing at all.
  const activeId = person.current(activeKey(area))?.value
  const active = open.find((step) => step.id === activeId)

  return {
    area,
    review: toReview(person.current(reviewKey(area))?.value),
    goal: person.current(goalKey(area))?.value,
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

export type AreaDetail = {
  area: AreaId
  /** Newest first. */
  reviews: { value: Review; at: string }[]
  /** Newest first, so the current goal comes before the ones it replaced. */
  goals: { value: string; at: string }[]
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

  const goals: AreaDetail['goals'] = []
  for (const fact of person.history(goalKey(area))) {
    goals.unshift({ value: fact.value, at: fact.learnedAt })
  }

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
  return Boolean(state.goal && state.active)
}

/**
 * Which goal was current when something happened, by timestamp.
 *
 * A convenience over one device's local history, **not** a cross-device ordering
 * guarantee: `learnedAt` is a wall clock on whichever machine wrote the fact, so
 * skewed clocks could interleave misleadingly. If sync ever arrives, that is the
 * moment to decide whether a step needs explicit goal context of its own — see
 * `docs/goals-and-areas.md`. Unused by the UI today.
 */
export function goalAt(person: Person, area: AreaId, when: string): string | undefined {
  let found: string | undefined
  let foundAt = ''
  for (const fact of person.history(goalKey(area))) {
    if (fact.learnedAt > when) continue
    if (!found || fact.learnedAt >= foundAt) {
      found = fact.value
      foundAt = fact.learnedAt
    }
  }
  return found
}

export function setReview(area: AreaId, review: Review): void {
  remember(reviewKey(area), review, SOURCE)
}

export function setGoal(area: AreaId, goal: string): void {
  remember(goalKey(area), goal, SOURCE)
}

/** Returns the new step's id, because the caller usually wants to make it active. */
export function addStep(area: AreaId, text: string): string {
  const id = newId()
  remember(textKey(area, id), text, SOURCE)
  return id
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
