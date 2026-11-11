'use client'
import { Modal } from '@/components/ui/Modal'
import type { SeriesScope } from '@/lib/agenda/series'
import btn from '@/components/ui/button.module.css'
import styles from './seriesScopeDialog.module.css'

interface Props {
  open: boolean
  title: string
  /** quantas consultas depois desta a opção "e os próximos" alcança */
  followingCount: number
  /** ação destrutiva (cancelar, excluir): o botão "e os próximos" fica vermelho */
  danger?: boolean
  onPick: (scope: SeriesScope | null) => void
}

/** Pergunta se a mudança vale só para esta consulta da série ou para ela e as próximas. `null` = desistiu. */
export function SeriesScopeDialog({ open, title, followingCount, danger, onPick }: Props) {
  return (
    <Modal open={open} onClose={() => onPick(null)} size="sm" title={title} subtitle="Esta consulta faz parte de uma série">
      <div className={styles.stack}>
        <button type="button" className={`${btn.secondary} ${styles.btn}`} onClick={() => onPick('this')}>Só este agendamento</button>
        <button type="button" className={`${danger ? btn.danger : btn.primary} ${styles.btn}`} onClick={() => onPick('following')}>
          Este e os próximos ({followingCount})
        </button>
        <button type="button" className={`${btn.ghost} ${styles.btn}`} onClick={() => onPick(null)}>Voltar</button>
        <p className={styles.hint}>Consultas já concluídas, canceladas ou com falta não são alteradas.</p>
      </div>
    </Modal>
  )
}
