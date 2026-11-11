import { describe, expect, it } from 'vitest'
import { isScopedProfessional, ownProfessionalLookup } from './professionalScope'
import type { AuthUser } from '@/types'

const user = (over: Partial<AuthUser>): AuthUser => ({
  id: 'u', clinicUserId: 'cu', role: 'admin', specialtyType: null, displayName: 'x', isSuperAdmin: false, professionalId: null, ...over,
})

describe('ownProfessionalLookup', () => {
  it('prefere o professionalId da sessão (profissional da área escolhida na demo)', () => {
    expect(ownProfessionalLookup(user({ professionalId: 'p1' }))).toEqual({ column: 'id', value: 'p1' })
  })

  it('sem professionalId, cai no vínculo clinic_user_id como antes', () => {
    expect(ownProfessionalLookup(user({ professionalId: null }))).toEqual({ column: 'clinic_user_id', value: 'cu' })
  })

  it('sem nenhum dos dois ou sem usuário, não há o que buscar', () => {
    expect(ownProfessionalLookup(user({ professionalId: null, clinicUserId: null }))).toBeNull()
    expect(ownProfessionalLookup(null)).toBeNull()
    expect(ownProfessionalLookup(undefined)).toBeNull()
  })
})

describe('isScopedProfessional', () => {
  const on = { professionalScopedAccess: true }
  it('só vale com a flag da clínica ligada e papel que não é admin/recepção/superadmin', () => {
    expect(isScopedProfessional(on, user({ role: 'profissional' }))).toBe(true)
    expect(isScopedProfessional(on, user({ role: 'dentista' }))).toBe(true)
  })
  it('admin, recepção e superadmin mantêm o cadastro', () => {
    expect(isScopedProfessional(on, user({ role: 'admin' }))).toBe(false)
    expect(isScopedProfessional(on, user({ role: 'recepcao' }))).toBe(false)
    expect(isScopedProfessional(on, user({ role: 'profissional', isSuperAdmin: true }))).toBe(false)
  })
  it('clínica sem a flag (ou sem dados) não restringe', () => {
    expect(isScopedProfessional({ professionalScopedAccess: false }, user({ role: 'profissional' }))).toBe(false)
    expect(isScopedProfessional({}, user({ role: 'profissional' }))).toBe(false)
    expect(isScopedProfessional(null, user({ role: 'profissional' }))).toBe(false)
    expect(isScopedProfessional(on, null)).toBe(false)
  })
})
