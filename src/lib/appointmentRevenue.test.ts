import { describe, it, expect, vi, beforeEach } from 'vitest'
import { removeRevenueForAppointment } from './appointmentRevenue'
import { supabase } from '@/lib/supabase'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}))

vi.mock('@/components/ui/Toast', () => ({
  showToast: vi.fn(),
}))

vi.mock('@/components/ui/ConfirmDialog', () => ({
  confirmDialog: vi.fn(),
}))

describe('removeRevenueForAppointment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sempre filtra por clinic_id e appointment_id em financial_records e patient_credits', async () => {
    const deletedFilters: Record<string, Record<string, string>> = {}

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const filters: Record<string, string> = {}
      deletedFilters[table] = filters
      const chain: any = {
        delete: vi.fn().mockImplementation(() => chain),
        eq: vi.fn().mockImplementation((column: string, value: string) => {
          filters[column] = value
          return chain
        }),
        then: (resolve: (arg: { error: null }) => void) => Promise.resolve({ error: null }).then(resolve),
      }
      return chain
    })

    await removeRevenueForAppointment('clinic-abc', 'appt-xyz')

    expect(supabase.from).toHaveBeenCalledWith('financial_records')
    expect(deletedFilters['financial_records']).toEqual({
      clinic_id: 'clinic-abc',
      appointment_id: 'appt-xyz',
    })

    expect(supabase.from).toHaveBeenCalledWith('patient_credits')
    expect(deletedFilters['patient_credits']).toEqual({
      clinic_id: 'clinic-abc',
      appointment_id: 'appt-xyz',
    })
  })
})
