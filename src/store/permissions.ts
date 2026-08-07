'use client'
import { create } from 'zustand'
import { supabase } from '@/lib/supabase'

export interface ModulePermission {
  can_view: boolean
  can_edit: boolean
  metadata: Record<string, unknown>
}

interface PermissionsState {
  permissions: Record<string, ModulePermission>
  loaded: boolean
  loading: boolean
  // true quando o RPC falhou (rede, erro do banco, etc) — diferente de
  // "carregou e negou tudo". Sem essa distinção, uma falha de rede
  // aparecia igual a "acesso restrito" pro usuário, sem chance de saber
  // que era pra tentar de novo em vez de chamar o admin.
  error: boolean
  load: () => Promise<void>
  reset: () => void
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  permissions: {},
  loaded: false,
  loading: false,
  error: false,

  load: async () => {
    if (get().loading) return
    set({ loading: true })
    const { data, error } = await supabase.rpc('get_my_permissions')
    if (!error && data) {
      // Admin retorna { _full_access: true } — não precisamos mapear
      if (data._full_access) {
        set({ permissions: {}, loaded: true, loading: false, error: false })
      } else {
        set({ permissions: data as Record<string, ModulePermission>, loaded: true, loading: false, error: false })
      }
    } else {
      set({ loaded: true, loading: false, error: true })
    }
  },

  reset: () => set({ permissions: {}, loaded: false, loading: false, error: false }),
}))
