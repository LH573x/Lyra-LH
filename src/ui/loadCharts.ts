// O ECharts é a parte mais pesada do site: fica num pedaço à parte, baixado uma vez só,
// quando o primeiro gráfico vai aparecer (ou quando o navegador fica livre depois de abrir).
let lib: Promise<typeof import('./charts')> | null = null

export function loadCharts() {
  lib ??= import('./charts').catch((err: unknown) => {
    // Falhou (sem rede): tenta de novo no próximo gráfico.
    lib = null
    throw err
  })
  return lib
}

/** Baixa os gráficos com a página já aberta, para estarem prontos quando aparecerem. */
export function preloadCharts() {
  const go = () => void loadCharts().catch(() => {})
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 4000 })
  else setTimeout(go, 1500)
}
