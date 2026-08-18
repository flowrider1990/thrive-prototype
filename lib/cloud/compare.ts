import { MEMORY_ONLY_KEYS, type PersonFact } from '@/lib/person/schema'

/**
 * Are these two sets of facts the same answer to the question "what does this person's
 * app look like right now"?
 *
 * This is the whole of conflict *detection*, and getting it wrong in either direction is
 * a product failure rather than a bug: too eager and everyone is asked to arbitrate a
 * difference that is not one; too lax and somebody's data is quietly replaced.
 *
 * So the comparison is of **derived current state**, never of the rows:
 *
 * - **The newest fact per key wins**, exactly as `store.ts` derives it, so a device that
 *   holds more of the history than the other still matches when the two agree about how
 *   things stand now. Facts are append-only; extra history is extra evidence for the
 *   same conclusion, not a disagreement.
 * - **Ids, `learnedAt`, `source` and row order are ignored.** Two devices that recorded
 *   the same words at different moments are not in conflict, and asking somebody to pick
 *   between them because one has a later timestamp would be asking about the plumbing.
 * - **Memory-only keys are excluded**, because they are never uploaded. Counting one
 *   would guarantee a permanent, unresolvable difference.
 *
 * Life-area icons need no special case here, and that is the point of them being facts:
 * `area.body.icon` is compared exactly as a goal's wording is. Nothing has to remember
 * to include them, which is why they cannot be forgotten.
 */

/** The one rule for "which fact speaks for this key", shared with `store.ts`. */
function beats(a: PersonFact, b: PersonFact): boolean {
  return a.learnedAt > b.learnedAt || (a.learnedAt === b.learnedAt && a.id > b.id)
}

/**
 * Key → the value in force, for everything that may leave the device.
 *
 * Exported because the conflict dialog counts what it is asking about, and counting rows
 * would overstate it: "42 entries here, 3 there" is not a fair description of two
 * datasets that differ by one goal.
 */
export function currentState(facts: readonly PersonFact[]): Map<string, string> {
  const newest = new Map<string, PersonFact>()
  for (const fact of facts) {
    if (MEMORY_ONLY_KEYS.includes(fact.key)) continue
    const held = newest.get(fact.key)
    if (!held || beats(fact, held)) newest.set(fact.key, fact)
  }
  return new Map([...newest].map(([key, fact]) => [key, fact.value]))
}

/**
 * A stable string for one state, so comparing is comparing and not a nested walk.
 *
 * The two separators are control characters, written as escapes rather than typed
 * literally — a raw NUL in a source file makes Git treat it as binary, which costs every
 * future diff of this module for no gain.
 *
 * They have to be characters a person cannot write. A value here is somebody's own words
 * and may contain anything printable, so a comma or a space as the separator would let
 * two different states produce the same fingerprint — and a false "these are the same"
 * is the one answer this function must never give: it would skip the conflict dialog and
 * silently merge two datasets that disagree.
 */
function fingerprint(state: Map<string, string>): string {
  return [...state]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}\u0000${value}`)
    .join('\u0001')
}

/** Whether the two describe the same app. */
export function sameState(a: readonly PersonFact[], b: readonly PersonFact[]): boolean {
  return fingerprint(currentState(a)) === fingerprint(currentState(b))
}

/**
 * Is there anything here worth protecting?
 *
 * "Meaningful" is the word the brief uses, and it means: something the person put there.
 * A store holding only memory-only keys has nothing to upload and nothing to lose, so a
 * sign-in on it is case B — load the account — rather than a conflict.
 */
export function hasMeaningfulData(facts: readonly PersonFact[]): boolean {
  return facts.some((fact) => !MEMORY_ONLY_KEYS.includes(fact.key))
}
