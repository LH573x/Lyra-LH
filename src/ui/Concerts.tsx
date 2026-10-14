import { useState } from 'react'
import type { Dataset } from '../data/types'
import { ConcertError, findCity, hereNow, nearbyConcerts, type Concert, type Place } from '../data/concerts'
import { norm } from '../data/search'
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
    <Section title={t('Shows perto de você', 'Gigs near you', 'Conciertos cerca de ti')}>
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
        <div className="search-row">
          <input
            value={city}
            aria-label={t('Cidade', 'City', 'Ciudad')}
            placeholder={t('ou digite a cidade', 'or type your city', 'o escribe tu ciudad')}
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
          'Só a região e os nomes dos artistas vão para o Ticketmaster.',
          'Only your area and artist names are sent to Ticketmaster.',
          'Solo tu zona y los nombres de los artistas se envían a Ticketmaster.',
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
  return (
    <div className="gig">
      <header className="gig-head">
        <p>
          <PinIcon />
          <strong>{place.label.charAt(0).toUpperCase() + place.label.slice(1)}</strong>
          <button className="ghost" onClick={() => onChange(null)}>
            {t('Trocar', 'Change', 'Cambiar')}
          </button>
        </p>
        <div className="chips" role="group" aria-label={t('Distância', 'Distance', 'Distancia')}>
          {RADII.map((r) => (
            <button key={r} className={r === radius ? 'on' : ''} onClick={() => onChange({ place, radius: r })}>
              {r} km
            </button>
          ))}
        </div>
      </header>
      {list ? (
        <>
          {list.some((c) => !c.festival) ? (
            <GigList items={list.filter((c) => !c.festival)} />
          ) : (
            <p className="ex-fail">
              {t(
                'Nenhum show dos seus artistas por aqui. Tente uma distância maior.',
                'None of your artists are playing around here. Try a bigger distance.',
                'Ninguno de tus artistas toca por aquí. Prueba una distancia mayor.',
              )}
            </p>
          )}
          {list.some((c) => c.festival) && (
            <div className="gig-fests">
              <header className="card-head">
                <h3>{t('Festivais na região', 'Festivals nearby', 'Festivales en la zona')}</h3>
              </header>
              <GigList items={list.filter((c) => c.festival)} />
            </div>
          )}
        </>
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

function GigList({ items }: { items: Concert[] }) {
  const [all, setAll] = useState(false)
  return (
    <>
      <ul className="ex-list">
        {items.slice(0, all ? undefined : FEW).map((c) => (
          <GigRow key={c.id} c={c} />
        ))}
      </ul>
      {items.length > FEW && (
        <button className="ghost ex-more" onClick={() => setAll(!all)}>
          {all ? t('Ver menos', 'Show less', 'Ver menos') : t(`Ver todos (${items.length})`, `Show all (${items.length})`, `Ver todos (${items.length})`)}
        </button>
      )}
    </>
  )
}

const noon = (d: string) => new Date(`${d}T12:00:00`)
const THIS_YEAR = new Date().getFullYear()

/** O dia já está no selo: aqui vão o dia da semana e a hora ("sáb. · 20:00"), ou o período de um festival ("19–21 de mar."). */
function when(c: Concert): string {
  if (c.end && c.end !== c.date) {
    return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short' }).formatRange(noon(c.date), noon(c.end))
  }
  const day = noon(c.date).toLocaleDateString(locale(), { weekday: 'short' })
  // 00:00 é o horário que o Ticketmaster põe quando ainda não há um.
  const time = c.time && !c.time.startsWith('00:00') ? c.time.slice(0, 5) : ''
  return time ? `${day} · ${time}` : day
}

const TOUR = /\b(tour|turn[êe]|world|anos|years|ao vivo|live|experience|sessions?|ac[úu]stico|show)\b/i
const UF = /^[A-Z]{2,3}$/

/**
 * O nome da turnê, sem o que a linha já mostra: "Djavan: 50 Anos Só Sucessos - São Paulo" → "50 Anos Só Sucessos".
 * Tira o artista, o local e a cidade do fim; só fica quando sobra um nome de turnê de verdade.
 */
function tourName(c: Concert): string {
  const artists = c.artists.map((a) => a.name)
  const skip = new Set([...artists, c.venue, c.city].map(norm))
  let parts = c.name
    .split(/\s*\|\s*|:\s+|\s+[-–—]\s+/)
    .map((p) => {
      const a = artists.find((x) => p.toLowerCase().startsWith(`${x.toLowerCase()} `))
      return (a ? p.slice(a.length) : p).replace(/^\s*(na|no|em|at|in|en|@)\s+/i, '').trim()
    })
    .filter((p) => p && !skip.has(norm(p)) && !UF.test(p))
  // Sobrou mais de um pedaço: o último costuma ser a cidade ("… - São Paulo").
  if (parts.length > 1) parts = parts.slice(0, -1)
  const name = parts.join(' · ')
  return TOUR.test(name) ? name : ''
}

function GigRow({ c }: { c: Concert }) {
  const day = noon(c.date)
  const year = day.getFullYear()
  const names = c.artists.map((a) => a.name).join(', ')
  const where = [c.venue, c.city, c.km !== undefined ? `${Math.round(c.km)} km` : ''].filter(Boolean).join(' · ')
  const label = t(`Ingressos para ${c.name}`, `Tickets for ${c.name}`, `Entradas para ${c.name}`)
  // Show: o artista em cima e a turnê embaixo. Festival: o nome do festival em cima e os seus artistas embaixo.
  const title = c.festival ? c.name : names
  const why = c.festival ? (names ? t(`Com ${names}`, `With ${names}`, `Con ${names}`) : '') : tourName(c)
  return (
    <li className="ex-row">
      <span className="gig-date" aria-hidden>
        <b>{day.getDate()}</b>
        <span>{day.toLocaleDateString(locale(), { month: 'short' }).replace('.', '')}</span>
        {year !== THIS_YEAR && <small>{year}</small>}
      </span>
      <div className="ex-body">
        <span className="ex-title">{title}</span>
        <span className="ex-sub">{when(c)}</span>
        <span className="ex-sub">{where}</span>
        {why && <span className="ex-why gig-why">{why}</span>}
      </div>
      {c.url && (
        <a className="ex-link" href={c.url} target="_blank" rel="noreferrer" aria-label={label} title={label}>
          <ExternalIcon />
        </a>
      )}
    </li>
  )
}
