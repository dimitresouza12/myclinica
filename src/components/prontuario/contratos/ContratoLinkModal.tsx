'use client'
import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { showToast } from '@/components/ui/Toast'
import btn from '@/components/ui/button.module.css'
import f from '@/components/ui/modalForm.module.css'
import { buildPortalMessage, DEFAULT_TTL_DAYS, TTL_OPTIONS_DAYS, whatsappLink } from '@/lib/portal/link'
import { NOTA_ASSINATURA_SIMPLES } from '@/lib/assinatura/carimbo'
import { sendContract } from './contratosApi'
import styles from './contratos.module.css'

interface Props {
  contractId: string
  contractTitle: string
  patientName: string
  patientPhone: string | null
  clinicName: string
  /** Contrato já enviado antes: o link anterior será revogado. */
  resend: boolean
  onDone: () => void
  onClose: () => void
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Gera o link do paciente com o contrato para assinar (mesmo link e mesma assinatura do botão "Link do paciente"). */
export function ContratoLinkModal(p: Props) {
  const [ttl, setTtl] = useState<number>(DEFAULT_TTL_DAYS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ url: string; expiresAt: string } | null>(null)

  async function generate() {
    setError(''); setBusy(true)
    try {
      setResult(await sendContract(p.contractId, ttl))
      p.onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível gerar o link.')
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); showToast('ok', 'Copiado.') } catch { showToast('error', 'Não foi possível copiar. Selecione o texto e copie manualmente.') }
  }

  const text = result ? buildPortalMessage({ patientName: p.patientName, clinicName: p.clinicName, url: result.url, scopes: ['assinatura'], expiresAt: new Date(result.expiresAt) }) : ''
  const wa = result ? whatsappLink(p.patientPhone, text) : null

  return (
    <Modal
      open onClose={p.onClose} size="md" title={p.resend ? 'Reenviar contrato para assinatura' : 'Enviar contrato para assinatura'} subtitle={p.contractTitle}
      footer={result
        ? <button type="button" className={btn.primary} onClick={p.onClose}>Concluir</button>
        : <>
            <button type="button" className={btn.secondary} onClick={p.onClose}>Fechar</button>
            <button type="button" className={btn.primary} onClick={generate} disabled={busy}>{busy ? 'Gerando...' : 'Gerar link'}</button>
          </>}
    >
      {result ? (
        <div className={styles.stack}>
          <p className={f.lead}>Link gerado. Ele aparece completo só agora: copie ou envie antes de fechar.</p>
          <div className={styles.urlRow}>
            <input className={styles.urlInput} readOnly value={result.url} aria-label="Link do paciente" onFocus={e => e.currentTarget.select()} />
            <button type="button" className={btn.secondary} onClick={() => copy(result.url)}><Icon name="copy" size={14} /> Copiar link</button>
          </div>
          <div className={styles.actions}>
            {wa
              ? <a className={btn.primary} href={wa} target="_blank" rel="noopener noreferrer"><Icon name="send" size={14} /> Abrir no WhatsApp</a>
              : <span className={f.hint}>Paciente sem telefone válido: copie o link e envie por onde preferir.</span>}
            <button type="button" className={btn.secondary} onClick={() => copy(text)}>Copiar mensagem</button>
          </div>
          <p className={f.note}>Nada é enviado sozinho: você confere e envia. O link vale até {fmt(result.expiresAt)}.</p>
        </div>
      ) : (
        <div className={styles.stack}>
          <p className={f.lead}>{p.resend ? 'O link anterior deixa de valer e um novo é gerado com o mesmo texto.' : 'O paciente recebe um link pessoal, lê o contrato e assina na própria tela.'}</p>
          <div className={f.field}>
            <label htmlFor="cl-ttl">Validade do link</label>
            <select id="cl-ttl" value={ttl} onChange={e => setTtl(Number(e.target.value))}>
              {TTL_OPTIONS_DAYS.map(d => <option key={d} value={d}>{d} dias</option>)}
            </select>
          </div>
          <p className={f.note}>{NOTA_ASSINATURA_SIMPLES} Depois de enviado, o texto não pode mais ser alterado.</p>
          {error && <div className={f.error} role="alert">{error}</div>}
        </div>
      )}
    </Modal>
  )
}
