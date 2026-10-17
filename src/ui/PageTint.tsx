import { useMemo } from 'react'
import type { Dataset } from '../data/types'
import { creatorOf, kindMatches, type KindFilter } from '../data/stats'
import { yearRange } from '../data/calendar'
import { artistRef } from '../data/refs'
import { usePageTint, useTint } from './tint'

/** Quem você mais ouviu no período (artista ou podcast), ou null se não tem nada. */
function topCreator(d: Dataset, year: number | null, kind: KindFilter): number | null {
  const { ms, item, flags } = d.plays
  const creator = creatorOf(d)
  const total = new Float64Array(d.creators.length)
  const [lo, hi] = yearRange(d, year)
  for (let i = lo; i < hi; i++) if (kindMatches(flags[i], kind)) total[creator[item[i]]] += ms[i]
  let best = -1
  for (let c = 0; c < total.length; c++) if (total[c] > 0 && (best < 0 || total[c] > total[best])) best = c
  return best < 0 ? null : best
}

/** O topo das abas ganha a cor da foto do seu artista nº 1 do período escolhido, como o Spotify faz. */
export function PageTint({ data, year, kind }: { data: Dataset; year: number | null; kind: KindFilter }) {
  const top = useMemo(() => topCreator(data, year, kind), [data, year, kind])
  usePageTint(useTint(top === null ? null : artistRef(data, top), top === null ? '' : data.creators[top]))
  return null
}
