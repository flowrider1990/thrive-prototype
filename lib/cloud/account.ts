'use client'

import { getSupabase, hasStoredSession, isSupabaseConfigured } from '@/lib/supabase/client'
import { classify, type Failure, type Result } from './failure'

/**
 * The account: signing in, signing out, and deleting one.
 *
 * This layer knows about **people**, not about facts. It never reads or writes a row and
 * never touches the person store — `lib/cloud/facts.ts` does the first and
 * `lib/cloud/sync.ts` decides when either happens. Keeping them apart is what makes the
 * sign-in dialog testable as a dialog and the sync engine testable as sync.
 *
 * Sign-in is an **email one-time code** and nothing else (decision D4). No password, so
 * there is no password to reset or leak; no magic link and no OAuth, so there is no
 * redirect URL to allowlist and no callback route to prerender — which is what makes it
 * fit a static export served from a subpath. And no separate "create an account" flow:
 * `shouldCreateUser` means the first code sent to an unknown address makes the account,
 * so the only thing anyone is ever asked for is their email.
 */

/** Re-exported so a caller that already imports this layer need not know where they live. */
export type { Failure, Result } from './failure'

const failed = (reason: Failure): Result<never> => ({ ok: false, reason })

export type Account = {
  /**
   * The authenticated user id, and the **only** ownership key the app uses.
   *
   * Never the email. The database default and the RLS policies read `auth.uid()` from
   * the verified token, so a client that lied about who it was would be rejected rather
   * than believed — see the migration. This copy exists so the device can tell whether
   * the account it holds markers for is the one signed in now.
   */
  id: string
  email: string
}

function toAccount(user: { id: string; email?: string } | null | undefined): Account | null {
  return user ? { id: user.id, email: user.email ?? '' } : null
}

/**
 * The account this device is already signed in as, if any.
 *
 * Returns `null` without building a client when nothing is stored, which is what keeps a
 * local-only visit free of Supabase entirely: no client, no refresh timer, no request.
 */
export async function restore(): Promise<Account | null> {
  if (!hasStoredSession()) return null
  try {
    const { data, error } = await getSupabase().auth.getSession()
    if (error) return null
    return toAccount(data.session?.user)
  } catch {
    // An unreachable server must not look like a signed-out one, but there is nothing
    // else to return here; the caller stays in local mode and the person stays signed
    // in on the device. `getSession()` reads storage first, so this is rare.
    return null
  }
}

/**
 * Send a code to this address, creating the account if there is not one yet.
 *
 * The one place the app makes a request on somebody's behalf before they have an
 * account, and therefore the one place the copy has to say what that means — see
 * `m.auth.note`.
 */
export async function requestCode(email: string): Promise<Result<null>> {
  if (!isSupabaseConfigured()) return failed('unconfigured')
  try {
    const { error } = await getSupabase().auth.signInWithOtp({
      email,
      options: {
        // No "Create account" flow, by design: an address nobody has used before becomes
        // an account when its owner proves they can read the code. Turning this off
        // would mean a second screen asking a question the code already answers.
        shouldCreateUser: true,
      },
    })
    if (error) return failed(classify(error))
    return { ok: true, value: null }
  } catch (error) {
    return failed(classify(error))
  }
}

/** Exchange the code for a session. */
export async function submitCode(email: string, code: string): Promise<Result<Account>> {
  if (!isSupabaseConfigured()) return failed('unconfigured')
  try {
    const { data, error } = await getSupabase().auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    })
    if (error) return failed(classify(error))
    const account = toAccount(data.user)
    return account ? { ok: true, value: account } : failed('server')
  } catch (error) {
    return failed(classify(error))
  }
}

/**
 * End the session on this device.
 *
 * **It always succeeds locally, even when the network does not.** Being unable to reach
 * the server is not a reason to keep somebody signed in against their wishes, so a
 * failed global sign-out falls back to a local one rather than reporting an error the
 * person cannot act on. The tokens left behind on the server expire on their own.
 *
 * Nothing here touches stored facts. Signing out is not deleting — see `endCloud()`.
 */
export async function signOut(): Promise<void> {
  if (!isSupabaseConfigured()) return
  try {
    const { error } = await getSupabase().auth.signOut()
    if (!error) return
  } catch {
    // fall through
  }
  try {
    await getSupabase().auth.signOut({ scope: 'local' })
  } catch {
    // Nothing further to try. The next `restore()` will fail and the app stays local.
  }
}

/**
 * Delete the account itself.
 *
 * `auth.users` cannot be touched from a browser — that needs the service role key, which
 * must never reach one — so this calls the single Edge Function approved to hold it
 * (decisions D9 and D10, `docs/supabase-migration.md` §16). The function takes **no
 * parameters**: it reads the caller's identity from the verified bearer token and
 * deletes that account and nothing else. Any id sent in a body would be ignored, which
 * is why none is sent.
 *
 * The person's rows go with it, by `on delete cascade` on `person_facts.user_id`.
 */
export async function deleteAccount(): Promise<Result<null>> {
  if (!isSupabaseConfigured()) return failed('unconfigured')
  try {
    const { error } = await getSupabase().functions.invoke('delete-account', { method: 'POST' })
    if (error) return failed(classify(error))
    return { ok: true, value: null }
  } catch (error) {
    return failed(classify(error))
  }
}
