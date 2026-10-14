import { useState } from 'react'
import type { Dataset } from '../data/types'
import { ConcertError, findCity, hereNow, nearbyConcerts, type Concert, type Place } from '../data/concerts'
import { Section } from './blocks'
import { Failed, Loading } from './ExploreParts'
import { ExternalIcon, PinIcon } from './icons'
import { useAsync } from './useAsync'
import { lang, locale, t } from '../i18n'

const PLACE_KEY = 'lyra-shows-place'
const RADII = [50, 150, 500] as const
const FEW = 6

function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}
function write(key: string, v: unknown) {
  try {
    if (v === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(v))
  } catch {
    // Sem localStorage: vale só até fechar a página.
  }
}

interface Saved {
  place: Place
  radius: number
}

/** Shows perto de você: o lugar fica guardado no aparelho, para a lista já abrir pronta da próxima vez. */
export function Concerts({ data }: { data: Dataset }) {
  const [saved, setSaved] = useState<Saved | null>(() => read<Saved>(PLACE_KEY))
  const choose = (s: Saved | null) => {
    write(PLACE_KEY, s)
    setSaved(s)
  }
  return (
    <Section
      title={t('Shows perto de você', 'Gigs near you', 'Conciertos cerca de ti')}
      note={t(
        'Artistas que você ouve com show marcado na sua região. Dados do Ticketmaster.',
        'Artists you listen to with gigs coming up near you. Data from Ticketmaster.',
        'Artistas que escuchas con conciertos próximos en tu zona. Datos de Ticketmaster.',
      )}
    >
      <div className="card">
        {saved ? (
          <Nearby data={data} saved={saved} onChange={choose} />
        ) : (
          <PlacePicker onPick={(place) => choose({ place, radius: RADII[1] })} />
        )}
      </div>
    </Section>
  )
}

function PlacePicker({ onPick }: { onPick: (p: Place) => void }) {
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const useHere = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const p = await hereNow()
      onPick({ ...p, label: t('sua localização', 'your location', 'tu ubicación') })
    } catch {
      setMsg(
        t(
          'Não deu para pegar a localização. Digite a cidade abaixo.',
          "Couldn't get your location. Type your city below.",
          'No se ha podido obtener la ubicación. Escribe tu ciudad abajo.',
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const search = async () => {
    if (!city.trim()) return
    setBusy(true)
    setMsg(null)
    try {
      const p = await findCity(city, lang())
      if (p) onPick(p)
      else setMsg(t('Não achei essa cidade.', "Couldn't find that city.", 'No he encontrado esa ciudad.'))
    } catch {
      setMsg(t('Não deu para buscar agora.', "Couldn't search right now.", 'No se ha podido buscar ahora.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gig-pick">
      <button className="primary gig-here" onClick={useHere} disabled={busy}>
        <PinIcon />
        {t('Usar minha localização', 'Use my location', 'Usar mi ubicación')}
      </button>
      <form
        className="search"
        onSubmit={(e) => {
          e.preventDefault()
          search()
        }}
      >
        <label htmlFor="gig-city">{t('ou digite a cidade', 'or type your city', 'o escribe tu ciudad')}</label>
        <div className="search-row">
          <input
            id="gig-city"
            value={city}
            placeholder={t('Ex.: Curitiba', 'E.g. Manchester', 'Ej.: Valencia')}
            enterKeyHint="search"
            autoComplete="address-level2"
            onChange={(e) => setCity(e.target.value)}
          />
          <button type="submit" disabled={busy || !city.trim()}>
            {t('Buscar', 'Search', 'Buscar')}
          </button>
        </div>
      </form>
      {msg && <p className="ex-fail">{msg}</p>}
      <p className="gig-privacy">
        {t(
          'Só a região e os nomes dos artistas vão para o Ticketmaster. Seu histórico fica neste aparelho.',
          'Only your area and artist names are sent to Ticketmaster. Your history stays on this device.',
          'Solo tu zona y los nombres de los artistas se envían a Ticketmaster. Tu historial se queda en este dispositivo.',
        )}
      </p>
    </div>
  )
}

function Nearby({ data, saved, onChange }: { data: Dataset; saved: Saved; onChange: (s: Saved | null) => void }) {
  const { place, radius } = saved
  const key = `gig:${place.lat},${place.lon}|${radius}|${data.importedAt}`
  const [error, setError] = useState<ConcertError['reason'] | null>(null)
  const { data: list, failed, retry } = useAsync(key, () =>
    nearbyConcerts(data, place, radius).then(
      (l) => {
        setError(null)
        return l
      },
      (e: unknown) => {
        setError(e instanceof ConcertError ? e.reason : 'network')
        throw e
      },
    ),
  )
  const [all, setAll] = useState(false)

  return (
    <div className="gig">
      <header className="gig-head">
        <p>
          <PinIcon />
          <span>
            {t('Perto de', 'Near', 'Cerca de')} <strong>{place.label}</strong>
          </span>
          <button className="ghost" onClick={() => onChange(null)}>
            {t('Trocar', 'Change', 'Cambiar')}
          </button>
        </p>
        <div className="chips" role="group" aria-label={t('Distância', 'Distance', 'Distancia')}>
          {RADII.map((r) => (
            <button key={r} className={r === radius ? 'on' : ''} onClick={() => onChange({ place, radius: r })}>
              {t(`Até ${r} km`, `Within ${r} km`, `Hasta ${r} km`)}
            </button>
          ))}
        </div>
      </header>
      {list ? (
        list.length > 0 ? (
          <>
            <ul className="ex-list">
              {list.slice(0, all ? undefined : FEW).map((c) => (
                <GigRow key={c.id} c={c} />
              ))}
            </ul>
            {list.length > FEW && (
              <button className="ghost ex-more" onClick={() => setAll(!all)}>
                {all ? t('Ver menos', 'Show less', 'Ver menos') : t(`Ver todos (${list.length})`, `Show all (${list.length})`, `Ver todos (${list.length})`)}
              </button>
            )}
          </>
        ) : (
          <p className="ex-fail">
            {t(
              'Nenhum show de artistas que você ouve por aqui por enquanto. Tente uma distância maior.',
              'No gigs from artists you listen to around here for now. Try a bigger distance.',
              'Ningún concierto de artistas que escuchas por aquí por ahora. Prueba una distancia mayor.',
            )}
          </p>
        )
      ) : failed ? (
        error === 'key' ? (
          <p className="ex-fail">
            {t('A chave do Ticketmaster não foi aceita.', 'The Ticketmaster key was not accepted.', 'La clave de Ticketmaster no fue aceptada.')}
          </p>
        ) : error === 'limit' ? (
          <p className="ex-fail">
            {t(
              'Muitas buscas de shows hoje. Tente de novo mais tarde.',
              'Too many gig searches today. Try again later.',
              'Demasiadas búsquedas de conciertos hoy. Inténtalo más tarde.',
            )}
          </p>
        ) : (
          <Failed onRetry={retry} />
        )
      ) : (
        <Loading rows={4} />
      )}
    </div>
  )
}

function GigRow({ c }: { c: Concert }) {
  const day = new Date(`${c.date}T12:00:00`)
  const names = c.artists.map((a) => a.name).join(', ')
  const where = [c.venue, c.city, c.km !== undefined ? `${Math.round(c.km)} km` : ''].filter(Boolean).join(' · ')
  const label = t(`Ingressos para ${c.name}`, `Tickets for ${c.name}`, `Entradas para ${c.name}`)
  return (
    <li className="ex-row">
      <span className="gig-date" aria-hidden>
        <b>{day.getDate()}</b>
        <span>{day.toLocaleDateString(locale(), { month: 'short' }).replace('.', '')}</span>
      </span>
      <div className="ex-body">
        <span className="ex-title">{names}</span>
        <span className="ex-sub">
          {day.toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          {c.time ? ` · ${c.time.slice(0, 5)}` : ''}
        </span>
        <span className="ex-sub">{where}</span>
        {c.name !== names && <span className="ex-why">{c.name}</span>}
      </div>
      {c.url && (
        <a className="ex-link" href={c.url} target="_blank" rel="noreferrer" aria-label={label} title={label}>
          <ExternalIcon />
        </a>
      )}
    </li>
  )
}
