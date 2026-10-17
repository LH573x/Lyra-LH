import type { Dataset } from './types'
import { memo } from './memo'
import { norm } from './search'
import { creatorOf } from './stats'
import { lowerBound } from './calendar'

/*
 * O que você já ouviu (artistas e músicas, em forma comparável) e o seu ranking de artistas:
 * a aba Explorar deixa de fora tudo o que já está no histórico. Sem React, para o worker
 * também poder fazer estas contas.
 */

/**
 * Nome de música comparável, sem a versão: tudo entre parênteses ou colchetes e tudo depois de " - " sai.
 * "Enemy (with JID) - from the series Arcane League of Legends", "Enemy (Live)" e "Enemy" viram "enemy".
 */
export const titleKey = (s: string) => norm(s.replace(/\s*[([][^)\]]*[)\]]/g, ' ').replace(/\s+[-–—]\s.*$/, '')) || norm(s)

// "(feat. JID)", "(with JID)", "(com Anitta)": quem aparece de convidado também conta como artista que você já ouviu.
const GUESTS = /[([](?:feat\.?|ft\.?|featuring|with|com|con)\s+([^)\]]+)[)\]]/gi
const SPLIT = /\s*(?:,|&|\+|\band\b|\bx\b|\be\b|\by\b)\s*/i
/** Nome de artista comparável, sem espaços: "J.I.D" e "JID", "AC/DC" e "ACDC" batem. */
export const artistKey = (s: string) => norm(s).replace(/ /g, '')

export interface Known {
  artists: Set<string>
  /** Artista → músicas ouvidas dele. */
  songs: Map<string, Set<string>>
}

export const known = (d: Dataset): Known => memo(d, 'known', () => findKnown(d))

function findKnown(d: Dataset): Known {
  const k: Known = { artists: new Set(), songs: new Map() }
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
  return k
}

/** Artistas de música do mais ao menos ouvido, a partir de `since` (em ms). */
function ranking(d: Dataset, since: number): number[] {
  const total = new Float64Array(d.creators.length)
  const { start, ms, item } = d.plays
  const creator = creatorOf(d)
  const music = Uint8Array.from(d.items, (it) => (it.kind === 'music' ? 1 : 0))
  // As reproduções estão em ordem: começa direto na primeira depois de `since`.
  for (let i = lowerBound(start, since); i < item.length; i++) if (music[item[i]]) total[creator[item[i]]] += ms[i]
  return [...total.keys()].filter((c) => total[c] > 0).sort((a, b) => total[b] - total[a])
}

/** Seus artistas de música mais ouvidos (a partir de `since`, em ms). O de sempre fica guardado: a roleta pede de novo a cada giro. */
export function topArtists(d: Dataset, n: number, since = -Infinity): { id: number; name: string }[] {
  const ids = since === -Infinity ? memo(d, 'allTime', () => ranking(d, since)) : ranking(d, since)
  return ids.slice(0, n).map((id) => ({ id, name: d.creators[id] }))
}
