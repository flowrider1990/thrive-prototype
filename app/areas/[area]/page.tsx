import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { AreaScreen } from '@/components/area-screen'
import { areas, isAreaId } from '@/lib/areas'

/**
 * The five ids are a compile-time constant, so this export is exhaustive by
 * construction.
 *
 * `output: 'export'` requires it — a dynamic segment without it is a build error —
 * and rejects an empty array, so the general advice to "always return an array, even
 * if empty" does not apply here. Do **not** add `dynamicParams`: writing even its
 * default value of `true` is a build error under a static export.
 */
export function generateStaticParams() {
  return areas.map((area) => ({ area }))
}

/**
 * One life area, deep-linkable.
 *
 * This file is a server component, and the reason is narrow: a `'use client'` file
 * cannot export `generateStaticParams`. So it does the two things that must happen
 * at build time and nothing else.
 *
 * In particular it renders **no copy, reads no locale, and touches no storage** —
 * all of that waits for the browser inside `AreaScreen`, which is what keeps the
 * i18n catalogs the single source of every user-visible string (`CLAUDE.md` §10) and
 * the prerendered HTML free of assumptions about the person (§9).
 */
export default async function AreaPage({ params }: PageProps<'/areas/[area]'>) {
  const { area } = await params

  // `params` is typed `string`, because a URL can say anything. Narrowing here is
  // what lets `AreaScreen` take an `AreaId` rather than re-validating. Unreachable
  // under a static export — only the five generated paths exist — so this is about
  // the type, not about a request that could arrive.
  if (!isAreaId(area)) notFound()

  /**
   * The `Suspense` boundary is required, not stylistic.
   *
   * `AreaScreen` reads `?from=` with `useSearchParams()` to decide where back goes, and
   * on a prerendered route that hook bails the client tree up to the nearest boundary
   * out of prerendering. Without one, `next build` fails outright — the bundled docs
   * are explicit about it (`use-search-params.md`: "a static page that calls
   * `useSearchParams` from a Client Component must be wrapped in a `Suspense`
   * boundary"). It also passes in `pnpm dev` without the boundary, because development
   * renders on demand, so this is a defect that only appears in a production build.
   *
   * `fallback={null}` rather than a skeleton: every screen in this app already renders
   * nothing until the store and the locale are known, so there is nothing honest to put
   * here. The prerendered HTML for this route stays free of assumptions about the
   * person, which is the §9 rule this file exists to respect.
   */
  return (
    <Suspense fallback={null}>
      <AreaScreen area={area} />
    </Suspense>
  )
}
