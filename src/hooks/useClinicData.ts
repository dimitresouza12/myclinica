import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Professional, Procedure, Appointment, Patient, StockItem, StockMovement, FinancialRecord } from '@/types'

// Busca TODOS (ativos + inativos) para que dados históricos sejam resolvidos.
// Filtrar ativos deve ser feito no ponto de uso (dropdown, listas de equipe).
export function useProfessionals(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['professionals', clinicId],
    queryFn: async () => {
      if (!clinicId) return []
      const { data } = await supabase
        .from('professionals')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('name')
      return (data ?? []) as Professional[]
    },
    enabled: !!clinicId,
    staleTime: 10 * 60 * 1000,
  })
}

export function useProcedures(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['procedures', clinicId],
    queryFn: async () => {
      if (!clinicId) return []
      const { data } = await supabase
        .from('procedures')
        .select('id, name, price, category, is_active')
        .eq('clinic_id', clinicId)
        .order('name')
      return (data ?? []) as Procedure[]
    },
    enabled: !!clinicId,
    staleTime: 10 * 60 * 1000,
  })
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

interface MonthlyData { month: string; receita: number; despesa: number }
interface DashboardStats {
  totalPatients: number
  appointmentsToday: number
  monthRevenue: number
  monthExpense: number
  pendingAppointments: number
  newPatientsMonth: number
}

export function useDashboardData(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', clinicId],
    queryFn: async () => {
      if (!clinicId) return null
      const today = new Date()
      const now = new Date().toISOString()
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0).toISOString()
      const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).toISOString()
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
      const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString()

      const [patientsRes, todayApptRes, pendingRes, allFinRes, newPatientsRes, recentRes] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('is_active', true),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).gte('scheduled_at', startOfDay).lte('scheduled_at', endOfDay),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('status', 'agendado'),
        supabase.from('financial_records').select('total_amount, type, created_at').eq('clinic_id', clinicId).gte('created_at', sixMonthsAgo),
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('is_active', true).gte('created_at', startOfMonth),
        supabase.from('appointments').select('*, patients(name, phone)').eq('clinic_id', clinicId).gte('scheduled_at', now).order('scheduled_at', { ascending: true }).limit(8),
      ])

      const allFin = (allFinRes.data ?? []) as Pick<FinancialRecord, 'total_amount' | 'type' | 'created_at'>[]

      const monthMap: Record<string, MonthlyData> = {}
      for (let i = 5; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        const label = d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '')
        monthMap[key] = { month: label, receita: 0, despesa: 0 }
      }
      allFin.forEach((r) => {
        const key = r.created_at!.slice(0, 7)
        if (!monthMap[key]) return
        if (r.type === 'receita') monthMap[key].receita += r.total_amount ?? 0
        else monthMap[key].despesa += r.total_amount ?? 0
      })

      const currentMonthFin = allFin.filter(r => r.created_at!.slice(0, 7) === startOfMonth.slice(0, 7))
      const monthRevenue = currentMonthFin.filter(r => r.type === 'receita').reduce((s, r) => s + (r.total_amount ?? 0), 0)
      const monthExpense = currentMonthFin.filter(r => r.type === 'despesa').reduce((s, r) => s + (r.total_amount ?? 0), 0)

      return {
        stats: {
          totalPatients: patientsRes.count ?? 0,
          appointmentsToday: todayApptRes.count ?? 0,
          pendingAppointments: pendingRes.count ?? 0,
          newPatientsMonth: newPatientsRes.count ?? 0,
          monthRevenue,
          monthExpense,
        } as DashboardStats,
        recentAppts: (recentRes.data ?? []) as Appointment[],
        monthlyData: Object.values(monthMap),
      }
    },
    enabled: !!clinicId,
    staleTime: 2 * 60 * 1000,
  })
}

// ── Pacientes + Atendimentos ───────────────────────────────────────────────────

export function usePacientesData(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['pacientes', clinicId],
    queryFn: async () => {
      if (!clinicId) return { appointments: [], patients: [] }
      const [apptRes, patRes] = await Promise.all([
        supabase.from('appointments').select('*, patients(id, name, phone)').eq('clinic_id', clinicId).order('scheduled_at', { ascending: false }),
        supabase.from('patients').select('*').eq('clinic_id', clinicId).eq('is_active', true).order('name'),
      ])
      return {
        appointments: (apptRes.data ?? []) as Appointment[],
        patients: (patRes.data ?? []) as Patient[],
      }
    },
    enabled: !!clinicId,
    staleTime: 3 * 60 * 1000,
  })
}

// ── Agenda ────────────────────────────────────────────────────────────────────

export function useAgendaData(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['agenda', clinicId],
    queryFn: async () => {
      if (!clinicId) return { appointments: [], patients: [] }
      const threeMonthsAgo = new Date()
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
      const [apptRes, patRes] = await Promise.all([
        supabase.from('appointments').select('*, patients(id, name, phone), professionals(id, name)').eq('clinic_id', clinicId).gte('scheduled_at', threeMonthsAgo.toISOString()).order('scheduled_at', { ascending: true }),
        supabase.from('patients').select('id, name, phone').eq('clinic_id', clinicId).eq('is_active', true).order('name'),
      ])
      return {
        appointments: (apptRes.data ?? []) as Appointment[],
        patients: (patRes.data ?? []) as Patient[],
      }
    },
    enabled: !!clinicId,
    staleTime: 3 * 60 * 1000,
  })
}

// ── Financeiro ────────────────────────────────────────────────────────────────

export function useFinanceiroData(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['financeiro', clinicId],
    queryFn: async () => {
      if (!clinicId) return { records: [], patients: [] }
      const [recRes, patRes] = await Promise.all([
        supabase.from('financial_records').select('*, patients(id, name)').eq('clinic_id', clinicId).order('created_at', { ascending: false }),
        supabase.from('patients').select('id, name').eq('clinic_id', clinicId).eq('is_active', true).order('name'),
      ])
      return {
        records: (recRes.data ?? []) as FinancialRecord[],
        patients: (patRes.data ?? []) as Patient[],
      }
    },
    enabled: !!clinicId,
    staleTime: 3 * 60 * 1000,
  })
}

// ── Estoque ───────────────────────────────────────────────────────────────────

export function useEstoqueData(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['estoque', clinicId],
    queryFn: async () => {
      if (!clinicId) return { items: [], movements: [] }
      const [itemsRes, movRes] = await Promise.all([
        supabase.from('stock_items').select('*').eq('clinic_id', clinicId).eq('is_active', true).order('name'),
        supabase.from('stock_movements').select('*, stock_items(id, name, unit)').eq('clinic_id', clinicId).order('created_at', { ascending: false }).limit(200),
      ])
      return {
        items: (itemsRes.data ?? []) as StockItem[],
        movements: (movRes.data ?? []) as StockMovement[],
      }
    },
    enabled: !!clinicId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Relatórios ────────────────────────────────────────────────────────────────

export function useRelatoriosRawData(clinicId: string | undefined, period: string) {
  return useQuery({
    queryKey: ['relatorios-raw', clinicId, period],
    queryFn: async () => {
      if (!clinicId) return { fins: [], appts: [], pats: [] }
      const now = new Date()
      const months = period === '3m' ? 3 : period === '6m' ? 6 : 12
      const startDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1).toISOString()
      const [finRes, apptRes, patRes] = await Promise.all([
        supabase.from('financial_records').select('total_amount,type,created_at,procedure_id').eq('clinic_id', clinicId).gte('created_at', startDate),
        supabase.from('appointments').select('status,procedure_name,professional_id,scheduled_at,patients(name)').eq('clinic_id', clinicId).gte('scheduled_at', startDate),
        supabase.from('patients').select('id,created_at,lgpd_consent').eq('clinic_id', clinicId).eq('is_active', true),
      ])
      return {
        fins: finRes.data ?? [],
        appts: apptRes.data ?? [],
        pats: patRes.data ?? [],
      }
    },
    enabled: !!clinicId,
    staleTime: 5 * 60 * 1000,
  })
}
