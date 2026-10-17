import { lang, locale, t, type Lang } from '../i18n'

// Formatadores de número por idioma, criados uma vez só.
const formats = new Map<string, Intl.NumberFormat>()
function nfFor(digits: 0 | 1) {
  const k = locale() + digits
  let f = formats.get(k)
  if (!f) formats.set(k, (f = new Intl.NumberFormat(locale(), { maximumFractionDigits: digits })))
  return f
}

export const num = (n: number) => nfFor(0).format(Math.round(n))

/** "1 reprodução", "1.234 reproduções". */
export const playCount = (n: number) =>
  t(`${num(n)} ${n === 1 ? 'reprodução' : 'reproduções'}`, `${num(n)} ${n === 1 ? 'play' : 'plays'}`, `${num(n)} ${n === 1 ? 'reproducción' : 'reproducciones'}`)

export function hours(ms: number): string {
  const h = ms / 3.6e6
  if (h < 1) return `${Math.round(ms / 60000)} min`
  return `${h < 10 ? nfFor(1).format(h) : nfFor(0).format(Math.round(h))} h`
}

const MONTHS: Record<Lang, string[]> = {
  pt: ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'],
}
const MONTHS_LONG: Record<Lang, string[]> = {
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  es: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
}

/** 10 → "novembro" (mês de 0 a 11). */
export const monthName = (m: number) => MONTHS_LONG[lang()][m]

/** Posição: "1º" em português e espanhol, "1st" em inglês. */
export function ordinal(n: number): string {
  if (lang() !== 'en') return `${n}º`
  const end = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${end}`
}

/** "4 de outubro", "1º de maio"; "4th of October"; "4 de octubre". */
export function dayTitle(d: Date): string {
  const day = d.getDate()
  const month = monthName(d.getMonth())
  if (lang() === 'en') return `${ordinal(day)} of ${month}`
  if (lang() === 'es') return `${day} de ${month}`
  return `${day === 1 ? '1º' : day} de ${month}`
}

/** "2024-03" → "mar 2024" (ou só "mar" quando o ano é óbvio). */
export function monthLabel(key: string, withYear = true): string {
  const [y, m] = key.split('-')
  const name = MONTHS[lang()][Number(m) - 1]
  return withYear ? `${name} ${y}` : name
}

// Formatadores de data por idioma, também criados uma vez só (criar um a cada data pesa).
const dateFormats = new Map<string, Intl.DateTimeFormat>()
function dfFor(name: string, opts: Intl.DateTimeFormatOptions) {
  const k = locale() + name
  let f = dateFormats.get(k)
  if (!f) dateFormats.set(k, (f = new Intl.DateTimeFormat(locale(), opts)))
  return f
}

export const date = (ms: number) => dfFor('date', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms)

/** 0.623 → "62%" */
export const pct = (share: number) => (share > 0 && share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`)

/** Data curta para destaques: "29 jun 2020". */
export function shortDate(ms: number): string {
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[lang()][d.getMonth()]} ${d.getFullYear()}`
}

/** Data sem ano, para quando o ano já está claro: "29 jun". */
export function dayMonth(ms: number): string {
  const d = new Date(ms)
  return `${d.getDate()} ${MONTHS[lang()][d.getMonth()]}`
}

/** Horas por extenso para frases: "773 horas", "1,5 hora", "45 minutos". */
export function longHours(ms: number): string {
  const h = ms / 3.6e6
  if (h < 1) {
    const m = Math.round(ms / 60000)
    return `${m} ${m === 1 ? t('minuto', 'minute', 'minuto') : t('minutos', 'minutes', 'minutos')}`
  }
  const rounded = h < 10 ? Math.round(h * 10) / 10 : Math.round(h)
  const s = h < 10 ? nfFor(1).format(h) : nfFor(0).format(Math.round(h))
  // Em português o singular vai até 2 ("1,5 hora"); em inglês e espanhol, só no 1.
  // Sempre olhando o número já arredondado (1,98 vira "2 horas").
  const one = lang() === 'pt' ? rounded < 2 : rounded === 1
  return `${s} ${one ? t('hora', 'hour', 'hora') : t('horas', 'hours', 'horas')}`
}

const WEEKDAYS_LONG: Record<Lang, string[]> = {
  pt: ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
}

/** 0 = segunda … 6 = domingo. */
export const weekdayName = (i: number) => WEEKDAYS_LONG[lang()][i]

/** Os grupos de aparelho ficam salvos em português nos dados; aqui viram o idioma da tela. */
export function platformLabel(name: string): string {
  switch (name) {
    case 'Celular':
      return t('Celular', 'Phone', 'Móvil')
    case 'Computador':
      return t('Computador', 'Computer', 'Ordenador')
    case 'Navegador':
      return t('Navegador', 'Web browser', 'Navegador')
    case 'TV, caixa de som e outros':
      return t('TV, caixa de som e outros', 'TV, speakers and more', 'TV, altavoces y otros')
    case 'Outros':
      return t('Outros', 'Other', 'Otros')
    default:
      return name
  }
}

/** "2024-03-07" → data local em ms. */
export function keyToMs(key: string): number {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).getTime()
}

/** Tira o "- Remastered 2011" e o "(feat. Fulano)" do nome da música, que só ocupam espaço no cartão. */
export const cleanTitle = (name: string) =>
  name
    .replace(/\s+(?:-\s+|\()(?:\d{4}\s+)?(?:remaster(?:ed)?|remasterizad[ao])(?:\s+\d{4})?(?:\s+version)?\)?$/i, '')
    .replace(/\s+[([]feat\.?\s[^)\]]*[)\]]/i, '') || name

/** Duração para recordes: "10 h 13 min", "45 min". */
export function duration(ms: number): string {
  const total = Math.round(ms / 60000)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return m === 0 ? `${h} h` : `${h} h ${m} min`
}

/** Hora do dia: "21:02". */
export const clock = (ms: number) => dfFor('clock', { hour: '2-digit', minute: '2-digit', hour12: false }).format(ms)

/** Um tom fixo por nome, para a inicial não ficar sempre no mesmo cinza. */
export function hue(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

/** "4 de outubro" → "4-de-outubro" (para nomes de arquivo). */
export const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
