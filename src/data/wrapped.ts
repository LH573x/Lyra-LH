import type { Dataset } from './types'
import { creatorLabel, creatorOf, itemLabel, kindMatches, MIN_PLAY_MS, summarize, Tally, type Ranked } from './stats'
import { dayParts, habits, type Habits } from './habits'
import { discoveries, type Discovery } from './timeline'
import { calendar, lowerBound, yearRange } from './calendar'
import type { ImageRef } from './images'
import { artistRef, itemRef } from './refs'

/** Um artista (ou podcast) no ano, com a faixa favorita e desde quando você ouve. */
export interface Favorite extends Ranked {
  topItem: { name: string; ms: number; plays: number; image?: ImageRef } | null
  image: ImageRef
  /** Quantas músicas (ou episódios) diferentes dele você ouviu no ano. */
  itemCount: number
  /** Primeira reprodução de todos os tempos. */
  since: number | null
}

export interface WrappedYear {
  year: number
  /** Primeira e última reprodução do ano. */
  from: number
  to: number
  /** O export não cobre o ano inteiro. */
  partial: boolean
  /** Primeiro ano do export: tudo é "novo", então não há descobertas de verdade. */
  firstYear: boolean
  /** Música e podcast juntos. */
  totalMs: number
  podcastMs: number
  previousYearMs: number | null
  activeDays: number
  /** Artistas e músicas diferentes (só música). */
  artists: number
  songs: number
  topArtists: Ranked[]
  topSongs: Ranked[]
  topArtist: Favorite | null
  topPodcast: Favorite | null
  /** Horas em cada mês (12) e em cada hora do dia (24). */
  months: number[]
  hours: number[]
  part: { name: string; from: number; to: number; share: number } | null
  peak: Habits['peak']
  streak: Habits['streak']
  bestDay: Habits['bestDay']
  discovery: Discovery | null
  /** Fotos e capas para os cartões (mesma ordem das listas). */
  images: { artists: ImageRef[]; songs: (ImageRef | undefined)[]; discovery?: ImageRef }
}

/** Podcast com menos que isso no ano não ganha cartão próprio. */
const MIN_PODCAST_MS = 30 * 60_000

function favorite(d: Dataset, r: Ranked | undefined, year: number): Favorite | null {
  if (!r) return null
  const { start, ms, item } = d.plays
  const creator = creatorOf(d)
  let since: number | null = null
  for (let i = 0; i < item.length; i++) {
    if (creator[item[i]] === r.id && ms[i] >= MIN_PLAY_MS) {
      since = start[i]
      break
    }
  }
  const byItem = new Tally(d.items.length)
  const [lo, hi] = yearRange(d, year)
  for (let i = lo; i < hi; i++) if (creator[item[i]] === r.id) byItem.add(item[i], ms[i])
  const [best] = byItem.top(1)
  return {
    ...r,
    topItem: best === undefined ? null : { name: d.items[best].name, ms: byItem.ms[best], plays: byItem.plays[best], image: itemRef(d, best) },
    image: artistRef(d, r.id),
    itemCount: byItem.ids.length,
    since,
  }
}

export function wrapped(d: Dataset, year: number): WrappedYear | null {
  const all = summarize(d, { year, kind: 'all' }, 1)
  if (all.first === null || all.last === null) return null
  const music = summarize(d, { year, kind: 'music' }, 5)
  const podcast = summarize(d, { year, kind: 'podcast' }, 1)
  const h = habits(d, { year, kind: 'all' }, year)

  const parts = dayParts(h.clock)
  const partTotal = parts.reduce((a, p) => a + p.hours, 0)
  const topPart = parts.reduce((a, b) => (b.hours > a.hours ? b : a))
  const hours = Array.from({ length: 24 }, (_, hr) => h.clock.reduce((a, row) => a + row[hr], 0))

  const from = new Date(all.first)
  const to = new Date(all.last)
  const pod = podcast.topCreators[0]
  const firstYear = calendar(d).year[0] === year
  const discovery = firstYear ? null : (discoveries(d, 'music').find((x) => x.year === year) ?? null)

  return {
    year,
    from: all.first,
    to: all.last,
    partial: from.getMonth() > 0 || to.getMonth() < 11,
    firstYear,
    totalMs: all.totalMs,
    podcastMs: podcast.totalMs,
    previousYearMs: all.previousYearMs,
    activeDays: all.activeDays,
    artists: music.creators,
    songs: music.items,
    topArtists: music.topCreators,
    topSongs: music.topItems,
    topArtist: favorite(d, music.topCreators[0], year),
    topPodcast: pod && pod.ms >= MIN_PODCAST_MS ? favorite(d, pod, year) : null,
    months: all.monthly.map((m) => m.hours),
    hours,
    part: partTotal > 0 ? { name: topPart.name, from: topPart.from, to: topPart.to, share: topPart.hours / partTotal } : null,
    peak: h.peak,
    streak: h.streak,
    bestDay: h.bestDay,
    discovery,
    images: {
      artists: music.topCreators.map((c) => artistRef(d, c.id)),
      songs: music.topItems.map((t) => itemRef(d, t.id)),
      discovery: discovery?.best ? artistRef(d, discovery.best.id) : undefined,
    },
  }
}

export type PeriodId = 'mes' | 'ano' | 'sempre'

/** Top 5 de um período que termina na última reprodução do arquivo (só música). */
export interface TopPeriod {
  id: PeriodId
  from: number
  to: number
  totalMs: number
  artists: Ranked[]
  songs: Ranked[]
  images: { artists: ImageRef[]; songs: (ImageRef | undefined)[] }
}

const DAY = 86_400_000

/** Os Top 5 do último mês (30 dias), do último ano (365 dias) e desde sempre. */
export function topPeriods(d: Dataset): TopPeriod[] {
  const { start, ms, item, flags } = d.plays
  if (start.length === 0) return []
  const creator = creatorOf(d)
  const end = start[start.length - 1]
  const windows = [
    { id: 'mes' as const, from: end - 30 * DAY },
    { id: 'ano' as const, from: end - 365 * DAY },
    { id: 'sempre' as const, from: start[0] },
  ]
  const out: TopPeriod[] = []
  for (const w of windows) {
    // Com menos de um ano de dados, "o último ano" e "desde sempre" seriam o mesmo cartão.
    if (w.id === 'ano' && w.from <= start[0]) continue
    const byCreator = new Tally(d.creators.length)
    const byItem = new Tally(d.items.length)
    let totalMs = 0
    let first = Infinity
    for (let i = lowerBound(start, w.from); i < start.length; i++) {
      if (!kindMatches(flags[i], 'music')) continue
      const it = item[i]
      totalMs += ms[i]
      first = Math.min(first, start[i])
      byCreator.add(creator[it], ms[i])
      byItem.add(it, ms[i])
    }
    if (byCreator.ids.length === 0) continue
    const artists = byCreator.ranked(5, creatorLabel(d))
    const songs = byItem.ranked(5, itemLabel(d))
    out.push({
      id: w.id,
      from: w.id === 'sempre' ? first : w.from,
      to: end,
      totalMs,
      artists,
      songs,
      images: { artists: artists.map((a) => artistRef(d, a.id)), songs: songs.map((s) => itemRef(d, s.id)) },
    })
  }
  return out
}
