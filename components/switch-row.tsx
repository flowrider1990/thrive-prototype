'use client'

import { useI18n } from '@/lib/i18n'

/**
 * One setting, on or off.
 *
 * `role="switch"` with `aria-checked` rather than a checkbox: it is the pattern that
 * says "this is on or off right now" instead of "this will be included when you
 * submit", and there is no form here to submit. It is a real `<button>`, which also
 * keeps the inline-panel focus handling in `StorageChoice` working — that code focuses
 * the first `<button>` inside the panel, and an `<input>` would have broken it
 * silently.
 *
 * State is readable three ways, and only one of them is colour: the knob's position,
 * the word beside it, and the track's fill. Nothing changes size when it flips.
 *
 * `note` is for a setting that cannot be operated yet — it says why, rather than
 * leaving a dead control to be poked at.
 */
export function SwitchRow({
  label,
  checked,
  onChange,
  disabled = false,
  note,
}: {
  label: string
  checked: boolean
  onChange: () => void
  disabled?: boolean
  note?: string
}) {
  const { m } = useI18n()

  return (
    <div className="space-y-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className="switch"
        onClick={onChange}
      >
        <span className="min-w-0">{label}</span>
        <span className="flex shrink-0 items-center gap-x-2.5">
          {/* The state in words, so it never rests on the graphic alone. */}
          <span className="text-sm text-muted">
            {checked ? m.data.storage.on : m.data.storage.off}
          </span>
          <span aria-hidden="true" className="switch-track">
            <span className="switch-knob" />
          </span>
        </span>
      </button>
      {note && <p className="max-w-prose text-sm leading-relaxed text-muted">{note}</p>}
    </div>
  )
}
