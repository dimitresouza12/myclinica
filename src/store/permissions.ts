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
  load: () => Promise<void>
  reset: () => void
}

export const usePermissionsStore = create<PermissionsState>((set, get) => ({
  permissions: {},
  loaded: false,
  loading: false,

  load: async () => {
    if (get().loading) return
    set({ loading: true })
    const { data, error } = await supabase.rpc('get_my_permissions')
    if (!error && data) {
      // Admin retorna { _full_access: true } — não precisamos mapear
      if (data._full_access) {
        set({ permissions: {}, loaded: true, loading: false })
      } else {
        set({ permissions: data as Record<string, ModulePermission>, loaded: true, loading: false })
      }
    } else {
      set({ loaded: true, loading: false })
    }
  },

  reset: () => set({ permissions: {}, loaded: false, loading: false }),
}))
