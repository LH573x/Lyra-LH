import type { Dataset } from './types'
import { creatorLabel, creatorOf, itemLabel, kindMatches, Tally, type KindFilter, type Ranked } from './stats'
import { calendar, lowerBound, yearRange } from './calendar'

/** Os últimos 30 dias, 6 meses ou 1 ano (até a última reprodução), um ano do calendário ou desde sempre. */
export type PeriodId = 'mes' | 'semestre' | 'ano' | 'sempre' | number

export type TopBy = 'songs' | 'artists' | 'albums'

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

const albumCache = new WeakMap<Dataset, Albums>()

/** Os álbuns: mesmo artista e mesmo nome. */
export function albums(d: Dataset): Albums {
  let a = albumCache.get(d)
  if (a) return a
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
  a = { of, list }
  albumCache.set(d, a)
  return a
}

/** Os `n` mais ouvidos do período: músicas (ou episódios), artistas (ou podcasts) ou álbuns. */
export function topOf(d: Dataset, kind: KindFilter, p: Period, by: TopBy, n: number): Ranked[] {
  const { ms, item, flags } = d.plays
  const al = by === 'albums' ? albums(d) : null
  const key = by === 'artists' ? creatorOf(d) : al ? al.of : null
  const t = new Tally(by === 'artists' ? d.creators.length : al ? al.list.length : d.items.length)
  for (let i = p.lo; i < p.hi; i++) {
    if (!kindMatches(flags[i], kind)) continue
    const id = key ? key[item[i]] : item[i]
    if (id >= 0) t.add(id, ms[i])
  }
  if (by === 'artists') return t.ranked(n, creatorLabel(d))
  if (al) return t.ranked(n, (id) => [al.list[id].name, d.creators[al.list[id].creator]])
  return t.ranked(n, itemLabel(d))
}
