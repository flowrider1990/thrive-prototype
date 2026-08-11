'use client'

import type { ReactNode } from 'react'

export type Option = {
  id: string
  label: string
  /** A quieter second line: the area's state, or what a step is currently doing. */
  note?: string
  icon?: ReactNode
}

/**
 * A stacked list of choices whose text is a sentence.
 *
 * `Choice` puts two pills side by side, which is right for yes and no. It is
 * wrong for "Walk for 20 minutes in the evening": three of those wrap into an
 * unreadable row at phone width. Same job, different shape — and a real list, so
 * a screen reader announces how many there are to choose between.
 */
export function OptionList({
  options,
  onSelect,
}: {
  options: Option[]
  onSelect: (id: string) => void
}) {
  return (
    <ul className="space-y-3">
      {options.map((option) => (
        <li key={option.id}>
          <button
            type="button"
            className="option flex items-start gap-x-3"
            onClick={() => onSelect(option.id)}
          >
            {option.icon && <span className="shrink-0">{option.icon}</span>}
            <span className="min-w-0">
              <span className="block">{option.label}</span>
              {option.note && (
                <span className="mt-1 block text-sm text-muted">{option.note}</span>
              )}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}
