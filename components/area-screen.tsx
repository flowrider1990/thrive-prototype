'use client'

import { useRouter } from 'next/navigation'
import { AreaManage } from '@/components/area-manage'
import { BackLink } from '@/components/back-link'
import { PageShell } from '@/components/page-shell'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'

/**
 * The browser half of `/areas/<id>/`.
 *
 * Everything a person reads lives here rather than in the route file, because the
 * route file runs at build time where there is no locale and no person. `AreaManage`
 * is reused unchanged; all this adds is the shell, the readiness gate, and where
 * "done" goes.
 */
export function AreaScreen({ area }: { area: AreaId }) {
  const { m, status } = useI18n()
  const router = useRouter()

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  return (
    <PageShell>
      {/**
       * The back link lives here rather than inside `AreaManage`, and that is the
       * point: it is chrome belonging to the *route*, not content belonging to one of
       * the eight views `AreaManage` can be in. Put inside, it would have to be
       * repeated in each of them and would go missing from whichever was added next.
       *
       * So it is present on every view, including the questions. Three of those —
       * changing the goal, adding something, choosing what to work on — offered no way
       * out at all, and someone who opened one by mistake had only the browser's back
       * button. Nothing here is written until an answer is submitted, so leaving costs
       * only what has been typed, which is what any Cancel would cost.
       *
       * "Done" stays. It means "I have finished with this area" and happens to land in
       * the same place; this answers "take me up a level", which is a different
       * question and needs to be answerable without reading to the bottom of the page.
       */}
      {/* `space-y-6`, matching `/data/stored/`'s header, so the way back sits the same
          distance from the content on both nested routes. */}
      <div className="space-y-6">
        <BackLink href="/areas" label={m.manage.back} />
        {/* `key` so that following a link from one area to another remounts rather
            than carrying the previous area's sub-view across. */}
        <AreaManage key={area} area={area} onDone={() => router.push('/areas')} />
      </div>
    </PageShell>
  )
}
