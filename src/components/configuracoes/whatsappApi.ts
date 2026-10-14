import { supabase } from '@/lib/supabase'

/** Chamada às rotas /api/whatsapp com o token da sessão. Erro vem em português, pronto para a tela. */
export async function whatsappApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  // arquivo (FormData): o navegador define o Content-Type com o separador do formulário
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: init?.body === undefined ? undefined : isForm ? (init!.body as FormData) : JSON.stringify(init.body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((json as { error?: string }).error ?? 'Não foi possível concluir. Tente de novo.')
  return json as T
}
