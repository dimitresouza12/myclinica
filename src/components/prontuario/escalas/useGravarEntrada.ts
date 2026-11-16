'use client'
import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'
import { audit } from '@/lib/audit'
import { showToast } from '@/components/ui/Toast'
import type { EntradaEscala } from '@/lib/escalas/registro'
import type { MedicalRecord, Patient } from '@/types'

interface Opcoes {
  patient: Patient
  clinicId: string
  record: MedicalRecord | null
  onSaved: () => void
}

/**
 * Grava uma aplicação (escala ou ficha) como evolução do prontuário: cria o prontuário se ainda não existir,
 * insere a linha em record_entries, audita e avisa. Devolve se deu certo; a mensagem de erro fica em `erro`.
 */
export function useGravarEntrada({ patient, clinicId, record, onSaved }: Opcoes) {
  const user = useAuthStore(s => s.user)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState('')

  const gravar = useCallback(async (entrada: EntradaEscala, auditoria: Record<string, string>, avisoOk: string): Promise<boolean> => {
    if (saving) return false
    setSaving(true)
    setErro('')
    try {
      let recordId = record?.id
      if (!recordId) {
        const { data, error: recErr } = await supabase
          .from('medical_records')
          .insert([{ clinic_id: clinicId, patient_id: patient.id }])
          .select('id')
          .single()
        if (recErr) throw new Error('Erro ao criar prontuário: ' + recErr.message)
        recordId = data?.id
      }
      if (!recordId) throw new Error('Falha ao criar prontuário.')

      const { error: entryErr } = await supabase.from('record_entries').insert([{
        clinic_id: clinicId,
        patient_id: patient.id,
        record_id: recordId,
        entry_text: entrada.entry_text,
        entry_type: entrada.entry_type,
        author_name: user?.displayName ?? 'Sistema',
        professional_id: user?.professionalId ?? null,
        photo_urls: [],
      }])
      if (entryErr) throw new Error('Erro ao salvar: ' + entryErr.message)

      if (user?.id) {
        await audit({
          action: 'prontuario.update',
          user_id: user.id,
          clinic_id: clinicId,
          module: 'prontuario',
          resource_id: patient.id,
          details: auditoria,
        })
      }
      showToast('ok', avisoOk)
      onSaved()
      return true
    } catch (err: unknown) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar.')
      return false
    } finally {
      setSaving(false)
    }
  }, [saving, record, clinicId, patient, user, onSaved])

  return { gravar, saving, erro, limparErro: () => setErro('') }
}
