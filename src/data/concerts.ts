import type { Dataset } from './types'
import { norm } from './search'
import { topArtists } from './explore'
import { TICKETMASTER_KEY } from '../config'

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
}

interface RawEvent {
  id: string
  name: string
  url?: string
  dates?: { start?: { localDate?: string; localTime?: string; dateTBD?: boolean }; status?: { code?: string } }
  _embedded?: {
    venues?: { name?: string; city?: { name?: string }; location?: { latitude?: string; longitude?: string } }[]
    attractions?: { name?: string }[]
  }
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

const CACHE_KEY = 'lyra-shows'
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
    p = search(d, place, radius, cacheKey).finally(() => running.delete(cacheKey))
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
  const near = { geoPoint: geo, radius: String(radius), unit: 'km' }

  const add = (ev: RawEvent, searched?: string) => {
    if (found.has(ev.id) || ev.dates?.status?.code === 'cancelled') return
    const start = ev.dates?.start
    if (!start?.localDate) return
    const artists = new Map<number, { id: number; name: string; ms: number }>()
    const listed = ev._embedded?.attractions ?? []
    for (const a of listed) {
      const m = a.name ? mine.get(norm(a.name)) : undefined
      if (m) artists.set(m.id, m)
    }
    // Eventos sem atrações cadastradas: na busca pelo nome do artista, vale o nome no título do show.
    // Com atrações e nenhuma sua (um tributo, por exemplo), não conta.
    if (searched && listed.length === 0 && ` ${norm(ev.name)} `.includes(` ${searched} `)) {
      const m = mine.get(searched)
      if (m) artists.set(m.id, m)
    }
    if (artists.size === 0) return
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
  const list = [...found.values()].filter((c) => c.date >= today).sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')))
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ key: cacheKey, at: Date.now(), list } satisfies Cached))
  } catch {
    // Sem espaço: busca de novo na próxima vez.
  }
  return list
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
