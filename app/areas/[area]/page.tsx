import { notFound } from 'next/navigation'
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

  return <AreaScreen area={area} />
}
