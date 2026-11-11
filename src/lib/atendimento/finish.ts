// Finalizar atendimento: grava o fim e marca "atendido" (concluido) e dispara o mesmo que a Agenda e o Dashboard
// já disparam ao concluir (receita/pacote/saldo). ensureRevenueForAppointment é idempotente: se a receita já
// existe para a consulta, devolve 'existing' em vez de lançar de novo. Nenhuma baixa de estoque nasce de "concluido" hoje.
import { supabase } from '@/lib/supabase'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { ensureRevenueForAppointment, notifyRevenuePending, promptCreditUsage } from '@/lib/appointmentRevenue'
import type { Appointment } from '@/types'
import { runFlowAction, type FlowContext } from './api'
import type { FlowPatch } from './status'

export type FinishOutcome =
  | { status: 'finished'; patch: FlowPatch; creditUsed: boolean }
  | { status: 'cancelled' }
  | { status: 'error'; message: string }

export async function finishAttendance(ctx: FlowContext, appointmentId: string): Promise<FinishOutcome> {
  const { data: row, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', appointmentId)
    .eq('clinic_id', ctx.clinicId)
    .maybeSingle()
  if (error || !row) return { status: 'error', message: 'Não foi possível carregar o agendamento.' }
  const appt = row as Appointment

  // mesmo aviso da Agenda: sem preço e sem pacote, nenhuma receita será lançada
  let isFree = false
  if (appt.procedure_id) {
    const { data: proc } = await supabase.from('procedures').select('is_free').eq('id', appt.procedure_id).eq('clinic_id', ctx.clinicId).maybeSingle()
    isFree = !!(proc as { is_free?: boolean } | null)?.is_free
  }
  const priceIsPending = !appt.package_id && !(appt.procedure_price && appt.procedure_price > 0) && !isFree
  if (priceIsPending) {
    const go = await confirmDialog({
      message: 'Este procedimento está sem preço definido — nenhuma receita será lançada no Financeiro ao finalizar. Deseja continuar mesmo assim?',
      confirmText: 'Finalizar mesmo assim',
    })
    if (!go) return { status: 'cancelled' }
  }

  const res = await runFlowAction(ctx, appt, 'finish')
  if (!res.ok) return { status: 'error', message: res.error }

  const concluded = { ...appt, ...res.patch, status: 'concluido' as const } as Appointment
  const creditUsage = await promptCreditUsage(ctx.clinicId, concluded.patient_id, concluded)
  const result = await ensureRevenueForAppointment(ctx.clinicId, concluded, creditUsage)
  notifyRevenuePending(result, concluded)
  return { status: 'finished', patch: res.patch, creditUsed: creditUsage.useCredit }
}
