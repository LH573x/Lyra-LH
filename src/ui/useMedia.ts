import { useSyncExternalStore } from 'react'

interface Store {
  subscribe: (on: () => void) => () => void
  matches: () => boolean
}

// Uma por media query: as mesmas funções em todo desenho, para o React não se reinscrever à toa.
const stores = new Map<string, Store>()

function store(query: string): Store {
  let s = stores.get(query)
  if (!s) {
    const m = matchMedia(query)
    s = {
      subscribe: (on) => {
        m.addEventListener('change', on)
        return () => m.removeEventListener('change', on)
      },
      matches: () => m.matches,
    }
    stores.set(query, s)
  }
  return s
}

/** Se a tela atende à media query agora (e redesenha quando muda, ao girar o celular ou redimensionar). */
export function useMedia(query: string): boolean {
  const s = store(query)
  return useSyncExternalStore(s.subscribe, s.matches)
}

/** Celular: a mesma largura em que as grades de capas mudam no CSS. */
export const PHONE = '(max-width: 600px)'
