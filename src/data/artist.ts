import type { Dataset } from './types'
import { MIN_PLAY_MS, Tally, creatorOf } from './stats'
import { calendar, monthKeyOf } from './calendar'

export interface ArtistDetail {
  id: number
  name: string
  kind: 'music' | 'podcast'
  totalMs: number
  plays: number
  /** Posição entre todos os artistas (ou programas) de todos os tempos, 1 = mais ouvido. */
  rank: number
  rankOf: number
  first: { t: number; item: string } | null
  last: { t: number; item: string } | null
  monthly: { month: string; hours: number }[]
  yearly: { year: number; ms: number; rank: number }[]
  topItems: { id: number; name: string; album: string; ms: number; plays: number }[]
  itemCount: number
}

export function artistDetail(d: Dataset, id: number): ArtistDetail | null {
  if (!d.creators[id]) return null
  const { start, ms, item } = d.plays
  const cal = calendar(d)
  const creator = creatorOf(d)
  const kind = d.items.find((it) => it.creator === id)?.kind ?? 'music'
  const sameKind = Uint8Array.from(d.items, (it) => (it.kind === kind ? 1 : 0))

  // Totais de todos os criadores do mesmo tipo, para a posição no ranking geral e por ano.
  const totals = new Float64Array(d.creators.length)
  const yearMs = new Float64Array(d.creators.length)
  let yearCreators: number[] = []
  let year = NaN
  const yearly: ArtistDetail['yearly'] = []
  const closeYear = () => {
    const mine = yearMs[id]
    if (mine > 0) {
      let rank = 1
      for (const c of yearCreators) if (yearMs[c] > mine) rank++
      yearly.push({ year, ms: mine, rank })
    }
    for (const c of yearCreators) yearMs[c] = 0
    yearCreators = []
  }
  const byMonth = new Map<number, number>()
  const byItem = new Tally(d.items.length)
  let totalMs = 0
  let plays = 0
  let first: ArtistDetail['first'] = null
  let last: ArtistDetail['last'] = null

  for (let i = 0; i < item.length; i++) {
    const it = item[i]
    if (!sameKind[it]) continue
    const c = creator[it]
    const played = ms[i]
    if (cal.year[i] !== year) {
      closeYear()
      year = cal.year[i]
    }
    totals[c] += played
    if (yearMs[c] === 0) yearCreators.push(c)
    yearMs[c] += played
    if (c !== id) continue

    totalMs += played
    byMonth.set(cal.month[i], (byMonth.get(cal.month[i]) ?? 0) + played)
    byItem.add(it, played)
    if (played >= MIN_PLAY_MS) {
      plays++
      first ??= { t: start[i], item: d.items[it].name }
      last = { t: start[i], item: d.items[it].name }
    }
  }
  closeYear()
  if (totalMs === 0) return null

  let rank = 1
  let rankOf = 0
  for (let c = 0; c < totals.length; c++) {
    if (totals[c] === 0) continue
    rankOf++
    if (totals[c] > totalMs) rank++
  }

  // Os meses vêm em ordem; os sem nada entram com zero, para o gráfico não pular buracos.
  const months = [...byMonth.keys()]
  const monthly: ArtistDetail['monthly'] = []
  for (let m = months[0]; m <= months[months.length - 1]; m++) monthly.push({ month: monthKeyOf(m), hours: (byMonth.get(m) ?? 0) / 3.6e6 })

  return {
    id,
    name: d.creators[id],
    kind,
    totalMs,
    plays,
    rank,
    rankOf,
    first,
    last,
    monthly,
    yearly,
    topItems: byItem.top(10).map((iid) => ({ id: iid, name: d.items[iid].name, album: d.items[iid].album, ms: byItem.ms[iid], plays: byItem.plays[iid] })),
    itemCount: byItem.ids.length,
  }
}
