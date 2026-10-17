import { FLAG_PODCAST, type Dataset } from './types'
import { calendar, monthKeyOf, yearRange } from './calendar'

export type KindFilter = 'all' | 'music' | 'podcast'

export interface Filter {
  /** null = todos os anos */
  year: number | null
  kind: KindFilter
}

/** Mesmo critério do Spotify: só conta como reprodução a partir de 30 segundos. */
export const MIN_PLAY_MS = 30_000

export interface Ranked {
  id: number
  name: string
  sub: string
  ms: number
  plays: number
}

export interface Summary {
  totalMs: number
  plays: number
  creators: number
  items: number
  activeDays: number
  first: number | null
  last: number | null
  topCreators: Ranked[]
  topItems: Ranked[]
  /** Horas por mês: rótulo "2024-03" e horas. */
  monthly: { month: string; hours: number }[]
  /** Total do ano anterior, quando um ano está selecionado. */
  previousYearMs: number | null
}

export function years(d: Dataset): number[] {
  return [...calendar(d).years]
}

export function hasPodcasts(d: Dataset): boolean {
  return d.plays.flags.some((f) => (f & FLAG_PODCAST) !== 0)
}

export function kindMatches(flags: number, kind: KindFilter): boolean {
  if (kind === 'all') return true
  const podcast = (flags & FLAG_PODCAST) !== 0
  return kind === 'podcast' ? podcast : !podcast
}

const creators = new WeakMap<Dataset, Int32Array>()

/** O artista (ou podcast) de cada música, num array só: os laços leem daqui. */
export function creatorOf(d: Dataset): Int32Array {
  let c = creators.get(d)
  if (!c) {
    c = Int32Array.from(d.items, (it) => it.creator)
    creators.set(d, c)
  }
  return c
}

/**
 * Tempo e reproduções somados por artista (ou música), lembrando a ordem em que cada um
 * apareceu: no empate, fica na frente quem você ouviu primeiro.
 */
export class Tally {
  ms: Float64Array
  plays: Int32Array
  ids: number[] = []
  constructor(size: number) {
    this.ms = new Float64Array(size)
    this.plays = new Int32Array(size)
  }
  add(id: number, ms: number) {
    // Toda reprodução tem pelo menos 1 ms: zero quer dizer que é a primeira vez.
    if (this.ms[id] === 0) this.ids.push(id)
    this.ms[id] += ms
    if (ms >= MIN_PLAY_MS) this.plays[id]++
  }
  /** Os `n` com mais tempo. */
  top(n: number): number[] {
    const ms = this.ms
    return this.ids
      .slice()
      .sort((a, b) => ms[b] - ms[a])
      .slice(0, n)
  }
  ranked(n: number, label: (id: number) => [string, string]): Ranked[] {
    return this.top(n).map((id) => {
      const [name, sub] = label(id)
      return { id, name, sub, ms: this.ms[id], plays: this.plays[id] }
    })
  }
}

export const creatorLabel = (d: Dataset) => (id: number): [string, string] => [d.creators[id], '']
export const itemLabel = (d: Dataset) => (id: number): [string, string] => [d.items[id].name, d.creators[d.items[id].creator]]

export function summarize(d: Dataset, f: Filter, topN = 10): Summary {
  const { start, ms, item, flags } = d.plays
  const cal = calendar(d)
  const creator = creatorOf(d)
  const byCreator = new Tally(d.creators.length)
  const byItem = new Tally(d.items.length)
  const [lo, hi] = yearRange(d, f.year)
  let totalMs = 0
  let plays = 0
  let activeDays = 0
  let day = NaN
  let firstAt = -1
  let lastAt = -1

  // Os meses do período, em ordem (os índices crescem junto com as reproduções).
  const month0 = f.year !== null ? f.year * 12 : lo < hi ? cal.month[lo] : 0
  const byMonth = new Float64Array(f.year !== null ? 12 : lo < hi ? cal.month[hi - 1] - month0 + 1 : 0)

  for (let i = lo; i < hi; i++) {
    if (!kindMatches(flags[i], f.kind)) continue
    const played = ms[i]
    totalMs += played
    if (played >= MIN_PLAY_MS) plays++
    if (firstAt < 0) firstAt = i
    lastAt = i
    if (cal.day[i] !== day) {
      day = cal.day[i]
      activeDays++
    }
    byMonth[cal.month[i] - month0] += played
    const it = item[i]
    byCreator.add(creator[it], played)
    byItem.add(it, played)
  }

  let previousYearMs = 0
  if (f.year !== null) {
    const [plo, phi] = yearRange(d, f.year - 1)
    for (let i = plo; i < phi; i++) if (kindMatches(flags[i], f.kind)) previousYearMs += ms[i]
  }

  // Meses contínuos (inclui meses sem nada, com zero), para a linha não "pular" buracos.
  const monthly: Summary['monthly'] = []
  if (firstAt >= 0) {
    const from = f.year !== null ? month0 : cal.month[firstAt]
    const to = f.year !== null ? month0 + 11 : cal.month[lastAt]
    for (let m = from; m <= to; m++) monthly.push({ month: monthKeyOf(m), hours: byMonth[m - month0] / 3.6e6 })
  }

  return {
    totalMs,
    plays,
    creators: byCreator.ids.length,
    items: byItem.ids.length,
    activeDays,
    first: firstAt < 0 ? null : start[firstAt],
    last: lastAt < 0 ? null : start[lastAt],
    topCreators: byCreator.ranked(topN, creatorLabel(d)),
    topItems: byItem.ranked(topN, itemLabel(d)),
    monthly,
    previousYearMs: f.year !== null && previousYearMs > 0 ? previousYearMs : null,
  }
}

export interface YearTop {
  /** null = todos os anos juntos. */
  year: number | null
  /** Quem você mais ouviu no ano (artista ou podcast). */
  top: string | null
  ms: number
}

/** Para cada ano (e para todos juntos), o artista mais ouvido: vai na capa do disco daquele ano. */
export function yearTops(d: Dataset, kind: KindFilter): YearTop[] {
  const { ms, item, flags } = d.plays
  const creator = creatorOf(d)
  const all = new Tally(d.creators.length)
  let allMs = 0
  const out: YearTop[] = []
  for (const year of calendar(d).years) {
    const [lo, hi] = yearRange(d, year)
    const y = new Tally(d.creators.length)
    let total = 0
    for (let i = lo; i < hi; i++) {
      if (!kindMatches(flags[i], kind)) continue
      const c = creator[item[i]]
      y.add(c, ms[i])
      all.add(c, ms[i])
      total += ms[i]
    }
    out.push({ year, top: best(d, y), ms: total })
    allMs += total
  }
  out.push({ year: null, top: best(d, all), ms: allMs })
  return out
}

function best(d: Dataset, t: Tally): string | null {
  let id = -1
  let v = 0
  for (const k of t.ids) if (t.ms[k] > v) [id, v] = [k, t.ms[k]]
  return id < 0 ? null : d.creators[id]
}

/** Quem você mais ouviu no período (artista ou podcast), ou null se não tem nada. */
export function topCreator(d: Dataset, year: number | null, kind: KindFilter): number | null {
  const { ms, item, flags } = d.plays
  const creator = creatorOf(d)
  const total = new Float64Array(d.creators.length)
  const [lo, hi] = yearRange(d, year)
  for (let i = lo; i < hi; i++) if (kindMatches(flags[i], kind)) total[creator[item[i]]] += ms[i]
  let best = -1
  for (let c = 0; c < total.length; c++) if (total[c] > 0 && (best < 0 || total[c] > total[best])) best = c
  return best < 0 ? null : best
}
