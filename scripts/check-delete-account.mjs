/**
 * End-to-end test of account deletion, against the **deployed** Edge Function, with real
 * accounts created through the real sign-in path and real one-time codes.
 *
 * This is the one part of the system that cannot be proved by reading it. Deleting an
 * account needs a credential no browser may hold, so it lives in the only piece of
 * server-side code this project has (decision D10) — and a function that deletes accounts
 * is the most dangerous thing in the repository by a wide margin. What follows is the
 * evidence that it deletes exactly one, and only for whoever asked.
 *
 * ## What is real here, and what is not
 *
 * **Real:** the accounts, created by the app's own `signInWithOtp` with no separate
 * sign-up step. The one-time codes, issued by the Auth server. The `verifyOtp` exchange,
 * which is the exact call the sign-in dialog makes. The sessions. The deployed function,
 * reached over HTTPS through the same gateway a browser would.
 *
 * **Not covered:** the email *arriving*. Codes are obtained through the admin API rather
 * than by reading an inbox — a machine cannot check somebody's mail. That gap matters
 * more than usual on this project right now, because the stock email template contains a
 * link and no code, and the plan will not let us replace it. See `supabase/config.toml`.
 *
 * ## The rule this script obeys
 *
 * Admin rights create the throwaway users, fetch the codes, and verify afterwards what
 * became of them. **Every assertion about what the function permits runs through a real
 * session, over the real endpoint.** An admin client bypasses everything by definition,
 * so an assertion made with one would pass whether the function was correct or absent.
 *
 * Usage: pnpm check:delete-account
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
if (!secretKey?.startsWith('sb_secret_')) {
  console.error('Missing or malformed SUPABASE_SECRET_KEY (supabase/.env.rls-test).')
  process.exit(2)
}

const ENDPOINT = `${url}/functions/v1/delete-account`

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const anonClient = () =>
  createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })

const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
})

/** Whether an account exists for this address, asked of the source of truth. */
async function accountFor(email) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw new Error(`could not list users: ${error.message}`)
  return data.users.find((user) => user.email === email) ?? null
}

/**
 * Sign in the way the app does, end to end, for an address that has never been used.
 *
 * Two real steps and one substitution. `signInWithOtp` is the app's own call and is what
 * creates the account — there is no sign-up flow anywhere in this product, which is the
 * thing being demonstrated. `verifyOtp` is the app's own call too. Between them, the code
 * is fetched through the admin API instead of out of an inbox, because that is the step a
 * script cannot perform.
 */
async function signInFor(email) {
  const client = anonClient()

  // The app's call, verbatim. It may report a mail-delivery failure for a throwaway
  // address; the account is created either way, which is what the next assertion checks.
  const requested = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })

  const created = await accountFor(email)
  if (!created) {
    throw new Error(
      `signInWithOtp did not create an account for ${email}` +
        (requested.error ? `: ${requested.error.message}` : ''),
    )
  }

  // A real, currently-valid one-time code for that account, issued by the Auth server.
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
  if (link.error) throw new Error(`could not issue a code: ${link.error.message}`)
  const token = link.data.properties?.email_otp
  if (!token) throw new Error('no one-time code came back')

  // The app's call again: the code goes in, a session comes out.
  const verified = await client.auth.verifyOtp({ email, token, type: 'email' })
  if (verified.error) throw new Error(`code rejected: ${verified.error.message}`)

  return {
    client,
    user: verified.data.user,
    accessToken: verified.data.session.access_token,
    refreshToken: verified.data.session.refresh_token,
    mailReported: requested.error ? requested.error.message : 'accepted',
  }
}

/** Call the deployed function exactly as a browser would, with full control of the request. */
async function callFunction({ token, method = 'POST', body, origin } = {}) {
  const response = await fetch(ENDPOINT, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      apikey: publishableKey,
      'content-type': 'application/json',
      ...(origin ? { Origin: origin } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    // A gateway rejection need not be JSON.
  }
  return {
    status: response.status,
    payload,
    allowOrigin: response.headers.get('access-control-allow-origin'),
  }
}

const stamp = randomUUID().slice(0, 8)
const alice = `e2e-a-${stamp}@example.com`
const bob = `e2e-b-${stamp}@example.com`
const madeHere = []

try {
  console.log(`endpoint: ${ENDPOINT}\n`)

  // --- a real account, created by signing in -------------------------------------

  const a = await signInFor(alice)
  madeHere.push(a.user.id)
  check(
    '1. signing in with a one-time code creates the account, with no sign-up step',
    Boolean(a.user?.id) && a.user.email === alice,
    `account ${a.user.id.slice(0, 8)}… created; mailer said: ${a.mailReported}`,
  )
  check(
    '2. and the code exchange yields a real session',
    typeof a.accessToken === 'string' && a.accessToken.split('.').length === 3,
    'access token issued by verifyOtp',
  )

  // Something to lose, written through the app's own tables and policies.
  const generation = await a.client
    .from('person_generations')
    .insert({ id: randomUUID() })
    .select('id')
    .single()
  if (generation.error) throw new Error(`could not mint a generation: ${generation.error.message}`)
  const wrote = await a.client.from('person_facts').insert({
    id: randomUUID(),
    key: 'area.body.goal',
    value: 'walk somewhere green',
    source: 'e2e',
    learned_at: new Date().toISOString(),
    generation: generation.data.id,
  })
  check(
    '3. that session can write its own data, so there is something to delete',
    !wrote.error,
    wrote.error ? wrote.error.message : '1 fact in 1 generation',
  )

  // --- what the endpoint refuses --------------------------------------------------

  const noToken = await callFunction({})
  check(
    '4. a call with no bearer token is refused',
    noToken.status === 401,
    `status ${noToken.status}`,
  )

  const rubbish = await callFunction({ token: 'not.a.real.token' })
  check(
    '5. a malformed token is refused',
    rubbish.status === 401,
    `status ${rubbish.status}`,
  )

  const wrongMethod = await callFunction({ token: a.accessToken, method: 'GET' })
  check(
    '6. a method other than POST is refused, even with a valid token',
    wrongMethod.status === 405 || wrongMethod.status === 401,
    `status ${wrongMethod.status}`,
  )

  const strangeOrigin = await callFunction({
    token: a.accessToken,
    method: 'OPTIONS',
    origin: 'https://evil.example',
  })
  check(
    '7. an unknown origin is not echoed back in the CORS header',
    strangeOrigin.allowOrigin !== 'https://evil.example' && strangeOrigin.allowOrigin !== '*',
    `Access-Control-Allow-Origin: ${strangeOrigin.allowOrigin}`,
  )

  // --- the one that matters: a body cannot redirect the deletion ------------------
  //
  // A second real account asks to delete the first, by naming it every way a caller
  // plausibly could. The function reads no body at all, so what must happen is that B
  // deletes B — and A is untouched.

  const b = await signInFor(bob)
  madeHere.push(b.user.id)

  const redirected = await callFunction({
    token: b.accessToken,
    body: { user_id: a.user.id, userId: a.user.id, id: a.user.id, email: alice },
  })
  const aliceAfter = await accountFor(alice)
  const bobAfter = await accountFor(bob)
  check(
    "8. naming another account in the body does not delete it — the caller's own goes",
    redirected.status === 200 && bobAfter === null && aliceAfter !== null,
    `status ${redirected.status}; B ${bobAfter ? 'STILL THERE' : 'deleted'}, A ${
      aliceAfter ? 'untouched' : 'WRONGLY DELETED'
    }`,
  )
  if (bobAfter === null) madeHere.splice(madeHere.indexOf(b.user.id), 1)

  // --- the ordinary path ----------------------------------------------------------

  const deleted = await callFunction({ token: a.accessToken })
  const aliceGone = await accountFor(alice)
  check(
    '9. the caller can delete their own account',
    deleted.status === 200 && aliceGone === null,
    `status ${deleted.status}, account ${aliceGone ? 'STILL THERE' : 'gone'}`,
  )
  if (aliceGone === null) madeHere.splice(madeHere.indexOf(a.user.id), 1)

  // Cascade, asked of the database rather than assumed from the schema.
  const leftovers = await admin
    .from('person_facts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', a.user.id)
  const leftoverGenerations = await admin
    .from('person_generations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', a.user.id)
  check(
    '10. their data went with the account, by cascade',
    (leftovers.count ?? 0) === 0 && (leftoverGenerations.count ?? 0) === 0,
    `${leftovers.count ?? 0} fact(s), ${leftoverGenerations.count ?? 0} generation(s) left behind`,
  )

  // --- the residual access token, measured rather than assumed --------------------
  //
  // **Deleting a user does not invalidate an access token already issued to them.** A
  // Supabase JWT is checked by signature and expiry, not looked up against a table, so it
  // stays syntactically valid until it expires — `jwt_expiry`, one hour on this project.
  // The function revokes the *session* first, which stops it being renewed, but it cannot
  // reach into a token already in somebody's hand.
  //
  // That is a property of the platform, not a defect in this function, and the useful
  // question is therefore not "is it rejected" but **"what can it still do"**. These three
  // checks answer that, because a claim about a residual credential is worth nothing
  // unless somebody has actually tried it.

  const residualRead = await fetch(`${url}/rest/v1/person_facts?select=id`, {
    headers: { apikey: publishableKey, Authorization: `Bearer ${a.accessToken}` },
  })
  const residualRows = residualRead.ok ? await residualRead.json() : null
  check(
    '11. the deleted account’s token can read nothing — its rows are gone and RLS scopes it to them',
    Array.isArray(residualRows) ? residualRows.length === 0 : residualRead.status >= 400,
    `PostgREST answered ${residualRead.status} with ${
      Array.isArray(residualRows) ? residualRows.length : 'no'
    } row(s)`,
  )

  // The stronger half. Reading nothing could be luck; writing is what would let a residual
  // token leave something behind. The foreign key to `auth.users` is what stops it: the
  // owner no longer exists, so there is nothing for a new row to belong to.
  const residualWrite = await fetch(`${url}/rest/v1/person_generations`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${a.accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ id: randomUUID() }),
  })
  check(
    '12. and it can write nothing — the row would have to belong to a user that is gone',
    residualWrite.status >= 400,
    `insert answered ${residualWrite.status}`,
  )

  // And it cannot be turned into a fresh one. This is the half the function *can* control,
  // and the reason it signs the session out globally before deleting: without that, the
  // refresh token would keep minting new hours indefinitely.
  const renewed = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: publishableKey, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: a.refreshToken }),
  })
  check(
    '13. and it cannot be renewed, so it dies at expiry rather than being extended',
    renewed.status >= 400,
    `refresh answered ${renewed.status}`,
  )

  const twice = await callFunction({ token: a.accessToken })
  check(
    '14. calling the function again with it is refused rather than erroring oddly',
    twice.status === 401,
    `status ${twice.status}`,
  )
} finally {
  let removed = 0
  for (const id of madeHere) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) console.log(`WARN  could not delete leftover user ${id}: ${error.message}`)
    else removed += 1
  }
  console.log(`\ncleanup: ${removed} leftover account(s) removed (0 is the healthy number)`)
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) console.log(`failed:\n${failed.map((f) => `  - ${f.name} (${f.detail})`).join('\n')}`)
process.exit(failed.length ? 1 : 0)
