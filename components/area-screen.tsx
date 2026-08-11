'use client'

import { useRouter } from 'next/navigation'
import { AreaManage } from '@/components/area-manage'
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
  const { status } = useI18n()
  const router = useRouter()

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  return (
    <PageShell>
      {/* `key` so that following a link from one area to another remounts rather
          than carrying the previous area's sub-view across. */}
      <AreaManage key={area} area={area} onDone={() => router.push('/areas')} />
    </PageShell>
  )
}
