'use client'

import { newId } from '@/lib/person/store'
import { getSupabase } from '@/lib/supabase/client'
import type { Result } from './account'
import { classify } from './failure'

/**
 * Which dataset the account is currently holding.
 *
 * A generation is a stamp on the dataset as a whole, minted whenever somebody decides
 * that one copy replaces another. Every fact carries the generation it was appended
 * under, and **a fact is active only while its generation is the newest one**.
 *
 * ## The problem it solves
 *
 * Append-only facts with client-generated ids cannot contradict each other, so merging
 * two devices is a set union and needs nobody to arbitrate. That reasoning is sound *and*
 * it quietly assumes the two sides are peers — that neither has been declared wrong.
 * Replace semantics break the assumption: after "keep what is on this device", the other
 * device is holding a dataset that was deliberately discarded, and a union would bring it
 * back the moment that device reconnected. Append-only data has no way to say "this is
 * gone", so the union has no way to know.
 *
 * A generation is how the dataset says it. One stamp for a whole reset, rather than a
 * tombstone per deleted fact — which was the alternative, and is far more machinery for a
 * weaker result.
 *
 * ## Why it is still append-only
 *
 * A row's generation is fixed when it is inserted, and there is no `UPDATE` anywhere in
 * this schema. So a superseded fact cannot be promoted back into the current generation
 * by a stale client, a buggy one, or a race — not because something forbids it, but
 * because there is no operation that would do it. The guarantee is structural.
 *
 * See `supabase/migrations/20260818200000_generations.sql` for the schema half.
 */

const TABLE = 'person_generations'

export type Generation = {
  id: string
  createdAt: string
}

const failed = (error: unknown): Result<never> => ({ ok: false, reason: classify(error) })

/**
 * The generation in force, or `null` for an account that has never held a dataset.
 *
 * `null` and "a generation holding no facts" are **different states**, and keeping them
 * apart is what makes deletion propagate correctly: emptying an account leaves a fresh
 * empty generation behind, so another device can tell "your copy is superseded" from
 * "there has never been anything here". Collapsing the two would make a delete look like
 * a first sign-in, and the other device would helpfully upload everything again.
 */
export async function currentGeneration(): Promise<Result<Generation | null>> {
  try {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .select('id, created_at')
      // The server's clock decides, with the id as a deterministic tie-break. Which
      // generation is current is the one question two devices must never disagree about,
      // and a device clock is exactly the wrong thing to settle it with.
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
    if (error) return failed(error)
    const row = data?.[0]
    return { ok: true, value: row ? { id: row.id, createdAt: row.created_at } : null }
  } catch (error) {
    return failed(error)
  }
}

/**
 * Declare a new dataset generation, effective immediately.
 *
 * Called from exactly two places, both of which are somebody deciding that what exists
 * is replaced: resolving a conflict in favour of this device, and emptying the account.
 * Nothing automatic mints one — a generation that appeared on its own would orphan every
 * other device for no reason anybody chose.
 *
 * `user_id` is not sent. The column defaults to `auth.uid()` and the insert policy
 * rejects any other value, so a generation belongs to whoever the token says it does.
 */
export async function mintGeneration(): Promise<Result<Generation>> {
  try {
    const { data, error } = await getSupabase()
      .from(TABLE)
      .insert({ id: newId() })
      .select('id, created_at')
      .single()
    if (error) return failed(error)
    return { ok: true, value: { id: data.id, createdAt: data.created_at } }
  } catch (error) {
    return failed(error)
  }
}

/**
 * Clear away everything that is no longer active.
 *
 * Deliberately last in every sequence that uses it, and deliberately allowed to fail
 * without failing the operation around it: superseded rows are already invisible, so
 * this is housekeeping rather than correctness. Leaving them behind costs storage and
 * nothing else, and a failed cleanup that rolled back a successful replace would be the
 * tail wagging the dog.
 */
export async function deleteSupersededFacts(
  userId: string,
  current: string,
): Promise<Result<null>> {
  try {
    const { error } = await getSupabase()
      .from('person_facts')
      .delete()
      .eq('user_id', userId)
      .neq('generation', current)
    if (error) return failed(error)
    return { ok: true, value: null }
  } catch (error) {
    return failed(error)
  }
}

/**
 * Remove every generation except this one, and with them — by `on delete cascade` — every
 * fact they held.
 *
 * This is how "delete my data" empties an account: mint a fresh generation, then drop all
 * the others. The cascade is why it is one request rather than a sweep of the facts table
 * followed by a sweep of this one, and why it cannot half-succeed into a state where
 * facts exist with no generation to belong to.
 *
 * It also leaves **no record of how many times the dataset was reset**. Those timestamps
 * are nobody's business but the person's, and "delete my data" that leaves a tidy audit
 * log of your deletions behind is not the promise this app makes.
 */
export async function deleteOtherGenerations(userId: string, keep: string): Promise<Result<null>> {
  try {
    const { error } = await getSupabase()
      .from(TABLE)
      .delete()
      .eq('user_id', userId)
      .neq('id', keep)
    if (error) return failed(error)
    return { ok: true, value: null }
  } catch (error) {
    return failed(error)
  }
}
