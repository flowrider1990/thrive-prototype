'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import type { Failure } from '@/lib/cloud/account'
import { closeSignIn, resolveConflict, sendCode, signIn, useSync } from '@/lib/cloud/sync'

/**
 * Signing in, as one dialog reached from two places — the cloud switch under Data
 * protection, and the footer.
 *
 * **A real `<dialog>`, opened with `showModal()`.** The platform then owns the hard
 * parts: focus is trapped, the page behind it is inert, Escape closes it, and the
 * backdrop is a pseudo-element rather than a div that has to be kept in front of
 * everything. `CLAUDE.md` §7 says to reach for a headless primitive rather than
 * hand-rolling focus management — the built-in element is the version of that which
 * costs no dependency, and it is why this file contains no key handlers.
 *
 * **It is mounted once, in `PageShell`.** Two copies would mean two sources of truth for
 * "is the sign-in open", and the one thing worse than a modal is two of them.
 *
 * The steps are a sequence of single questions, which is the shape the rest of the app
 * already uses: an address, then the code that came back, and — only when the two copies
 * genuinely disagree — which copy to keep. Cancelling at any point leaves sync off; at
 * the last step that means signing back out, because by then a session exists.
 */
export function SignInDialog() {
  const { m, t } = useI18n()
  const { signInOpen, busy, trouble, conflict, account } = useSync()
  const ref = useRef<HTMLDialogElement>(null)
  const headingId = useId()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [done, setDone] = useState(false)

  // Opening and closing is done through the element's own methods rather than by
  // rendering it conditionally: `showModal()` is what makes it modal, and an element
  // that is merely present in the DOM is a box with a shadow.
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (signInOpen && !dialog.open) dialog.showModal()
    if (!signInOpen && dialog.open) dialog.close()
  }, [signInOpen])

  // A fresh start each time it opens, so a cancelled attempt does not leave a stale code
  // in the field for the next one.
  //
  // Adjusted during render rather than in an effect, which is the documented pattern for
  // "reset state when something changes": an effect would render the stale step once,
  // then render again — visible as a flicker of the previous attempt, and flagged by the
  // lint rule that exists to catch exactly that.
  const [openedWith, setOpenedWith] = useState(signInOpen)
  if (signInOpen !== openedWith) {
    setOpenedWith(signInOpen)
    if (signInOpen) {
      setCode('')
      setSent(false)
      setDone(false)
    }
  }

  const working = busy !== null
  const message = trouble ? failureText(m, trouble) : null

  async function onSend() {
    const failure = await sendCode(email.trim())
    if (!failure) setSent(true)
  }

  async function onVerify() {
    const failure = await signIn(email.trim(), code)
    if (failure) return
    // A conflict keeps the dialog open on its own step; anything else is finished.
    setDone(true)
  }

  async function onResolve(keep: 'device' | 'account') {
    const failure = await resolveConflict(keep)
    if (!failure) setDone(true)
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      className="modal"
      // Escape and any other platform close route land here, so cancelling has exactly
      // one implementation no matter which way it was reached.
      onClose={() => closeSignIn()}
    >
      {/**
       * Contents only while it is open, and this is not an optimisation.
       *
       * A closed `<dialog>` keeps its children in the document. They are not painted and
       * not focusable, but they are still found by `querySelectorAll` — so an unopened
       * sign-in left an `<input>` and a "Cancel" button lying around on every page in the
       * app. `scripts/verify.mjs` caught it as three failures in a section about writing
       * down next steps, which is exactly the kind of spooky action at a distance a
       * hidden form field causes: the same hazard reaches autofill, password managers,
       * and anything else that walks the DOM rather than the screen.
       *
       * The element itself stays mounted, so `showModal()` always has something to call
       * and the open transition is not a remount.
       */}
      {signInOpen && (
        <div className="space-y-6 p-6 sm:p-8">
          <h2 id={headingId} className="heading text-2xl">
            {m.auth.title}
          </h2>

          {/* Mounted for the life of the dialog rather than inserted with its text: a
            `role="status"` that appears together with what it says announces nothing. */}
          <p role="status" className="sr-only">
            {message ?? (done ? m.auth.done : '')}
          </p>

          {/* Above everything, including the heading's own explanation: this is the one
            thing that changes whether the rest is worth reading. §7's hint colour, and the
            sentence opens with "Note:" so it reads as a hint without the hue. */}
        {!conflict && !done && !account && (
          <p className="max-w-prose text-sm leading-relaxed text-note">{m.auth.prototypeNote}</p>
        )}

        {conflict ? (
            <div className="space-y-5">
              {/* Two reasons to be asking, and they are not interchangeable: one is "we
                  have never met", the other is "what you have here was replaced from
                  somewhere else". Someone who is told the second can make sense of the
                  choice; someone told the first when the second happened cannot. */}
              <p className="max-w-prose leading-relaxed text-ink">
                {conflict.reason === 'superseded'
                  ? m.auth.conflict.supersededTitle
                  : m.auth.conflict.title}
              </p>
              <p className="max-w-prose text-sm leading-relaxed text-muted">
                {conflict.reason === 'superseded'
                  ? m.auth.conflict.supersededBody
                  : m.auth.conflict.body}
              </p>

              {/* Both options carry their own consequence, and neither is emphasised over
                the other. There is no recommended answer here — only the person knows
                which copy is the one they meant. */}
              <div className="space-y-4">
                <ConflictOption
                  label={m.auth.conflict.keepDevice}
                  count={t(m.auth.conflict.here, {
                    count: String(conflict.here),
                  })}
                  note={m.auth.conflict.keepDeviceNote}
                  disabled={working}
                  onSelect={() => void onResolve('device')}
                />
                <ConflictOption
                  label={m.auth.conflict.keepAccount}
                  count={t(m.auth.conflict.there, {
                    count: String(conflict.there),
                  })}
                  note={m.auth.conflict.keepAccountNote}
                  disabled={working}
                  onSelect={() => void onResolve('account')}
                />
              </div>

              {message && (
                <p className="max-w-prose text-sm leading-relaxed text-note">{message}</p>
              )}

              <button type="button" className="btn btn-quiet" onClick={() => closeSignIn()}>
                {m.auth.cancel}
              </button>
            </div>
          ) : done || (account && !conflict) ? (
            <div className="space-y-5">
              <p className="max-w-prose leading-relaxed text-ink">{m.auth.done}</p>
              <p className="text-sm text-muted">
                {t(m.auth.signedInAs, { email: account?.email ?? email })}
              </p>
              <button type="button" className="btn btn-primary" onClick={() => closeSignIn()}>
                {m.auth.close}
              </button>
            </div>
          ) : (
            <form
              className="space-y-5"
              onSubmit={(event) => {
                event.preventDefault()
                if (working) return
                void (sent ? onVerify() : onSend())
              }}
            >
              <div className="space-y-2">
                <label htmlFor={`${headingId}-email`} className="block leading-relaxed text-ink">
                  {m.auth.emailQuestion}
                </label>
                <input
                  id={`${headingId}-email`}
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  className="field"
                  placeholder={m.auth.emailPlaceholder}
                  value={email}
                  disabled={sent || working}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>

              {sent && (
                <div className="space-y-2">
                  <label htmlFor={`${headingId}-code`} className="block leading-relaxed text-ink">
                    {m.auth.codeQuestion}
                  </label>
                  <p className="text-sm text-muted">
                    {t(m.auth.codeSent, { email: email.trim() })}
                  </p>
                  <input
                    id={`${headingId}-code`}
                    type="text"
                    required
                    // The code is not a password and not a name: one-time-code tells a
                    // phone to offer the one it just received.
                    autoComplete="one-time-code"
                    inputMode="numeric"
                    autoFocus
                    className="field"
                    placeholder={m.auth.codePlaceholder}
                    value={code}
                    disabled={working}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </div>
              )}

              {/* Before the button, not after it: this is what the button commits to, and
                copy that explains a control belongs where it is read first. */}
              <div className="space-y-1">
                <p className="max-w-prose text-sm leading-relaxed text-muted">{m.auth.note}</p>
                <p className="max-w-prose text-sm leading-relaxed text-muted">{m.auth.noteData}</p>
              </div>

              {message && (
                <p className="max-w-prose text-sm leading-relaxed text-note">{message}</p>
              )}

              <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={
                    working || (sent ? code.trim().length === 0 : email.trim().length === 0)
                  }
                >
                  {working ? m.auth.working : sent ? m.auth.verify : m.auth.send}
                </button>
                {sent && (
                  <button
                    type="button"
                    className="btn btn-quiet"
                    disabled={working}
                    onClick={() => {
                      setSent(false)
                      setCode('')
                    }}
                  >
                    {m.auth.otherEmail}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-quiet"
                  disabled={working}
                  onClick={() => closeSignIn()}
                >
                  {m.auth.cancel}
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </dialog>
  )
}

/** One half of the conflict question: what it keeps, how much of it, and what it costs. */
function ConflictOption({
  label,
  count,
  note,
  disabled,
  onSelect,
}: {
  label: string
  count: string
  note: string
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <div className="space-y-1">
      <button type="button" className="btn btn-quiet" disabled={disabled} onClick={onSelect}>
        {label}
      </button>
      <p className="max-w-prose text-sm leading-relaxed text-muted">
        {count} — {note}
      </p>
    </div>
  )
}

/**
 * One failure, one sentence. Shared with the settings page so that the same problem never
 * reads as two different problems depending on where it surfaced.
 */
export function failureText(m: ReturnType<typeof useI18n>['m'], failure: Failure): string {
  switch (failure) {
    case 'offline':
      return m.auth.error.offline
    case 'rejected':
      return m.auth.error.rejected
    case 'rate-limited':
      return m.auth.error.rateLimited
    case 'signup-closed':
      return m.auth.error.signupClosed
    case 'unconfigured':
      return m.auth.error.unconfigured
    default:
      return m.auth.error.server
  }
}
