// Mensagens amigáveis para os erros das RPCs de comissão (recálculo, ajuste manual e histórico).
// Os códigos vêm da migration 20261144_comissao_recalculo_e_ajuste.

interface RpcError { code?: string; message?: string }

export function commissionErrorMessage(error: RpcError | null | undefined): string {
  if (!error) return 'Não foi possível concluir. Tente novamente.'
  const code = error.code ?? ''
  const msg = error.message ?? ''
  if (code === '42501') return 'Apenas administradores da clínica podem fazer esta alteração.'
  if (code === '28000') return 'Sua sessão expirou. Entre novamente para continuar.'
  if (code === 'P0002') return 'Registro não encontrado ou de outra clínica. Atualize a página e tente de novo.'
  if (code === '22023') {
    if (msg.includes('recipient_inactive')) return 'Este beneficiário está inativo. Reative-o antes de recalcular.'
    if (msg.includes('amount_exceeds_total')) return 'O valor informado é maior que o valor da receita.'
    if (msg.includes('amount_negative')) return 'O valor não pode ser negativo.'
    if (msg.includes('percent_out_of_range')) return 'A porcentagem precisa estar entre 0 e 100.'
    if (msg.includes('receita_sem_valor')) return 'Esta receita não tem valor para dividir.'
    if (msg.includes('from_required')) return 'Informe a data a partir da qual recalcular.'
    return 'Parâmetro inválido. Confira os dados e tente de novo.'
  }
  return 'Não foi possível concluir. Tente novamente.'
}
