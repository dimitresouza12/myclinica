import { beforeEach, describe, expect, it, vi } from 'vitest'

// leitura inicial (clínicas com lead em aberto) e consultas por clínica (.eq('clinic_id', ...))
let openLeadClinics: string[] = []
const syncedClinics: string[] = []
let demoSet = new Set<string>()
let demoCalls: string[][] = []

vi.mock('@/lib/supabaseAdmin', () => ({
  getAdminClient: () => ({
    from: (_table: string) => {
      let clinic: string | null = null
      const chain = {
        select: () => chain,
        neq: () => chain,
        limit: () => chain,
        eq: (col: string, v: string) => { if (col === 'clinic_id') clinic = v; return chain },
        then: (res: (r: { data: unknown[] }) => unknown, rej?: (e: unknown) => unknown) => {
          if (clinic) { syncedClinics.push(clinic); return Promise.resolve({ data: [] }).then(res, rej) }
          return Promise.resolve({ data: openLeadClinics.map(clinic_id => ({ clinic_id })) }).then(res, rej)
        },
      }
      return chain
    },
  }),
}))
vi.mock('@/lib/demoGuard', () => ({
  demoClinicIds: async (ids: string[]) => { demoCalls.push(ids); return demoSet },
}))

import { syncAllClinics } from './sync'

beforeEach(() => {
  openLeadClinics = []
  syncedClinics.length = 0
  demoSet = new Set()
  demoCalls = []
})

describe('syncAllClinics', () => {
  it('não sincroniza clínica de demonstração', async () => {
    openLeadClinics = ['real-1', 'demo-1', 'real-2', 'demo-1']
    demoSet = new Set(['demo-1'])
    const r = await syncAllClinics()
    expect(syncedClinics.sort()).toEqual(['real-1', 'real-2'])
    expect(r.clinics).toBe(2)
    expect(demoCalls[0].sort()).toEqual(['demo-1', 'real-1', 'real-2'])
  })

  it('falha aberta: sem nenhuma demo identificada (coluna ausente ou erro), todas são sincronizadas', async () => {
    openLeadClinics = ['a', 'b']
    demoSet = new Set()
    const r = await syncAllClinics()
    expect(syncedClinics.sort()).toEqual(['a', 'b'])
    expect(r.clinics).toBe(2)
  })

  it('sem leads em aberto não consulta nada nem sincroniza', async () => {
    const r = await syncAllClinics()
    expect(syncedClinics).toEqual([])
    expect(r.clinics).toBe(0)
  })
})
