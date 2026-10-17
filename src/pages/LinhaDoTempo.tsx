import { useMemo, useRef, useState, type MouseEvent } from 'react'
import { flushSync } from 'react-dom'
import type { Dataset } from '../data/types'
import type { KindFilter } from '../data/stats'
import { albums, type PeriodId, type TopBy } from '../data/tops'
import { periodsView, previousRanksView, timelineView, topView, TOP_MAX } from '../data/views'
import type { ImageRef } from '../data/images'
import { Chart, type ChartOption } from '../ui/Chart'
import { chartColors, type ThemeName } from '../ui/theme'
import { cleanTitle, date, hours, monthLabel, num, playCount } from '../ui/format'
import { BarList } from '../ui/parts'
import { More, Section } from '../ui/blocks'
import { Art } from '../ui/Thumb'
import { PlayButton } from '../ui/player'
import { artistHref, songHref } from '../ui/links'
import { trackOf } from '../ui/playerStore'
import { reducedMotion } from '../ui/motion'
import { artistRef, itemRef } from '../data/refs'
import { Search } from '../ui/Search'
import { TopStory } from '../ui/TopStory'
import { t as tr } from '../i18n'

interface Props {
  data: Dataset
  kind: KindFilter
  theme: ThemeName
}

const WHO = {
  all: () => ({
    one: tr('artista ou podcast', 'artist or podcast', 'artista o podcast'),
    many: tr('artistas e podcasts', 'artists and podcasts', 'artistas y podcasts'),
  }),
  music: () => ({ one: tr('artista', 'artist', 'artista'), many: tr('artistas', 'artists', 'artistas') }),
  podcast: () => ({ one: 'podcast', many: 'podcasts' }),
}

/** "artista novo" ou "artistas novos", conforme a quantidade. */
const fresh = (who: { one: string; many: string }, n: number) =>
  n === 1
    ? tr(`${who.one} novo`, `new ${who.one}`, `${who.one} nuevo`)
    : tr(`${who.many} novos`, `new ${who.many}`, `${who.many} nuevos`)

const periodLabel = (id: PeriodId) =>
  typeof id === 'number'
    ? String(id)
    : id === 'mes'
      ? tr('1 mês', '1 month', '1 mes')
      : id === 'semestre'
        ? tr('6 meses', '6 months', '6 meses')
        : id === 'ano'
          ? tr('1 ano', '1 year', '1 año')
          : tr('Desde sempre', 'All time', 'Desde siempre')

const byLabel = (by: TopBy, podcast: boolean) =>
  by === 'songs'
    ? podcast
      ? tr('Episódios', 'Episodes', 'Episodios')
      : tr('Músicas', 'Songs', 'Canciones')
    : by === 'artists'
      ? podcast
        ? 'Podcasts'
        : tr('Artistas', 'Artists', 'Artistas')
      : tr('Álbuns', 'Albums', 'Álbumes')

/** Duas linhas de cinco; cada "Ver mais" abre o próximo: top 50, 100 e 200. */
const STEPS = [10, 50, 100, TOP_MAX]

const Arrow = ({ up }: { up: boolean }) => (
  <svg viewBox="0 0 8 6" aria-hidden="true">
    <path d={up ? 'M4 0 8 6H0Z' : 'M4 6 0 0h8Z'} />
  </svg>
)

/** Subiu, caiu ou entrou no top, em relação ao período anterior (sem mudança, nada). */
function Move({ rank, before, female }: { rank: number; before: number | undefined; female: boolean }) {
  if (before === undefined)
    return <span className="move new">{female ? tr('nova', 'new', 'nueva') : tr('novo', 'new', 'nuevo')}</span>
  const d = before - rank
  if (d === 0) return null
  return (
    <span className={`move ${d > 0 ? 'up' : 'down'}`}>
      <Arrow up={d > 0} />
      <span className="sr-only">{d > 0 ? tr('subiu', 'up', 'subió') : tr('caiu', 'down', 'bajó')} </span>
      {Math.abs(d)}
    </span>
  )
}

/** O que a seta diz, para a dica do mouse. */
function moveText(rank: number, before: number | undefined, female: boolean) {
  if (before === undefined)
    return female
      ? tr('nova no top', 'new in the chart', 'nueva en el top')
      : tr('novo no top', 'new in the chart', 'nuevo en el top')
  const d = before - rank
  if (d === 0) return tr('mesma posição', 'same position', 'misma posición')
  const n = Math.abs(d)
  return d > 0
    ? tr(`subiu ${n} ${n === 1 ? 'posição' : 'posições'}`, `up ${n}`, `subió ${n} ${n === 1 ? 'puesto' : 'puestos'}`)
    : tr(`caiu ${n} ${n === 1 ? 'posição' : 'posições'}`, `down ${n}`, `bajó ${n} ${n === 1 ? 'puesto' : 'puestos'}`)
}

/** O seu top de um período (mês, semestre, ano, cada ano ou desde sempre): músicas, artistas ou álbuns. */
function Tops({ data, kind }: { data: Dataset; kind: KindFilter }) {
  const list = useMemo(() => periodsView(data, kind), [data, kind])
  const [periodId, setPeriodId] = useState<PeriodId | null>(null)
  const period = list.find((p) => p.id === periodId) ?? list[0]
  const podcast = kind === 'podcast'
  // O histórico básico não traz o álbum; podcast também não tem.
  const kinds: TopBy[] = !podcast && albums(data).list.length > 0 ? ['songs', 'artists', 'albums'] : ['songs', 'artists']
  const [chosen, setBy] = useState<TopBy>('songs')
  const by = kinds.includes(chosen) ? chosen : 'songs'
  // Cada lista abre com 10: outro período, outro tipo ou outra aba fecha o "Ver mais".
  const view = `${kind}|${by}|${period?.id}`
  const [open, setOpen] = useState({ view, step: 0 })
  const step = open.view === view ? open.step : 0
  const grid = useRef<HTMLOListElement>(null)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const lessBtn = useRef<HTMLButtonElement>(null)
  const top = useMemo(() => (period ? topView(data, kind, period, by, TOP_MAX) : []), [data, kind, period, by])
  // Quem subiu ou caiu desde o período anterior (o mês, o semestre, o ano ou o ano de antes).
  const before = useMemo(() => (period ? previousRanksView(data, kind, period, by, TOP_MAX) : null), [data, kind, period, by])
  const shown = top.slice(0, STEPS[step])
  const album = by === 'albums' ? albums(data).list : null
  // "Música nova", "artista novo": só as músicas (no português e no espanhol) pedem o feminino.
  const female = by === 'songs' && !podcast

  // O botão clicado pode sumir (no top 200 não há mais o que ver; fechando, não há o que fechar):
  // o foco passa para o outro, sem rolar a página.
  const go = (e: MouseEvent<HTMLButtonElement>, next: number) => {
    const focused = document.activeElement === e.currentTarget
    flushSync(() => setOpen({ view, step: next }))
    const target = next > step ? (moreBtn.current ? null : lessBtn.current) : moreBtn.current
    if (focused) target?.focus({ preventScroll: true })
  }
  const less = (e: MouseEvent<HTMLButtonElement>) => {
    // Fechando lá embaixo: volta para o começo da grade antes que ela encolha.
    const r = grid.current?.getBoundingClientRect()
    if (r && r.top < 0) window.scrollTo({ top: window.scrollY + r.top - 112, behavior: reducedMotion() ? 'auto' : 'smooth' })
    go(e, 0)
  }

  return (
    <Section title={shown.length ? tr(`Seu top ${shown.length}`, `Your top ${shown.length}`, `Tu top ${shown.length}`) : tr('Seu top', 'Your top', 'Tu top')}>
      <div className="top-pick">
        <div className="chips" role="group" aria-label={tr('Período', 'Period', 'Período')}>
          {list.map((p) => (
            <button key={p.id} className={p === period ? 'on' : ''} aria-pressed={p === period} onClick={() => setPeriodId(p.id)}>
              {periodLabel(p.id)}
            </button>
          ))}
        </div>
        <div className="top-kinds">
          <div className="segmented" role="group" aria-label={tr('Mostrar', 'Show', 'Mostrar')}>
            {kinds.map((k) => (
              <button key={k} className={k === by ? 'on' : ''} aria-pressed={k === by} onClick={() => setBy(k)}>
                {byLabel(k, podcast)}
              </button>
            ))}
          </div>
          {period && top.length > 0 && (
            <TopStory data={data} kind={kind} period={period} by={by} top={top} before={before} title={byLabel(by, podcast)} chip={periodLabel(period.id)} />
          )}
        </div>
      </div>
      {shown.length === 0 ? (
        <p className="empty-note">{tr('Nada por aqui nesse período.', 'Nothing here for this period.', 'Nada por aquí en este periodo.')}</p>
      ) : (
        <ol ref={grid} key={`${by}-${period?.id}`} className="wall tops">
          {shown.map((r, i) => {
            const song = by === 'songs'
            const name = song ? cleanTitle(r.name) : r.name
            const creator = by === 'artists' ? r.id : album ? album[r.id].creator : data.items[r.id].creator
            const image: ImageRef | undefined =
              by === 'artists' ? artistRef(data, r.id) : album ? { kind: 'album', artist: r.sub, album: r.name } : itemRef(data, r.id)
            const was = before?.get(r.id)
            const tip = `${name}${r.sub ? `, ${tr('de', 'by', 'de')} ${r.sub}` : ''}: ${hours(r.ms)}, ${playCount(r.plays)}`
            return (
              <li key={r.id} title={before ? `${tip} (${moveText(i + 1, was, female)})` : tip}>
                <div className="wall-art">
                  <Art image={image} label={name} round={false} />
                  <span className="badge">
                    {i + 1}
                    {before && <Move rank={i + 1} before={was} female={female} />}
                  </span>
                  {song && <PlayButton track={trackOf(data, r.id)} className="play-over" />}
                </div>
                <a className="wall-name" href={song ? songHref(r.id) : artistHref(creator)}>
                  {name}
                </a>
                <span className="wall-value">{r.sub || hours(r.ms)}</span>
              </li>
            )
          })}
        </ol>
      )}
      {top.length > STEPS[0] && (
        <div className="more">
          {step > 0 && (
            <button ref={lessBtn} className="ghost" onClick={less}>
              {tr('Ver menos', 'Show less', 'Ver menos')}
            </button>
          )}
          {top.length > shown.length && (
            <button ref={moreBtn} className="ghost" onClick={(e) => go(e, step + 1)}>
              {tr('Ver mais', 'Show more', 'Ver más')}
            </button>
          )}
        </div>
      )}
    </Section>
  )
}

export function LinhaDoTempo({ data, kind, theme }: Props) {
  const t = useMemo(() => timelineView(data, kind), [data, kind])
  const c = chartColors(theme, 'amber')
  const who = useMemo(() => WHO[kind](), [kind])

  const newOption = useMemo<ChartOption>(
    () => ({
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        backgroundColor: c.surface,
        borderColor: c.axis,
        textStyle: { color: c.ink },
        formatter: (p: { name: string; value: number }[]) =>
          `${monthLabel(p[0].name)}<br/><b>${num(p[0].value)}</b> ${fresh(who, p[0].value)}`,
      },
      xAxis: {
        type: 'category',
        data: t.newPerMonth.map((m) => m.month),
        axisLine: { lineStyle: { color: c.axis } },
        axisTick: { show: false },
        axisLabel: {
          color: c.muted,
          hideOverlap: true,
          interval: (_: number, v: string) => v.endsWith('-01'),
          formatter: (v: string) => v.slice(0, 4),
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: c.grid } },
        axisLabel: { color: c.muted },
      },
      series: [
        {
          type: 'bar',
          data: t.newPerMonth.map((m) => m.count),
          itemStyle: { color: c.accent, borderRadius: [2, 2, 0, 0] },
          barCategoryGap: '20%',
        },
      ],
    }),
    [t, c, who],
  )

  if (t.years.length === 0) return <p className="empty">{tr('Nada por aqui.', 'Nothing here.', 'Nada por aquí.')}</p>

  // Quem foi nº 1 em mais anos.
  const champions = new Map<number, number>()
  for (const y of t.years) if (y.top !== null) champions.set(y.top, (champions.get(y.top) ?? 0) + 1)
  const [champId, champYears] = [...champions.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0]
  const discovered = t.discoveries.reduce((a, d) => a + d.count, 0)
  const maxPeak = t.phases[0]?.peakMs ?? 1
  const maxSongPeak = t.songPhases[0]?.peakPlays ?? 1

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">
          {tr(
            `${t.years[0].year} a ${t.years[t.years.length - 1].year}`,
            `${t.years[0].year} to ${t.years[t.years.length - 1].year}`,
            `${t.years[0].year} a ${t.years[t.years.length - 1].year}`,
          )}
        </p>
        <h1>
          {tr('Sua história em', 'Your story in', 'Tu historia en')}{' '}
          <span className="accent">
            {t.years.length}{' '}
            {tr('anos', t.years.length === 1 ? 'year' : 'years', t.years.length === 1 ? 'año' : 'años')}
          </span>
        </h1>
        <p className="sub">
          {tr('Você conheceu', 'You discovered', 'Descubriste')} {num(discovered)} {who.many}.
          {champId !== null && (
            <>
              {' '}
              <a href={artistHref(champId)}>{data.creators[champId]}</a>{' '}
              {tr('foi o nº 1 em', 'was #1 for', 'fue el n.º 1 en')} {champYears}{' '}
              {champYears === 1 ? tr('ano', 'year', 'año') : tr('anos', 'years', 'años')}.
            </>
          )}
        </p>
      </section>

      <Search
        data={data}
        timeline={t}
        label={
          kind === 'podcast'
            ? tr(`Buscar ${who.one} ou episódio`, `Search ${who.one} or episode`, `Buscar ${who.one} o episodio`)
            : tr(`Buscar ${who.one} ou música`, `Search ${who.one} or song`, `Buscar ${who.one} o canción`)
        }
        placeholder={
          kind === 'podcast'
            ? tr('Ex.: Flow Podcast', 'e.g. Flow Podcast', 'Ej.: Flow Podcast')
            : tr('Ex.: Arctic Monkeys', 'e.g. Arctic Monkeys', 'Ej.: Arctic Monkeys')
        }
      />

      <Tops data={data} kind={kind} />

      <Section title={tr('Quem chegou para ficar', 'Here to stay', 'Llegaron para quedarse')}>
        <div className="scroll-x">
          <ol className="finds">
            {t.discoveries.map((d) => (
              <li key={d.year}>
                <span className="find-year">{d.year}</span>
                {d.best ? (
                  <a href={artistHref(d.best.id)} className="find-card">
                    <Art image={artistRef(data, d.best.id)} label={d.best.name} size={88} />
                    <strong>{d.best.name}</strong>
                    <small>
                      {tr('desde', 'since', 'desde')} {date(d.best.first)}
                    </small>
                    <span>
                      {hours(d.best.ms)} {tr('até hoje', 'so far', 'hasta hoy')}
                    </span>
                  </a>
                ) : (
                  <span className="find-card" />
                )}
                <small className="find-count">
                  {num(d.count)} {fresh(who, d.count)}
                </small>
              </li>
            ))}
          </ol>
        </div>
      </Section>

      <More>
        <Section
          title={tr(
            `${who.many[0].toUpperCase() + who.many.slice(1)} novos a cada mês`,
            `New ${who.many} each month`,
            `${who.many[0].toUpperCase() + who.many.slice(1)} nuevos cada mes`,
          )}
        >
          <div className="card">
            <Chart
              option={newOption}
              height={240}
              label={tr(`${who.many} novos por mês`, `New ${who.many} per month`, `${who.many} nuevos por mes`)}
            />
          </div>
        </Section>

        {(t.phases.length > 0 || t.songPhases.length > 0) && (
          <Section title={tr('Fases e obsessões', 'Phases and obsessions', 'Fases y obsesiones')}>
            <div className="two">
              {t.phases.length > 0 && (
                <BarList
                  title={kind === 'podcast' ? 'Podcasts' : tr('Artistas', 'Artists', 'Artistas')}
                  rows={t.phases.map((p) => ({
                    key: p.id,
                    name: p.name,
                    href: artistHref(p.id),
                    image: artistRef(data, p.id),
                    sub: monthLabel(p.month),
                    value: hours(p.peakMs),
                    share: p.peakMs / maxPeak,
                    title: `${p.name}: ${hours(p.peakMs)} ${tr('em', 'in', 'en')} ${monthLabel(p.month)}`,
                  }))}
                />
              )}
              {t.songPhases.length > 0 && (
                <BarList
                  title={tr('Músicas', 'Songs', 'Canciones')}
                  rows={t.songPhases.map((p) => {
                    const it = data.items[p.id]
                    const name = cleanTitle(it.name)
                    return {
                      key: p.id,
                      name,
                      href: songHref(p.id),
                      image: itemRef(data, p.id),
                      track: trackOf(data, p.id),
                      sub: `${data.creators[it.creator]} · ${monthLabel(p.month)}`,
                      value: `${num(p.peakPlays)} ${tr('de', 'of', 'de')} ${num(p.totalPlays)}`,
                      share: p.peakPlays / maxSongPeak,
                      title: tr(
                        `${name}: ${num(p.peakPlays)} das ${num(p.totalPlays)} vezes foram em ${monthLabel(p.month)}`,
                        `${name}: ${num(p.peakPlays)} of ${num(p.totalPlays)} plays were in ${monthLabel(p.month)}`,
                        `${name}: ${num(p.peakPlays)} de las ${num(p.totalPlays)} veces fueron en ${monthLabel(p.month)}`,
                      ),
                    }
                  })}
                />
              )}
            </div>
          </Section>
        )}
      </More>
    </main>
  )
}
