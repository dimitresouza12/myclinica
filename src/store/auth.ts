'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthClinic, AuthUser } from '@/types'

interface AuthState {
  clinic: AuthClinic | null
  user: AuthUser | null
  _hydrated: boolean
  impersonatedClinicId: string | null
  impersonatedClinicName: string | null
  setSession: (clinic: AuthClinic, user: AuthUser) => void
  clearSession: () => void
  setHydrated: () => void
  setClinicLogo: (logo: string) => void
  dismissOnboardingItem: (key: string) => void
  startImpersonation: (clinicId: string, clinicName: string) => void
  stopImpersonation: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      clinic: null,
      user: null,
      _hydrated: false,
      impersonatedClinicId: null,
      impersonatedClinicName: null,
      setSession: (clinic, user) => set({ clinic, user }),
      clearSession: () => {
        set({ clinic: null, user: null, impersonatedClinicId: null, impersonatedClinicName: null })
      },
      setHydrated: () => set({ _hydrated: true }),
      setClinicLogo: (logo) => set((s) => s.clinic ? { clinic: { ...s.clinic, logo } } : {}),
      // (s.clinic.onboardingDismissed ?? []): sessões salvas no navegador antes
      // desse campo existir vêm sem ele — persist do zustand não migra dados
      // antigos sozinho, então sem o fallback isso quebraria pra quem já
      // estava logado no momento do deploy.
      dismissOnboardingItem: (key) => set((s) => s.clinic
        ? { clinic: { ...s.clinic, onboardingDismissed: Array.from(new Set([...(s.clinic.onboardingDismissed ?? []), key])) } }
        : {}),
      startImpersonation: (clinicId, clinicName) =>
        set({ impersonatedClinicId: clinicId, impersonatedClinicName: clinicName }),
      stopImpersonation: () => set({ impersonatedClinicId: null, impersonatedClinicName: null }),
    }),
    {
      name: 'myclinica-auth',
      onRehydrateStorage: () => (state) => {
        state?.setHydrated()
      },
    }
  )
)
