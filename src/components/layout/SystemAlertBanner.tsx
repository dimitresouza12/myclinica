'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { SystemAlert } from '@/types'
import styles from './SystemAlertBanner.module.css'
import { Icon, type IconName } from '@/components/ui/Icon'

const SEV_STYLE: Record<string, { bg: string; border: string; text: string; icon: IconName }> = {
  info:     { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', icon: 'info' },
  warning:  { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309', icon: 'alert' },
  critical: { bg: '#FEF2F2', border: '#FECACA', text: '#991B1B', icon: 'alert' },
}

export function SystemAlertBanner() {
  const [alert, setAlert] = useState<SystemAlert | null>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('system_alerts')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setAlert(data as SystemAlert | null)
    }
    load()
  }, [])

  if (!alert) return null

  const s = SEV_STYLE[alert.severity] ?? SEV_STYLE.info

  return (
    <div className={styles.banner} style={{ background: s.bg, borderColor: s.border, color: s.text }}>
      <span className={styles.icon}><Icon name={s.icon} size={15} /></span>
      <span className={styles.msg}>{alert.message}</span>
    </div>
  )
}
