'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { connectGoogleCalendar, disconnectGoogleCalendar, isGCalConnected } from '@/lib/googleCalendar'
import type { AuthClinic, ClinicDocumentTemplate, DocumentTemplateType, FieldPosition, ClinicUser, AuditLog } from '@/types'
import { councilForAreas } from '@/lib/professionalCouncil'
import { resolveDocumentOptions } from '@/lib/specialtyConfig'
import styles from './configuracoes.module.css'
import btn from '@/components/ui/button.module.css'
import { PermissionGuard } from '@/components/ui/PermissionGuard'
import { showToast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorNotice } from '@/components/ui/ErrorNotice'
import { Skeleton } from '@/components/ui/Skeleton'
import { confirmDialog } from '@/components/ui/ConfirmDialog'
import { Icon, type IconName } from '@/components/ui/Icon'
import { PlanoTab } from '@/components/configuracoes/PlanoTab'
import { SelectMenu } from '@/components/ui/SelectMenu'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { MinhaConta } from '@/components/conta/MinhaConta'
import { usePermissions } from '@/hooks/usePermissions'
import { phoneInputError, previousPhoneNote, toInputValue } from '@/lib/phoneFormat'
import { PageHeader } from '@/components/ui/PageHeader'
import { DocumentFieldCalibrator } from '@/components/configuracoes/DocumentFieldCalibrator'
import { WhatsAppTab } from '@/components/configuracoes/WhatsAppTab'
import { AgendaSettingsTab } from '@/components/configuracoes/AgendaSettingsTab'
import { AgendamentoOnlineTab } from '@/components/configuracoes/AgendamentoOnlineTab'
import { useWhatsAppState } from '@/hooks/useClinicData'
import { isImageUrl } from '@/hooks/useTemplateBackground'

const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB

/** Redimensiona e recorta a imagem para quadrado 400x400 via Canvas */
function processLogoImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const size = 400
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')!
      // Recorte centralizado (object-fit: cover)
      const src = Math.min(img.width, img.height)
      const sx = (img.width - src) / 2
      const sy = (img.height - src) / 2
      ctx.drawImage(img, sx, sy, src, src, 0, 0, size, size)
      canvas.toBlob(blob => {
        if (blob) resolve(blob)
        else reject(new Error('Falha ao processar imagem'))
      }, 'image/png', 0.92)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')) }
    img.src = url
  })
}

function ConfiguracoesContent() {
  const { clinic, user, setSession, setClinicLogo } = useAuthStore()
  const searchParams = useSearchParams()
  const initialTab = searchParams.get('tab')
  const [tab, setTab] = useState<'geral' | 'agenda' | 'agendamento-online' | 'plano' | 'documentos' | 'integracoes' | 'whatsapp' | 'conta' | 'auditoria'>(
    (['geral', 'agenda', 'agendamento-online', 'plano', 'documentos', 'integracoes', 'whatsapp', 'conta', 'auditoria'] as const).find(k => k === initialTab) ?? 'geral'
  )
  const [name, setName] = useState(clinic?.name ?? '')
  const [address, setAddress] = useState(clinic?.address ?? '')
  const [phone, setPhone] = useState(() => toInputValue(clinic?.phone))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const logoInputRef = useRef<HTMLInputElement | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoMsg, setLogoMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [gcalConnected, setGcalConnected] = useState(isGCalConnected(clinic?.gcalConnected))
  const [gcalLoading, setGcalLoading] = useState(false)
  const [gcalError, setGcalError] = useState('')

  const [docTemplates, setDocTemplates] = useState<ClinicDocumentTemplate[]>([])
  // Sem professionalType/userType de propósito: aqui o admin gerencia os modelos
  // da clínica inteira (união das áreas). savedTypes mantém acessível o modelo
  // já salvo de um tipo que a área não lista mais (ex.: atestado em estética pura).
  const DOC_TEMPLATE_TYPES = resolveDocumentOptions({
    clinicType: clinic?.type,
    clinicSpecialties: clinic?.specialties,
    savedTypes: docTemplates.map(t => t.type),
  })
  const [docUploading, setDocUploading] = useState<DocumentTemplateType | null>(null)
  const [docMsg, setDocMsg] = useState<{ type: DocumentTemplateType; ok: boolean; errorText?: string } | null>(null)
  const docInputRefs = useRef<Partial<Record<DocumentTemplateType, HTMLInputElement | null>>>({})
  const [calibratingType, setCalibratingType] = useState<DocumentTemplateType | null>(null)
  // DPI efetivo do arquivo enviado, quando abaixo do recomendado pra
  // impressão — só calculado pra imagem (largura natural / 8.27" de uma
  // A4); em PDF a resolução não é um conceito direto (a exportação sempre
  // re-renderiza a 300dpi independente do arquivo original), então não
  // avisa nesse caso. Nunca bloqueia o upload, só avisa. Chaveado pela
  // própria URL (não pelo tipo) — handleDocUpload sempre gera uma URL nova
  // (?t=timestamp) a cada envio, então trocar o arquivo automaticamente
  // invalida o valor antigo e recalcula, sem precisar de um caminho
  // separado só pro "upload que acabou de acontecer".
  const [dpiByUrl, setDpiByUrl] = useState<Record<string, number | undefined>>({})
  useEffect(() => {
    for (const t of docTemplates) {
      if (t.pdf_url in dpiByUrl) continue
      if (!isImageUrl(t.pdf_url)) continue
      const img = new Image()
      img.onload = () => {
        const dpi = img.naturalWidth / 8.27
        setDpiByUrl(prev => ({ ...prev, [t.pdf_url]: dpi < 150 ? Math.round(dpi) : undefined }))
      }
      img.onerror = () => setDpiByUrl(prev => ({ ...prev, [t.pdf_url]: undefined }))
      img.src = t.pdf_url
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docTemplates])

  // Inclui isSuperAdmin — igual a usePermissions.ts e AppSidebar.tsx.
  // Sem isso, um superadmin não via a aba Auditoria aqui.
  const isAdmin = user?.role === 'admin' || user?.isSuperAdmin
  type NavItem = { key: typeof tab; label: string; hint: string; icon: IconName }
  const navGroups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Clínica',
      items: [
        { key: 'geral', label: 'Geral', hint: 'Nome, telefone e logo', icon: 'settings' },
        ...(isAdmin ? [{ key: 'agenda' as const, label: 'Agenda', hint: 'Turnos, encaixe e lembrete', icon: 'calendar' as const }] : []),
        ...(isAdmin ? [{ key: 'agendamento-online' as const, label: 'Agendamento online', hint: 'Link público para o paciente marcar', icon: 'calendar' as const }] : []),
        { key: 'documentos', label: 'Documentos', hint: 'Papel timbrado', icon: 'procedures' },
      ],
    },
    {
      title: 'Assinatura e conexões',
      items: [
        { key: 'plano', label: 'Plano', hint: 'Assinatura e pagamentos', icon: 'receipt' },
        { key: 'integracoes', label: 'Integrações', hint: isAdmin ? 'WhatsApp e Google Calendar' : 'Google Calendar', icon: 'swap' },
        ...(isAdmin ? [{ key: 'whatsapp' as const, label: 'WhatsApp', hint: 'Número e confirmações', icon: 'chat' as const }] : []),
      ],
    },
    {
      title: 'Segurança',
      items: [
        { key: 'conta', label: 'Conta', hint: 'Sua senha e seu acesso', icon: 'admin' },
        ...(isAdmin ? [{ key: 'auditoria' as const, label: 'Auditoria', hint: 'Histórico de ações no sistema', icon: 'clock' as const }] : []),
      ],
    },
  ]
  const navRef = useRef<HTMLElement>(null)
  const { data: waState } = useWhatsAppState(clinic?.id)
  const [clinicUsers, setClinicUsers] = useState<ClinicUser[]>([])

  // ── Auditoria ────────────────────────────────────────────────
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditModuleFilter, setAuditModuleFilter] = useState('')
  const auditLoadedRef = useRef(false)

  useEffect(() => {
    if (!clinic?.id) return
    supabase.from('clinic_document_templates').select('*').eq('clinic_id', clinic.id)
      .then(({ data }) => setDocTemplates((data ?? []) as ClinicDocumentTemplate[]))
  }, [clinic?.id])

  async function loadAuditLogs() {
    if (!clinic?.id) return
    setAuditLoading(true)
    const { data } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('clinic_id', clinic.id)
      .order('created_at', { ascending: false })
      .limit(200)
    setAuditLogs((data ?? []) as AuditLog[])
    setAuditLoading(false)
  }

  const AUDIT_ACTION_LABELS: Record<string, string> = {
    'auth.login': 'Login', 'auth.logout': 'Logout', 'auth.login_failed': 'Falha de login',
    'patient.create': 'Paciente criado', 'patient.update': 'Paciente atualizado', 'patient.delete': 'Paciente excluído',
    'prontuario.view': 'Prontuário visualizado', 'prontuario.update': 'Prontuário atualizado',
    'financial.create': 'Lançamento criado', 'financial.delete': 'Lançamento excluído',
    'user.create': 'Usuário criado', 'user.update': 'Usuário atualizado', 'user.delete': 'Usuário excluído',
    'user.deactivate': 'Usuário desativado', 'user.reactivate': 'Usuário reativado',
    'stock.movement': 'Movimentação de estoque',
  }
  function auditUserName(userId: string | null) {
    if (!userId) return 'Sistema'
    return clinicUsers.find(u => u.user_id === userId)?.display_name ?? userId.slice(0, 8)
  }
  const auditModules = Array.from(new Set(auditLogs.map(l => l.module))).sort()
  const filteredAuditLogs = auditModuleFilter ? auditLogs.filter(l => l.module === auditModuleFilter) : auditLogs

  // A aba Auditoria usa a lista para mostrar o nome de quem fez cada ação.
  // Cadastro e permissões de usuários ficam em /equipe (AcessosSection).
  useEffect(() => {
    if (!clinic?.id || !isAdmin) return
    supabase
      .from('clinic_users')
      .select('*')
      .eq('clinic_id', clinic.id)
      .eq('is_superadmin', false)
      .order('created_at')
      .then(({ data }) => setClinicUsers((data ?? []) as ClinicUser[]))
  }, [clinic?.id, isAdmin])

  // Carrega auditoria só na primeira vez que a aba é aberta (evita puxar o
  // histórico inteiro sem o admin ter pedido).
  useEffect(() => {
    if (tab !== 'auditoria' || !clinic?.id || auditLoadedRef.current) return
    auditLoadedRef.current = true
    loadAuditLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, clinic?.id])

  // ── Restante dos handlers (logo, gcal, senha, docs) ─────────
  async function handleDocUpload(type: DocumentTemplateType, file: File) {
    if (!clinic?.id) return
    setDocUploading(type)
    setDocMsg(null)
    const isPdf = file.type === 'application/pdf'
    const ext = isPdf ? 'pdf' : file.name.split('.').pop()?.toLowerCase() ?? 'png'
    const path = `${clinic.id}/${type}.${ext}`
    const { error: upErr } = await supabase.storage.from('document-templates').upload(path, file, { upsert: true, contentType: file.type })
    if (upErr) { setDocUploading(null); setDocMsg({ type, ok: false, errorText: upErr.message }); return }
    const { data: urlData } = supabase.storage.from('document-templates').getPublicUrl(path)
    const pdf_url = urlData.publicUrl + '?t=' + Date.now()
    const { error: dbErr } = await supabase.from('clinic_document_templates').upsert({ clinic_id: clinic.id, type, pdf_url }, { onConflict: 'clinic_id,type' })
    if (dbErr) { setDocUploading(null); setDocMsg({ type, ok: false, errorText: dbErr.message }); return }
    setDocTemplates(prev => {
      const rest = prev.filter(t => t.type !== type)
      const previous = prev.find(t => t.type === type)
      // Upsert só toca clinic_id/type/pdf_url — a calibração de campos (se
      // existia) sobrevive no banco a uma troca de arquivo; refletimos isso
      // aqui também em vez de zerar o estado otimista.
      return [...rest, { id: previous?.id ?? '', clinic_id: clinic.id, type, pdf_url, field_positions: previous?.field_positions ?? [], created_at: previous?.created_at ?? '', updated_at: '' }]
    })
    setDocUploading(null)
    setDocMsg({ type, ok: true })
    setTimeout(() => setDocMsg(null), 3000)
    // Aviso de baixa resolução (imagem estreita demais sai borrada quando
    // ampliada pra ocupar a largura de uma A4 impressa) é calculado pelo
    // efeito abaixo, disparado por essa mesma mudança de docTemplates.
  }

  async function handleSaveFieldPositions(type: DocumentTemplateType, fieldPositions: FieldPosition[]) {
    if (!clinic?.id) return
    // pdf_url é NOT NULL na tabela — mesmo atualizando uma linha existente,
    // o upsert do supabase-js gera um INSERT ... ON CONFLICT, e o Postgres
    // valida NOT NULL nos valores propostos ANTES de resolver o conflito.
    // Sem reenviar o pdf_url que já existe, a calibração de um modelo já
    // cadastrado falhava com "null value in column pdf_url".
    const existingUrl = docTemplates.find(t => t.type === type)?.pdf_url
    if (!existingUrl) return
    const { error } = await supabase.from('clinic_document_templates').upsert(
      { clinic_id: clinic.id, type, pdf_url: existingUrl, field_positions: fieldPositions },
      { onConflict: 'clinic_id,type' }
    )
    if (error) { showToast('error', `Erro ao salvar calibração: ${error.message}`); return }
    setDocTemplates(prev => prev.map(t => t.type === type ? { ...t, field_positions: fieldPositions } : t))
    setCalibratingType(null)
    showToast('ok', 'Campos calibrados salvos!')
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
    try {
      // Redimensiona e recorta para 400x400 PNG antes do upload
      const processed = await processLogoImage(file)
      const path = `${clinic.id}/logo.png`
      const { error: upErr } = await supabase.storage.from('clinic-logos').upload(path, processed, { upsert: true, contentType: 'image/png' })
      if (upErr) {
        setLogoMsg({ ok: false, text: 'Erro no upload: ' + upErr.message })
        return
      }
      const { data: urlData } = supabase.storage.from('clinic-logos').getPublicUrl(path)
      const publicUrl = urlData.publicUrl + '?t=' + Date.now()
      await supabase.from('clinics').update({ logo_url: publicUrl }).eq('id', clinic.id)
      setClinicLogo(publicUrl)
      setLogoMsg({ ok: true, text: 'Logo atualizada!' })
      setTimeout(() => setLogoMsg(null), 3000)
    } catch {
      setLogoMsg({ ok: false, text: 'Erro ao processar imagem. Tente outro arquivo.' })
    } finally {
      setLogoUploading(false)
    }
  }

  async function handleLogoRemove() {
    if (!clinic?.id) return
    if (!(await confirmDialog({ message: 'Remover a logo da clínica?', confirmText: 'Remover', danger: true }))) return
    await supabase.from('clinics').update({ logo_url: null }).eq('id', clinic.id)
    setClinicLogo('')
    setLogoMsg({ ok: true, text: 'Logo removida.' })
    setTimeout(() => setLogoMsg(null), 3000)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!clinic) return
    const phoneError = phoneInputError(phone)
    if (phoneError) { showToast('error', phoneError); return }
    // telefone antigo que o campo não mostra (ex.: sem DDD) e que não foi digitado de novo: mantém, não apaga
    const keepOldPhone = !phone && !!clinic.phone?.trim() && toInputValue(clinic.phone) === ''
    const nextPhone = keepOldPhone ? clinic.phone : phone
    setSaving(true)
    await supabase.from('clinics').update({ name, address, phone: nextPhone }).eq('id', clinic.id)
    setSession({ ...clinic, name, address, phone: nextPhone }, user!)
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

  const hasClientId = !!process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID

  return (
    <div className={styles.page}>
      <PageHeader title="Configurações" />

      <div className={styles.shell}>
        <nav className={styles.nav} aria-label="Seções das configurações" ref={navRef} data-hscroll>
          {navGroups.map(g => (
            <div key={g.title} className={styles.navGroup}>
              <p className={styles.navTitle}>{g.title}</p>
              {g.items.map(t => (
                <button
                  key={t.key}
                  type="button"
                  className={`${styles.navItem} ${tab === t.key ? styles.navActive : ''}`}
                  aria-current={tab === t.key ? 'page' : undefined}
                  onClick={e => { setTab(t.key); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }) }}
                >
                  <span className={styles.navIcon}><Icon name={t.icon} size={18} /></span>
                  <span className={styles.navText}>
                    <b>{t.label}</b>
                    <small>{t.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </nav>

      <div className={styles.panel}>
      {tab === 'plano' && clinic && <PlanoTab clinic={clinic} />}

      {tab === 'geral' && (
      <>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Dados da Clínica</h2>
        <form onSubmit={handleSave} className={styles.form}>
          <div className={styles.field}>
            <label>Nome da Clínica</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Telefone</label>
            <PhoneInput value={phone} onChange={setPhone} />
            {previousPhoneNote(clinic?.phone) && <small style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>Valor anterior no cadastro: {previousPhoneNote(clinic?.phone)}. Confira e digite o número completo com DDD.</small>}
          </div>
          <div className={styles.field}>
            <label>Endereço</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className={styles.saveRow}>
            {saved && <span className={styles.savedMsg}><Icon name="check" size={12} /> Salvo!</span>}
            <button type="submit" className={btn.primary} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>
      </div>

      {/* Logo da Clínica */}
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Logo da Clínica</h2>
        <p className={styles.gcalDesc}>
          A logo aparece no cabeçalho de prontuários, contratos, receitas e atestados — não é exibida no painel do sistema.
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
              className={btn.primary}
              disabled={logoUploading}
              onClick={() => logoInputRef.current?.click()}
            >
              {logoUploading ? 'Enviando...' : clinic?.logo ? 'Trocar Logo' : 'Enviar Logo'}
            </button>
            {clinic?.logo && (
              <button
                className={btn.secondary}
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
      </>
      )}

      {/* WhatsApp: a configuração fica na própria aba; em Integrações só aparece o cartão de status */}
      {tab === 'agenda' && isAdmin && <AgendaSettingsTab />}

      {tab === 'agendamento-online' && isAdmin && <AgendamentoOnlineTab />}

      {tab === 'whatsapp' && isAdmin && <WhatsAppTab />}

      {tab === 'integracoes' && isAdmin && (
      <div className={styles.card}>
        <div className={styles.gcalHeader}>
          <div>
            <h2 className={styles.cardTitle} style={{ marginBottom: '0.25rem' }}>WhatsApp</h2>
            <p className={styles.gcalDesc}>O número da clínica para confirmar consultas e conversar com pacientes na tela de Mensagens.</p>
          </div>
          <div className={styles.waLogo}><Icon name="chat" size={20} /></div>
        </div>
        {waState?.status === 'conectado' ? (
          <div className={styles.gcalConnected}>
            <span className={styles.gcalDot} />
            <span>WhatsApp conectado</span>
            <button type="button" className={btn.secondary} onClick={() => setTab('whatsapp')}>Gerenciar</button>
          </div>
        ) : (
          <div className={styles.gcalConnect}>
            {waState?.status === 'aguardando_qr' && <p className={styles.gcalHint}>A conexão ficou pela metade: falta ler o QR code com o celular.</p>}
            <button type="button" className={btn.primary} onClick={() => setTab('whatsapp')}>
              {waState?.status === 'aguardando_qr' ? 'Continuar conexão' : 'Conectar WhatsApp'}
            </button>
          </div>
        )}
      </div>
      )}

      {tab === 'integracoes' && (
      <div className={styles.card}>
        <div className={styles.gcalHeader}>
          <div>
            <h2 className={styles.cardTitle} style={{ marginBottom: '0.25rem' }}>Google Calendar</h2>
            <p className={styles.gcalDesc}>Sincronize sua agenda com o Google Calendar para ver e criar eventos diretamente.</p>
          </div>
          <div className={styles.gcalLogo}><Icon name="calendar" size={20} /></div>
        </div>

        {!hasClientId ? (
          <div className={styles.gcalWarning}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}><Icon name="alert" size={14} /> NEXT_PUBLIC_GOOGLE_CLIENT_ID não configurado.</strong><br />
            Adicione o Client ID OAuth2 do Google nas variáveis de ambiente do EasyPanel para ativar esta integração.
          </div>
        ) : gcalConnected ? (
          <div className={styles.gcalConnected}>
            <span className={styles.gcalDot} />
            <span>Conta Google conectada</span>
            <button className={btn.secondary} onClick={handleDisconnectGCal}>Desconectar</button>
          </div>
        ) : (
          <div className={styles.gcalConnect}>
            {gcalError && <p className={styles.gcalError}>{gcalError}</p>}
            <button className={btn.primary} onClick={handleConnectGCal} disabled={gcalLoading}>
              {gcalLoading ? 'Conectando...' : 'Conectar Google Calendar'}
            </button>
            <p className={styles.gcalHint}>Você será redirecionado para autenticar sua conta Google.</p>
          </div>
        )}
      </div>
      )}

      {/* Modelos de Documentos */}
      {tab === 'documentos' && (
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Modelos de Documentos</h2>
        <p className={styles.gcalDesc}>Faça upload do PDF com seu papel timbrado. Ele será usado como fundo ao emitir receitas e atestados no prontuário.</p>
        <div className={styles.docTemplateList}>
          {DOC_TEMPLATE_TYPES.map(({ type, label }) => {
            const existing = docTemplates.find(t => t.type === type)
            const uploading = docUploading === type
            const msg = docMsg?.type === type ? docMsg : null
            const lowResDpi = existing ? dpiByUrl[existing.pdf_url] : undefined
            return (
              <div key={type} className={styles.docTemplateRowWrap}>
                <div className={styles.docTemplateRow}>
                  <span className={styles.docTemplateLabel}>{label}</span>
                  <div className={styles.docTemplateActions}>
                    {existing
                      ? <span className={styles.docTemplateStatus}><Icon name="check" size={12} /> Modelo cadastrado</span>
                      : <span className={styles.docTemplateStatusEmpty}>Sem modelo</span>
                    }
                    {msg?.ok && <span className={styles.docTemplateSaved}>Salvo!</span>}
                    {msg && !msg.ok && <span className={styles.docTemplateError}>Erro no upload{msg.errorText ? `: ${msg.errorText}` : ''}</span>}
                    {existing && (
                      <button
                        className={btn.secondary}
                        onClick={() => setCalibratingType(type)}
                        title="Marcar onde cada dado (paciente, data, etc.) aparece no seu modelo"
                      >
                        {existing.field_positions?.length ? 'Editar calibração' : 'Calibrar campos'}
                      </button>
                    )}
                    <button
                      className={btn.secondary}
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
                {existing && lowResDpi && (
                  <p className={styles.docTemplateLowRes}>
                    Esta imagem tem resolução baixa (~{lowResDpi}dpi) — a impressão pode sair suave. Pra nitidez máxima, envie um PDF ou uma imagem maior (pelo menos 2480px de largura).
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </div>
      )}

      {calibratingType && (() => {
        const tpl = docTemplates.find(t => t.type === calibratingType)
        if (!tpl) return null
        return (
          <DocumentFieldCalibrator
            type={calibratingType}
            pdfUrl={tpl.pdf_url}
            initialFields={tpl.field_positions ?? []}
            council={councilForAreas(clinic?.specialties?.length ? clinic.specialties : [clinic?.type])}
            onSave={fields => handleSaveFieldPositions(calibratingType, fields)}
            onClose={() => setCalibratingType(null)}
          />
        )
      })()}

      {tab === 'conta' && <MinhaConta />}

      {tab === 'auditoria' && (
        <div className={styles.card}>
          <div className={styles.usersHeader}>
            <h2 className={styles.usersTitle}>Auditoria</h2>
            {auditModules.length > 0 && (
              <SelectMenu
                value={auditModuleFilter}
                onChange={setAuditModuleFilter}
                options={[{ value: '', label: 'Todos os módulos' }, ...auditModules.map(m => ({ value: m, label: m }))]}
              />
            )}
          </div>
          <p className={styles.gcalDesc}>Últimas {auditLogs.length} ações registradas nesta clínica. A cobertura de log ainda é parcial — nem toda ação do sistema é registrada hoje.</p>
          {auditLoading ? (
            <p className={styles.gcalDesc}>Carregando...</p>
          ) : filteredAuditLogs.length === 0 ? (
            <p className={styles.gcalDesc}>Nenhum registro de auditoria encontrado.</p>
          ) : (
            <div className={styles.auditList}>
              {filteredAuditLogs.map(log => (
                <div key={log.id} className={styles.auditRow}>
                  <div className={styles.auditMain}>
                    <span className={styles.auditAction}>{AUDIT_ACTION_LABELS[log.action] ?? log.action}</span>
                    <span className={styles.auditUser}>{auditUserName(log.user_id)}</span>
                    <Badge tone="neutral" dot={false}>{log.module}</Badge>
                  </div>
                  <span className={styles.auditDate}>{new Date(log.created_at).toLocaleString('pt-BR')}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      </div>
      </div>

    </div>
  )
}

export default function ConfiguracoesPage() {
  return <Suspense fallback={null}><ConfiguracoesGate /></Suspense>
}

// Links antigos: /configuracoes?tab=conta leva quem não tem o módulo Configurações para /minha-conta
// (em vez de "Acesso restrito"); /configuracoes?tab=equipe vai para /equipe, onde ficaram os acessos
// e permissões. Fica fora do PermissionGuard para decidir antes dele.
function ConfiguracoesGate() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { canView, loaded, error } = usePermissions('configuracoes')
  const redirectToAccount = searchParams.get('tab') === 'conta' && loaded && !error && !canView
  const redirectToTeam = searchParams.get('tab') === 'equipe'
  useEffect(() => {
    if (redirectToAccount) router.replace('/minha-conta')
    else if (redirectToTeam) router.replace('/equipe')
  }, [redirectToAccount, redirectToTeam, router])
  if (redirectToAccount || redirectToTeam) return null
  return <PermissionGuard module="configuracoes"><ConfiguracoesContent /></PermissionGuard>
}
