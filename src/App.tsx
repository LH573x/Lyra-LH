import { Fragment, useCallback, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import type { Dataset } from './data/types'
import { loadFiles, openSaved, stopLoading } from './data/load'
import { clearSaved } from './data/store'
import { takeSharedFiles } from './data/shared'
import { hasPodcasts, years, type Filter } from './data/stats'
import { Upload } from './pages/Upload'
import { Resumo } from './pages/Resumo'
import { Curiosidades } from './pages/Curiosidades'
import { LinhaDoTempo } from './pages/LinhaDoTempo'
import { Artista } from './pages/Artista'
import { Musica } from './pages/Musica'
import { Playlist } from './pages/Playlist'
import { PlayerDock } from './ui/player'
import { Wrapped } from './pages/Wrapped'
import { Explorar } from './pages/Explorar'
import { useTheme, type Tone } from './ui/theme'
import { BulbIcon, CalendarIcon, CompassIcon, DiscIcon, GiftIcon } from './ui/icons'
import { ExitButton } from './ui/ExitButton'
import { LyraMark } from './ui/LyraMark'
import { Splash } from './ui/Splash'
import { LangPicker } from './ui/LangPicker'
import { KindPicker } from './ui/KindPicker'
import { PageTint } from './ui/PageTint'
import { hapticOnTaps } from './ui/haptic'
import { useHeader } from './ui/useHeader'
import { TabPager } from './ui/TabPager'
import { preloadCharts } from './ui/loadCharts'
import { t, useLang } from './i18n'
import { hasConcerts } from './data/concerts'

/** As abas, cada uma com a sua cor e o seu ícone. */
const PAGES = [
  { id: 'resumo', label: () => t('Resumo', 'Overview', 'Resumen'), tone: 'green', Icon: DiscIcon },
  { id: 'curiosidades', label: () => t('Curiosidades', 'Fun facts', 'Curiosidades'), tone: 'coral', Icon: BulbIcon },
  { id: 'linha', label: () => t('Linha do tempo', 'Timeline', 'Línea de tiempo'), tone: 'amber', Icon: CalendarIcon },
  { id: 'wrapped', label: () => 'Wrapped', tone: 'pink', Icon: GiftIcon },
  { id: 'explorar', label: () => t('Explorar', 'Explore', 'Explorar'), tone: 'violet', Icon: CompassIcon },
] as const satisfies readonly { id: string; label: () => string; tone: Tone; Icon: () => ReactElement }[]

type PageId = (typeof PAGES)[number]['id']
type Route = { page: PageId } | { page: 'artista'; artist: number } | { page: 'musica'; item: number } | { page: 'playlist'; index: number }

/** Endereços antigos que mudaram de nome. */
const RENAMED: Record<string, PageId> = { habitos: 'curiosidades' }

/** A página atual vem do endereço (#curiosidades, #artista-12), para o botão voltar e links funcionarem. */
function readRoute(): Route {
  const h = location.hash.slice(1)
  const m = /^artista-(\d+)$/.exec(h)
  if (m) return { page: 'artista', artist: Number(m[1]) }
  const s = /^musica-(\d+)$/.exec(h)
  if (s) return { page: 'musica', item: Number(s[1]) }
  const pl = /^playlist-(\d+)$/.exec(h)
  if (pl) return { page: 'playlist', index: Number(pl[1]) }
  const p = PAGES.find((x) => x.id === (RENAMED[h] ?? h))
  return { page: p ? p.id : 'resumo' }
}

function useRoute(): [Route, (p: PageId) => void] {
  const [route, setRoute] = useState<Route>(readRoute)
  useEffect(() => {
    const on = () => {
      setRoute(readRoute())
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = (p: PageId) => {
    location.hash = p === 'resumo' ? '' : p
    setRoute({ page: p })
    window.scrollTo({ top: 0 })
  }
  return [route, go]
}

/**
 * O cabeçalho muda de tamanho ao rolar. Só ele se redesenha nessa hora: o conteúdo (`children`)
 * vem pronto do App, que não precisa redesenhar a página inteira a cada rolagem.
 */
function TopBar({ children }: { children: ReactNode }) {
  const state = useHeader()
  return <header className={`top ${state}`}>{children}</header>
}

/** Abas em que "música, podcasts ou tudo" muda os números. */
const KIND_PAGES = new Set<string>(['resumo', 'curiosidades', 'linha'])

export default function App() {
  // Trocar o idioma remonta a página inteira, para todo texto sair no idioma novo.
  const lng = useLang()
  const [theme, toggleTheme] = useTheme()
  const [route, go] = useRoute()
  const page = route.page
  const tone: Tone = PAGES.find((p) => p.id === page)?.tone ?? 'green'
  useEffect(() => {
    document.documentElement.dataset.tone = tone
  }, [tone])
  const [data, setData] = useState<Dataset | null>(null)
  const [booting, setBooting] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>({ year: null, kind: 'music' })
  useEffect(() => hapticOnTaps(), [])
  useEffect(() => {
    if (data) preloadCharts()
  }, [data])

  // Nas abas (não nas páginas de artista e de música), arrastar para os lados troca de aba.
  const tab = PAGES.findIndex((p) => p.id === page)

  const yearList = useMemo(() => (data ? years(data) : []), [data])
  const podcasts = useMemo(() => (data ? hasPodcasts(data) : false), [data])
  const lastYear = yearList[yearList.length - 1]
  // O Wrapped é sempre de um ano só: sem ano escolhido, mostra o mais recente.
  const wrappedYear = filter.year ?? lastYear

  const onFiles = useCallback(async (files: File[]) => {
    setError(null)
    setBusy(t('Preparando…', 'Getting ready…', 'Preparando…'))
    try {
      const d = await loadFiles(files, setBusy)
      setFilter({ year: null, kind: 'music' })
      setData(d)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }, [])

  useEffect(() => {
    takeSharedFiles().then((shared) => {
      // Chegou um arquivo pelo "Compartilhar" do Android: lê ele no lugar dos dados salvos.
      if (shared) {
        setBooting(false)
        if (shared.length > 0) onFiles(shared)
        else
          setError(
            t(
              'O arquivo compartilhado não chegou. Tente compartilhar de novo ou escolha o arquivo aqui.',
              "The shared file didn't arrive. Try sharing it again or choose the file here.",
              'El archivo compartido no llegó. Intenta compartirlo de nuevo o elige el archivo aquí.',
            ),
          )
        return
      }
      openSaved().then((saved) => {
        setData(saved.dataset)
        if (saved.outdated)
          setNotice(
            t(
              'O site ganhou páginas novas. Solte seu arquivo de novo para atualizar os dados.',
              'The site has new pages. Drop your file again to update your data.',
              'El sitio tiene páginas nuevas. Suelta tu archivo de nuevo para actualizar los datos.',
            ),
          )
        setBooting(false)
      })
    })
  }, [onFiles])

  const reset = async () => {
    stopLoading()
    await clearSaved()
    setData(null)
  }

  // Uma aba inteira (filtros de ano e página). Também desenha as vizinhas, escondidas, para o arrastar.
  const tabPage = (d: Dataset, id: PageId) => (
    <>
      {(id === 'curiosidades' || id === 'wrapped') && (
        <div className="filters">
          <div className="chips" role="group" aria-label={t('Período', 'Period', 'Período')}>
            {id !== 'wrapped' && (
              <button className={filter.year === null ? 'on' : ''} onClick={() => setFilter({ ...filter, year: null })}>
                {t('Todos os anos', 'All years', 'Todos los años')}
              </button>
            )}
            {yearList.map((y) => {
              const on = id === 'wrapped' ? wrappedYear === y : filter.year === y
              return (
                <button key={y} className={on ? 'on' : ''} onClick={() => setFilter({ ...filter, year: y })}>
                  {y}
                </button>
              )
            })}
          </div>
        </div>
      )}
      {id === 'explorar' ? (
        <Explorar data={d} />
      ) : id === 'wrapped' ? (
        <Wrapped data={d} year={wrappedYear} />
      ) : id === 'linha' ? (
        <LinhaDoTempo data={d} kind={filter.kind} theme={theme} />
      ) : id === 'curiosidades' ? (
        <Curiosidades data={d} filter={filter} theme={theme} lastYear={lastYear} />
      ) : (
        <Resumo data={d} filter={filter} theme={theme} onYear={(year) => setFilter({ ...filter, year })} />
      )}
    </>
  )

  const footer = (
    <footer className="foot">
      <p className="credit">
        {t('Desenvolvido por', 'Developed by', 'Desarrollado por')} <strong>Luiz Hong</strong>
      </p>
      <p>
        {t('Seus dados ficam só neste aparelho', 'Your data stays on this device', 'Tus datos se quedan en este dispositivo')} ·{' '}
        {t('Fotos', 'Photos', 'Fotos')}: <a href="https://www.wikidata.org/">Wikidata</a> · {t('Capas', 'Covers', 'Portadas')}:{' '}
        <a href="https://www.deezer.com/">Deezer</a> {t('e', 'and', 'y')} <a href="https://musicbrainz.org/">MusicBrainz</a> ·{' '}
        {t('Prévias', 'Previews', 'Avances')}: <a href="https://www.deezer.com/">Deezer</a>
        {hasConcerts() && (
          <>
            {' '}
            · {t('Shows', 'Gigs', 'Conciertos')}: <a href="https://www.ticketmaster.com.br/">Ticketmaster</a>
          </>
        )}
      </p>
      {hasConcerts() && (
        <p>
          {t(
            'O Ticketmaster recebe só a região e nomes de artistas',
            'Ticketmaster only gets your area and artist names',
            'Ticketmaster solo recibe tu zona y nombres de artistas',
          )}
        </p>
      )}
    </footer>
  )

  return (
    <div className="app">
      <Splash ready={!booting} />
      <Fragment key={lng}>
        <TopBar>
          <div className="brand">
            <span className="logo">
              <LyraMark />
            </span>
            Lyra
          </div>
          {data && (
            <nav className="nav" aria-label={t('Páginas', 'Pages', 'Páginas')}>
              {PAGES.map((p) => (
                <button
                  key={p.id}
                  className={`tab-${p.tone} ${p.id === page ? 'active' : ''}`}
                  aria-current={p.id === page ? 'page' : undefined}
                  aria-label={p.label()}
                  title={p.label()}
                  onClick={() => go(p.id)}
                >
                  <p.Icon />
                  <span>{p.label()}</span>
                </button>
              ))}
            </nav>
          )}
          <div className="actions">
            {data && podcasts && KIND_PAGES.has(page) && <KindPicker kind={filter.kind} onChange={(kind) => setFilter({ ...filter, kind })} />}
            <LangPicker />
            {data && <ExitButton onConfirm={reset} />}
            <button
              className="ghost icon"
              onClick={toggleTheme}
              aria-label={t('Alternar tema claro/escuro', 'Switch light/dark theme', 'Cambiar tema claro/oscuro')}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
          </div>
        </TopBar>

        {data && tab >= 0 && (
          <PageTint
            data={data}
            year={page === 'wrapped' ? wrappedYear : page === 'linha' || page === 'explorar' ? null : filter.year}
            kind={page === 'explorar' ? 'music' : page === 'wrapped' ? 'all' : filter.kind}
          />
        )}

        {booting ? (
          footer
        ) : data && tab >= 0 ? (
          <TabPager tabs={PAGES} current={tab} render={(id) => tabPage(data, id as PageId)} footer={footer} onChange={(id) => go(id as PageId)} />
        ) : (
          <>
            {data ? (
              route.page === 'artista' ? (
                <Artista data={data} id={route.artist} theme={theme} />
              ) : route.page === 'musica' ? (
                <Musica data={data} id={route.item} theme={theme} />
              ) : route.page === 'playlist' ? (
                <Playlist data={data} index={route.index} theme={theme} />
              ) : null
            ) : (
              <Upload busy={busy} error={error} notice={notice} onFiles={onFiles} />
            )}
            {footer}
          </>
        )}
      </Fragment>
      {data && <PlayerDock />}
    </div>
  )
}
