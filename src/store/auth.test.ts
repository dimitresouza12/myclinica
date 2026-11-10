import { beforeEach, describe, expect, it, vi } from 'vitest'

// o store usa persist (localStorage); no ambiente node não existe, então entra um stub em memória
vi.hoisted(() => {
  const mem = new Map<string, string>()
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => { mem.set(k, v) },
    removeItem: (k: string) => { mem.delete(k) },
    clear: () => mem.clear(),
    key: () => null,
    length: 0,
  } as Storage
})

import { useAuthStore } from './auth'
import type { AuthClinic, AuthUser } from '@/types'

function makeClinic(over: Partial<AuthClinic> = {}): AuthClinic {
  return {
    id: 'c1', name: 'Demo', type: 'estetica', logo: '', address: '', phone: '', color: '#0D9488', slug: 'demo',
    plan: 'completo', maxUsers: null, founderIsProfessional: null, founderHasTeam: null, isMultiSpecialty: false,
    specialties: ['estetica', 'odonto'], status: 'active', trialEndsAt: null, gcalConnected: false, billingPaid: true,
    asaasCustomerId: null, asaasSubscriptionId: null, billingOverdueSince: null, nextBillingDate: null,
    monthlyRevenueGoal: null, onboardingDismissed: [], onboardingModalSeen: true, ...over,
  }
}
const makeUser = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: 'u1', clinicUserId: 'cu1', role: 'admin', specialtyType: null, displayName: 'Admin', isSuperAdmin: false, professionalId: null, ...over,
})

const s = () => useAuthStore.getState()

beforeEach(() => { s().clearSession() })

describe('área ativa na conta de demonstração', () => {
  it('setActiveSpecialty sobrescreve type, specialtyType e professionalId na sessão', () => {
    s().setSession(makeClinic({ demoMode: true }), makeUser())
    s().setActiveSpecialty('vet', 'p-vet')
    expect(s().activeSpecialty).toBe('vet')
    expect(s().clinic?.type).toBe('vet')
    expect(s().user?.specialtyType).toBe('vet')
    expect(s().user?.professionalId).toBe('p-vet')
    expect(s().demoBase).toEqual({ type: 'estetica', specialties: ['estetica', 'odonto'], specialtyType: null, professionalId: null })
    expect(s().clinic?.specialties).toEqual(['vet'])
  })

  it('sem profissional na área, professionalId fica null em vez de herdar o de outra área', () => {
    s().setSession(makeClinic({ demoMode: true }), makeUser({ professionalId: 'p-antigo' }))
    s().setActiveSpecialty('fono')
    expect(s().user?.professionalId).toBeNull()
  })

  it('não faz nada em clínica que não é demonstração', () => {
    s().setSession(makeClinic({ demoMode: false }), makeUser())
    s().setActiveSpecialty('vet', 'p-vet')
    expect(s().activeSpecialty).toBeNull()
    expect(s().clinic?.type).toBe('estetica')
    expect(s().user?.specialtyType).toBeNull()

    s().setSession(makeClinic(), makeUser()) // sem o campo (clínica de cliente)
    s().setActiveSpecialty('psico')
    expect(s().clinic?.type).toBe('estetica')
    expect(s().activeSpecialty).toBeNull()
  })

  it('trocar de área várias vezes mantém a base original', () => {
    s().setSession(makeClinic({ demoMode: true }), makeUser({ professionalId: 'p0' }))
    s().setActiveSpecialty('vet', 'p1')
    s().setActiveSpecialty('nutri', 'p2')
    expect(s().clinic?.type).toBe('nutri')
    expect(s().demoBase).toEqual({ type: 'estetica', specialties: ['estetica', 'odonto'], specialtyType: null, professionalId: 'p0' })
    expect(s().clinic?.specialties).toEqual(['nutri'])
  })

  it('setSession com dados velhos (snapshot do layout) não desfaz a escolha', () => {
    const c = makeClinic({ demoMode: true, specialties: ['estetica', 'nutri'] })
    const u = makeUser()
    s().setSession(c, u)
    s().setActiveSpecialty('odonto', 'p-odonto')
    s().setSession({ ...c, billingPaid: false }, u) // snapshot anterior à escolha
    expect(s().clinic?.type).toBe('odonto')
    expect(s().clinic?.specialties).toEqual(['odonto'])
    expect(s().clinic?.billingPaid).toBe(false)
    expect(s().user?.specialtyType).toBe('odonto')
    expect(s().user?.professionalId).toBe('p-odonto')
    expect(s().activeSpecialty).toBe('odonto')
  })

  it('setSession sem o campo demoMode (snapshot antigo) mantém a escolha', () => {
    s().setSession(makeClinic({ demoMode: true }), makeUser())
    s().setActiveSpecialty('to', 'p-to')
    s().setSession(makeClinic(), makeUser())
    expect(s().clinic?.type).toBe('to')
    expect(s().clinic?.specialties).toEqual(['to'])
    expect(s().clinic?.demoMode).toBe(true)
    expect(s().user?.professionalId).toBe('p-to')
    expect(s().user?.specialtyType).toBe('to')
  })

  it('demoMode virando false restaura type, specialties, specialtyType e professionalId originais', () => {
    s().setSession(
      makeClinic({ demoMode: true, specialties: ['estetica', 'nutri'] }),
      makeUser({ specialtyType: 'estetica', professionalId: 'p0' }),
    )
    s().setActiveSpecialty('fisio', 'p-fisio')
    expect(s().clinic?.specialties).toEqual(['fisio'])
    s().setSession({ ...makeClinic({ demoMode: false }), type: 'fisio', specialties: ['fisio'] }, s().user!)
    expect(s().activeSpecialty).toBeNull()
    expect(s().clinic?.type).toBe('estetica')
    expect(s().clinic?.specialties).toEqual(['estetica', 'nutri'])
    expect(s().user?.specialtyType).toBe('estetica')
    expect(s().user?.professionalId).toBe('p0')
  })

  it('outro usuário na mesma clínica demo começa sem escolha, mesmo sem clearSession', () => {
    s().setSession(makeClinic({ demoMode: true }), makeUser({ id: 'u1', professionalId: 'p-u1' }))
    s().setActiveSpecialty('vet', 'p-vet')
    s().setSession(makeClinic({ demoMode: true }), makeUser({ id: 'u2', professionalId: 'p-u2' }))
    expect(s().activeSpecialty).toBeNull()
    expect(s().demoBase).toBeNull()
    expect(s().clinic?.type).toBe('estetica')
    expect(s().clinic?.specialties).toEqual(['estetica', 'odonto'])
    expect(s().user?.id).toBe('u2')
    expect(s().user?.specialtyType).toBeNull()
    expect(s().user?.professionalId).toBe('p-u2')
  })

  it('addClinicSpecialty com área ativa não infla clinic.specialties: soma só na base', () => {
    s().setSession(makeClinic({ demoMode: true }), makeUser())
    s().setActiveSpecialty('vet', 'p')
    s().addClinicSpecialty('fono')
    s().addClinicSpecialty('fono') // repetida não duplica
    expect(s().clinic?.specialties).toEqual(['vet'])
    expect(s().demoBase?.specialties).toEqual(['estetica', 'odonto', 'fono'])
    s().clearActiveSpecialty()
    expect(s().clinic?.specialties).toEqual(['estetica', 'odonto', 'fono'])
  })

  it('addClinicSpecialty sem área ativa continua somando em clinic.specialties', () => {
    s().setSession(makeClinic({ demoMode: false }), makeUser())
    s().addClinicSpecialty('fono')
    s().addClinicSpecialty('fono')
    expect(s().clinic?.specialties).toEqual(['estetica', 'odonto', 'fono'])
    expect(s().demoBase).toBeNull()
  })

  it('setSession de outra clínica (novo login) descarta a escolha', () => {
    s().setSession(makeClinic({ demoMode: true }), makeUser())
    s().setActiveSpecialty('vet', 'p')
    s().setSession(makeClinic({ id: 'c2', type: 'odonto', demoMode: false }), makeUser())
    expect(s().activeSpecialty).toBeNull()
    expect(s().demoBase).toBeNull()
    expect(s().clinic?.type).toBe('odonto')
  })

  it('clearActiveSpecialty restaura a sessão original', () => {
    s().setSession(makeClinic({ demoMode: true }), makeUser({ specialtyType: null, professionalId: 'p0' }))
    s().setActiveSpecialty('psico', 'p-psico')
    s().clearActiveSpecialty()
    expect(s().activeSpecialty).toBeNull()
    expect(s().clinic?.type).toBe('estetica')
    expect(s().user?.specialtyType).toBeNull()
    expect(s().user?.professionalId).toBe('p0')
    expect(s().clinic?.specialties).toEqual(['estetica', 'odonto'])
  })

  it('clearSession (logout) zera a escolha para o seletor reaparecer no próximo login', () => {
    s().setSession(makeClinic({ demoMode: true }), makeUser())
    s().setActiveSpecialty('vet', 'p')
    s().clearSession()
    expect(s().activeSpecialty).toBeNull()
    expect(s().demoBase).toBeNull()
    expect(s().clinic).toBeNull()
  })

  it('outras ações que escrevem clinic (logo, onboarding) preservam a escolha', () => {
    s().setSession(makeClinic({ demoMode: true }), makeUser())
    s().setActiveSpecialty('nutri', 'p')
    s().setClinicLogo('x.png')
    s().markOnboardingModalSeen()
    expect(s().clinic?.type).toBe('nutri')
    expect(s().clinic?.logo).toBe('x.png')
  })
})
