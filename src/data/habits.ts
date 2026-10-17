import { FLAG_SHUFFLE, FLAG_SKIPPED, type Dataset } from './types'
import { MIN_PLAY_MS, kindMatches, type Filter } from './stats'
import { calendar, dayKeyOf, yearRange } from './calendar'
import { t } from '../i18n'

export interface SkipRow {
  id: number
  name: string
  sub: string
  starts: number
  skips: number
}

export interface Habits {
  /** Ano mostrado no calendário (o ano filtrado ou o mais recente). */
  calendarYear: number
  /** "2024-03-07" → horas, só do ano do calendário. */
  days: [string, number][]
  /** Dia recorde do período filtrado. */
  bestDay: { day: string; ms: number } | null
  /** Maior sequência de dias seguidos ouvindo, no período filtrado. */
  streak: { days: number; from: string; to: string } | null
  /** [dia da semana 0=seg..6=dom][hora 0..23] → horas */
  clock: number[][]
  peak: { weekday: number; hour: number; hours: number } | null
  platforms: { name: string; ms: number }[]
  /** Fração das reproduções (30 s+) feitas no aleatório. */
  shuffleShare: number | null
  /** Fração das músicas iniciadas que foram puladas. */
  skipShare: number | null
  topSkipped: SkipRow[]
}

/** Partes do dia usadas em "Você é da noite". */
export const DAY_PARTS = [
  {
    get name() {
      return t('Madrugada', 'Late night', 'Madrugada')
    },
    from: 0,
    to: 6,
  },
  {
    get name() {
      return t('Manhã', 'Morning', 'Mañana')
    },
    from: 6,
    to: 12,
  },
  {
    get name() {
      return t('Tarde', 'Afternoon', 'Tarde')
    },
    from: 12,
    to: 18,
  },
  {
    get name() {
      return t('Noite', 'Evening', 'Noche')
    },
    from: 18,
    to: 24,
  },
]

/** Horas em cada parte do dia, a partir do relógio [dia da semana][hora]. */
export function dayParts(clock: number[][]) {
  return DAY_PARTS.map((p) => ({
    ...p,
    hours: clock.reduce((sum, row) => sum + row.slice(p.from, p.to).reduce((a, b) => a + b, 0), 0),
  }))
}

/** Músicas com poucas reproduções não entram no ranking de pulos (1 de 1 = 100% não diz nada). */
const MIN_STARTS_FOR_SKIP_RANK = 5

export function habits(d: Dataset, f: Filter, lastYear: number): Habits {
  const { ms, item, flags, platform } = d.plays
  const cal = calendar(d)
  const calendarYear = f.year ?? lastYear

  // As horas de cada dia do ano do calendário (os dias vêm em ordem).
  const days: Habits['days'] = []
  {
    const [lo, hi] = yearRange(d, calendarYear)
    let day = NaN
    let sum = 0
    for (let i = lo; i < hi; i++) {
      if (!kindMatches(flags[i], f.kind)) continue
      if (cal.day[i] !== day) {
        if (sum > 0) days.push([dayKeyOf(day), sum / 3.6e6])
        day = cal.day[i]
        sum = 0
      }
      sum += ms[i]
    }
    if (sum > 0) days.push([dayKeyOf(day), sum / 3.6e6])
  }

  const dayList: number[] = []
  const dayMs: number[] = []
  const clock = new Float64Array(7 * 24)
  const byPlatform = new Float64Array(d.platforms.length)
  const platformOrder: number[] = []
  const starts = new Int32Array(d.items.length)
  const skipped = new Int32Array(d.items.length)
  const startedOrder: number[] = []
  let counted = 0
  let shuffled = 0
  let startCount = 0
  let skips = 0

  const [lo, hi] = yearRange(d, f.year)
  for (let i = lo; i < hi; i++) {
    if (!kindMatches(flags[i], f.kind)) continue
    const played = ms[i]
    if (cal.day[i] !== dayList[dayList.length - 1]) {
      dayList.push(cal.day[i])
      dayMs.push(0)
    }
    dayMs[dayMs.length - 1] += played
    clock[cal.weekday[i] * 24 + cal.hour[i]] += played
    const p = platform[i]
    if (byPlatform[p] === 0) platformOrder.push(p)
    byPlatform[p] += played
    if (played >= MIN_PLAY_MS) {
      counted++
      if (flags[i] & FLAG_SHUFFLE) shuffled++
    }
    startCount++
    const it = item[i]
    if (starts[it] === 0) startedOrder.push(it)
    starts[it]++
    if (flags[i] & FLAG_SKIPPED) {
      skips++
      skipped[it]++
    }
  }

  // Dia recorde e maior sequência de dias seguidos.
  let bestDay: Habits['bestDay'] = null
  let best = -1
  for (let k = 0; k < dayList.length; k++) if (best < 0 || dayMs[k] > dayMs[best]) best = k
  if (best >= 0) bestDay = { day: dayKeyOf(dayList[best]), ms: dayMs[best] }
  let streak: Habits['streak'] = null
  let runStart = 0
  for (let k = 1; k <= dayList.length; k++) {
    if (k < dayList.length && dayList[k] - dayList[k - 1] === 1) continue
    const len = k - runStart
    if (!streak || len > streak.days) streak = { days: len, from: dayKeyOf(dayList[runStart]), to: dayKeyOf(dayList[k - 1]) }
    runStart = k
  }

  let peak: Habits['peak'] = null
  for (let w = 0; w < 7; w++) {
    for (let h = 0; h < 24; h++) {
      const v = clock[w * 24 + h] / 3.6e6
      if (v > 0 && (!peak || v > peak.hours)) peak = { weekday: w, hour: h, hours: v }
    }
  }

  const extended = d.format === 'extended'

  return {
    calendarYear,
    days,
    bestDay,
    streak,
    clock: Array.from({ length: 7 }, (_, w) => Array.from(clock.subarray(w * 24, w * 24 + 24), (v) => v / 3.6e6)),
    peak,
    platforms: platformOrder
      .filter((p) => d.platforms[p] !== 'Desconhecido')
      .map((p) => ({ name: d.platforms[p], ms: byPlatform[p] }))
      .sort((a, b) => b.ms - a.ms),
    shuffleShare: extended && counted ? shuffled / counted : null,
    skipShare: extended && startCount ? skips / startCount : null,
    topSkipped: extended
      ? startedOrder
          .filter((id) => starts[id] >= MIN_STARTS_FOR_SKIP_RANK && skipped[id] > 0)
          .sort((a, b) => skipped[b] - skipped[a] || skipped[b] / starts[b] - skipped[a] / starts[a])
          .slice(0, 10)
          .map((id) => ({
            id,
            name: d.items[id].name,
            sub: d.creators[d.items[id].creator],
            starts: starts[id],
            skips: skipped[id],
          }))
      : [],
  }
}
