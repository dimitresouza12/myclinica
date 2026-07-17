'use client'
import { useAuthStore } from '@/store/auth'
import { useRouter } from 'next/navigation'
import styles from './ImpersonationBanner.module.css'
import { Icon } from '@/components/ui/Icon'

export function ImpersonationBanner() {
  const { impersonatedClinicId, impersonatedClinicName, stopImpersonation } = useAuthStore()
  const router = useRouter()

  if (!impersonatedClinicId) return null

  function handleStop() {
    stopImpersonation()
    router.push('/admin')
  }

  return (
    <div className={styles.banner}>
      <span className={styles.stripe} />
      <span className={styles.icon}><Icon name="eye" size={14} /></span>
      <span className={styles.msg}>
        Modo suporte ativo — visualizando como <strong>{impersonatedClinicName}</strong>
      </span>
      <button className={styles.exitBtn} onClick={handleStop}>
        Sair do modo suporte
      </button>
    </div>
  )
}
