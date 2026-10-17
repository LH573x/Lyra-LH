import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { canShareImages, download, shareImage, svgToPng, zipFiles } from './exportImage'
import { imagesSettled } from '../data/images'
import { ShareIcon } from './icons'
import { t } from '../i18n'

export interface Story {
  id: string
  /** Nome curto, para a barra de progresso e o arquivo. */
  title: string
  card: ReactNode
}

interface Props {
  stories: Story[]
  /** Nome do arquivo de cada cartão, sem ".png". */
  fileName: (i: number) => string
  zipName: string
  shareTitle: string
  label: string
}

/** Stories que passam com toque, arrasto ou setas, com botões de baixar e compartilhar. */
export function StoryViewer({ stories, fileName, zipName, shareTitle, label }: Props) {
  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState<'next' | 'prev'>('next')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [canShare] = useState(canShareImages)
  const stage = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  // Os cartões entram aos poucos: o da tela na hora, os outros quando o navegador está folgado.
  const [mounted, setMounted] = useState(1)
  useEffect(() => {
    if (mounted >= stories.length) return
    if (typeof requestIdleCallback === 'undefined') {
      const timer = setTimeout(() => setMounted((n) => n + 1), 60)
      return () => clearTimeout(timer)
    }
    const id = requestIdleCallback(() => setMounted((n) => n + 1), { timeout: 1500 })
    return () => cancelIdleCallback(id)
  }, [mounted, stories.length])

  if (stories.length === 0) return null
  const at = Math.min(index, stories.length - 1)
  const story = stories[at]
  // Um cartão só: sem barra de progresso nem setas.
  const single = stories.length === 1

  const go = (i: number) => {
    const next = Math.max(0, Math.min(stories.length - 1, i))
    if (next === at) return
    setDir(next > at ? 'next' : 'prev')
    setIndex(next)
  }

  // Setas do teclado passam os cartões quando o foco está aqui.
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'ArrowRight') go(at + 1)
    else if (e.key === 'ArrowLeft') go(at - 1)
    else return
    e.preventDefault()
  }

  const run = async (what: string, job: () => Promise<void>) => {
    setBusy(what)
    setError(null)
    try {
      await job()
    } catch (e) {
      setError((e as Error).message || t('Não deu para gerar a imagem.', "Couldn't create the image.", 'No se ha podido generar la imagen.'))
    } finally {
      setBusy(null)
    }
  }

  const pngAt = async (i: number) => {
    // Pelo lugar do cartão: os que ainda não montaram não têm svg.
    const svg = stage.current?.querySelectorAll('.wcard')[i]?.querySelector<SVGSVGElement>(':scope > svg')
    if (!svg) throw new Error(t('Não encontrei o cartão.', "Couldn't find the card.", 'No he encontrado la tarjeta.'))
    return svgToPng(svg)
  }
  const file = (i: number) => `${fileName(i)}.png`
  const preparing = t('Preparando…', 'Preparing…', 'Preparando…')
  const making = t('Gerando…', 'Creating…', 'Generando…')
  const zipping = t('Juntando…', 'Zipping…', 'Empaquetando…')

  // Toque: terço esquerdo volta, o resto avança. Arrastar para o lado também passa.
  const onPointerDown = (e: PointerEvent) => {
    pointer.current = { x: e.clientX, y: e.clientY }
  }
  const onPointerUp = (e: PointerEvent) => {
    const start = pointer.current
    pointer.current = null
    if (!start || !stage.current) return
    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      go(dx < 0 ? at + 1 : at - 1)
      return
    }
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return
    const r = stage.current.getBoundingClientRect()
    go(e.clientX < r.left + r.width / 3 ? at - 1 : at + 1)
  }

  return (
    <div className="wviewer" onKeyDown={onKeyDown}>
      {!single && (
        <div className="wprogress" role="group" aria-label={label}>
          {stories.map((s, i) => (
            <button
              key={s.id}
              className={i < at ? 'done' : i === at ? 'on' : ''}
              aria-label={`${i + 1}. ${s.title}`}
              aria-current={i === at ? 'step' : undefined}
              title={s.title}
              onClick={() => go(i)}
            />
          ))}
        </div>
      )}

      <div
        className="wstage"
        ref={stage}
        tabIndex={0}
        aria-label={
          single
            ? label
            : t(
                `${label}: toque nos lados ou use as setas para passar`,
                `${label}: tap the sides or use the arrow keys to browse`,
                `${label}: toca los lados o usa las flechas para pasar`,
              )
        }
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (pointer.current = null)}
        aria-live="polite"
      >
        {stories.map((s, i) => (
          <div key={s.id} className={`wcard ${dir}`} hidden={i !== at}>
            {(i < mounted || i === at) && s.card}
          </div>
        ))}
      </div>

      {!single && (
        <div className="wnav">
          <button className="ghost icon" onClick={() => go(at - 1)} disabled={at === 0} aria-label={t('Cartão anterior', 'Previous card', 'Tarjeta anterior')}>
            ←
          </button>
          <span>
            {t(`${at + 1} de ${stories.length}`, `${at + 1} of ${stories.length}`, `${at + 1} de ${stories.length}`)} · {story.title}
          </span>
          <button className="ghost icon" onClick={() => go(at + 1)} disabled={at === stories.length - 1} aria-label={t('Próximo cartão', 'Next card', 'Tarjeta siguiente')}>
            →
          </button>
        </div>
      )}

      <div className="wactions">
        {canShare && (
          <button
            className="primary"
            disabled={busy !== null}
            onClick={() => run(preparing, async () => shareImage(await pngAt(at), file(at), shareTitle))}
          >
            <ShareIcon />
            {busy === preparing ? busy : t('Compartilhar', 'Share', 'Compartir')}
          </button>
        )}
        <button
          className={canShare ? 'ghost' : 'primary'}
          disabled={busy !== null}
          onClick={() => run(making, async () => download(await pngAt(at), file(at)))}
        >
          {busy === making ? busy : t('Baixar imagem', 'Download image', 'Descargar imagen')}
        </button>
        {stories.length > 1 && (
          <button
            className="ghost"
            disabled={busy !== null}
            onClick={() =>
              run(zipping, async () => {
                // Todos os cartões na página, com as fotos e capas, antes de virar imagem.
                flushSync(() => setMounted(stories.length))
                await imagesSettled()
                const files = []
                for (let i = 0; i < stories.length; i++) files.push({ name: file(i), blob: await pngAt(i) })
                download(await zipFiles(files), zipName)
              })
            }
          >
            {busy === zipping ? busy : t(`Baixar todos (${stories.length})`, `Download all (${stories.length})`, `Descargar todas (${stories.length})`)}
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
