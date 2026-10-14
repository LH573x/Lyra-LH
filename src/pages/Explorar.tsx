import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dataset } from '../data/types'
import type { DzTrack } from '../data/deezer'
import { shows, sideB, songKey, spin, toggleLike, topArtists, useHidden, useLiked, weekly, type SideB } from '../data/explore'
import { Section } from '../ui/blocks'
import { Failed, Loading, Pic, PreviewButton, SimilarSection, SpotifyLink, TrackRow } from '../ui/ExploreParts'
import { HeartIcon } from '../ui/icons'
import { playPreview, unlockAudio, usePreview } from '../ui/preview'
import { useAsync } from '../ui/useAsync'
import { t } from '../i18n'
import { Concerts } from '../ui/Concerts'
import { hasConcerts } from '../data/concerts'

/** A aba Explorar: músicas que você nunca ouviu, a partir do que você mais ouve. */
export function Explorar({ data }: { data: Dataset }) {
  const top = useMemo(() => topArtists(data, 1)[0], [data])
  return (
    <main className="page explore">
      <section className="hero">
        <h1>
          {t('Música nova', 'New music', 'Música nueva')} <span className="accent">{t('para você', 'for you', 'para ti')}</span>
        </h1>
      </section>
      <Weekly data={data} />
      {hasConcerts() && <Concerts data={data} />}
      {top && <SimilarSection data={data} name={top.name} />}
      <SideBs data={data} />
      <Roulette data={data} />
    </main>
  )
}

function Weekly({ data }: { data: Dataset }) {
  const { data: all, failed, retry } = useAsync(`w:${data.importedAt}`, () => weekly(data))
  const hidden = useHidden()
  const picks = all?.filter((p) => shows(hidden, songKey(p.track)))
  return (
    <Section
      title={t('Descobertas da semana', "This week's discoveries", 'Descubrimientos de la semana')}
      note={t('Novas toda segunda-feira', 'New every Monday', 'Nuevas cada lunes')}
    >
      <div className="card">
        {picks ? (
          picks.length > 0 ? (
            <ul className="ex-list">
              {picks.map((p) => (
                <TrackRow
                  key={p.track.id}
                  track={p.track}
                  hide={songKey(p.track)}
                  sub={p.track.artist}
                  why={t(`Porque você ouve ${p.because}`, `Because you listen to ${p.because}`, `Porque escuchas a ${p.because}`)}
                />
              ))}
            </ul>
          ) : (
            <p className="ex-fail">{t('Nada novo por enquanto.', 'Nothing new for now.', 'Nada nuevo por ahora.')}</p>
          )
        ) : failed ? (
          <Failed onRetry={retry} />
        ) : (
          <Loading rows={6} />
        )}
      </div>
    </Section>
  )
}

function SideBs({ data }: { data: Dataset }) {
  const { data: list, failed, retry } = useAsync(`b:${data.importedAt}`, () => sideB(data))
  if (list && list.length === 0) return null
  return (
    <Section title={t('Lado B dos favoritos', 'B-sides of your favourites', 'Caras B de tus favoritos')}>
      {list ? (
        <div className="ex-sides">
          {list.map((s) => (
            <SideBCard key={s.artist.id} s={s} />
          ))}
        </div>
      ) : (
        <div className="card">{failed ? <Failed onRetry={retry} /> : <Loading rows={4} />}</div>
      )}
    </Section>
  )
}

const FEW = 3
const MANY = 20

function SideBCard({ s }: { s: SideB }) {
  const [all, setAll] = useState(false)
  const hidden = useHidden()
  const tracks = s.tracks.filter((tr) => shows(hidden, songKey(tr)))
  const n = tracks.filter((tr) => !hidden.has(songKey(tr))).length
  if (tracks.length === 0) return null
  return (
    <div className="card ex-side">
      <header className="ex-side-head">
        <Pic src={s.artist.picture} label={s.name} round size={44} />
        <div>
          <h3>{s.name}</h3>
          {n > 0 && (
            <p>
              {n === 1
                ? t('1 música que você nunca ouviu', "1 song you've never played", '1 canción que nunca has escuchado')
                : t(`${n} músicas que você nunca ouviu`, `${n} songs you've never played`, `${n} canciones que nunca has escuchado`)}
            </p>
          )}
        </div>
      </header>
      <ul className="ex-list ex-one">
        {tracks.slice(0, all ? MANY : FEW).map((tr) => (
          <TrackRow key={tr.id} track={tr} hide={songKey(tr)} />
        ))}
      </ul>
      {tracks.length > FEW && (
        <button className="ghost ex-more" onClick={() => setAll(!all)}>
          {all ? t('Ver menos', 'Show less', 'Ver menos') : t('Ver todas', 'Show all', 'Ver todas')}
        </button>
      )}
    </div>
  )
}

/** Gira o disco e toca uma música que você nunca ouviu. */
function Roulette({ data }: { data: Dataset }) {
  const [track, setTrack] = useState<DzTrack | null>(null)
  const [spinning, setSpinning] = useState(false)
  const [empty, setEmpty] = useState(false)
  const liked = useLiked()
  const seen = useRef(new Set<number>())
  const ready = useRef<DzTrack | null>(null)
  const pending = useRef<Promise<DzTrack | null> | null>(null)
  const state = usePreview(track?.id ?? -1)

  // A próxima música já fica sorteada e com a prévia pronta, para tocar no mesmo toque.
  const prepare = useCallback(() => {
    const p = spin(data, seen.current).catch(() => null)
    pending.current = p
    ready.current = null
    p.then((tr) => {
      if (pending.current === p) ready.current = tr
    })
  }, [data])
  useEffect(() => prepare(), [prepare])

  const show = (tr: DzTrack | null) => {
    // Dois toques seguidos enquanto carregava: a mesma música chega duas vezes.
    if (tr && seen.current.has(tr.id)) return
    if (!tr) {
      setEmpty(true)
      return
    }
    seen.current.add(tr.id)
    setEmpty(false)
    setTrack(tr)
    playPreview(tr)
    prepare()
  }

  const go = () => {
    setSpinning(true)
    setTimeout(() => setSpinning(false), 900)
    const tr = ready.current
    if (tr) return show(tr)
    unlockAudio()
    const p = pending.current
    if (p) p.then(show)
    else prepare()
  }

  const isLiked = !!track && liked.some((x) => x.id === track.id)
  return (
    <Section title={t('Roleta', 'Roulette', 'Ruleta')}>
      <div className="card ex-roulette">
        <button
          className={`ex-disc ${spinning ? 'spin' : state === 'playing' ? 'turn' : ''}`}
          onClick={go}
          aria-label={t('Girar a roleta', 'Spin the roulette', 'Girar la ruleta')}
        >
          <span className="ex-label">{track?.cover && <img src={track.cover} alt="" referrerPolicy="no-referrer" />}</span>
        </button>
        {track && (
          <div className="ex-pick">
            <h3>{track.title}</h3>
            <p>{track.artist}</p>
          </div>
        )}
        {empty && <p className="ex-fail">{t('Não deu para sortear agora.', "Couldn't pick a song right now.", 'No se ha podido elegir una canción ahora.')}</p>}
        <div className="ex-actions">
          <button className="primary" onClick={go}>
            {track ? t('Outra', 'Another', 'Otra') : t('Girar', 'Spin', 'Girar')}
          </button>
          {track && (
            <>
              <PreviewButton track={track} />
              <button
                className={`ex-like ${isLiked ? 'on' : ''}`}
                aria-pressed={isLiked}
                aria-label={t('Gostei', 'Like', 'Me gusta')}
                title={t('Gostei', 'Like', 'Me gusta')}
                onClick={() => toggleLike(track)}
              >
                <HeartIcon filled={isLiked} />
              </button>
              <SpotifyLink track={track} />
            </>
          )}
        </div>
      </div>
      {liked.length > 0 && (
        <div className="card">
          <header className="card-head">
            <h3>{t('Você gostou', 'You liked', 'Te gustaron')}</h3>
          </header>
          <ul className="ex-list">
            {liked.map((tr) => (
              <TrackRow
                key={tr.id}
                track={tr}
                sub={tr.artist}
                extra={
                  <button
                    className="ex-like on"
                    aria-pressed
                    aria-label={t(`Tirar ${tr.title} da lista`, `Remove ${tr.title} from the list`, `Quitar ${tr.title} de la lista`)}
                    onClick={() => toggleLike(tr)}
                  >
                    <HeartIcon filled />
                  </button>
                }
              />
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}
