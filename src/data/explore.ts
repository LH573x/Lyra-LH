import { useSyncExternalStore } from 'react'
import type { Dataset } from './types'
import { norm } from './search'
import { creatorOf } from './stats'
import { lowerBound } from './calendar'
import { findArtist, previewOf, related, topTracks, type DzArtist, type DzTrack } from './deezer'

/*
 * A aba Explorar: músicas que você nunca ouviu, a partir dos artistas que você mais ouve.
 * Tudo o que já está no seu histórico (artistas e músicas) fica de fora.
 */

/**
 * Nome de música comparável, sem a versão: tudo entre parênteses ou colchetes e tudo depois de " - " sai.
 * "Enemy (with JID) - from the series Arcane League of Legends", "Enemy (Live)" e "Enemy" viram "enemy".
 */
const titleKey = (s: string) => norm(s.replace(/\s*[([][^)\]]*[)\]]/g, ' ').replace(/\s+[-–—]\s.*$/, '')) || norm(s)

// "(feat. JID)", "(with JID)", "(com Anitta)": quem aparece de convidado também conta como artista que você já ouviu.
const GUESTS = /[([](?:feat\.?|ft\.?|featuring|with|com|con)\s+([^)\]]+)[)\]]/gi
const SPLIT = /\s*(?:,|&|\+|\band\b|\bx\b|\be\b|\by\b)\s*/i
/** Nome de artista comparável, sem espaços: "J.I.D" e "JID", "AC/DC" e "ACDC" batem. */
const artistKey = (s: string) => norm(s).replace(/ /g, '')

interface Known {
  artists: Set<string>
  /** Artista → músicas ouvidas dele. */
  songs: Map<string, Set<string>>
}

const knownCache = new WeakMap<Dataset, Known>()
function known(d: Dataset): Known {
  let k = knownCache.get(d)
  if (k) return k
  k = { artists: new Set(), songs: new Map() }
  // Uma vez por artista, não por música.
  const keys: string[] = []
  for (const it of d.items) {
    if (it.kind !== 'music') continue
    const a = (keys[it.creator] ??= artistKey(d.creators[it.creator]))
    k.artists.add(a)
    for (const [, guests] of it.name.matchAll(GUESTS)) {
      k.artists.add(artistKey(guests))
      for (const g of guests.split(SPLIT)) if (g) k.artists.add(artistKey(g))
    }
    let set = k.songs.get(a)
    if (!set) k.songs.set(a, (set = new Set()))
    set.add(titleKey(it.name))
  }
  knownCache.set(d, k)
  return k
}

const knowsArtist = (k: Known, name: string) => k.artists.has(artistKey(name)) || hidden.has(artistHideKey(name))
const knowsSong = (k: Known, t: DzTrack, artist = t.artist) =>
  (k.songs.get(artistKey(artist))?.has(titleKey(t.title)) ?? false) || hidden.has(songKey(t))

/** O ranking de sempre não muda: a roleta pede de novo a cada giro. */
const allTime = new WeakMap<Dataset, number[]>()

/** Seus artistas de música mais ouvidos (a partir de `since`, em ms). */
export function topArtists(d: Dataset, n: number, since = -Infinity): { id: number; name: string }[] {
  let ids = since === -Infinity ? allTime.get(d) : undefined
  if (!ids) {
    const total = new Float64Array(d.creators.length)
    const { start, ms, item } = d.plays
    const creator = creatorOf(d)
    const music = Uint8Array.from(d.items, (it) => (it.kind === 'music' ? 1 : 0))
    // As reproduções estão em ordem: começa direto na primeira depois de `since`.
    for (let i = lowerBound(start, since); i < item.length; i++) if (music[item[i]]) total[creator[item[i]]] += ms[i]
    ids = [...total.keys()].filter((c) => total[c] > 0).sort((a, b) => total[b] - total[a])
    if (since === -Infinity) allTime.set(d, ids)
  }
  return ids.slice(0, n).map((id) => ({ id, name: d.creators[id] }))
}

// Sorteio com semente: a mesma semana e os mesmos dados dão sempre as mesmas descobertas.
function rng(seed: string) {
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let x = Math.imul(h ^ (h >>> 15), 1 | h)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}
function shuffle<T>(list: T[], rnd: () => number): T[] {
  const a = [...list]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const pad = (n: number) => String(n).padStart(2, '0')
/** A segunda-feira desta semana: "2026-10-05". */
function weekKey(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}
function write(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // Sem espaço: refaz na próxima vez.
  }
}

export interface Pick {
  track: DzTrack
  /** O artista seu que levou a esta música. */
  because: string
}

const WEEK_KEY = 'spotify-stats-explore-week'
// Sobe quando o filtro muda, para refazer a lista da semana com as regras novas.
const WEEK_VERSION = 2

/**
 * 10 músicas novas por semana: artistas parecidos com os seus 10 mais ouvidos nos últimos 3 meses
 * do histórico, uma música de cada, alternando entre os seus artistas.
 */
export async function weekly(d: Dataset): Promise<Pick[]> {
  const week = weekKey()
  const saved = read<{ v?: number; week: string; data: number; picks: Pick[] }>(WEEK_KEY)
  if (saved && saved.v === WEEK_VERSION && saved.week === week && saved.data === d.importedAt && saved.picks.length > 0) return saved.picks

  const k = known(d)
  const rnd = rng(`${week}:${d.importedAt}`)
  const last = d.plays.start[d.plays.start.length - 1] ?? 0
  let seeds = topArtists(d, 10, last - 90 * 86_400_000)
  if (seeds.length < 5) seeds = topArtists(d, 10)

  // Uma falha num artista não derruba a lista; só quando nada deu certo é que vira erro (com "Tentar de novo").
  let failed = false
  const fail = <T,>(fallback: T) => () => {
    failed = true
    return fallback
  }
  const pools = await Promise.all(
    seeds.map(async (s) => {
      const a = await findArtist(s.name).catch(fail(null))
      const rel = a ? await related(a.id).catch(fail([] as DzArtist[])) : []
      return { because: s.name, list: shuffle(rel.filter((r) => !knowsArtist(k, r.name)).slice(0, 12), rnd) }
    }),
  )

  const used = new Set<number>()
  const picks: Pick[] = []
  for (let round = 0; round < 4 && picks.length < 10; round++) {
    // Em cada rodada, um candidato por artista seu, buscados juntos.
    const tries: { because: string; artist: DzArtist }[] = []
    for (const p of pools) {
      let c = p.list.shift()
      while (c && used.has(c.id)) c = p.list.shift()
      if (!c) continue
      used.add(c.id)
      tries.push({ because: p.because, artist: c })
    }
    if (tries.length === 0) break
    const tops = await Promise.all(tries.map((x) => topTracks(x.artist.id).catch(fail([] as DzTrack[]))))
    tries.forEach((x, i) => {
      if (picks.length >= 10) return
      const ok = tops[i].filter((t) => t.artistId === x.artist.id && t.p && !knowsSong(k, t)).slice(0, 3)
      if (ok.length) picks.push({ track: ok[Math.floor(rnd() * ok.length)], because: x.because })
    })
  }
  if (picks.length === 0 && failed) throw new Error('deezer')
  if (picks.length > 0) write(WEEK_KEY, { v: WEEK_VERSION, week, data: d.importedAt, picks })
  return picks
}

export interface Similar {
  artist: DzArtist
  track: DzTrack | null
}

/** Até 5 artistas parecidos com `name` que você nunca ouviu, cada um com a música mais famosa. */
export async function similarTo(d: Dataset, name: string, n = 5): Promise<Similar[]> {
  const k = known(d)
  const a = await findArtist(name)
  if (!a) return []
  const rel = (await related(a.id)).filter((r) => !knowsArtist(k, r.name)).slice(0, n)
  return Promise.all(
    rel.map(async (r) => {
      const tops = await topTracks(r.id).catch(() => [] as DzTrack[])
      return { artist: r, track: tops.find((t) => t.artistId === r.id) ?? tops[0] ?? null }
    }),
  )
}

export interface SideB {
  name: string
  artist: DzArtist
  tracks: DzTrack[]
}

/** Para os seus 5 artistas favoritos: as músicas mais tocadas deles que você nunca ouviu. */
export async function sideB(d: Dataset, n = 5): Promise<SideB[]> {
  const k = known(d)
  let failed = false
  const list = await Promise.all(
    topArtists(d, n).map(async ({ name }) => {
      const a = await findArtist(name).catch(() => {
        failed = true
        return null
      })
      if (!a) return null
      const seen = new Set<string>()
      const top = await topTracks(a.id).catch(() => {
        failed = true
        return [] as DzTrack[]
      })
      const tracks = top.filter((t) => {
        const key = titleKey(t.title)
        if (t.artistId !== a.id || seen.has(key)) return false
        seen.add(key)
        return !knowsSong(k, t, name)
      })
      return { name, artist: a, tracks }
    }),
  )
  const ok = list.filter((x): x is SideB => !!x && x.tracks.length > 0)
  if (ok.length === 0 && failed) throw new Error('deezer')
  return ok
}

/** A roleta: uma música desconhecida de um artista parecido com um dos seus 30 mais ouvidos, já com a prévia pronta. */
export async function spin(d: Dataset, skip: Set<number>): Promise<DzTrack | null> {
  const k = known(d)
  const pool = topArtists(d, 30)
  for (let i = 0; i < 6 && pool.length > 0; i++) {
    const seed = pool[Math.floor(Math.random() * pool.length)]
    const a = await findArtist(seed.name).catch(() => null)
    if (!a) continue
    const rel = (await related(a.id).catch(() => [] as DzArtist[])).filter((r) => !knowsArtist(k, r.name)).slice(0, 15)
    if (rel.length === 0) continue
    const r = rel[Math.floor(Math.random() * rel.length)]
    const ok = (await topTracks(r.id).catch(() => [] as DzTrack[]))
      .filter((t) => t.artistId === r.id && t.p && !skip.has(t.id) && !knowsSong(k, t))
      .slice(0, 5)
    if (ok.length === 0) continue
    const t = ok[Math.floor(Math.random() * ok.length)]
    if (await previewOf(t.id).catch(() => null)) return t
  }
  return null
}

// Músicas marcadas com "Gostei" na roleta, guardadas neste aparelho.
const LIKED_KEY = 'spotify-stats-explore-liked'
let liked: DzTrack[] = (typeof localStorage === 'undefined' ? null : read<DzTrack[]>(LIKED_KEY)) ?? []
const listeners = new Set<() => void>()

export function toggleLike(t: DzTrack) {
  liked = liked.some((x) => x.id === t.id) ? liked.filter((x) => x.id !== t.id) : [t, ...liked]
  write(LIKED_KEY, liked)
  listeners.forEach((f) => f())
}

// "Já conheço": músicas e artistas que você escondeu (ouviu depois do arquivo, ou fora do Spotify), guardados neste aparelho.
const HIDDEN_KEY = 'spotify-stats-explore-hidden'
let hidden: ReadonlySet<string> = new Set((typeof localStorage === 'undefined' ? null : read<string[]>(HIDDEN_KEY)) ?? [])
/** Escondidos nesta visita: continuam na tela com "Desfazer" até a página recarregar. */
const recent = new Set<string>()

export const songKey = (t: { title: string; artist: string }) => `${artistKey(t.artist)}|${titleKey(t.title)}`
export const artistHideKey = (name: string) => `${artistKey(name)}|`

export function setHidden(key: string, on: boolean) {
  const next = new Set(hidden)
  if (on) {
    next.add(key)
    recent.add(key)
  } else next.delete(key)
  hidden = next
  write(HIDDEN_KEY, [...next])
  listeners.forEach((f) => f())
}

/** O que você marcou com "Já conheço". */
export const useHidden = () => useSyncExternalStore(subscribe, () => hidden)
/** Aparece na lista: não foi escondido, ou acabou de ser (e mostra "Desfazer"). */
export const shows = (h: ReadonlySet<string>, key: string) => !h.has(key) || recent.has(key)

function subscribe(f: () => void) {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}

/** As músicas que você marcou com "Gostei", da mais recente à mais antiga. */
export const useLiked = () => useSyncExternalStore(subscribe, () => liked)
