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
  treatmentsCompleted: number
  treatmentsOpen: number
  avgTicket: number
}
export interface RevenueByCategory { category: string; value: number }
export type DashboardAlertReason = 'faltou' | 'sem_retorno' | 'aniversario'
export interface DashboardAlert {
  patientId: string
  name: string
  phone: string | null
  date: string
  reason: DashboardAlertReason
}

const OPEN_STATUSES = ['agendado', 'confirmado', 'em_atendimento']
const NO_SHOW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000   // faltas dos últimos 30 dias
const NO_RETURN_WINDOW_MS = 45 * 24 * 60 * 60 * 1000 // sem retorno após 45 dias do último atendimento concluído

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
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59).toISOString()
      const sixMonthsAgo = new Date(today.getFullYear(), today.getMonth() - 5, 1).toISOString()
      const twoHundredDaysAgo = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString()

      const [
        patientsRes, todayApptRes, pendingRes, allFinRes, newPatientsRes, recentRes,
        monthApptsRes, proceduresRes, alertApptsRes, birthdayPatientsRes,
      ] = await Promise.all([
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('is_active', true),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).gte('scheduled_at', startOfDay).lte('scheduled_at', endOfDay),
        supabase.from('appointments').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('status', 'agendado'),
        supabase.from('financial_records').select('total_amount, type, created_at, patient_id, procedure_id').eq('clinic_id', clinicId).gte('created_at', sixMonthsAgo),
        supabase.from('patients').select('id', { count: 'exact', head: true }).eq('clinic_id', clinicId).eq('is_active', true).gte('created_at', startOfMonth),
        supabase.from('appointments').select('*, patients(name, phone)').eq('clinic_id', clinicId).gte('scheduled_at', now).order('scheduled_at', { ascending: true }).limit(8),
        supabase.from('appointments').select('status').eq('clinic_id', clinicId).gte('scheduled_at', startOfMonth).lte('scheduled_at', endOfMonth),
        supabase.from('procedures').select('id, category').eq('clinic_id', clinicId),
        supabase.from('appointments').select('id, patient_id, status, scheduled_at, patients(name, phone)').eq('clinic_id', clinicId).gte('scheduled_at', twoHundredDaysAgo).order('scheduled_at', { ascending: false }),
        supabase.from('patients').select('id, name, phone, birth_date').eq('clinic_id', clinicId).eq('is_active', true).not('birth_date', 'is', null),
      ])

      const allFin = (allFinRes.data ?? []) as Pick<FinancialRecord, 'total_amount' | 'type' | 'created_at' | 'patient_id' | 'procedure_id'>[]

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
      const monthRevenueRecords = currentMonthFin.filter(r => r.type === 'receita')
      const monthRevenue = monthRevenueRecords.reduce((s, r) => s + (r.total_amount ?? 0), 0)
      const monthExpense = currentMonthFin.filter(r => r.type === 'despesa').reduce((s, r) => s + (r.total_amount ?? 0), 0)

      // Ticket médio do mês = receita do mês / pacientes distintos que pagaram no mês
      const distinctPayingPatients = new Set(monthRevenueRecords.map(r => r.patient_id).filter(Boolean)).size
      const avgTicket = distinctPayingPatients > 0 ? monthRevenue / distinctPayingPatients : 0

      // Tratamentos concluídos vs. em aberto (agendamentos do mês corrente)
      const monthAppts = (monthApptsRes.data ?? []) as { status: string }[]
      const treatmentsCompleted = monthAppts.filter(a => a.status === 'concluido').length
      const treatmentsOpen = monthAppts.filter(a => OPEN_STATUSES.includes(a.status)).length

      // Receita por categoria de procedimento (mês corrente)
      const categoryById: Record<string, string> = {}
      for (const p of (proceduresRes.data ?? []) as { id: string; category: string | null }[]) {
        categoryById[p.id] = p.category?.trim() || 'Outros'
      }
      const revenueByCategoryMap: Record<string, number> = {}
      for (const r of monthRevenueRecords) {
        const cat = r.procedure_id ? (categoryById[r.procedure_id] ?? 'Outros') : 'Outros'
        revenueByCategoryMap[cat] = (revenueByCategoryMap[cat] ?? 0) + (r.total_amount ?? 0)
      }
      const revenueByCategory: RevenueByCategory[] = Object.entries(revenueByCategoryMap)
        .map(([category, value]) => ({ category, value }))
        .sort((a, b) => b.value - a.value)

      // Widget de atenção: faltas sem reagendamento + sem retorno após atendimento concluído
      type AlertAppt = { id: string; patient_id: string; status: string; scheduled_at: string; patients: { name: string; phone: string | null } | null }
      const alertAppts = (alertApptsRes.data ?? []) as unknown as AlertAppt[]
      const nowMs = Date.now()
      const hasFutureAppt = new Set(
        alertAppts.filter(a => a.status !== 'cancelado' && new Date(a.scheduled_at).getTime() > nowMs).map(a => a.patient_id)
      )

      const noShowAlerts: DashboardAlert[] = alertAppts
        .filter(a => a.status === 'faltou'
          && (nowMs - new Date(a.scheduled_at).getTime()) <= NO_SHOW_WINDOW_MS
          && !hasFutureAppt.has(a.patient_id))
        .map(a => ({ patientId: a.patient_id, name: a.patients?.name ?? '—', phone: a.patients?.phone ?? null, date: a.scheduled_at, reason: 'faltou' as const }))

      const latestByPatient = new Map<string, AlertAppt>()
      for (const a of alertAppts) {
        const cur = latestByPatient.get(a.patient_id)
        if (!cur || new Date(a.scheduled_at) > new Date(cur.scheduled_at)) latestByPatient.set(a.patient_id, a)
      }
      const noReturnAlerts: DashboardAlert[] = []
      for (const last of latestByPatient.values()) {
        if (last.status === 'concluido'
          && (nowMs - new Date(last.scheduled_at).getTime()) >= NO_RETURN_WINDOW_MS
          && !hasFutureAppt.has(last.patient_id)) {
          noReturnAlerts.push({ patientId: last.patient_id, name: last.patients?.name ?? '—', phone: last.patients?.phone ?? null, date: last.scheduled_at, reason: 'sem_retorno' })
        }
      }

      // Aniversariantes de hoje (compara mês/dia direto da string 'YYYY-MM-DD' — evita desvio de fuso)
      const birthdayAlerts: DashboardAlert[] = ((birthdayPatientsRes.data ?? []) as { id: string; name: string; phone: string | null; birth_date: string }[])
        .filter(p => {
          const parts = p.birth_date.split('-')
          return Number(parts[1]) === today.getMonth() + 1 && Number(parts[2]) === today.getDate()
        })
        .map(p => ({ patientId: p.id, name: p.name, phone: p.phone, date: p.birth_date, reason: 'aniversario' as const }))

      const alerts: DashboardAlert[] = [...noShowAlerts, ...birthdayAlerts, ...noReturnAlerts]

      return {
        stats: {
          totalPatients: patientsRes.count ?? 0,
          appointmentsToday: todayApptRes.count ?? 0,
          pendingAppointments: pendingRes.count ?? 0,
          newPatientsMonth: newPatientsRes.count ?? 0,
          monthRevenue,
          monthExpense,
          treatmentsCompleted,
          treatmentsOpen,
          avgTicket,
        } as DashboardStats,
        recentAppts: (recentRes.data ?? []) as Appointment[],
        monthlyData: Object.values(monthMap),
        revenueByCategory,
        alerts,
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
