import type { Dataset } from './types'
import type { ImageRef } from './images'
import { memo } from './memo'

/** Para cada artista, a música que você mais ouviu dele (a capa dela é a reserva quando não há foto). */
export const bestItems = (d: Dataset): Map<number, number> => memo(d, 'bestItems', () => findBestItems(d))

function findBestItems(d: Dataset): Map<number, number> {
  const msByItem = new Float64Array(d.items.length)
  const { ms, item } = d.plays
  for (let i = 0; i < item.length; i++) msByItem[item[i]] += ms[i]
  const m = new Map<number, number>()
  for (let it = 0; it < d.items.length; it++) {
    const c = d.items[it].creator
    const cur = m.get(c)
    if (cur === undefined || msByItem[it] > msByItem[cur]) m.set(c, it)
  }
  return m
}

/** Imagem de um artista ou podcast (pelo índice do criador). */
export function artistRef(d: Dataset, creator: number): ImageRef {
  const it = bestItems(d).get(creator)
  const item = it === undefined ? undefined : d.items[it]
  const name = d.creators[creator]
  if (item?.kind === 'podcast') return { kind: 'podcast', name }
  return {
    kind: 'artist',
    name,
    fallback: item?.album ? { kind: 'album', artist: name, album: item.album } : undefined,
  }
}

/** Imagem de uma música (capa do álbum) ou episódio (imagem do podcast). */
export function itemRef(d: Dataset, id: number): ImageRef | undefined {
  const it = d.items[id]
  const artist = d.creators[it.creator]
  if (it.kind === 'podcast') return { kind: 'podcast', name: artist }
  return it.album ? { kind: 'album', artist, album: it.album } : undefined
}
