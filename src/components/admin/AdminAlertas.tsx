'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { formatDate } from '@/lib/utils'
import type { SystemAlert } from '@/types'
import styles from './admin.module.css'
import btn from '@/components/ui/button.module.css'

const SEV_CONFIG = {
  info:     { label: 'Informação', tone: 'var(--st-info)' },
  warning:  { label: 'Aviso',      tone: 'var(--st-wait)' },
  critical: { label: 'Crítico',    tone: 'var(--st-bad)' },
}

export function AdminAlertas() {
  const { user } = useAuthStore()
  const [alerts, setAlerts] = useState<SystemAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [severity, setSeverity] = useState<SystemAlert['severity']>('info')
  const [endsAt, setEndsAt] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadAlerts() }, [])

  async function loadAlerts() {
    const { data } = await supabase
      .from('system_alerts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    setAlerts((data ?? []) as SystemAlert[])
    setLoading(false)
  }

  async function handleCreate() {
    if (!message.trim()) return
    setSaving(true)
    setError('')
    const { error: err } = await supabase.from('system_alerts').insert([{
      message: message.trim(),
      severity,
      is_active: true,
      ends_at: endsAt || null,
      created_by: user?.id ?? null,
    }])
    if (err) { setError(err.message); setSaving(false); return }
    setMessage('')
    setEndsAt('')
    setSaving(false)
    loadAlerts()
  }

  async function toggleAlert(id: string, current: boolean) {
    await supabase.from('system_alerts').update({ is_active: !current }).eq('id', id)
    loadAlerts()
  }

  async function deleteAlert(id: string) {
    await supabase.from('system_alerts').delete().eq('id', id)
    loadAlerts()
  }

  const sevConf = SEV_CONFIG[severity]

  return (
    <div className={styles.alertasWrap}>
      <div className={styles.alertForm}>
        <h3 className={styles.sectionSubtitle}>Novo aviso do sistema</h3>

        {/* Preview ao vivo */}
        {message && (
          <div className={styles.alertPreview} style={{ '--tone': sevConf.tone } as React.CSSProperties}>
            <strong>{sevConf.label.toUpperCase()}:</strong> {message}
          </div>
        )}

        <div className={styles.field}>
          <label>Mensagem</label>
          <textarea
            rows={3}
            className={styles.fieldInput}
            placeholder="Ex: Manutenção programada para domingo 22h–00h. O sistema ficará indisponível."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label>Severidade</label>
            <div className={styles.sevBtns}>
              {(Object.entries(SEV_CONFIG) as [SystemAlert['severity'], typeof SEV_CONFIG.info][]).map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  className={`${styles.sevBtn} ${severity === k ? styles.sevBtnActive : ''}`}
                  style={{ '--tone': v.tone } as React.CSSProperties}
                  aria-pressed={severity === k}
                  onClick={() => setSeverity(k)}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <label>Expira em (opcional)</label>
            <input type="datetime-local" className={styles.fieldInput} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </div>
        </div>

        {error && <p className={styles.fieldError}>{error}</p>}

        <button className={btn.primary} onClick={handleCreate} disabled={saving || !message.trim()}>
          {saving ? 'Publicando...' : 'Publicar aviso'}
        </button>
      </div>

      <div className={styles.alertsList}>
        <h3 className={styles.sectionSubtitle}>Avisos publicados</h3>
        {loading ? <p className={styles.loading}>Carregando...</p> : alerts.length === 0 ? (
          <p className={styles.empty}>Nenhum aviso publicado.</p>
        ) : alerts.map((a) => {
          const conf = SEV_CONFIG[a.severity]
          return (
            <div key={a.id} className={`${styles.alertItem} ${!a.is_active ? styles.alertItemInactive : ''}`}
              style={{ '--tone': conf.tone } as React.CSSProperties}
            >
              <div className={styles.alertItemTop}>
                <span className={styles.alertSevBadge}>{conf.label}</span>
                <span className={styles.alertDate}>{formatDate(a.created_at, true)}</span>
                {a.ends_at && <span className={styles.alertDate}>Expira: {formatDate(a.ends_at, true)}</span>}
                {!a.is_active && <span className={styles.alertInactivePill}>Inativo</span>}
              </div>
              <p className={styles.alertMsg}>{a.message}</p>
              <div className={styles.alertActions}>
                <button className={btn.secondary} onClick={() => toggleAlert(a.id, a.is_active)}>
                  {a.is_active ? 'Desativar' : 'Reativar'}
                </button>
                <button className={btn.danger} onClick={() => deleteAlert(a.id)}>Remover</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
