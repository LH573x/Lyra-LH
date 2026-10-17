import { useId, useMemo, useState } from 'react'
import type { Dataset } from '../data/types'
import type { Timeline } from '../data/timeline'
import { search, searchIndex, type Hit } from '../data/search'
import { artistHref, songHref } from './links'
import { t } from '../i18n'

interface Props {
  data: Dataset
  timeline: Timeline
  label: string
  placeholder: string
}

const open = (h: Hit) => {
  location.hash = h.kind === 'artist' ? artistHref(h.id) : songHref(h.id)
}

/** Busca de artistas e músicas: as sugestões aparecem embaixo do campo enquanto você digita. */
export function Search({ data, timeline, label, placeholder }: Props) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  // O índice só é montado quando alguém vai buscar (ao tocar no campo), não ao abrir a aba.
  const [armed, setArmed] = useState(false)
  const index = useMemo(() => (armed ? searchIndex(data, timeline) : []), [armed, data, timeline])
  const [active, setActive] = useState(0)
  const hits = useMemo(() => search(index, query), [index, query])
  const listId = useId()
  const show = focused && query.trim() !== ''
  const current = hits[active] ?? hits[0]

  return (
    <form
      className="search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault()
        if (current) open(current)
      }}
    >
      <label htmlFor="artist-search">{label}</label>
      <div className="search-row">
        <div className="search-field">
          <input
            id="artist-search"
            role="combobox"
            aria-expanded={show}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={show && current ? `${listId}-${hits.indexOf(current)}` : undefined}
            placeholder={placeholder}
            value={query}
            enterKeyHint="search"
            autoComplete="off"
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onFocus={() => {
              setFocused(true)
              setArmed(true)
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const step = e.key === 'ArrowDown' ? 1 : -1
                setActive((a) => Math.min(Math.max(a + step, 0), Math.max(hits.length - 1, 0)))
              } else if (e.key === 'Escape') {
                setQuery('')
              }
            }}
          />
          {show && (
            <ul className="search-list" role="listbox" id={listId}>
              {hits.length === 0 ? (
                <li className="search-none">{t('Nada encontrado', 'Nothing found', 'No hay resultados')}</li>
              ) : (
                hits.map((h, i) => (
                  <li
                    key={`${h.kind}-${h.id}`}
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={h === current}
                    className={h === current ? 'on' : ''}
                    // Segura o foco no campo, para o toque chegar na sugestão antes da lista sumir.
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => open(h)}
                  >
                    <strong>{h.name}</strong>
                    <span>
                      {h.kind === 'song'
                        ? h.by
                        : h.podcast
                          ? 'Podcast'
                          : t('Artista', 'Artist', 'Artista')}
                    </span>
                  </li>
                ))
              )}
            </ul>
          )}
        </div>
        <button type="submit" disabled={!current}>
          {t('Abrir', 'Open', 'Abrir')}
        </button>
      </div>
    </form>
  )
}
