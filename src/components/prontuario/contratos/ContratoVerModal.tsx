'use client'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { formatDateBr } from '@/lib/documentos/campos'
import { vigenciaTexto } from '@/lib/contratos/status'
import { hojeBrasil } from '@/lib/brasilDate'
import { formatCurrency } from '@/lib/utils'
import { ContratoBadge } from './ContratoBadge'
import { getContract } from './contratosApi'
import styles from './contratos.module.css'

const fmtDateTime = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Leitura do contrato (texto, vigência, quem assinou). A impressão do assinado fica no menu Imprimir do prontuário. */
export function ContratoVerModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: c, isLoading, isError, error } = useQuery({ queryKey: ['contrato', id], queryFn: () => getContract(id), staleTime: 0 })
  const alerta = c && (c.status === 'assinado' || c.status === 'vencido') ? vigenciaTexto(c.validUntil, hojeBrasil()) : ''
  return (
    <Modal open onClose={onClose} size="lg" title={c?.title ?? 'Contrato'} subtitle={c?.patientName}
      footer={<button type="button" className={btn.primary} onClick={onClose}>Fechar</button>}>
      <div className={styles.stack}>
        {isLoading && <p className={f.hint}>Carregando...</p>}
        {isError && <div className={f.error} role="alert">{error instanceof Error ? error.message : 'Não foi possível abrir o contrato.'}</div>}
        {c && (
          <>
            <div className={styles.rowTitle}>
              <ContratoBadge status={c.status} />
              {c.status === 'enviado' && c.linkSituacao && c.linkSituacao !== 'ativo' && <span className={styles.alert}>Link {c.linkSituacao === 'expirado' ? 'expirado' : 'revogado'}: reenvie para o paciente assinar</span>}
              {alerta && <span className={c.status === 'vencido' ? `${styles.alert} ${styles.alertBad}` : styles.alert}>{alerta}</span>}
            </div>
            <p className={styles.meta}>
              Vigência: {c.validFrom ? formatDateBr(c.validFrom) : 'sem início'} a {c.validUntil ? formatDateBr(c.validUntil) : 'sem término'}
              {c.amount !== null ? ` · Valor: ${formatCurrency(c.amount)}` : ''}
              {c.paymentMethod ? ` · ${c.paymentMethod}` : ''}
              {c.signedAt && c.signerName ? ` · Assinado por ${c.signerName} em ${fmtDateTime(c.signedAt)}` : ''}
            </p>
            <pre className={styles.viewText}>{c.contentText}</pre>
            {c.signedAt && <p className={f.note}>Para imprimir o contrato assinado, com o carimbo de data, hora e verificação, use Imprimir no topo do prontuário.</p>}
          </>
        )}
      </div>
    </Modal>
  )
}
