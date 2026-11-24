import { useCallback, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  NOTIFICACOES_COLUNAS,
  NOTIFICACOES_LIMITE,
  NOTIFICACOES_VAZIAS,
  aplicarEvento,
  carregarNaoLidas,
  type AutomacaoNotificacao,
  type NotificacoesEstado,
} from '@/lib/automacaoNotificacoes'

const SEM_AVISOS: AutomacaoNotificacao[] = []

/**
 * Avisos da automação não lidos da clínica (confirmou, pediu para remarcar...), com Realtime.
 *
 * - Sem a migration 20261139 (tabela ausente: 42P01 / PGRST205) tudo fica quieto: lista vazia, sem erro, sem
 *   assinatura de Realtime e sem repetir a consulta. Qualquer outro erro também não aparece na tela.
 * - `onNova` roda só para aviso que chega em tempo real, nunca para os que já existiam ao abrir a página.
 * - Passe `clinicId` só para quem tem o módulo Agenda: sem ele a consulta nem é feita (e a RLS também barra).
 */
export function useAutomacaoNotificacoes(clinicId: string | undefined, onNova?: (n: AutomacaoNotificacao) => void) {
  const qc = useQueryClient()
  const queryKey = ['automacao-notificacoes', clinicId] as const
  const onNovaRef = useRef(onNova)
  useEffect(() => { onNovaRef.current = onNova }, [onNova])
  // ids que esta aba já conhece, por clínica: o que veio no carregamento nunca vira aviso na tela
  const vistasRef = useRef(new Map<string, Set<string>>())
  const vistasDe = useCallback((id: string) => {
    let set = vistasRef.current.get(id)
    if (!set) { set = new Set(); vistasRef.current.set(id, set) }
    return set
  }, [])

  const query = useQuery({
    queryKey,
    enabled: !!clinicId,
    staleTime: 30_000,
    queryFn: async (): Promise<NotificacoesEstado> => {
      if (!clinicId) return NOTIFICACOES_VAZIAS
      const estado = await carregarNaoLidas(() => supabase
        .from('automacao_notificacoes')
        .select(NOTIFICACOES_COLUNAS)
        .eq('clinic_id', clinicId)
        .is('lida_em', null)
        .order('criada_em', { ascending: false })
        .limit(NOTIFICACOES_LIMITE))
      const vistas = vistasDe(clinicId)
      for (const n of estado.items) vistas.add(n.id)
      return estado
    },
    // com a tabela presente, a consulta se refaz de vez em quando (rede de segurança se o Realtime cair); sem ela, não repete
    refetchInterval: q => (q.state.data?.available ? 60_000 : false),
    retry: 1,
  })

  const available = !!query.data?.available
  const items = query.data?.items ?? SEM_AVISOS

  useEffect(() => {
    if (!clinicId || !available) return
    const key = ['automacao-notificacoes', clinicId]
    const vistas = vistasDe(clinicId)
    const onEvento = (tipo: 'INSERT' | 'UPDATE') => (payload: { new: unknown }) => {
      const atual = qc.getQueryData<NotificacoesEstado>(key)
      if (!atual?.available) { qc.invalidateQueries({ queryKey: key }); return }
      const r = aplicarEvento(atual.items, vistas, { tipo, novo: payload.new }, clinicId)
      qc.setQueryData<NotificacoesEstado>(key, { available: true, items: r.items })
      if (r.nova) onNovaRef.current?.(r.nova)
    }
    const channel = supabase
      .channel(`automacao-notificacoes-${clinicId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'automacao_notificacoes', filter: `clinic_id=eq.${clinicId}` }, onEvento('INSERT'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'automacao_notificacoes', filter: `clinic_id=eq.${clinicId}` }, onEvento('UPDATE'))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [clinicId, available, qc, vistasDe])

  /** Marca um aviso como lido: some da lista na hora; se o banco recusar, a lista volta ao que o banco tem. */
  const marcarLida = useCallback(async (id: string) => {
    if (!clinicId) return
    qc.setQueryData<NotificacoesEstado>(['automacao-notificacoes', clinicId], prev => prev && { ...prev, items: prev.items.filter(n => n.id !== id) })
    const { error } = await supabase
      .from('automacao_notificacoes')
      .update({ lida_em: new Date().toISOString() })
      .eq('id', id)
      .eq('clinic_id', clinicId)
    if (error) qc.invalidateQueries({ queryKey: ['automacao-notificacoes', clinicId] })
  }, [clinicId, qc])

  const marcarTodasLidas = useCallback(async () => {
    if (!clinicId) return
    qc.setQueryData<NotificacoesEstado>(['automacao-notificacoes', clinicId], prev => prev && { ...prev, items: [] })
    const { error } = await supabase
      .from('automacao_notificacoes')
      .update({ lida_em: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .is('lida_em', null)
    if (error) qc.invalidateQueries({ queryKey: ['automacao-notificacoes', clinicId] })
  }, [clinicId, qc])

  return { items, available, marcarLida, marcarTodasLidas }
}
