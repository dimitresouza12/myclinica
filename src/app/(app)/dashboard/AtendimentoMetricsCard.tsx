'use client'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Card } from '@/components/ui/Card'
import { useAtendimentoSchema } from '@/hooks/useAtendimentoSchema'
import { attendanceMetrics, formatMinutes, type AttendanceTimes } from '@/lib/atendimento/time'
import styles from './dashboard.module.css'

/** Tempo médio de consulta e de espera no mês, a partir de started_at/finished_at/arrived_at. Some se não há dados (ou o banco ainda não tem o fluxo). */
export function AtendimentoMetricsCard({ clinicId }: { clinicId: string }) {
  const { available } = useAtendimentoSchema()
  const { data } = useQuery({
    queryKey: ['atendimento-metrics', clinicId],
    enabled: available,
    staleTime: 60_000,
    queryFn: async () => {
      const today = new Date()
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString()
      const { data: rows, error } = await supabase
        .from('appointments')
        .select('arrived_at, started_at, finished_at')
        .eq('clinic_id', clinicId)
        .not('started_at', 'is', null)
        .gte('scheduled_at', monthStart)
        .limit(2000)
      if (error) throw error
      return attendanceMetrics((rows ?? []) as AttendanceTimes[])
    },
  })
  if (!available || !data || (data.consultCount === 0 && data.waitCount === 0)) return null
  const min = (v: number | null) => (v === null ? '-' : formatMinutes(v * 60000))
  return (
    <Card title="Tempos de atendimento" actions={<span className={styles.cardMeta}>mês atual</span>}>
      <div className={styles.cash}>
        <div className={styles.cashRow}>
          <span>Consulta (média)</span>
          <span className={styles.cashNum}>{min(data.consultAvgMin)}</span>
        </div>
        <div className={styles.cashRow}>
          <span>Espera (média)</span>
          <span className={styles.cashNum}>{min(data.waitAvgMin)}</span>
        </div>
      </div>
    </Card>
  )
}
