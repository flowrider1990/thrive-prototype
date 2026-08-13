'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A free-text answer. The field focuses itself on mount — which, because the
 * app only renders once the store is ready, is the moment the question appears.
 *
 * `allowEmpty` exists for the question about declining: insisting on a reason
 * from someone who just said no would be its own small coercion.
 *
 * `initialValue` is for editing something already written — rewording a next
 * step should not mean retyping it. It seeds the field once, so the component
 * has to be remounted (a changed `key`) to show different text.
 */
export function TextAnswer({
  placeholder,
  submitLabel,
  skipLabel,
  multiline = false,
  maxLength,
  allowEmpty = false,
  initialValue = '',
  onSubmit,
  onSkip,
}: {
  placeholder: string
  submitLabel: string
  skipLabel?: string
  multiline?: boolean
  /**
   * A storage ceiling, not a writing target — so it is stated in prose where it
   * matters and never metered. There is no counter anywhere in this app, and one
   * here would turn writing about your own life into a measured task. Set it far
   * enough above what anyone writing in good faith reaches, because a hard limit
   * with no counter silently swallows keystrokes.
   */
  maxLength?: number
  allowEmpty?: boolean
  initialValue?: string
  onSubmit: (value: string) => void
  onSkip?: () => void
}) {
  const [value, setValue] = useState(initialValue)
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  useEffect(() => {
    fieldRef.current?.focus()
  }, [])

  const trimmed = value.trim()
  const canSubmit = allowEmpty || trimmed.length > 0

  function submit() {
    if (!canSubmit) return
    onSubmit(trimmed)
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      {multiline ? (
        <textarea
          ref={fieldRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            // Enter makes a new line here; Ctrl/Cmd+Enter sends.
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          rows={4}
          maxLength={maxLength}
          className="field resize-none"
        />
      ) : (
        <input
          ref={fieldRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          maxLength={maxLength}
          className="field"
        />
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
          {submitLabel}
        </button>
        {skipLabel && onSkip && (
          <button type="button" onClick={onSkip} className="btn btn-quiet">
            {skipLabel}
          </button>
        )}
      </div>
    </form>
  )
}
