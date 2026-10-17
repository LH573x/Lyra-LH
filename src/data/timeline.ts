import type { Dataset } from './types'
import { MIN_PLAY_MS, creatorOf, kindMatches, type KindFilter } from './stats'
import { calendar, monthKeyOf } from './calendar'

export interface YearTop {
  year: number
  totalMs: number
  /** Quem você mais ouviu no ano (artista ou podcast). */
  top: number | null
}

export interface Discovery {
  year: number
  /** Artista conhecido nesse ano que você mais ouviu desde então. */
  best: { id: number; name: string; ms: number; first: number } | null
  count: number
}

export interface Phase {
  id: number
  name: string
  /** Mês do pico, "2021-06". */
  month: string
  peakMs: number
  totalMs: number
}

/** Uma música ouvida muito num mês só. */
export interface SongPhase {
  id: number
  /** Mês do pico, "2021-06". */
  month: string
  peakPlays: number
  totalPlays: number
}

export interface Timeline {
  /** Os anos com alguma reprodução, em ordem. */
  years: YearTop[]
  /** Artistas novos por mês: "2021-06" → quantidade. */
  newPerMonth: { month: string; count: number }[]
  discoveries: Discovery[]
  phases: Phase[]
  /** Todos os artistas, do mais ouvido ao menos ouvido (para a busca). */
  ranking: { id: number; name: string; ms: number }[]
  songPhases: SongPhase[]
  /** As músicas mais ouvidas de todos os tempos (para a busca). */
  songRanking: { id: number; ms: number }[]
}

/** Uma fase precisa de pelo menos 5 h no total e de metade disso concentrada num único mês. */
const PHASE_MIN_MS = 5 * 3.6e6
const PHASE_MIN_SHARE = 0.5
/** Para músicas: pelo menos 12 reproduções, metade delas no mesmo mês. */
const SONG_PHASE_MIN_PLAYS = 12

/** Ordena os ids pelo valor, do maior ao menor (no empate, fica a ordem em que vieram). */
const byValue = (ids: number[], v: ArrayLike<number>) => ids.slice().sort((a, b) => v[b] - v[a])

/**
 * Descobertas: o primeiro play de 30 s+ de cada artista. `heard` vem em ordem de quando
 * você conheceu cada um; `firstAt` é a posição dessa reprodução e `total`, o tempo de sempre.
 */
function findDiscoveries(d: Dataset, heard: number[], firstAt: Int32Array, total: Float64Array) {
  const cal = calendar(d)
  const byYear = new Map<number, Discovery>()
  const newPerMonth = new Map<number, number>()
  for (const c of heard) {
    const i = firstAt[c]
    const m = cal.month[i]
    newPerMonth.set(m, (newPerMonth.get(m) ?? 0) + 1)
    const y = cal.year[i]
    let disc = byYear.get(y)
    if (!disc) byYear.set(y, (disc = { year: y, best: null, count: 0 }))
    disc.count++
    if (!disc.best || total[c] > disc.best.ms) disc.best = { id: c, name: d.creators[c], ms: total[c], first: d.plays.start[i] }
  }
  return { discoveries: [...byYear.values()].sort((a, b) => a.year - b.year), newPerMonth }
}

/** Só as descobertas de cada ano, sem o resto da linha do tempo (para o Wrapped). */
export function discoveries(d: Dataset, kind: KindFilter): Discovery[] {
  const { ms, item, flags } = d.plays
  const creator = creatorOf(d)
  const total = new Float64Array(d.creators.length)
  const firstAt = new Int32Array(d.creators.length).fill(-1)
  const heard: number[] = []
  for (let i = 0; i < item.length; i++) {
    if (!kindMatches(flags[i], kind)) continue
    const c = creator[item[i]]
    total[c] += ms[i]
    if (ms[i] >= MIN_PLAY_MS && firstAt[c] < 0) {
      firstAt[c] = i
      heard.push(c)
    }
  }
  return findDiscoveries(d, heard, firstAt, total).discoveries
}

export function timeline(d: Dataset, kind: KindFilter): Timeline {
  const { ms, item, flags } = d.plays
  const cal = calendar(d)
  const creator = creatorOf(d)
  const nc = d.creators.length
  const ni = d.items.length

  // Em ordem de quando apareceram pela primeira vez (é o desempate dos rankings).
  const total = new Float64Array(nc)
  const creatorOrder: number[] = []
  const firstAt = new Int32Array(nc).fill(-1)
  const heard: number[] = []
  const itemTotal = new Float64Array(ni)
  const itemOrder: number[] = []
  const itemPlays = new Int32Array(ni)
  const playedOrder: number[] = []

  // As reproduções vêm em ordem: cada mês e cada ano é somado e fechado de uma vez.
  const monthMs = new Float64Array(nc)
  let monthCreators: number[] = []
  const peakMs = new Float64Array(nc)
  const peakMonth = new Int32Array(nc)
  const monthPlays = new Int32Array(ni)
  let monthItems: number[] = []
  const peakPlays = new Int32Array(ni)
  const peakPlaysMonth = new Int32Array(ni)
  const yearMs = new Float64Array(nc)
  let yearCreators: number[] = []
  let yearTotal = 0
  let month = -1
  let year = -1
  let firstMonth = -1
  const years: YearTop[] = []

  const closeMonth = () => {
    for (const c of monthCreators) {
      if (monthMs[c] > peakMs[c]) {
        peakMs[c] = monthMs[c]
        peakMonth[c] = month
      }
      monthMs[c] = 0
    }
    for (const it of monthItems) {
      if (monthPlays[it] > peakPlays[it]) {
        peakPlays[it] = monthPlays[it]
        peakPlaysMonth[it] = month
      }
      monthPlays[it] = 0
    }
    monthCreators = []
    monthItems = []
  }
  const closeYear = () => {
    let top = -1
    let v = 0
    for (const c of yearCreators) {
      if (yearMs[c] > v) {
        top = c
        v = yearMs[c]
      }
      yearMs[c] = 0
    }
    years.push({ year, totalMs: yearTotal, top: top < 0 ? null : top })
    yearCreators = []
    yearTotal = 0
  }

  for (let i = 0; i < item.length; i++) {
    if (!kindMatches(flags[i], kind)) continue
    if (cal.month[i] !== month) {
      if (month >= 0) closeMonth()
      month = cal.month[i]
      if (firstMonth < 0) firstMonth = month
    }
    if (cal.year[i] !== year) {
      if (year >= 0) closeYear()
      year = cal.year[i]
    }
    const it = item[i]
    const c = creator[it]
    const played = ms[i]

    if (total[c] === 0) creatorOrder.push(c)
    total[c] += played
    if (monthMs[c] === 0) monthCreators.push(c)
    monthMs[c] += played
    if (yearMs[c] === 0) yearCreators.push(c)
    yearMs[c] += played
    yearTotal += played
    if (itemTotal[it] === 0) itemOrder.push(it)
    itemTotal[it] += played

    if (played < MIN_PLAY_MS) continue
    if (firstAt[c] < 0) {
      firstAt[c] = i
      heard.push(c)
    }
    if (itemPlays[it] === 0) playedOrder.push(it)
    itemPlays[it]++
    if (monthPlays[it] === 0) monthItems.push(it)
    monthPlays[it]++
  }
  if (month >= 0) closeMonth()
  if (year >= 0) closeYear()

  const found = findDiscoveries(d, heard, firstAt, total)
  const newPerMonth: Timeline['newPerMonth'] = []
  if (firstMonth >= 0) for (let m = firstMonth; m <= month; m++) newPerMonth.push({ month: monthKeyOf(m), count: found.newPerMonth.get(m) ?? 0 })

  // Fases: artistas cuja escuta se concentrou num mês só.
  const phases: Phase[] = []
  for (const c of creatorOrder) {
    const t = total[c]
    if (t >= PHASE_MIN_MS && peakMs[c] / t >= PHASE_MIN_SHARE) {
      phases.push({ id: c, name: d.creators[c], month: monthKeyOf(peakMonth[c]), peakMs: peakMs[c], totalMs: t })
    }
  }
  phases.sort((a, b) => b.peakMs - a.peakMs)

  const songPhases: SongPhase[] = []
  for (const it of playedOrder) {
    if (d.items[it].kind !== 'music') continue
    const plays = itemPlays[it]
    if (plays >= SONG_PHASE_MIN_PLAYS && peakPlays[it] / plays >= PHASE_MIN_SHARE) {
      songPhases.push({ id: it, month: monthKeyOf(peakPlaysMonth[it]), peakPlays: peakPlays[it], totalPlays: plays })
    }
  }
  songPhases.sort((a, b) => b.peakPlays - a.peakPlays)

  return {
    years,
    newPerMonth,
    discoveries: found.discoveries,
    phases: phases.slice(0, 10),
    ranking: byValue(creatorOrder, total).map((id) => ({ id, name: d.creators[id], ms: total[id] })),
    songPhases: songPhases.slice(0, 10),
    songRanking: byValue(itemOrder, itemTotal).map((id) => ({ id, ms: itemTotal[id] })),
  }
}
