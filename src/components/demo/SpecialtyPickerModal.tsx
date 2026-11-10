'use client'
import { useState } from 'react'
import type { CSSProperties } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/store/auth'
import { useDemoPicker } from '@/store/demoPicker'
import { CLINIC_TYPE_LABELS, SPECIALTY_CONFIG } from '@/lib/specialtyConfig'
import { DEMO_AREAS } from '@/lib/demoSpecialty'
import { fetchFirstProfessionalId } from '@/lib/demoSpecialtyProfessional'
import type { ClinicType } from '@/types'
import styles from './specialtyPicker.module.css'

/**
 * Conta de demonstração: escolha da área em que entrar. Sem área escolhida o modal é
 * obrigatório (sem Esc, sem X, sem clique no fundo); com área escolhida ele só abre pelo
 * item "Trocar especialidade" do menu do perfil (desktop) ou do menu lateral (celular) e pode ser cancelado.
 * A escolha vale só na sessão: nada é gravado no banco.
 */
export function SpecialtyPickerModal() {
  const clinic = useAuthStore(s => s.clinic)
  const activeSpecialty = useAuthStore(s => s.activeSpecialty)
  const setActiveSpecialty = useAuthStore(s => s.setActiveSpecialty)
  const switching = useDemoPicker(s => s.switching)
  const closeSwitch = useDemoPicker(s => s.closeSwitch)
  const [busy, setBusy] = useState<ClinicType | null>(null)

  if (!clinic?.demoMode) return null
  const required = !activeSpecialty
  const open = required || switching

  async function choose(area: ClinicType) {
    if (busy || !clinic) return
    setBusy(area)
    const professionalId = await fetchFirstProfessionalId(clinic.id, area)
    // a sessão pode ter acabado (logout, outra clínica) enquanto a busca corria
    if (useAuthStore.getState().clinic?.id !== clinic.id) { setBusy(null); return }
    setActiveSpecialty(area, professionalId)
    setBusy(null)
    closeSwitch()
  }

  return (
    <Modal
      open={open}
      onClose={closeSwitch}
      dismissible={!required && !busy}
      size="lg"
      title="Em qual especialidade você quer entrar?"
      footer={required ? undefined : <Button variant="secondary" onClick={closeSwitch} disabled={!!busy}>Cancelar</Button>}
    >
      <p className={styles.lead}>
        Esta é uma conta de demonstração com dados de todas as áreas. Escolha uma para ver o sistema como ela usa. Você pode trocar quando quiser, pelo menu do perfil (ou no menu lateral, no celular).
      </p>
      <div className={styles.grid} role="group" aria-label="Especialidades">
        {DEMO_AREAS.map(area => {
          const cfg = SPECIALTY_CONFIG[area]
          const current = area === activeSpecialty
          return (
            <button
              key={area}
              type="button"
              className={`${styles.card} ${current ? styles.cardCurrent : ''}`}
              style={{ '--tone': cfg.color } as CSSProperties}
              onClick={() => void choose(area)}
              disabled={!!busy}
              aria-busy={busy === area || undefined}
              aria-current={current || undefined}
              autoFocus={area === (activeSpecialty ?? DEMO_AREAS[0])}
            >
              <span className={styles.badge} aria-hidden="true">{cfg.icon}</span>
              <span className={styles.label}>{CLINIC_TYPE_LABELS[area]}</span>
              {current && <span className={styles.now} aria-hidden="true">Atual</span>}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
