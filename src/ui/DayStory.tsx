import { useMemo } from 'react'
import type { Dataset } from '../data/types'
import type { DayMemory } from '../data/onThisDay'
import { artistRef, itemRef } from '../data/refs'
import { DayCard, type DayRow } from './WrappedCard'
import { StoryViewer } from './StoryViewer'
import { StorySheet } from './StorySheet'
import { cleanTitle, slug } from './format'
import { t } from '../i18n'

/** Cabem até 10 anos no story; os mais recentes ficam. */
const MAX_ROWS = 10

function Story({ data, list, date }: { data: Dataset; list: DayMemory[]; date: string }) {
  const stories = useMemo(() => {
    const rows: DayRow[] = list.slice(0, MAX_ROWS).map((m) => {
      const photo = artistRef(data, m.creator)
      return {
        year: m.year,
        song: cleanTitle(data.items[m.item].name),
        songImage: itemRef(data, m.item) ?? null,
        artist: data.creators[m.creator],
        artistImage: photo,
        round: photo.kind !== 'podcast',
      }
    })
    const podcasts = list.every((m) => data.items[m.item].kind === 'podcast')
    const heads: [string, string] = podcasts
      ? [t('Episódio', 'Episode', 'Episodio'), t('Podcast', 'Podcast', 'Podcast')]
      : [t('Música', 'Song', 'Canción'), t('Artista', 'Artist', 'Artista')]
    const title = t(`Meu ${date}`, `My ${date}`, `Mi ${date}`)
    const label = `${title}. ${rows.map((r) => `${r.year}: ${r.song}; ${r.artist}`).join('. ')}.`
    return [{ id: 'dia', title, card: <DayCard date={date} rows={rows} heads={heads} label={label} /> }]
  }, [data, list, date])

  const mine = t(`Meu ${date}`, `My ${date}`, `Mi ${date}`)
  return <StoryViewer stories={stories} label={mine} fileName={() => `lyra-${slug(date)}`} zipName="" shareTitle={mine} />
}

/** Botão pequeno que abre o story de "Seu 4 de outubro", pronto para compartilhar. */
export function DayStory({ data, list, date }: { data: Dataset; list: DayMemory[]; date: string }) {
  return (
    <StorySheet label={t(`Story: seu ${date}`, `Story: your ${date}`, `Historia: tu ${date}`)}>
      <Story data={data} list={list} date={date} />
    </StorySheet>
  )
}
