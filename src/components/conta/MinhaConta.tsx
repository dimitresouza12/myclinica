'use client'
import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { getPlanEntry } from '@/lib/planCatalog'
import { userRoleLabel } from '@/lib/roleLabel'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { UserAvatar } from '@/components/ui/UserAvatar'
import { compressAvatar } from '@/lib/avatar/compress'
import { ImageCompressError } from '@/lib/teamChat/compress'
import { audit } from '@/lib/audit'
import styles from './MinhaConta.module.css'

function passwordErrorText(err: unknown): string {
  const code = (err as { code?: string } | null)?.code
  if (code === 'same_password') return 'A nova senha precisa ser diferente da atual.'
  if (code === 'weak_password') return 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.'
  if (code === 'reauthentication_needed') return 'Por segurança, saia e entre de novo antes de trocar a senha.'
  if (err instanceof Error && err.message) return err.message
  return 'Não foi possível alterar a senha. Tente novamente.'
}

function planLabel(plan: string | undefined): string {
  // 'avancado' é legado (aposentado) — só sobrevive aqui pra não quebrar a
  // exibição de uma clínica antiga que porventura ainda não tenha migrado.
  if (plan === 'avancado') return 'Avançado — R$119,90/mês (legado)'
  const entry = getPlanEntry(plan)
  return `${entry.label} — ${entry.price}`
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className={styles.infoRow}>
      <span className={styles.infoLabel}>{label}</span>
      <span className={`${styles.infoValue} ${mono ? styles.mono : ''}`}>{value}</span>
    </div>
  )
}

/** Erro do banco quando a função/coluna da foto ainda não existe (migração não aplicada). */
function avatarFeatureMissing(err: { code?: string; message?: string }): boolean {
  return err.code === '42883' || err.code === '42703' || err.code === 'PGRST202' || /set_my_avatar|avatar_data/.test(err.message ?? '')
}

/** Troca de senha e dados do próprio login. Qualquer usuário logado pode usar, sem depender do módulo Configurações. */
export function MinhaConta() {
  const { clinic, user } = useAuthStore()
  const setUserAvatar = useAuthStore(s => s.setUserAvatar)
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [avBusy, setAvBusy] = useState(false)
  const [avMsg, setAvMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)
  const [pwCurrent, setPwCurrent] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const isAdmin = user?.role === 'admin' || !!user?.isSuperAdmin

  async function handlePickAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo
    if (!file) return
    setAvMsg(null)
    setAvBusy(true)
    try {
      const out = await compressAvatar(file)
      setPreview(out.dataUrl)
    } catch (err) {
      setPreview(null)
      setAvMsg({ type: 'error', text: err instanceof ImageCompressError ? err.message : 'Não foi possível ler esta foto. Tente outra.' })
    } finally {
      setAvBusy(false)
    }
  }

  async function saveAvatar(next: string | null) {
    setAvMsg(null)
    setAvBusy(true)
    try {
      const { error } = await supabase.rpc('set_my_avatar', { p_avatar: next })
      if (error) {
        setAvMsg({
          type: 'error',
          text: avatarFeatureMissing(error)
            ? 'A foto de perfil ainda não está disponível neste ambiente. Tente novamente mais tarde.'
            : 'Não foi possível salvar a foto. Verifique sua conexão e tente novamente.',
        })
        return
      }
      setUserAvatar(next)
      setPreview(null)
      setAvMsg({ type: 'ok', text: next ? 'Foto atualizada.' : 'Foto removida.' })
      // a foto aparece na equipe, no chat e nas conversas diretas
      void qc.invalidateQueries({ queryKey: ['team-directory'] })
      void qc.invalidateQueries({ queryKey: ['team-members'] })
    } catch {
      setAvMsg({ type: 'error', text: 'Não foi possível salvar a foto. Verifique sua conexão e tente novamente.' })
    } finally {
      setAvBusy(false)
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwMsg(null)
    if (pwNew.length < 8) return setPwMsg({ type: 'error', text: 'A nova senha deve ter pelo menos 8 caracteres.' })
    if (pwNew !== pwConfirm) return setPwMsg({ type: 'error', text: 'As senhas não coincidem.' })
    setPwSaving(true)
    try {
      if (!pwCurrent) {
        setPwMsg({ type: 'error', text: 'Informe a senha atual.' })
        setPwSaving(false)
        return
      }
      const { data: sessionData } = await supabase.auth.getSession()
      const res = await fetch('/api/auth/alterar-senha', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionData.session?.access_token ?? ''}` },
        body: JSON.stringify({ atual: pwCurrent, nova: pwNew }),
      })
      const json = await res.json().catch(() => ({})) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? 'Não foi possível alterar a senha.')
      if (user && clinic) {
        void audit({ action: 'auth.password_changed', user_id: user.id, clinic_id: clinic.id, module: 'auth', details: { origin: 'minha_conta' } }).catch(() => {})
      }
      setPwMsg({ type: 'ok', text: 'Senha alterada com sucesso! Use a nova senha no próximo acesso.' })
      setPwCurrent('')
      setPwNew('')
      setPwConfirm('')
    } catch (err: unknown) {
      setPwMsg({ type: 'error', text: passwordErrorText(err) })
    } finally {
      setPwSaving(false)
    }
  }

  async function handleSendResetLink() {
    setPwMsg(null)
    const { data } = await supabase.auth.getUser()
    const email = data.user?.email
    if (!email) return setPwMsg({ type: 'error', text: 'Não foi possível identificar o seu e-mail. Entre de novo.' })
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || window.location.origin
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${appUrl}/login` })
    if (error) return setPwMsg({ type: 'error', text: 'Não foi possível enviar o link. Tente novamente em alguns minutos.' })
    setPwMsg({ type: 'ok', text: `Enviamos um link para ${email}. Abra o e-mail, clique no link e defina a nova senha.` })
  }

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Foto de perfil</h2>
        <div className={styles.avatarRow}>
          <UserAvatar name={user?.displayName ?? ''} avatar={preview ?? user?.avatarData} size={96} />
          <div className={styles.avatarSide}>
            <input ref={fileRef} type="file" accept="image/*" className={styles.fileInput} onChange={handlePickAvatar} aria-label="Escolher foto de perfil" tabIndex={-1} />
            <div className={styles.avatarActions}>
              {preview ? (
                <>
                  <button type="button" className={styles.btnSave} onClick={() => void saveAvatar(preview)} disabled={avBusy}>
                    {avBusy ? 'Salvando...' : 'Salvar foto'}
                  </button>
                  <button type="button" className={styles.btnGhost} onClick={() => { setPreview(null); setAvMsg(null) }} disabled={avBusy}>Cancelar</button>
                </>
              ) : (
                <>
                  <button type="button" className={styles.btnSave} onClick={() => fileRef.current?.click()} disabled={avBusy}>
                    {avBusy ? 'Preparando...' : 'Escolher foto'}
                  </button>
                  {user?.avatarData && (
                    <button type="button" className={styles.btnGhost} onClick={() => void saveAvatar(null)} disabled={avBusy}>Remover foto</button>
                  )}
                </>
              )}
            </div>
            <p className={styles.fieldNote}>
              {preview ? 'Confira a prévia e toque em Salvar foto.' : 'A foto é reduzida e recortada em quadrado. Ela aparece para a sua equipe.'}
            </p>
          </div>
        </div>
        {avMsg && (
          <p className={avMsg.type === 'ok' ? styles.savedMsg : styles.pwError} role={avMsg.type === 'ok' ? 'status' : 'alert'}>{avMsg.text}</p>
        )}
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Segurança</h2>
        <form onSubmit={handleChangePassword} className={styles.form}>
          <div className={styles.field}>
            <label>Senha atual</label>
            <PasswordInput value={pwCurrent} onChange={(e) => setPwCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className={styles.field}>
            <label>Nova senha</label>
            <PasswordInput value={pwNew} onChange={(e) => setPwNew(e.target.value)} autoComplete="new-password" placeholder="mín. 8 caracteres" />
          </div>
          <div className={styles.field}>
            <label>Confirmar nova senha</label>
            <PasswordInput value={pwConfirm} onChange={(e) => setPwConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          {pwMsg && (
            <p className={pwMsg.type === 'ok' ? styles.savedMsg : styles.pwError} role={pwMsg.type === 'ok' ? 'status' : 'alert'}>{pwMsg.text}</p>
          )}
          <div className={styles.saveRow}>
            <button type="submit" className={styles.btnSave} disabled={pwSaving || !pwCurrent || !pwNew || !pwConfirm}>
              {pwSaving ? 'Alterando...' : 'Alterar Senha'}
            </button>
            <button type="button" className={styles.btnGhost} onClick={handleSendResetLink} disabled={pwSaving}>
              Não sei a senha atual
            </button>
          </div>
        </form>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Informações da Conta</h2>
        <div className={styles.infoGrid}>
          <InfoRow label="Usuário" value={user?.displayName ?? '-'} />
          <InfoRow label="Função" value={user ? userRoleLabel(user, clinic) : '-'} />
          {isAdmin && <InfoRow label="Clínica ID" value={clinic?.id ?? '-'} mono />}
          {isAdmin && <InfoRow label="Plano" value={planLabel(clinic?.plan)} />}
        </div>
      </div>
    </div>
  )
}
