import type { Dataset } from './types'
import { MIN_PLAY_MS, creatorOf, kindMatches, summarize, type Filter, type KindFilter, type Ranked } from './stats'
import { DAY_PARTS } from './habits'
import { calendar, dayKeyOf, yearRange } from './calendar'

/** Pausa máxima entre duas faixas para ainda contar como a mesma sessão. */
const SESSION_GAP_MS = 10 * 60_000

export interface Records {
  /** Maior tempo ouvindo sem pausa de mais de 10 minutos. */
  marathon: { start: number; end: number; tracks: number } | null
  /** A mesma música mais vezes num só dia. */
  repeatDay: { item: number; day: string; count: number } | null
  /** A madrugada (0h às 6h) com mais tempo ouvindo; `day` é a data dessa madrugada. */
  lateNight: { day: string; ms: number } | null
  /** Mais faixas seguidas do mesmo artista. */
  artistRun: { creator: number; count: number; start: number } | null
  /** A faixa ouvida no maior número de dias diferentes. */
  loyal: { item: number; days: number } | null
  /** A primeira faixa do período. */
  first: { item: number; t: number } | null
  /** O dia com mais artistas diferentes. */
  variety: { day: string; artists: number } | null
}

/** Marca de "nenhum dia" nos arrays de dias. */
const NONE = -0x80000000

export function records(d: Dataset, f: Filter): Records {
  const { start, ms, item, flags } = d.plays
  const cal = calendar(d)
  const creator = creatorOf(d)
  let marathon: Records['marathon'] = null
  let sStart = 0
  let sEnd = -Infinity
  let sTracks = 0
  let repeatDay: { item: number; day: number; count: number } | null = null
  // Vezes que cada música tocou no dia `onDay[it]`.
  const onDay = new Int32Array(d.items.length).fill(NONE)
  const timesToday = new Int32Array(d.items.length)
  let nightDay = NONE
  let nightMs = 0
  // Atribuídos dentro das funções de fechar (o `as` impede o TypeScript de achar que continuam null).
  let lateNight = null as { day: number; ms: number } | null
  let artistRun: Records['artistRun'] = null
  let runCreator = -1
  let runCount = 0
  let runStart = 0
  // Dias diferentes de cada música (o último dia já contado fica em `lastDay`).
  const lastDay = new Int32Array(d.items.length).fill(NONE)
  const dayCount = new Int32Array(d.items.length)
  const playedOrder: number[] = []
  let first: Records['first'] = null
  // Artistas diferentes no dia `varietyDay`.
  const creatorDay = new Int32Array(d.creators.length).fill(NONE)
  let varietyDay = NONE
  let artists = 0
  let variety = null as { day: number; artists: number } | null

  const closeSession = () => {
    if (sTracks > 1 && (!marathon || sEnd - sStart > marathon.end - marathon.start)) {
      marathon = { start: sStart, end: sEnd, tracks: sTracks }
    }
  }
  const closeNight = () => {
    if (nightDay !== NONE && (!lateNight || nightMs > lateNight.ms)) lateNight = { day: nightDay, ms: nightMs }
  }
  const closeVariety = () => {
    if (varietyDay !== NONE && (!variety || artists > variety.artists)) variety = { day: varietyDay, artists }
  }

  const [lo, hi] = yearRange(d, f.year)
  for (let i = lo; i < hi; i++) {
    if (!kindMatches(flags[i], f.kind)) continue
    const t = start[i]
    const played = ms[i]

    if (t - sEnd <= SESSION_GAP_MS) {
      sTracks++
      sEnd = Math.max(sEnd, t + played)
    } else {
      closeSession()
      sStart = t
      sEnd = t + played
      sTracks = 1
    }

    const day = cal.day[i]
    if (cal.hour[i] < 6) {
      if (day !== nightDay) {
        closeNight()
        nightDay = day
        nightMs = 0
      }
      nightMs += played
    }
    if (played < MIN_PLAY_MS) continue

    first ??= { item: item[i], t }
    const it = item[i]
    const c = creator[it]

    if (onDay[it] !== day) {
      onDay[it] = day
      timesToday[it] = 0
    }
    const n = ++timesToday[it]
    if (!repeatDay || n > repeatDay.count) repeatDay = { item: it, day, count: n }

    if (c === runCreator) runCount++
    else {
      runCreator = c
      runCount = 1
      runStart = t
    }
    if (!artistRun || runCount > artistRun.count) artistRun = { creator: c, count: runCount, start: runStart }

    if (lastDay[it] !== day) {
      if (lastDay[it] === NONE) playedOrder.push(it)
      lastDay[it] = day
      dayCount[it]++
    }

    if (day !== varietyDay) {
      closeVariety()
      varietyDay = day
      artists = 0
    }
    if (creatorDay[c] !== day) {
      creatorDay[c] = day
      artists++
    }
  }
  closeSession()
  closeNight()
  closeVariety()

  let loyal: Records['loyal'] = null
  for (const it of playedOrder) if (!loyal || dayCount[it] > loyal.days) loyal = { item: it, days: dayCount[it] }

  return {
    marathon,
    repeatDay: repeatDay && { item: repeatDay.item, day: dayKeyOf(repeatDay.day), count: repeatDay.count },
    lateNight: lateNight && { day: dayKeyOf(lateNight.day), ms: lateNight.ms },
    artistRun,
    loyal,
    first,
    variety: variety && { day: dayKeyOf(variety.day), artists: variety.artists },
  }
}

export interface Forgotten {
  id: number
  /** Reproduções no período escolhido. */
  plays: number
  /** Última vez que tocou (em qualquer época). */
  last: number
  /** Ano em que mais tocou. */
  peakYear: number
}

/** Quanto tempo sem tocar para uma música contar como esquecida. */
const FORGOTTEN_AFTER_MS = 365 * 86_400_000

/**
 * Músicas que você ouviu muito e não toca há mais de um ano (contando até o fim do export).
 * Episódios de podcast ficam de fora: é normal não ouvir um episódio de novo.
 */
export function forgotten(d: Dataset, f: Filter, n = 12): Forgotten[] {
  const { start, ms, item } = d.plays
  if (start.length === 0) return []
  const cal = calendar(d)
  const cut = start[start.length - 1] - FORGOTTEN_AFTER_MS
  const minPlays = f.year === null ? 20 : 10
  const music = Uint8Array.from(d.items, (it) => (it.kind === 'music' ? 1 : 0))
  // Última vez que cada música tocou: as reproduções estão em ordem, fica a mais recente.
  const last = new Float64Array(d.items.length)
  for (let i = 0; i < item.length; i++) last[item[i]] = start[i]

  const plays = new Int32Array(d.items.length)
  const order: number[] = []
  const [lo, hi] = yearRange(d, f.year)
  for (let i = lo; i < hi; i++) {
    const it = item[i]
    if (!music[it] || ms[i] < MIN_PLAY_MS) continue
    if (plays[it] === 0) order.push(it)
    plays[it]++
  }
  const picked = order
    .filter((it) => plays[it] >= minPlays && last[it] < cut)
    .sort((a, b) => plays[b] - plays[a])
    .slice(0, n)

  // O ano em que cada escolhida mais tocou (no empate, o primeiro).
  const slot = new Int32Array(d.items.length).fill(-1)
  picked.forEach((it, k) => (slot[it] = k))
  const peak = picked.map(() => ({ year: 0, plays: -1, curYear: 0, cur: 0 }))
  for (let i = 0; i < item.length; i++) {
    const k = slot[item[i]]
    if (k < 0 || ms[i] < MIN_PLAY_MS) continue
    const p = peak[k]
    if (cal.year[i] !== p.curYear) [p.curYear, p.cur] = [cal.year[i], 0]
    if (++p.cur > p.plays) [p.year, p.plays] = [p.curYear, p.cur]
  }
  return picked.map((id, k) => ({ id, plays: plays[id], last: last[id], peakYear: peak[k].year }))
}

export interface YearProfile {
  year: number
  totalMs: number
  plays: number
  creators: number
  items: number
  top: Ranked[]
  topItem: Ranked | null
  /** Artistas (ou programas) ouvidos pela primeira vez nesse ano. */
  newCreators: number
  /** Primeiro ano do export: tudo é novo, então "novos" não diz nada. */
  firstYear: boolean
  /** Parte do dia em que mais ouviu. */
  part: string | null
  /** O export não cobre o ano inteiro. */
  partial: boolean
  /** Última reprodução do ano. */
  last: number | null
}

/** Um ano resumido, para comparar dois anos lado a lado. */
export function yearProfile(d: Dataset, year: number, kind: KindFilter): YearProfile {
  const s = summarize(d, { year, kind }, 5)
  const { start, ms, item, flags } = d.plays
  const cal = calendar(d)
  const creator = creatorOf(d)
  const [lo, hi] = yearRange(d, year)
  // Quem você já tinha ouvido antes do ano.
  const seen = new Uint8Array(d.creators.length)
  for (let i = 0; i < lo; i++) if (ms[i] >= MIN_PLAY_MS && kindMatches(flags[i], kind)) seen[creator[item[i]]] = 1
  let newCreators = 0
  const byHour = new Array<number>(24).fill(0)
  for (let i = lo; i < hi; i++) {
    if (!kindMatches(flags[i], kind)) continue
    byHour[cal.hour[i]] += ms[i]
    if (ms[i] < MIN_PLAY_MS) continue
    const c = creator[item[i]]
    if (seen[c]) continue
    seen[c] = 1
    newCreators++
  }
  const parts = DAY_PARTS.map((p) => ({ name: p.name, ms: byHour.slice(p.from, p.to).reduce((a, b) => a + b, 0) }))
  const part = parts.reduce((a, b) => (b.ms > a.ms ? b : a))
  const from = s.first === null ? null : new Date(s.first)
  const to = s.last === null ? null : new Date(s.last)
  return {
    year,
    totalMs: s.totalMs,
    plays: s.plays,
    creators: s.creators,
    items: s.items,
    top: s.topCreators,
    topItem: s.topItems[0] ?? null,
    newCreators,
    firstYear: start.length > 0 && cal.year[0] === year,
    part: part.ms > 0 ? part.name : null,
    partial: !!from && !!to && (from.getMonth() > 0 || to.getMonth() < 11),
    last: s.last,
  }
}
