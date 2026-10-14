import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { whatsappApi } from '@/components/configuracoes/whatsappApi'
import { stagePatch, type Lead, type Stage } from '@/lib/crm/model'

export interface CrmMember { userId: string; name: string }

const LEAD_COLS = 'id, clinic_id, name, phone, phone_key, stage, stage_changed_at, stage_source, stage_note, lost_reason, source, interest, estimated_value, notes, next_contact_at, assigned_to, patient_id, created_by, created_at, updated_at'

export function useLeads(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['crm-leads', clinicId],
    queryFn: async () => {
      if (!clinicId) return []
      const { data, error } = await supabase
        .from('crm_leads')
        .select(LEAD_COLS)
        .eq('clinic_id', clinicId)
        .order('stage_changed_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      // numeric chega como número no PostgREST, mas garante
      return (data ?? []).map(l => ({ ...l, estimated_value: l.estimated_value == null ? null : Number(l.estimated_value) })) as Lead[]
    },
    enabled: !!clinicId,
    staleTime: 15_000,
    // rede de segurança caso o Realtime esteja fora
    refetchInterval: 60_000,
  })
}

export function useCrmMembers(clinicId: string | undefined) {
  return useQuery({
    queryKey: ['crm-members', clinicId],
    queryFn: async () => (await whatsappApi<{ members: CrmMember[] }>('/api/crm/members')).members,
    enabled: !!clinicId,
    staleTime: 5 * 60_000,
  })
}

/** Realtime: o webhook cria leads e a equipe mexe neles; o quadro aberto acompanha. */
export function useCrmRealtime(clinicId: string | undefined) {
  const qc = useQueryClient()
  useEffect(() => {
    if (!clinicId) return
    const channel = supabase
      .channel(`crm-${clinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'crm_leads', filter: `clinic_id=eq.${clinicId}` },
        () => { qc.invalidateQueries({ queryKey: ['crm-leads', clinicId] }) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [clinicId, qc])
}

export type LeadInsert = Pick<Lead, 'name' | 'phone' | 'phone_key' | 'source' | 'interest' | 'estimated_value' | 'notes' | 'assigned_to'> & Partial<Pick<Lead, 'stage' | 'lost_reason' | 'next_contact_at'>>
export type LeadPatch = Partial<Pick<Lead, 'name' | 'phone' | 'phone_key' | 'source' | 'interest' | 'estimated_value' | 'notes' | 'next_contact_at' | 'assigned_to' | 'patient_id' | 'lost_reason' | 'stage' | 'stage_source' | 'stage_note'>>

/** Erro do banco → texto para a tela. 23505 = telefone repetido na clínica. */
export function leadErrorMessage(e: unknown): string {
  const err = e as { code?: string; message?: string } | null
  if (err?.code === '23505') return 'Já existe um lead com esse telefone.'
  if (err?.code === '42501') return 'Você não tem permissão para alterar leads.'
  return 'Não foi possível salvar. Tente de novo.'
}

export function useLeadMutations(clinicId: string | undefined, userId: string | undefined) {
  const qc = useQueryClient()
  const key = ['crm-leads', clinicId]
  const refresh = () => qc.invalidateQueries({ queryKey: key })

  const create = useMutation({
    mutationFn: async (input: LeadInsert) => {
      const { data, error } = await supabase.from('crm_leads')
        .insert({ ...input, clinic_id: clinicId, created_by: userId ?? null })
        .select(LEAD_COLS).single()
      if (error) throw error
      return data as Lead
    },
    onSuccess: refresh,
  })

  /** Atualiza campos do lead. Otimista: o cartão muda na hora e volta atrás se o banco recusar. */
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: LeadPatch }) => {
      const { error } = await supabase.from('crm_leads').update(patch).eq('id', id).eq('clinic_id', clinicId!)
      if (error) throw error
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Lead[]>(key)
      qc.setQueryData<Lead[]>(key, old => (old ?? []).map(l => {
        if (l.id !== id) return l
        const moved = patch.stage && patch.stage !== l.stage
        return { ...l, ...patch, ...(moved ? { stage_changed_at: new Date().toISOString() } : {}) }
      }))
      return { previous }
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) qc.setQueryData(key, ctx.previous) },
    onSettled: refresh,
  })

  const moveStage = (lead: Lead, to: Stage, reason?: string | null) =>
    update.mutateAsync({ id: lead.id, patch: stagePatch(to, lead, reason) })

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('crm_leads').delete().eq('id', id).eq('clinic_id', clinicId!)
      if (error) throw error
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key })
      const previous = qc.getQueryData<Lead[]>(key)
      qc.setQueryData<Lead[]>(key, old => (old ?? []).filter(l => l.id !== id))
      return { previous }
    },
    onError: (_e, _v, ctx) => { if (ctx?.previous) qc.setQueryData(key, ctx.previous) },
    onSettled: refresh,
  })

  return { create, update, moveStage, remove }
}
