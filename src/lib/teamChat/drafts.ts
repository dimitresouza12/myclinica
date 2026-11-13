// Rascunhos do campo de escrever, por conversa. Só em memória (um Map de módulo): nada em localStorage, porque a
// recepção costuma dividir o computador e um rascunho com nome de paciente não pode sobreviver a quem sai.
// O escopo da chave é login + clínica + canal; tudo é apagado ao sair (SIGNED_OUT) e quando o login ou a clínica troca.
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/store/auth'

export interface TeamDraft {
  text: string
  /** pacientes escolhidos para citar (só id e nome) */
  cited: { id: string; name: string }[]
}

const drafts = new Map<string, TeamDraft>()

export function draftKey(userId: string | undefined, clinicId: string, channelId: string): string {
  return `${userId ?? 'sem-login'}:${clinicId}:${channelId}`
}

export const teamDrafts = {
  get: (key: string): TeamDraft | undefined => drafts.get(key),
  /** guarda o rascunho; vazio (sem texto e sem paciente) apaga */
  set(key: string, draft: TeamDraft) {
    if (!draft.text.trim() && draft.cited.length === 0) drafts.delete(key)
    else drafts.set(key, draft)
  },
  delete: (key: string) => { drafts.delete(key) },
  clear: () => drafts.clear(),
}

if (typeof window !== 'undefined') {
  // troca de login ou de clínica (inclui sair: o usuário vira null)
  useAuthStore.subscribe((s, prev) => {
    if (s.user?.id !== prev.user?.id || s.clinic?.id !== prev.clinic?.id) drafts.clear()
  })
  supabase.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') drafts.clear()
  })
}
