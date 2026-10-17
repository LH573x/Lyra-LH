import type { Dataset } from './types'

/**
 * A data local (no fuso deste aparelho) de cada reprodução, calculada uma vez só por arquivo.
 * As contas por ano, mês, dia e hora leem daqui, em vez de criar um Date para cada reprodução.
 */
export interface Calendar {
  /** Dia, contado desde 1º/1/1970 (a data do calendário, sem fuso: dias seguidos diferem de 1). */
  day: Int32Array
  /** Mês: ano × 12 + mês (0 a 11). */
  month: Int32Array
  year: Int32Array
  hour: Uint8Array
  /** 0 = segunda … 6 = domingo. */
  weekday: Uint8Array
  /** Os anos que aparecem no histórico, em ordem. */
  years: number[]
}

const DAY = 86_400_000
const cache = new WeakMap<Dataset, Calendar>()

export function calendar(d: Dataset): Calendar {
  let c = cache.get(d)
  if (c) return c
  const { start } = d.plays
  const n = start.length
  c = {
    day: new Int32Array(n),
    month: new Int32Array(n),
    year: new Int32Array(n),
    hour: new Uint8Array(n),
    weekday: new Uint8Array(n),
    years: [],
  }
  // As reproduções estão em ordem: um Date por dia basta, e a hora sai da distância até a meia-noite.
  for (let i = 0; i < n; ) {
    const dt = new Date(start[i])
    const y = dt.getFullYear()
    if (Number.isNaN(y)) {
      i++
      continue
    }
    const m = dt.getMonth()
    const dd = dt.getDate()
    const from = new Date(y, m, dd).getTime()
    const to = new Date(y, m, dd + 1).getTime()
    // Dia em que o relógio muda (horário de verão): aí a hora vem do Date, uma por uma.
    const even = to - from === DAY
    const day = Date.UTC(y, m, dd) / DAY
    const wd = (dt.getDay() + 6) % 7
    if (c.years[c.years.length - 1] !== y) c.years.push(y)
    do {
      c.day[i] = day
      c.month[i] = y * 12 + m
      c.year[i] = y
      c.weekday[i] = wd
      c.hour[i] = even ? Math.floor((start[i] - from) / 3_600_000) : new Date(start[i]).getHours()
      i++
    } while (i < n && start[i] < to)
  }
  cache.set(d, c)
  return c
}

/** O calendário que o worker já calculou (os arrays chegam transferidos, sem cópia). */
export function adoptCalendar(d: Dataset, c: Calendar) {
  if (!cache.has(d)) cache.set(d, c)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Dia do calendário → "2024-03-07". */
export function dayKeyOf(day: number): string {
  const dt = new Date(day * DAY)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/** Mês (ano × 12 + mês) → "2024-03". */
export const monthKeyOf = (month: number) => `${Math.floor(month / 12)}-${pad((month % 12) + 1)}`

/** Primeira posição com valor >= `v` num array em ordem crescente. */
export function lowerBound(a: ArrayLike<number>, v: number, lo = 0, hi = a.length): number {
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (a[mid] < v) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** As reproduções de um ano: [de, até). Sem ano, todas. */
export function yearRange(d: Dataset, year: number | null): [number, number] {
  const n = d.plays.start.length
  if (year === null) return [0, n]
  const y = calendar(d).year
  return [lowerBound(y, year), lowerBound(y, year + 1)]
}
