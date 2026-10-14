import type { Dataset } from './types'
import { norm } from './search'
import { topArtists } from './explore'
import { TICKETMASTER_KEY } from '../config'
import { LINEUPS } from './lineups'

/*
 * Shows perto de você: eventos de música do Ticketmaster (Discovery API) perto de um lugar,
 * cruzados com os artistas do histórico. A API libera leitura direta pelo navegador (CORS).
 * Daqui só saem a região (arredondada, nunca o endereço exato) e nomes de artistas; o histórico continua no aparelho.
 */

export const hasConcerts = () => TICKETMASTER_KEY.trim() !== ''

/** Onde procurar: um ponto e o nome para mostrar ("São Paulo, SP"). */
export interface Place {
  lat: number
  lon: number
  label: string
}

export interface Concert {
  id: string
  name: string
  /** Dia do show, no fuso do local ("2026-11-21"). */
  date: string
  /** Hora local ("21:00:00"), quando já foi anunciada. */
  time?: string
  venue: string
  city: string
  url: string
  /** Distância do lugar escolhido, em km. */
  km?: number
  /** Os artistas do seu histórico que estão no show, do mais ouvido para o menos. */
  artists: { id: number; name: string; ms: number }[]
  /** Festival: aparece mesmo sem artistas seus. */
  festival?: boolean
  /** Último dia, quando o festival tem mais de um. */
  end?: string
  /** A arte do festival (16:9), da menor para a maior largura. */
  images?: { url: string; width: number }[]
  /** Quem toca em cada dia do festival, com os artistas que você mais ouve na frente. */
  lineup?: FestDay[]
}

export interface FestDay {
  date: string
  acts: Act[]
}

/** Uma atração do dia. `ms`: quanto você ouviu dela (ou de `via`, quando é um projeto de um artista seu). */
export interface Act {
  name: string
  ms?: number
  via?: string
}

interface RawClass {
  type?: { name?: string }
  subType?: { name?: string }
}
interface RawEvent {
  id: string
  name: string
  url?: string
  classifications?: RawClass[]
  images?: { url?: string; ratio?: string; width?: number; fallback?: boolean }[]
  dates?: { start?: { localDate?: string; localTime?: string; dateTBD?: boolean }; status?: { code?: string } }
  _embedded?: {
    venues?: { name?: string; city?: { name?: string }; location?: { latitude?: string; longitude?: string } }[]
    attractions?: { name?: string; classifications?: RawClass[] }[]
  }
}

const FESTIVAL = /\bfest(ival)?\b/i

const marksFestival = (cs: RawClass[] = []) => cs.some((c) => c.subType?.name === 'Festival' || c.type?.name === 'Festival')

/**
 * Festival: o Ticketmaster marca a atração (Lollapalooza, The Town) como "Festival"; alguns só têm "Festival" no nome.
 * Devolve o nome do festival (o da atração, quando tem), ou null se não for festival.
 * Às vezes a marca está num artista (Maria Rita): um artista que você ouve, ou um título "Artista: turnê", é show.
 */
function festivalName(ev: RawEvent, mine: Map<string, unknown>): string | null {
  const a = ev._embedded?.attractions?.find(
    (x) => x.name && marksFestival(x.classifications) && !mine.has(norm(x.name)) && !ev.name.startsWith(`${x.name}:`),
  )
  if (a) return a.name!
  return marksFestival(ev.classifications) || FESTIVAL.test(ev.name) ? ev.name : null
}

/** A arte do evento em 16:9, sem as imagens genéricas que o Ticketmaster usa quando não tem uma. */
function art(ev: RawEvent): Concert['images'] {
  const widths = new Set<number>()
  const list = (ev.images ?? [])
    .filter((i) => i.ratio === '16_9' && !i.fallback && i.width && i.url?.startsWith('https://'))
    .sort((a, b) => a.width! - b.width!)
    .filter((i) => !widths.has(i.width!) && widths.add(i.width!))
    .map((i) => ({ url: i.url!, width: i.width! }))
  return list.length ? list : undefined
}
interface RawPage {
  _embedded?: { events?: RawEvent[] }
  page?: { totalPages?: number }
}

const API = 'https://app.ticketmaster.com/discovery/v2/events.json'
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// O Ticketmaster aceita 5 pedidos por segundo: um a cada 250 ms fica abaixo disso.
const GAP = 250
let next = 0
function slot(): Promise<void> {
  const now = Date.now()
  const at = Math.max(now, next)
  next = at + GAP
  return sleep(at - now)
}

/** Erros que a tela explica de um jeito próprio. */
export class ConcertError extends Error {
  reason: 'key' | 'limit' | 'network'
  constructor(reason: 'key' | 'limit' | 'network') {
    super(reason)
    this.reason = reason
  }
}

async function call(params: Record<string, string>): Promise<RawPage> {
  await slot()
  const q = new URLSearchParams({ apikey: TICKETMASTER_KEY.trim(), classificationName: 'music', ...params })
  let r: Response
  try {
    r = await fetch(`${API}?${q}`)
  } catch {
    throw new ConcertError('network')
  }
  if (r.status === 401 || r.status === 403) throw new ConcertError('key')
  if (r.status === 429) throw new ConcertError('limit')
  if (!r.ok) throw new ConcertError('network')
  return (await r.json()) as RawPage
}

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz'

/** Geohash do ponto (o formato de lugar que o Ticketmaster pede). 5 letras ≈ um quadrado de 5 km. */
export function geohash(lat: number, lon: number, len = 5): string {
  let latR = [-90, 90]
  let lonR = [-180, 180]
  let out = ''
  let bits = 0
  let ch = 0
  let even = true
  while (out.length < len) {
    const r = even ? lonR : latR
    const v = even ? lon : lat
    const mid = (r[0] + r[1]) / 2
    ch <<= 1
    if (v >= mid) {
      ch |= 1
      r[0] = mid
    } else r[1] = mid
    if (even) lonR = r
    else latR = r
    even = !even
    if (++bits === 5) {
      out += BASE32[ch]
      bits = 0
      ch = 0
    }
  }
  return out
}

function distance(a: Place, lat: number, lon: number): number {
  const rad = Math.PI / 180
  const dLat = (lat - a.lat) * rad
  const dLon = (lon - a.lon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(lat * rad) * Math.sin(dLon / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/** Tempo de música de cada artista do histórico, pelo nome normalizado. */
function listened(d: Dataset): Map<string, { id: number; name: string; ms: number }> {
  const total = new Float64Array(d.creators.length)
  const { ms, item } = d.plays
  for (let i = 0; i < item.length; i++) {
    const it = d.items[item[i]]
    if (it.kind === 'music') total[it.creator] += ms[i]
  }
  const map = new Map<string, { id: number; name: string; ms: number }>()
  total.forEach((t, id) => {
    // Menos de 10 minutos ouvidos não conta como "um artista que você ouve".
    if (t < 10 * 60_000) return
    const key = norm(d.creators[id])
    const old = map.get(key)
    if (key && (!old || old.ms < t)) map.set(key, { id, name: d.creators[id], ms: t })
  })
  return map
}

/** Quantos artistas do topo ganham uma busca só deles, além da varredura da região. */
const TOP = 20
/** Páginas de 200 eventos da região (o Ticketmaster não passa de 1000 resultados por busca). */
const PAGES = 5

const CACHE_KEY = 'lyra-shows-v3'
const CACHE_TTL = 6 * 3600_000

interface Cached {
  key: string
  at: number
  list: Concert[]
}

// A mesma busca pedida duas vezes ao mesmo tempo (a aba também é desenhada escondida, ao lado) roda uma vez só.
const running = new Map<string, Promise<Concert[]>>()

/** Shows de artistas que você ouve, num raio de `radius` km do lugar, por ordem de data. */
export function nearbyConcerts(d: Dataset, place: Place, radius: number): Promise<Concert[]> {
  const cacheKey = `${geohash(place.lat, place.lon)}|${radius}|${d.importedAt}`
  let p = running.get(cacheKey)
  if (!p) {
    p = search(d, place, radius, cacheKey)
      .then((list) => dress(list, listened(d)))
      .finally(() => running.delete(cacheKey))
    running.set(cacheKey, p)
  }
  return p
}

async function search(d: Dataset, place: Place, radius: number, cacheKey: string): Promise<Concert[]> {
  const geo = geohash(place.lat, place.lon)
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Cached | null
    if (c && c.key === cacheKey && Date.now() - c.at < CACHE_TTL) return c.list
  } catch {
    // Sem localStorage: busca de novo.
  }

  const mine = listened(d)
  const found = new Map<string, Concert>()
  // Id do evento → nome do festival, para juntar os dias.
  const festivals = new Map<string, string>()
  const near = { geoPoint: geo, radius: String(radius), unit: 'km' }

  const add = (ev: RawEvent, searched?: string) => {
    if (found.has(ev.id) || ev.dates?.status?.code === 'cancelled') return
    const start = ev.dates?.start
    if (!start?.localDate) return
    const artists = new Map<number, { id: number; name: string; ms: number }>()
    // Atrações sem nome também aparecem; só as com nome contam.
    const listed = (ev._embedded?.attractions ?? []).filter((a) => a.name)
    for (const a of listed) {
      const m = mine.get(norm(a.name!))
      if (m) artists.set(m.id, m)
    }
    // Eventos sem atrações com nome: vale o começo do título ("Beto Guedes | The Cavern Club")
    // e, na busca pelo nome do artista, o nome em qualquer parte do título.
    // Com atrações e nenhuma sua (um tributo, por exemplo), não conta.
    if (listed.length === 0) {
      const head = mine.get(norm(ev.name.split(/\s[|\-–—:]\s/)[0]))
      if (head) artists.set(head.id, head)
      const m = searched && ` ${norm(ev.name)} `.includes(` ${searched} `) ? mine.get(searched) : undefined
      if (m) artists.set(m.id, m)
    }
    const fest = festivalName(ev, mine)
    if (artists.size === 0 && !fest) return
    const v = ev._embedded?.venues?.[0]
    const lat = Number(v?.location?.latitude)
    const lon = Number(v?.location?.longitude)
    found.set(ev.id, {
      id: ev.id,
      name: ev.name,
      date: start.localDate,
      time: start.dateTBD ? undefined : start.localTime,
      venue: v?.name ?? '',
      city: v?.city?.name ?? '',
      url: ev.url ?? '',
      km: Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon) ? distance(place, lat, lon) : undefined,
      artists: [...artists.values()].sort((a, b) => b.ms - a.ms),
    })
    if (!fest) return
    festivals.set(ev.id, fest)
    // Quando o Ticketmaster traz quem toca no dia, já é o line-up (sem a atração que é o próprio festival).
    const acts = listed.filter((a) => !marksFestival(a.classifications)).map((a) => ({ name: a.name! }))
    Object.assign(found.get(ev.id)!, {
      festival: true,
      images: art(ev),
      lineup: acts.length ? [{ date: start.localDate, acts }] : undefined,
    } satisfies Partial<Concert>)
  }

  // 1. Todos os shows de música da região, dos mais próximos no tempo aos mais distantes.
  for (let page = 0; page < PAGES; page++) {
    const r = await call({ ...near, sort: 'date,asc', size: '200', page: String(page) })
    for (const ev of r._embedded?.events ?? []) add(ev)
    if (page + 1 >= (r.page?.totalPages ?? 0)) break
  }

  // 2. Os artistas que você mais ouve (no último ano e desde sempre), um a um, para pegar shows mais distantes no tempo.
  const last = d.plays.start[d.plays.start.length - 1] ?? 0
  const top = new Map<string, string>()
  for (const a of [...topArtists(d, TOP - 5, last - 365 * 86400_000), ...topArtists(d, TOP)]) {
    if (top.size >= TOP) break
    const key = norm(a.name)
    if (key && !top.has(key)) top.set(key, a.name)
  }
  for (const [key, name] of top) {
    const r = await call({ ...near, keyword: name, size: '50' })
    for (const ev of r._embedded?.events ?? []) add(ev, key)
  }

  const today = new Date().toISOString().slice(0, 10)
  const list = joinDays(
    [...found.values()].filter((c) => c.date >= today),
    festivals,
  ).sort((a, b) =>
    (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')),
  )
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key: cacheKey, at: Date.now(), list } satisfies Cached))
  } catch {
    // Sem espaço: busca de novo na próxima vez.
  }
  return list
}

/**
 * Cada dia (ou setor) de um festival vem como um evento ("Lollapalooza Brasil 2027" em 19, 20 e 21 de março): vira um só.
 * Se os nomes dos eventos forem diferentes ("Rio Carnaval 2027 - Frisas", "… - Arquibancadas"), fica o nome do festival.
 */
function joinDays(list: Concert[], festivals: Map<string, string>): Concert[] {
  const out: Concert[] = []
  const fests = new Map<string, Concert>()
  for (const c of [...list].sort((a, b) => a.date.localeCompare(b.date))) {
    const name = festivals.get(c.id)
    if (!c.festival || !name) {
      out.push(c)
      continue
    }
    const key = `${norm(name)}|${norm(c.venue)}`
    const f = fests.get(key)
    if (!f) {
      const first = { ...c }
      fests.set(key, first)
      out.push(first)
      continue
    }
    if (c.name !== f.name) f.name = name
    // A lista vem em ordem de data: cada dia novo só pode estender o fim.
    if (c.date > (f.end ?? f.date)) f.end = c.date
    const ids = new Set(f.artists.map((a) => a.id))
    f.artists = [...f.artists, ...c.artists.filter((a) => !ids.has(a.id))].sort((a, b) => b.ms - a.ms)
    f.images ??= c.images
    for (const day of c.lineup ?? []) {
      const same = f.lineup?.find((x) => x.date === day.date)
      if (!same) f.lineup = [...(f.lineup ?? []), day]
      else {
        const names = new Set(same.acts.map((a) => norm(a.name)))
        same.acts = [...same.acts, ...day.acts.filter((a) => !names.has(norm(a.name)))]
      }
    }
  }
  return out
}

/**
 * Os festivais ganham o line-up de cada dia (o de lineups.ts, quando tem) com os artistas que você mais ouve na frente;
 * os outros seguem a ordem do cartaz. Roda depois do cache, para um line-up novo valer na hora.
 */
function dress(list: Concert[], mine: Map<string, { id: number; name: string; ms: number }>): Concert[] {
  const out = list.map((c) => {
    if (!c.festival) return c
    const f = { ...c }
    const name = `${norm(c.name)} `
    const known = LINEUPS.find((l) => {
      const first = Object.keys(l.days).sort()[0]
      return name.startsWith(`${norm(l.match)} `) && first?.slice(0, 4) === c.date.slice(0, 4)
    })
    let days = (c.lineup ?? []).map((d) => ({ date: d.date, names: d.acts.map((a) => a.name) }))
    if (known) {
      const dates = Object.keys(known.days).sort()
      f.name = known.title ?? c.name
      f.date = dates[0]
      f.end = dates.length > 1 ? dates[dates.length - 1] : undefined
      days = dates.filter((d) => known.days[d].length).map((d) => ({ date: d, names: known.days[d] }))
    }
    const yours = new Map<number, { id: number; name: string; ms: number }>()
    f.lineup = days.map(({ date, names }) => ({
      date,
      acts: names
        .map((n): Act => {
          let m = mine.get(norm(n))
          let via: string | undefined
          for (const other of m ? [] : (known?.also?.[n] ?? [])) {
            const o = mine.get(norm(other))
            // "Criolo, Amaro & Dino" já diz que é o Criolo; "TOMORA" precisa dizer que é a AURORA.
            if (o && (!m || o.ms > m.ms)) [m, via] = [o, norm(n).includes(norm(o.name)) ? undefined : o.name]
          }
          if (!m) return { name: n }
          yours.set(m.id, m)
          return { name: n, ms: m.ms, via }
        })
        // sort é estável: quem você não ouve fica na ordem do cartaz.
        .sort((a, b) => (b.ms ?? 0) - (a.ms ?? 0)),
    }))
    if (!f.lineup.length) f.lineup = undefined
    f.artists = [...yours.values()].sort((a, b) => b.ms - a.ms)
    return f
  })
  return out.sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
}

/** Uma cidade digitada → ponto no mapa (Open-Meteo, sem chave). */
export async function findCity(name: string, language: string): Promise<Place | null> {
  const q = new URLSearchParams({ name: name.trim(), count: '1', language, format: 'json' })
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${q}`)
  if (!r.ok) throw new ConcertError('network')
  const j = (await r.json()) as { results?: { name: string; latitude: number; longitude: number; admin1?: string; country_code?: string }[] }
  const c = j.results?.[0]
  if (!c) return null
  return { lat: c.latitude, lon: c.longitude, label: [c.name, c.admin1].filter(Boolean).join(', ') }
}

/** A localização do aparelho, arredondada para uns 1 km (o navegador pede permissão). */
export function hereNow(): Promise<{ lat: number; lon: number }> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('unsupported'))
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 100) / 100, lon: Math.round(p.coords.longitude * 100) / 100 }),
      (e) => reject(e),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600_000 },
    )
  })
}
