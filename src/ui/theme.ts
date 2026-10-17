import { useEffect, useState } from 'react'

export type ThemeName = 'dark' | 'light'

/** Cores usadas dentro dos gráficos (ECharts não lê variáveis CSS). */
export interface ChartColors {
  surface: string
  ink: string
  ink2: string
  muted: string
  grid: string
  axis: string
  accent: string
  /** Escala sequencial (baixo → alto), um só tom. */
  ramp: string[]
}

export const CHART_COLORS: Record<ThemeName, ChartColors> = {
  dark: {
    surface: '#1a1a19',
    ink: '#ffffff',
    ink2: '#c3c2b7',
    muted: '#898781',
    grid: '#2c2c2a',
    axis: '#383835',
    accent: '#2fbf71',
    ramp: ['#1f2b24', '#1d4a33', '#1c6b42', '#1f8d52', '#2fbf71', '#6ee7a0'],
  },
  light: {
    surface: '#fcfcfb',
    ink: '#0b0b0b',
    ink2: '#52514e',
    muted: '#898781',
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    accent: '#138a4e',
    ramp: ['#eef1ee', '#c6ead4', '#8fd6aa', '#4cb87c', '#1f9a5a', '#0f6e3e'],
  },
}

/** Cor de destaque de cada aba: cada parte do site tem a sua. */
export type Tone = 'green' | 'coral' | 'amber' | 'pink' | 'violet'

const TONES: Record<Tone, Record<ThemeName, Pick<ChartColors, 'accent' | 'ramp'>>> = {
  green: { dark: CHART_COLORS.dark, light: CHART_COLORS.light },
  coral: {
    dark: { accent: '#ff7a59', ramp: ['#2a201d', '#4d2b21', '#7a3a27', '#b24e31', '#ff7a59', '#ffb6a2'] },
    light: { accent: '#c2410c', ramp: ['#f3eeeb', '#f8d6ca', '#f3ae95', '#e5805d', '#cc5530', '#9a3412'] },
  },
  amber: {
    dark: { accent: '#f5b33d', ramp: ['#2a261a', '#4a3b18', '#7a5b17', '#b07f1c', '#f5b33d', '#ffd98a'] },
    light: { accent: '#a15c00', ramp: ['#f2efe6', '#f6e2b4', '#efc670', '#d99a2b', '#b8730a', '#8a5200'] },
  },
  pink: {
    dark: { accent: '#ff6fae', ramp: ['#2a1d23', '#4d2338', '#7a2c53', '#b23a74', '#ff6fae', '#ffb3d4'] },
    light: { accent: '#c0266d', ramp: ['#f3edf0', '#f8d0e2', '#f19cc2', '#e0609a', '#c0266d', '#8f1650'] },
  },
  violet: {
    dark: { accent: '#a78bfa', ramp: ['#211f2a', '#2f2850', '#40357a', '#5b4aa8', '#a78bfa', '#d4c8ff'] },
    light: { accent: '#6d4fd8', ramp: ['#efedf5', '#ddd6fb', '#bcaef5', '#9682ea', '#6d4fd8', '#4c33a8'] },
  },
}

const colors = new Map<string, ChartColors>()

/**
 * Cores dos gráficos no tema e na cor da aba. É sempre o mesmo objeto para o mesmo par:
 * os gráficos só se redesenham quando o tema muda de verdade.
 */
export function chartColors(theme: ThemeName, tone: Tone = 'green'): ChartColors {
  const key = `${theme}:${tone}`
  let c = colors.get(key)
  if (!c) colors.set(key, (c = { ...CHART_COLORS[theme], ...TONES[tone][theme] }))
  return c
}

const KEY = 'spotify-stats-theme'

function initial(): ThemeName {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // sem localStorage: usa o padrão
  }
  return 'dark' // tema escuro por padrão
}

export function useTheme(): [ThemeName, () => void] {
  const [theme, setTheme] = useState<ThemeName>(initial)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    // A barra de status do app instalado (iPhone) e a do Chrome (Android) pegam esta cor: igual ao fundo da página.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#121212' : '#f6f6f3')
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // ignora
    }
  }, [theme])
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))]
}
