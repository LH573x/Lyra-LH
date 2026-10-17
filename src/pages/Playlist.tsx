import { useMemo } from 'react'
import type { Dataset, SavedTrack } from '../data/types'
import { playlistDetail } from '../data/account'
import { artistRef, itemRef } from '../data/refs'
import { Chart, type ChartOption } from '../ui/Chart'
import { chartColors, type ThemeName } from '../ui/theme'
import { cleanTitle, hours, monthLabel, num, pct, shortDate } from '../ui/format'
import { BarList } from '../ui/parts'
import { Section, StatStrip } from '../ui/blocks'
import { Art } from '../ui/Thumb'
import { PlaylistCover } from '../ui/PlaylistCover'
import { PlayButton } from '../ui/player'
import { isSpotifyUri, trackOf } from '../ui/playerStore'
import { artistHref, songHref } from '../ui/links'
import { PHONE, useMedia } from '../ui/useMedia'
import { t } from '../i18n'

interface Props {
  data: Dataset
  index: number
  theme: ThemeName
}

const rankLabel = (n: number) => t(`nº ${num(n)}`, `#${num(n)}`, `n.º ${num(n)}`)
const songs = (n: number) => `${num(n)} ${n === 1 ? t('música', 'song', 'canción') : t('músicas', 'songs', 'canciones')}`
const plays = (n: number) => t('reproduções', n === 1 ? 'play' : 'plays', n === 1 ? 'reproducción' : 'reproducciones')
const savedTrack = (s: SavedTrack) => (isSpotifyUri(s.uri) ? { uri: s.uri, name: s.name, artist: s.artist } : null)

function back() {
  if (history.length > 1) history.back()
  else location.hash = 'curiosidades'
}

/** Página de uma playlist: quanto você ouve, quando cada música entrou, as mais tocadas e as esquecidas. */
export function Playlist({ data, index, theme }: Props) {
  const p = useMemo(() => playlistDetail(data, index), [data, index])
  // Linhas cheias: duas de 4 no computador, três de 3 no celular.
  const never = useMedia(PHONE) ? 9 : 8
  const c = chartColors(theme, 'coral')

  const option = useMemo<ChartOption | null>(() => {
    if (!p || p.monthly.length === 0) return null
    const many = p.monthly.length > 24
    return {
      grid: { left: 8, right: 8, top: 32, bottom: 8, containLabel: true },
      legend: { top: 0, left: 0, textStyle: { color: c.muted }, itemWidth: 14, itemHeight: 8 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: c.surface,
        borderColor: c.axis,
        textStyle: { color: c.ink },
        formatter: (s: { name: string; seriesIndex: number; value: number }[]) =>
          `${monthLabel(s[0].name)}<br/>` +
          s
            .map((x) =>
              x.seriesIndex === 0 ? `<b>${hours(x.value * 3.6e6)}</b>` : x.value > 0 ? `+${songs(x.value)}` : '',
            )
            .filter(Boolean)
            .join('<br/>'),
      },
      xAxis: {
        type: 'category',
        data: p.monthly.map((m) => m.month),
        axisLine: { lineStyle: { color: c.axis } },
        axisTick: { show: false },
        axisLabel: {
          color: c.muted,
          hideOverlap: true,
          interval: many ? (_: number, v: string) => v.endsWith('-01') : 'auto',
          formatter: (v: string) => (many ? v.slice(0, 4) : monthLabel(v)),
        },
      },
      yAxis: [
        { type: 'value', splitLine: { lineStyle: { color: c.grid } }, axisLabel: { color: c.muted, formatter: (v: number) => `${v} h` } },
        { type: 'value', minInterval: 1, splitLine: { show: false }, axisLabel: { color: c.muted } },
      ],
      series: [
        {
          name: t('Horas ouvindo', 'Hours listened', 'Horas escuchando'),
          type: 'line',
          data: p.monthly.map((m) => Math.round(m.hours * 10) / 10),
          showSymbol: false,
          smooth: 0.2,
          lineStyle: { color: c.accent, width: 2 },
          itemStyle: { color: c.accent },
          areaStyle: { color: c.accent, opacity: 0.15 },
        },
        {
          name: t('Músicas adicionadas', 'Songs added', 'Canciones añadidas'),
          type: 'bar',
          yAxisIndex: 1,
          data: p.monthly.map((m) => m.added),
          itemStyle: { color: c.muted, opacity: 0.5, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 16,
        },
      ],
    }
  }, [p, c])

  const playlist = data.account?.playlists[index]
  if (!p || !playlist) {
    return (
      <main className="page">
        <p className="empty">
          {t('Não encontrei essa playlist nos seus dados.', "This playlist isn't in your data.", 'Esta playlist no está en tus datos.')}{' '}
          <a href="#curiosidades">{t('Voltar para Curiosidades', 'Back to Fun facts', 'Volver a Curiosidades')}</a>
        </p>
      </main>
    )
  }

  const maxSong = p.topSongs[0]?.ms || 1
  const maxArtist = p.topArtists[0]?.ms || 1
  const top = p.topSongs[0]

  return (
    <main className="page">
      <button className="ghost back" onClick={back}>
        ← {t('Voltar', 'Back', 'Volver')}
      </button>
      <section className="hero artist-hero">
        <PlaylistCover playlist={playlist} className="pl-hero" />
        <div>
          <p className="eyebrow">Playlist · {rankLabel(p.rank)}</p>
          <h1 className="artist-name">{p.name}</h1>
          <p className="sub">
            <span className="accent">{hours(p.ms)}</span> · {num(p.plays)} {plays(p.plays)} · {songs(p.songs)}
          </p>
        </div>
      </section>

      <StatStrip
        items={[
          {
            label: t('Músicas que você ouviu', 'Songs you played', 'Canciones que escuchaste'),
            value: pct(p.songs ? p.played / p.songs : 0),
            hint: t(`${num(p.played)} de ${num(p.songs)}`, `${num(p.played)} of ${num(p.songs)}`, `${num(p.played)} de ${num(p.songs)}`),
          },
          ...(p.firstAdded !== null
            ? [{ label: t('Primeira música', 'First song added', 'Primera canción'), value: shortDate(p.firstAdded) }]
            : []),
          ...(p.lastAdded !== null
            ? [{ label: t('Última adicionada', 'Last song added', 'Última añadida'), value: shortDate(p.lastAdded) }]
            : []),
          ...(top
            ? [{ label: t('Mais tocada', 'Most played', 'Más escuchada'), value: cleanTitle(data.items[top.id].name), hint: hours(top.ms) }]
            : []),
        ]}
      />

      {option && (
        <Section
          title={t('Quando você ouviu', 'When you listened', 'Cuándo la escuchaste')}
          note={t(
            'Conta cada música só depois do dia em que ela entrou na playlist',
            'Each song only counts from the day it was added',
            'Cada canción cuenta solo desde el día en que entró en la playlist',
          )}
        >
          <div className="card">
            <Chart option={option} height={260} label={t(`Horas por mês ouvindo ${p.name}`, `Hours a month on ${p.name}`, `Horas al mes con ${p.name}`)} />
          </div>
        </Section>
      )}

      {p.topSongs.length > 0 && (
        <Section title={t('Músicas mais ouvidas', 'Top songs', 'Canciones más escuchadas')}>
          <BarList
            rows={p.topSongs.map((s) => ({
              key: s.id,
              name: cleanTitle(data.items[s.id].name),
              sub: data.creators[data.items[s.id].creator],
              image: itemRef(data, s.id),
              href: songHref(s.id),
              track: trackOf(data, s.id),
              value: hours(s.ms),
              share: s.ms / maxSong,
              title: `${data.items[s.id].name}: ${hours(s.ms)}, ${num(s.plays)} ${plays(s.plays)}`,
            }))}
          />
        </Section>
      )}

      <Section title={t('Artistas da playlist', 'Artists in this playlist', 'Artistas de la playlist')}>
        <BarList
          rows={p.topArtists.map((a) => ({
            key: a.name,
            name: a.name,
            sub: songs(a.songs),
            image: a.creator !== null ? artistRef(data, a.creator) : { kind: 'artist', name: a.name },
            href: a.creator !== null ? artistHref(a.creator) : undefined,
            value: hours(a.ms),
            share: a.ms / maxArtist,
          }))}
        />
      </Section>

      {p.neverCount > 0 && (
        <Section
          title={t('Esquecidas na playlist', 'Forgotten in this playlist', 'Olvidadas en la playlist')}
          note={t(
            `${songs(p.neverCount)} que nunca tocaram de verdade`,
            `${songs(p.neverCount)} never really played`,
            `${songs(p.neverCount)} que nunca sonaron de verdad`,
          )}
        >
          <ol className="wall faded">
            {p.never.slice(0, never).map((s) => (
              <li key={s.uri ?? `${s.artist}|${s.name}`} title={`${s.name} · ${s.artist}`}>
                <div className="wall-art">
                  <Art
                    image={s.album ? { kind: 'album', artist: s.artist, album: s.album } : { kind: 'artist', name: s.artist }}
                    label={s.name}
                    round={false}
                  />
                  <PlayButton track={savedTrack(s)} className="play-over" />
                </div>
                <span className="wall-name">{cleanTitle(s.name)}</span>
                <span className="wall-value">{s.artist}</span>
              </li>
            ))}
          </ol>
        </Section>
      )}
    </main>
  )
}
