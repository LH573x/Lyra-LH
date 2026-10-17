/** Medição de texto para os cartões em SVG, que não quebram linha sozinhos. */
export const CARD_FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
/** Fonte estreita dos títulos e números (a mesma do site), embutida no PNG na hora de baixar. */
export const DISPLAY_FONT = "'Barlow Condensed', 'Arial Narrow', sans-serif"

let ctx: CanvasRenderingContext2D | null = null
let font = ''
let fontLoad: Promise<void> | null = null
let fontLoaded = false
/** Medidas já feitas: os cartões medem os mesmos nomes em vários tamanhos, e de novo a cada desenho. */
const widths = new Map<string, number>()

export function measure(text: string, size: number, weight: number, family = CARD_FONT): number {
  ctx ??= document.createElement('canvas').getContext('2d')
  if (!ctx) return text.length * size * (family === CARD_FONT ? 0.55 : 0.42)
  const f = `${weight} ${size}px ${family}`
  const key = `${f}|${text}`
  const known = widths.get(key)
  if (known !== undefined) return known
  if (f !== font) ctx.font = font = f
  const w = ctx.measureText(text).width
  // Antes da fonte dos títulos chegar, a medida sai na fonte reserva: essa não fica guardada.
  if (fontLoaded || family === CARD_FONT) {
    if (widths.size > 20_000) widths.clear()
    widths.set(key, w)
  }
  return w
}

/** Corta o fim com reticências até caber na largura. */
export function ellipsize(text: string, width: number, size: number, weight: number, family = CARD_FONT): string {
  if (measure(text, size, weight, family) <= width) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(text.slice(0, mid).trimEnd() + '…', size, weight, family) <= width) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo).trimEnd() + '…'
}

/** Quebra em linhas por palavra; `fits` diz se coube sem cortar nada. */
function wrap(text: string, width: number, size: number, weight: number, maxLines: number, family: string) {
  const words = text.split(/[ \t\n]+/).filter(Boolean)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w
    if (!cur || measure(next, size, weight, family) <= width) cur = next
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  const fits = lines.length <= maxLines && lines.every((l) => measure(l, size, weight, family) <= width)
  if (fits) return { lines, fits }
  const kept = lines.slice(0, maxLines)
  kept[kept.length - 1] = ellipsize(lines.slice(maxLines - 1).join(' '), width, size, weight, family)
  return { lines: kept.map((l) => ellipsize(l, width, size, weight, family)), fits }
}

/**
 * Escolhe o maior tamanho (entre `max` e `min`) em que o texto cabe em até `maxLines` linhas.
 * Se nem no mínimo couber, corta com reticências.
 */
export function fitText(
  text: string,
  width: number,
  opts: { max: number; min: number; weight: number; maxLines: number; family?: string },
) {
  const family = opts.family ?? CARD_FONT
  for (let size = opts.max; size > opts.min; size = Math.floor(size * 0.92)) {
    const r = wrap(text, width, size, opts.weight, opts.maxLines, family)
    if (r.fits) return { size, lines: r.lines }
  }
  return { size: opts.min, lines: wrap(text, width, opts.min, opts.weight, opts.maxLines, family).lines }
}

/** Espera a fonte dos títulos carregar, para as medidas acima saírem certas. */
export function loadDisplayFont(): Promise<void> {
  fontLoad ??= Promise.all([600, 700, 800].map((w) => document.fonts.load(`${w} 64px 'Barlow Condensed'`)))
    .catch(() => undefined)
    .then(() => {
      fontLoaded = true
    })
  return fontLoad
}
export const displayFontLoaded = () => fontLoaded
