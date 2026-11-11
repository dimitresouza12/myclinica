'use client'
import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import type { PrintOptionInfo } from '@/lib/prontuario/printOptions'

/** Uma impressão que só faz sentido na aba aberta (comparador antes/depois, plano alimentar, documento em edição...). */
export interface TabPrintAction extends PrintOptionInfo {
  /** Roda a impressão. Chamada direto no clique de "Imprimir" da confirmação: pode abrir a janela de impressão na hora. */
  run: () => void | Promise<void>
}

type Getter = () => TabPrintAction[]

export interface PrintRegistry {
  set(key: string, get: Getter): void
  clear(key: string, get: Getter): void
  /** Ações de todas as fontes registradas para a aba (uma aba pode ter mais de um painel que imprime). */
  get(tab: string): TabPrintAction[]
}

const Ctx = createContext<PrintRegistry | null>(null)
export const PrintRegistryProvider = Ctx.Provider

/** Registro das impressões das abas. Fica num ref: o menu lê só quando abre, não precisa re-renderizar a página. */
export function useCreatePrintRegistry(): PrintRegistry {
  const store = useRef(new Map<string, Getter>())
  return useMemo<PrintRegistry>(() => ({
    set: (tab, get) => { store.current.set(tab, get) },
    clear: (tab, get) => { if (store.current.get(tab) === get) store.current.delete(tab) },
    get: tab => Array.from(store.current.entries()).filter(([key]) => key.startsWith(`${tab}:`)).flatMap(([, get]) => get()),
  }), [])
}

/**
 * Uma aba declara aqui o que ela sabe imprimir. As ações vão para o menu "Imprimir" do cabeçalho do prontuário
 * enquanto a aba está aberta; a aba não precisa (nem deve) ter botão de imprimir próprio.
 * Fora do prontuário (sem provedor) não faz nada.
 */
export function usePrintActions(tab: string, actions: TabPrintAction[], source = 'main') {
  const registry = useContext(Ctx)
  const latest = useRef(actions)
  useEffect(() => { latest.current = actions })
  useEffect(() => {
    if (!registry) return
    const get: Getter = () => latest.current
    const key = `${tab}:${source}`
    registry.set(key, get)
    return () => registry.clear(key, get)
  }, [registry, tab, source])
}
