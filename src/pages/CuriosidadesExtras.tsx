import { useMemo, useState, type ReactNode } from 'react'
import type { Dataset } from '../data/types'
import type { Filter, KindFilter } from '../data/stats'
import { forgotten, records, yearProfile, type YearProfile } from '../data/curiosities'
import { artistRef, itemRef } from '../data/refs'
import { Art, Thumb } from '../ui/Thumb'
import { artistHref, songHref } from '../ui/links'
import { PlayButton } from '../ui/player'
import { trackOf } from '../ui/playerStore'
import { MicIcon, TimerIcon } from '../ui/icons'
import { LyraSky } from '../ui/LyraSky'
import { cleanTitle, clock, date, duration, hours, keyToMs, monthLabel, num, shortDate } from '../ui/format'
import { PHONE, useMedia } from '../ui/useMedia'
import { t } from '../i18n'

const pad = (n: number) => String(n).padStart(2, '0')
const monthOf = (ms: number) => {
  const d = new Date(ms)
  return monthLabel(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
}

/** Um recorde: imagem (ou ícone) na altura toda à esquerda, texto ao lado e o play no canto. */
function Rec({ media, label, big, text, play }: { media: ReactNode; label: string; big: ReactNode; text?: ReactNode; play?: ReactNode }) {
  return (
    <article className="rec">
      <div className="rec-media">{media}</div>
      <div className="rec-body">
        <p className="rec-label">{label}</p>
        <p className="rec-big">{big}</p>
        {text && <p className="rec-text">{text}</p>}
      </div>
      {play}
    </article>
  )
}

/** Recordes em cartões iguais, um embaixo do outro no celular. */
export function Recordes({ data, filter }: { data: Dataset; filter: Filter }) {
  const r = useMemo(() => records(data, filter), [data, filter])
  const song = (id: number) => ({ name: cleanTitle(data.items[id].name), artist: data.creators[data.items[id].creator] })
  const link = (id: number) => (
    <a href={songHref(id)}>
      <b>{song(id).name}</b>
    </a>
  )
  const cover = (id: number) => <Art image={itemRef(data, id) ?? { kind: 'artist', name: song(id).artist }} label={song(id).name} round={false} />
  const play = (id: number) => <PlayButton track={trackOf(data, id)} className="rec-play" />

  return (
    <div className="bento">
      {r.marathon && (
        <Rec
          media={
            <span className="rec-icon hot">
              <TimerIcon />
            </span>
          }
          label={t('Maior maratona', 'Longest marathon', 'Mayor maratón')}
          big={duration(r.marathon.end - r.marathon.start)}
          text={`${shortDate(r.marathon.start)} · ${clock(r.marathon.start)}–${clock(r.marathon.end)} · ${num(r.marathon.tracks)} ${t('faixas', 'tracks', 'pistas')}`}
        />
      )}
      {r.repeatDay && (
        <Rec
          media={cover(r.repeatDay.item)}
          label={t('Repetiu no mesmo dia', 'On repeat in one day', 'En bucle en un día')}
          big={`${num(r.repeatDay.count)} ${t('vezes', 'times', 'veces')}`}
          text={
            <>
              {link(r.repeatDay.item)} · {song(r.repeatDay.item).artist} · {shortDate(keyToMs(r.repeatDay.day))}
            </>
          }
          play={play(r.repeatDay.item)}
        />
      )}
      {r.lateNight && (
        <Rec
          media={<LyraSky className="rec-sky" />}
          label={t('Madrugada mais longa', 'Longest late night', 'Madrugada más larga')}
          big={hours(r.lateNight.ms)}
          text={shortDate(keyToMs(r.lateNight.day))}
        />
      )}
      {r.artistRun && (
        <Rec
          media={<Art image={artistRef(data, r.artistRun.creator)} label={data.creators[r.artistRun.creator]} round={false} />}
          label={t('Sem trocar de artista', 'One artist, non-stop', 'Sin cambiar de artista')}
          big={t(`${num(r.artistRun.count)} seguidas`, `${num(r.artistRun.count)} in a row`, `${num(r.artistRun.count)} seguidas`)}
          text={
            <>
              <a href={artistHref(r.artistRun.creator)}>{data.creators[r.artistRun.creator]}</a> · {shortDate(r.artistRun.start)}
            </>
          }
        />
      )}
      {r.loyal && (
        <Rec
          media={cover(r.loyal.item)}
          label={t('A mais fiel', 'Most loyal', 'La más fiel')}
          big={`${num(r.loyal.days)} ${t('dias', 'days', 'días')}`}
          text={
            <>
              {link(r.loyal.item)} · {song(r.loyal.item).artist}
            </>
          }
          play={play(r.loyal.item)}
        />
      )}
      {r.first && (
        <Rec
          media={cover(r.first.item)}
          label={
            filter.year
              ? t(`A primeira de ${filter.year}`, `First of ${filter.year}`, `La primera de ${filter.year}`)
              : t('Onde tudo começou', 'Where it all began', 'Donde empezó todo')
          }
          big={<a href={songHref(r.first.item)}>{song(r.first.item).name}</a>}
          text={`${song(r.first.item).artist} · ${shortDate(r.first.t)}, ${clock(r.first.t)}`}
          play={play(r.first.item)}
        />
      )}
      {r.variety && (
        <Rec
          media={
            <span className="rec-icon">
              <MicIcon />
            </span>
          }
          label={t('Dia mais variado', 'Most varied day', 'Día más variado')}
          big={`${num(r.variety.artists)} ${t('artistas', 'artists', 'artistas')}`}
          text={shortDate(keyToMs(r.variety.day))}
        />
      )}
    </div>
  )
}

/** Músicas muito ouvidas que não tocam há mais de um ano, com a capa desbotada. */
export function Esquecidas({ data, filter }: { data: Dataset; filter: Filter }) {
  // Linhas cheias: duas de 4 no computador, três de 3 no celular.
  const n = useMedia(PHONE) ? 9 : 8
  const list = useMemo(() => forgotten(data, filter, n), [data, filter, n])
  if (list.length === 0)
    return (
      <p className="empty-note">
        {t(
          'Nenhuma música esquecida nesse período: você continua ouvindo tudo o que mais ouviu.',
          'No forgotten songs here: you still play all your favourites.',
          'Sin canciones olvidadas: sigues escuchando tus favoritas.',
        )}
      </p>
    )
  return (
    <ol className="wall faded">
      {list.map((f) => {
        const it = data.items[f.id]
        const name = cleanTitle(it.name)
        return (
          <li
            key={f.id}
            title={t(
              `${name}: ${num(f.plays)} reproduções, a última em ${date(f.last)}`,
              `${name}: ${num(f.plays)} plays, last on ${date(f.last)}`,
              `${name}: ${num(f.plays)} reproducciones, la última el ${date(f.last)}`,
            )}
          >
            <div className="wall-art">
              <Art image={itemRef(data, f.id)} label={name} round={false} />
              <PlayButton track={trackOf(data, f.id)} className="play-over" />
            </div>
            <a className="wall-name" href={songHref(f.id)}>
              {name}
            </a>
            <span className="faded-last">{monthOf(f.last)}</span>
          </li>
        )
      })}
    </ol>
  )
}

const KIND_WORDS = (): Record<KindFilter, { creators: string; items: string; fresh: string; top: string }> => ({
  all: {
    creators: t('Artistas e podcasts', 'Artists and podcasts', 'Artistas y podcasts'),
    items: t('Músicas e episódios', 'Songs and episodes', 'Canciones y episodios'),
    fresh: t('Artistas e podcasts novos', 'New artists and podcasts', 'Artistas y podcasts nuevos'),
    top: t('Faixa mais ouvida', 'Top track', 'Lo más escuchado'),
  },
  music: {
    creators: t('Artistas', 'Artists', 'Artistas'),
    items: t('Músicas', 'Songs', 'Canciones'),
    fresh: t('Artistas novos', 'New artists', 'Artistas nuevos'),
    top: t('Música mais ouvida', 'Top song', 'Canción más escuchada'),
  },
  podcast: {
    creators: t('Podcasts', 'Podcasts', 'Podcasts'),
    items: t('Episódios', 'Episodes', 'Episodios'),
    fresh: t('Podcasts novos', 'New podcasts', 'Podcasts nuevos'),
    top: t('Episódio mais ouvido', 'Top episode', 'Episodio más escuchado'),
  },
})

/** Dois anos lado a lado, com barras que crescem a partir do meio. */
export function Comparar({ data, years, filter }: { data: Dataset; years: number[]; filter: Filter }) {
  const initial = () => {
    const b = filter.year ?? years[years.length - 1]
    const i = years.indexOf(b)
    const a = years[i - 1] ?? years[i + 1] ?? b
    return [a, b] as const
  }
  const [[a, b], setPair] = useState(initial)
  const pa = useMemo(() => yearProfile(data, a, filter.kind), [data, a, filter.kind])
  const pb = useMemo(() => yearProfile(data, b, filter.kind), [data, b, filter.kind])
  const words = KIND_WORDS()[filter.kind]

  if (years.length < 2)
    return (
      <p className="empty-note">
        {t(
          'Seu histórico tem um ano só, então ainda não dá para comparar.',
          'Your history has just one year, so nothing to compare yet.',
          'Tu historial tiene un solo año, así que aún no se puede comparar.',
        )}
      </p>
    )

  const rows: { label: string; a: number; b: number; fmt: (v: number) => string; skip?: boolean }[] = [
    { label: t('Horas', 'Hours', 'Horas'), a: pa.totalMs, b: pb.totalMs, fmt: hours },
    { label: t('Reproduções', 'Plays', 'Reproducciones'), a: pa.plays, b: pb.plays, fmt: num },
    { label: words.creators, a: pa.creators, b: pb.creators, fmt: num },
    { label: words.items, a: pa.items, b: pb.items, fmt: num },
    { label: words.fresh, a: pa.newCreators, b: pb.newCreators, fmt: num, skip: pa.firstYear || pb.firstYear },
  ]
  const shared = new Set(pa.top.map((x) => x.id).filter((id) => pb.top.some((y) => y.id === id)))

  const picker = (value: number, other: number, set: (y: number) => void, label: string, p: YearProfile) => (
    <label className="vs-pick">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => set(Number(e.target.value))}>
        {years.map((y) => (
          <option key={y} value={y} disabled={y === other}>
            {y}
          </option>
        ))}
      </select>
      {p.partial && p.last !== null && <small>{t(`até ${monthOf(p.last)}`, `until ${monthOf(p.last)}`, `hasta ${monthOf(p.last)}`)}</small>}
    </label>
  )

  return (
    <div className="versus card">
      <div className="vs-head">
        {picker(a, b, (y) => setPair([y, b]), t('Primeiro ano', 'First year', 'Primer año'), pa)}
        <span className="vs-x" aria-hidden>
          vs
        </span>
        {picker(b, a, (y) => setPair([a, y]), t('Segundo ano', 'Second year', 'Segundo año'), pb)}
      </div>

      <div className="vs-rows">
        {rows
          .filter((r) => !r.skip)
          .map((r) => {
            const max = Math.max(r.a, r.b, 1)
            return (
              <div key={r.label} className="vs-row">
                <div className={`vs-side left ${r.a > r.b ? 'win' : ''}`}>
                  <span className="vs-val">{r.fmt(r.a)}</span>
                  <span className="vs-track">
                    <b style={{ width: `${(r.a / max) * 100}%` }} />
                  </span>
                </div>
                <span className="vs-label">{r.label}</span>
                <div className={`vs-side right ${r.b > r.a ? 'win' : ''}`}>
                  <span className="vs-track">
                    <b style={{ width: `${(r.b / max) * 100}%` }} />
                  </span>
                  <span className="vs-val">{r.fmt(r.b)}</span>
                </div>
              </div>
            )
          })}
        {(pa.part || pb.part) && (
          <div className="vs-row">
            <div className="vs-side left">
              <span className="vs-val">{pa.part ?? '—'}</span>
            </div>
            <span className="vs-label">{t('Parte do dia', 'Time of day', 'Momento del día')}</span>
            <div className="vs-side right">
              <span className="vs-val">{pb.part ?? '—'}</span>
            </div>
          </div>
        )}
      </div>

      <div className="vs-tops">
        {[pa, pb].map((p) => (
          <div key={p.year}>
            <p className="kicker">{t(`Top 5 de ${p.year}`, `Top 5 of ${p.year}`, `Top 5 de ${p.year}`)}</p>
            <ol>
              {p.top.map((x, i) => (
                <li key={x.id} className={shared.has(x.id) ? 'shared' : ''}>
                  <span className="rank-n">{i + 1}</span>
                  <Thumb image={artistRef(data, x.id)} label={x.name} size={36} />
                  <a href={artistHref(x.id)} className="rank-name">
                    {x.name}
                  </a>
                  <span className="rank-val">{hours(x.ms)}</span>
                </li>
              ))}
            </ol>
            {p.topItem && (
              <p className="vs-song">
                {words.top}:{' '}
                <a href={songHref(p.topItem.id)}>
                  <b>{cleanTitle(p.topItem.name)}</b>
                </a>
                {' · '}
                {p.topItem.sub}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
