'use client'

export type ChoiceOption = {
  label: string
  onSelect: () => void
  /** 'primary' for the affirmative path, 'quiet' for the other — never absent. */
  tone?: 'primary' | 'quiet'
}

/**
 * Two real options, side by side and equally reachable. Declining is not hidden
 * in small print: it is the second button, and it works.
 */
export function Choice({ options }: { options: ChoiceOption[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={option.onSelect}
          className={`btn ${option.tone === 'quiet' ? 'btn-quiet' : 'btn-primary'}`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
