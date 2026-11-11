import { supabase } from '@/lib/supabase'
import { showToast } from '@/components/ui/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { formatCurrency } from '@/lib/utils'
import { lowBalanceMessage } from '@/lib/agenda/packages'
import { resolveSessionPackage, unlinkAppointmentFromPackage } from '@/lib/agenda/packagesApi'
import type { Appointment } from '@/types'

export type EnsureRevenueResult =
  | { status: 'created'; recordId: string; partialCredit?: { consumedAmount: number; remainingBalance: number } }
  | { status: 'existing'; recordId: string }
  | { status: 'covered_by_credit'; consumedAmount: number; remainingBalance: number }
  // a consulta consumiu 1 sessão de um pacote de sessões: a receita foi lançada na venda do pacote, não há nova cobrança
  | { status: 'covered_by_package'; packageName: string; used: number; total: number; remaining: number }
  | { status: 'no_price' }
  | { status: 'error'; errorMessage: string }

export interface CreditUsage { useCredit: boolean; availableBalance: number }

// Soma o saldo de crédito do paciente e, se houver, pergunta na hora se este
// atendimento deve descontar dele — nem todo atendimento de um paciente com
// saldo é necessariamente parte do pacote, então a escolha é sempre manual.
// Sem saldo, não interrompe nada (retorna direto, sem diálogo).
// Consulta que consome sessão de pacote não pergunta nada: já está paga pelo pacote.
export async function promptCreditUsage(clinicId: string, patientId: string | null, appt?: { id: string; package_id?: string | null }): Promise<CreditUsage> {
  if (!patientId) return { useCredit: false, availableBalance: 0 }
  if (appt) {
    const pkg = await resolveSessionPackage(clinicId, appt)
    if (pkg?.consumable) return { useCredit: false, availableBalance: 0 }
  }
  const { data } = await supabase.from('patient_credits').select('amount').eq('clinic_id', clinicId).eq('patient_id', patientId)
  const availableBalance = (data ?? []).reduce((sum, r) => sum + Number(r.amount), 0)
  if (availableBalance <= 0) return { useCredit: false, availableBalance: 0 }
  const useCredit = await confirmDialog({
    title: 'Saldo de pacote disponível',
    message: `Este paciente tem ${formatCurrency(availableBalance)} de saldo. Descontar este atendimento do saldo do pacote?`,
    confirmText: 'Sim, descontar do saldo',
    cancelText: 'Não, cobrar normal',
  })
  return { useCredit, availableBalance }
}

// Lança a receita de um agendamento concluído — compartilhado entre Agenda e
// Dashboard pra evitar que os dois fluxos de "concluir" divirjam. Nunca
// pergunta forma de pagamento aqui (quem concluiu o agendamento pode não ser
// quem recebeu), por isso payment_method sempre entra null.
export async function ensureRevenueForAppointment(clinicId: string, original: Appointment, creditUsage?: CreditUsage): Promise<EnsureRevenueResult> {
  let appt = original
  // Consulta de pacote de sessões: consome 1 sessão (derivada do status concluído, nada a gravar aqui) e NÃO gera
  // receita nem desconta o saldo em R$, senão a venda do pacote seria cobrada de novo a cada sessão.
  const sessionPackage = await resolveSessionPackage(clinicId, appt)
  if (sessionPackage) {
    if (sessionPackage.consumable) {
      return { status: 'covered_by_package', packageName: sessionPackage.pkg.name, used: sessionPackage.used, total: sessionPackage.total, remaining: sessionPackage.remaining }
    }
    // pacote esgotado ou cancelado: a consulta sai do pacote e é cobrada normalmente
    const unlinkErr = await unlinkAppointmentFromPackage(clinicId, appt.id)
    if (unlinkErr) return { status: 'error', errorMessage: unlinkErr }
    let price = appt.procedure_price
    if (!(price && price > 0) && appt.procedure_id) {
      const { data: proc } = await supabase.from('procedures').select('price').eq('id', appt.procedure_id).eq('clinic_id', clinicId).maybeSingle()
      price = (proc as { price: number } | null)?.price ?? price
      if (price && price > 0) await supabase.from('appointments').update({ procedure_price: price }).eq('id', appt.id).eq('clinic_id', clinicId)
    }
    appt = { ...appt, package_id: null, procedure_price: price ?? null }
    showToast('error', sessionPackage.reason === 'cancelado'
      ? 'O pacote desta consulta foi cancelado: ela foi cobrada como consulta avulsa.'
      : 'O pacote desta consulta já usou todas as sessões: ela foi cobrada como consulta avulsa.')
  }
  // procedure_id pode ser null (procedimento "Outro (digitar)" não tem
  // cadastro na tabela procedures), mas ainda assim tem um valor cobrado que
  // precisa aparecer no Financeiro.
  if (!appt.procedure_price || appt.procedure_price <= 0) return { status: 'no_price' }
  const { data: existing, error: selErr } = await supabase
    .from('financial_records')
    .select('id')
    .eq('clinic_id', clinicId)
    .eq('appointment_id', appt.id)
    .maybeSingle()
  // Erro na leitura (ex: usuário sem financeiro.can_view via RLS) não pode
  // virar "existing" nem "created" por omissão — precisa avisar em vez de
  // mentir que a receita foi lançada.
  if (selErr) return { status: 'error', errorMessage: selErr.message }
  if (existing) return { status: 'existing', recordId: existing.id }

  let remainingPrice = appt.procedure_price
  let consumedAmount = 0
  let remainingBalance = 0
  if (creditUsage?.useCredit && appt.patient_id) {
    consumedAmount = Math.min(creditUsage.availableBalance, appt.procedure_price)
    remainingBalance = creditUsage.availableBalance - consumedAmount
    remainingPrice = appt.procedure_price - consumedAmount
    const { error: creditErr } = await supabase.from('patient_credits').insert([{
      clinic_id: clinicId,
      patient_id: appt.patient_id,
      amount: -consumedAmount,
      type: 'consumo',
      appointment_id: appt.id,
      notes: appt.procedure_name,
    }])
    if (creditErr) return { status: 'error', errorMessage: creditErr.message }
    if (remainingPrice <= 0) return { status: 'covered_by_credit', consumedAmount, remainingBalance }
  }

  const { data: inserted, error: insErr } = await supabase.from('financial_records').insert([{
    clinic_id: clinicId,
    patient_id: appt.patient_id ?? null,
    appointment_id: appt.id,
    procedure_id: appt.procedure_id ?? null,
    professional_id: appt.professional_id ?? null,
    total_amount: remainingPrice,
    category: 'Procedimento',
    type: 'receita',
    payment_method: null,
    notes: appt.procedure_name,
  }]).select('id').single()
  if (insErr || !inserted) return { status: 'error', errorMessage: insErr?.message ?? 'Falha ao criar a receita.' }
  return consumedAmount > 0
    ? { status: 'created', recordId: inserted.id, partialCredit: { consumedAmount, remainingBalance } }
    : { status: 'created', recordId: inserted.id }
}

export function notifyRevenuePending(result: EnsureRevenueResult, appt: Appointment) {
  if (result.status === 'covered_by_package') {
    const tail = result.remaining === 0 ? 'pacote concluído.' : (lowBalanceMessage(result.remaining) ?? `restam ${result.remaining} sessões.`)
    showToast('ok', `Agendamento concluído! Sessão ${result.used}/${result.total} do pacote ${result.packageName}, sem nova cobrança. ${tail.charAt(0).toUpperCase()}${tail.slice(1)}`)
  } else if (result.status === 'covered_by_credit') {
    showToast('ok', `Agendamento concluído! ${formatCurrency(result.consumedAmount)} descontados do saldo do pacote — saldo restante: ${formatCurrency(result.remainingBalance)}.`)
  } else if (result.status === 'created' && result.partialCredit) {
    showToast('ok', `Agendamento concluído! ${formatCurrency(result.partialCredit.consumedAmount)} descontados do saldo do pacote (saldo zerado) — ${formatCurrency((appt.procedure_price ?? 0) - result.partialCredit.consumedAmount)} ainda precisam de forma de pagamento.`, {
      href: `/financeiro?record=${result.recordId}`,
      actionLabel: 'Definir pagamento',
    })
  } else if (result.status === 'created') {
    showToast('ok', 'Agendamento concluído! Receita lançada — defina a forma de pagamento em Financeiro.', {
      href: `/financeiro?record=${result.recordId}`,
      actionLabel: 'Definir pagamento',
    })
  } else if (result.status === 'no_price') {
    const params = new URLSearchParams({ new: 'receita' })
    if (appt.patient_id) params.set('patient', appt.patient_id)
    if (appt.procedure_name) params.set('notes', appt.procedure_name)
    showToast('ok', 'Agendamento concluído! Lembre-se de lançar a receita manualmente em Financeiro.', {
      href: `/financeiro?${params.toString()}`,
      actionLabel: 'Lançar receita',
    })
  } else if (result.status === 'error') {
    showToast('error', 'Agendamento concluído, mas a receita não pôde ser lançada automaticamente. Lance manualmente em Financeiro.', {
      href: '/financeiro',
      actionLabel: 'Ir para Financeiro',
    })
  }
}

export async function removeRevenueForAppointment(clinicId: string, apptId: string) {
  const { error } = await supabase.from('financial_records').delete().eq('clinic_id', clinicId).eq('appointment_id', apptId)
  // Sem checar isso, quem não tem financeiro.can_edit via RLS teria a
  // exclusão silenciosamente ignorada (0 linhas afetadas) e a receita
  // ficaria órfã no Financeiro sem ninguém saber.
  if (error) {
    showToast('error', 'Não foi possível remover a receita vinculada a este agendamento. Confira em Financeiro.', {
      href: '/financeiro',
      actionLabel: 'Ir para Financeiro',
    })
  }
  // Se esse agendamento tinha consumido saldo do pacote, desfazer a
  // conclusão precisa devolver o saldo — senão fica descontado pra sempre.
  const { error: creditErr } = await supabase.from('patient_credits').delete().eq('clinic_id', clinicId).eq('appointment_id', apptId)
  if (creditErr) {
    showToast('error', 'Não foi possível devolver o saldo do pacote deste agendamento. Confira em Pacientes.', {
      href: '/pacientes',
      actionLabel: 'Ir para Pacientes',
    })
  }
}
