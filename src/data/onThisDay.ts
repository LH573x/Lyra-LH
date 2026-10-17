import type { Dataset } from './types'
import { kindMatches, type KindFilter } from './stats'
import { calendar, lowerBound } from './calendar'

export interface DayMemory {
  yearsAgo: number
  year: number
  /** A música (ou episódio) que mais tocou no dia. */
  item: number
  /** O artista que mais tocou no dia. */
  creator: number
}

/** "Seu 4 de outubro": o que você ouviu nesta mesma data em cada ano que passou. */
export function onThisDay(d: Dataset, kind: KindFilter, today = new Date()): DayMemory[] {
  const { start, ms, item, flags } = d.plays
  if (start.length === 0) return []
  const firstYear = calendar(d).year[0]
  const m = today.getMonth()
  const day = today.getDate()
  const out: DayMemory[] = []
  for (let year = today.getFullYear() - 1; year >= firstYear; year--) {
    const from = new Date(year, m, day)
    // 29 de fevereiro só existe em ano bissexto.
    if (from.getMonth() !== m) continue
    const to = new Date(year, m, day + 1).getTime()
    const byItem = new Map<number, number>()
    const byCreator = new Map<number, number>()
    let total = 0
    for (let i = lowerBound(start, from.getTime()); i < start.length && start[i] < to; i++) {
      if (!kindMatches(flags[i], kind) || ms[i] === 0) continue
      total += ms[i]
      byItem.set(item[i], (byItem.get(item[i]) ?? 0) + ms[i])
      const c = d.items[item[i]].creator
      byCreator.set(c, (byCreator.get(c) ?? 0) + ms[i])
    }
    if (total === 0) continue
    const best = (map: Map<number, number>) => [...map].reduce((a, b) => (b[1] > a[1] ? b : a))[0]
    out.push({ yearsAgo: today.getFullYear() - year, year, item: best(byItem), creator: best(byCreator) })
  }
  return out
}
