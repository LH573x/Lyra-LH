import { processFiles } from './process'
import type { Dataset } from './types'
import { loadSaved, save } from './store'
import { calendar, type Calendar } from './calendar'
import { entriesFrom, memoSize } from './memo'
import { plan } from './views'
import { setLang, t, type Lang } from '../i18n'

/** Sem arquivos: abre os dados guardados neste navegador. */
export type WorkerRequest = { files: File[] | null; lang: Lang; phone: boolean }
export type WorkerResponse =
  | { type: 'progress'; message: string }
  | { type: 'done'; dataset: Dataset | null; outdated: boolean; calendar: Calendar | null; views: [string, unknown][] }
  | { type: 'views'; views: [string, unknown][] }
  | { type: 'error'; message: string }

const ctx = self as unknown as {
  postMessage(msg: WorkerResponse, transfer?: Transferable[]): void
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null
  close(): void
}

/** Uma conta que falha aqui também falharia na página: lá ela é feita de novo e mostra o erro. */
function run(batch: (() => unknown)[]) {
  for (const fn of batch) {
    try {
      fn()
    } catch {
      // segue com as outras
    }
  }
}

const readError = (err: unknown) =>
  `${t('Não consegui ler os arquivos', "Couldn't read the files", 'No pude leer los archivos')}: ${(err as Error).message}`

async function answer(files: File[] | null, phone: boolean) {
  let d: Dataset | null
  let outdated = false
  try {
    if (files) d = await processFiles(files, (message) => ctx.postMessage({ type: 'progress', message }))
    else ({ dataset: d, outdated } = await loadSaved())
  } catch (err) {
    return ctx.postMessage({ type: 'error', message: readError(err) })
  }
  if (!d) return ctx.postMessage({ type: 'done', dataset: null, outdated, calendar: null, views: [] })

  // Fica guardado neste navegador, para não precisar enviar o arquivo de novo. Começa já: quem
  // recarregar a página logo depois de ver os dados ainda os encontra.
  const saving = files ? save(d) : null
  let rest: (() => unknown)[][] = []
  try {
    // O Resumo e as Curiosidades já chegam prontos; o resto vem em lotes, enquanto a página abre.
    if (files) ctx.postMessage({ type: 'progress', message: t('Fazendo as contas…', 'Crunching the numbers…', 'Haciendo las cuentas…') })
    const [first = [], ...later] = plan(d, { phone, today: new Date() })
    const cal = calendar(d)
    run(first)

    // A página recebe cópias (transferidas, sem custo para ela); as originais ficam para os próximos lotes.
    const p = d.plays
    const plays = { start: p.start.slice(), ms: p.ms.slice(), item: p.item.slice(), flags: p.flags.slice(), platform: p.platform.slice() }
    const days = { ...cal, day: cal.day.slice(), month: cal.month.slice(), year: cal.year.slice(), hour: cal.hour.slice(), weekday: cal.weekday.slice() }
    ctx.postMessage({ type: 'done', dataset: { ...d, plays }, outdated, calendar: days, views: entriesFrom(d, 0) }, [
      ...Object.values(plays).map((a) => a.buffer),
      days.day.buffer,
      days.month.buffer,
      days.year.buffer,
      days.hour.buffer,
      days.weekday.buffer,
    ])
    rest = later
  } catch {
    // As contas não saíram (ou não deu para mandá-las): os dados vão sozinhos, e a página faz as contas.
    ctx.postMessage({ type: 'done', dataset: d, outdated, calendar: null, views: [] })
  }

  await saving
  for (const batch of rest) {
    const before = memoSize(d)
    run(batch)
    try {
      ctx.postMessage({ type: 'views', views: entriesFrom(d, before) })
    } catch {
      // Essas a página faz quando precisar.
    }
  }
}

ctx.onmessage = async (e) => {
  const { files, lang, phone } = e.data
  setLang(lang, false)
  try {
    await answer(files, phone)
  } catch (err) {
    // Nem os dados sozinhos foram: a página fica sabendo, em vez de esperar para sempre.
    ctx.postMessage({ type: 'error', message: readError(err) })
  } finally {
    ctx.close()
  }
}
