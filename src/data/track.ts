import { FLAG_SKIPPED, type Dataset } from './types'
import { MIN_PLAY_MS, creatorOf } from './stats'
import { calendar, dayKeyOf, monthKeyOf } from './calendar'

export interface TrackDetail {
  id: number
  name: string
  creator: number
  album: string
  kind: 'music' | 'podcast'
  totalMs: number
  /** Reproduções de 30 s ou mais. */
  plays: number
  /** Vezes que começou a tocar e quantas dessas você pulou. */
  starts: number
  skips: number
  /** Posição entre todas as músicas (ou episódios), 1 = mais ouvida. */
  rank: number
  rankOf: number
  /** Parte do tempo que você passou ouvindo o artista. */
  artistShare: number
  first: number | null
  last: number | null
  /** Dias diferentes em que tocou. */
  days: number
  /** Dia em que mais tocou. */
  bestDay: { day: string; plays: number } | null
  /** Reproduções por mês, do primeiro ao último mês em que tocou. */
  monthly: { month: string; plays: number }[]
  yearly: { year: number; plays: number; ms: number; rank: number }[]
  /** Reproduções em cada hora do dia (0 a 23). */
  byHour: number[]
}

export function trackDetail(d: Dataset, id: number): TrackDetail | null {
  const me = d.items[id]
  if (!me) return null
  const { start, ms, item, flags } = d.plays
  const cal = calendar(d)
  const creator = creatorOf(d)
  const sameKind = Uint8Array.from(d.items, (it) => (it.kind === me.kind ? 1 : 0))
  const totals = new Float64Array(d.items.length)
  // Total de cada música no ano corrente, para a posição dela em cada ano.
  const yearMs = new Float64Array(d.items.length)
  let yearItems: number[] = []
  let year = NaN
  let mine: { plays: number; ms: number } | null = null
  const yearly: TrackDetail['yearly'] = []
  const closeYear = () => {
    if (mine) {
      let rank = 1
      for (const it of yearItems) if (yearMs[it] > mine.ms) rank++
      yearly.push({ year, plays: mine.plays, ms: mine.ms, rank })
    }
    for (const it of yearItems) yearMs[it] = 0
    yearItems = []
    mine = null
  }
  let artistMs = 0
  let totalMs = 0
  let plays = 0
  let starts = 0
  let skips = 0
  let first: number | null = null
  let last: number | null = null
  const byMonth = new Map<number, number>()
  let days = 0
  let day = NaN
  let dayPlays = 0
  let bestDay: { day: number; plays: number } | null = null
  const byHour = new Array<number>(24).fill(0)

  for (let i = 0; i < item.length; i++) {
    const it = item[i]
    if (!sameKind[it]) continue
    const played = ms[i]
    if (cal.year[i] !== year) {
      closeYear()
      year = cal.year[i]
    }
    totals[it] += played
    if (yearMs[it] === 0) yearItems.push(it)
    yearMs[it] += played
    if (creator[it] === me.creator) artistMs += played
    if (it !== id) continue

    totalMs += played
    starts++
    if (flags[i] & FLAG_SKIPPED) skips++
    mine ??= { plays: 0, ms: 0 }
    mine.ms += played
    if (played < MIN_PLAY_MS) continue
    plays++
    mine.plays++
    first ??= start[i]
    last = start[i]
    byMonth.set(cal.month[i], (byMonth.get(cal.month[i]) ?? 0) + 1)
    if (cal.day[i] !== day) {
      day = cal.day[i]
      dayPlays = 0
      days++
    }
    dayPlays++
    if (!bestDay || dayPlays > bestDay.plays) bestDay = { day, plays: dayPlays }
    byHour[cal.hour[i]]++
  }
  closeYear()
  if (totalMs === 0) return null

  let rank = 1
  let rankOf = 0
  for (let it = 0; it < totals.length; it++) {
    if (totals[it] === 0) continue
    rankOf++
    if (totals[it] > totalMs) rank++
  }

  const months = [...byMonth.keys()]
  const monthly: TrackDetail['monthly'] = []
  if (months.length) for (let m = months[0]; m <= months[months.length - 1]; m++) monthly.push({ month: monthKeyOf(m), plays: byMonth.get(m) ?? 0 })

  return {
    id,
    name: me.name,
    creator: me.creator,
    album: me.album,
    kind: me.kind,
    totalMs,
    plays,
    starts,
    skips,
    rank,
    rankOf,
    artistShare: artistMs ? totalMs / artistMs : 0,
    first,
    last,
    days,
    bestDay: bestDay && { day: dayKeyOf(bestDay.day), plays: bestDay.plays },
    monthly,
    yearly,
    byHour,
  }
}
