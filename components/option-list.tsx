'use client'

import type { ReactNode } from 'react'

export type Option = {
  id: string
  label: string
  /** A quieter second line: the area's state, or what a step is currently doing. */
  note?: string
  icon?: ReactNode
  /**
   * Whether this option is the one already in force.
   *
   * Renders as `aria-current`, which is the same hook `.nav-link` uses: one source of
   * truth for the visible mark and for the accessibility tree, rather than a tick that
   * says one thing and the accessibility tree saying nothing. A caller marking an
   * option visually **must** set this, or the mark is silent — the tick is
   * `aria-hidden`, and §17 does not allow a state carried by appearance alone.
   */
  current?: boolean
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
            aria-current={option.current ? 'true' : undefined}
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
