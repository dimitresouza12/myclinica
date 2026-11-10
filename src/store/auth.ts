'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { AuthClinic, AuthUser, ClinicType } from '@/types'
import { applyDemoSpecialty, restoreDemoBase, type DemoBase } from '@/lib/demoSpecialty'

interface AuthState {
  clinic: AuthClinic | null
  user: AuthUser | null
  _hydrated: boolean
  impersonatedClinicId: string | null
  impersonatedClinicName: string | null
  // Conta de demonstração: área escolhida na sessão (nunca gravada no banco) e o
  // que a sessão tinha antes da escolha. Sempre null fora de clinic.demoMode.
  activeSpecialty: ClinicType | null
  demoBase: DemoBase | null
  setSession: (clinic: AuthClinic, user: AuthUser) => void
  clearSession: () => void
  /** Só tem efeito com clinic.demoMode: troca type/specialtyType/professionalId na sessão. */
  setActiveSpecialty: (area: ClinicType, professionalId?: string | null) => void
  /** Volta ao que a sessão tinha antes da escolha (o seletor reaparece). */
  clearActiveSpecialty: () => void
  setHydrated: () => void
  setClinicLogo: (logo: string) => void
  addClinicSpecialty: (type: ClinicType) => void
  dismissOnboardingItem: (key: string) => void
  markOnboardingModalSeen: () => void
  startImpersonation: (clinicId: string, clinicName: string) => void
  stopImpersonation: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      clinic: null,
      user: null,
      _hydrated: false,
      impersonatedClinicId: null,
      impersonatedClinicName: null,
      activeSpecialty: null,
      demoBase: null,
      // Quem chama costuma passar {...clinic, campo} lido do próprio store (ou de um
      // snapshot antigo): na conta de demonstração com área escolhida, a escolha
      // não pode ser revertida por isso, então é reaplicada por cima.
      setSession: (clinic, user) => {
        const { activeSpecialty, demoBase, clinic: current, user: currentUser } = get()
        // Só é "atualização da mesma sessão" se for a mesma clínica E a mesma pessoa: outro login
        // (ou outro usuário da demo) recomeça sem escolha, mesmo que algum caminho esqueça o clearSession.
        if (activeSpecialty && demoBase && current && current.id === clinic.id && currentUser?.id === user.id) {
          // só um false explícito solta a escolha: um snapshot antigo sem o campo não conta
          if (clinic.demoMode !== false) {
            const next = applyDemoSpecialty({ ...clinic, demoMode: true }, user, activeSpecialty, get().user?.professionalId ?? null)
            set({ clinic: next.clinic, user: next.user })
            return
          }
          // a clínica deixou de ser demonstração: volta ao que era e solta a escolha
          const back = restoreDemoBase(clinic, user, demoBase)
          set({ clinic: back.clinic, user: back.user, activeSpecialty: null, demoBase: null })
          return
        }
        set({ clinic, user, activeSpecialty: null, demoBase: null })
      },
      clearSession: () => {
        set({ clinic: null, user: null, impersonatedClinicId: null, impersonatedClinicName: null, activeSpecialty: null, demoBase: null })
      },
      setActiveSpecialty: (area, professionalId = null) => {
        const { clinic, user, demoBase } = get()
        if (!clinic?.demoMode || !user) return
        const base: DemoBase = demoBase ?? { type: clinic.type, specialties: clinic.specialties, specialtyType: user.specialtyType, professionalId: user.professionalId }
        const next = applyDemoSpecialty(clinic, user, area, professionalId)
        set({ clinic: next.clinic, user: next.user, activeSpecialty: area, demoBase: base })
      },
      clearActiveSpecialty: () => {
        const { clinic, user, demoBase } = get()
        if (!clinic || !user || !demoBase) { set({ activeSpecialty: null, demoBase: null }); return }
        const back = restoreDemoBase(clinic, user, demoBase)
        set({ clinic: back.clinic, user: back.user, activeSpecialty: null, demoBase: null })
      },
      setHydrated: () => set({ _hydrated: true }),
      setClinicLogo: (logo) => set((s) => s.clinic ? { clinic: { ...s.clinic, logo } } : {}),
      // O RPC de criar/editar usuário já grava a área nova em
      // clinics.specialties no banco — isso só espelha localmente pra não
      // repetir o mesmo bug do plano em cache (userLimitFor "1 de 1" com
      // plano completo): sem isso, o seletor de área da PRÓXIMA pessoa
      // criada não veria a área que acabou de ser adicionada até relogar.
      // Na demo com área ativa, clinic.specialties é só [área] (override de sessão): a área nova
      // vai pra lista original guardada em demoBase e a visão continua isolada na área escolhida.
      addClinicSpecialty: (type) => set((s) => {
        if (!s.clinic) return {}
        if (s.activeSpecialty && s.demoBase) {
          return s.demoBase.specialties.includes(type)
            ? {}
            : { demoBase: { ...s.demoBase, specialties: [...s.demoBase.specialties, type] } }
        }
        return !s.clinic.specialties.includes(type)
          ? { clinic: { ...s.clinic, specialties: [...s.clinic.specialties, type] } }
          : {}
      }),
      // (s.clinic.onboardingDismissed ?? []): sessões salvas no navegador antes
      // desse campo existir vêm sem ele — persist do zustand não migra dados
      // antigos sozinho, então sem o fallback isso quebraria pra quem já
      // estava logado no momento do deploy.
      dismissOnboardingItem: (key) => set((s) => s.clinic
        ? { clinic: { ...s.clinic, onboardingDismissed: Array.from(new Set([...(s.clinic.onboardingDismissed ?? []), key])) } }
        : {}),
      markOnboardingModalSeen: () => set((s) => s.clinic
        ? { clinic: { ...s.clinic, onboardingModalSeen: true } }
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
