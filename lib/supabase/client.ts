import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * The Supabase client boundary.
 *
 * This is connectivity only. Nothing in `app/` or `components/` imports it yet,
 * and `lib/person/store.ts` remains the single storage boundary — see
 * `docs/supabase-migration.md`. Adding a table, Auth, or any sync is a later
 * phase with its own approval.
 *
 * Two properties are deliberate and load-bearing:
 *
 * - **Nothing happens on import.** The client is built on the first
 *   `getSupabase()` call, not at module scope, so merely importing this file
 *   opens no connection and touches no storage. That is what keeps
 *   `scripts/verify.mjs`'s "nothing leaves the browser" check (G6) true by
 *   construction rather than by careful use.
 * - **The publishable key only.** A secret (`sb_secret_…`) or `service_role`
 *   key must never reach a browser, and the static export inlines every
 *   `NEXT_PUBLIC_*` value straight into the JavaScript it ships. Treat both
 *   values below as printed on the page, because effectively they are.
 */

// Read as full literals so Next's static export can inline them at build time;
// destructuring or dynamic indexing would defeat that substitution.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

let client: SupabaseClient | undefined

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
      // No Auth exists yet, so the client must not write anything to the
      // device. `persistSession: true` would put `sb-*` keys in localStorage,
      // and "declining leaves localStorage completely empty" (G2) is a tested
      // guarantee. Revisit all three of these when Auth is implemented — the
      // session-persistence decision is open point O1 in
      // `docs/supabase-migration.md`.
      persistSession: false,
      autoRefreshToken: false,
      // Would otherwise inspect `window.location` when the client is built.
      detectSessionInUrl: false,
    },
  })

  return client
}
