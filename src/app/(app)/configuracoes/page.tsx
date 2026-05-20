'use client'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { connectGoogleCalendar, disconnectGoogleCalendar, isGCalConnected } from '@/lib/googleCalendar'
import type { AuthClinic, ClinicDocumentTemplate, DocumentTemplateType } from '@/types'
import styles from './configuracoes.module.css'

const DOC_TEMPLATE_TYPES: { type: DocumentTemplateType; label: string }[] = [
  { type: 'receita_comum',             label: 'Receita Comum' },
  { type: 'receita_especial',          label: 'Receita Especial' },
  { type: 'declaracao_comparecimento', label: 'Declaração de Comparecimento' },
  { type: 'atestado',                  label: 'Atestado' },
]

const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB

export default function ConfiguracoesPage() {
  const { clinic, user, setSession, setClinicLogo } = useAuthStore()
  const [name, setName] = useState(clinic?.name ?? '')
  const [address, setAddress] = useState(clinic?.address ?? '')
  const [phone, setPhone] = useState(clinic?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMsg, setLogoMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [gcalConnected, setGcalConnected] = useState(isGCalConnected(clinic?.gcalConnected))
  const [gcalLoading, setGcalLoading] = useState(false)
  const [gcalError, setGcalError] = useState('')

  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const [docTemplates, setDocTemplates] = useState<ClinicDocumentTemplate[]>([])
  const [docUploading, setDocUploading] = useState<DocumentTemplateType | null>(null)
  const [docMsg, setDocMsg] = useState<{ type: DocumentTemplateType; ok: boolean } | null>(null)
  const docInputRefs = useRef<Partial<Record<DocumentTemplateType, HTMLInputElement | null>>>({})

  useEffect(() => {
    if (!clinic?.id) return
    supabase.from('clinic_document_templates').select('*').eq('clinic_id', clinic.id)
      .then(({ data }) => setDocTemplates((data ?? []) as ClinicDocumentTemplate[]))
  }, [clinic?.id])

  async function handleDocUpload(type: DocumentTemplateType, file: File) {
    if (!clinic?.id) return
    setDocUploading(type)
    setDocMsg(null)
    const isPdf = file.type === 'application/pdf'
    const ext = isPdf ? 'pdf' : file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${clinic.id}/${type}.${ext}`
    const { error: upErr } = await supabase.storage.from('document-templates').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { setDocUploading(null); setDocMsg({ type, ok: false }); return }
    const { data: urlData } = supabase.storage.from('document-templates').getPublicUrl(path)
    const pdf_url = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('clinic_document_templates').upsert({ clinic_id: clinic.id, type, pdf_url }, { onConflict: 'clinic_id,type' })
    setDocTemplates(prev => {
      const rest = prev.filter(t => t.type !== type)
      return [...rest, { id: '', clinic_id: clinic.id, type, pdf_url, created_at: '', updated_at: '' }]
    })
    setDocUploading(null)
    setDocMsg({ type, ok: true })
    setTimeout(() => setDocMsg(null), 3000)
  }

  async function handleLogoUpload(file: File) {
    if (!clinic?.id) return
    setLogoMsg(null)
    if (!file.type.startsWith('image/')) {
      setLogoMsg({ ok: false, text: 'Selecione um arquivo de imagem (PNG, JPG, SVG).' })
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoMsg({ ok: false, text: 'Arquivo maior que 2 MB. Otimize a imagem antes de enviar.' })
      return
    }
    setLogoUploading(true)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${clinic.id}/logo.${ext}`
    const { error: upErr } = await supabase.storage.from('clinic-logos').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) {
      setLogoUploading(false)
      setLogoMsg({ ok: false, text: 'Erro no upload: ' + upErr.message })
      return
    }
    const { data: urlData } = supabase.storage.from('clinic-logos').getPublicUrl(path)
    const publicUrl = urlData.publicUrl + '?t=' + Date.now()
    await supabase.from('clinics').update({ logo_url: publicUrl }).eq('id', clinic.id)
    setClinicLogo(publicUrl)
    setLogoUploading(false)
    setLogoMsg({ ok: true, text: 'Logo atualizada!' })
    setTimeout(() => setLogoMsg(null), 3000)
  }

  async function handleLogoRemove() {
    if (!clinic?.id) return
    if (!confirm('Remover a logo da clínica?')) return
    await supabase.from('clinics').update({ logo_url: null }).eq('id', clinic.id)
    setClinicLogo('')
    setLogoMsg({ ok: true, text: 'Logo removida.' })
    setTimeout(() => setLogoMsg(null), 3000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!clinic) return
    setSaving(true)
    await supabase.from('clinics').update({ name, address, phone }).eq('id', clinic.id)
    setSession({ ...clinic, name, address, phone }, user!)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
    setSaving(false)
  }

  async function handleConnectGCal() {
    setGcalError('')
    setGcalLoading(true)
    try {
      await connectGoogleCalendar()
      setGcalConnected(true)
      setSession({ ...clinic!, gcalConnected: true } as AuthClinic, user!)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setGcalError(msg)
    } finally {
      setGcalLoading(false)
    }
  }

  async function handleDisconnectGCal() {
    await disconnectGoogleCalendar(clinic?.id)
    setGcalConnected(false)
    setSession({ ...clinic!, gcalConnected: false } as AuthClinic, user!)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (pwNew.length < 6) return setPwMsg({ type: 'error', text: 'A nova senha deve ter pelo menos 6 caracteres.' })
    if (pwNew !== pwConfirm) return setPwMsg({ type: 'error', text: 'As senhas não coincidem.' })
    setPwSaving(true)
    try {
      // Re-autenticar com senha atual para validar
      const { data: userData } = await supabase.auth.getUser()
      const email = userData.user?.email
      if (email && pwCurrent) {
        const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: pwCurrent })
        if (signInErr) {
          setPwMsg({ type: 'error', text: 'Senha atual incorreta.' })
          setPwSaving(false)
          return
        }
      }
      const { error } = await supabase.auth.updateUser({ password: pwNew })
      if (error) throw error
      setPwMsg({ type: 'ok', text: 'Senha alterada com sucesso!' })
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
    } catch (err: unknown) {
      setPwMsg({ type: 'error', text: err instanceof Error ? err.message : 'Erro ao alterar senha.' })
    } finally {
      setPwSaving(false)
    }
  }

  const hasClientId = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Configurações</h1>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Dados da Clínica</h2>
        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.field}>
            <label>Nome da Clínica</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Telefone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
          <div className={styles.field}>
            <label>Endereço</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className={styles.saveRow}>
            {saved && <span className={styles.savedMsg}>✓ Salvo!</span>}
            <button type="submit" className={styles.btnSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>
      </div>

      {/* Logo da Clínica */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Logo da Clínica</h2>
        <p className={styles.gcalDesc}>
          A logo aparece no topo do painel e no cabeçalho de prontuários, contratos, receitas e atestados impressos.
          Recomendado: PNG/SVG com fundo transparente, até 2 MB.
        </p>
        <div className={styles.logoRow}>
          <div className={styles.logoPreview}>
            {clinic?.logo
              ? <img src={clinic.logo} alt="Logo da clínica" />
              : <span className={styles.logoPlaceholder}>Sem logo</span>
            }
          </div>
          <div className={styles.logoActions}>
            <button
              className={styles.btnSave}
              disabled={logoUploading}
              onClick={() => logoInputRef.current?.click()}
            >
              {logoUploading ? 'Enviando...' : clinic?.logo ? 'Trocar Logo' : 'Enviar Logo'}
            </button>
            {clinic?.logo && (
              <button
                className={styles.btnDisconnect}
                disabled={logoUploading}
                onClick={handleLogoRemove}
              >
                Remover
              </button>
            )}
            {logoMsg && (
              <span className={logoMsg.ok ? styles.savedMsg : styles.pwError}>{logoMsg.text}</span>
            )}
            <input
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              ref={logoInputRef}
              onChange={e => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (file) handleLogoUpload(file)
              }}
            />
          </div>
        </div>
      </div>

      {/* Google Calendar */}
      <div className={styles.card}>
        <div className={styles.gcalHeader}>
          <div>
            <h2 className={styles.cardTitle} style={{ marginBottom: '0.25rem' }}>Google Calendar</h2>
            <p className={styles.gcalDesc}>Sincronize sua agenda com o Google Calendar para ver e criar eventos diretamente.</p>
          </div>
          <div className={styles.gcalLogo}>📅</div>
        </div>

        {!hasClientId ? (
          <div className={styles.gcalWarning}>
            <strong>⚠️ NEXT_PUBLIC_GOOGLE_CLIENT_ID não configurado.</strong><br />
            Adicione o Client ID OAuth2 do Google nas variáveis de ambiente do EasyPanel para ativar esta integração.
          </div>
        ) : gcalConnected ? (
          <div className={styles.gcalConnected}>
            <span className={styles.gcalDot} />
            <span>Conta Google conectada</span>
            <button className={styles.btnDisconnect} onClick={handleDisconnectGCal}>Desconectar</button>
          </div>
        ) : (
          <div className={styles.gcalConnect}>
            {gcalError && <p className={styles.gcalError}>{gcalError}</p>}
            <button className={styles.btnGConnect} onClick={handleConnectGCal} disabled={gcalLoading}>
              {gcalLoading ? 'Conectando...' : 'Conectar Google Calendar'}
            </button>
            <p className={styles.gcalHint}>Você será redirecionado para autenticar sua conta Google.</p>
          </div>
        )}
      </div>

      {/* Modelos de Documentos */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Modelos de Documentos</h2>
        <p className={styles.gcalDesc}>Faça upload do PDF com seu papel timbrado. Ele será usado como fundo ao emitir receitas e atestados no prontuário.</p>
        <div className={styles.docTemplateList}>
          {DOC_TEMPLATE_TYPES.map(({ type, label }) => {
            const existing = docTemplates.find(t => t.type === type)
            const uploading = docUploading === type
            const msg = docMsg?.type === type ? docMsg : null
            return (
              <div key={type} className={styles.docTemplateRow}>
                <span className={styles.docTemplateLabel}>{label}</span>
                <div className={styles.docTemplateActions}>
                  {existing
                    ? <span className={styles.docTemplateStatus}>✓ Modelo cadastrado</span>
                    : <span className={styles.docTemplateStatusEmpty}>Sem modelo</span>
                  }
                  {msg?.ok && <span className={styles.docTemplateSaved}>Salvo!</span>}
                  {msg && !msg.ok && <span className={styles.docTemplateError}>Erro no upload</span>}
                  <button
                    className={styles.btnDocUpload}
                    disabled={uploading}
                    onClick={() => docInputRefs.current[type]?.click()}
                  >
                    {uploading ? 'Enviando...' : existing ? 'Trocar PDF' : 'Enviar PDF'}
                  </button>
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    style={{ display: 'none' }}
                    ref={el => { docInputRefs.current[type] = el }}
                    onChange={e => {
                      const file = e.target.files?.[0]
                      e.target.value = ''
                      if (file) handleDocUpload(type, file)
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Segurança</h2>
        <form onSubmit={handleChangePassword} className={styles.form}>
          <div className={styles.field}>
            <label>Senha atual</label>
            <input type="password" value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className={styles.field}>
            <label>Nova senha</label>
            <input type="password" value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" />
          </div>
          <div className={styles.field}>
            <label>Confirmar nova senha</label>
            <input type="password" value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          {pwMsg && (
            <p className={pwMsg.type === 'ok' ? styles.savedMsg : styles.pwError}>{pwMsg.text}</p>
          )}
          <div className={styles.saveRow}>
            <button type="submit" className={styles.btnSave} disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}>
              {pwSaving ? 'Alterando...' : 'Alterar Senha'}
            </button>
          </div>
        </form>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Informações da Conta</h2>
        <div className={styles.infoGrid}>
          <InfoRow label="Usuário" value={user?.displayName ?? '-'} />
          <InfoRow label="Função" value={user?.role ?? '-'} />
          <InfoRow label="Clínica ID" value={clinic?.id ?? '-'} mono />
          <InfoRow label="Plano" value={clinic?.plan === 'plus' ? 'Plus' : 'Básico'} />
        </div>
      </div>
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={`${styles.infoValue} ${mono ? styles.mono : ''}`}>{value}</span>
    </div>
  )
}
