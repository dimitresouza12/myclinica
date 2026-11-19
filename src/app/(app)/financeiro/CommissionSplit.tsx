'use client'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { commissionErrorMessage } from '@/lib/commissionRpc'
import { showToast } from '@/components/ui/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { PercentInput, MoneyInput } from '@/components/ui/NumericInput'
import { PillTabs } from '@/components/ui/PillTabs'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import type { CommissionEntry } from '@/types'
import styles from './financeiro.module.css'

type EntryRow = Pick<CommissionEntry, 'id' | 'recipient_id' | 'recipient_name' | 'percent' | 'amount' | 'is_manual'>
type AdjustMode = 'percent' | 'amount'

interface Props {
  recordId: string
  clinicId: string
  /** Só admin ajusta ou volta ao automático (as RPCs exigem) */
  isAdmin: boolean
}

/** Bloco "Divisão" da receita: quanto cada beneficiário recebe, com ajuste manual para admin. */
export function CommissionSplit({ recordId, clinicId, isAdmin }: Props) {
  const queryClient = useQueryClient()
  const queryKey = ['commission-entries', clinicId, recordId]

  const { data: entries = [], isLoading, isError } = useQuery({
    queryKey,
    enabled: !!recordId && !!clinicId,
    // Ajustar ou voltar ao automático recria/altera as linhas: nunca mostrar cache velho
    staleTime: 0,
    queryFn: async (): Promise<EntryRow[]> => {
      const { data, error } = await supabase
        .from('commission_entries')
        .select('id, recipient_id, recipient_name, percent, amount, is_manual')
        .eq('financial_record_id', recordId)
        .eq('clinic_id', clinicId)
        .order('amount', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as EntryRow[]
    },
  })

  const [adjustingId, setAdjustingId] = useState<string | null>(null)
  const [mode, setMode] = useState<AdjustMode>('percent')
  const [percent, setPercent] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const hasManual = entries.some(e => e.is_manual)

  async function refreshAll() {
    // Aguarda a lista desta receita voltar do banco antes de fechar o ajuste/confirmação
    await queryClient.invalidateQueries({ queryKey, refetchType: 'all' })
    queryClient.invalidateQueries({ queryKey: ['commission-entries', clinicId] })
    queryClient.invalidateQueries({ queryKey: ['comissoes-relatorio', clinicId] })
    queryClient.invalidateQueries({ queryKey: ['financeiro', clinicId] })
    queryClient.invalidateQueries({ queryKey: ['relatorios-raw', clinicId] })
  }

  function startAdjust(e: EntryRow) {
    setAdjustingId(e.id)
    setMode('percent')
    setPercent(String(e.percent))
    setAmount(Number(e.amount).toFixed(2))
    setError('')
  }

  function cancelAdjust() {
    if (busy) return
    setAdjustingId(null)
    setError('')
  }

  async function saveAdjust() {
    if (!adjustingId) return
    const raw = mode === 'percent' ? percent : amount
    const value = parseFloat(raw)
    if (!Number.isFinite(value) || value < 0) {
      setError(mode === 'percent' ? 'Informe uma porcentagem válida.' : 'Informe um valor válido.')
      return
    }
    if (mode === 'percent' && value > 100) {
      setError('A porcentagem precisa estar entre 0 e 100.')
      return
    }
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('adjust_commission_entry', {
      p_entry_id: adjustingId,
      p_percent: mode === 'percent' ? value : null,
      p_amount: mode === 'amount' ? value : null,
    })
    if (rpcError) {
      setBusy(false)
      setError(commissionErrorMessage(rpcError))
      return
    }
    await refreshAll()
    setBusy(false)
    setAdjustingId(null)
    showToast('ok', 'Comissão ajustada.')
  }

  async function resetToAuto() {
    if (!(await confirmDialog({
      message: 'Voltar ao automático? A divisão desta receita será recalculada pelas regras atuais e os ajustes manuais serão descartados.',
      confirmText: 'Voltar ao automático',
    }))) return
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('reset_commission_entry_adjustment', { p_record_id: recordId })
    if (rpcError) {
      setBusy(false)
      showToast('error', commissionErrorMessage(rpcError))
      return
    }
    await refreshAll()
    setBusy(false)
    setAdjustingId(null)
    showToast('ok', 'Divisão voltou ao automático.')
  }

  // Falha ao ler (ex.: perfil sem acesso a Comissões): o bloco some, o resto do modal segue normal
  if (isError) return null

  return (
    <section className={styles.split} aria-label="Divisão da comissão">
      <div className={styles.splitHead}>
        <span className={styles.splitTitle}>Divisão</span>
        {isAdmin && hasManual && (
          <button type="button" className={btn.ghost} onClick={resetToAuto} disabled={busy}>
            <Icon name="refresh" size={14} /> Voltar ao automático
          </button>
        )}
      </div>

      {isLoading ? (
        <p className={styles.splitEmpty}>Carregando...</p>
      ) : entries.length === 0 ? (
        <p className={styles.splitEmpty}>Nenhuma comissão foi gerada para esta receita.</p>
      ) : (
        <>
        {hasManual && (
          <p className={styles.splitHint}>A divisão foi ajustada manualmente e não muda ao editar o valor da receita. Use Voltar ao automático para recalcular.</p>
        )}
        <ul className={styles.splitList}>
          {entries.map(e => (
            <li key={e.id} className={styles.splitRow}>
              <div className={styles.splitMain}>
                <span className={styles.splitName}>{e.recipient_name}</span>
                <span className={styles.splitNums}>
                  <span>{formatPercent(e.percent)}</span>
                  <strong>{formatCurrency(e.amount)}</strong>
                </span>
              </div>
              {(e.is_manual || (isAdmin && adjustingId !== e.id)) && (
                <div className={styles.splitMeta}>
                  {e.is_manual ? <Badge tone="info" dot={false}>Ajustado manualmente</Badge> : <span />}
                  {isAdmin && adjustingId !== e.id && (
                    <button type="button" className={btn.secondary} onClick={() => startAdjust(e)} disabled={busy}>
                      <Icon name="edit" size={14} /> Ajustar
                    </button>
                  )}
                </div>
              )}

              {isAdmin && adjustingId === e.id && (
                <div className={styles.adjustForm}>
                  <PillTabs
                    label="Ajustar por"
                    value={mode}
                    onChange={(v) => { setMode(v); setError('') }}
                    options={[
                      { value: 'percent', label: 'Por porcentagem' },
                      { value: 'amount', label: 'Por valor' },
                    ]}
                  />
                  <div className={f.field}>
                    <label htmlFor={`adjust-${e.id}`}>{mode === 'percent' ? 'Porcentagem (%)' : 'Valor (R$)'}</label>
                    {mode === 'percent' ? (
                      <PercentInput id={`adjust-${e.id}`} className={styles.adjustInput} value={percent} onChange={(v) => { setPercent(v); setError('') }} placeholder="0" />
                    ) : (
                      <MoneyInput id={`adjust-${e.id}`} className={styles.adjustInput} value={amount} onChange={(v) => { setAmount(v); setError('') }} />
                    )}
                  </div>
                  <p className={styles.splitHint}>Ao salvar, esta receita deixa de ser recalculada em lote.</p>
                  {error && <p className={f.noteDanger} role="alert">{error}</p>}
                  <div className={styles.adjustActions}>
                    <button type="button" className={btn.secondary} onClick={cancelAdjust} disabled={busy}>Cancelar</button>
                    <button type="button" className={btn.primary} onClick={saveAdjust} disabled={busy}>{busy ? 'Salvando...' : 'Salvar ajuste'}</button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
        </>
      )}
    </section>
  )
}
