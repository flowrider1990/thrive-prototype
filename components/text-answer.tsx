'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A free-text answer. The field focuses itself on mount — which, because the
 * app only renders once the store is ready, is the moment the question appears.
 *
 * `allowEmpty` exists for the question about declining: insisting on a reason
 * from someone who just said no would be its own small coercion.
 */
export function TextAnswer({
  placeholder,
  submitLabel,
  skipLabel,
  multiline = false,
  allowEmpty = false,
  onSubmit,
  onSkip,
}: {
  placeholder: string
  submitLabel: string
  skipLabel?: string
  multiline?: boolean
  allowEmpty?: boolean
  onSubmit: (value: string) => void
  onSkip?: () => void
}) {
  const [value, setValue] = useState('')
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
