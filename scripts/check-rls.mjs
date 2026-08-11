/**
 * Proves that allowed access works and forbidden access does not, against the
 * real `person_facts` policies.
 *
 * The rule this script exists to respect (CLAUDE.md section 8): **admin rights
 * create and destroy the throwaway users, and do nothing else.** Every assertion
 * runs through a real authenticated session, or through an anonymous client with
 * no session at all. An admin client bypasses RLS by definition, so an assertion
 * made with one would pass whether the policies were correct, wrong, or missing
 * entirely — it would be a test of nothing.
 *
 * Both users are deleted in a `finally`, so a failed assertion still cleans up.
 * `on delete cascade` on `person_facts.user_id` takes their rows with them.
 *
 * Covers the isolation requirements I1–I9 in docs/supabase-migration.md section
 * 8, minus I2: the `person_current` view is not part of this migration, so there
 * is nothing yet to test for a missing `security_invoker`. That check arrives with
 * the view.
 *
 * Usage: pnpm check:rls
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
const secretKey = process.env.SUPABASE_SECRET_KEY

if (!url || !publishableKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (.env.local).')
  process.exit(2)
}
if (!secretKey) {
  console.error(
    'Missing SUPABASE_SECRET_KEY. It lives in supabase/.env.rls-test, which is\n' +
      'git-ignored and outside the project root so Next cannot load it. See\n' +
      'CLAUDE.md section 8, Supabase secret handling.',
  )
  process.exit(2)
}
if (!secretKey.startsWith('sb_secret_')) {
  console.error('SUPABASE_SECRET_KEY does not look like a secret key.')
  process.exit(2)
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/** A client with no session: exactly what an unauthenticated visitor has. */
const anonClient = () =>
  createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

/**
 * Signs a throwaway user in and returns their own client. Each user gets a
 * separate client instance, so the two sessions cannot leak into one another —
 * which is the whole point of an isolation test. `lib/supabase/client.ts` is
 * deliberately not reused here: it is a singleton, and a singleton cannot hold
 * two sessions at once.
 */
async function sessionFor(email, password) {
  const client = anonClient()
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`could not sign in ${email}: ${error.message}`)
  return { client, userId: data.user.id }
}

const fact = (overrides = {}) => ({
  id: randomUUID(),
  key: 'area.body.goal',
  value: 'walk somewhere green',
  source: 'rls-check',
  learned_at: new Date().toISOString(),
  ...overrides,
})

// Admin client. Used for exactly two things: createUser and deleteUser.
const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

const stamp = randomUUID().slice(0, 8)
const people = [
  { label: 'A', email: `rls-a-${stamp}@example.com`, password: randomUUID() },
  { label: 'B', email: `rls-b-${stamp}@example.com`, password: randomUUID() },
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
  const [personA, personB] = people
  console.log(`two throwaway users created: A=${personA.id.slice(0, 8)}… B=${personB.id.slice(0, 8)}…\n`)

  const a = await sessionFor(personA.email, personA.password)
  const b = await sessionFor(personB.email, personB.password)
  check(
    '0. both users hold a real session with their own uid',
    a.userId === personA.id && b.userId === personB.id && a.userId !== b.userId,
    `A=${a.userId.slice(0, 8)}… B=${b.userId.slice(0, 8)}…`,
  )

  // --- allowed access works -------------------------------------------------

  // B goes first so that A always has someone else's row to fail against.
  const bRow = fact({ value: "B's own answer" })
  const bInsert = await b.client.from('person_facts').insert(bRow).select()
  check(
    '1. B can insert a fact for itself',
    !bInsert.error && bInsert.data?.length === 1,
    bInsert.error ? bInsert.error.message : `1 row, user_id filled by the server`,
  )
  check(
    '1b. the server filled user_id from the token, not the client',
    bInsert.data?.[0]?.user_id === b.userId,
    `stored user_id = ${bInsert.data?.[0]?.user_id?.slice(0, 8)}…`,
  )

  const aRow = fact({ value: "A's own answer" })
  const aInsert = await a.client.from('person_facts').insert(aRow).select()
  check(
    '2. A can insert a fact for itself',
    !aInsert.error && aInsert.data?.length === 1,
    aInsert.error ? aInsert.error.message : '1 row',
  )

  const aReadOwn = await a.client.from('person_facts').select('*').eq('id', aRow.id)
  check(
    '3. A can read its own fact back, values intact',
    !aReadOwn.error && aReadOwn.data?.length === 1 && aReadOwn.data[0].value === "A's own answer",
    aReadOwn.error ? aReadOwn.error.message : `value = ${aReadOwn.data?.[0]?.value}`,
  )

  // --- forbidden access does not (I1, I3, I4, I5) ----------------------------

  // I1: no filter at all. The policy, not the query, must do the narrowing.
  const aReadAll = await a.client.from('person_facts').select('*')
  const foreign = (aReadAll.data ?? []).filter((row) => row.user_id !== a.userId)
  check(
    'I1. A selecting with no filter sees only its own rows',
    !aReadAll.error && foreign.length === 0 && (aReadAll.data?.length ?? 0) >= 1,
    aReadAll.error
      ? aReadAll.error.message
      : `${aReadAll.data.length} row(s), ${foreign.length} belonging to anyone else`,
  )
  check(
    "I1b. and B's row is specifically not among them",
    !(aReadAll.data ?? []).some((row) => row.id === bRow.id),
    `B's row id ${bRow.id.slice(0, 8)}… absent from A's result`,
  )

  // I3: the spoof. This is what `with check` is for.
  const spoof = await a.client.from('person_facts').insert(fact({ user_id: b.userId })).select()
  check(
    'I3. A cannot insert a row owned by B',
    Boolean(spoof.error),
    spoof.error ? `rejected: ${spoof.error.code ?? '?'} ${spoof.error.message}` : 'ACCEPTED — spoof succeeded',
  )

  // I4: delete someone else's row by its exact id.
  const crossDelete = await a.client.from('person_facts').delete().eq('id', bRow.id).select()
  check(
    "I4. A deleting B's row by id affects nothing",
    !crossDelete.error && (crossDelete.data?.length ?? 0) === 0,
    crossDelete.error ? `refused: ${crossDelete.error.message}` : `${crossDelete.data.length} row(s) deleted`,
  )

  // I5: the one that would pass code review and fail in reality. There is no
  // UPDATE policy and no UPDATE grant, so this must not work.
  const update = await a.client
    .from('person_facts')
    .update({ value: 'edited, which must be impossible' })
    .eq('id', aRow.id)
    .select()
  const afterUpdate = await a.client.from('person_facts').select('value').eq('id', aRow.id)
  const unchanged = afterUpdate.data?.[0]?.value === "A's own answer"
  check(
    'I5. A cannot update even its own row (append-only)',
    (Boolean(update.error) || (update.data?.length ?? 0) === 0) && unchanged,
    `${update.error ? `refused: ${update.error.code ?? '?'}` : `${update.data?.length ?? 0} row(s)`}; value still ${
      unchanged ? 'intact' : 'CHANGED'
    }`,
  )

  // --- forbidden access with no session at all (I6, I7) ---------------------

  // "Returns no rows" is too weak an assertion here, and the first version of
  // this migration is why. Supabase's default privileges had left `anon` holding
  // SELECT, INSERT, DELETE and TRUNCATE on the table; RLS returned nothing, so a
  // check that accepted an empty result reported PASS while a stranger held six
  // privileges. These now require an outright refusal, and I6b/I7b require that
  // the refusal comes from the privilege layer rather than from RLS alone.
  const deniedByPrivilege = (error) => /permission denied/i.test(error?.message ?? '')

  const anon = anonClient()
  const anonRead = await anon.from('person_facts').select('*')
  check(
    'I6. an unauthenticated client is refused outright',
    Boolean(anonRead.error) && (anonRead.data?.length ?? 0) === 0,
    anonRead.error ? `refused: ${anonRead.error.code ?? '?'} ${anonRead.error.message}` : `${anonRead.data?.length} rows, NO error`,
  )
  check(
    'I6b. and refused by privilege, not merely by RLS',
    deniedByPrivilege(anonRead.error),
    anonRead.error?.message ?? 'no error at all',
  )

  const anonInsert = await anon.from('person_facts').insert(fact()).select()
  check(
    'I7. an unauthenticated client cannot insert',
    Boolean(anonInsert.error),
    anonInsert.error ? `refused: ${anonInsert.error.code ?? '?'} ${anonInsert.error.message}` : 'ACCEPTED',
  )
  check(
    'I7b. and that refusal is also at the privilege level',
    deniedByPrivilege(anonInsert.error),
    anonInsert.error?.message ?? 'no error at all',
  )

  // --- I8: signing out actually revokes the access -------------------------

  await a.client.auth.signOut()
  const afterSignOut = await a.client.from('person_facts').select('*')
  check(
    'I8. after A signs out, the same client reads nothing',
    Boolean(afterSignOut.error) && (afterSignOut.data?.length ?? 0) === 0,
    afterSignOut.error
      ? `refused: ${afterSignOut.error.code ?? '?'} ${afterSignOut.error.message}`
      : `${afterSignOut.data?.length} rows, NO error`,
  )
  check(
    'I8b. the signed-out client is treated exactly like a stranger',
    deniedByPrivilege(afterSignOut.error),
    afterSignOut.error?.message ?? 'no error at all',
  )

  // --- I9: B, asked as B, is untouched by everything above -----------------

  const bFinal = await b.client.from('person_facts').select('*')
  check(
    'I9. B still has exactly its one original row, unmodified',
    !bFinal.error &&
      bFinal.data?.length === 1 &&
      bFinal.data[0].id === bRow.id &&
      bFinal.data[0].value === "B's own answer",
    bFinal.error ? bFinal.error.message : `${bFinal.data.length} row, value = ${bFinal.data[0].value}`,
  )

  // Asked as B rather than as admin on purpose: an admin count would be a
  // statement about the table, not about what B is permitted to see.
} finally {
  // Runs even when an assertion above threw, so a failure never leaves users
  // behind in the project.
  let removed = 0
  for (const id of created) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) console.log(`WARN  could not delete throwaway user ${id}: ${error.message}`)
    else removed += 1
  }
  console.log(`\ncleanup: ${removed}/${created.length} throwaway users deleted`)

  // Cleanup verification, not an RLS assertion — hence admin is legitimate here.
  // The cascade on person_facts.user_id should have taken their rows too.
  if (created.length) {
    const { count, error } = await admin
      .from('person_facts')
      .select('*', { count: 'exact', head: true })
      .in('user_id', created)
    if (error) console.log(`WARN  could not confirm row cleanup: ${error.message}`)
    else console.log(`cleanup: ${count ?? 0} leftover row(s) for those users (cascade should make this 0)`)
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) console.log(`failed:\n${failed.map((f) => `  - ${f.name} (${f.detail})`).join('\n')}`)
process.exit(failed.length ? 1 : 0)
