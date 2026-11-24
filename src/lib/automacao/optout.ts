// Contatos que pediram para parar de receber mensagens automáticas (tabela whatsapp_optout).
// Só no servidor (service role): a tabela não tem política de RLS para o navegador.
//
// O mesmo contato pode chegar pelo telefone (chave DDD+8) ou só pelo identificador interno do WhatsApp
// ("lid:<id>"). A conversa (whatsapp_conversations) guarda os dois, então o opt-out é gravado e conferido
// pelos dois: quem escreveu PARAR por um deles fica bloqueado pelo outro.
//
// Leitura FALHA FECHADA: se não der para saber se o contato pediu para parar, o erro sobe e quem
// chama não envia. Nunca devolve "não" por engano.

import { getAdminClient } from '@/lib/supabaseAdmin'

export class OptoutReadError extends Error {
  constructor(message: string, public code: string | null) { super(message) }
}

/** Tabela ainda não criada (migração 20261139 não aplicada): Postgres 42P01 / PostgREST PGRST205. */
export const isMissingRelation = (code: string | null | undefined) => code === '42P01' || code === 'PGRST205'

const lidOf = (key: string) => (key.startsWith('lid:') ? key.slice(4) : null)

function fail(error: { code?: string } | null, what: string): never {
  throw new OptoutReadError(`whatsapp_optout: ${what} (${error?.code ?? 'erro'})`, error?.code ?? null)
}

interface ConvKeys { phone_key: string; lid: string | null }

/** Conversas da clínica que ligam telefone e lid das chaves informadas. */
async function conversationsFor(clinicId: string, keys: string[]): Promise<ConvKeys[]> {
  const admin = getAdminClient()
  const phones = keys.filter(k => !lidOf(k))
  const lids = keys.map(lidOf).filter((l): l is string => !!l)
  const out: ConvKeys[] = []
  if (phones.length > 0) {
    const { data, error } = await admin.from('whatsapp_conversations').select('phone_key, lid').eq('clinic_id', clinicId).in('phone_key', phones)
    if (error) fail(error, 'leitura das conversas')
    out.push(...((data ?? []) as ConvKeys[]))
  }
  if (lids.length > 0) {
    const { data, error } = await admin.from('whatsapp_conversations').select('phone_key, lid').eq('clinic_id', clinicId).in('lid', lids)
    if (error) fail(error, 'leitura das conversas')
    out.push(...((data ?? []) as ConvKeys[]))
  }
  return out
}

/** Todas as chaves equivalentes (telefone e lid da conversa) das informadas, incluindo elas mesmas. */
async function expandKeys(clinicId: string, keys: string[]): Promise<string[]> {
  const set = new Set(keys.filter(Boolean))
  for (const c of await conversationsFor(clinicId, [...set])) {
    if (c.phone_key) set.add(c.phone_key)
    if (c.lid) set.add(`lid:${c.lid}`)
  }
  return [...set]
}

/**
 * Das chaves informadas, quais estão em opt-out (direto ou pela chave equivalente da conversa).
 * Uma leitura de conversas e uma de opt-out para a lista inteira.
 */
export async function optedOutKeySet(clinicId: string, inputKeys: string[]): Promise<Set<string>> {
  const keys = [...new Set(inputKeys.filter(Boolean))]
  if (keys.length === 0) return new Set()

  const convs = await conversationsFor(clinicId, keys)
  // chaves equivalentes de cada chave de entrada
  const equiv = new Map<string, Set<string>>(keys.map(k => [k, new Set([k])]))
  for (const c of convs) {
    const group = [c.phone_key, ...(c.lid ? [`lid:${c.lid}`] : [])]
    for (const [k, eq] of equiv) if (group.includes(k)) group.forEach(g => eq.add(g))
  }
  const candidates = [...new Set([...equiv.values()].flatMap(s => [...s]))]

  const { data, error } = await getAdminClient()
    .from('whatsapp_optout').select('phone_key').eq('clinic_id', clinicId).in('phone_key', candidates)
  if (error) fail(error, 'leitura')
  const stored = new Set(((data ?? []) as { phone_key: string }[]).map(r => r.phone_key))
  return new Set(keys.filter(k => [...equiv.get(k)!].some(e => stored.has(e))))
}

export async function isOptedOut(clinicId: string, phoneKeys: string[]): Promise<boolean> {
  return (await optedOutKeySet(clinicId, phoneKeys)).size > 0
}

/**
 * Marca o contato pelas duas chaves (telefone e lid) quando a conversa conhece as duas.
 * Devolve true se o contato ainda NÃO estava marcado (false: já estava, nada a responder de novo).
 */
export async function registerOptOut(clinicId: string, phoneKey: string): Promise<boolean> {
  const all = await expandKeys(clinicId, [phoneKey])
  const already = (await optedOutKeySet(clinicId, [phoneKey])).size > 0
  const { error } = await getAdminClient()
    .from('whatsapp_optout')
    .upsert(all.map(k => ({ clinic_id: clinicId, phone_key: k })), { onConflict: 'clinic_id,phone_key', ignoreDuplicates: true })
    .select('phone_key')
  if (error) fail(error, 'gravação')
  return !already
}
