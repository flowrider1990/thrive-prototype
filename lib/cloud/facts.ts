'use client'

import type { PersonFact } from '@/lib/person/schema'
import { getSupabase } from '@/lib/supabase/client'
import { classify, type Result } from './failure'

/**
 * The account's copy of the facts: reading it, adding to it, and emptying it.
 *
 * One table, `person_facts`, whose columns are `PersonFact` one-to-one — which was the
 * point of that shape. **The client's own id is the primary key**, so the same fact
 * inserted twice is a conflict rather than a duplicate, and every push is therefore safe
 * to repeat: a retry after a timeout that actually succeeded writes nothing new.
 *
 * `user_id` is never sent. The column defaults to `auth.uid()` from the verified token
 * and the insert policy rejects any other value, so ownership is something the database
 * decides rather than something the browser claims.
 *
 * **Every row belongs to a generation** (`./generations.ts`), and every function here
 * takes one rather than defaulting to "the current one". That is deliberate: which
 * generation a read or a write belongs to is a decision, and a default would let it be
 * made accidentally — which is precisely how a superseded dataset gets read as though it
 * were live.
 */

const TABLE = 'person_facts'

/** PostgREST's own ceiling is 1000 rows; asking for pages of that size keeps it honest. */
const PAGE = 1000

/** Big enough that an ordinary history is one request, small enough to stay well inside limits. */
const BATCH = 500

type Row = {
  id: string
  key: string
  value: string
  source: string
  learned_at: string
  generation: string
}

const toFact = (row: Row): PersonFact => ({
  id: row.id,
  key: row.key,
  value: row.value,
  source: row.source,
  learnedAt: row.learned_at,
})

const toRow = (fact: PersonFact, generation: string): Row => ({
  id: fact.id,
  key: fact.key,
  value: fact.value,
  source: fact.source,
  learned_at: fact.learnedAt,
  generation,
})

const failed = (error: unknown): Result<never> => ({ ok: false, reason: classify(error) })

/**
 * Everything in the account, oldest first.
 *
 * Every row, not a window: the app derives current state by taking the newest fact per
 * key, and it cannot do that correctly from a subset. Histories here are tens to
 * hundreds of rows, so this is one request in practice; the paging exists so that
 * stops being true quietly rather than by silently truncating at a thousand.
 */
export async function fetchFacts(generation: string): Promise<Result<PersonFact[]>> {
  const supabase = getSupabase()
  const facts: PersonFact[] = []
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('id, key, value, source, learned_at')
        // The active set, and nothing else. Rows from a superseded generation are still
        // in the table until housekeeping removes them, and reading them would undo the
        // entire point of having generations.
        .eq('generation', generation)
        .order('learned_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1)
      if (error) return failed(error)
      const rows = (data ?? []) as Row[]
      facts.push(...rows.map(toFact))
      if (rows.length < PAGE) break
    }
    return { ok: true, value: facts }
  } catch (error) {
    return failed(error)
  }
}

/**
 * Add these to the account's current generation, ignoring any it already has.
 *
 * `ignoreDuplicates` is `on conflict do nothing`, which is what makes every push safe to
 * retry — and it is deliberately *not* an update: the table grants no `UPDATE` to anyone
 * and has no update policy, because a correction in this product is a newer fact rather
 * than an edited one, and because that absence is what makes a superseded generation
 * unrevivable.
 */
export async function pushFacts(
  facts: readonly PersonFact[],
  generation: string,
): Promise<Result<null>> {
  if (facts.length === 0) return { ok: true, value: null }
  const supabase = getSupabase()
  try {
    for (let i = 0; i < facts.length; i += BATCH) {
      const { error } = await supabase.from(TABLE).upsert(
        facts.slice(i, i + BATCH).map((fact) => toRow(fact, generation)),
        // The primary key is `(id, generation)`, so idempotency is per generation: the
        // same fact pushed twice into the same generation is a conflict and does nothing,
        // while the same fact written into a *new* generation is a new row — which is
        // what lets a replace stage the winning dataset before clearing the old one.
        { onConflict: 'id,generation', ignoreDuplicates: true },
      )
      if (error) return failed(error)
    }
    return { ok: true, value: null }
  } catch (error) {
    return failed(error)
  }
}
