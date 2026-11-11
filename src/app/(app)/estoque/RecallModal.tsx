'use client'
import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import btn from '@/components/ui/button.module.css'
import { formatBrPhone } from '@/lib/phoneFormat'
import { buscarRecall } from '@/lib/estoque/lotesApi'
import { baixarArquivo, recallParaCsv } from '@/lib/estoque/lotesExport'
import { formatarDia, type RecallResumo, type StockLot } from '@/lib/estoque/lotes'
import styles from './lotes.module.css'

interface Props {
  lot: StockLot | null
  produto: string
  unidade: string
  onClose: () => void
  /** perfil só de visualização: sem baixar o CSV (padrão: pode) */
  canExport?: boolean
}

const dia = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '-' : new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(d)
}

/** "Quais pacientes receberam o lote X": para chamar quem recebeu em caso de recall. */
export function RecallModal({ lot, produto, unidade, onClose, canExport = true }: Props) {
  if (!lot) return null
  return <RecallCorpo key={lot.id} lot={lot} produto={produto} unidade={unidade} onClose={onClose} canExport={canExport} />
}

function RecallCorpo({ lot, produto, unidade, onClose, canExport = true }: Props & { lot: StockLot }) {
  const [estado, setEstado] = useState<{ carregando: boolean; erro: string; dados: RecallResumo | null }>({ carregando: true, erro: '', dados: null })

  useEffect(() => {
    let vivo = true
    buscarRecall(lot.id).then(r => {
      if (!vivo) return
      setEstado(r.ok ? { carregando: false, erro: '', dados: r.data } : { carregando: false, erro: r.erro, dados: null })
    })
    return () => { vivo = false }
  }, [lot.id])

  const { carregando, erro, dados } = estado
  const u = unidade ? ` ${unidade}` : ''

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title="Pacientes que receberam o lote"
      subtitle={`${produto} · lote ${lot.lote}`}
      footer={
        <>
          {canExport && dados && dados.pacientes.length > 0 && (
            <button type="button" className={btn.secondary} onClick={() => baixarArquivo(`recall-lote-${lot.lote.replace(/[^\w-]+/g, '_')}.csv`, recallParaCsv(lot, produto, dados))}>
              <Icon name="download" size={15} /> Baixar CSV
            </button>
          )}
          <button type="button" className={btn.primary} onClick={onClose}>Fechar</button>
        </>
      }
    >
      <p className={styles.recallHead}>
        <span><b>Validade:</b> {formatarDia(lot.validade)}</span>
        {lot.fornecedor && <span><b>Fornecedor:</b> {lot.fornecedor}{lot.nota_fiscal ? ` · NF ${lot.nota_fiscal}` : ''}</span>}
      </p>
      {carregando && <p className={styles.recallEmpty}>Carregando...</p>}
      {erro && <p className={styles.recallEmpty}>{erro}</p>}
      {dados && (
        <>
          {dados.pacientes.length === 0 ? (
            <p className={styles.recallEmpty}>Nenhum paciente registrado neste lote.</p>
          ) : (
            <ul className={styles.recallList}>
              {dados.pacientes.map(p => (
                <li key={p.patientId} className={styles.recallRow}>
                  <div className={styles.recallWho}>
                    <span className={styles.recallName}>{p.nome}</span>
                    <span className={styles.recallMeta}>
                      {p.telefone ? `${formatBrPhone(p.telefone)} · ` : ''}
                      {p.usos.length === 1 ? dia(p.usos[0].data) : `${p.usos.length} usos, último em ${dia(p.usos[0].data)}`}
                    </span>
                  </div>
                  <span className={styles.recallQty}>{p.quantidade}{u}</span>
                </li>
              ))}
            </ul>
          )}
          {dados.semPaciente > 0 && (
            <p className={styles.recallNote}>
              {dados.semPaciente}{u} deste lote saíram sem paciente informado e não aparecem na lista. Em saídas novas, escolha o paciente para manter o rastreio.
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
