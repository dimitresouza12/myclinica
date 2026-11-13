'use client'
import { useEffect, useState } from 'react'
import { avatarStoragePath, signAvatarPaths } from '@/lib/pacientes/avatarUrl'

/** URL assinada da foto do paciente (patients.avatar_url guarda o caminho no bucket privado). Sem foto ou com falha: null. */
export function usePatientAvatarUrl(patient: { id: string; clinic_id: string; avatar_url: string | null }): string | null {
  const path = avatarStoragePath(patient.avatar_url, patient.clinic_id, patient.id)
  const [signed, setSigned] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    void signAvatarPaths([path]).then(map => { if (alive && map[path]) setSigned({ path, url: map[path] }) })
    return () => { alive = false }
  }, [path])
  return path && signed?.path === path ? signed.url : null
}
