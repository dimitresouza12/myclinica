'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { CpfInput, MoneyInput } from '@/components/ui/NumericInput'
import f from '@/components/ui/modalForm.module.css'
import btn from '@/components/ui/button.module.css'
import { Icon } from '@/components/ui/Icon'
import { cpfInputError, cpfToInputValue } from '@/lib/numericFormat'
import { imprimirReciboReembolso } from '@/lib/convenios/imprimir'
import { diaBR } from '@/lib/convenios/csv'
import type { ReciboEntrada } from '@/lib/convenios/recibo'
import styles from './convenios.module.css'

interface Props {
  /** tudo do recibo exceto o que a pessoa ajusta aqui (valor, descrição, pagador) */
  base: Omit<ReciboEntrada, 'valor' | 'descricao' | 'pagadorNome' | 'pagadorCpf'>
  valorInicial: number | null
  descricaoInicial: string
  onClose: () => void
}

export function ReciboModal({ base, valorInicial, descricaoInicial, onClose }: Props) {
  const { patient } = base
  const [valor, setValor] = useState(valorInicial != null ? valorInicial.toFixed(2) : '')
  const [descricao, setDescricao] = useState(descricaoInicial)
  const [pagadorNome, setPagadorNome] = useState(patient.payer_name?.trim() || patient.name)
  const [pagadorCpf, setPagadorCpf] = useState(cpfToInputValue(patient.payer_cpf || patient.cpf))
  const [error, setError] = useState('')

  async function imprimir(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const n = Number(valor)
    if (!valor || !Number.isFinite(n) || n <= 0) return setError('Informe o valor do recibo.')
    if (pagadorNome.trim().length < 2) return setError('Informe o nome de quem pagou.')
    const cpfError = cpfInputError(pagadorCpf)
    if (cpfError) return setError(cpfError)
    await imprimirReciboReembolso({ ...base, valor: n, descricao, pagadorNome: pagadorNome.trim(), pagadorCpf })
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Recibo para reembolso"
      subtitle={`${patient.name} · ${diaBR(base.dia)}`}
      footer={
        <>
          <button type="button" className={btn.secondary} onClick={onClose}>Fechar</button>
          <button type="submit" form="recibo-form" className={btn.primary}><Icon name="receipt" size={15} /> Imprimir recibo</button>
        </>
      }
    >
      <form id="recibo-form" onSubmit={imprimir} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className={styles.guiaBox}>
          O recibo leva o nome, o registro no conselho{base.professional?.rqe ? ' e o RQE' : ''} do profissional e o CPF do paciente. CPF ou CNPJ do prestador e cidade saem em branco para preencher à mão.
        </p>
        <div className={f.row2}>
          <div className={f.field}>
            <label htmlFor="rec-valor">Valor</label>
            <MoneyInput id="rec-valor" value={valor} onChange={setValor} />
          </div>
          <div className={f.field}>
            <label htmlFor="rec-desc">Referente a</label>
            <input id="rec-desc" value={descricao} maxLength={120} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Consulta, sessão de fisioterapia" />
          </div>
        </div>
        <div className={f.row2}>
          <div className={f.field}>
            <label htmlFor="rec-pagador">Pagador</label>
            <input id="rec-pagador" value={pagadorNome} maxLength={120} autoComplete="off" onChange={e => setPagadorNome(e.target.value)} />
          </div>
          <div className={f.field}>
            <label htmlFor="rec-cpf">CPF do pagador</label>
            <CpfInput id="rec-cpf" value={pagadorCpf} onChange={setPagadorCpf} />
          </div>
        </div>
        {error && <p className={f.error} role="alert">{error}</p>}
      </form>
    </Modal>
  )
}
