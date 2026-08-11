'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/**
 * A small disclosure dropdown: a trigger, and a panel that closes on Escape, on a
 * click outside, and when something inside it is chosen.
 *
 * Deliberately **not** `role="menu"`. A real menu owes the user arrow-key roving
 * focus, and claiming the role without implementing it is worse than not claiming
 * it — screen reader users would be told to expect keys that do nothing. As a
 * disclosure, the links and buttons inside are reachable with Tab, which is what
 * actually happens here.
 *
 * `children` is a render prop so items can close the panel after acting.
 */
export function Menu({
  label,
  trigger,
  align = 'end',
  children,
}: {
  /** Accessible name for the trigger — it has an icon or a code, not a sentence. */
  label: string
  trigger: ReactNode
  align?: 'start' | 'end'
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    // Captured once: by the time cleanup runs, the ref may already point elsewhere.
    const wrapper = wrapperRef.current

    function onPointerDown(event: PointerEvent) {
      if (!wrapper?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      setOpen(false)
      // Focus goes back where it came from, or it lands nowhere and the next Tab
      // starts from the top of the page.
      triggerRef.current?.focus()
    }
    // Also close when focus leaves the whole widget, so tabbing past the last
    // item does not leave an open panel behind.
    function onFocusOut(event: FocusEvent) {
      const next = event.relatedTarget as Node | null
      if (next && !wrapper?.contains(next)) setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    wrapper?.addEventListener('focusout', onFocusOut)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      wrapper?.removeEventListener('focusout', onFocusOut)
    }
  }, [open])

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-muted hover:text-ink"
      >
        {trigger}
      </button>

      {open && (
        <div
          id={panelId}
          className={`absolute top-full z-10 mt-2 min-w-36 rounded-xl border border-line bg-surface p-1 shadow-lg ${
            align === 'end' ? 'end-0' : 'start-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

/** Shared look for anything inside a menu panel, be it a button or a link. */
export const menuItemClass =
  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-start text-sm text-muted transition-colors hover:bg-ground hover:text-ink'

/**
 * Marks the chosen item in a panel. Deliberately a shape and not just a brighter
 * colour: §17 forbids encoding meaning by colour alone. Being an icon, it also
 * adds nothing to the item's text content.
 */
export function Check({ checked }: { checked: boolean }) {
  return (
    <span className="flex w-4 shrink-0 justify-center" aria-hidden="true">
      {checked && (
        <svg
          viewBox="0 0 12 12"
          className="size-3"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 6.5 5 9l4.5-6" />
        </svg>
      )}
    </span>
  )
}

/** The chevron every trigger carries, so a closed panel still looks openable. */
export function Chevron() {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className="size-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  )
}
