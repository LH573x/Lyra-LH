import { useMemo } from 'react'
import type { Dataset } from '../data/types'
import type { KindFilter, Ranked } from '../data/stats'
import { periodSpan, type Period, type PeriodId, type TopBy } from '../data/tops'
import { artistRef, itemRef } from '../data/refs'
import type { ImageRef } from '../data/images'
import { TopTenCard, type TopTenRow } from './WrappedCard'
import { StoryViewer } from './StoryViewer'
import { StorySheet } from './StorySheet'
import { capitalize, monthKeyOf } from './wrappedDeck'
import { cleanTitle, dayMonth, longHours, monthLabel, num, playCount, shortDate, slug } from './format'
import { t } from '../i18n'

interface Props {
  data: Dataset
  kind: KindFilter
  period: Period
  by: TopBy
  /** O top do período, já em ordem; o story leva os 10 primeiros. */
  top: Ranked[]
  /** A posição de cada um no período anterior (null: sem comparação). */
  before: Map<number, number> | null
  /** "Músicas", "Artistas"… e "2025", "6 meses"…, como nos botões da tela. */
  title: string
  chip: string
}

/** "Meu top 10 de 2025", "… do último mês", "… de todos os tempos". */
function kicker(id: PeriodId, n: number) {
  if (typeof id === 'number') return t(`Meu top ${n} de ${id}`, `My top ${n} of ${id}`, `Mi top ${n} de ${id}`)
  if (id === 'mes') return t(`Meu top ${n} do último mês`, `My top ${n} of the past month`, `Mi top ${n} del último mes`)
  if (id === 'semestre') return t(`Meu top ${n} dos últimos 6 meses`, `My top ${n} of the past 6 months`, `Mi top ${n} de los últimos 6 meses`)
  if (id === 'ano') return t(`Meu top ${n} do último ano`, `My top ${n} of the past year`, `Mi top ${n} del último año`)
  return t(`Meu top ${n} de todos os tempos`, `My all-time top ${n}`, `Mi top ${n} de todos los tiempos`)
}

/** As datas do período (o ano já está no título) e o tempo ouvido nele. */
function line(id: PeriodId, kind: KindFilter, span: { ms: number; from: number; to: number }) {
  const h = longHours(span.ms)
  const time =
    kind === 'music'
      ? t(`${h} de música`, `${h} of music`, `${h} de música`)
      : kind === 'podcast'
        ? t(`${h} de podcasts`, `${h} of podcasts`, `${h} de podcasts`)
        : t(`${h} de música e podcasts`, `${h} of music and podcasts`, `${h} de música y podcasts`)
  if (typeof id === 'number') return time
  const from = monthLabel(monthKeyOf(span.from))
  const to = monthLabel(monthKeyOf(span.to))
  // "3 set a 2 out 2026"; no mesmo mês, "1 a 31 dez 2025".
  const a = new Date(span.from)
  const start = monthKeyOf(span.from) === monthKeyOf(span.to) ? String(a.getDate()) : dayMonth(span.from)
  const range =
    id === 'mes'
      ? t(`${start} a ${shortDate(span.to)}`, `${start} to ${shortDate(span.to)}`, `del ${start} al ${shortDate(span.to)}`)
      : id === 'sempre'
        ? t(`desde ${from}`, `since ${from}`, `desde ${from}`)
        : t(`${from} a ${to}`, `${from} to ${to}`, `de ${from} a ${to}`)
  return `${capitalize(range)} · ${time}`
}

/** O canto de baixo do cartão: o ano, o mês ou os anos do período. */
function corner(id: PeriodId, span: { from: number; to: number }) {
  if (typeof id === 'number') return String(id)
  if (id === 'mes') return monthLabel(monthKeyOf(span.to))
  const a = new Date(span.from).getFullYear()
  const b = new Date(span.to).getFullYear()
  return a === b ? String(b) : `${a}–${b}`
}

function Story({ data, kind, period, by, top, before, title, chip }: Props) {
  const podcast = kind === 'podcast'
  const story = useMemo(() => {
    const span = periodSpan(data, kind, period)
    const list = top.slice(0, 10)
    const times = (n: number) => t(`${num(n)} ${n === 1 ? 'vez' : 'vezes'}`, `${num(n)} ${n === 1 ? 'play' : 'plays'}`, `${num(n)} ${n === 1 ? 'vez' : 'veces'}`)
    const rows: TopTenRow[] = list.map((r, i) => {
      const was = before?.get(r.id)
      const image: ImageRef | null =
        by === 'artists' ? artistRef(data, r.id) : by === 'albums' ? { kind: 'album', artist: r.sub, album: r.name } : (itemRef(data, r.id) ?? null)
      return {
        name: by === 'songs' ? cleanTitle(r.name) : r.name,
        sub: by === 'artists' ? longHours(r.ms) : r.sub,
        more:
          by === 'artists'
            ? playCount(r.plays)
            : by === 'songs'
              ? `${longHours(r.ms)} · ${times(r.plays)}`
              : longHours(r.ms),
        image,
        move: before ? (was === undefined ? 'new' : was - (i + 1)) : null,
      }
    })
    // "Música nova", "artista novo": só as músicas pedem o feminino.
    const female = by === 'songs' && !podcast
    const head = kicker(period.id, rows.length)
    const of = t('de', 'by', 'de')
    const label = `${head}: ${title.toLowerCase()}. ${rows.map((r, i) => `${i + 1}. ${r.name}${by === 'artists' ? '' : `, ${of} ${r.sub}`}`).join('; ')}.`
    return {
      head,
      n: rows.length,
      card: (
        <TopTenCard
          rows={rows}
          by={by}
          podcast={podcast}
          kicker={head}
          title={title}
          line={line(period.id, kind, span)}
          right={corner(period.id, span)}
          fresh={female ? t('nova', 'new', 'nueva') : t('novo', 'new', 'nuevo')}
          label={label}
        />
      ),
    }
  }, [data, kind, period, by, top, before, title, podcast])

  return (
    <StoryViewer
      stories={[{ id: 'top', title: story.head, card: story.card }]}
      label={story.head}
      fileName={() => `meu-top-${story.n}-${slug(title)}-${slug(chip)}`}
      zipName=""
      shareTitle={story.head}
    />
  )
}

/** Botão que abre o top 10 do período como story, pronto para compartilhar. */
export function TopStory(props: Props) {
  const n = Math.min(10, props.top.length)
  return (
    <StorySheet
      label={t(`Story: meu top ${n}`, `Story: my top ${n}`, `Historia: mi top ${n}`)}
      action={t(`Compartilhar o top ${n}`, `Share the top ${n}`, `Compartir el top ${n}`)}
    >
      <Story {...props} />
    </StorySheet>
  )
}
