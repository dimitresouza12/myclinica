'use client'
import { useMemo, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { SelectMenu } from '@/components/ui/SelectMenu'
import btn from '@/components/ui/button.module.css'
import type { ContractItem } from '@/lib/contratos/server'
import { rotuloTermo, termosUteis, type Aplicacao } from '@/lib/estetica/aplicacoes'
import { vincularTermo } from '@/lib/estetica/storage'
import { formatarDia } from '@/lib/estoque/lotes'
import styles from './aplicacoes.module.css'

interface Props {
  aplicacao: Aplicacao
  termos: ContractItem[]
  onClose: () => void
  onSalvo: () => void
}

/** Liga (ou troca, ou solta) o termo de consentimento de uma aplicação que já foi registrada. */
export function TermoModal({ aplicacao, termos, onClose, onSalvo }: Props) {
  const [contractId, setContractId] = useState(aplicacao.contractId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const util = useMemo(() => termosUteis(termos), [termos])

  async function salvar() {
    setSaving(true)
    setError('')
    const r = await vincularTermo(aplicacao.id, contractId || null)
    setSaving(false)
    if (!r.ok) { setError(r.erro); return }
    onSalvo()
    onClose()
  }

  return (
    <Modal
      open
      onClose={saving ? () => {} : onClose}
      size="md"
      title="Termo de consentimento"
      subtitle={`${aplicacao.produto} · ${formatarDia(aplicacao.data)}`}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose} disabled={saving}>Cancelar</button>
          <button type="button" className={btn.primary} onClick={salvar} disabled={saving || contractId === (aplicacao.contractId ?? '')}>{saving ? 'Salvando...' : 'Salvar'}</button>
        </>
      }
    >
      <div className={styles.form}>
        {error && <p className={styles.error} role="alert">{error}</p>}
        <div className={styles.field}>
          <label htmlFor="termo-vinculo">Termo do paciente</label>
          <SelectMenu id="termo-vinculo" variant="field" ariaLabel="Termo de consentimento" value={contractId} onChange={setContractId}
            options={[{ value: '', label: 'Sem termo vinculado' }, ...util.map(t => ({ value: t.id, label: rotuloTermo(t) }))]} />
        </div>
        {util.length === 0 && <p className={styles.hint}>Este paciente ainda não tem termo nem contrato. Crie e envie para assinatura em Documentos e contratos.</p>}
      </div>
    </Modal>
  )
}
