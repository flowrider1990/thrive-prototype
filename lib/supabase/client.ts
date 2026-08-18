import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The Supabase client boundary.
 *
 * Everything that talks to the network goes through here, and nothing else in the app
 * constructs a client — see `lib/cloud/` for the layers above it and
 * `docs/supabase-migration.md` for why the project has a cloud at all.
 *
 * Three properties are deliberate and load-bearing:
 *
 * - **Nothing happens on import.** The client is built on the first `getSupabase()`
 *   call, not at module scope, so merely importing this file opens no connection and
 *   touches no storage. That is what keeps `scripts/verify.mjs`'s "nothing leaves the
 *   browser" check (G6) true *in local mode* by construction rather than by care: a
 *   person who never signs in never causes a request, because nothing ever asks for a
 *   client.
 * - **The publishable key only.** A secret (`sb_secret_…`) or `service_role` key must
 *   never reach a browser, and the static export inlines every `NEXT_PUBLIC_*` value
 *   straight into the JavaScript it ships. Treat both values below as printed on the
 *   page, because effectively they are. Everything that key can do is bounded by RLS —
 *   see `supabase/migrations/20260811193339_person_facts.sql`.
 * - **Configuration is a question, not an assumption.** `isSupabaseConfigured()` lets
 *   the UI hide sign-in entirely on a build with no project attached, instead of
 *   offering a control that can only throw.
 */

// Read as full literals so Next's static export can inline them at build time;
// destructuring or dynamic indexing would defeat that substitution.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

let client: SupabaseClient | undefined

/** Whether this build has a project to talk to at all. */
export function isSupabaseConfigured(): boolean {
  return Boolean(url && publishableKey)
}

/**
 * Where the session is kept, and the reason it is worth naming.
 *
 * `persistSession: true` (open point O1, since decided) means the Supabase client writes
 * its own keys to `localStorage`, so the app no longer owns exactly one key. That is
 * coherent only because signing in requires device consent first (decision D2): a
 * session token is itself a write, and offering an account to someone who just asked for
 * nothing to be written would either break that promise or sign them out on every
 * reload.
 *
 * The prefix is exported so `/data/stored/` can say plainly what else is on the device,
 * and so sign-out can be checked rather than trusted.
 */
export const SESSION_KEY_PREFIX = 'sb-'

/**
 * Is there a stored session to restore?
 *
 * Asked before a client is built, so that a device that has never signed in never
 * constructs one — no client, no timers, no requests, and check 9 stays green for
 * everyone using the app locally.
 */
export function hasStoredSession(): boolean {
  if (!isSupabaseConfigured()) return false
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (key?.startsWith(SESSION_KEY_PREFIX) && key.includes('auth-token')) return true
    }
  } catch {
    // Storage can throw on access alone in locked-down browsers. No storage, no session.
  }
  return false
}

export function getSupabase(): SupabaseClient {
  if (!url || !publishableKey) {
    throw new Error(
      'Supabase is not configured: NEXT_PUBLIC_SUPABASE_URL and ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must both be set. Copy them into ' +
        '.env.local, which is git-ignored.',
    )
  }

  client ??= createClient(url, publishableKey, {
    auth: {
      // Signing in survives a reload, which is the only tolerable behaviour for
      // something that costs an email round trip. See SESSION_KEY_PREFIX above for why
      // this is allowed to write to the device at all.
      persistSession: true,
      autoRefreshToken: true,
      // Nothing arrives by URL: sign-in is a code typed into the app, not a link
      // followed back to it, so there is no callback to parse and no redirect to
      // allowlist. That is most of why email OTP was chosen for a static export on a
      // subpath (decision D4).
      detectSessionInUrl: false,
    },
  })

  return client
}
