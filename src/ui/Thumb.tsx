import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { imageFailed, useImageState, type ImageRef } from '../data/images'
import { hue } from './format'

// Um observador só para todas as fotos e capas: diz quais estão na tela (ou quase), para essas
// passarem na frente na fila de buscas.
const watching = new Map<Element, (near: boolean) => void>()
let observer: IntersectionObserver | null = null

function watch(el: Element, on: (near: boolean) => void) {
  observer ??= new IntersectionObserver((entries) => {
    for (const e of entries) watching.get(e.target)?.(e.isIntersecting)
  }, { rootMargin: '50% 0px' })
  watching.set(el, on)
  observer.observe(el)
  return () => {
    watching.delete(el)
    observer?.unobserve(el)
  }
}

function useNear<T extends Element>() {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => (ref.current && typeof IntersectionObserver !== 'undefined' ? watch(ref.current, setNear) : undefined), [])
  return [ref, near] as const
}

interface ArtProps {
  image?: ImageRef
  label: string
  /** Tamanho fixo em px; sem ele, ocupa a largura do contêiner. */
  size?: number
  /** Redonda (artista) ou quadrada (capa). Por padrão segue o tipo da imagem. */
  round?: boolean
  className?: string
  style?: CSSProperties
}

/**
 * Foto ou capa. Enquanto busca ou baixa, um cinza que brilha ("esqueleto");
 * se não existir (ou não abrir, nem a da outra fonte), a inicial num fundo colorido.
 */
export function Art({ image, label, size, round, className = '', style }: ArtProps) {
  const [el, near] = useNear<HTMLSpanElement>()
  const { url, waiting } = useImageState(image, near)
  const [loaded, setLoaded] = useState<string | null>(null)
  const isRound = round ?? (image ? image.kind !== 'album' : false)
  const wait = waiting || (url && loaded !== url)
  const css = { '--h': hue(label), ...(size ? { width: size, height: size } : {}), ...style } as CSSProperties
  return (
    <span ref={el} className={`art ${size ? '' : 'fill'} ${isRound ? 'round' : ''} ${wait ? 'wait' : ''} ${className}`} style={css} aria-hidden>
      {url ? (
        <img src={url} alt="" loading="lazy" referrerPolicy="no-referrer" onLoad={() => setLoaded(url)} onError={() => imageFailed(url)} />
      ) : waiting ? null : (
        <span className="art-initial">{label.trim().charAt(0).toUpperCase()}</span>
      )}
    </span>
  )
}

/** Miniatura de tamanho fixo, para listas. */
export function Thumb({ image, label, size = 40 }: { image: ImageRef; label: string; size?: number }) {
  return <Art image={image} label={label} size={size} />
}
