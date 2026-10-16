'use client'
import { useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { create } from 'zustand'

// Texto da busca da barra de cima. Cada tela lê o mesmo texto que a barra grava (e a tela do celular, que
// não tem a barra, grava pelo próprio campo). Guarda a rota junto: ao trocar de tela a busca volta vazia.
interface PageSearchState {
  path: string
  query: string
  set: (path: string, query: string) => void
}

const useStore = create<PageSearchState>((set) => ({
  path: '',
  query: '',
  set: (path, query) => set({ path, query }),
}))

export function usePageSearch(): [string, (query: string) => void] {
  const path = usePathname()
  const query = useStore(s => (s.path === path ? s.query : ''))
  const set = useStore(s => s.set)
  const update = useCallback((q: string) => set(path, q), [set, path])
  return [query, update]
}
