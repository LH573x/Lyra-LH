import type { Dataset } from './types'
import { creatorLabel, creatorOf, itemLabel, kindMatches, Tally, type KindFilter, type Ranked } from './stats'
import { calendar, lowerBound, yearRange } from './calendar'
import { memo } from './memo'

/** Os últimos 30 dias, 6 meses ou 1 ano (até a última reprodução), um ano do calendário ou desde sempre. */
export type PeriodId = 'mes' | 'semestre' | 'ano' | 'sempre' | number

export type TopBy = 'songs' | 'artists' | 'albums'

/** As reproduções [lo, hi). */
type Range = Pick<Period, 'lo' | 'hi'>

/** Um período e as reproduções dele: [lo, hi). */
export interface Period {
  id: PeriodId
  lo: number
  hi: number
}

const DAY = 86_400_000
const WINDOWS = [
  { id: 'mes' as const, days: 30 },
  { id: 'semestre' as const, days: 182 },
  { id: 'ano' as const, days: 365 },
]

/** Existe alguma reprodução do tipo entre lo e hi? */
function any(d: Dataset, kind: KindFilter, lo: number, hi: number) {
  const { flags } = d.plays
  for (let i = lo; i < hi; i++) if (kindMatches(flags[i], kind)) return true
  return false
}

/**
 * Os períodos que fazem sentido para o arquivo: as janelas que terminam na última reprodução
 * (só as que não cobrem o histórico inteiro), os anos do mais recente ao mais antigo e "desde sempre"
 * (quando há mais de um ano).
 */
export function periods(d: Dataset, kind: KindFilter): Period[] {
  const { start, flags } = d.plays
  let first = 0
  while (first < start.length && !kindMatches(flags[first], kind)) first++
  let last = start.length - 1
  while (last >= first && !kindMatches(flags[last], kind)) last--
  if (last < first) return []
  const out: Period[] = []
  for (const w of WINDOWS) {
    const from = start[last] - w.days * DAY
    if (from > start[first]) out.push({ id: w.id, lo: lowerBound(start, from), hi: last + 1 })
  }
  const years = calendar(d)
    .years.filter((y) => {
      const [lo, hi] = yearRange(d, y)
      return any(d, kind, lo, hi)
    })
    .reverse()
  for (const y of years) {
    const [lo, hi] = yearRange(d, y)
    out.push({ id: y, lo, hi })
  }
  if (years.length > 1) out.push({ id: 'sempre', lo: 0, hi: start.length })
  return out
}

export interface Album {
  name: string
  creator: number
}

interface Albums {
  /** Álbum de cada música, ou -1 (podcast, ou histórico básico, que não traz o álbum). */
  of: Int32Array
  list: Album[]
}

/** Os álbuns: mesmo artista e mesmo nome. */
export const albums = (d: Dataset): Albums => memo(d, 'albums', () => findAlbums(d))

function findAlbums(d: Dataset): Albums {
  const of = new Int32Array(d.items.length).fill(-1)
  const list: Album[] = []
  const index = new Map<string, number>()
  d.items.forEach((it, i) => {
    if (it.kind !== 'music' || !it.album) return
    const key = `${it.creator}\u0000${it.album}`
    let id = index.get(key)
    if (id === undefined) {
      id = list.length
      index.set(key, id)
      list.push({ name: it.album, creator: it.creator })
    }
    of[i] = id
  })
  return { of, list }
}

/** Tempo somado por música (ou episódio), artista (ou podcast) ou álbum nas reproduções [lo, hi). */
function tally(d: Dataset, kind: KindFilter, p: Range, by: TopBy): Tally {
  const { ms, item, flags } = d.plays
  const al = by === 'albums' ? albums(d) : null
  const key = by === 'artists' ? creatorOf(d) : al ? al.of : null
  const t = new Tally(by === 'artists' ? d.creators.length : al ? al.list.length : d.items.length)
  for (let i = p.lo; i < p.hi; i++) {
    if (!kindMatches(flags[i], kind)) continue
    const id = key ? key[item[i]] : item[i]
    if (id >= 0) t.add(id, ms[i])
  }
  return t
}

/** Os `n` mais ouvidos do período: músicas (ou episódios), artistas (ou podcasts) ou álbuns. */
export function topOf(d: Dataset, kind: KindFilter, p: Period, by: TopBy, n: number): Ranked[] {
  const t = tally(d, kind, p, by)
  if (by === 'artists') return t.ranked(n, creatorLabel(d))
  if (by === 'albums') {
    const list = albums(d).list
    return t.ranked(n, (id) => [list[id].name, d.creators[list[id].creator]])
  }
  return t.ranked(n, itemLabel(d))
}

/**
 * O período de mesmo tamanho logo antes, para comparar: os 30 dias (6 meses, 1 ano) anteriores
 * ou o ano anterior. "Desde sempre" não tem; sem nada do tipo nele, também não.
 */
function previous(d: Dataset, kind: KindFilter, p: Period): Range | null {
  if (p.id === 'sempre') return null
  let lo: number
  let hi: number
  if (typeof p.id === 'number') [lo, hi] = yearRange(d, p.id - 1)
  else {
    const { start } = d.plays
    const days = WINDOWS.find((w) => w.id === p.id)?.days ?? 0
    const from = start[p.hi - 1] - days * DAY
    lo = lowerBound(start, from - days * DAY)
    hi = p.lo
  }
  return any(d, kind, lo, hi) ? { lo, hi } : null
}

/** A posição (1 = o mais ouvido) de cada um dos `n` primeiros do período anterior; null quando não há com o que comparar. */
export function previousRanks(d: Dataset, kind: KindFilter, p: Period, by: TopBy, n: number): Map<number, number> | null {
  const prev = previous(d, kind, p)
  if (!prev) return null
  const ranks = new Map<number, number>()
  tally(d, kind, prev, by)
    .top(n)
    .forEach((id, i) => ranks.set(id, i + 1))
  return ranks
}

/** Tempo ouvido do tipo no período, com a primeira e a última reprodução dele. */
export function periodSpan(d: Dataset, kind: KindFilter, p: Period) {
  const { start, ms, flags } = d.plays
  let total = 0
  let from = NaN
  let to = NaN
  for (let i = p.lo; i < p.hi; i++) {
    if (!kindMatches(flags[i], kind)) continue
    total += ms[i]
    if (Number.isNaN(from)) from = start[i]
    to = start[i]
  }
  return { ms: total, from, to }
}
