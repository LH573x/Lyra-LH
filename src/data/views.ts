import type { Dataset } from './types'
import { memo } from './memo'
import { hasPodcasts, summarize, topCreator, yearTops, years, type Filter, type KindFilter } from './stats'
import { habits } from './habits'
import { forgotten, records, yearProfile } from './curiosities'
import { onThisDay } from './onThisDay'
import { timeline } from './timeline'
import { topPeriods, wrapped } from './wrapped'
import { albums, periods, previousRanks, topOf, type Period, type TopBy } from './tops'
import { bestItems } from './refs'
import { likedForgotten, playlistRanking } from './account'
import { known, topArtists } from './library'

/*
 * As contas das abas, guardadas por arquivo (memo.ts). As páginas pedem daqui; o worker que lê
 * o arquivo faz as mesmas contas antes, na ordem de `plan`, e manda prontas.
 */

export const summaryView = (d: Dataset, f: Filter) => memo(d, `summary ${f.kind} ${f.year}`, () => summarize(d, f))
export const yearTopsView = (d: Dataset, kind: KindFilter) => memo(d, `yearTops ${kind}`, () => yearTops(d, kind))
export const topCreatorView = (d: Dataset, year: number | null, kind: KindFilter) => memo(d, `topCreator ${kind} ${year}`, () => topCreator(d, year, kind))

export const habitsView = (d: Dataset, f: Filter, lastYear: number) => memo(d, `habits ${f.kind} ${f.year} ${lastYear}`, () => habits(d, f, lastYear))
export const recordsView = (d: Dataset, f: Filter) => memo(d, `records ${f.kind} ${f.year}`, () => records(d, f))
export const forgottenView = (d: Dataset, f: Filter, n: number) => memo(d, `forgotten ${f.kind} ${f.year} ${n}`, () => forgotten(d, f, n))
export const yearProfileView = (d: Dataset, year: number, kind: KindFilter) => memo(d, `yearProfile ${kind} ${year}`, () => yearProfile(d, year, kind))
/** "Seu 4 de outubro" muda com o dia. */
export const onThisDayView = (d: Dataset, kind: KindFilter, today: Date) =>
  memo(d, `onThisDay ${kind} ${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`, () => onThisDay(d, kind, today))
export const playlistRankingView = (d: Dataset) => memo(d, 'playlistRanking', () => playlistRanking(d))
export const likedForgottenView = (d: Dataset, n: number, nNever: number) => memo(d, `likedForgotten ${n} ${nNever}`, () => likedForgotten(d, n, nNever))

export const timelineView = (d: Dataset, kind: KindFilter) => memo(d, `timeline ${kind}`, () => timeline(d, kind))
export const periodsView = (d: Dataset, kind: KindFilter) => memo(d, `periods ${kind}`, () => periods(d, kind))
export const topView = (d: Dataset, kind: KindFilter, p: Period, by: TopBy, n: number) => memo(d, `top ${kind} ${p.id} ${by} ${n}`, () => topOf(d, kind, p, by, n))
export const previousRanksView = (d: Dataset, kind: KindFilter, p: Period, by: TopBy, n: number) =>
  memo(d, `previousRanks ${kind} ${p.id} ${by} ${n}`, () => previousRanks(d, kind, p, by, n))

export const wrappedView = (d: Dataset, year: number) => memo(d, `wrapped ${year}`, () => wrapped(d, year))
export const topPeriodsView = (d: Dataset) => memo(d, 'topPeriods', () => topPeriods(d))

/** Quantas capas cabem nas paredes de músicas esquecidas e de curtidas esquecidas. */
export const forgottenCount = (phone: boolean) => (phone ? 9 : 8)
export const likedCounts = (phone: boolean): [number, number] => (phone ? [9, 3] : [8, 4])

/** Quantos o "Seu top" mostra, no máximo (o top 200). */
export const TOP_MAX = 200

/**
 * O que o worker adianta, em lotes, na ordem em que as abas costumam ser abertas: o Resumo e as
 * Curiosidades (que abrem juntos), a Linha do tempo, o Wrapped e o Explorar e, por fim, cada ano
 * e os outros tipos (podcasts e tudo junto). Uma conta que a página pedir antes é feita na hora.
 */
export function plan(d: Dataset, o: { phone: boolean; today: Date }): (() => unknown)[][] {
  const ys = years(d)
  if (ys.length === 0) return []
  const last = ys[ys.length - 1]
  const kinds: KindFilter[] = hasPodcasts(d) ? ['music', 'all', 'podcast'] : ['music']
  const [liked, likedNever] = likedCounts(o.phone)

  const tab = (kind: KindFilter, year: number | null) => {
    const f = { kind, year }
    const out: (() => unknown)[] = [
      () => summaryView(d, f),
      () => topCreatorView(d, year, kind),
      () => habitsView(d, f, last),
      () => recordsView(d, f),
      () => forgottenView(d, f, forgottenCount(o.phone)),
    ]
    if (year === null) out.push(() => yearTopsView(d, kind), () => onThisDayView(d, kind, o.today))
    // A comparação começa no ano escolhido (ou no último) e no de antes.
    const b = year ?? last
    const i = ys.indexOf(b)
    for (const y of [b, ys[i - 1] ?? ys[i + 1]]) if (y !== undefined) out.push(() => yearProfileView(d, y, kind))
    return out
  }
  const linha = (kind: KindFilter) => [
    () => timelineView(d, kind),
    () => albums(d),
    () => {
      const p = periodsView(d, kind)[0]
      if (!p) return
      topView(d, kind, p, 'songs', TOP_MAX)
      previousRanksView(d, kind, p, 'songs', TOP_MAX)
    },
  ]

  return [
    [() => bestItems(d), ...tab('music', null), () => playlistRankingView(d), () => likedForgottenView(d, liked, likedNever)],
    [...linha('music'), () => wrappedView(d, last), () => topPeriodsView(d), () => topCreatorView(d, last, 'all'), () => known(d), () => topArtists(d, 1)],
    ...[...ys].reverse().map((y) => [...tab('music', y), () => wrappedView(d, y), () => topCreatorView(d, y, 'all')]),
    ...kinds.slice(1).map((kind) => [...tab(kind, null), ...linha(kind)]),
  ]
}
