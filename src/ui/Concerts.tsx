import { useState, type CSSProperties } from 'react'
import type { Dataset } from '../data/types'
import { ConcertError, findCity, hereNow, nearbyConcerts, type Concert, type FestDay, type Place } from '../data/concerts'
import { norm } from '../data/search'
import { Section } from './blocks'
import { Failed, Loading } from './ExploreParts'
import { ExternalIcon, PinIcon } from './icons'
import { useAsync } from './useAsync'
import { lang, locale, t } from '../i18n'

const PLACE_KEY = 'lyra-shows-place'
const RADII = [50, 150, 500] as const
const FEW = 6
/** Festivais abertos de saída; o resto fica no "Ver todos". */
const FEW_FESTS = 3
/** Atrações por dia antes do "+N": todos os seus artistas e, depois deles, as maiores do cartaz. */
const ACTS = 6

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
              <GigList items={list.filter((c) => c.festival)} festivals />
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

function GigList({ items, festivals }: { items: Concert[]; festivals?: boolean }) {
  const [all, setAll] = useState(false)
  const few = festivals ? FEW_FESTS : FEW
  return (
    <>
      <ul className={festivals ? 'fest-list' : 'ex-list'}>
        {items
          .slice(0, all ? undefined : few)
          .map((c) => (festivals ? <Festival key={c.id} c={c} /> : <GigRow key={c.id} c={c} />))}
      </ul>
      {items.length > few && (
        <button className="ghost ex-more" onClick={() => setAll(!all)}>
          {all ? t('Ver menos', 'Show less', 'Ver menos') : t(`Ver todos (${items.length})`, `Show all (${items.length})`, `Ver todos (${items.length})`)}
        </button>
      )}
    </>
  )
}

const noon = (d: string) => new Date(`${d}T12:00:00`)
const THIS_YEAR = new Date().getFullYear()

// 00:00 é o horário que o Ticketmaster põe quando ainda não há um.
const hour = (c: Concert) => (c.time && !c.time.startsWith('00:00') ? c.time.slice(0, 5) : '')

/** O dia já está no selo: aqui vão o dia da semana e a hora ("sáb. · 20:00"). */
function when(c: Concert): string {
  const day = noon(c.date).toLocaleDateString(locale(), { weekday: 'short' })
  return [day, hour(c)].filter(Boolean).join(' · ')
}

/** Festival não tem selo: "19–21 de mar.", ou "sáb., 5 de dez. · 14:00" quando é um dia só. O ano, se não estiver no nome. */
function festWhen(c: Concert): string {
  const year = c.date.slice(0, 4)
  const opts: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    year: Number(year) !== THIS_YEAR && !c.name.includes(year) ? 'numeric' : undefined,
  }
  if (c.end && c.end !== c.date) return new Intl.DateTimeFormat(locale(), opts).formatRange(noon(c.date), noon(c.end))
  return [noon(c.date).toLocaleDateString(locale(), { weekday: 'short', ...opts }), hour(c)].filter(Boolean).join(' · ')
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

const where = (c: Concert) => [c.venue, c.city, c.km !== undefined ? `${Math.round(c.km)} km` : ''].filter(Boolean)

function Tickets({ c }: { c: Concert }) {
  if (!c.url) return null
  const label = t(`Ingressos para ${c.name}`, `Tickets for ${c.name}`, `Entradas para ${c.name}`)
  return (
    <a className="ex-link" href={c.url} target="_blank" rel="noreferrer" aria-label={label} title={label}>
      <ExternalIcon />
    </a>
  )
}

/** Show: o artista em cima e a turnê embaixo. */
function GigRow({ c }: { c: Concert }) {
  const day = noon(c.date)
  const year = day.getFullYear()
  const why = tourName(c)
  return (
    <li className="ex-row">
      <span className="gig-date" aria-hidden>
        <b>{day.getDate()}</b>
        <span>{day.toLocaleDateString(locale(), { month: 'short' }).replace('.', '')}</span>
        {year !== THIS_YEAR && <small>{year}</small>}
      </span>
      <div className="ex-body">
        <span className="ex-title">{c.artists.map((a) => a.name).join(', ')}</span>
        <span className="ex-sub">{when(c)}</span>
        <span className="ex-sub">{where(c).join(' · ')}</span>
        {why && <span className="ex-why gig-why">{why}</span>}
      </div>
      <Tickets c={c} />
    </li>
  )
}

/**
 * Festival: a arte ocupa a linha toda (nas telas largas, o que sobra dos lados é a própria arte, desfocada)
 * e, embaixo, cada dia com quem toca, os seus artistas na frente.
 */
function Festival({ c }: { c: Concert }) {
  const art = c.images
  const months = new Set(c.lineup?.map((d) => d.date.slice(0, 7)))
  return (
    <li className="fest">
      {art && (
        <div className="fest-art" style={{ '--art': `url("${art[0].url}")` } as CSSProperties}>
          <img
            src={art[Math.min(1, art.length - 1)].url}
            srcSet={art.map((i) => `${i.url} ${i.width}w`).join(', ')}
            sizes="(min-width: 600px) 534px, calc(100vw - 68px)"
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <div className="fest-head">
        <div className="ex-body">
          <span className="fest-name">{c.name}</span>
          <div className="fest-meta dots">
            <p>
              {[festWhen(c), ...where(c)].map((x, i) => (
                <span key={i}>{x}</span>
              ))}
            </p>
          </div>
        </div>
        <Tickets c={c} />
      </div>
      {c.lineup && (
        <ul className="fest-days">
          {c.lineup.map((d) => (
            <Day key={d.date} day={d} withMonth={months.size > 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function Day({ day, withMonth }: { day: FestDay; withMonth: boolean }) {
  const [all, setAll] = useState(false)
  const yours = day.acts.filter((a) => a.ms).length
  const shown = all ? day.acts.length : Math.max(yours, ACTS)
  const date = noon(day.date)
  const label = [
    date.toLocaleDateString(locale(), { weekday: 'short' }).replace('.', ''),
    withMonth ? date.toLocaleDateString(locale(), { day: 'numeric', month: 'numeric' }) : date.getDate(),
  ].join(' ')
  return (
    <li className="fest-day">
      <span className={yours ? 'fest-when on' : 'fest-when'}>{label}</span>
      <div className="fest-acts dots">
        <p>
          {day.acts.slice(0, shown).map((a) => (
            <span key={a.name} className={a.ms ? 'mine' : undefined}>
              {a.name}
              {a.via && <small> ({a.via})</small>}
            </span>
          ))}
          {day.acts.length > Math.max(yours, ACTS) && (
            <button className="fest-more" onClick={() => setAll(!all)} aria-expanded={all}>
              {all ? t('menos', 'less', 'menos') : `+${day.acts.length - shown}`}
            </button>
          )}
        </p>
      </div>
    </li>
  )
}
