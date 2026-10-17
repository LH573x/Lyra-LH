import { useMemo } from 'react'
import type { Dataset } from '../data/types'
import type { Filter, Ranked } from '../data/stats'
import { summaryView, yearTopsView } from '../data/views'
import { CoverWall, Podium, Section, StatStrip, type RankItem } from '../ui/blocks'
import { TocaDiscos } from '../ui/TocaDiscos'
import { artistHref, songHref } from '../ui/links'
import { trackOf } from '../ui/playerStore'
import { artistRef, itemRef } from '../data/refs'
import { Chart, type ChartOption } from '../ui/Chart'
import { chartColors, type ThemeName } from '../ui/theme'
import { cleanTitle, hours, monthLabel, num } from '../ui/format'
import { CountUp } from '../ui/CountUp'
import { t } from '../i18n'

interface Props {
  data: Dataset
  filter: Filter
  theme: ThemeName
  onYear: (year: number | null) => void
}

const NOUNS = () => ({
  all: {
    creators: t('Artistas e programas', 'Artists and shows', 'Artistas y programas'),
    items: t('Músicas e episódios', 'Songs and episodes', 'Canciones y episodios'),
    topC: t('Os artistas e podcasts que mais tocaram', 'Top artists and podcasts', 'Los artistas y podcasts que más sonaron'),
    topI: t('As músicas e episódios que mais tocaram', 'Top songs and episodes', 'Las canciones y episodios que más sonaron'),
  },
  music: {
    creators: t('Artistas', 'Artists', 'Artistas'),
    items: t('Músicas', 'Songs', 'Canciones'),
    topC: t('Os artistas que mais tocaram', 'Top artists', 'Los artistas que más sonaron'),
    topI: t('As músicas que mais tocaram', 'Top songs', 'Las canciones que más sonaron'),
  },
  podcast: {
    creators: t('Programas', 'Shows', 'Programas'),
    items: t('Episódios', 'Episodes', 'Episodios'),
    topC: t('Os podcasts que mais tocaram', 'Top podcasts', 'Los podcasts que más sonaron'),
    topI: t('Os episódios que mais tocaram', 'Top episodes', 'Los episodios que más sonaron'),
  },
})

export function Resumo({ data, filter, theme, onYear }: Props) {
  const s = useMemo(() => summaryView(data, filter), [data, filter])
  const discs = useMemo(() => yearTopsView(data, filter.kind), [data, filter.kind])
  const c = chartColors(theme, 'green')
  const nouns = NOUNS()[filter.kind]

  const monthlyOption = useMemo<ChartOption>(() => {
    const single = filter.year !== null
    return {
      grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: single ? 'shadow' : 'line', lineStyle: { color: c.muted } },
        backgroundColor: c.surface,
        borderColor: c.axis,
        textStyle: { color: c.ink },
        formatter: (p: { name: string; value: number }[]) =>
          `${monthLabel(p[0].name)}<br/><b>${num(p[0].value)} h</b>`,
      },
      xAxis: {
        type: 'category',
        data: s.monthly.map((m) => m.month),
        axisLine: { lineStyle: { color: c.axis } },
        axisTick: { show: false },
        axisLabel: {
          color: c.muted,
          hideOverlap: true,
          interval: single ? 0 : (_: number, v: string) => v.endsWith('-01'),
          formatter: (v: string) => (single ? monthLabel(v, false) : v.slice(0, 4)),
        },
      },
      yAxis: {
        type: 'value',
        splitLine: { lineStyle: { color: c.grid } },
        axisLabel: { color: c.muted, formatter: (v: number) => `${v} h` },
      },
      series: [
        single
          ? {
              type: 'bar',
              data: s.monthly.map((m) => Math.round(m.hours * 10) / 10),
              itemStyle: { color: c.accent, borderRadius: [4, 4, 0, 0] },
              barMaxWidth: 36,
            }
          : {
              type: 'line',
              data: s.monthly.map((m) => Math.round(m.hours * 10) / 10),
              showSymbol: false,
              smooth: 0.2,
              lineStyle: { color: c.accent, width: 2 },
              itemStyle: { color: c.accent },
              areaStyle: { color: c.accent, opacity: 0.15 },
            },
      ],
    }
  }, [s, c, filter.year])

  const deck = <TocaDiscos years={discs} year={filter.year} onPick={onYear} />

  if (s.totalMs === 0) {
    return (
      <main className="page">
        <section className="hero hero-deck">
          {deck}
          <div className="hero-text">
            <p className="empty">{t('Nada por aqui nesse período.', 'Nothing here for this period.', 'Nada por aquí en este periodo.')}</p>
          </div>
        </section>
      </main>
    )
  }

  const totalHours = s.totalMs / 3.6e6
  const daysNonStop = s.totalMs / 8.64e7
  const delta = s.previousYearMs ? (s.totalMs - s.previousYearMs) / s.previousYearMs : null
  const best = s.monthly.reduce((a, b) => (b.hours > a.hours ? b : a), s.monthly[0])
  const creators: RankItem[] = s.topCreators.map((r) => ({
    ...toItem(r),
    href: artistHref(r.id),
    image: artistRef(data, r.id),
  }))
  const items: RankItem[] = s.topItems.map((r) => ({
    ...toItem(r),
    name: cleanTitle(r.name),
    href: songHref(r.id),
    image: itemRef(data, r.id),
    track: trackOf(data, r.id),
  }))

  return (
    <main className="page">
      <section className="hero hero-deck">
        {deck}
        <div className="hero-text">
          <h1>
            {t('Você ouviu', 'You listened to', 'Escuchaste')}{' '}
            <span className="accent">
              <CountUp value={totalHours} /> {t('horas', 'hours', 'horas')}
            </span>
          </h1>
          <p className="sub">
            {Math.round(daysNonStop) === 1
              ? t(`${num(daysNonStop)} dia sem parar`, `${num(daysNonStop)} day non-stop`, `${num(daysNonStop)} día sin parar`)
              : t(`${num(daysNonStop)} dias sem parar`, `${num(daysNonStop)} days non-stop`, `${num(daysNonStop)} días sin parar`)}
            {delta !== null &&
              (delta >= 0
                ? t(
                    ` · ${num(delta * 100)}% a mais que ${filter.year! - 1}`,
                    ` · ${num(delta * 100)}% more than ${filter.year! - 1}`,
                    ` · ${num(delta * 100)}% más que ${filter.year! - 1}`,
                  )
                : t(
                    ` · ${num(-delta * 100)}% a menos que ${filter.year! - 1}`,
                    ` · ${num(-delta * 100)}% less than ${filter.year! - 1}`,
                    ` · ${num(-delta * 100)}% menos que ${filter.year! - 1}`,
                  ))}
          </p>
        </div>
      </section>

      <StatStrip
        items={[
          { label: t('Reproduções', 'Plays', 'Reproducciones'), count: s.plays },
          { label: nouns.creators, count: s.creators },
          { label: nouns.items, count: s.items },
          { label: t('Dias ouvindo', 'Days listening', 'Días escuchando'), count: s.activeDays },
        ]}
      />

      <Section title={nouns.topC}>
        <Podium items={creators} />
      </Section>

      <Section title={nouns.topI}>
        <CoverWall items={items} />
      </Section>

      <Section title={t('Quando você mais ouviu', 'When you listened most', 'Cuándo más escuchaste')}>
        <div className="card chart-card">
          <p className="callout">
            <span>{t('Mês recorde', 'Top month', 'Mes récord')}</span>
            <strong>{monthLabel(best.month)}</strong>
            <span>
              {num(best.hours)} {t('horas', 'hours', 'horas')}
            </span>
          </p>
          <Chart
            option={monthlyOption}
            height={260}
            label={t(
              `Horas ouvidas por mês. Recorde em ${monthLabel(best.month)}.`,
              `Hours listened per month. Peak in ${monthLabel(best.month)}.`,
              `Horas escuchadas por mes. Récord en ${monthLabel(best.month)}.`,
            )}
          />
        </div>
      </Section>
    </main>
  )
}

function toItem(r: Ranked): RankItem {
  return {
    key: r.id,
    name: r.name,
    sub: r.sub || undefined,
    value: hours(r.ms),
    title: t(
      `${r.name}: ${hours(r.ms)}, ${num(r.plays)} reproduções`,
      `${r.name}: ${hours(r.ms)}, ${num(r.plays)} plays`,
      `${r.name}: ${hours(r.ms)}, ${num(r.plays)} reproducciones`,
    ),
  }
}
