import { useMemo } from 'react'
import type { Dataset } from '../data/types'
import type { KindFilter } from '../data/stats'
import { topCreatorView } from '../data/views'
import { artistRef } from '../data/refs'
import { usePageTint, useTint } from './tint'

/** O topo das abas ganha a cor da foto do seu artista nº 1 do período escolhido, como o Spotify faz. */
export function PageTint({ data, year, kind }: { data: Dataset; year: number | null; kind: KindFilter }) {
  const top = useMemo(() => topCreatorView(data, year, kind), [data, year, kind])
  usePageTint(useTint(top === null ? null : artistRef(data, top), top === null ? '' : data.creators[top]))
  return null
}
