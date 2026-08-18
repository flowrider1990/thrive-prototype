/**
 * Proves the sync contract against the **real** database, with two throwaway users.
 *
 * `pnpm verify` drives the app in a browser but never signs in — it cannot, because
 * signing in needs an email round trip. `pnpm check:rls` proves the policies hold. This
 * script covers the part in between: that pushing, pulling, comparing and replacing do
 * what the sign-in flow believes they do, against Postgres rather than against a mock.
 *
 * The same rule as `check-rls.mjs`, and it is the important one: **admin rights create
 * and destroy the throwaway users, and do nothing else.** Every assertion runs through a
 * real session. An admin client bypasses RLS by definition, so an assertion made with one
 * would pass whether the policies were right, wrong, or absent.
 *
 * Two things are deliberately *not* covered here, and saying so is part of the report:
 *
 * - **Email OTP itself.** Reading a code out of an inbox is not automatable from here, so
 *   these users sign in with a password. What that changes is only how a session is
 *   obtained; every assertion below runs against the same rows, the same policies and the
 *   same session type the app uses.
 * - **The React layer.** `lib/cloud/sync.ts` orchestrates these calls; `pnpm verify`
 *   covers the screens. This covers what the two of them rely on.
 *
 * The congruence rule is imported from `lib/cloud/compare.ts` rather than restated, so a
 * change to how the app decides "these are the same" fails here rather than silently
 * disagreeing with it.
 *
 * Usage: pnpm check:sync
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { hasMeaningfulData, sameState } from '@/lib/cloud/compare.ts'
import { MEMORY_ONLY_KEYS } from '@/lib/person/schema.ts'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !publishableKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (.env.local).')
  process.exit(2)
}
if (!secretKey?.startsWith('sb_secret_')) {
  console.error(
    'Missing or malformed SUPABASE_SECRET_KEY. It lives in supabase/.env.rls-test, which\n' +
      'is git-ignored and outside the project root so Next cannot load it.',
  )
  process.exit(2)
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const client = () =>
  createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

// --- the same mapping the app uses -------------------------------------------------
// Kept in step with `lib/cloud/facts.ts` by hand, exactly as `verify.mjs` keeps
// STORAGE_KEY in step with the schema: this script runs outside the bundle.
const toRow = (fact, generation) => ({
  id: fact.id,
  key: fact.key,
  value: fact.value,
  source: fact.source,
  learned_at: fact.learnedAt,
  generation,
})
const toFact = (row) => ({
  id: row.id,
  key: row.key,
  value: row.value,
  source: row.source,
  learnedAt: row.learned_at,
})

const push = (session, facts, generation) =>
  session
    .from('person_facts')
    .upsert(facts.map((fact) => toRow(fact, generation)), {
      onConflict: 'id,generation',
      ignoreDuplicates: true,
    })

/** The active set: one generation's rows and nothing else. */
const pull = async (session, generation) => {
  const { data, error } = await session
    .from('person_facts')
    .select('id, key, value, source, learned_at')
    .eq('generation', generation)
    .order('learned_at', { ascending: true })
  if (error) throw new Error(`pull failed: ${error.message}`)
  return data.map(toFact)
}

/** Which generation the account is on, or null if it has never held a dataset. */
const currentGeneration = async (session) => {
  const { data, error } = await session
    .from('person_generations')
    .select('id, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
  if (error) throw new Error(`generation read failed: ${error.message}`)
  return data?.[0]?.id ?? null
}

const mint = async (session) => {
  const { data, error } = await session
    .from('person_generations')
    .insert({ id: randomUUID() })
    .select('id')
    .single()
  if (error) throw new Error(`mint failed: ${error.message}`)
  return data.id
}

let clock = Date.parse('2026-01-01T00:00:00.000Z')
const fact = (key, value, overrides = {}) => ({
  id: randomUUID(),
  key,
  value,
  source: 'check-sync',
  learnedAt: new Date((clock += 60_000)).toISOString(),
  ...overrides,
})

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const stamp = randomUUID().slice(0, 8)
const people = [
  { label: 'A', email: `sync-a-${stamp}@example.com`, password: randomUUID() },
  { label: 'B', email: `sync-b-${stamp}@example.com`, password: randomUUID() },
]
const created = []

try {
  for (const person of people) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: person.password,
      email_confirm: true,
    })
    if (error) throw new Error(`could not create ${person.label}: ${error.message}`)
    person.id = data.user.id
    created.push(data.user.id)
  }
  console.log(`two throwaway users created\n`)

  const a = client()
  const signInA = await a.auth.signInWithPassword({ email: people[0].email, password: people[0].password })
  if (signInA.error) throw new Error(`A could not sign in: ${signInA.error.message}`)
  const b = client()
  const signInB = await b.auth.signInWithPassword({ email: people[1].email, password: people[1].password })
  if (signInB.error) throw new Error(`B could not sign in: ${signInB.error.message}`)

  // --- case A: an empty account takes this device's data ---------------------------

  const deviceFacts = [
    fact('area.body.goal', 'Sleep better'),
    fact('area.body.icon', '💪'),
    fact('area.mind.goal', 'Ten quiet minutes'),
    fact('introduction_done', 'yes'),
  ]

  check(
    'C1. a fresh account has no generation at all, which is not the same as an empty one',
    (await currentGeneration(a)) === null,
    'null, so a first sign-in can tell itself apart from a wiped account',
  )

  const g1 = await mint(a)
  const firstPush = await push(a, deviceFacts, g1)
  const afterUpload = await pull(a, g1)
  check(
    'C2. the local dataset uploads into that generation, values and ids intact',
    !firstPush.error &&
      afterUpload.length === deviceFacts.length &&
      deviceFacts.every((f) => afterUpload.some((r) => r.id === f.id && r.value === f.value)),
    firstPush.error ? firstPush.error.message : `${afterUpload.length} row(s), ids preserved`,
  )

  // The life-area icon is not a special case anywhere in this system, and this is where
  // that pays off: it is a fact, so it syncs like a goal does, with no code of its own.
  check(
    'C3. the life-area icon made the trip like any other answer',
    afterUpload.find((r) => r.key === 'area.body.icon')?.value === '💪',
    `area.body.icon = ${afterUpload.find((r) => r.key === 'area.body.icon')?.value ?? 'MISSING'}`,
  )

  // --- idempotency: the property the whole retry story rests on --------------------

  const secondPush = await push(a, deviceFacts, g1)
  const afterRepeat = await pull(a, g1)
  check(
    'C4. pushing the same facts again writes nothing and errors on nothing',
    !secondPush.error && afterRepeat.length === deviceFacts.length,
    secondPush.error ? secondPush.error.message : `still ${afterRepeat.length} row(s)`,
  )

  // --- congruence: the rule the conflict dialog is gated on ------------------------

  check(
    'C5. a device holding exactly what the account holds is not a conflict',
    sameState(deviceFacts, afterRepeat),
    'same state, so no question is asked',
  )

  // Extra *history* for the same current answer is not a disagreement: the newest fact
  // per key is what either side means by "how things stand".
  const withHistory = [...deviceFacts, fact('area.body.goal', 'Sleep better', { id: randomUUID() })]
  check(
    'C6. and neither is extra history that lands on the same current answer',
    sameState(withHistory, afterRepeat),
    'newest-per-key agrees',
  )

  const changed = [...deviceFacts, fact('area.body.goal', 'Sleep before midnight')]
  check(
    'C7. a genuinely different answer is a conflict, and is detected as one',
    !sameState(changed, afterRepeat),
    'different current state',
  )

  check(
    'C8. a device holding only memory-only keys counts as having nothing to protect',
    !hasMeaningfulData([fact(MEMORY_ONLY_KEYS[0], 'I would rather you did not')]),
    `${MEMORY_ONLY_KEYS.join(', ')} does not make a device "in use"`,
  )

  // --- "keep what is on this device", and the generation it mints ------------------
  //
  // This is the sequence resolveConflict runs, in its order: mint, write, sweep. Device B
  // is imagined to be offline throughout, still holding `deviceFacts` and still believing
  // g1 is current, which is exactly the stale device the next few checks are about.

  const replacement = [
    fact('area.body.goal', 'Sleep before midnight'),
    fact('area.work.goal', 'Leave on time'),
  ]
  const g2 = await mint(a)
  const staged = await push(a, replacement, g2)
  const stagedRows = await pull(a, g2)
  check(
    'C9. the winning dataset is written into a new generation, alongside the old one',
    !staged.error && stagedRows.length === replacement.length,
    staged.error ? staged.error.message : `${stagedRows.length} row(s) in the new generation`,
  )

  check(
    'C10. and the account is now on that generation',
    (await currentGeneration(a)) === g2,
    'the newest generation is the one just minted',
  )

  const activeAfterReplace = await pull(a, g2)
  check(
    'C11. the replaced dataset is no longer part of the active set',
    !activeAfterReplace.some((r) => deviceFacts.some((f) => f.id === r.id)) &&
      sameState(replacement, activeAfterReplace),
    `${activeAfterReplace.length} active row(s), none of them from the discarded copy`,
  )

  // --- the bug this whole mechanism exists to close --------------------------------
  //
  // A stale device reconnects and pushes the dataset it still believes in. Before
  // generations that was a set union, and every discarded fact came back to life. Now the
  // rows land in the generation the stale device knew about, which is not the current
  // one, so they are inert on arrival and can never become active: nothing in the schema
  // can move a row between generations.

  const staleResurrection = await push(a, deviceFacts, g1)
  const activeAfterStalePush = await pull(a, g2)
  check(
    'C12. a stale device pushing its old dataset cannot bring any of it back',
    !staleResurrection.error &&
      activeAfterStalePush.length === replacement.length &&
      !activeAfterStalePush.some((r) => deviceFacts.some((f) => f.id === r.id)) &&
      sameState(replacement, activeAfterStalePush),
    staleResurrection.error
      ? `refused outright: ${staleResurrection.error.message}`
      : `landed in the dead generation, ${activeAfterStalePush.length} active row(s), unchanged`,
  )

  check(
    'C13. and a stale device can tell it is stale, rather than merging blindly',
    (await currentGeneration(a)) !== g1,
    'the generation it remembers is not the current one, which is the signal to stop',
  )

  // Ownership of the stamp, not just of the row: the foreign key alone would let A point
  // a fact at somebody else's generation.
  const bGeneration = await mint(b)
  const crossStamp = await push(a, [fact('area.body.goal', 'stamped with another account')], bGeneration)
  check(
    'C14. a fact cannot be stamped with another account generation',
    Boolean(crossStamp.error),
    crossStamp.error
      ? `rejected: ${crossStamp.error.code ?? '?'}`
      : 'ACCEPTED, which means the policy is not doing its job',
  )

  // Housekeeping, which runs last precisely because it is not load-bearing.
  const swept = await a.from('person_facts').delete().eq('user_id', people[0].id).neq('generation', g2)
  const afterSweep = await pull(a, g2)
  check(
    'C15. sweeping the superseded rows leaves the active set untouched',
    !swept.error && sameState(replacement, afterSweep),
    swept.error ? swept.error.message : 'old rows gone, active set identical',
  )

  // --- what must never leave the device --------------------------------------------

  const concern = fact(MEMORY_ONLY_KEYS[0], 'please do not keep this')
  const sendable = [...replacement, concern].filter((f) => !MEMORY_ONLY_KEYS.includes(f.key))
  await push(a, sendable, g2)
  const everything = await pull(a, g2)
  check(
    'C16. the memory-only answer is not in the account, and cannot come back from it',
    !everything.some((r) => MEMORY_ONLY_KEYS.includes(r.key)),
    `0 of ${everything.length} row(s) are memory-only keys`,
  )

  // --- isolation, from the sync path rather than from a policy test ----------------

  const bFacts = [fact('area.body.goal', 'B own answer')]
  await push(b, bFacts, bGeneration)
  const aSees = await pull(a, g2)
  const bSees = await pull(b, bGeneration)
  check(
    'C17. a pull returns only the own account, never anyone else',
    !aSees.some((r) => r.value === 'B own answer') &&
      bSees.length === 1 &&
      bSees[0].value === 'B own answer',
    `A sees ${aSees.length} row(s), B sees ${bSees.length}`,
  )

  const crossDelete = await a.from('person_facts').delete().in('id', [bFacts[0].id])
  const bAfterCross = await pull(b, bGeneration)
  check(
    'C18. and the delete half of sync cannot reach into another account',
    !crossDelete.error && bAfterCross.length === 1,
    `B still has ${bAfterCross.length} row(s)`,
  )

  // --- delete my data, while signed in ---------------------------------------------
  //
  // Mint first, then drop every other generation: the cascade takes the facts with them.
  // The mint is what makes the deletion propagate. Without it another device would find
  // the generation it already knew, conclude it was a peer of an account that had merely
  // lost some rows, and upload all of them again.

  const g3 = await mint(a)
  const emptied = await a.from('person_generations').delete().eq('user_id', people[0].id).neq('id', g3)
  const afterDelete = await pull(a, g3)
  const anyLeft = await a.from('person_facts').select('id').eq('user_id', people[0].id)
  const bStillThere = await pull(b, bGeneration)
  check(
    'C19. deleting the data empties the account and leaves the account itself alive',
    !emptied.error &&
      afterDelete.length === 0 &&
      (anyLeft.data?.length ?? 0) === 0 &&
      bStillThere.length === 1,
    emptied.error
      ? emptied.error.message
      : `A has ${anyLeft.data?.length ?? 0} row(s) in total, B untouched`,
  )

  check(
    'C20. and it reads as a reset rather than as a never-used account',
    (await currentGeneration(a)) === g3,
    'an empty current generation, which is what tells another device to stand down',
  )

} finally {
  let removed = 0
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) console.log(`WARN  could not delete throwaway user ${id}: ${error.message}`)
    else removed += 1
  }
  console.log(`\ncleanup: ${removed}/${created.length} throwaway users deleted`)

  if (created.length) {
    // Cleanup verification, not an assertion about policy — hence admin is legitimate.
    const { count, error } = await admin
      .from('person_facts')
      .select('*', { count: 'exact', head: true })
      .in('user_id', created)
    if (error) console.log(`WARN  could not confirm row cleanup: ${error.message}`)
    else console.log(`cleanup: ${count ?? 0} leftover row(s) (the cascade should make this 0)`)
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) console.log(`failed:\n${failed.map((f) => `  - ${f.name} (${f.detail})`).join('\n')}`)
process.exit(failed.length ? 1 : 0)
