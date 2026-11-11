'use client'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { useProfessionals } from '@/hooks/useClinicData'
import { usePatientPackages } from '@/hooks/usePatientPackages'
import { usePermissions } from '@/hooks/usePermissions'
import { Icon } from '@/components/ui/Icon'
import { EmptyState } from '@/components/ui/EmptyState'
import { MoreMenu } from '@/components/ui/MoreMenu'
import { showToast } from '@/components/ui/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import btn from '@/components/ui/button.module.css'
import { formatDateBr } from '@/lib/documentos/campos'
import { formatCurrency } from '@/lib/utils'
import { hojeBrasil } from '@/lib/brasilDate'
import { councilForProfessional, formatRegistration, formatRqe } from '@/lib/professionalCouncil'
import { buildSignedDocumentHtml } from '@/lib/assinatura/carimbo'
import { openPrintWindow } from '@/lib/documentRender'
import { printHtmlInWindow } from '@/lib/print'
import { vigenciaTexto, type ContractStatus } from '@/lib/contratos/status'
import type { Patient, TreatmentPlanItem } from '@/types'
import { usePrintActions, type TabPrintAction } from '../print/PrintRegistry'
import { fetchSignedDocument } from '../portal/portalApi'
import { listContracts, removeContract, type ContractItem } from './contratosApi'
import { ContratoBadge } from './ContratoBadge'
import { ContratoEditorModal, type EditorPackage, type EditorProfessional } from './ContratoEditorModal'
import { ContratoLinkModal } from './ContratoLinkModal'
import { ContratoVerModal } from './ContratoVerModal'
import { ModelosContratoModal } from './ModelosContratoModal'
import styles from './contratos.module.css'

interface Props {
  patient: Patient
  /** Contrato salvo antes na Ficha (medical_records.contract_text): continua visível e vira modelo, nunca se perde. */
  legacyText: string
  planItems: TreatmentPlanItem[]
  defaultProfessionalId: string | null
}

const MAX_PRINT_ITEMS = 8

function alertOf(c: ContractItem, today: string): { text: string; bad: boolean } | null {
  if (c.status === 'enviado' && c.linkSituacao && c.linkSituacao !== 'ativo') return { text: `Link ${c.linkSituacao === 'expirado' ? 'expirado' : 'revogado'}: reenvie para o paciente assinar`, bad: false }
  if (c.status === 'vencido') return { text: vigenciaTexto(c.validUntil, today), bad: true }
  if (c.expiringSoon) return { text: vigenciaTexto(c.validUntil, today), bad: false }
  return null
}

export function ContratosPaciente({ patient, legacyText, planItems, defaultProfessionalId }: Props) {
  const { clinic } = useAuthStore()
  const queryClient = useQueryClient()
  const { canEdit } = usePermissions('prontuario')
  const { data: professionals = [] } = useProfessionals(clinic?.id)
  const { data: pkgData } = usePatientPackages(clinic?.id)
  const today = hojeBrasil()

  const [editor, setEditor] = useState<{ id?: string } | null>(null)
  const [sendFor, setSendFor] = useState<ContractItem | null>(null)
  const [viewId, setViewId] = useState<string | null>(null)
  const [modelsOpen, setModelsOpen] = useState(false)

  const { data: contracts = [], isLoading, isError, error } = useQuery({
    queryKey: ['contratos', patient.id],
    queryFn: () => listContracts(patient.id),
    staleTime: 15_000,
  })

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['contratos', patient.id] })
    void queryClient.invalidateQueries({ queryKey: ['contratos-clinica'] })
  }

  const editorProfessionals: EditorProfessional[] = useMemo(() => professionals.map(p => {
    const council = councilForProfessional({ specialtyType: p.specialty_type, specialty: p.specialty, clinicType: clinic?.type })
    const registration = [formatRegistration(council, p.registration_number), formatRqe(p.rqe)].filter(Boolean).join(', ')
    return { id: p.id, name: p.name, registration }
  }), [professionals, clinic?.type])

  const editorPackages: EditorPackage[] = useMemo(() => (pkgData?.packages ?? [])
    .filter(k => k.patient_id === patient.id && k.status === 'ativo')
    .map(k => ({ id: k.id, name: k.name, sessions: k.total_sessions, price: Number(k.total_price) || 0 })), [pkgData, patient.id])

  async function cancelOrDelete(c: ContractItem) {
    const draft = c.storedStatus === 'rascunho'
    const ok = await confirmDialog({
      title: draft ? 'Apagar o rascunho?' : 'Cancelar o contrato?',
      message: draft
        ? 'O rascunho é apagado de vez.'
        : c.status === 'enviado' ? 'O link enviado ao paciente deixa de valer. O contrato fica na lista como cancelado.' : 'O contrato fica na lista como cancelado. O documento assinado continua guardado e pode ser impresso.',
      confirmText: draft ? 'Apagar' : 'Cancelar contrato', danger: true,
    })
    if (!ok) return
    try {
      const r = await removeContract(c.id)
      showToast('ok', r.mode === 'apagado' ? 'Rascunho apagado.' : 'Contrato cancelado.')
      refresh()
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Não foi possível concluir.')
    }
  }

  // Impressão do contrato assinado: vai para o menu Imprimir do prontuário (sem botão solto aqui)
  const signed = contracts.filter(c => c.signatureRequestId && c.signedAt && (c.status === 'assinado' || c.status === 'vencido')).slice(0, MAX_PRINT_ITEMS)
  const printActions: TabPrintAction[] = signed.map(c => ({
    id: `contrato-${c.id}`,
    label: `Contrato assinado: ${c.title}`,
    includes: ['Texto do contrato como o paciente assinou', 'Assinatura, data, hora e carimbo de verificação'],
    run: async () => {
      // a aba abre agora, ainda dentro do clique; o documento chega depois
      const w = openPrintWindow()
      if (!w) { showToast('error', 'Não abriu a impressão: o navegador bloqueou o pop-up. Libere pop-ups para este site e tente de novo.'); return }
      try {
        const doc = await fetchSignedDocument(c.signatureRequestId!)
        await printHtmlInWindow(w, buildSignedDocumentHtml(doc))
      } catch (e) {
        w.close()
        showToast('error', e instanceof Error ? e.message : 'Não foi possível abrir o documento.')
      }
    },
  }))
  usePrintActions('documentos', printActions, 'contratos')

  const expiring = contracts.filter(c => c.expiringSoon).length
  const unavailable = isError && error instanceof Error && /ainda não estão ativos/i.test(error.message)

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h2 className={styles.headTitle}>Contratos do paciente</h2>
        <div className={styles.headActions}>
          <button type="button" className={btn.secondary} onClick={() => setModelsOpen(true)}>Modelos de contrato</button>
          {canEdit && <button type="button" className={btn.primary} onClick={() => setEditor({})} disabled={unavailable}><Icon name="plus" size={14} /> Novo contrato</button>}
        </div>
      </div>

      {expiring > 0 && <p className={styles.notice} role="status">{expiring === 1 ? '1 contrato assinado vence' : `${expiring} contratos assinados vencem`} nos próximos 30 dias.</p>}
      {isLoading && <p className={styles.meta}>Carregando contratos...</p>}
      {isError && <p className={styles.notice} role="alert">{unavailable ? 'Os contratos com status ainda não estão ativos nesta conta. O texto salvo na ficha continua disponível abaixo.' : (error instanceof Error ? error.message : 'Não foi possível carregar os contratos.')}</p>}
      {!isLoading && !isError && contracts.length === 0 && (
        <EmptyState compact icon="receipt" title="Nenhum contrato para este paciente" description="Crie a partir de um modelo da clínica: os dados do paciente, o valor, a forma de pagamento, a vigência e o profissional entram sozinhos." />
      )}

      <div className={styles.list}>
        {contracts.map(c => {
          const al = alertOf(c, today)
          const canSend = canEdit && (c.storedStatus === 'rascunho' || c.status === 'enviado')
          return (
            <div key={c.id} className={styles.row}>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>
                  <b>{c.title}</b>
                  <ContratoBadge status={c.status as ContractStatus} />
                </div>
                <span className={styles.meta}>
                  {c.validUntil ? `Vigência até ${formatDateBr(c.validUntil)}` : 'Sem término de vigência'}
                  {c.amount !== null ? ` · ${formatCurrency(c.amount)}` : ''}
                  {c.signerName && c.signedAt ? ` · Assinado por ${c.signerName}` : ''}
                </span>
                {al && <span className={al.bad ? `${styles.alert} ${styles.alertBad}` : styles.alert}>{al.text}</span>}
              </div>
              <div className={styles.rowActions}>
                <button type="button" className={btn.secondary} onClick={() => setViewId(c.id)}>Ver</button>
                {canEdit && c.storedStatus === 'rascunho' && <button type="button" className={btn.secondary} onClick={() => setEditor({ id: c.id })}>Editar</button>}
                {canSend && <button type="button" className={btn.primary} onClick={() => setSendFor(c)}>{c.status === 'enviado' ? 'Reenviar' : 'Enviar'}</button>}
                {canEdit && c.storedStatus !== 'cancelado' && (
                  <MoreMenu label={`Mais ações do contrato ${c.title}`} items={[{ label: c.storedStatus === 'rascunho' ? 'Apagar rascunho' : 'Cancelar contrato', icon: 'trash', danger: true, onClick: () => cancelOrDelete(c) }]} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {legacyText.trim() && (
        <details className={styles.legacy}>
          <summary>Contrato salvo na ficha (texto antigo)</summary>
          <p className={styles.meta}>Texto que estava salvo na Ficha clínica. Ele não se perde: aparece como opção de modelo ao criar um contrato novo e continua no menu Imprimir como &quot;Contrato (texto salvo)&quot;.</p>
          <pre className={styles.legacyText}>{legacyText.trim()}</pre>
        </details>
      )}

      {editor && clinic && (
        <ContratoEditorModal
          patient={{ id: patient.id, name: patient.name, cpf: patient.cpf, address: patient.address, guardian_name: patient.guardian_name, guardian_cpf: patient.guardian_cpf }}
          clinicName={clinic.name} clinicAddress={clinic.address}
          professionals={editorProfessionals} defaultProfessionalId={defaultProfessionalId}
          planItems={planItems} packages={editorPackages} legacyText={legacyText}
          editId={editor.id}
          onClose={() => setEditor(null)}
          onSaved={async (id, send) => {
            setEditor(null)
            refresh()
            void queryClient.invalidateQueries({ queryKey: ['contrato', id] })
            if (!send) { showToast('ok', 'Rascunho salvo.'); return }
            const list = await listContracts(patient.id).catch(() => [] as ContractItem[])
            const fresh = list.find(x => x.id === id)
            if (fresh) setSendFor(fresh)
          }}
        />
      )}
      {sendFor && clinic && (
        <ContratoLinkModal
          contractId={sendFor.id} contractTitle={sendFor.title} patientName={patient.name} patientPhone={patient.phone} clinicName={clinic.name}
          resend={sendFor.status === 'enviado'} onDone={refresh} onClose={() => setSendFor(null)}
        />
      )}
      {viewId && <ContratoVerModal id={viewId} onClose={() => setViewId(null)} />}
      {modelsOpen && <ModelosContratoModal canEdit={canEdit} onClose={() => setModelsOpen(false)} />}
    </div>
  )
}
