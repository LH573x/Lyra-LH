import { useEffect, useSyncExternalStore } from 'react'

/*
 * Fotos de artistas e podcasts vêm do Wikidata (imagem do Wikimedia Commons) e capas de
 * álbuns vêm do MusicBrainz (Cover Art Archive). Nenhum dos dois pede login.
 * Só os nomes que aparecem na tela são buscados, e o resultado fica guardado neste navegador.
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

function store(key: string, url: string | null) {
  cache[key] = { url, at: Date.now() }
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
// O MusicBrainz pede no máximo um pedido por segundo.
const musicbrainz = limiter(1, 1100)

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as T
}

/** Compara nomes sem acento, caixa, "The" no começo e pontuação. */
export function sameName(a: string, b: string) {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/^the\s+/, '')
      .replace(/[^a-z0-9]+/g, '')
  return norm(a) === norm(b)
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

/** Álbum: procura o "release group" no MusicBrainz e usa a capa do Cover Art Archive. */
async function findCover(artist: string, album: string, level: Level): Promise<string | null> {
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

function keyOf(ref: ImageRef) {
  return ref.kind === 'album' ? `album:${ref.artist}\u0000${ref.album}` : `${ref.kind}:${ref.name}`
}

function cached(key: string): Entry | undefined {
  const e = cache[key]
  if (e && (e.url || Date.now() - e.at < RETRY_MS)) return e
  return undefined
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
    const job = ref.kind === 'album' ? findCover(ref.artist, ref.album, level) : findPhoto(ref.name, ref.kind === 'podcast', level)
    p = job.then(
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

/** O que já se sabe: a foto, ou a capa reserva se a foto não existe. */
function currentUrl(key: string): string | null {
  const ref = refs.get(key)
  if (!ref) return null
  const main = cache[key]
  if (main?.url) return main.url
  if (main && ref.kind !== 'album' && ref.fallback) return cache[keyOf(ref.fallback)]?.url ?? null
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

/** Ainda buscando: não se sabe se tem foto (nem a capa reserva). */
function isWaiting(key: string): boolean {
  const ref = refs.get(key)
  if (!ref) return false
  const main = cached(key)
  if (!main) return !failed.has(key)
  if (main.url || ref.kind === 'album' || !ref.fallback) return false
  const fk = keyOf(ref.fallback)
  return !cached(fk) && !failed.has(fk)
}

/** O endereço da imagem e se ela ainda está sendo buscada (para mostrar o cinza de "carregando"). */
export function useImageState(ref: ImageRef | null | undefined, visible = true): { url: string | null; waiting: boolean } {
  const url = useImage(ref, visible)
  const key = ref ? keyOf(ref) : ''
  const waiting = useSyncExternalStore(subscribe, () => (key ? isWaiting(key) : false))
  return { url, waiting }
}

const dataUrls = new Map<string, Promise<string | null>>()
const dataCache = new Map<string, string>()

function ensureData(url: string, fallback?: string) {
  if (dataUrls.has(url)) return
  dataUrls.set(
    url,
    fetch(url)
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
        if (d) {
          dataCache.set(url, d)
          for (const l of listeners) l()
        } else if (fallback) ensureData(fallback)
        return d
      }),
  )
}

/**
 * A mesma imagem em tamanho maior, para os stories (a tela de 1080 px de largura).
 * Se o tamanho maior não existir (foto original pequena), fica a de sempre.
 */
function largeUrl(url: string) {
  if (/^https:\/\/upload\.wikimedia\.org\/.+\/thumb\//.test(url)) return url.replace(/\/\d+px-([^/]+)$/, '/960px-$1')
  if (url.startsWith('https://coverartarchive.org/')) return url.replace(/\/front-250$/, '/front-500')
  return url
}

/**
 * As mesmas imagens como data URL, para entrar nos cartões do Wrapped (o SVG vira PNG e não
 * pode carregar imagens de fora). Se o site da imagem não deixar, fica sem.
 */
export function useImagesData(list: (ImageRef | null | undefined)[], large = false): (string | null)[] {
  const urls = useImages(list)
  const joined = urls.map((u) => u ?? '').join(SEP)
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
      ensureData(big, big === u ? undefined : u)
    }
  }, [joined, large])
  return joined.split(SEP).map(dataOf)
}
