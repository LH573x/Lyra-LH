import type { Dataset } from './types'
import { lang } from '../i18n'

/*
 * Contas já feitas, por arquivo: voltar a uma aba ou a um filtro não refaz nada.
 * O worker que lê o arquivo adianta as contas das abas e manda prontas (ver views.ts).
 * A chave leva o idioma, porque alguns resultados trazem nomes traduzidos (manhã, tarde…).
 */
const tables = new WeakMap<Dataset, Map<string, unknown>>()

function table(d: Dataset) {
  let t = tables.get(d)
  if (!t) tables.set(d, (t = new Map()))
  return t
}

export function memo<T>(d: Dataset, key: string, fn: () => T): T {
  const t = table(d)
  const k = `${lang()} ${key}`
  if (t.has(k)) return t.get(k) as T
  const v = fn()
  t.set(k, v)
  return v
}

/** As contas que o worker mandou prontas (as que a página já fez ficam como estão). */
export function adopt(d: Dataset, entries: [string, unknown][]) {
  const t = table(d)
  for (const [k, v] of entries) if (!t.has(k)) t.set(k, v)
}

/** As contas feitas depois das `from` primeiras, para o worker mandar aos poucos. */
export function entriesFrom(d: Dataset, from: number): [string, unknown][] {
  return [...table(d)].slice(from)
}

export const memoSize = (d: Dataset) => table(d).size
