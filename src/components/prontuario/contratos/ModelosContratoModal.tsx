'use client'
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { CONTRACT_TOKENS, DEFAULT_TEMPLATE_BODY, DEFAULT_TEMPLATE_NAME, validateTemplateInput } from '@/lib/contratos/modelo'
import { deleteTemplate, listTemplates, saveTemplate } from './contratosApi'
import styles from './contratos.module.css'

interface Draft { id?: string; name: string; body: string }

/** Edição dos modelos de contrato da clínica. O texto padrão (CONTRATADA / CONTRATANTE) pode ser copiado para virar um modelo próprio. */
export function ModelosContratoModal({ canEdit, onClose }: { canEdit: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const { data: templates = [], isLoading, isError, error: loadError } = useQuery({ queryKey: ['contrato-modelos'], queryFn: listTemplates, staleTime: 30_000 })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  function insertToken(key: string) {
    const el = areaRef.current
    if (!el || !draft) return
    const tag = `{{${key}}}`
    const start = el.selectionStart ?? draft.body.length
    const end = el.selectionEnd ?? start
    const body = draft.body.slice(0, start) + tag + draft.body.slice(end)
    setDraft({ ...draft, body })
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(start + tag.length, start + tag.length) })
  }

  async function save() {
    if (!draft) return
    setError('')
    const v = validateTemplateInput(draft)
    if (!v.ok) { setError(v.error); return }
    setBusy(true)
    try {
      await saveTemplate({ id: draft.id, name: v.value.name, body: v.value.body })
      showToast('ok', 'Modelo salvo.')
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ['contrato-modelos'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível salvar o modelo.')
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string, name: string) {
    const ok = await confirmDialog({ title: 'Apagar o modelo?', message: `O modelo "${name}" deixa de aparecer na lista. Contratos já criados com ele não mudam.`, confirmText: 'Apagar', danger: true })
    if (!ok) return
    try {
      await deleteTemplate(id)
      showToast('ok', 'Modelo apagado.')
      void queryClient.invalidateQueries({ queryKey: ['contrato-modelos'] })
    } catch (e) {
      showToast('error', e instanceof Error ? e.message : 'Não foi possível apagar.')
    }
  }

  return (
    <Modal
      open onClose={onClose} size="lg" title={draft ? (draft.id ? 'Editar modelo' : 'Novo modelo') : 'Modelos de contrato'}
      footer={draft
        ? <>
            <button type="button" className={btn.secondary} onClick={() => { setDraft(null); setError('') }}>Voltar</button>
            <button type="button" className={btn.primary} onClick={save} disabled={busy}>{busy ? 'Salvando...' : 'Salvar modelo'}</button>
          </>
        : <>
            <button type="button" className={btn.secondary} onClick={onClose}>Fechar</button>
            {canEdit && <button type="button" className={btn.primary} onClick={() => setDraft({ name: '', body: DEFAULT_TEMPLATE_BODY })}><Icon name="plus" size={14} /> Novo modelo</button>}
          </>}
    >
      {draft ? (
        <div className={styles.stack}>
          <div className={f.field}>
            <label htmlFor="mt-nome">Nome do modelo</label>
            <input id="mt-nome" value={draft.name} maxLength={80} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="Ex.: Contrato de pacote de sessões" />
          </div>
          <div className={f.field}>
            <label htmlFor="mt-texto">Texto do modelo</label>
            <textarea id="mt-texto" ref={areaRef} className={styles.docText} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} />
            <span className={f.hint}>Os campos entre chaves duplas são preenchidos sozinhos com os dados do paciente e do contrato. Toque para inserir no ponto do cursor:</span>
          </div>
          <div className={styles.chips}>
            {CONTRACT_TOKENS.map(t => <button key={t.key} type="button" className={styles.chip} onClick={() => insertToken(t.key)}>{t.label}</button>)}
          </div>
          {error && <div className={f.error} role="alert">{error}</div>}
        </div>
      ) : (
        <div className={styles.stack}>
          <p className={f.note}>Cada contrato novo parte de um modelo. Edite o texto uma vez e os dados do paciente, o valor, a forma de pagamento, a vigência e o profissional entram sozinhos.</p>
          <div className={styles.tplRow}>
            <div className={styles.rowMain}>
              <b>{DEFAULT_TEMPLATE_NAME}</b>
              <span className={styles.meta}>Modelo do sistema, não editável. Copie para ajustar.</span>
            </div>
            {canEdit && <button type="button" className={btn.secondary} onClick={() => setDraft({ name: 'Meu contrato de prestação de serviços', body: DEFAULT_TEMPLATE_BODY })}>Copiar e editar</button>}
          </div>
          {isLoading && <p className={f.hint}>Carregando...</p>}
          {isError && <p className={f.hint}>{loadError instanceof Error ? loadError.message : 'Não foi possível carregar os modelos.'}</p>}
          {templates.map(t => (
            <div key={t.id} className={styles.tplRow}>
              <div className={styles.rowMain}><b>{t.name}</b></div>
              {canEdit && (
                <div className={styles.rowActions}>
                  <button type="button" className={btn.secondary} onClick={() => setDraft({ id: t.id, name: t.name, body: t.body })}>Editar</button>
                  <button type="button" className={btn.ghost} onClick={() => remove(t.id, t.name)}>Apagar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
