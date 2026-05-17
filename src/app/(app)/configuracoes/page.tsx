'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { connectGoogleCalendar, disconnectGoogleCalendar, isGCalConnected } from '@/lib/googleCalendar'
import type { AuthClinic } from '@/types'
import styles from './configuracoes.module.css'

export default function ConfiguracoesPage() {
  const { clinic, user, setSession } = useAuthStore()
  const [name, setName] = useState(clinic?.name ?? '')
  const [address, setAddress] = useState(clinic?.address ?? '')
  const [phone, setPhone] = useState(clinic?.phone ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [gcalConnected, setGcalConnected] = useState(isGCalConnected(clinic?.gcalConnected))
  const [gcalLoading, setGcalLoading] = useState(false)
  const [gcalError, setGcalError] = useState('')

  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

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
