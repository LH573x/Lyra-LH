import { useMemo, useState } from 'react'
import type { Dataset } from '../data/types'
import type { Filter } from '../data/stats'
import { dayParts, habits } from '../data/habits'
import { Chart, type ChartOption } from '../ui/Chart'
import { chartColors, type ThemeName } from '../ui/theme'
import { dayMonth, dayTitle, hours, keyToMs, monthLabel, num, pct, platformLabel, shortDate, weekdayName } from '../ui/format'
import { BarList } from '../ui/parts'
import { More, Section, StatStrip } from '../ui/blocks'
import { years } from '../data/stats'
import { Comparar, Esquecidas, Recordes } from './CuriosidadesExtras'
import { Curtidas, Playlists } from './Colecao'
import { itemRef } from '../data/refs'
import { songHref } from '../ui/links'
import { trackOf } from '../ui/playerStore'
import { onThisDay } from '../data/onThisDay'
import { Memories } from '../ui/Memories'
import { DayStory } from '../ui/DayStory'
import { useMedia } from '../ui/useMedia'
import { locale, t } from '../i18n'

interface Props {
  data: Dataset
  filter: Filter
  theme: ThemeName
  lastYear: number
}

const WEEKDAYS = () =>
  t('seg,ter,qua,qui,sex,sáb,dom', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', 'lun,mar,mié,jue,vie,sáb,dom').split(',')
const MONTHS = () => Array.from({ length: 12 }, (_, i) => monthLabel(`2000-${i + 1}`, false))
/** Hora cheia: "21h"; em inglês, "21:00". */
const hh = (n: number) => t(`${n}h`, `${n}:00`, `${n}h`)

/** "2024-03-07" → "qui, 7 de mar. de 2024" (sem fuso: a data já é local). */
function dayLabel(key: string, withWeekday = true): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(locale(), {
    weekday: withWeekday ? 'short' : undefined,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function Curiosidades({ data, filter, theme, lastYear }: Props) {
  const h = useMemo(() => habits(data, filter, lastYear), [data, filter, lastYear])
  // "Seu 4 de outubro" só com todos os anos (com um ano escolhido, não faz sentido).
  // A data é a de quando a página abriu.
  const [now] = useState(() => new Date())
  const memories = useMemo(() => (filter.year === null ? onThisDay(data, filter.kind, now) : []), [data, filter, now])
  const today = dayTitle(now)
  const yearList = useMemo(() => years(data), [data])
  const c = chartColors(theme, 'coral')
  const narrow = useMedia('(max-width: 719.98px)')

  const calendarOption = useMemo<ChartOption>(
    () => ({
      tooltip: {
        backgroundColor: c.surface,
        borderColor: c.axis,
        textStyle: { color: c.ink },
        formatter: (p: { value: [string, number] }) => `${dayLabel(p.value[0])}<br/><b>${hours(p.value[1] * 3.6e6)}</b>`,
      },
      visualMap: {
        type: 'piecewise',
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 12,
        itemHeight: 12,
        itemGap: 14,
        textStyle: { color: c.ink2 },
        pieces: [
          { min: 0, max: 0.5, label: t('até 30 min', 'up to 30 min', 'hasta 30 min') },
          { min: 0.5, max: 1, label: t('30 min a 1 h', '30 min–1 h', '30 min a 1 h') },
          { min: 1, max: 2, label: t('1 a 2 h', '1–2 h', '1 a 2 h') },
          { min: 2, max: 4, label: t('2 a 4 h', '2–4 h', '2 a 4 h') },
          { min: 4, label: t('4 h ou mais', '4 h or more', '4 h o más') },
        ],
        inRange: { color: c.ramp.slice(1) },
      },
      calendar: {
        range: String(h.calendarYear),
        top: 28,
        left: 32,
        right: 8,
        bottom: 44,
        cellSize: ['auto', 'auto'],
        splitLine: { show: false },
        itemStyle: { color: c.ramp[0], borderColor: c.surface, borderWidth: 3 },
        yearLabel: { show: false },
        dayLabel: { firstDay: 1, nameMap: t('DSTQQSS', 'SMTWTFS', 'DLMXJVS').split(''), color: c.muted, fontSize: 11 },
        monthLabel: { nameMap: MONTHS(), color: c.muted, fontSize: 11 },
      },
      series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: h.days }],
    }),
    [h, c],
  )

  const clockMax = Math.max(0.001, ...h.clock.flat())
  const clockOption = useMemo<ChartOption>(
    () => ({
      tooltip: {
        backgroundColor: c.surface,
        borderColor: c.axis,
        textStyle: { color: c.ink },
        formatter: (p: { value: [number, number, number] }) =>
          `${weekdayName(p.value[1])}, ${hh(p.value[0])}<br/><b>${hours(p.value[2] * 3.6e6)}</b> ${t('no período', 'in this period', 'en el periodo')}`,
      },
      grid: { left: 40, right: 8, top: 8, bottom: 64 },
      xAxis: {
        type: 'category',
        data: Array.from({ length: 24 }, (_, i) => hh(i)),
        axisLine: { show: false },
        axisTick: { show: false },
        splitArea: { show: false },
        axisLabel: { color: c.muted, interval: narrow ? 5 : 2, fontSize: 11 },
      },
      yAxis: {
        type: 'category',
        data: WEEKDAYS(),
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: c.muted, fontSize: 11 },
      },
      visualMap: {
        min: 0,
        max: clockMax,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemHeight: 160,
        itemWidth: 10,
        text: [t('mais', 'more', 'más'), t('menos', 'less', 'menos')],
        textStyle: { color: c.ink2 },
        calculable: false,
        inRange: { color: c.ramp },
        formatter: () => '',
      },
      series: [
        {
          type: 'heatmap',
          data: h.clock.flatMap((row, w) => row.map((v, hr) => [hr, w, Math.round(v * 10) / 10])),
          itemStyle: { borderColor: c.surface, borderWidth: 2, borderRadius: 3 },
          emphasis: { itemStyle: { borderColor: c.ink, borderWidth: 1 } },
        },
      ],
    }),
    [h, c, narrow, clockMax],
  )

  if (!h.bestDay) return <p className="empty">{t('Nada por aqui nesse período.', 'Nothing here for this period.', 'Nada por aquí en este periodo.')}</p>

  const partHours = dayParts(h.clock)
  const totalHours = partHours.reduce((a, p) => a + p.hours, 0)
  const topPart = partHours.reduce((a, b) => (b.hours > a.hours ? b : a))
  const platformTotal = h.platforms.reduce((a, p) => a + p.ms, 0)
  const maxSkips = h.topSkipped[0]?.skips ?? 1
  const stats = [
    h.streak && {
      label: t('Sequência recorde', 'Longest streak', 'Racha récord'),
      count: h.streak.days,
      format: (n: number) => `${num(n)} ${Math.round(n) === 1 ? t('dia', 'day', 'día') : t('dias', 'days', 'días')}`,
      hint: `${h.streak.from.slice(0, 4) === h.streak.to.slice(0, 4) ? dayMonth(keyToMs(h.streak.from)) : shortDate(keyToMs(h.streak.from))} – ${shortDate(keyToMs(h.streak.to))}`,
    },
    { label: t('Dia recorde', 'Top day', 'Día récord'), count: h.bestDay.ms, format: hours, hint: shortDate(keyToMs(h.bestDay.day)) },
    h.shuffleShare !== null && { label: t('No aleatório', 'On shuffle', 'En aleatorio'), count: h.shuffleShare, format: pct },
    h.skipShare !== null && { label: t('Puladas', 'Skipped', 'Saltadas'), count: h.skipShare, format: pct },
  ].filter((x) => !!x)

  return (
    <main className="page">
      <section className="hero">
        <h1>
          {t('Você é da ', `You're ${/^[aeiou]/i.test(topPart.name) ? 'an' : 'a'} `, 'Eres de ')}
          <span className="accent">{topPart.name.toLowerCase()}</span>
          {t('', ' person', '')}
        </h1>
        {h.peak && (
          <p className="sub">
            {t(
              `Horário nobre: ${weekdayName(h.peak.weekday)} às ${h.peak.hour}h`,
              `Prime time: ${weekdayName(h.peak.weekday)} at ${hh(h.peak.hour)}`,
              `Hora estrella: ${weekdayName(h.peak.weekday)} a ${h.peak.hour === 1 ? 'la' : 'las'} ${h.peak.hour}h`,
            )}
          </p>
        )}
        <div className="daybar" role="img" aria-label={partHours.map((p) => `${p.name}: ${pct(p.hours / totalHours)}`).join(', ')}>
          {partHours.map((p) => (
            <div key={p.name} className={p === topPart ? 'on' : ''} style={{ flexGrow: Math.max(p.hours / totalHours, 0.0001) }}>
              <strong>{pct(p.hours / totalHours)}</strong>
              <span>{p.name}</span>
              <small>{t(`${p.from}h a ${p.to}h`, `${p.from}–${p.to}h`, `${p.from}h a ${p.to}h`)}</small>
            </div>
          ))}
        </div>
      </section>

      <StatStrip items={stats} />

      {memories.length > 0 && (
        <Section title={t(`Seu ${today}`, `Your ${today}`, `Tu ${today}`)}>
          <Memories data={data} list={memories} />
          <DayStory data={data} list={memories} date={today} />
        </Section>
      )}

      <Section
        title={
          filter.year
            ? t(`Seus recordes de ${filter.year}`, `Your ${filter.year} records`, `Tus récords de ${filter.year}`)
            : t('Seus recordes', 'Your records', 'Tus récords')
        }
      >
        <Recordes data={data} filter={filter} />
      </Section>

      {filter.kind !== 'podcast' && (
        <Section title={t('Músicas que você esqueceu', 'Songs you forgot', 'Canciones olvidadas')}>
          <Esquecidas data={data} filter={filter} />
        </Section>
      )}

      {data.account && filter.year === null && filter.kind !== 'podcast' && (
        <>
          {data.account.playlists.length > 0 && (
            <Section
              title={t('Suas playlists', 'Your playlists', 'Tus playlists')}
              note={t(
                'Tempo ouvindo as músicas de cada uma desde que entraram nela',
                "Time spent on each one's songs since they were added",
                'Tiempo escuchando las canciones de cada una desde que entraron',
              )}
            >
              <Playlists data={data} />
            </Section>
          )}
          {data.account.liked.length > 0 && (
            <Section title={t('Curtidas esquecidas', 'Forgotten likes', 'Favoritas olvidadas')}>
              <Curtidas data={data} />
            </Section>
          )}
        </>
      )}

      <Section title={t('Um ano contra o outro', 'Year vs year', 'Año contra año')}>
        <Comparar key={`${filter.year}-${filter.kind}`} data={data} years={yearList} filter={filter} />
      </Section>

      <More>
        <Section title={t('A que horas você dá play', 'When you hit play', 'Cuándo le das al play')}>
          <div className="card">
            <Chart
              option={clockOption}
              height={300}
              label={t(
                'Horas ouvidas por dia da semana e hora do dia',
                'Hours listened by weekday and hour',
                'Horas escuchadas por día de la semana y hora',
              )}
            />
          </div>
        </Section>

        <Section title={t(`Seu ${h.calendarYear}, dia por dia`, `Your ${h.calendarYear}, day by day`, `Tu ${h.calendarYear}, día a día`)}>
          <div className="card">
            <div className="scroll-x">
              <div style={{ minWidth: 720 }}>
                <Chart
                  option={calendarOption}
                  height={200}
                  label={t(
                    `Calendário de escuta de ${h.calendarYear}, horas por dia`,
                    `${h.calendarYear} listening calendar, hours per day`,
                    `Calendario de escucha de ${h.calendarYear}, horas por día`,
                  )}
                />
              </div>
            </div>
          </div>
        </Section>

        <div className="two">
          {h.platforms.length > 0 && (
            <Section title={t('Onde você ouve', 'Where you listen', 'Dónde escuchas')}>
              <ul className="card shares">
                {h.platforms.map((p) => (
                  <li key={p.name} title={`${platformLabel(p.name)}: ${hours(p.ms)}`}>
                    <strong>{pct(p.ms / platformTotal)}</strong>
                    <span>{platformLabel(p.name)}</span>
                    <i>
                      <b style={{ width: `${(p.ms / platformTotal) * 100}%` }} />
                    </i>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          {h.topSkipped.length > 0 && (
            <Section title={t('O que você mais pula', 'What you skip most', 'Lo que más saltas')}>
              <BarList
                rows={h.topSkipped.map((s) => ({
                  key: s.id,
                  name: s.name,
                  image: itemRef(data, s.id),
                  href: songHref(s.id),
                  track: trackOf(data, s.id),
                  value: t(`${num(s.skips)} de ${num(s.starts)}`, `${num(s.skips)} of ${num(s.starts)}`, `${num(s.skips)} de ${num(s.starts)}`),
                  share: s.skips / maxSkips,
                  title: t(
                    `${s.name}: pulada ${num(s.skips)} de ${num(s.starts)} vezes (${pct(s.skips / s.starts)})`,
                    `${s.name}: skipped ${num(s.skips)} of ${num(s.starts)} times (${pct(s.skips / s.starts)})`,
                    `${s.name}: saltada ${num(s.skips)} de ${num(s.starts)} veces (${pct(s.skips / s.starts)})`,
                  ),
                }))}
              />
            </Section>
          )}
        </div>
      </More>
    </main>
  )
}
