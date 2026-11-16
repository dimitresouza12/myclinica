'use client'
import { Icon, type IconName } from '@/components/ui/Icon'
import { APROVACOES, aprovacaoDoItem, STATUS_ORCAMENTO_ROTULO, statusOrcamento, totaisOrcamento, type AprovacaoItem } from '@/lib/odonto/orcamento'
import styles from './aprovacaoItem.module.css'

const ICONE: Record<AprovacaoItem, IconName> = { pendente: 'clock', aprovado: 'check', recusado: 'close' }
const money = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

interface Props {
  /** o que o item descreve, para o leitor de tela */
  nome: string
  value: AprovacaoItem | undefined
  onChange: (v: AprovacaoItem) => void
}

/** Aprovar, recusar ou deixar em aberto um item do orçamento. Três botões de 44 px; o escolhido fica marcado. */
export function AprovacaoItem({ nome, value, onChange }: Props) {
  const atual = aprovacaoDoItem({ approval: value })
  return (
    <div className={styles.group} role="group" aria-label={`Aprovação de ${nome || 'item'}`}>
      {APROVACOES.map(a => (
        <button
          key={a.id}
          type="button"
          aria-pressed={atual === a.id}
          className={`${styles.opt} ${styles[a.id]} ${atual === a.id ? styles.on : ''}`}
          onClick={() => onChange(a.id)}
        >
          <Icon name={ICONE[a.id]} size={14} aria-hidden="true" />
          {a.rotulo}
        </button>
      ))}
    </div>
  )
}

/** Resumo do orçamento: situação geral e quanto está aprovado, pendente e recusado. Só aparece com itens. */
export function ResumoAprovacao({ items }: { items: { value: number | null; approval?: AprovacaoItem }[] }) {
  if (items.length === 0) return null
  const status = statusOrcamento(items)
  const t = totaisOrcamento(items)
  return (
    <div className={styles.summary} role="status">
      <span className={`${styles.badge} ${styles['s_' + status]}`}>{STATUS_ORCAMENTO_ROTULO[status]}</span>
      <dl className={styles.nums}>
        <div><dt>Aprovado</dt><dd>{money(t.aprovado)}</dd></div>
        <div><dt>Pendente</dt><dd>{money(t.pendente)}</dd></div>
        <div><dt>Recusado</dt><dd>{money(t.recusado)}</dd></div>
      </dl>
    </div>
  )
}
