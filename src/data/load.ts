import type { Dataset } from './types'
import type { WorkerRequest, WorkerResponse } from './worker'
import { adoptCalendar } from './calendar'
import { adopt } from './memo'
import { loadSaved, save, type Saved } from './store'
import { PHONE } from '../ui/useMedia'
import { lang, t } from '../i18n'

let current: Worker | null = null

/**
 * Lê o zip ou os JSONs do export (ou, sem arquivos, os dados guardados) num Web Worker, sem travar
 * a tela. O worker também adianta as contas das abas: as primeiras chegam junto com os dados e as
 * outras logo depois. Dá null se o navegador não deixar usar o worker.
 */
function viaWorker(files: File[] | null, onProgress: (message: string) => void): Promise<Saved | null> {
  current?.terminate()
  let worker: Worker
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  } catch {
    return Promise.resolve(null)
  }
  current = worker
  return new Promise((resolve, reject) => {
    let dataset: Dataset | null = null
    let started = false
    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      started = true
      const msg = e.data
      if (msg.type === 'progress') onProgress(msg.message)
      else if (msg.type === 'views') {
        if (dataset) adopt(dataset, msg.views)
      } else if (msg.type === 'done') {
        dataset = msg.dataset
        if (dataset) {
          if (msg.calendar) adoptCalendar(dataset, msg.calendar)
          adopt(dataset, msg.views)
        }
        resolve({ dataset, outdated: msg.outdated })
      } else {
        worker.terminate()
        reject(new Error(msg.message))
      }
    }
    worker.onerror = (e) => {
      worker.terminate()
      // Depois que os dados chegaram, um erro nos lotes seguintes não importa: a página faz a conta.
      if (!started) resolve(null)
      else if (!dataset) reject(new Error(e.message))
    }
    // Uma resposta que não deu para abrir aqui: sem os dados, a página lê ela mesma; sem um lote, faz as contas dele.
    worker.onmessageerror = () => {
      if (dataset) return
      worker.terminate()
      resolve(null)
    }
    // O worker não vê o idioma nem a tela da página: vão junto com o pedido.
    const req: WorkerRequest = { files, lang: lang(), phone: matchMedia(PHONE).matches }
    worker.postMessage(req)
  })
}

/** Lê os arquivos do export e guarda os dados neste navegador. */
export async function loadFiles(files: File[], onProgress: (message: string) => void): Promise<Dataset> {
  const done = await viaWorker(files, onProgress)
  if (done?.dataset) return done.dataset
  // Sem worker, lê na própria página (mais lento, mas funciona).
  try {
    const { processFiles } = await import('./process')
    const d = await processFiles(files, onProgress)
    await save(d)
    return d
  } catch (err) {
    throw new Error(`${t('Não consegui ler os arquivos', "Couldn't read the files", 'No pude leer los archivos')}: ${(err as Error).message}`)
  }
}

/** Os dados guardados neste navegador, abertos pelo worker (ou aqui, se ele não der conta). */
export async function openSaved(): Promise<Saved> {
  try {
    const saved = await viaWorker(null, () => {})
    if (saved?.dataset || saved?.outdated) return saved
  } catch {
    // tenta de novo aqui
  }
  return loadSaved()
}

/** Para o worker (ao sair): nada do arquivo antigo é guardado depois. */
export function stopLoading() {
  current?.terminate()
  current = null
}
