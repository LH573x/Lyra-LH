import { DATASET_VERSION, FLAG_PODCAST, FLAG_SHUFFLE, FLAG_SKIPPED, type Dataset, type Kind } from './types'
import { mergeSameSongs } from './merge'

/** Formato do "Histórico de streaming estendido" (Streaming_History_Audio_*.json). */
interface ExtendedRow {
  ts: string
  ms_played: number
  platform?: string | null
  master_metadata_track_name?: string | null
  master_metadata_album_artist_name?: string | null
  master_metadata_album_album_name?: string | null
  spotify_track_uri?: string | null
  episode_name?: string | null
  episode_show_name?: string | null
  spotify_episode_uri?: string | null
  shuffle?: boolean | null
  skipped?: boolean | null
  reason_end?: string | null
}

/** Formato do histórico básico (StreamingHistory_music_*.json / StreamingHistory_podcast_*.json). */
interface BasicRow {
  endTime: string
  msPlayed: number
  artistName?: string
  trackName?: string
  podcastName?: string
  episodeName?: string
}

export interface SourceFile {
  name: string
  rows: unknown[]
}

/** Arquivos do export que interessam; vídeo, dados de conta etc. são ignorados. */
export function isHistoryFile(path: string): boolean {
  const base = path.split('/').pop() ?? path
  return /^Streaming_History_Audio_.*\.json$/i.test(base) || /^StreamingHistory.*\.json$/i.test(base)
}

export function platformGroup(raw: string | null | undefined): string {
  const p = (raw ?? '').toLowerCase()
  if (!p) return 'Desconhecido'
  if (p.includes('android') || p.includes('ios') || p.includes('iphone')) return 'Celular'
  if (/windows|os x|osx|macos|linux|desktop/.test(p)) return 'Computador'
  if (p.includes('web')) return 'Navegador'
  if (/partner|cast|tv|sonos|alexa|echo|car|playstation|xbox/.test(p)) return 'TV, caixa de som e outros'
  return 'Outros'
}

export function parseFiles(files: SourceFile[]): Dataset {
  const items: Dataset['items'] = []
  const itemIndex = new Map<string, number>()
  const creators: string[] = []
  const creatorIndex = new Map<string, number>()
  const platforms: string[] = []
  const platformIndex = new Map<string, number>()
  const seen = new Set<string>()

  const start: number[] = []
  const ms: number[] = []
  const item: number[] = []
  const flags: number[] = []
  const platform: number[] = []
  let sawExtended = false

  const creatorId = (name: string) => {
    let id = creatorIndex.get(name)
    if (id === undefined) {
      id = creators.length
      creators.push(name)
      creatorIndex.set(name, id)
    }
    return id
  }
  const itemId = (key: string, name: string, creator: string, album: string, kind: Kind, uri?: string | null) => {
    let id = itemIndex.get(key)
    if (id === undefined) {
      id = items.length
      items.push(uri ? { name, creator: creatorId(creator), album, kind, uri } : { name, creator: creatorId(creator), album, kind })
      itemIndex.set(key, id)
    }
    return id
  }
  const platformId = (raw: string | null | undefined) => {
    const g = platformGroup(raw)
    let id = platformIndex.get(g)
    if (id === undefined) {
      id = platforms.length
      platforms.push(g)
      platformIndex.set(g, id)
    }
    return id
  }
  const push = (t: number, played: number, it: number, f: number, pl: number) => {
    // Linha com data quebrada: sem horário não dá para pôr em ordem nem em nenhum dia.
    if (!Number.isFinite(t)) return
    // O mesmo arquivo enviado duas vezes não deve contar em dobro.
    const key = `${t}|${it}|${played}`
    if (seen.has(key)) return
    seen.add(key)
    start.push(t)
    ms.push(played)
    item.push(it)
    flags.push(f)
    platform.push(pl)
  }

  // O histórico básico (último ano) repete o que o estendido já tem: dele só entra o que vem depois.
  let extendedEnd = -Infinity
  for (const file of files)
    for (const raw of file.rows)
      if (raw && typeof raw === 'object' && 'ts' in raw) {
        const end = Date.parse((raw as ExtendedRow).ts)
        if (end > extendedEnd) extendedEnd = end
      }

  for (const file of files) {
    for (const raw of file.rows) {
      if (!raw || typeof raw !== 'object') continue
      if ('ts' in raw) {
        sawExtended = true
        const r = raw as ExtendedRow
        const played = r.ms_played ?? 0
        if (played <= 0) continue
        let it: number
        let f = 0
        if (r.master_metadata_track_name) {
          const artist = r.master_metadata_album_artist_name ?? 'Desconhecido'
          it = itemId(
            r.spotify_track_uri ?? `${artist}|${r.master_metadata_track_name}`,
            r.master_metadata_track_name,
            artist,
            r.master_metadata_album_album_name ?? '',
            'music',
            r.spotify_track_uri,
          )
        } else if (r.episode_name) {
          const show = r.episode_show_name ?? 'Podcast'
          it = itemId(r.spotify_episode_uri ?? `${show}|${r.episode_name}`, r.episode_name, show, show, 'podcast', r.spotify_episode_uri)
          f |= FLAG_PODCAST
        } else {
          continue // audiobooks e reproduções sem metadados
        }
        // O campo `skipped` só existe a partir de 2022; "fwdbtn" (apertou próxima) existe desde sempre.
        if (r.skipped || r.reason_end === 'fwdbtn') f |= FLAG_SKIPPED
        if (r.shuffle) f |= FLAG_SHUFFLE
        // ts é o horário em que a reprodução TERMINOU (UTC).
        push(Date.parse(r.ts) - played, played, it, f, platformId(r.platform))
      } else if ('endTime' in raw) {
        const r = raw as BasicRow
        const played = r.msPlayed ?? 0
        if (played <= 0) continue
        // endTime vem como "2023-01-31 22:15" em UTC.
        const end = Date.parse(r.endTime.replace(' ', 'T') + ':00Z')
        if (end <= extendedEnd) continue
        let it: number
        let f = 0
        if (r.trackName) {
          const artist = r.artistName ?? 'Desconhecido'
          it = itemId(`${artist}|${r.trackName}`, r.trackName, artist, '', 'music')
        } else if (r.episodeName) {
          const show = r.podcastName ?? 'Podcast'
          it = itemId(`${show}|${r.episodeName}`, r.episodeName, show, show, 'podcast')
          f |= FLAG_PODCAST
        } else {
          continue
        }
        push(end - played, played, it, f, platformId(null))
      }
    }
  }

  const order = start.map((_, i) => i).sort((a, b) => start[a] - start[b])
  const n = order.length
  const plays: Dataset['plays'] = {
    start: new Float64Array(n),
    ms: new Uint32Array(n),
    item: new Int32Array(n),
    flags: new Uint8Array(n),
    platform: new Uint8Array(n),
  }
  order.forEach((src, i) => {
    plays.start[i] = start[src]
    plays.ms[i] = ms[src]
    plays.item[i] = item[src]
    plays.flags[i] = flags[src]
    plays.platform[i] = platform[src]
  })

  return mergeSameSongs({
    version: DATASET_VERSION,
    format: sawExtended ? 'extended' : 'basic',
    items,
    creators,
    platforms,
    plays,
    importedAt: Date.now(),
  })
}
