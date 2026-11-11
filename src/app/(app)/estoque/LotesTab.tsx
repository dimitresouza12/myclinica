'use client'
import { StatusDot, type StatusTone } from '@/components/ui/StatusDot'
import { MoreMenu, type MoreMenuItem } from '@/components/ui/MoreMenu'
import t from '@/components/ui/table.module.css'
import {
  diasAteValidade, faixaValidade, formatarDia, saldoDoLote, textoValidade, type StockLot, type ValidadeFaixa,
} from '@/lib/estoque/lotes'
import type { StockItem } from '@/types'
import styles from './estoque.module.css'
import lotes from './lotes.module.css'

const TOM: Record<ValidadeFaixa, StatusTone> = { vencido: 'bad', ate30: 'warn', ate60: 'wait', ate90: 'wait', ok: 'ok', sem_validade: 'idle' }

/** Tom e texto da situação de validade de um lote com saldo (esgotado não alerta). */
function situacaoDoLote(lot: StockLot, hoje: string): { tone: StatusTone; texto: string } {
  if (saldoDoLote(lot) <= 0) return { tone: 'idle', texto: 'Esgotado' }
  const faixa = faixaValidade(lot.validade, hoje)
  return { tone: TOM[faixa], texto: textoValidade(diasAteValidade(lot.validade, hoje)) }
}

interface Props {
  rows: StockLot[]
  itens: Record<string, StockItem>
  hoje: string
  onBaixa: (lot: StockLot, item: StockItem) => void
  onRecall: (lot: StockLot, item: StockItem | undefined) => void
  onEditar: (lot: StockLot, item: StockItem | undefined) => void
  /** perfil só de visualização: sem dar baixa nem editar lote */
  canEdit?: boolean
}

export function LotesTab({ rows, itens, hoje, onBaixa, onRecall, onEditar, canEdit = true }: Props) {
  function menu(lot: StockLot): MoreMenuItem[] {
    const item = itens[lot.stock_item_id]
    const out: MoreMenuItem[] = []
    if (canEdit && item && saldoDoLote(lot) > 0) out.push({ label: 'Dar baixa neste lote', icon: 'arrowUp', onClick: () => onBaixa(lot, item) })
    out.push({ label: 'Pacientes que receberam', icon: 'patients', onClick: () => onRecall(lot, item) })
    if (canEdit) out.push({ label: 'Editar lote', icon: 'edit', onClick: () => onEditar(lot, item) })
    return out
  }

  return (
    <div className={`${t.wrap} ${styles.wrap} resp-table-wrap`}>
      <table className={`${t.table} resp-table`}>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Lote</th>
            <th>Validade</th>
            <th className={t.num}>Saldo</th>
            <th>Situação</th>
            <th aria-label="Ações" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={6} className={t.empty}>Nenhum lote nesta lista.</td></tr>
          ) : rows.map(lot => {
            const item = itens[lot.stock_item_id]
            const s = situacaoDoLote(lot, hoje)
            return (
              <tr key={lot.id} className={styles.row}>
                <td>
                  <div className={styles.who}>
                    <span className={styles.name}>{item?.name ?? '-'}</span>
                    {(lot.fornecedor || lot.nota_fiscal) && (
                      <span className={styles.sub}>{[lot.fornecedor, lot.nota_fiscal ? `NF ${lot.nota_fiscal}` : null].filter(Boolean).join(' · ')}</span>
                    )}
                  </div>
                </td>
                <td data-label="Lote"><span className={lotes.lotCode}>{lot.lote}</span></td>
                <td data-label="Validade" className={t.muted}>{lot.validade ? formatarDia(lot.validade) : 'Sem validade'}</td>
                <td data-label="Saldo" className={`${t.num} ${styles.qty}`}>{saldoDoLote(lot)} {item?.unit ?? ''}</td>
                <td data-label="Situação"><StatusDot tone={s.tone}>{s.texto}</StatusDot></td>
                <td className={styles.actionsCell}>
                  <div className={t.rowActions}>
                    <MoreMenu label={`Mais ações do lote ${lot.lote}`} items={menu(lot)} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
