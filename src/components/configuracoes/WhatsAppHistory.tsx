'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { ERROR_LABEL } from '@/lib/whatsapp/labels'
import styles from './WhatsAppHistory.module.css'

type Status = 'enviando' | 'enviado' | 'confirmado' | 'pediu_remarcacao' | 'respondeu' | 'falhou'

interface StatRow { kind: string; status: Status }
interface ListRow {
  id: string
  kind: string
  status: Status
  error: string | null
  sent_at: string | null
  created_at: string
  appointments: { scheduled_at: string; patients: { name: string } | null } | null
}

const DAY = 86_400_000

const STATUS_LABEL: Record<Status, string> = {
  enviando: 'Enviando',
  enviado: 'Sem resposta',
  confirmado: 'Confirmou',
  pediu_remarcacao: 'Pediu para remarcar',
  respondeu: 'Respondeu, ver conversa',
  falhou: 'Não enviada',
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function WhatsAppHistory() {
  const clinicId = useAuthStore(s => s.clinic?.id)
  const [stats, setStats] = useState<StatRow[] | null>(null)
  const [rows, setRows] = useState<ListRow[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clinicId) return
    let alive = true
    const since = new Date(Date.now() - 30 * DAY).toISOString()
    Promise.all([
      supabase.from('appointment_confirmations').select('kind, status').eq('clinic_id', clinicId).gte('created_at', since).limit(5000),
      supabase.from('appointment_confirmations')
        .select('id, kind, status, error, sent_at, created_at, appointments(scheduled_at, patients(name))')
        .eq('clinic_id', clinicId).gte('created_at', since)
        .order('created_at', { ascending: false }).limit(20),
    ]).then(([s, l]) => {
      if (!alive) return
      if (s.error || l.error) { setError('Não foi possível carregar o histórico.'); return }
      setStats((s.data ?? []) as StatRow[])
      setRows((l.data ?? []) as unknown as ListRow[])
    })
    return () => { alive = false }
  }, [clinicId])

  if (error) return <div className={styles.card}><p className={styles.error} role="alert">{error}</p></div>
  if (!stats) return <div className={styles.card}><p className={styles.muted}>Carregando histórico…</p></div>

  // taxa de confirmação só considera pedidos de confirmação (lembrete não pede resposta)
  const conf = stats.filter(r => r.kind === 'confirmacao')
  const sentStatuses: Status[] = ['enviado', 'confirmado', 'pediu_remarcacao', 'respondeu']
  const sent = conf.filter(r => sentStatuses.includes(r.status)).length
  const confirmed = conf.filter(r => r.status === 'confirmado').length
  const asked = conf.filter(r => r.status === 'pediu_remarcacao').length
  const silent = conf.filter(r => r.status === 'enviado').length
  const failed = stats.filter(r => r.status === 'falhou').length
  const rate = sent > 0 ? Math.round((confirmed / sent) * 100) : null

  return (
    <div className={styles.card}>
      <h2 className={styles.title}>Histórico dos últimos 30 dias</h2>

      {stats.length === 0 ? (
        <p className={styles.muted}>Nenhuma confirmação enviada ainda. Quando a confirmação automática estiver ligada, o resultado aparece aqui.</p>
      ) : (
        <>
          <div className={styles.stats}>
            <Stat value={sent} label="Enviadas" />
            <Stat value={confirmed} label={rate === null ? 'Confirmaram' : `Confirmaram (${rate}%)`} tone="good" />
            <Stat value={asked} label="Pediram para remarcar" tone="warn" />
            <Stat value={silent} label="Sem resposta" />
            <Stat value={failed} label="Não enviadas" tone={failed > 0 ? 'bad' : undefined} />
          </div>

          <ul className={styles.list}>
            {rows.map(r => (
              <li key={r.id} className={styles.item}>
                <div className={styles.itemMain}>
                  <strong className={styles.name}>{r.appointments?.patients?.name?.split(' ')[0] ?? 'Paciente'}</strong>
                  <span className={styles.sub}>
                    {r.kind === 'lembrete' ? 'Lembrete' : 'Confirmação'}
                    {r.appointments?.scheduled_at ? ` da consulta de ${fmt(r.appointments.scheduled_at)}` : ''}
                  </span>
                </div>
                <span className={`${styles.badge} ${styles[`b_${r.status}`]}`}>
                  {r.status === 'falhou' && r.error ? (ERROR_LABEL[r.error] ?? 'Não enviada') : STATUS_LABEL[r.status]}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

function Stat({ value, label, tone }: { value: number; label: string; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <div className={`${styles.stat} ${tone ? styles[`t_${tone}`] : ''}`}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  )
}
