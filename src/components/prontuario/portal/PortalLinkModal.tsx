'use client'
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { openPrint } from '@/lib/print'
import { buildPortalMessage, DEFAULT_TTL_DAYS, LINK_STATE_LABEL, MAX_DOCS_PER_LINK, MAX_MESSAGE_LENGTH, TTL_OPTIONS_DAYS, whatsappLink } from '@/lib/portal/link'
import { SCOPE_HINT, SCOPE_LABEL, scopesForAreas, type PortalScope } from '@/lib/portal/scopes'
import { SIGN_DOC_LABEL, SIGN_DOC_TITLE, SIGN_DOC_TYPES, validateDocDraft, type SignDocType } from '@/lib/assinatura/texto'
import { initialDocText } from '@/lib/assinatura/modelos'
import { buildSignedDocumentHtml, NOTA_ASSINATURA_SIMPLES } from '@/lib/assinatura/carimbo'
import { REVIEW_NOTE } from '@/lib/documentBodyTemplates'
import type { AuthClinic, Patient } from '@/types'
import { createLink, fetchSignedDocument, listPortal, revokeLink, type CreatedLink } from './portalApi'
import styles from './portal.module.css'

interface Props {
  patient: Patient
  clinic: AuthClinic
  /** Contrato salvo na ficha do paciente, usado como texto inicial do tipo "Contrato" */
  contractText?: string | null
  onClose: () => void
}

interface DocDraft { key: number; docType: SignDocType; title: string; text: string }

const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export function PortalLinkModal({ patient, clinic, contractText, onClose }: Props) {
  const queryClient = useQueryClient()
  const available = useMemo(() => scopesForAreas(clinic.specialties?.length ? clinic.specialties : [clinic.type]), [clinic.specialties, clinic.type])
  const [scopes, setScopes] = useState<PortalScope[]>(['proximas_consultas'])
  const [ttl, setTtl] = useState<number>(DEFAULT_TTL_DAYS)
  const [message, setMessage] = useState('')
  const [docs, setDocs] = useState<DocDraft[]>([])
  const [nextKey, setNextKey] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedLink | null>(null)

  const ctx = { patientName: patient.name, clinicName: clinic.name, contractText }
  const hasSign = scopes.includes('assinatura')

  const history = useQuery({
    queryKey: ['portal-links', patient.id],
    queryFn: () => listPortal(patient.id),
    staleTime: 15_000,
  })

  function toggleScope(s: PortalScope) {
    setScopes(prev => {
      const on = prev.includes(s)
      const next = on ? prev.filter(x => x !== s) : [...prev, s]
      if (s === 'assinatura' && !on && docs.length === 0) addDoc('tcle')
      return next
    })
  }

  function addDoc(type: SignDocType) {
    setDocs(prev => prev.length >= MAX_DOCS_PER_LINK ? prev : [...prev, { key: nextKey, docType: type, title: SIGN_DOC_TITLE[type], text: initialDocText(type, ctx) }])
    setNextKey(k => k + 1)
  }
  function patchDoc(key: number, patch: Partial<DocDraft>) {
    setDocs(prev => prev.map(d => d.key === key ? { ...d, ...patch } : d))
  }
  function changeDocType(key: number, type: SignDocType) {
    patchDoc(key, { docType: type, title: SIGN_DOC_TITLE[type], text: initialDocText(type, ctx) })
  }

  async function generate() {
    setError('')
    if (scopes.length === 0) { setError('Escolha o que o paciente poderá ver.'); return }
    const payloadDocs: { docType: SignDocType; title: string; contentText: string }[] = []
    if (hasSign) {
      if (docs.length === 0) { setError('Inclua ao menos um documento para assinar.'); return }
      for (const d of docs) {
        const v = validateDocDraft({ docType: d.docType, title: d.title, contentText: d.text })
        if (!v.ok) { setError(`${SIGN_DOC_LABEL[d.docType]}: ${v.error}`); return }
        payloadDocs.push({ docType: v.docType, title: v.title, contentText: v.contentText })
      }
    }
    setBusy(true)
    try {
      const r = await createLink({ patientId: patient.id, scopes, ttlDays: ttl, message: scopes.includes('orientacoes') ? message : '', docs: payloadDocs })
      setCreated(r)
      void queryClient.invalidateQueries({ queryKey: ['portal-links', patient.id] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar o link.')
    } finally {
      setBusy(false)
    }
  }

  const waText = created ? buildPortalMessage({ patientName: patient.name, clinicName: clinic.name, url: created.url, scopes: created.scopes, expiresAt: new Date(created.expiresAt) }) : ''
  const waHref = created ? whatsappLink(patient.phone, waText) : null

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      showToast('ok', 'Copiado.')
    } catch {
      showToast('error', 'Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  async function revoke(id: string) {
    const ok = await confirmDialog({ title: 'Revogar o link?', message: 'O paciente deixa de abrir a página na hora e os documentos ainda não assinados deste link deixam de poder ser assinados.', confirmText: 'Revogar', danger: true })
    if (!ok) return
    try {
      await revokeLink(id)
      showToast('ok', 'Link revogado.')
      void queryClient.invalidateQueries({ queryKey: ['portal-links', patient.id] })
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Não foi possível revogar.')
    }
  }

  async function printSigned(requestId: string) {
    try {
      const doc = await fetchSignedDocument(requestId)
      await openPrint(buildSignedDocumentHtml(doc))
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Não foi possível abrir o documento.')
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title="Link do paciente" subtitle={patient.name}
      footer={created
        ? <button type="button" className={btn.primary} onClick={onClose}>Concluir</button>
        : <>
            <button type="button" className={btn.secondary} onClick={onClose}>Fechar</button>
            <button type="button" className={btn.primary} onClick={generate} disabled={busy}>{busy ? 'Gerando...' : 'Gerar link'}</button>
          </>}
    >
      {created ? (
        <div className={styles.stack}>
          <p className={f.lead}>Link gerado. Ele aparece completo só agora: copie ou envie antes de fechar.</p>
          <div className={styles.urlRow}>
            <input className={styles.urlInput} readOnly value={created.url} aria-label="Link do paciente" onFocus={e => e.currentTarget.select()} />
            <button type="button" className={btn.secondary} onClick={() => copy(created.url)}><Icon name="copy" size={14} /> Copiar link</button>
          </div>
          <div className={styles.actions}>
            {waHref
              ? <a className={btn.primary} href={waHref} target="_blank" rel="noopener noreferrer"><Icon name="send" size={14} /> Abrir no WhatsApp</a>
              : <span className={f.hint}>Paciente sem telefone válido: copie o link e envie por onde preferir.</span>}
            <button type="button" className={btn.secondary} onClick={() => copy(waText)}>Copiar mensagem</button>
          </div>
          <p className={f.note}>O WhatsApp abre com o texto pronto e nada é enviado sozinho: você confere e envia. Válido até {fmt(created.expiresAt)}.</p>
        </div>
      ) : (
        <div className={styles.stack}>
          <div className={styles.group}>
            <p className={styles.groupTitle}>O que o paciente poderá ver</p>
            <div className={styles.checks}>
              {available.map(s => (
                <label key={s} className={styles.check}>
                  <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggleScope(s)} />
                  <span><b>{SCOPE_LABEL[s]}</b><small>{SCOPE_HINT[s]}</small></span>
                </label>
              ))}
            </div>
          </div>

          <div className={f.field}>
            <label htmlFor="portal-ttl">Validade do link</label>
            <select id="portal-ttl" value={ttl} onChange={e => setTtl(Number(e.target.value))}>
              {TTL_OPTIONS_DAYS.map(d => <option key={d} value={d}>{d} dias</option>)}
            </select>
          </div>

          {scopes.includes('orientacoes') && (
            <div className={f.field}>
              <label htmlFor="portal-msg">Orientações para o paciente</label>
              <textarea id="portal-msg" value={message} maxLength={MAX_MESSAGE_LENGTH} onChange={e => setMessage(e.target.value)} placeholder="Ex.: jejum de 8 horas antes do exame. Traga os exames anteriores." />
              <span className={f.hint}>Aparece na página do paciente. Não escreva dados que ele não deva ver.</span>
            </div>
          )}

          {hasSign && (
            <div className={styles.group}>
              <p className={styles.groupTitle}>Documentos para assinar</p>
              <p className={f.note}>{NOTA_ASSINATURA_SIMPLES} {REVIEW_NOTE}</p>
              {docs.map(d => (
                <div key={d.key} className={styles.docCard}>
                  <div className={f.row2}>
                    <div className={f.field}>
                      <label htmlFor={`dt-${d.key}`}>Tipo</label>
                      <select id={`dt-${d.key}`} value={d.docType} onChange={e => changeDocType(d.key, e.target.value as SignDocType)}>
                        {SIGN_DOC_TYPES.map(t => <option key={t} value={t}>{SIGN_DOC_LABEL[t]}</option>)}
                      </select>
                    </div>
                    <div className={f.field}>
                      <label htmlFor={`dtt-${d.key}`}>Título</label>
                      <input id={`dtt-${d.key}`} value={d.title} maxLength={120} onChange={e => patchDoc(d.key, { title: e.target.value })} />
                    </div>
                  </div>
                  <div className={f.field}>
                    <label htmlFor={`dx-${d.key}`}>Texto que o paciente vai ler e assinar</label>
                    <textarea id={`dx-${d.key}`} className={styles.docText} value={d.text} onChange={e => patchDoc(d.key, { text: e.target.value })} placeholder={d.docType === 'contrato' ? 'Cole ou escreva o contrato. A ficha do paciente ainda não tem contrato salvo.' : ''} />
                    <span className={f.hint}>Substitua tudo que estiver entre [colchetes] antes de gerar.</span>
                  </div>
                  <button type="button" className={btn.ghost} onClick={() => setDocs(prev => prev.filter(x => x.key !== d.key))}><Icon name="trash" size={14} /> Remover documento</button>
                </div>
              ))}
              {docs.length < MAX_DOCS_PER_LINK && (
                <button type="button" className={btn.secondary} onClick={() => addDoc('tcle')}><Icon name="plus" size={14} /> Adicionar documento</button>
              )}
            </div>
          )}

          {error && <div className={f.error} role="alert">{error}</div>}
        </div>
      )}

      <div className={styles.history}>
        <p className={styles.groupTitle}>Links e assinaturas deste paciente</p>
        {history.isLoading && <p className={f.hint}>Carregando...</p>}
        {history.isError && <p className={f.hint}>{history.error instanceof Error ? history.error.message : 'Não foi possível carregar o histórico.'}</p>}
        {history.data && history.data.links.length === 0 && history.data.signatures.length === 0 && <p className={f.hint}>Nenhum link gerado ainda.</p>}
        {history.data?.links.map(l => (
          <div key={l.id} className={styles.histRow}>
            <div className={styles.histMain}>
              <b>{l.scopes.map(s => SCOPE_LABEL[s]).join(', ')}</b>
              <small>{LINK_STATE_LABEL[l.state]} · criado em {fmt(l.createdAt)} · até {fmt(l.expiresAt)} · {l.accessCount} {l.accessCount === 1 ? 'acesso' : 'acessos'}{l.lastAccessAt ? ` (último em ${fmt(l.lastAccessAt)})` : ''}</small>
            </div>
            {l.state === 'active' && <button type="button" className={btn.secondary} onClick={() => revoke(l.id)}>Revogar</button>}
          </div>
        ))}
        {history.data?.signatures.map(s => (
          <div key={s.id} className={styles.histRow}>
            <div className={styles.histMain}>
              <b>{s.title}</b>
              <small>{s.status === 'assinado' ? `Assinado por ${s.signerName} em ${s.signedAt ? fmt(s.signedAt) : ''}` : s.status === 'pendente' ? 'Aguardando assinatura' : 'Revogado'}</small>
            </div>
            {s.status === 'assinado' && <button type="button" className={btn.secondary} onClick={() => printSigned(s.id)}>Ver e imprimir</button>}
          </div>
        ))}
      </div>
    </Modal>
  )
}
