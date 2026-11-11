'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { DatePicker } from '@/components/ui/DatePicker'
import { IntegerInput, MoneyInput } from '@/components/ui/NumericInput'
import f from '@/components/ui/modalForm.module.css'
import btn from '@/components/ui/button.module.css'
import { atualizarDadosLote, criarLoteComSaldoExistente } from '@/lib/estoque/lotesApi'
import type { StockLot } from '@/lib/estoque/lotes'
import type { StockItem } from '@/types'

export type LoteModalAlvo =
  | { mode: 'edit'; lot: StockLot; item: StockItem | null }
  | { mode: 'saldo'; item: StockItem; livre: number }

interface Props {
  alvo: LoteModalAlvo | null
  clinicId: string
  onClose: () => void
  onSaved: () => void
}

/**
 * Duas coisas, ambas por pedido da pessoa:
 *  - "saldo": dar nome e validade a uma parte do estoque que está sem lote (não muda a quantidade do produto);
 *  - "edit": corrigir código, validade, fornecedor, nota ou custo de um lote.
 * O corpo só existe com `alvo`: ao abrir, o estado nasce do alvo (a chave do componente interno).
 */
export function LoteModal({ alvo, clinicId, onClose, onSaved }: Props) {
  if (!alvo) return null
  const key = alvo.mode === 'edit' ? alvo.lot.id : `saldo-${alvo.item.id}`
  return <LoteModalCorpo key={key} alvo={alvo} clinicId={clinicId} onClose={onClose} onSaved={onSaved} />
}

function LoteModalCorpo({ alvo, clinicId, onClose, onSaved }: Props & { alvo: LoteModalAlvo }) {
  const edit = alvo.mode === 'edit'
  const lot = alvo.mode === 'edit' ? alvo.lot : null
  const item = alvo.item
  const [form, setForm] = useState({
    lote: lot?.lote ?? '',
    validade: lot?.validade?.slice(0, 10) ?? '',
    quantidade: alvo.mode === 'saldo' ? String(alvo.livre) : '',
    fornecedor: lot?.fornecedor ?? item?.supplier ?? '',
    nota: lot?.nota_fiscal ?? '',
    custo: lot?.custo != null ? String(lot.custo) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function salvar() {
    if (!form.lote.trim()) { setError('Informe o número do lote.'); return }
    const dados = {
      lote: form.lote,
      validade: form.validade || null,
      custo: form.custo ? parseFloat(form.custo) : null,
      fornecedor: form.fornecedor.trim() || null,
      notaFiscal: form.nota.trim() || null,
    }
    setSaving(true)
    setError('')
    const r = alvo.mode === 'edit'
      ? await atualizarDadosLote(alvo.lot.id, dados)
      : await criarLoteComSaldoExistente({ clinicId, itemId: alvo.item.id, quantidade: parseInt(form.quantidade) || 0, ...dados })
    setSaving(false)
    if (!r.ok) { setError(r.erro); return }
    onSaved()
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={edit ? 'Editar lote' : 'Atribuir saldo a um lote'}
      subtitle={item ? item.name : undefined}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>Cancelar</button>
          <button type="button" className={btn.primary} onClick={salvar} disabled={saving || !form.lote.trim()}>
            {saving ? 'Salvando...' : edit ? 'Salvar lote' : 'Criar lote'}
          </button>
        </>
      }
    >
      {error && <p className={f.error}>{error}</p>}
      {alvo.mode === 'saldo' && (
        <>
          <p className={f.note}>
            Isto dá número e validade a uma parte do que já está no estoque. A quantidade do produto não muda e nenhuma movimentação é criada.
          </p>
          <div className={f.field}>
            <label>Quantidade neste lote * <span className={f.hint}>(sem lote hoje: {alvo.livre})</span></label>
            <IntegerInput min={1} max={alvo.livre} value={form.quantidade} onChange={v => setForm(p => ({ ...p, quantidade: v }))} />
          </div>
        </>
      )}
      <div className={f.row2}>
        <div className={f.field}>
          <label>Lote *</label>
          <input value={form.lote} onChange={e => setForm(p => ({ ...p, lote: e.target.value }))} placeholder="Como está na embalagem" autoFocus={edit} />
        </div>
        <div className={f.field}>
          <label>Validade</label>
          <DatePicker value={form.validade} onChange={v => setForm(p => ({ ...p, validade: v }))} ariaLabel="Validade do lote" placeholder="Sem validade" />
        </div>
      </div>
      <div className={f.row2}>
        <div className={f.field}>
          <label>Fornecedor</label>
          <input value={form.fornecedor} onChange={e => setForm(p => ({ ...p, fornecedor: e.target.value }))} placeholder="Opcional" />
        </div>
        <div className={f.field}>
          <label>Nota fiscal</label>
          <input value={form.nota} onChange={e => setForm(p => ({ ...p, nota: e.target.value }))} placeholder="Opcional" />
        </div>
      </div>
      <div className={f.field}>
        <label>Custo unitário (R$)</label>
        <MoneyInput value={form.custo} onChange={v => setForm(p => ({ ...p, custo: v }))} />
      </div>
    </Modal>
  )
}
