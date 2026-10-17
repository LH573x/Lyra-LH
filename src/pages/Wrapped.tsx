import { useEffect, useMemo, useState } from 'react'
import type { Dataset } from '../data/types'
import { topPeriodsView, wrappedView } from '../data/views'
import { deck, periodTitle, topAlt } from '../ui/wrappedDeck'
import { TopCard, WrappedCard } from '../ui/WrappedCard'
import { StoryViewer, type Story } from '../ui/StoryViewer'
import { Section } from '../ui/blocks'
import { displayFontLoaded, loadDisplayFont } from '../ui/svgText'
import { slug } from '../ui/format'
import { t } from '../i18n'

interface Props {
  data: Dataset
  year: number
}

export function Wrapped({ data, year }: Props) {
  // Os textos dos cartões são medidos na fonte dos títulos: espera ela carregar.
  const [fontReady, setFontReady] = useState(displayFontLoaded)
  useEffect(() => {
    if (!fontReady) loadDisplayFont().then(() => setFontReady(true))
  }, [fontReady])

  const w = useMemo(() => wrappedView(data, year), [data, year])
  const periods = useMemo(() => topPeriodsView(data), [data])

  const tops = useMemo<Story[]>(
    () => periods.map((t) => ({ id: `top-${t.id}`, title: periodTitle(t.id), card: <TopCard t={t} label={topAlt(t)} /> })),
    [periods],
  )
  const cards = useMemo<Story[]>(() => (w ? deck(w).map((c) => ({ id: c.id, title: c.title, card: <WrappedCard card={c} w={w} /> })) : []), [w])

  if (!fontReady) return <p className="empty">{t('Preparando os stories…', 'Getting your stories ready…', 'Preparando las historias…')}</p>

  return (
    <main className="page wrapped">
      <section className="hero">
        <h1>{t('Seus stories', 'Your stories', 'Tus historias')}</h1>
      </section>

      <div className="wgrid">
        <Section title={t('Seus Top 5', 'Your Top 5s', 'Tus Top 5')}>
          {tops.length > 0 ? (
            <StoryViewer
              stories={tops}
              label="Top 5"
              fileName={(i) => `meu-top-5-${slug(tops[i].title)}`}
              zipName="meu-top-5.zip"
              shareTitle={t('Meu Top 5', 'My Top 5', 'Mi Top 5')}
            />
          ) : (
            <p className="empty">
              {t('Não há músicas no seu histórico para montar o Top 5.', 'No songs in your history to make a Top 5.', 'No hay canciones en tu historial para montar el Top 5.')}
            </p>
          )}
        </Section>

        <Section title={t(`Seu ${year}`, `Your ${year}`, `Tu ${year}`)}>
          {cards.length > 0 ? (
            <StoryViewer
              key={year}
              stories={cards}
              label={t(`Retrospectiva de ${year}`, `${year} in review`, `Retrospectiva de ${year}`)}
              fileName={(i) => `lyra-${year}-${String(i + 1).padStart(2, '0')}-${slug(cards[i].title)}`}
              zipName={`lyra-${year}.zip`}
              shareTitle={`Lyra ${year}`}
            />
          ) : (
            <p className="empty">{t('Nada por aqui nesse ano.', 'Nothing here for this year.', 'Nada por aquí este año.')}</p>
          )}
        </Section>
      </div>
    </main>
  )
}
