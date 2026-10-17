import { norm } from './search'

/*
 * Deezer: artistas parecidos, músicas mais tocadas, prévias de 30 segundos e capas de álbuns, sem login nem chave.
 * A API não libera leitura direta pelo navegador (CORS), então os pedidos vão por JSONP (uma tag <script>).
 * Daqui só saem nomes de artistas e de álbuns; o histórico continua no aparelho.
 */

export interface DzArtist {
  id: number
  name: string
  picture: string
}

export interface DzTrack {
  id: number
  title: string
  artist: string
  artistId: number
  cover: string
  /** Tem prévia de 30 segundos. */
  p: boolean
}

interface RawArtist {
  id: number
  name: string
  picture_medium?: string
}
interface RawTrack {
  id: number
  title: string
  title_short?: string
  preview?: string
  artist: { id: number; name: string }
  album?: { cover_medium?: string }
}
interface Failure {
  error?: { code?: number; message?: string }
}
type Page<T> = Failure & { data?: T[] }

const API = 'https://api.deezer.com'
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// O Deezer aceita 50 pedidos a cada 5 segundos: um pedido novo a cada 120 ms fica abaixo disso.
const GAP = 120
let next = 0
function slot(): Promise<void> {
  const now = Date.now()
  const at = Math.max(now, next)
  next = at + GAP
  return sleep(at - now)
}

let seq = 0
function jsonp<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const name = `__dz${seq++}`
    const slots = window as unknown as Record<string, ((data: T) => void) | undefined>
    const s = document.createElement('script')
    const timer = setTimeout(() => finish(new Error('timeout')), 15000)
    function finish(err: Error | null, data?: T) {
      clearTimeout(timer)
      delete slots[name]
      s.remove()
      if (err) reject(err)
      else resolve(data as T)
    }
    slots[name] = (data) => finish(null, data)
    s.onerror = () => finish(new Error('network'))
    s.src = `${API}${path}${path.includes('?') ? '&' : '?'}output=jsonp&callback=${name}`
    document.head.appendChild(s)
  })
}

/** Um pedido à API, com uma nova tentativa se a rede falhar ou o limite de pedidos estourar. */
async function call<T extends Failure>(path: string, tries = 3): Promise<T> {
  await slot()
  let r: T
  try {
    r = await jsonp<T>(path)
  } catch (e) {
    if (tries <= 1) throw e
    await sleep(1500)
    return call(path, tries - 1)
  }
  const code = r.error?.code
  if (code === 4 && tries > 1) {
    await sleep(2500)
    return call(path, tries - 1)
  }
  // 800 = "nada encontrado": vale como resposta vazia.
  if (code === 800) return {} as T
  if (r.error) throw new Error(r.error.message ?? 'deezer')
  return r
}

// Artistas, parecidos e listas de mais tocadas ficam guardados por uma semana neste navegador.
const CACHE_KEY = 'spotify-stats-deezer-v1'
const TTL = 7 * 86_400_000
type Stored = Record<string, { at: number; v: unknown }>

function load(): Stored {
  try {
    const s = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Stored
    const now = Date.now()
    for (const k of Object.keys(s)) if (now - s[k].at > TTL) delete s[k]
    return s
  } catch {
    return {}
  }
}
const stored = typeof localStorage === 'undefined' ? {} : load()
let saveTimer: ReturnType<typeof setTimeout> | undefined
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(stored))
    } catch {
      // Sem espaço: fica só na memória até fechar a página.
    }
  }, 500)
}

const inflight = new Map<string, Promise<unknown>>()
function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  if (stored[key]) return Promise.resolve(stored[key].v as T)
  let p = inflight.get(key) as Promise<T> | undefined
  if (!p) {
    p = run().then(
      (v) => {
        stored[key] = { at: Date.now(), v }
        save()
        inflight.delete(key)
        return v
      },
      (e: unknown) => {
        inflight.delete(key)
        throw e
      },
    )
    inflight.set(key, p)
  }
  return p
}

// Os endereços das prévias vencem depois de um tempo: ficam só na memória e são pedidos de novo quando ficam velhos.
const FRESH = 10 * 60_000
const previews = new Map<number, { url: string; at: number }>()
function keep(r: RawTrack) {
  if (r.preview) previews.set(r.id, { url: r.preview, at: Date.now() })
}

/** A prévia que já está na mão (ou null): serve para tocar na hora, ainda dentro do toque. */
export function knownPreview(id: number): string | null {
  const p = previews.get(id)
  return p && Date.now() - p.at < FRESH ? p.url : null
}

/** Endereço novo da prévia de 30 segundos. */
export async function previewOf(id: number): Promise<string | null> {
  const hit = knownPreview(id)
  if (hit) return hit
  const r = await call<RawTrack & Failure>(`/track/${id}`)
  keep(r)
  return r.preview || null
}

const toArtist = (a: RawArtist): DzArtist => ({ id: a.id, name: a.name, picture: a.picture_medium ?? '' })
const toTrack = (r: RawTrack): DzTrack => ({
  id: r.id,
  title: r.title_short || r.title,
  artist: r.artist.name,
  artistId: r.artist.id,
  cover: r.album?.cover_medium ?? '',
  p: !!r.preview,
})

/** O artista no Deezer com o mesmo nome (sem ligar para acentos e maiúsculas), ou null. */
export function findArtist(name: string): Promise<DzArtist | null> {
  const n = norm(name)
  return cached(`a:${n}`, async () => {
    const r = await call<Page<RawArtist>>(`/search/artist?q=${encodeURIComponent(name)}&limit=10`)
    const hit = (r.data ?? []).find((a) => norm(a.name) === n)
    return hit ? toArtist(hit) : null
  })
}

/** Artistas parecidos, do mais ao menos parecido. */
export function related(id: number): Promise<DzArtist[]> {
  return cached(`r:${id}`, async () => ((await call<Page<RawArtist>>(`/artist/${id}/related?limit=30`)).data ?? []).map(toArtist))
}

/** As 50 músicas mais tocadas do artista no Deezer. */
export function topTracks(id: number): Promise<DzTrack[]> {
  return cached(`t:${id}`, async () => {
    const list = (await call<Page<RawTrack>>(`/artist/${id}/top?limit=50`)).data ?? []
    list.forEach(keep)
    return list.map(toTrack)
  })
}

interface RawAlbum {
  title: string
  cover_medium?: string
  artist?: { name: string }
}

export interface DzAlbum {
  title: string
  artist: string
  /** Capa de 250 px. */
  cover: string
}

/** Álbuns que a busca do Deezer acha para o texto (artista e nome do álbum), os mais prováveis primeiro. */
export async function searchAlbums(q: string): Promise<DzAlbum[]> {
  const r = await call<Page<RawAlbum>>(`/search/album?q=${encodeURIComponent(q)}&limit=10`)
  return (r.data ?? []).flatMap((a) => (a.cover_medium && a.artist ? [{ title: a.title, artist: a.artist.name, cover: a.cover_medium }] : []))
}

/** Abre a música no Spotify (busca pelo nome e artista: sem login não dá para saber o endereço exato). */
export const spotifySearch = (t: { title: string; artist: string }) =>
  `https://open.spotify.com/search/${encodeURIComponent(`${t.title} ${t.artist}`)}`
