'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import styles from './admin.module.css'

interface WaRow {
  clinic_id: string
  status: 'desconectado' | 'aguardando_qr' | 'conectado'
  confirm_enabled: boolean
  status_changed_at: string
  clinics: { name: string } | null
}
interface ConfRow { clinic_id: string; kind: string; status: string }
interface Counts { sent: number; confirmed: number; asked: number; failed: number }

const DAY = 86_400_000
const HOUR = 3_600_000
const STATUS_TEXT: Record<WaRow['status'], string> = {
  conectado: 'Conectado', aguardando_qr: 'Aguardando leitura do QR', desconectado: 'Desconectado',
}

export function AdminWhatsApp() {
  const [wa, setWa] = useState<WaRow[] | null>(null)
  const [conf, setConf] = useState<ConfRow[]>([])
  const [error, setError] = useState('')
  const [now] = useState(() => Date.now()) // instante em que a aba abriu (sem Date.now() no render)

  useEffect(() => {
    let alive = true
    const since = new Date(Date.now() - 7 * DAY).toISOString()
    Promise.all([
      supabase.from('clinic_whatsapp').select('clinic_id, status, confirm_enabled, status_changed_at, clinics(name)').order('status_changed_at', { ascending: false }),
      supabase.from('appointment_confirmations').select('clinic_id, kind, status').gte('created_at', since).limit(20000),
    ]).then(([w, c]) => {
      if (!alive) return
      if (w.error || c.error) { setError('Não foi possível carregar o WhatsApp das clínicas.'); return }
      setWa((w.data ?? []) as unknown as WaRow[])
      setConf((c.data ?? []) as ConfRow[])
    })
    return () => { alive = false }
  }, [])

  if (error) return <p className={styles.loading}>{error}</p>
  if (!wa) return <p className={styles.loading}>Carregando...</p>

  const counts = new Map<string, Counts>()
  for (const r of conf) {
    const c = counts.get(r.clinic_id) ?? { sent: 0, confirmed: 0, asked: 0, failed: 0 }
    if (r.status === 'falhou') c.failed++
    else if (r.status !== 'enviando') c.sent++
    if (r.status === 'confirmado') c.confirmed++
    if (r.status === 'pediu_remarcacao') c.asked++
    counts.set(r.clinic_id, c)
  }

  // Várias clínicas que usam a confirmação caindo na mesma hora = sinal de problema na Evolution,
  // não de problema de uma clínica.
  const droppedRecently = wa.filter(r =>
    r.confirm_enabled && r.status === 'desconectado' && now - new Date(r.status_changed_at).getTime() < HOUR,
  ).length

  return (
    <div className={styles.section}>
      {droppedRecently >= 3 && (
        <p className={styles.loading} role="alert">
          {droppedRecently} clínicas desconectaram na última hora. Vale conferir a Evolution do MyClinica antes de falar com cada clínica.
        </p>
      )}

      <div className={`${styles.richTable} resp-table-wrap`}>
        <table className={`${styles.table} resp-table`}>
          <thead>
            <tr><th>Clínica</th><th>Conexão</th><th>Confirmação</th><th>Enviadas (7 dias)</th><th>Confirmaram</th><th>Pediram remarcar</th><th>Falhas</th></tr>
          </thead>
          <tbody>
            {wa.length === 0 ? (
              <tr><td colSpan={7} className={styles.empty}>Nenhuma clínica conectou o WhatsApp ainda.</td></tr>
            ) : wa.map(r => {
              const c = counts.get(r.clinic_id) ?? { sent: 0, confirmed: 0, asked: 0, failed: 0 }
              const rate = c.sent > 0 ? ` (${Math.round((c.confirmed / c.sent) * 100)}%)` : ''
              return (
                <tr key={r.clinic_id}>
                  <td data-label="Clínica">{r.clinics?.name ?? '—'}</td>
                  <td data-label="Conexão">{STATUS_TEXT[r.status]}</td>
                  <td data-label="Confirmação">{r.confirm_enabled ? 'Ligada' : 'Desligada'}</td>
                  <td data-label="Enviadas (7 dias)">{c.sent}</td>
                  <td data-label="Confirmaram">{c.confirmed}{rate}</td>
                  <td data-label="Pediram remarcar">{c.asked}</td>
                  <td data-label="Falhas">{c.failed}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
