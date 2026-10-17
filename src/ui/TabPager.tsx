import { startTransition, useDeferredValue, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { haptic } from './haptic'

/** Partes da página que já usam o dedo para os lados (stories, janelas, linhas do Explorar): ali o arrastar não troca de aba. */
const OWN_GESTURE = 'canvas, input, textarea, select, dialog, .wstage, .ex-swipe, [data-noswipe]'

function scrollsSideways(el: Element | null, stop: Element): boolean {
  for (; el && el !== stop; el = el.parentElement) {
    if (el.scrollWidth > el.clientWidth + 2) {
      const o = getComputedStyle(el).overflowX
      if (o === 'auto' || o === 'scroll') return true
    }
  }
  return false
}

const touchScreen = () => typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

interface Tab {
  id: string
  tone: string
}

interface Drag {
  x: number
  y: number
  scroll: number
  side: boolean | null
  dx: number
  lastX: number
  lastT: number
  speed: number
}

/**
 * As vizinhas escondidas se atualizam depois da aba que está na tela (um filtro trocado
 * aparece na hora, e elas acompanham em seguida, sem segurar o toque).
 */
function Later({ now, children }: { now: boolean; children: ReactNode }) {
  const later = useDeferredValue(children)
  return now ? children : later
}

/**
 * As abas lado a lado, como no Instagram: arrastar o dedo para os lados leva a página atual junto
 * e traz a vizinha, que já fica montada (escondida) para aparecer sem esperar.
 */
export function TabPager({
  tabs,
  current,
  render,
  footer,
  onChange,
}: {
  tabs: readonly Tab[]
  current: number
  render: (id: string) => ReactNode
  footer: ReactNode
  onChange: (id: string) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  // As abas vizinhas que já podem ficar montadas. No celular elas montam logo depois que a aba abre,
  // com o navegador folgado; no computador (sem arrastar) só se um dedo pedir.
  const [warm, setWarm] = useState<ReadonlySet<string>>(() => new Set())
  const warmRef = useRef(warm)
  useEffect(() => {
    warmRef.current = warm
  })
  const busy = useRef(false)
  // O dedo pode estar no meio do gesto quando o App redesenha: os ouvintes leem sempre o valor atual.
  const live = useRef({ tabs, current, onChange })
  useEffect(() => {
    live.current = { tabs, current, onChange }
  })

  useEffect(() => {
    if (!touchScreen()) return
    // A aba atual entra junto: ao trocar, a que sai continua montada como vizinha.
    const ids = [tabs[current - 1]?.id, tabs[current]?.id, tabs[current + 1]?.id].filter((id): id is string => !!id)
    const timer = setTimeout(() => startTransition(() => setWarm(new Set(ids))), 700)
    return () => clearTimeout(timer)
  }, [current, tabs])

  // Depois de trocar de aba, as páginas voltam ao lugar normal antes de aparecer na tela.
  useLayoutEffect(() => {
    const el = root.current
    if (!el) return
    for (const s of el.querySelectorAll<HTMLElement>('.slot')) {
      s.style.transition = ''
      s.style.transform = ''
    }
    delete el.dataset.drag
    busy.current = false
  }, [current])

  useEffect(() => {
    const el = root.current
    if (!el) return
    const near = () => {
      const { tabs, current } = live.current
      return { prevTab: tabs[current - 1], nextTab: tabs[current + 1] }
    }
    let drag: Drag | null = null
    let frame = 0

    const slot = (role: 'cur' | 'prev' | 'next') => el.querySelector<HTMLElement>(`:scope > .slot.${role}`)
    // dx: quanto a página atual andou com o dedo; ms: animação até lá (0 = segue o dedo, sem atraso).
    const place = (dx: number, ms = 0) => {
      const w = window.innerWidth
      const parts: [HTMLElement | null, number][] = [
        [slot('cur'), 0],
        [slot('prev'), -w],
        [slot('next'), w],
      ]
      for (const [s, base] of parts) {
        if (!s) continue
        s.style.transition = ms ? `transform ${ms}ms cubic-bezier(0.2, 0.8, 0.2, 1)` : 'none'
        s.style.transform = `translate3d(${base + dx}px, 0, 0)`
      }
    }
    const settle = () => {
      for (const s of el.querySelectorAll<HTMLElement>('.slot')) {
        s.style.transition = ''
        s.style.transform = ''
      }
      delete el.dataset.drag
      busy.current = false
    }

    const down = (e: TouchEvent) => {
      drag = null
      if (busy.current || e.touches.length !== 1) return
      const tch = e.touches[0]
      const target = e.target instanceof Element ? e.target : null
      const cur = target?.closest('.slot.cur')
      // Perto da borda fica para o gesto de voltar do navegador.
      if (!cur || tch.clientX < 24 || tch.clientX > window.innerWidth - 24) return
      if (target!.closest(OWN_GESTURE) || scrollsSideways(target, cur)) return
      drag = { x: tch.clientX, y: tch.clientY, scroll: window.scrollY, side: null, dx: 0, lastX: tch.clientX, lastT: e.timeStamp, speed: 0 }
    }

    const move = (e: TouchEvent) => {
      const d = drag
      if (!d) return
      const tch = e.touches[0]
      const mx = tch.clientX - d.x
      const my = tch.clientY - d.y
      if (d.side === null) {
        if (Math.abs(mx) < 10 && Math.abs(my) < 10) return
        // Mais de lado do que para baixo: é troca de aba. Senão é a página rolando.
        d.side = Math.abs(mx) > Math.abs(my) * 1.2
        if (!d.side) {
          drag = null
          return
        }
        const { prevTab, nextTab } = near()
        const want = (mx < 0 ? nextTab : prevTab)?.id
        if (want && !warmRef.current.has(want)) startTransition(() => setWarm((w) => new Set([...w, want])))
        // A posição do topo da página, para a vizinha aparecer na mesma altura em que vai ficar.
        el.style.setProperty('--slot-top', `${Math.round(el.getBoundingClientRect().top + window.scrollY)}px`)
        el.dataset.drag = ''
      }
      // O navegador começou a rolar a página: desiste da troca.
      if (Math.abs(window.scrollY - d.scroll) > 4) {
        drag = null
        back()
        return
      }
      // Sem aba daquele lado, a página só cede um pouco, como uma mola.
      const { prevTab, nextTab } = near()
      const edge = (mx > 0 && !prevTab) || (mx < 0 && !nextTab)
      d.dx = edge ? mx / 4 : mx
      const dt = e.timeStamp - d.lastT
      // Velocidade suavizada (px/ms), para um toque tremido não virar um peteleco.
      if (dt > 0) d.speed = 0.6 * ((tch.clientX - d.lastX) / dt) + 0.4 * d.speed
      d.lastX = tch.clientX
      d.lastT = e.timeStamp
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => place(d.dx))
    }

    const up = () => {
      const d = drag
      drag = null
      if (!d?.side) return
      cancelAnimationFrame(frame)
      const w = window.innerWidth
      const { prevTab, nextTab } = near()
      const to = d.dx < 0 ? nextTab : prevTab
      // Passou de um terço da tela, ou foi um "peteleco" rápido para o mesmo lado: troca.
      const flick = Math.abs(d.speed) > 0.4 && Math.sign(d.speed) === Math.sign(d.dx) && Math.abs(d.dx) > 30
      if (to && (Math.abs(d.dx) > w / 3 || flick)) {
        busy.current = true
        place(d.dx < 0 ? -w : w, 260)
        setTimeout(() => {
          haptic()
          live.current.onChange(to.id)
        }, 260)
      } else back()
    }
    const back = () => {
      busy.current = true
      place(0, 220)
      setTimeout(settle, 220)
    }
    const cancel = () => {
      const d = drag
      drag = null
      cancelAnimationFrame(frame)
      if (d?.side) back()
    }

    document.addEventListener('touchstart', down, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', up, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', down)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', up)
      document.removeEventListener('touchcancel', cancel)
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <div ref={root} className="pager">
      {tabs.map((tab, i) => {
        const role = i === current ? 'cur' : i === current - 1 ? 'prev' : i === current + 1 ? 'next' : null
        if (!role || (role !== 'cur' && !warm.has(tab.id))) return null
        const side = role !== 'cur'
        return (
          <div key={tab.id} className={`slot ${role}`} data-tone={tab.tone} inert={side} aria-hidden={side || undefined}>
            <div className="slot-col">
              <Later now={!side}>{render(tab.id)}</Later>
              {side ? null : footer}
            </div>
          </div>
        )
      })}
    </div>
  )
}
