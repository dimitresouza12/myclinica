'use client'
import { useEffect, useState } from 'react'
import { useAuthStore } from '@/store/auth'
import { usePermissionsStore } from '@/store/permissions'
import { MODULES } from '@/lib/permissionPresets'
import { Modal } from '@/components/ui/Modal'
import btn from '@/components/ui/button.module.css'
import styles from './dashboard.module.css'

// Não-admin loga pela primeira vez e não tem nenhuma ação do checklist de
// fundador (procedimentos, logo etc.) pra cumprir — em vez do checklist,
// uma tela curta resumindo o que a própria pessoa pode acessar. Mostrado
// uma vez por usuário/dispositivo via localStorage: é só um "bem-vindo",
// não precisa de coluna no banco nem de sincronizar entre dispositivos.
export function WelcomeModal() {
  const user = useAuthStore(s => s.user)
  const { permissions, loaded, load } = usePermissionsStore()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (user && !loaded) load()
  }, [user, loaded, load])

  useEffect(() => {
    if (!user || user.isSuperAdmin || user.role === 'admin' || !loaded) return
    const key = `myclinica-welcome-seen-${user.id}`
    if (!localStorage.getItem(key)) setOpen(true)
  }, [user, loaded])

  if (!open || !user) return null

  function handleClose() {
    setOpen(false)
    localStorage.setItem(`myclinica-welcome-seen-${user!.id}`, '1')
  }

  const accessible = MODULES.filter(m => permissions[m.key]?.can_view).map(m => m.label)

  return (
    <Modal
      open
      onClose={handleClose}
      size="sm"
      title={`Bem-vindo(a), ${user.displayName}`}
      subtitle="Aqui está o que você pode fazer no sistema"
      footer={<button type="button" className={btn.primary} onClick={handleClose}>Entendi</button>}
    >
      {accessible.length === 0 ? (
        <p className={styles.onboardingItemLabel}>Nenhum módulo liberado ainda — fale com o administrador da clínica.</p>
      ) : (
        <p className={styles.onboardingItemLabel}>
          Você tem acesso a: <strong>{accessible.join(', ')}</strong>. Se precisar de mais alguma coisa, peça pro administrador ajustar suas permissões em Configurações → Equipe.
        </p>
      )}
    </Modal>
  )
}
