/**
 * What "it did not work" is allowed to mean, and the one place that decides.
 *
 * Deliberately coarse. A screen that reports twelve distinguishable failures is a screen
 * nobody reads; what a person can actually act on is whether to try again, fix what they
 * typed, or wait. Six words cover it.
 *
 * It lives in its own module because three layers need the same vocabulary —
 * `account.ts`, `facts.ts` and `generations.ts` — and three copies of a classifier is
 * three chances for the same server response to be reported two different ways depending
 * on which request happened to make it.
 */

export type Failure =
  /** The network did not answer. Nothing was lost; try again later. */
  | 'offline'
  /** The server said no to the credential — wrong or expired code, or a refused write. */
  | 'rejected'
  /** Too many attempts or too many emails, too quickly. */
  | 'rate-limited'
  /** The project is not accepting new accounts. See `supabase/config.toml`. */
  | 'signup-closed'
  /** The server answered, unhappily. Not the person's fault and not fixable by retrying now. */
  | 'server'
  /** This build has no project attached at all. */
  | 'unconfigured'

export type Result<T> = { ok: true; value: T } | { ok: false; reason: Failure }

/**
 * One classifier for two shapes of error object, because the same outage should read the
 * same way whether it happened during sign-in or during a push.
 *
 * `fetch` rejecting outright is the offline case — no status, no body, nothing reached a
 * server. A PostgREST error carries a `code`; an auth error carries a `status`. Neither
 * is matched on its message: the prose moves between Supabase versions, and matching on
 * it is how error handling rots into a lie.
 *
 * The `code`-less case being "offline" is a lesson from `check-supabase.mjs`: HTTP 401
 * means "permission denied" as often as it means "bad key", so the presence of a database
 * error code is the durable discriminator, not the status.
 */
export function classify(error: unknown): Failure {
  if (error instanceof TypeError) return 'offline'
  const status = (error as { status?: number } | null)?.status
  const code = (error as { code?: string } | null)?.code
  if (code === 'signup_disabled' || code === 'email_provider_disabled') return 'signup-closed'
  if (code === 'PGRST301' || code === '42501') return 'rejected'
  if (status === 429) return 'rate-limited'
  if (status === 422 || status === 400 || status === 403 || status === 401) return 'rejected'
  if (code) return 'server'
  if (status === undefined) return 'offline'
  return 'server'
}
