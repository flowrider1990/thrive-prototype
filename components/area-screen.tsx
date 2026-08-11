'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { AreaManage } from '@/components/area-manage'
import { BackLink } from '@/components/back-link'
import { PageShell } from '@/components/page-shell'
import type { AreaId } from '@/lib/areas'
import { useI18n, type Messages } from '@/lib/i18n'

/** Where the person came from, and therefore where "back" means. */
type Origin = { href: string; label: (m: Messages) => string }

const PARENT: Origin = { href: '/areas', label: (m) => m.manage.back }
const HOME: Origin = { href: '/', label: (m) => m.manage.backHome }

/**
 * Where back should go, from `?from=`.
 *
 * This page has two ways in — the life-areas list, and an area's name on the start page
 * — so a single hard-coded parent would be wrong for one of them. The origin travels in
 * the URL rather than in remembered state, so it survives a reload and cannot go stale.
 *
 * **`useSearchParams()`, not `window.location.search`.** That was the first attempt and
 * it was quietly wrong: reading `window` during render is not reactive, and on a
 * client-side navigation Next renders the new route *before* committing the URL. So the
 * one render that mattered saw an empty search string and nothing re-ran — the link said
 * "Back to your life areas" on a page opened from the start page. The URL was correct
 * the whole time, which is what made it look like a test problem rather than a bug.
 * `useSearchParams` is subscribed to the router, so it re-renders when the URL commits.
 *
 * The cost is a `Suspense` boundary in the route file, which is required for a
 * prerendered route and explained there.
 *
 * **Anything unrecognised falls back to the list** — the parent route, always a correct
 * place to be. A deep link, a shared URL or a hand-typed address gets that rather than a
 * dead end, and deliberately not `history.back()`, which would leave the app entirely
 * when this page was the first one opened.
 */
function useOrigin(): Origin {
  return useSearchParams().get('from') === 'home' ? HOME : PARENT
}

/**
 * The browser half of `/areas/<id>/`.
 *
 * Everything a person reads lives here rather than in the route file, because the
 * route file runs at build time where there is no locale and no person. `AreaManage`
 * is reused unchanged; all this adds is the shell, the readiness gate, and where
 * "done" and "back" go.
 */
export function AreaScreen({ area }: { area: AreaId }) {
  const { m, status } = useI18n()
  const router = useRouter()
  // Before the readiness gate: a hook after an early return would change the call
  // order between renders, which React rejects outright.
  const from = useOrigin()

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  return (
    <PageShell>
      {/**
       * The back link lives here rather than inside `AreaManage`, and that is the
       * point: it is chrome belonging to the *route*, not content belonging to one of
       * the seven views `AreaManage` can be in. Put inside, it would have to be
       * repeated in each of them and would go missing from whichever was added next.
       *
       * So it is present on every view, including the questions. Three of those —
       * changing the goal, adding something, and the goal-change review — offered no
       * way out at all, and someone who opened one by mistake had only the browser's
       * back button. Nothing here is written until an answer is submitted, so leaving
       * costs only what has been typed, which is what any Cancel would cost.
       *
       * "Done" goes to the same place. It means "I have finished with this area", which
       * is a different sentence from "take me up a level", but both should land where
       * the person actually came from rather than at a fixed address.
       *
       * `space-y-6` matches `/data/stored/`'s header, so the way back sits the same
       * distance from the content on both nested routes.
       */}
      <div className="space-y-6">
        <BackLink href={from.href} label={from.label(m)} />
        {/* `key` so that following a link from one area to another remounts rather
            than carrying the previous area's sub-view across. */}
        <AreaManage key={area} area={area} onDone={() => router.push(from.href)} />
      </div>
    </PageShell>
  )
}
