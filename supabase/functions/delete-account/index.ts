// Deno, deployed to Supabase Edge Functions — not part of the Next build and not part
// of `out/`. It is the only server-side code in this project, and decision D10 says it
// stays that way: any second function, or any widening of this one, is a new
// architectural decision needing its own approval.
//
// See `docs/supabase-migration.md` §16 for the requirements this implements. They are
// requirements rather than suggestions, because a function that deletes accounts is the
// most dangerous thing in the repository by a wide margin.
import { createClient } from 'jsr:@supabase/supabase-js@2'

/**
 * Delete the caller's own account, and nothing else.
 *
 * Four properties, each of which is the whole point of the one below it:
 *
 * 1. **It takes no user identifier.** Identity comes from verifying the bearer token and
 *    reading the user out of it. A function that accepted an id in the body would be
 *    account-deletion-as-a-service for anyone who found the URL. Any body sent is
 *    ignored, not validated — validating it would imply it could ever be used.
 * 2. **No token, no work.** A missing, malformed or expired JWT is refused before
 *    anything else happens.
 * 3. **The privileged key never leaves here.** It is read from the function's own
 *    secrets at runtime; it is not in the repository, not in any `.env` the Next build
 *    can read, and not in anything that reaches a browser.
 * 4. **The facts go by cascade.** `person_facts.user_id` references `auth.users` with
 *    `on delete cascade`, so this needs no table access at all — and having none is
 *    what keeps its blast radius to exactly one row in one table it cannot name.
 */

const ALLOWED_ORIGINS = [
  'https://flowrider1990.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
]

function corsHeaders(origin: string | null): Record<string, string> {
  // Echoed only when it is one we know. A wildcard would be simpler and would also
  // invite every other page on the internet to call this with a stolen token.
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

Deno.serve(async (request: Request) => {
  const cors = corsHeaders(request.headers.get('origin'))
  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'content-type': 'application/json' },
    })

  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405)

  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return json({ error: 'unauthorized' }, 401)

  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) return json({ error: 'not configured' }, 500)

  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // The only thing the token is used for: finding out who is asking. If it is expired,
  // revoked, or for a user that no longer exists, this fails and nothing is deleted.
  const { data, error } = await admin.auth.getUser(token)
  const user = data?.user
  if (error || !user) return json({ error: 'unauthorized' }, 401)

  // Revoked before deletion, deliberately. Deleting a user does **not** invalidate access
  // tokens already issued to them, so a token in flight would otherwise keep working for
  // the rest of its hour against an account that no longer exists.
  await admin.auth.admin.signOut(token, 'global').catch(() => {
    // Best effort: a failure here must not stop the deletion the person asked for.
  })

  const removal = await admin.auth.admin.deleteUser(user.id)
  if (removal.error) return json({ error: 'delete failed' }, 500)

  // The person's rows went with the user, by `on delete cascade`.
  return json({ deleted: true }, 200)
})
