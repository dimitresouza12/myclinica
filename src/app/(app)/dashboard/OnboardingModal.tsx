'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { Portal } from '@/components/ui/Portal'
import { Icon } from '@/components/ui/Icon'
import type { Procedure } from '@/types'
import { useOnboardingItems } from './useOnboardingItems'
import styles from './dashboard.module.css'

interface Props {
  procedures: Procedure[]
  patientsCount: number
}

// Abre automaticamente uma única vez — na primeira vez que a clínica (em
// trial) chega ao dashboard com algum passo pendente. Fechar (X ou botão)
// marca onboarding_modal_seen e não abre mais sozinho; os itens continuam
// disponíveis no card do dashboard (useOnboardingItems é a mesma lógica).
export function OnboardingModal({ procedures, patientsCount }: Props) {
  const { clinic, visible, dismiss, savingKey } = useOnboardingItems(procedures, patientsCount)
  const markOnboardingModalSeen = useAuthStore(s => s.markOnboardingModalSeen)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (clinic && clinic.status === 'trial' && !clinic.onboardingModalSeen && visible.length > 0) {
      setOpen(true)
    }
  // Só decide se abre quando a clínica muda ou quando o flag muda — não a
  // cada recálculo de `visible` (senão reabriria se um item voltasse a
  // ficar pendente depois de fechado).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinic?.id, clinic?.onboardingModalSeen])

  if (!open || !clinic) return null

  function handleClose() {
    setOpen(false)
    markOnboardingModalSeen()
    supabase.from('clinics').update({ onboarding_modal_seen: true }).eq('id', clinic!.id).then(() => {})
  }

  return (
    <Portal>
      <div className={styles.onbOverlay} onClick={handleClose}>
        <div className={styles.onbModal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.onbModalHeader}>
            <div>
              <h2 className={styles.onbModalTitle}>Bem-vindo(a) à MyClínica! 🎉</h2>
              <p className={styles.onbModalSubtitle}>Alguns passos rápidos para deixar sua clínica pronta</p>
            </div>
            <button className={styles.onbModalCloseX} onClick={handleClose}><Icon name="close" size={18} /></button>
          </div>
          <div className={styles.onbModalBody}>
            <div className={styles.roleInfoBox}>
              <p className={styles.roleInfoTitle}>Como funciona o acesso por cargo</p>
              <p className={styles.roleInfoText}>
                Cada pessoa que você cadastrar em Equipe recebe um cargo — Recepção, Auxiliar, o cargo clínico da especialidade ou Admin — e já vem com um conjunto de permissões pronto (dá pra ajustar depois). Você, como admin, sempre enxerga tudo.
                {clinic.founderIsProfessional && ' Isso inclui a agenda e o prontuário — não precisa de um preset separado pra você.'}
              </p>
            </div>
            {visible.map(item => (
              <div key={item.key} className={styles.onboardingItem}>
                <span className={styles.onboardingItemLabel}>{item.label}</span>
                <div className={styles.onboardingItemActions}>
                  <Link href={item.href} className={styles.onboardingBtnPrimary} onClick={handleClose}>{item.cta}</Link>
                  <button
                    className={styles.onboardingBtnDone}
                    onClick={() => dismiss(item.key)}
                    disabled={savingKey === item.key}
                  >
                    {savingKey === item.key ? 'Salvando...' : 'Já feito'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className={styles.onbModalFooter}>
            <button className={styles.onbModalFooterBtn} onClick={handleClose}>Configurar depois</button>
          </div>
        </div>
      </div>
    </Portal>
  )
}
