'use client'

import Link from 'next/link'
import { ArrowLeft } from '@/components/icons'

/**
 * The way up from a nested page, in one place so every nested page does it the same.
 *
 * It goes to an **explicit parent route** rather than to `history.back()`. Browser
 * back returns to wherever you came from, which is not the same question — arriving
 * at `/areas/body/` from a link on the start page and pressing a back control should
 * still offer the life areas, because that is what this page is part of. The browser's
 * own back button already does the other thing, and better.
 *
 * A `Link`: it navigates and writes nothing. The `.nav-link` class is shared with the
 * header for a reason — it is what keeps the size, colour and hover of a back link
 * identical to the rest of the app's navigation, so this cannot drift into a third
 * kind of link.
 *
 * It sits above the page's own heading, not at the foot. A nested page can be as long
 * as the person's history, and a way back that has to be scrolled to is not a way back
 * for someone who took a wrong turn.
 */
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <div>
      <Link href={href} className="nav-link inline-flex items-center gap-x-1.5 text-sm">
        <ArrowLeft />
        {label}
      </Link>
    </div>
  )
}
