import { useEffect, useSyncExternalStore } from 'react'
import { searchAlbums, type DzAlbum } from './deezer'

/*
 * Fotos de artistas e podcasts vêm do Wikidata (imagem do Wikimedia Commons) e capas de
 * álbuns vêm do Deezer (ou, quando ele não acha ou falha, do MusicBrainz, com o Cover Art Archive).
 * Nenhum deles pede login. Só os nomes que aparecem na tela são buscados, e o resultado
 * fica guardado neste navegador.
 */

export type ImageRef =
  | { kind: 'artist' | 'podcast'; name: string; /** Capa usada quando não há foto. */ fallback?: AlbumRef }
  | AlbumRef

export interface AlbumRef {
  kind: 'album'
  artist: string
  album: string
}

interface Entry {
  url: string | null
  at: number
  /**
   * 2: capa buscada também no Deezer. As de antes, que só o MusicBrainz procurou, são buscadas de novo:
   * as imagens do Cover Art Archive demoram e às vezes falham, e a que já estava fica na tela enquanto isso.
   */
  v?: number
}

const CACHE_KEY = 'spotify-stats-images-v1'
/** Quando não achou nada, tenta de novo depois de uma semana. */
const RETRY_MS = 7 * 86_400_000

function loadCache(): Record<string, Entry> {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, Entry>
  } catch {
    return {}
  }
}

const cache = loadCache()
let saveTimer: ReturnType<typeof setTimeout> | undefined
const listeners = new Set<() => void>()
const inflight = new Map<string, Promise<string | null>>()
/** Buscas que falharam por rede nesta visita: param de mostrar "carregando". */
const failed = new Set<string>()
/** Imagens que o navegador não conseguiu abrir nesta visita (até a rede voltar). */
const broken = new Set<string>()
/** Capas que não abriram e foram procuradas na outra fonte nesta visita, e as que estão sendo procuradas agora. */
const swapped = new Set<string>()
const swapping = new Set<string>()
/** Buscas e downloads de imagem em andamento. */
let working = 0

function tracked<T>(p: Promise<T>): Promise<T> {
  working++
  const done = () => void working--
  p.then(done, done)
  return p
}

/**
 * Espera as imagens que estão chegando, até `maxMs`: um cartão que acabou de montar ainda busca as
 * dele. Calmo duas vezes seguidas, porque uma imagem que chega faz o cartão pedir a versão em data URL.
 */
export async function imagesSettled(maxMs = 6000) {
  const end = Date.now() + maxMs
  for (let calm = 0; calm < 2 && Date.now() < end; ) {
    await new Promise((r) => setTimeout(r, 60))
    calm = working === 0 ? calm + 1 : 0
  }
}

function store(key: string, url: string | null) {
  cache[key] = { url, at: Date.now(), v: 2 }
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
    } catch {
      // Sem espaço ou bloqueado: as imagens só não ficam guardadas.
    }
  }, 500)
  for (const l of listeners) l()
}

/** Quanto uma imagem é desejada agora: 0 = ninguém (sai da fila), 1 = numa parte montada da página, 2 = na tela. */
type Level = () => number

/** A busca saiu da fila porque ninguém mais mostra aquela imagem. */
const SKIPPED = new Error('skipped')

/**
 * Fila com no máximo `concurrency` pedidos ao mesmo tempo e `gapMs` entre o início de cada um.
 * Vai primeiro o que está na tela; o que ninguém mais mostra é tirado sem gastar a vez.
 */
function limiter(concurrency: number, gapMs: number) {
  let active = 0
  let last = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const queue: { level: Level; run: () => void; drop: () => void }[] = []
  const next = () => {
    while (timer === undefined && active < concurrency && queue.length > 0) {
      let pick = -1
      let best = 0
      for (let k = 0; k < queue.length && best < 2; k++) {
        const lv = queue[k].level()
        if (lv <= 0) {
          queue.splice(k--, 1)[0].drop()
          continue
        }
        if (lv > best) [pick, best] = [k, lv]
      }
      if (pick < 0) return
      const wait = last + gapMs - Date.now()
      if (wait > 0) {
        timer = setTimeout(() => {
          timer = undefined
          next()
        }, wait)
        return
      }
      active++
      last = Date.now()
      queue.splice(pick, 1)[0].run()
    }
  }
  return <T>(job: () => Promise<T>, level: Level = () => 2) =>
    new Promise<T>((resolve, reject) => {
      queue.push({
        level,
        run: () =>
          void job()
            .then(resolve, reject)
            .finally(() => {
              active--
              next()
            }),
        drop: () => reject(SKIPPED),
      })
      next()
    })
}

const wiki = limiter(4, 0)
// O Deezer aceita vários pedidos por segundo (o ritmo fica com o deezer.ts); o MusicBrainz, um só.
const deezer = limiter(3, 0)
const musicbrainz = limiter(1, 1100)

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as T
}

/**
 * Compara nomes sem acento, caixa, "The" no começo e pontuação, em qualquer alfabeto
 * (葉惠美 e 范特西 são nomes diferentes). Um nome que fica vazio não bate com nada.
 */
export function sameName(a: string, b: string) {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/^the\s+/, '')
      .replace(/[^\p{L}\p{N}\p{M}]+/gu, '')
  const x = norm(a)
  return x !== '' && x === norm(b)
}

const WIKIDATA = 'https://www.wikidata.org/w/api.php?format=json&origin=*&'
const COMMONS = 'https://commons.wikimedia.org/w/api.php?format=json&origin=*&'

interface Term {
  value: string
}
interface Snak {
  rank?: string
  mainsnak?: { datavalue?: { value?: unknown } }
}

/**
 * Artista: procura no Wikidata itens com esse nome que tenham ID do Spotify ou do MusicBrainz
 * (para não pegar uma cidade ou um filme com o mesmo nome), confere o nome e pega a foto (P18).
 */
async function findPhoto(name: string, podcast: boolean, level: Level): Promise<string | null> {
  const has = podcast ? 'haswbstatement:P5916' : 'haswbstatement:P1902|P434'
  const term = name.replace(/["~*?\\:()[\]{}]/g, ' ').replace(/^[-!\s]+/, '')
  const search = await wiki(
    () =>
      getJson<{ query?: { search?: { title: string }[] } }>(
        WIKIDATA + new URLSearchParams({ action: 'query', list: 'search', srsearch: `${term} ${has}`, srlimit: '5', srprop: '' }),
      ),
    level,
  )
  const ids = (search.query?.search ?? []).map((s) => s.title).filter((t) => /^Q\d+$/.test(t))
  if (ids.length === 0) return null

  const terms = await wiki(
    () =>
      getJson<{ entities?: Record<string, { labels?: Record<string, Term>; aliases?: Record<string, Term[]> }> }>(
        WIKIDATA + new URLSearchParams({ action: 'wbgetentities', ids: ids.join('|'), props: 'labels|aliases', languages: 'mul|en|pt|pt-br|es' }),
      ),
    level,
  )
  const id = ids.find((q) => {
    const e = terms.entities?.[q]
    const names = [...Object.values(e?.labels ?? {}), ...Object.values(e?.aliases ?? {}).flat()].map((t) => t.value)
    return names.some((n) => sameName(n, name))
  })
  if (!id) return null

  const claims = await wiki(
    () => getJson<{ claims?: { P18?: Snak[] } }>(WIKIDATA + new URLSearchParams({ action: 'wbgetclaims', entity: id, property: 'P18' })),
    level,
  )
  const snaks = (claims.claims?.P18 ?? []).filter((s) => s.rank !== 'deprecated')
  const file = (snaks.find((s) => s.rank === 'preferred') ?? snaks[0])?.mainsnak?.datavalue?.value
  if (typeof file !== 'string') return null

  const info = await wiki(
    () =>
      getJson<{ query?: { pages?: Record<string, { imageinfo?: { thumburl?: string }[] }> } }>(
        COMMONS + new URLSearchParams({ action: 'query', titles: `File:${file}`, prop: 'imageinfo', iiprop: 'url', iiurlwidth: '320' }),
      ),
    level,
  )
  const page = Object.values(info.query?.pages ?? {})[0]
  return page?.imageinfo?.[0]?.thumburl ?? null
}

/** "AM (Deluxe Edition)" → "AM", para achar o álbum original. */
function cleanAlbum(album: string) {
  let s = album
  for (let i = 0; i < 3; i++) {
    s = s
      .replace(/\s*[([][^)\]]*\b(deluxe|remaster(ed)?|edition|version|expanded|anniversary|bonus)\b[^)\]]*[)\]]\s*$/i, '')
      .replace(/\s+-\s+[^-]*\b(deluxe|remaster(ed)?|edition|version|single|ep)\b[^-]*$/i, '')
  }
  return s.trim() || album
}

const lucene = (s: string) => s.replace(/[\\"]/g, '\\$&')

/**
 * Três falhas seguidas do Deezer (fora do ar, ou bloqueado na rede de quem usa) e as capas vão direto
 * ao MusicBrainz por um minuto; depois, a próxima busca vê se ele voltou.
 */
const PAUSE_MS = 60_000
let misses = 0
let pausedUntil = 0
const PAUSED = new Error('deezer paused')

function askDeezer(q: string): Promise<DzAlbum[]> {
  if (Date.now() < pausedUntil) return Promise.reject(PAUSED)
  return searchAlbums(q).then(
    (found) => {
      misses = 0
      return found
    },
    (e: unknown) => {
      if (++misses >= 3) pausedUntil = Date.now() + PAUSE_MS
      throw e
    },
  )
}

/** Álbum no Deezer: do mesmo artista e com o mesmo nome (ou o mesmo sem "Deluxe", "Remastered"…). */
async function deezerCover(artist: string, album: string, level: Level): Promise<string | null> {
  if (Date.now() < pausedUntil) throw PAUSED
  const title = cleanAlbum(album)
  const found = await deezer(() => askDeezer(`${artist} ${title}`), level)
  const mine = found.filter((a) => sameName(a.artist, artist))
  const hit = mine.find((a) => sameName(a.title, album)) ?? mine.find((a) => sameName(cleanAlbum(a.title), title))
  return hit?.cover ?? null
}

/** Álbum no MusicBrainz: procura o "release group" e usa a capa do Cover Art Archive. */
async function musicbrainzCover(artist: string, album: string, level: Level): Promise<string | null> {
  const title = cleanAlbum(album)
  const query = `releasegroup:"${lucene(title)}" AND artist:"${lucene(artist)}"`
  const r = await musicbrainz(
    () =>
      getJson<{ 'release-groups'?: { id: string; score?: number; title: string; 'artist-credit'?: { name: string }[] }[] }>(
        'https://musicbrainz.org/ws/2/release-group/?' + new URLSearchParams({ query, fmt: 'json', limit: '5' }),
      ),
    level,
  )
  const groups = (r['release-groups'] ?? []).filter(
    (g) => (g.score ?? 0) >= 80 && (g['artist-credit'] ?? []).some((c) => sameName(c.name, artist)),
  )
  const g = groups.find((x) => sameName(x.title, title)) ?? groups.find((x) => (x.score ?? 0) >= 95)
  return g ? `https://coverartarchive.org/release-group/${g.id}/front-250` : null
}

/** A capa do MusicBrainz, guardada à parte: também serve de reserva quando a do Deezer não abre. */
function mbCover(ref: AlbumRef, level: Level): Promise<string | null> {
  const key = `mb:${keyOf(ref)}`
  const hit = cached(key)
  if (hit) return Promise.resolve(hit.url)
  return musicbrainzCover(ref.artist, ref.album, level).then((url) => {
    store(key, url)
    return url
  })
}

/** Capa de álbum: o Deezer responde rápido; o MusicBrainz (um pedido por segundo) fica para o que ele não achar. */
async function findCover(ref: AlbumRef, level: Level): Promise<string | null> {
  let failure: unknown = null
  try {
    const url = await deezerCover(ref.artist, ref.album, level)
    if (url) return url
  } catch (e) {
    if (e === SKIPPED) throw e
    failure = e
  }
  // A capa guardada de antes já veio do MusicBrainz. Sem resposta do Deezer, ela fica e ele é tentado de novo da próxima vez.
  const old = cache[keyOf(ref)]?.url
  if (old && failure) throw failure
  const url = old ?? (await mbCover(ref, level))
  // Sem resposta do Deezer, "não achei" não fica guardado: tenta de novo da próxima vez.
  if (!url && failure) throw failure
  return url
}

function keyOf(ref: ImageRef) {
  return ref.kind === 'album' ? `album:${ref.artist}\u0000${ref.album}` : `${ref.kind}:${ref.name}`
}

function cached(key: string): Entry | undefined {
  const e = cache[key]
  if (!e) return undefined
  if (key.startsWith('album:') && !e.v) return undefined
  if (e.url) return e
  return Date.now() - e.at < RETRY_MS ? e : undefined
}

/** Quantas partes montadas da página querem cada imagem, e quantas delas estão na tela. */
const mounted = new Map<string, number>()
const shown = new Map<string, number>()

function bump(map: Map<string, number>, keys: string[], by: number) {
  for (const k of keys) {
    const n = (map.get(k) ?? 0) + by
    if (n > 0) map.set(k, n)
    else map.delete(k)
  }
}

const levelOf = (key: string) => (shown.has(key) ? 2 : mounted.has(key) ? 1 : 0)

function lookup(ref: ImageRef): Promise<string | null> {
  const key = keyOf(ref)
  const hit = cached(key)
  if (hit) return Promise.resolve(hit.url)
  let p = inflight.get(key)
  if (!p) {
    failed.delete(key)
    const level = () => levelOf(key)
    const job = ref.kind === 'album' ? findCover(ref, level) : findPhoto(ref.name, ref.kind === 'podcast', level)
    p = tracked(
      job.then(
        (url) => {
          store(key, url)
          inflight.delete(key)
          return url
        },
        (err: unknown) => {
          inflight.delete(key)
          // Saiu da fila porque sumiu da página: nada fica guardado. Se voltou a aparecer nesse meio-tempo, busca de novo.
          if (err === SKIPPED) return levelOf(key) > 0 ? lookup(ref) : null
          // Falha de rede não fica guardada: tenta de novo na próxima vez que a imagem aparecer.
          failed.add(key)
          for (const l of listeners) l()
          return null
        },
      ),
    )
    inflight.set(key, p)
  }
  return p
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

/** Pedidos conhecidos por chave, para os efeitos dependerem só das chaves (texto). */
const refs = new Map<string, ImageRef>()

function remember(ref: ImageRef | null | undefined): string {
  if (!ref) return ''
  const key = keyOf(ref)
  refs.set(key, ref)
  if (ref.kind !== 'album' && ref.fallback) refs.set(keyOf(ref.fallback), ref.fallback)
  return key
}

/** As buscas que uma lista de chaves pode fazer: a imagem e a capa reserva. */
function lookupKeys(keys: string): string[] {
  const out: string[] = []
  for (const k of keys.split(SEP)) {
    const ref = refs.get(k)
    if (!ref) continue
    out.push(k)
    if (ref.kind !== 'album' && ref.fallback) out.push(keyOf(ref.fallback))
  }
  return out
}

const usable = (url: string | null | undefined) => (url && !broken.has(url) ? url : null)

/** O que já se sabe: a foto, ou a capa reserva se a foto não existe. */
function currentUrl(key: string): string | null {
  const ref = refs.get(key)
  if (!ref) return null
  const main = cache[key]
  if (main?.url) return usable(main.url)
  if (main && ref.kind !== 'album' && ref.fallback) return usable(cache[keyOf(ref.fallback)]?.url)
  return null
}

function ensure(key: string) {
  const ref = refs.get(key)
  if (!ref) return
  lookup(ref).then((u) => {
    // Sem foto (ou sem rede): tenta a capa reserva. Se a busca só saiu da fila, não.
    if (!u && ref.kind !== 'album' && ref.fallback && (cached(key) || failed.has(key))) lookup(ref.fallback)
  })
}

const SEP = '\u0001'

/**
 * Endereços das imagens (null enquanto busca ou quando não existe); busca sozinho na primeira vez.
 * `visible` diz se elas estão na tela agora: as da tela passam na frente na fila.
 */
export function useImages(list: (ImageRef | null | undefined)[], visible = true): (string | null)[] {
  const keys = list.map(remember).join(SEP)
  const urls = useSyncExternalStore(subscribe, () =>
    keys
      .split(SEP)
      .map((k) => currentUrl(k) ?? '')
      .join(SEP),
  )
  useEffect(() => {
    const ks = lookupKeys(keys)
    bump(mounted, ks, 1)
    for (const k of keys.split(SEP)) if (k) ensure(k)
    for (const k of ks) heal(k)
    return () => bump(mounted, ks, -1)
  }, [keys])
  useEffect(() => {
    if (!visible) return
    const ks = lookupKeys(keys)
    bump(shown, ks, 1)
    return () => bump(shown, ks, -1)
  }, [keys, visible])
  return urls.split(SEP).map((u) => u || null)
}

export const useImage = (ref: ImageRef | null | undefined, visible = true) => useImages([ref], visible)[0]

/** Ainda buscando: não se sabe se tem foto (nem a capa reserva), ou a capa que não abriu está sendo procurada na outra fonte. */
function isWaiting(key: string): boolean {
  const ref = refs.get(key)
  if (!ref) return false
  const main = cached(key)
  if (!main) return !failed.has(key)
  if (main.url) return swapping.has(key)
  if (ref.kind === 'album' || !ref.fallback) return false
  const fk = keyOf(ref.fallback)
  return cached(fk) ? swapping.has(fk) : !failed.has(fk)
}

/** O endereço da imagem e se ela ainda está sendo buscada (para mostrar o cinza de "carregando"). */
export function useImageState(ref: ImageRef | null | undefined, visible = true): { url: string | null; waiting: boolean } {
  const url = useImage(ref, visible)
  const key = ref ? keyOf(ref) : ''
  const waiting = useSyncExternalStore(subscribe, () => (key ? isWaiting(key) : false))
  return { url, waiting }
}

const isDeezer = (url: string) => /^https:\/\/[^/]+\.dzcdn\.net\//.test(url)

/**
 * Uma imagem que o navegador não conseguiu abrir sai de cena. As capas de álbum com ela vão atrás da
 * mesma capa na outra fonte (do Deezer no MusicBrainz, ou o contrário), que fica no lugar dali em diante.
 */
export function imageFailed(url: string) {
  if (broken.has(url)) return
  broken.add(url)
  for (const k of mounted.keys()) heal(k)
  for (const l of listeners) l()
}

/** Se a capa guardada do álbum não abre, procura a da outra fonte (uma vez por visita). */
function heal(key: string) {
  const ref = refs.get(key)
  const url = cache[key]?.url
  if (ref?.kind !== 'album' || !url || !broken.has(url) || swapped.has(key)) return
  swapped.add(key)
  swapping.add(key)
  // Fica na fila mesmo se a capa sair da página: a imagem que não abriu não volta a pedir.
  const level = () => levelOf(key) || 1
  const other = isDeezer(url) ? mbCover(ref, level) : deezerCover(ref.artist, ref.album, level)
  tracked(other)
    .then(
      (u) => {
        if (u && !broken.has(u) && cache[key]?.url === url) store(key, u)
      },
      () => {},
    )
    .finally(() => {
      swapping.delete(key)
      for (const l of listeners) l()
    })
}

// A rede voltou: o que não abriu, ou não foi buscado por falta de rede, pode vir agora (e o Deezer volta a valer).
if (typeof window !== 'undefined')
  window.addEventListener('online', () => {
    broken.clear()
    swapped.clear()
    misses = 0
    pausedUntil = 0
    for (const k of mounted.keys()) if (failed.has(k)) ensure(k)
    for (const l of listeners) l()
  })

const dataUrls = new Map<string, Promise<string | null>>()
const dataCache = new Map<string, string>()

/** Baixa a imagem como data URL (ou a reserva, se não der). */
function ensureData(url: string, fallback?: string): Promise<string | null> {
  let p = dataUrls.get(url)
  if (!p) {
    p = fetch(url)
      .then((r) => (r.ok ? r.blob() : null))
      .then(
        (b) =>
          b &&
          new Promise<string>((resolve, reject) => {
            const fr = new FileReader()
            fr.onload = () => resolve(fr.result as string)
            fr.onerror = () => reject(fr.error)
            fr.readAsDataURL(b)
          }),
      )
      .catch(() => null)
      .then((d) => {
        if (!d) return fallback ? ensureData(fallback) : null
        dataCache.set(url, d)
        for (const l of listeners) l()
        return d
      })
    dataUrls.set(url, tracked(p))
  }
  return p
}

/**
 * A mesma imagem em tamanho maior, para os stories (a tela de 1080 px de largura).
 * Se o tamanho maior não existir (foto original pequena), fica a de sempre.
 */
function largeUrl(url: string) {
  if (/^https:\/\/upload\.wikimedia\.org\/.+\/thumb\//.test(url)) return url.replace(/\/\d+px-([^/]+)$/, '/960px-$1')
  if (url.startsWith('https://coverartarchive.org/')) return url.replace(/\/front-250$/, '/front-500')
  if (isDeezer(url)) return url.replace(/\/250x250-/, '/1000x1000-')
  return url
}

/** Capas do Deezer que não deu para baixar: a do MusicBrainz entra no lugar, só nos cartões. */
const stand = new Map<string, string>()
const standTried = new Set<string>()

/** O álbum de uma capa já guardada. */
function albumOf(url: string): AlbumRef | null {
  for (const k in cache) {
    if (cache[k].url !== url || !k.startsWith('album:')) continue
    const [artist, album] = k.slice(6).split('\u0000')
    return { kind: 'album', artist, album }
  }
  return null
}

function standIn(url: string) {
  if (standTried.has(url)) return
  standTried.add(url)
  const ref = albumOf(url)
  if (!ref) return
  tracked(mbCover(ref, () => 2)).then(
    (u) => {
      if (!u) return
      stand.set(url, u)
      for (const l of listeners) l()
    },
    () => standTried.delete(url),
  )
}

/**
 * As mesmas imagens como data URL, para entrar nos cartões do Wrapped (o SVG vira PNG e não
 * pode carregar imagens de fora). Se o site da imagem não deixar, fica sem.
 */
export function useImagesData(list: (ImageRef | null | undefined)[], large = false): (string | null)[] {
  const urls = useImages(list)
  const joined = useSyncExternalStore(subscribe, () => urls.map((u) => (u && stand.get(u)) || u || '').join(SEP))
  const dataOf = (u: string) => (u && ((large && dataCache.get(largeUrl(u))) || dataCache.get(u))) || null
  // Só um "chegou ou não" por imagem: o cartão redesenha quando uma chega, sem comparar data URLs enormes.
  useSyncExternalStore(subscribe, () =>
    joined
      .split(SEP)
      .map((u) => (dataOf(u) ? 1 : 0))
      .join(''),
  )
  useEffect(() => {
    for (const u of joined.split(SEP)) {
      if (!u) continue
      const big = large ? largeUrl(u) : u
      ensureData(big, big === u ? undefined : u).then((d) => {
        if (!d && isDeezer(u)) standIn(u)
      })
    }
  }, [joined, large])
  return joined.split(SEP).map(dataOf)
}
