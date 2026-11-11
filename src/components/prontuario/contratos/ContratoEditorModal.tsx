'use client'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { DatePicker } from '@/components/ui/DatePicker'
import { MoneyInput } from '@/components/ui/NumericInput'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { hojeBrasil } from '@/lib/brasilDate'
import { addMonthsIso } from '@/lib/documentos/campos'
import { findPlaceholders } from '@/lib/assinatura/texto'
import { REVIEW_NOTE } from '@/lib/documentBodyTemplates'
import {
  DEFAULT_TEMPLATE_BODY, DEFAULT_TEMPLATE_NAME, PAYMENT_METHODS, renderContract, suggestAmount, validateContractDraft, type ContractContext,
} from '@/lib/contratos/modelo'
import type { TreatmentPlanItem } from '@/types'
import { createContract, getContract, listTemplates, updateContract, type TemplateItem } from './contratosApi'
import styles from './contratos.module.css'

export interface EditorPatient { id: string; name: string; cpf: string | null; address: string | null; guardian_name?: string | null; guardian_cpf?: string | null }
export interface EditorProfessional { id: string; name: string; registration: string }
export interface EditorPackage { id: string; name: string; sessions: number; price: number }

interface Props {
  patient: EditorPatient
  clinicName: string
  clinicAddress: string
  professionals: EditorProfessional[]
  defaultProfessionalId: string | null
  planItems: TreatmentPlanItem[]
  packages: EditorPackage[]
  /** Texto de contrato salvo antes na Ficha (não se perde: vira um modelo para escolher aqui). */
  legacyText: string
  /** Id de um rascunho existente para editar; sem id, cria um novo. */
  editId?: string
  /** `send` = salvou e quer enviar já para assinatura. */
  onSaved: (id: string, send: boolean) => void
  onClose: () => void
}

const PADRAO = '__padrao'
const FICHA = '__ficha'

export function ContratoEditorModal(p: Props) {
  const today = hojeBrasil()
  const editing = !!p.editId
  const [templateKey, setTemplateKey] = useState(PADRAO)
  const [packageId, setPackageId] = useState('')
  const [amount, setAmount] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [payment, setPayment] = useState('')
  const [validFrom, setValidFrom] = useState(today)
  const [validUntil, setValidUntil] = useState(addMonthsIso(today, 12))
  const [professionalId, setProfessionalId] = useState(p.defaultProfessionalId ?? '')
  const [title, setTitle] = useState('Contrato de prestação de serviços')
  const [text, setText] = useState('')
  // true quando o texto foi escrito/ajustado à mão (ou veio de um rascunho salvo): o sistema para de reescrevê-lo
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<'save' | 'send' | null>(null)
  const [error, setError] = useState('')

  const templates = useQuery({ queryKey: ['contrato-modelos'], queryFn: listTemplates, staleTime: 30_000 })
  const existing = useQuery({
    queryKey: ['contrato', p.editId],
    queryFn: () => getContract(p.editId!),
    enabled: editing,
    staleTime: 0,
  })
  // carrega o rascunho uma vez
  const [loadedId, setLoadedId] = useState<string | null>(null)
  if (editing && existing.data && loadedId !== existing.data.id) {
    const c = existing.data
    setLoadedId(c.id)
    setTitle(c.title); setText(c.contentText); setDirty(true)
    setAmount(c.amount === null ? '' : String(c.amount)); setAmountTouched(true)
    setPayment(c.paymentMethod ?? '')
    setValidFrom(c.validFrom ?? ''); setValidUntil(c.validUntil ?? '')
    setProfessionalId(c.professionalId ?? '')
    setPackageId(c.packageId ?? '')
    setTemplateKey(c.templateId ?? PADRAO)
  }

  const clinicTemplates: TemplateItem[] = templates.data ?? []
  const templateBody =
    templateKey === PADRAO ? DEFAULT_TEMPLATE_BODY
    : templateKey === FICHA ? p.legacyText
    : clinicTemplates.find(t => t.id === templateKey)?.body ?? DEFAULT_TEMPLATE_BODY

  const pkg = p.packages.find(k => k.id === packageId)
  const pro = p.professionals.find(x => x.id === professionalId)
  // valor sugerido (pacote ou orçamento) enquanto a pessoa não digitou outro
  const suggested = suggestAmount({ packagePrice: pkg?.price, planItems: p.planItems })
  const amountText = amountTouched ? amount : suggested !== null ? String(suggested) : ''
  const amountNumber = amountText === '' ? null : Number(amountText)

  const ctx: ContractContext = useMemo(() => ({
    patientName: p.patient.name, patientCpf: p.patient.cpf, guardianName: p.patient.guardian_name, guardianCpf: p.patient.guardian_cpf, patientAddress: p.patient.address,
    clinicName: p.clinicName, clinicAddress: p.clinicAddress,
    professionalName: pro?.name, professionalRegistration: pro?.registration,
    amount: amountNumber !== null && Number.isFinite(amountNumber) ? amountNumber : null,
    paymentMethod: payment, validFrom, validUntil,
    packageName: pkg?.name, packageSessions: pkg?.sessions, planItems: p.planItems, today,
  }), [p.patient, p.clinicName, p.clinicAddress, p.planItems, pro, amountNumber, payment, validFrom, validUntil, pkg, today])

  const rendered = useMemo(() => renderContract(templateBody, ctx), [templateBody, ctx])
  const shownText = dirty ? text : rendered.text
  const pending = findPlaceholders(shownText)

  async function save(send: boolean) {
    setError('')
    const input = { title, contentText: shownText, validFrom, validUntil, amount: ctx.amount, paymentMethod: payment, professionalId: professionalId || null }
    const v = validateContractDraft(input)
    if (!v.ok) { setError(v.error); return }
    if (send && pending.length > 0) { setError(`Preencha antes de enviar: ${pending.slice(0, 4).join(', ')}.`); return }
    setBusy(send ? 'send' : 'save')
    try {
      if (p.editId) {
        await updateContract(p.editId, input)
        p.onSaved(p.editId, send)
      } else {
        const r = await createContract({ ...input, patientId: p.patient.id, templateId: clinicTemplates.some(t => t.id === templateKey) ? templateKey : null, packageId: packageId || null })
        p.onSaved(r.id, send)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o contrato.')
    } finally {
      setBusy(null)
    }
  }

  const templateOptions = [
    { value: PADRAO, label: DEFAULT_TEMPLATE_NAME },
    ...clinicTemplates.map(t => ({ value: t.id, label: t.name })),
    ...(p.legacyText.trim() ? [{ value: FICHA, label: 'Texto salvo na ficha do paciente' }] : []),
  ]

  return (
    <Modal
      open onClose={p.onClose} size="lg" title={editing ? 'Editar contrato' : 'Novo contrato'} subtitle={p.patient.name}
      footer={<>
        <button type="button" className={btn.secondary} onClick={p.onClose}>Fechar</button>
        <button type="button" className={btn.secondary} onClick={() => save(false)} disabled={busy !== null || (editing && existing.isLoading)}>{busy === 'save' ? 'Salvando...' : 'Salvar rascunho'}</button>
        <button type="button" className={btn.primary} onClick={() => save(true)} disabled={busy !== null || (editing && existing.isLoading)}>{busy === 'send' ? 'Salvando...' : 'Salvar e enviar para assinatura'}</button>
      </>}
    >
      <div className={styles.stack}>
        {editing && existing.isError && <div className={f.error} role="alert">{existing.error instanceof Error ? existing.error.message : 'Não foi possível abrir o contrato.'}</div>}
        <p className={f.note}>{REVIEW_NOTE}</p>

        <div className={f.row2}>
          <div className={f.field}>
            <label htmlFor="ct-modelo">Modelo</label>
            <SelectMenu variant="field" id="ct-modelo" value={templateKey} options={templateOptions} onChange={v => { setTemplateKey(v); setDirty(false) }} />
          </div>
          <div className={f.field}>
            <label htmlFor="ct-titulo">Título</label>
            <input id="ct-titulo" value={title} maxLength={120} onChange={e => setTitle(e.target.value)} />
          </div>
        </div>

        <div className={f.row2}>
          {p.packages.length > 0 && (
            <div className={f.field}>
              <label htmlFor="ct-pacote">Pacote</label>
              <SelectMenu variant="field" id="ct-pacote" value={packageId} onChange={v => { setPackageId(v); setAmountTouched(false) }}
                options={[{ value: '', label: 'Sem pacote (usar o orçamento)' }, ...p.packages.map(k => ({ value: k.id, label: `${k.name} (${k.sessions} sessões)` }))]} />
            </div>
          )}
          <div className={f.field}>
            <label htmlFor="ct-valor">Valor (R$)</label>
            <MoneyInput id="ct-valor" value={amountText} onChange={v => { setAmount(v); setAmountTouched(true) }} />
            <span className={f.hint}>{suggested !== null && !amountTouched ? 'Sugerido pelo pacote ou orçamento do paciente.' : 'Deixe vazio se ainda não foi combinado.'}</span>
          </div>
          <div className={f.field}>
            <label htmlFor="ct-pgto">Forma de pagamento</label>
            <SelectMenu variant="field" id="ct-pgto" value={payment} onChange={setPayment}
              options={[{ value: '', label: 'Não informada' }, ...PAYMENT_METHODS.map(m => ({ value: m, label: m }))]} />
          </div>
          <div className={f.field}>
            <label htmlFor="ct-prof">Profissional responsável</label>
            <SelectMenu variant="field" id="ct-prof" value={professionalId} onChange={setProfessionalId}
              options={[{ value: '', label: 'Não informado' }, ...p.professionals.map(x => ({ value: x.id, label: x.name }))]} />
          </div>
          <div className={f.field}>
            <label htmlFor="ct-ini">Início da vigência</label>
            <DatePicker id="ct-ini" value={validFrom} onChange={setValidFrom} />
          </div>
          <div className={f.field}>
            <label htmlFor="ct-fim">Término da vigência</label>
            <DatePicker id="ct-fim" value={validUntil} onChange={setValidUntil} min={validFrom || undefined} />
            <span className={f.hint}>O sistema avisa 30 dias antes de vencer.</span>
          </div>
        </div>

        <div className={f.field}>
          <label htmlFor="ct-texto">Texto que o paciente vai ler e assinar</label>
          <textarea id="ct-texto" className={styles.docText} value={shownText} onChange={e => { setText(e.target.value); setDirty(true) }} />
          {dirty && <button type="button" className={btn.ghost} onClick={() => setDirty(false)}>Refazer o texto a partir do modelo e dos dados acima</button>}
        </div>
        {pending.length > 0 && <p className={styles.pending} role="note">Falta informar: {pending.join(', ')}. Complete os campos acima ou escreva direto no texto. Contrato com [pendências] só pode ser salvo como rascunho.</p>}
        {error && <div className={f.error} role="alert">{error}</div>}
      </div>
    </Modal>
  )
}
