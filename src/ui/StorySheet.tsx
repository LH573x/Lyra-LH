import { useEffect, useRef, useState, type ReactNode } from 'react'
import { displayFontLoaded, loadDisplayFont } from './svgText'
import { CloseIcon, ShareIcon } from './icons'
import { t } from '../i18n'

/**
 * Botão de compartilhar que abre um story numa janela. O story só monta com a janela aberta (as
 * imagens dele só carregam se for usar) e com a fonte dos títulos, em que os textos são medidos.
 * Com `action`, o botão é só o ícone, e `action` diz o que ele faz.
 */
export function StorySheet({ label, action, children }: { label: string; action?: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const [fontReady, setFontReady] = useState(displayFontLoaded)
  useEffect(() => {
    if (open && !fontReady) loadDisplayFont().then(() => setFontReady(true))
  }, [open, fontReady])
  const close = () => dialog.current?.close()
  return (
    <>
      <button
        className={action ? 'ghost icon share-icon' : 'ghost share-btn'}
        aria-label={action}
        title={action}
        onClick={() => {
          setOpen(true)
          dialog.current?.showModal()
        }}
      >
        <ShareIcon />
        {!action && t('Compartilhar', 'Share', 'Compartir')}
      </button>
      <dialog
        ref={dialog}
        className="story-sheet"
        aria-label={label}
        onClose={() => setOpen(false)}
        // Tocar fora da janela fecha, como no celular.
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <button className="ghost icon sheet-close" onClick={close} aria-label={t('Fechar', 'Close', 'Cerrar')} title={t('Fechar', 'Close', 'Cerrar')}>
          <CloseIcon />
        </button>
        {open && (fontReady ? children : <p className="empty">{t('Preparando o story…', 'Preparing story…', 'Preparando la historia…')}</p>)}
      </dialog>
    </>
  )
}
