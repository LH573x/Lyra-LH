import type { Account, Dataset, ListenerTier, Playlist, SavedTrack } from './types'
import type { AlbumRef } from './images'
import { MIN_PLAY_MS } from './stats'

/** Arquivos do pacote "Dados da conta" que a Lyra usa. O resto (e-mail, endereço, mensagens…) nem é aberto. */
export function isAccountFile(path: string): boolean {
  const base = path.split('/').pop() ?? path
  return /^(Playlist\d+|YourLibrary|Marquee)\.json$/i.test(base)
}

const TIERS: Record<string, ListenerTier> = {
  'super listeners': 'super',
  'moderate listeners': 'moderate',
  'light listeners': 'light',
  'previously active listeners': 'past',
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')

const DAY = /^\d{4}-\d{2}-\d{2}$/

function saved(name: unknown, artist: unknown, album: unknown, uri: unknown, added?: unknown): SavedTrack | null {
  const n = str(name).trim()
  const a = str(artist).trim()
  if (!n || !a) return null
  const s: SavedTrack = { name: n, artist: a, album: str(album) }
  const u = str(uri)
  if (u.startsWith('spotify:track:')) s.uri = u
  const day = str(added)
  if (DAY.test(day)) s.added = day
  return s
}

/** Junta os JSONs do pacote num Account (ou undefined, se nenhum veio). */
export function readAccount(files: { name: string; json: unknown }[]): Account | undefined {
  if (files.length === 0) return undefined
  const account: Account = { playlists: [], liked: [], tiers: {} }
  for (const { name, json } of files) {
    const base = (name.split('/').pop() ?? name).toLowerCase()
    const obj = json as Record<string, unknown>
    if (base.startsWith('playlist')) {
      const list = Array.isArray(obj?.playlists) ? obj.playlists : []
      for (const p of list as Record<string, unknown>[]) {
        const items = Array.isArray(p?.items) ? (p.items as Record<string, unknown>[]) : []
        const tracks = items
          .map((i) => {
            const tr = i?.track as Record<string, unknown> | null
            return tr && saved(tr.trackName, tr.artistName, tr.albumName, tr.trackUri, i.addedDate)
          })
          .filter((tr): tr is SavedTrack => !!tr)
        const modified = str(p.lastModifiedDate)
        if (tracks.length > 0) account.playlists.push({ name: str(p.name) || '—', ...(DAY.test(modified) ? { modified } : {}), tracks })
      }
    } else if (base === 'yourlibrary.json') {
      const list = Array.isArray(obj?.tracks) ? (obj.tracks as Record<string, unknown>[]) : []
      for (const tr of list) {
        const s = tr && saved(tr.track, tr.artist, tr.album, tr.uri)
        if (s) account.liked.push(s)
      }
    } else if (base === 'marquee.json' && Array.isArray(json)) {
      for (const m of json as Record<string, unknown>[]) {
        const tier = TIERS[str(m?.segment).toLowerCase()]
        const artist = str(m?.artistName)
        if (tier && artist) account.tiers[artist] = tier
      }
    }
  }
  return account
}

const YEAR_MS = 365 * 86_400_000
const songKey = (artist: string, name: string) => `${artist.trim().toLowerCase()}|${name.trim().toLowerCase()}`

interface Usage {
  byUri: Map<string, number>
  byName: Map<string, number>
  last: Float64Array
  plays: Uint32Array
  /** Fim do histórico; "no último ano" conta a partir daqui. */
  end: number
}

const cache = new WeakMap<Dataset, Usage>()

function usage(d: Dataset): Usage {
  let u = cache.get(d)
  if (u) return u
  const n = d.items.length
  const { start, ms, item } = d.plays
  const end = start.length ? start[start.length - 1] : 0
  u = { byUri: new Map(), byName: new Map(), last: new Float64Array(n).fill(-Infinity), plays: new Uint32Array(n), end }
  d.items.forEach((it, id) => {
    if (it.kind !== 'music') return
    if (it.uri) u!.byUri.set(it.uri, id)
    u!.byName.set(songKey(d.creators[it.creator], it.name), id)
  })
  for (let i = 0; i < start.length; i++) {
    const it = item[i]
    if (start[i] > u.last[it]) u.last[it] = start[i]
    if (ms[i] >= MIN_PLAY_MS) u.plays[it]++
  }
  cache.set(d, u)
  return u
}

/** A música salva no histórico (ou undefined, se nunca tocou). */
function find(u: Usage, t: SavedTrack): number | undefined {
  const byUri = t.uri ? u.byUri.get(t.uri) : undefined
  return byUri ?? u.byName.get(songKey(t.artist, t.name))
}

const dayMs = (day: string | undefined) => (day ? Date.parse(`${day}T00:00:00Z`) : -Infinity)

/** As músicas de uma playlist, sem repetir, com o item do histórico (se tocou) e o dia em que entraram. */
interface Song {
  track: SavedTrack
  id: number | undefined
  added: number
}

const songsCache = new WeakMap<Playlist, Song[]>()

function songsOf(u: Usage, p: Playlist): Song[] {
  let list = songsCache.get(p)
  if (list) return list
  const byKey = new Map<number | string, Song>()
  for (const tr of p.tracks) {
    const id = find(u, tr)
    const key = id ?? songKey(tr.artist, tr.name)
    const added = dayMs(tr.added)
    const cur = byKey.get(key)
    if (!cur) byKey.set(key, { track: tr, id, added })
    else if (added < cur.added) cur.added = added
  }
  list = [...byKey.values()]
  songsCache.set(p, list)
  return list
}

/** Capas da playlist: as 4 primeiras músicas de álbuns diferentes, como o Spotify faz sem foto. */
export function playlistCovers(p: Playlist): AlbumRef[] {
  const seen = new Set<string>()
  const out: AlbumRef[] = []
  for (const tr of p.tracks) {
    if (!tr.album) continue
    const key = `${tr.artist}|${tr.album}`.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind: 'album', artist: tr.artist, album: tr.album })
    if (out.length === 4) break
  }
  return out
}

export interface PlaylistRank {
  /** Posição em Account.playlists (é o endereço da página dela). */
  index: number
  name: string
  songs: number
  /** Tempo ouvindo as músicas dela desde que cada uma entrou na playlist. */
  ms: number
  /** Músicas dela que você já ouviu de verdade. */
  played: number
  rank: number
}

const rankCache = new WeakMap<Dataset, PlaylistRank[]>()

/** Playlists da mais ouvida para a menos: conta o tempo nas músicas dela desde o dia em que entraram. */
export function playlistRanking(d: Dataset): PlaylistRank[] {
  if (!d.account) return []
  const cached = rankCache.get(d)
  if (cached) return cached
  const u = usage(d)
  const lists = d.account.playlists
  // Para cada música, em quais playlists ela está e desde quando.
  const inLists = new Map<number, { p: number; added: number }[]>()
  const out = lists.map((p, index) => {
    const songs = songsOf(u, p)
    let played = 0
    for (const s of songs) {
      if (s.id === undefined) continue
      if (u.plays[s.id] > 0) played++
      let l = inLists.get(s.id)
      if (!l) inLists.set(s.id, (l = []))
      l.push({ p: index, added: s.added })
    }
    return { index, name: p.name, songs: songs.length, ms: 0, played, rank: 0 }
  })
  const { start, ms, item } = d.plays
  for (let i = 0; i < start.length; i++) {
    const l = inLists.get(item[i])
    if (l) for (const x of l) if (start[i] >= x.added) out[x.p].ms += ms[i]
  }
  out.sort((a, b) => b.ms - a.ms || b.songs - a.songs)
  out.forEach((p, i) => (p.rank = i + 1))
  rankCache.set(d, out)
  return out
}

export interface PlaylistDetail {
  name: string
  rank: number
  songs: number
  played: number
  ms: number
  plays: number
  /** Primeira e última música adicionadas. */
  firstAdded: number | null
  lastAdded: number | null
  /** Por mês ("2026-08"): horas ouvindo as músicas dela e quantas músicas entraram. */
  monthly: { month: string; hours: number; added: number }[]
  topSongs: { id: number; ms: number; plays: number }[]
  topArtists: { name: string; creator: number | null; songs: number; ms: number }[]
  /** Músicas dela que nunca tocaram de verdade. */
  never: SavedTrack[]
  neverCount: number
}

const pad = (n: number) => String(n).padStart(2, '0')
const monthKey = (ms: number) => {
  const dt = new Date(ms)
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`
}

/** Tudo sobre uma playlist, como as páginas de artista e de música. */
export function playlistDetail(d: Dataset, index: number): PlaylistDetail | null {
  const p = d.account?.playlists[index]
  if (!p) return null
  const u = usage(d)
  const songs = songsOf(u, p)
  const since = new Map<number, number>()
  for (const s of songs) if (s.id !== undefined) since.set(s.id, s.added)

  const perSong = new Map<number, { ms: number; plays: number }>()
  const hoursBy = new Map<string, number>()
  let ms = 0
  let plays = 0
  const { start, ms: played, item } = d.plays
  for (let i = 0; i < start.length; i++) {
    const added = since.get(item[i])
    if (added === undefined || start[i] < added) continue
    ms += played[i]
    let s = perSong.get(item[i])
    if (!s) perSong.set(item[i], (s = { ms: 0, plays: 0 }))
    s.ms += played[i]
    if (played[i] >= MIN_PLAY_MS) {
      s.plays++
      plays++
    }
    const k = monthKey(start[i])
    hoursBy.set(k, (hoursBy.get(k) ?? 0) + played[i] / 3.6e6)
  }

  const addedBy = new Map<string, number>()
  let firstAdded: number | null = null
  let lastAdded: number | null = null
  for (const s of songs) {
    if (!Number.isFinite(s.added)) continue
    const k = monthKey(s.added)
    addedBy.set(k, (addedBy.get(k) ?? 0) + 1)
    if (firstAdded === null || s.added < firstAdded) firstAdded = s.added
    if (lastAdded === null || s.added > lastAdded) lastAdded = s.added
  }
  // Todos os meses entre o primeiro e o último, para o gráfico não pular buracos.
  const keys = [...hoursBy.keys(), ...addedBy.keys()].sort()
  const monthly: PlaylistDetail['monthly'] = []
  if (keys.length) {
    let [y, m] = keys[0].split('-').map(Number)
    const last = keys[keys.length - 1]
    for (;;) {
      const k = `${y}-${pad(m)}`
      monthly.push({ month: k, hours: hoursBy.get(k) ?? 0, added: addedBy.get(k) ?? 0 })
      if (k >= last) break
      if (++m > 12) [y, m] = [y + 1, 1]
    }
  }

  const artists = new Map<string, { name: string; creator: number | null; songs: number; ms: number }>()
  const creatorIndex = new Map(d.creators.map((c, i) => [c.toLowerCase(), i]))
  for (const s of songs) {
    const key = s.track.artist.toLowerCase()
    let a = artists.get(key)
    if (!a) artists.set(key, (a = { name: s.track.artist, creator: creatorIndex.get(key) ?? null, songs: 0, ms: 0 }))
    a.songs++
    if (s.id !== undefined) a.ms += perSong.get(s.id)?.ms ?? 0
  }

  const never = songs.filter((s) => s.id === undefined || u.plays[s.id] === 0).map((s) => s.track)
  const rank = playlistRanking(d).find((r) => r.index === index)
  return {
    name: p.name,
    rank: rank?.rank ?? 0,
    songs: songs.length,
    played: rank?.played ?? 0,
    ms,
    plays,
    firstAdded,
    lastAdded,
    monthly,
    topSongs: [...perSong.entries()]
      .map(([id, s]) => ({ id, ...s }))
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 10),
    topArtists: [...artists.values()].sort((a, b) => b.ms - a.ms || b.songs - a.songs).slice(0, 8),
    never: never.slice(0, 9),
    neverCount: never.length,
  }
}

export interface LikedForgotten {
  /** Curtidas que você ouviu muito e não toca há mais de um ano. */
  abandoned: { id: number; plays: number; last: number }[]
  /** Curtidas que nunca aparecem no histórico. */
  never: SavedTrack[]
  neverCount: number
  liked: number
}

/** Curtidas esquecidas: as `n` mais ouvidas que você largou e `nNever` das que nunca tocou. */
export function likedForgotten(d: Dataset, n = 8, nNever = 4): LikedForgotten | null {
  if (!d.account || d.account.liked.length === 0) return null
  const u = usage(d)
  const seen = new Set<string | number>()
  const abandoned: LikedForgotten['abandoned'] = []
  const never: SavedTrack[] = []
  for (const tr of d.account.liked) {
    const id = find(u, tr)
    const key = id ?? songKey(tr.artist, tr.name)
    if (seen.has(key)) continue
    seen.add(key)
    if (id === undefined || u.plays[id] === 0) never.push(tr)
    else if (u.last[id] < u.end - YEAR_MS) abandoned.push({ id, plays: u.plays[id], last: u.last[id] })
  }
  abandoned.sort((a, b) => b.plays - a.plays)
  return { abandoned: abandoned.slice(0, n), never: never.slice(0, nNever), neverCount: never.length, liked: seen.size }
}
