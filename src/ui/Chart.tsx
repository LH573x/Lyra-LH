import { useEffect, useRef, useState } from 'react'
import type { EChartsCoreOption, ECharts } from 'echarts/core'
import { reducedMotion, useInView } from './motion'
import { loadCharts } from './loadCharts'

export type ChartOption = EChartsCoreOption

interface Props {
  option: ChartOption
  height: number
  label: string
}

/** Entrada suave: a linha se desenha e as barras sobem. */
const motion = (): ChartOption =>
  reducedMotion() ? { animation: false } : { animationDuration: 1000, animationEasing: 'cubicOut', animationDurationUpdate: 500 }

/**
 * Gráfico ECharts que se ajusta à largura do contêiner. Só é desenhado quando aparece
 * na tela, para a animação de entrada acontecer na frente de quem está olhando.
 */
export function Chart({ option, height, label }: Props) {
  const [el, seen] = useInView<HTMLDivElement>()
  const chart = useRef<ECharts | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!seen || !el.current) return
    let gone = false
    let c: ECharts | null = null
    let ro: ResizeObserver | null = null
    loadCharts().then(
      ({ echarts }) => {
        if (gone || !el.current) return
        c = echarts.init(el.current, undefined, { renderer: 'canvas' })
        chart.current = c
        ro = new ResizeObserver(() => c?.resize())
        ro.observe(el.current)
        setReady(true)
      },
      // Sem rede para baixar os gráficos: o espaço fica vazio, o resto da página segue.
      () => {},
    )
    return () => {
      gone = true
      ro?.disconnect()
      c?.dispose()
      chart.current = null
      setReady(false)
    }
  }, [seen, el])

  useEffect(() => {
    if (ready) chart.current?.setOption({ ...motion(), ...option }, { notMerge: true })
  }, [option, ready])

  return <div ref={el} role="img" aria-label={label} style={{ width: '100%', height }} />
}
