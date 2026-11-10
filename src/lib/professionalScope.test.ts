import { describe, expect, it } from 'vitest'
import { ownProfessionalLookup } from './professionalScope'
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
