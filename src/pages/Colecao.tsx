import { useMemo, useState } from 'react'
import type { Dataset, SavedTrack } from '../data/types'
import { likedForgotten, playlistRanking } from '../data/account'
import { itemRef } from '../data/refs'
import { Art } from '../ui/Thumb'
import { PlaylistCover } from '../ui/PlaylistCover'
import { PlayButton } from '../ui/player'
import { isSpotifyUri, trackOf } from '../ui/playerStore'
import { playlistHref, songHref } from '../ui/links'
import { cleanTitle, date, hours, monthLabel, num } from '../ui/format'
import { PHONE, useMedia } from '../ui/useMedia'
import { t } from '../i18n'

const FEW = 6

/** Ranking das suas playlists em capas grandes, 3 por linha. */
export function Playlists({ data }: { data: Dataset }) {
  const list = useMemo(() => playlistRanking(data), [data])
  const [all, setAll] = useState(false)
  const lists = data.account?.playlists
  if (!lists || list.length === 0) return null
  return (
    <>
      <ol className="pl-grid">
        {list.slice(0, all ? list.length : FEW).map((p) => (
          <li key={p.index}>
            <a href={playlistHref(p.index)} className="pl-tile">
              <span className="pl-art">
                <PlaylistCover playlist={lists[p.index]} />
                <span className="pl-rank">{p.rank}</span>
              </span>
              <span className="pl-name">{p.name}</span>
              <span className="pl-value">
                {hours(p.ms)} · {num(p.songs)} {p.songs === 1 ? t('música', 'song', 'canción') : t('músicas', 'songs', 'canciones')}
              </span>
            </a>
          </li>
        ))}
      </ol>
      {list.length > FEW && (
        <div className="more">
          <button className="ghost" onClick={() => setAll(!all)}>
            {all ? t('Ver menos', 'Show less', 'Ver menos') : t('Ver todas', 'Show all', 'Ver todas')}
          </button>
        </div>
      )}
    </>
  )
}

const pad = (n: number) => String(n).padStart(2, '0')
const monthOf = (ms: number) => {
  const d = new Date(ms)
  return monthLabel(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
}

const savedTrack = (s: SavedTrack) => (isSpotifyUri(s.uri) ? { uri: s.uri, name: s.name, artist: s.artist } : null)

/** Curtidas que você largou (e as que nunca tocou): linhas cheias, de 4 no computador e de 3 no celular. */
export function Curtidas({ data }: { data: Dataset }) {
  const phone = useMedia(PHONE)
  const f = useMemo(() => (phone ? likedForgotten(data, 9, 3) : likedForgotten(data, 8, 4)), [data, phone])
  if (!f || (f.abandoned.length === 0 && f.neverCount === 0)) return null
  return (
    <>
      {f.abandoned.length > 0 && (
        <ol className="wall faded">
          {f.abandoned.map((a) => {
            const name = cleanTitle(data.items[a.id].name)
            return (
              <li
                key={a.id}
                title={t(
                  `${name}: ${num(a.plays)} reproduções, a última em ${date(a.last)}`,
                  `${name}: ${num(a.plays)} plays, last on ${date(a.last)}`,
                  `${name}: ${num(a.plays)} reproducciones, la última el ${date(a.last)}`,
                )}
              >
                <div className="wall-art">
                  <Art image={itemRef(data, a.id)} label={name} round={false} />
                  <PlayButton track={trackOf(data, a.id)} className="play-over" />
                </div>
                <a className="wall-name" href={songHref(a.id)}>
                  {name}
                </a>
                <span className="faded-last">{monthOf(a.last)}</span>
              </li>
            )
          })}
        </ol>
      )}
      {f.neverCount > 0 && (
        <>
          <p className="sec-note liked-never">
            {data.format === 'basic'
              ? t(
                  `${num(f.neverCount)} das suas ${num(f.liked)} curtidas não tocaram nenhuma vez no último ano.`,
                  `${num(f.neverCount)} of your ${num(f.liked)} liked songs didn't play once in the last year.`,
                  `${num(f.neverCount)} de tus ${num(f.liked)} canciones favoritas no sonaron ni una vez en el último año.`,
                )
              : t(
                  `${num(f.neverCount)} das suas ${num(f.liked)} curtidas nunca tocaram de verdade.`,
                  `${num(f.neverCount)} of your ${num(f.liked)} liked songs never really got played.`,
                  `${num(f.neverCount)} de tus ${num(f.liked)} canciones favoritas nunca sonaron de verdad.`,
                )}
          </p>
          <ol className="wall faded">
            {f.never.map((s) => (
              <li key={s.uri ?? `${s.artist}|${s.name}`} title={`${s.name} · ${s.artist}`}>
                <div className="wall-art">
                  <Art image={s.album ? { kind: 'album', artist: s.artist, album: s.album } : { kind: 'artist', name: s.artist }} label={s.name} round={false} />
                  <PlayButton track={savedTrack(s)} className="play-over" />
                </div>
                <span className="wall-name">{cleanTitle(s.name)}</span>
                <span className="wall-value">{s.artist}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  )
}
